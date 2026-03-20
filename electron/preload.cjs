const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    connectSSH: (config) => ipcRenderer.invoke('ssh:connect', config),
    disconnectSSH: (connectionId) => ipcRenderer.invoke('ssh:disconnect', connectionId),
    createTunnel: (data) => ipcRenderer.invoke('tunnel:create', data),
    closeTunnel: (data) => ipcRenderer.invoke('tunnel:close', data),
    saveConfig: (config) => ipcRenderer.invoke('config:save', config),
    loadConfig: () => ipcRenderer.invoke('config:load'),
    setRunAtStartup: (val) => ipcRenderer.invoke('settings:set-startup', val),
    getRunAtStartup: () => ipcRenderer.invoke('settings:get-startup'),

    // SFTP
    sftpReaddir: (data) => ipcRenderer.invoke('sftp:readdir', data),
    sftpDownload: (data) => ipcRenderer.invoke('sftp:download', data),
    onSftpDownloadProgress: (callback) => {
        const listener = (event, data) => callback(data);
        ipcRenderer.on('sftp:download-progress', listener);
        return () => ipcRenderer.removeListener('sftp:download-progress', listener);
    },
    ping: (host) => ipcRenderer.invoke('ssh:ping', host),
    getActiveTunnels: () => ipcRenderer.invoke('tunnels:get-all'),
    detectServices: (connectionId) => ipcRenderer.invoke('ssh:detect-services', connectionId),
    detectLocalPorts: () => ipcRenderer.invoke('system:detect-local-ports'),

    // Terminal and Events
    startShell: (data) => ipcRenderer.send('ssh:shell-start', data),
    resizeShell: (data) => ipcRenderer.send('ssh:shell-resize', data),
    closeShell: (data) => ipcRenderer.send('ssh:shell-close', data),
    onShellData: (callback) => {
        const listener = (event, data) => callback(data);
        ipcRenderer.on('ssh:shell-data', listener);
        return () => ipcRenderer.removeListener('ssh:shell-data', listener);
    },
    onShellClosed: (callback) => {
        const listener = (event, data) => callback(data);
        ipcRenderer.on('ssh:shell-closed', listener);
        return () => ipcRenderer.removeListener('ssh:shell-closed', listener);
    },
    sendShellData: (data) => ipcRenderer.send('ssh:shell-input', data),
    onConnectionError: (callback) => {
        const listener = (event, data) => callback(data);
        ipcRenderer.on('ssh:error', listener);
        return () => ipcRenderer.removeListener('ssh:error', listener);
    },

    // Import/Export
    configExport: (data) => ipcRenderer.invoke('config:export', data),
    configImportPickFile: () => ipcRenderer.invoke('config:import-pick-file'),
    configImportExecute: (data) => ipcRenderer.invoke('config:import-execute'),
    getTunnelStats: () => ipcRenderer.invoke('tunnels:get-stats'),
    onNetworkEvent: (callback) => {
        const listener = (event, data) => callback(data);
        ipcRenderer.on('network:event', listener);
        return () => ipcRenderer.removeListener('network:event', listener);
    },

    // Cloudflare Tunnel
    checkCloudflare: () => ipcRenderer.invoke('cloudflare:check'),
    startCloudflare: (localPort) => ipcRenderer.invoke('cloudflare:start', localPort),
    stopCloudflare: (localPort) => ipcRenderer.invoke('cloudflare:stop', localPort),
    listCloudflare: () => ipcRenderer.invoke('cloudflare:list'),
    onCloudflareStatus: (callback) => {
        const listener = (event, data) => callback(data);
        ipcRenderer.on('cloudflare:status', listener);
        return () => ipcRenderer.removeListener('cloudflare:status', listener);
    },
});
