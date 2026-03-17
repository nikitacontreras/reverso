import { app, BrowserWindow, ipcMain } from 'electron';
import { exec } from 'child_process';
import path from 'path';
import isDev from 'electron-is-dev';
import { fileURLToPath } from 'url';
import { Client } from 'ssh2';
import net from 'net';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const configPath = path.join(app.getPath('userData'), 'config.json');

let mainWindow;
const activeConnections = new Map(); // id -> { client, tunnels: Map, shellStream }

// SILENCE POPUPS: Capture uncaught exceptions to prevent Electron's error dialog
process.on('uncaughtException', (error) => {
    console.error('Caught uncaughtException:', error);
    if (mainWindow) {
        mainWindow.webContents.send('ssh:error', { message: `System Error: ${error.message}` });
    }
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Helper for persistence
ipcMain.handle('config:save', async (event, config) => {
    try {
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('config:load', async () => {
    try {
        if (fs.existsSync(configPath)) {
            const data = fs.readFileSync(configPath, 'utf8');
            return JSON.parse(data);
        }
    } catch (err) {
        console.error('Failed to load config', err);
    }
    return { connections: [], settings: { runAtStartup: false, maxRetries: 3 } };
});

ipcMain.handle('settings:set-startup', async (event, shouldRun) => {
    app.setLoginItemSettings({
        openAtLogin: shouldRun,
        path: app.getPath('exe'),
    });
    return { success: true };
});

ipcMain.handle('settings:get-startup', async () => {
    return app.getLoginItemSettings().openAtLogin;
});

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1100,
        height: 750,
        titleBarStyle: 'hiddenInset',
        show: false,
        backgroundColor: '#1c1c1e',
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    const startUrl = isDev
        ? 'http://localhost:3000'
        : `file://${path.join(__dirname, '../dist/index.html')}`;

    mainWindow.loadURL(startUrl);

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    // DevTools disabled as requested by user's previous manual edit
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// SSH Core
ipcMain.handle('ssh:connect', async (event, config) => {
    if (!config || typeof config !== 'object' || !config.id) {
        return { success: false, error: 'Invalid connection configuration' };
    }

    if (activeConnections.has(config.id)) {
        const existing = activeConnections.get(config.id);
        // Remove listeners to prevent 'close' event from triggering auto-retry in frontend during cleanup
        existing.client.removeAllListeners('close');
        existing.client.removeAllListeners('error');

        if (existing.tunnels) {
            for (const item of existing.tunnels.values()) {
                if (item.activeSockets) {
                    for (const sock of item.activeSockets) sock.destroy();
                }
                item.server.close();
            }
        }
        existing.client.end();
        activeConnections.delete(config.id);
    }

    return new Promise((resolve, reject) => {
        const conn = new Client();
        conn.on('ready', () => {
            // Detect Distro
            conn.exec('cat /etc/os-release', (err, stream) => {
                let distro = 'linux';
                if (!err) {
                    let data = '';
                    stream.on('data', (chunk) => { data += chunk; });
                    stream.on('close', () => {
                        const idMatch = data.match(/^ID=(.+)$/m);
                        if (idMatch) {
                            distro = idMatch[1].replace(/['"]/g, '').toLowerCase();
                        }
                        activeConnections.set(config.id, { client: conn, tunnels: new Map(), distro });
                        resolve({ success: true, distro });
                    });
                } else {
                    activeConnections.set(config.id, { client: conn, tunnels: new Map(), distro });
                    resolve({ success: true, distro });
                }
            });
        }).on('error', (err) => {
            resolve({ success: false, error: err.message });
        }).on('close', () => {
            const existing = activeConnections.get(config.id);
            if (existing && existing.tunnels) {
                for (const item of existing.tunnels.values()) {
                    if (item.activeSockets) {
                        for (const sock of item.activeSockets) sock.destroy();
                    }
                    item.server.close();
                }
            }
            activeConnections.delete(config.id);
            if (mainWindow) {
                mainWindow.webContents.send('ssh:error', { id: config.id, message: 'Connection closed' });
            }
        }).connect({
            host: config.host,
            port: parseInt(config.port) || 22,
            username: config.username,
            password: config.password,
            readyTimeout: 15000,
            keepaliveInterval: 10000
        });
    });
});

ipcMain.handle('ssh:disconnect', async (event, connectionId) => {
    const connection = activeConnections.get(connectionId);
    if (connection) {
        // Remove listeners to avoid triggering unexpected error/retry events
        connection.client.removeAllListeners('close');
        connection.client.removeAllListeners('error');

        if (connection.tunnels) {
            for (const item of connection.tunnels.values()) {
                if (item.activeSockets) {
                    for (const sock of item.activeSockets) sock.destroy();
                }
                item.server.close();
            }
        }
        if (connection.shellStream) {
            connection.shellStream.end();
        }
        connection.client.end();
        activeConnections.delete(connectionId);
        return { success: true };
    }
    return { success: false };
});

ipcMain.handle('tunnel:create', async (event, { connectionId, remoteHost, remotePort, localPort }) => {
    const rPort = parseInt(remotePort);
    const lPort = parseInt(localPort);
    const connection = activeConnections.get(connectionId);
    if (!connection) return { success: false, error: 'SSH connection not established' };

    const targetHost = remoteHost || '127.0.0.1';
    const activeSockets = new Set();

    return new Promise((resolve) => {
        const server = net.createServer((sock) => {
            // Safety Check: Verify SSH client is still valid
            if (!connection.client) {
                sock.end();
                return;
            }

            activeSockets.add(sock);
            sock.on('close', () => activeSockets.delete(sock));

            try {
                // Use sock.remoteAddress/Port to provide authentic source info to the SSH server
                connection.client.forwardOut('127.0.0.1', 0, targetHost, rPort, (err, stream) => {
                    if (err) {
                        console.error(`[Tunnel Error] forwardOut (Target: ${targetHost}:${rPort}):`, err.message);
                        sock.destroy();
                        return;
                    }

                    // Explicit bi-directional piping
                    sock.pipe(stream);
                    stream.pipe(sock);

                    stream.on('error', (e) => {
                        console.error(`[Tunnel Stream Error] ${targetHost}:${rPort}:`, e.message);
                        sock.destroy();
                    });

                    sock.on('error', (e) => {
                        console.error(`[Socket Error] ${targetHost}:${rPort}:`, e.message);
                        stream.destroy();
                    });

                    stream.on('close', () => sock.destroy());
                    sock.on('close', () => stream.destroy());
                });
            } catch (forwardErr) {
                console.error(`[Tunnel Exception] ${targetHost}:${rPort}:`, forwardErr.message);
                sock.destroy();
            }
        });

        server.on('error', (err) => {
            console.error(`[Server Error] Port ${lPort} failed:`, err.message);
            resolve({ success: false, error: err.message });
        });

        server.listen(lPort, '127.0.0.1', () => {
            const tunnelId = `${targetHost}:${rPort}:${lPort}`;
            // Store server and its active sockets for total cleanup
            connection.tunnels.set(tunnelId, { server, activeSockets });
            resolve({ success: true, tunnelId });
        });
    });
});

ipcMain.handle('tunnel:close', async (event, { connectionId, tunnelId }) => {
    const connection = activeConnections.get(connectionId);
    if (!connection) return { success: false };

    const entry = connection.tunnels.get(tunnelId);
    if (entry) {
        const { server, activeSockets } = entry;
        for (const sock of activeSockets) {
            sock.destroy(); // Force close active connections
        }
        server.close();
        connection.tunnels.delete(tunnelId);
        return { success: true };
    }
    return { success: false };
});

// Terminal / Shell
ipcMain.on('ssh:shell-start', (event, { connectionId, shellId }) => {
    const conn = activeConnections.get(connectionId);
    if (!conn) return;

    if (!conn.shells) conn.shells = new Map();

    // If shell already exists, don't restart it
    if (conn.shells.has(shellId)) return;

    conn.client.shell((err, stream) => {
        if (err) {
            console.error(`[Shell Error] Could not start shell ${shellId}:`, err.message);
            return;
        }

        conn.shells.set(shellId, stream);

        stream.on('data', (data) => {
            if (mainWindow) {
                mainWindow.webContents.send('ssh:shell-data', { shellId, data: data.toString() });
            }
        }).on('close', () => {
            conn.shells.delete(shellId);
            if (mainWindow) {
                mainWindow.webContents.send('ssh:shell-closed', { shellId });
            }
        });
    });
});

ipcMain.on('ssh:shell-resize', (event, { connectionId, shellId, rows, cols }) => {
    const conn = activeConnections.get(connectionId);
    if (conn && conn.shells && conn.shells.has(shellId)) {
        conn.shells.get(shellId).setWindow(rows, cols, 0, 0);
    }
});

ipcMain.on('ssh:shell-input', (event, { connectionId, shellId, data }) => {
    const conn = activeConnections.get(connectionId);
    if (conn && conn.shells && conn.shells.has(shellId)) {
        conn.shells.get(shellId).write(data);
    }
});

ipcMain.on('ssh:shell-close', (event, { connectionId, shellId }) => {
    const conn = activeConnections.get(connectionId);
    if (conn && conn.shells && conn.shells.has(shellId)) {
        conn.shells.get(shellId).end();
        conn.shells.delete(shellId);
    }
});

// SFTP
ipcMain.handle('sftp:readdir', async (event, { connectionId, path }) => {
    const conn = activeConnections.get(connectionId);
    if (!conn || !conn.client) return { success: false, error: 'Not connected' };

    return new Promise((resolve) => {
        conn.client.sftp((err, sftp) => {
            if (err) return resolve({ success: false, error: err.message });
            sftp.readdir(path, (err, list) => {
                if (err) {
                    sftp.end(); // close session
                    return resolve({ success: false, error: err.message });
                }

                // sort directories first
                list.sort((a, b) => {
                    const isDirA = a.longname.startsWith('d');
                    const isDirB = b.longname.startsWith('d');
                    if (isDirA && !isDirB) return -1;
                    if (!isDirA && isDirB) return 1;
                    return a.filename.localeCompare(b.filename);
                });

                sftp.end(); // close session to prevent leak
                resolve({ success: true, list });
            });
        });
    });
});
// SFTP ... (omitted readdir for context)
ipcMain.handle('ssh:ping', async (event, host) => {
    return new Promise((resolve) => {
        const start = Date.now();
        // Send a single ping on macOS
        exec(`ping -c 1 -t 1 ${host}`, (err) => {
            if (err) return resolve({ success: false, latency: -1 });
            resolve({ success: true, latency: Date.now() - start });
        });
    });
});

ipcMain.handle('tunnels:get-all', async () => {
    const all = [];
    for (const [connId, conn] of activeConnections.entries()) {
        for (const [tunnelId, tunnel] of conn.tunnels.entries()) {
            const [remoteHost, remotePort, localPort] = tunnelId.split(':');
            all.push({
                connectionId: connId,
                tunnelId,
                remoteHost,
                remotePort,
                localPort,
                activeSockets: tunnel.activeSockets?.size || 0
            });
        }
    }
    return all;
});
