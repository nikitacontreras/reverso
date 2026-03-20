import path from 'path';
import fs from 'fs';
import os from 'os';
import net from 'net';
import crypto from 'crypto';
import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, dialog } from 'electron';
import { exec } from 'child_process';
import isDev from 'electron-is-dev';
import { fileURLToPath } from 'url';
import { Client } from 'ssh2';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const configPath = path.join(app.getPath('userData'), 'config.json');

let mainWindow;
let tray = null;
const activeConnections = new Map(); // id -> { client, tunnels: Map, shellStream, distro, sshPort }
const tunnelTraffic = new Map(); // tunnelId -> { up, down, lastUpdate }
const cloudflaredTunnels = new Map(); // localPort -> { process, url, status }

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
    return { connections: [], groups: [], settings: { runAtStartup: false, maxRetries: 3 } };
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

// Encryption Utilities for Export/Import
const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

function encrypt(text, password) {
    const salt = crypto.randomBytes(16);
    const key = crypto.scryptSync(password, salt, 32);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return salt.toString('hex') + ':' + iv.toString('hex') + ':' + encrypted;
}

function decrypt(text, password) {
    const [saltHex, ivHex, encrypted] = text.split(':');
    const salt = Buffer.from(saltHex, 'hex');
    const iv = Buffer.from(ivHex, 'hex');
    const key = crypto.scryptSync(password, salt, 32);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

ipcMain.handle('config:export', async (event, { connectionIds, password }) => {
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Export Reverso Configuration',
        defaultPath: path.join(os.homedir(), 'reverso-export.json'),
        filters: [{ name: 'JSON', extensions: ['json'] }]
    });

    if (!filePath) return { success: false, error: 'Cancelled' };

    try {
        const configData = fs.readFileSync(configPath, 'utf8');
        const fullConfig = JSON.parse(configData);

        // Filter connections
        const selectedConns = fullConfig.connections.filter(c => connectionIds.includes(c.id));

        // Filter groups to only include referenced connections
        const selectedGroups = (fullConfig.groups || []).map(g => ({
            ...g,
            connectionIds: g.connectionIds.filter(id => connectionIds.includes(id))
        })).filter(g => g.connectionIds.length > 0);

        // Encrypt passwords in selected connections
        const exportedConns = selectedConns.map(c => {
            const encryptedPassword = c.password ? encrypt(c.password, password) : '';
            return { ...c, password: encryptedPassword, isEncrypted: !!c.password };
        });

        const exportPayload = {
            version: '1.0',
            exportedAt: new Date().toISOString(),
            connections: exportedConns,
            groups: selectedGroups
        };

        fs.writeFileSync(filePath, JSON.stringify(exportPayload, null, 2));
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('config:import-pick-file', async () => {
    const { filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: 'Import Reverso Configuration',
        filters: [{ name: 'JSON', extensions: ['json'] }],
        properties: ['openFile']
    });
    if (!filePaths || filePaths.length === 0) return null;
    try {
        const data = fs.readFileSync(filePaths[0], 'utf8');
        return JSON.parse(data);
    } catch (err) {
        throw new Error('Invalid export file');
    }
});

ipcMain.handle('config:import-execute', async (event, { data, password, connectionIds }) => {
    try {
        const connsToImport = data.connections.filter(c => connectionIds.includes(c.id));

        const decryptedConns = connsToImport.map(c => {
            let decryptedPass = c.password;
            if (c.isEncrypted && c.password) {
                try {
                    decryptedPass = decrypt(c.password, password);
                } catch (e) {
                    throw new Error(`Failed to decrypt password for ${c.name}. Incorrect password?`);
                }
            }
            const { isEncrypted, ...rest } = c;
            return { ...rest, password: decryptedPass };
        });

        return { success: true, decryptedConnections: decryptedConns, groups: data.groups };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

function createTray() {
    if (tray) return;

    // Use a simple circle as a placeholder icon if no icon.png exists
    const icon = nativeImage.createEmpty();
    tray = new Tray(icon);

    updateTrayMenu();

    tray.on('click', () => {
        if (mainWindow) {
            mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
        }
    });
}

function updateTrayMenu() {
    if (!tray) return;

    const connectedCount = activeConnections.size;
    const tunnelCount = Array.from(activeConnections.values()).reduce((acc, c) => acc + (c.tunnels?.size || 0), 0);

    const template = [
        { label: `Reverso - ${connectedCount} Active`, enabled: false },
        { label: `${tunnelCount} Tunnels Running`, enabled: false },
        { type: 'separator' },
        { label: 'Show Window', click: () => { mainWindow.show(); } },
        { label: 'Hide to Tray', click: () => { mainWindow.hide(); } },
        { type: 'separator' },
        { label: 'Quit Reverso', click: () => { app.quit(); } }
    ];

    const contextMenu = Menu.buildFromTemplate(template);
    tray.setContextMenu(contextMenu);
    tray.setToolTip(`Reverso (${connectedCount} connected)`);
}

async function cleanupAllConnections() {
    console.log('Cleaning up all active connections and tunnels...');

    // Stop Cloudflare tunnels
    for (const [port, tunnel] of cloudflaredTunnels.entries()) {
        try {
            tunnel.process.kill('SIGKILL');
        } catch (e) { }
    }
    cloudflaredTunnels.clear();

    // Stop SSH connections and tunnels
    for (const [id, conn] of activeConnections.entries()) {
        try {
            if (conn.tunnels) {
                for (const item of conn.tunnels.values()) {
                    if (item.activeSockets) {
                        for (const sock of item.activeSockets) sock.destroy();
                    }
                    item.server.close();
                }
            }
            if (conn.shells) {
                for (const shell of conn.shells.values()) {
                    shell.destroy();
                }
            }
            conn.client.removeAllListeners('close');
            conn.client.removeAllListeners('error');
            conn.client.destroy(); // Force-close the socket
        } catch (e) { }
    }
    activeConnections.clear();
    if (tray) updateTrayMenu();
}

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

    // Handle reloads and navigation
    mainWindow.webContents.on('did-start-loading', () => {
        cleanupAllConnections();
    });

    mainWindow.webContents.on('will-navigate', () => {
        cleanupAllConnections();
    });

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        createTray();
    });

    mainWindow.on('close', (event) => {
        if (process.platform === 'darwin' && !app.isQuitting) {
            event.preventDefault();
            mainWindow.hide();
        }
    });
}

app.whenReady().then(createWindow);
app.on('before-quit', async (e) => {
    app.isQuitting = true;
    await cleanupAllConnections();
});

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
                        activeConnections.set(config.id, {
                            client: conn,
                            tunnels: new Map(),
                            distro,
                            sshPort: parseInt(config.port) || 22,
                            config
                        });
                        updateTrayMenu();
                        resolve({ success: true, distro });
                    });
                } else {
                    activeConnections.set(config.id, {
                        client: conn,
                        tunnels: new Map(),
                        distro,
                        sshPort: parseInt(config.port) || 22,
                        config
                    });
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
            updateTrayMenu();
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
        updateTrayMenu();
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
    const tunnelId = `${targetHost}:${rPort}:${lPort}`;

    return new Promise((resolve) => {
        const server = net.createServer((sock) => {
            if (!connection.client) {
                sock.end();
                return;
            }

            activeSockets.add(sock);

            connection.client.forwardOut('127.0.0.1', 0, targetHost, rPort, (err, stream) => {
                if (err) {
                    if (mainWindow) {
                        mainWindow.webContents.send('network:event', {
                            type: 'error',
                            message: `[Tunnel Error] ${targetHost}:${rPort}: ${err.message}`,
                            tunnelId: tunnelId,
                            time: new Date().toLocaleTimeString()
                        });
                    }
                    sock.end();
                    return;
                }

                if (mainWindow) {
                    mainWindow.webContents.send('network:event', {
                        type: 'info',
                        message: `[Connected] ${targetHost}:${rPort}`,
                        tunnelId: tunnelId,
                        time: new Date().toLocaleTimeString()
                    });
                }

                // DATA FLOW: This must be as direct as possible
                sock.pipe(stream);
                stream.pipe(sock);

                stream.on('data', (chunk) => {
                    const stats = tunnelTraffic.get(tunnelId);
                    if (stats) stats.down += chunk.length;
                });

                sock.on('data', (chunk) => {
                    const stats = tunnelTraffic.get(tunnelId);
                    if (stats) stats.up += chunk.length;
                });

                stream.on('close', () => {
                    activeSockets.delete(sock);
                    sock.end();
                });

                sock.on('close', () => {
                    activeSockets.delete(sock);
                    stream.end();
                });

                stream.on('error', () => {
                    sock.destroy();
                });

                sock.on('error', () => {
                    stream.destroy();
                });
            });
        });

        server.on('error', (err) => {
            resolve({ success: false, error: err.message });
        });

        server.listen(lPort, '127.0.0.1', () => {
            tunnelTraffic.set(tunnelId, { up: 0, down: 0, lastUpdate: Date.now() });
            connection.tunnels.set(tunnelId, { server, activeSockets, remoteHost: targetHost, remotePort: rPort, localPort: lPort });
            updateTrayMenu();
            resolve({ success: true, tunnelId });
        });
    });
});

ipcMain.handle('tunnels:get-stats', async () => {
    const stats = {};
    tunnelTraffic.forEach((value, key) => {
        stats[key] = { ...value };
        // Reset counters for delta calculation if needed, or keep cumulative
    });
    return stats;
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
        updateTrayMenu();
        return { success: true };
    }
    return { success: false };
});

// Magic Mapping: Compatible Service Detection & Identification
ipcMain.handle('ssh:detect-services', async (event, connectionId) => {
    const conn = activeConnections.get(connectionId);
    if (!conn) return { success: false, error: 'Not connected' };

    const commonPorts = {
        80: 'HTTP', 443: 'HTTPS', 3000: 'React/Node', 3306: 'MySQL', 5432: 'PostgreSQL',
        6379: 'Redis', 8080: 'Dev/Java', 8000: 'API/PHP', 9000: 'PHP-FPM', 27017: 'MongoDB',
        1433: 'MSSQL', 9200: 'ES', 5000: 'Flask/Docker'
    };

    return new Promise((resolve) => {
        // Step 1: Get ports and inodes from /proc/net/tcp
        // We look for listening sockets (state 0A)
        const cmd = 'cat /proc/net/tcp /proc/net/tcp6 2>/dev/null';
        conn.client.exec(cmd, (err, stream) => {
            if (err) return resolve({ success: false, error: err.message });

            let data = '';
            stream.on('data', (chunk) => { data += chunk; });
            stream.on('close', async () => {
                const foundItems = []; // { port, inode }
                const lines = data.split('\n');

                lines.forEach(line => {
                    // Match local_address and inode. Format: sl local_address rem_address state ... inode
                    // Example: " 0: 00000000:0050 00000000:0000 0A ... 12345"
                    const match = line.match(/^\s*\d+:\s+[0-9A-F]+:([0-9A-F]+)\s+[0-9A-F]+:[0-9A-F]+\s+0A\s+.*?\s+(\d+)\s*$/);
                    if (match) {
                        const port = parseInt(match[1], 16);
                        const inode = match[2];
                        // Filter out the current SSH port to avoid self-mapping loops
                        if (port > 0 && port < 65535 && port !== conn.sshPort) {
                            foundItems.push({ port, inode });
                        }
                    }
                });

                if (foundItems.length === 0) return resolve({ success: true, services: [] });

                // Step 2: For each inode, find the process name using /proc/[pid]/fd
                // Use a single command to find all pids/names for these inodes to be efficient
                // This command finds the link to the socket and then gets the cmdline of that PID
                const inodeList = foundItems.map(i => i.inode).join('|');
                const findCmd = `for i in /proc/[0-9]*/fd/*; do 
                    link=$(readlink "$i" 2>/dev/null);
                    if [[ "$link" =~ socket:\\[(${inodeList})\\] ]]; then
                        pid=$(echo "$i" | cut -d/ -f3);
                        name=$(cat /proc/$pid/comm 2>/dev/null || cat /proc/$pid/cmdline 2>/dev/null | tr '\\0' ' ' | cut -d' ' -f1 | xargs basename 2>/dev/null);
                        inode_id=$(echo "$link" | sed 's/socket:\\[\\(.*\\)\\]/\\1/');
                        echo "$inode_id:$name";
                    fi
                done 2>/dev/null`;

                conn.client.exec(findCmd, (err2, stream2) => {
                    let nameData = '';
                    if (!err2) {
                        stream2.on('data', (chunk) => { nameData += chunk; });
                    }

                    stream2.on('close', () => {
                        const inodeToName = {};
                        nameData.split('\n').filter(Boolean).forEach(line => {
                            const [ino, name] = line.split(':');
                            if (ino && name) inodeToName[ino] = name;
                        });

                        const services = foundItems.map(item => {
                            const procName = inodeToName[item.inode]?.toLowerCase() || '';
                            let displayName = 'Unknown';

                            // 1. Identify by Process Name (highest priority, works on any port)
                            if (procName.includes('postgres')) displayName = 'PostgreSQL';
                            else if (procName.includes('mysql') || procName.includes('mysqld')) displayName = 'MySQL';
                            else if (procName.includes('redis')) displayName = 'Redis';
                            else if (procName.includes('nginx')) displayName = 'Nginx';
                            else if (procName.includes('apache') || procName.includes('httpd')) displayName = 'Apache';
                            else if (procName.includes('mongod')) displayName = 'MongoDB';
                            else if (procName.includes('docker')) displayName = 'Docker';
                            else if (procName.includes('python')) displayName = 'Python App';
                            else if (procName.includes('node')) displayName = 'Node.js App';
                            else if (procName.includes('java')) displayName = 'Java App';
                            else if (procName.includes('php')) displayName = 'PHP App';
                            else if (procName.includes('docker')) displayName = 'Docker';
                            else if (procName) displayName = procName.charAt(0).toUpperCase() + procName.slice(1);

                            // 2. Fallback to Common Ports if process name is missing
                            if (displayName === 'Unknown' && commonPorts[item.port]) {
                                displayName = commonPorts[item.port];
                            }

                            return { port: item.port, name: displayName };
                        });

                        // Sort by port
                        services.sort((a, b) => a.port - b.port);
                        resolve({ success: true, services });
                    });
                });
            });
        });
    });
});

// Terminal / Shell
ipcMain.on('ssh:shell-start', (event, { connectionId, shellId, rows = 24, cols = 80 }) => {
    const conn = activeConnections.get(connectionId);
    if (!conn) return;

    if (!conn.shells) conn.shells = new Map();

    // If shell already exists, don't restart it
    if (conn.shells.has(shellId)) return;

    const windowInfo = { rows, cols, term: 'xterm-256color' };

    conn.client.shell(windowInfo, (err, stream) => {
        if (err) {
            console.error(`[Shell Error] Could not start shell ${shellId}:`, err.message);
            return;
        }

        conn.shells.set(shellId, stream);

        // Inject custom prompt and aliases silently
        try {
            const cfg = conn.config || {};
            const safeName = (cfg.name || cfg.host || '').replace(/['"\\]/g, '');
            const ps1 = `\\[\\e[1;36m\\][${safeName}]\\[\\e[0m\\] \\[\\e[34m\\]\\u@\\h\\[\\e[0m\\]:\\w $ `;

            // Read aliases from config.json
            let aliasesStr = `alias logs='tail -f /var/log/syslog'; alias docker-clean='docker system prune -a';`;
            if (fs.existsSync(configPath)) {
                const confData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                if (confData.settings && Array.isArray(confData.settings.aliases)) {
                    aliasesStr = confData.settings.aliases.map(a => `alias ${a.name}='${a.command.replace(/'/g, "'\\''")}'`).join('; ') + ';';
                }
            }

            // Run injection after a short delay!
            // This 400ms delay is CRUCIAL. It guarantees xterm.js finishes its 'fit()' 
            // and the SSH session processes the SIGWINCH (window resize) event.
            // If executed during resize, Bash's readline line-wrapping breaks and duplicates lines.
            // Wrapping in stty -echo ensures the injected command isn't visually printed before executing.
            setTimeout(() => {
                const motd = `echo -e '\\e[1;32mConnected successfully.\\e[0m'; echo "System Uptime: $(uptime -p 2>/dev/null || echo 'Unknown') | Ram Free: $(free -m 2>/dev/null | awk '/Mem:/ {print $4}' || echo 'N/A') MB"`;
                const injectScript = ` stty -echo; export PS1="${ps1}"; ${aliasesStr} clear; ${motd}; stty echo;\n`;

                if (conn.shells.has(shellId) && !stream.destroyed) {
                    stream.write(injectScript);
                }
            }, 400);

        } catch (err) {
            console.error('[Shell Injection Error]:', err);
        }

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

ipcMain.handle('sftp:download', async (event, { connectionId, remotePath, filename }) => {
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
        defaultPath: filename,
        buttonLabel: 'Download',
        title: `Download ${filename}`
    });

    if (!filePath) return { success: false, cancelled: true, error: 'Download cancelled' };

    const conn = activeConnections.get(connectionId);
    if (!conn || !conn.client) return { success: false, error: 'Not connected to server' };

    return new Promise((resolve) => {
        conn.client.sftp((err, sftp) => {
            if (err) return resolve({ success: false, error: err.message });

            sftp.fastGet(remotePath, filePath, {
                step: (transferred, chunk, total) => {
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('sftp:download-progress', {
                            connectionId, remotePath, transferred, total
                        });
                    }
                }
            }, (err) => {
                sftp.end(); // close session
                if (err) return resolve({ success: false, error: err.message });
                resolve({ success: true, localPath: filePath });
            });
        });
    });
});

ipcMain.handle('tunnels:get-all', async () => {
    const all = [];
    for (const [id, conn] of activeConnections.entries()) {
        if (!conn.tunnels) continue;
        for (const [tunnelId, tunnel] of conn.tunnels.entries()) {
            all.push({
                connectionId: id,
                tunnelId: tunnelId,
                remoteHost: tunnel.remoteHost,
                remotePort: tunnel.remotePort,
                localPort: tunnel.localPort,
                active: true
            });
        }
    }
    return all;
});

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

// Cloudflared Integration
ipcMain.handle('cloudflare:check', async () => {
    return new Promise((resolve) => {
        exec('cloudflared --version', (err, stdout) => {
            if (err) resolve({ success: false });
            else resolve({ success: true, version: stdout.trim() });
        });
    });
});

ipcMain.handle('cloudflare:start', async (event, localPort) => {
    if (cloudflaredTunnels.has(localPort)) {
        return { success: true, url: cloudflaredTunnels.get(localPort).url };
    }

    return new Promise((resolve) => {
        const port = parseInt(localPort);
        const child = exec(`cloudflared tunnel --url http://127.0.0.1:${port}`);

        let url = '';
        let status = 'starting';

        child.stderr.on('data', (data) => {
            const line = data.toString();
            // Look for the trycloudflare URL
            const match = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
            if (match && !url) {
                url = match[0];
                status = 'connected';
                cloudflaredTunnels.set(localPort, { process: child, url, status });
                resolve({ success: true, url });

                if (mainWindow) {
                    mainWindow.webContents.send('cloudflare:status', { localPort, url, status: 'connected' });
                }
            }
        });

        child.on('close', () => {
            cloudflaredTunnels.delete(localPort);
            if (mainWindow) {
                mainWindow.webContents.send('cloudflare:status', { localPort, status: 'disconnected' });
            }
        });

        child.on('error', (err) => {
            if (status === 'starting') {
                resolve({ success: false, error: err.message });
            }
        });

        // Timeout if it takes too long to get a URL
        setTimeout(() => {
            if (status === 'starting') {
                child.kill();
                resolve({ success: false, error: 'Timeout waiting for Cloudflare URL' });
            }
        }, 30000);
    });
});

ipcMain.handle('cloudflare:stop', async (event, localPort) => {
    const tunnel = cloudflaredTunnels.get(localPort);
    if (tunnel) {
        tunnel.process.kill();
        cloudflaredTunnels.delete(localPort);
        return { success: true };
    }
    return { success: false };
});

ipcMain.handle('cloudflare:list', async () => {
    const list = [];
    cloudflaredTunnels.forEach((val, key) => {
        list.push({ localPort: key, url: val.url, status: val.status });
    });
    return list;
});

// System Utilities
ipcMain.handle('system:detect-local-ports', async () => {
    return new Promise((resolve) => {
        const cmd = process.platform === 'win32'
            ? 'netstat -ano | findstr LISTENING'
            : 'lsof -i -P -n | grep LISTEN';

        exec(cmd, (err, stdout) => {
            if (err) return resolve({ success: false, error: err.message });

            const lines = stdout.split('\n');
            const ports = new Set();
            const services = [];

            lines.forEach(line => {
                if (!line.trim()) return;

                let port, name;
                if (process.platform === 'win32') {
                    // TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       1234
                    const match = line.match(/:(\d+)\s+.*LISTENING/);
                    if (match) port = parseInt(match[1]);
                } else {
                    // node      20931 nikitastrike   23u  IPv6 0x...      0t0  TCP *:3000 (LISTEN)
                    const parts = line.split(/\s+/);
                    name = parts[0];
                    const portPart = parts[parts.length - 2]; // *:3000 or localhost:3000
                    const match = portPart.match(/:(\d+)$/);
                    if (match) port = parseInt(match[1]);
                }

                if (port && !ports.has(port)) {
                    ports.add(port);
                    services.push({ port, name: name || 'Unknown' });
                }
            });

            resolve({ success: true, services });
        });
    });
});
