import { useState, useEffect, useRef } from 'react';

export const useConnections = (showToast: (msg: string, type?: string) => void) => {
    const [connections, setConnections] = useState([]);
    const [groups, setGroups] = useState([]);
    const [isLoaded, setIsLoaded] = useState(false);
    const [latencies, setLatencies] = useState({});

    // Config from App.tsx
    const [maxRetries, setMaxRetries] = useState(3);
    const retryCount = useRef({});
    const connectionsRef = useRef([]);
    const manualDisconnects = useRef(new Set());

    useEffect(() => {
        connectionsRef.current = connections;
    }, [connections]);

    // Load initial config
    useEffect(() => {
        const load = async () => {
            const data = await window.electronAPI.loadConfig();
            const savedConns = Array.isArray(data) ? data : (data.connections || []);
            const savedSettings = data.settings || { runAtStartup: false, maxRetries: 3 };

            const initialConns = savedConns.map(c => ({
                ...c,
                status: 'disconnected',
                tunnels: (c.tunnels || []).map(t => ({ ...t }))
            }));

            setConnections(initialConns);
            connectionsRef.current = initialConns;
            setGroups((data.groups || []).map(g => ({ ...g, expanded: g.expanded !== undefined ? g.expanded : true })));
            setMaxRetries(savedSettings.maxRetries || 3);
            setIsLoaded(true);
        };
        load();
    }, []);

    // Save config on changes
    // This will be called from App.tsx effect to include other settings

    const handleUnexpectedDisconnect = (id, message) => {
        const conn = connectionsRef.current.find(c => c.id === id);
        setConnections(prev => prev.map(c => c.id === id ? { ...c, status: 'disconnected' } : c));

        if (manualDisconnects.current.has(id)) {
            manualDisconnects.current.delete(id);
            return;
        }

        if (!conn || conn.status !== 'connected') return;

        if (!retryCount.current[id]) retryCount.current[id] = 0;
        if (retryCount.current[id] < maxRetries) {
            retryCount.current[id]++;
            console.log(`Auto-retrying connection ${id}... (${retryCount.current[id]}/${maxRetries})`);
            handleConnect(id);
        } else {
            showToast(`Connection ${conn.name} failed after ${maxRetries} attempts.`, 'error');
            retryCount.current[id] = 0;
        }
    };

    const handleConnect = async (idOrConfig) => {
        let config;
        let id;

        if (typeof idOrConfig === 'string') {
            id = idOrConfig;
            config = connectionsRef.current.find(c => c.id === id);
            if (!config) return;
        } else {
            id = Date.now().toString();
            config = { ...idOrConfig, id, status: 'connecting', tunnels: [], distro: 'linux' };
            setConnections(prev => [...prev, config]);
        }

        setConnections(prev => prev.map(c => c.id === id ? { ...c, status: 'connecting' } : c));

        try {
            const result = await window.electronAPI.connectSSH(config);
            if (result && result.success) {
                retryCount.current[id] = 0;
                const tunnelsToStart = config.tunnels?.filter(t => t.active) || [];
                const startedTunnels = [];

                for (const t of tunnelsToStart) {
                    const tResult = await window.electronAPI.createTunnel({
                        connectionId: id,
                        remoteHost: t.remoteHost,
                        remotePort: t.remotePort,
                        localPort: t.localPort
                    });
                    if (tResult.success) {
                        startedTunnels.push({ ...t, id: tResult.tunnelId });
                    } else {
                        startedTunnels.push({ ...t, active: false });
                    }
                }

                setConnections(prev => prev.map(c => {
                    if (c.id === id) {
                        const finalTunnels = c.tunnels.map(t => {
                            const started = startedTunnels.find(st => st.localPort === t.localPort && st.remotePort === t.remotePort);
                            return started ? { ...t, id: started.id, active: started.active } : t;
                        });
                        return { ...c, status: 'connected', distro: result.distro || 'linux', tunnels: finalTunnels };
                    }
                    return c;
                }));
                return { success: true, id };
            } else {
                showToast(`Failed to connect: ${result?.error || 'Unknown error'}`, 'error');
                setConnections(prev => prev.map(c => c.id === id ? { ...c, status: 'disconnected' } : c));
                return { success: false };
            }
        } catch (err) {
            showToast(`Error: ${err.message}`, 'error');
            setConnections(prev => prev.map(c => c.id === id ? { ...c, status: 'disconnected' } : c));
            return { success: false };
        }
    };

    const handleDisconnect = async (id) => {
        manualDisconnects.current.add(id);
        retryCount.current[id] = 0;
        await window.electronAPI.disconnectSSH(id);
        setConnections(prev => prev.map(c => c.id === id ? { ...c, status: 'disconnected' } : c));
    };

    const deleteConnection = async (id) => {
        const conn = connections.find(c => c.id === id);
        if (conn && conn.status === 'connected') {
            await handleDisconnect(id);
        }
        setConnections(prev => prev.filter(c => c.id !== id));
    };

    const handleToggleTunnel = async (selectedConnection, tunnelId) => {
        const conn = connections.find(c => c.id === selectedConnection);
        const tunnel = conn.tunnels.find(t => t.id === tunnelId);

        if (conn.status === 'connected') {
            if (tunnel.active) {
                const result = await window.electronAPI.closeTunnel({ connectionId: selectedConnection, tunnelId });
                if (result.success) {
                    setConnections(prev => prev.map(c => ({
                        ...c,
                        tunnels: c.id === selectedConnection
                            ? c.tunnels.map(t => t.id === tunnelId ? { ...t, active: false } : t)
                            : c.tunnels
                    })));
                }
            } else {
                const result = await window.electronAPI.createTunnel({
                    connectionId: selectedConnection,
                    remoteHost: tunnel.remoteHost,
                    remotePort: tunnel.remotePort,
                    localPort: tunnel.localPort
                });
                if (result.success) {
                    setConnections(prev => prev.map(c => ({
                        ...c,
                        tunnels: c.id === selectedConnection
                            ? c.tunnels.map(t => t.id === tunnelId ? { ...t, active: true, id: result.tunnelId } : t)
                            : c.tunnels
                    })));
                } else {
                    return { error: result.error };
                }
            }
        } else {
            setConnections(prev => prev.map(c => ({
                ...c,
                tunnels: c.id === selectedConnection
                    ? c.tunnels.map(t => t.id === tunnelId ? { ...t, active: !t.active } : t)
                    : c.tunnels
            })));
        }
        return { success: true };
    };

    const handleCreateTunnel = (selectedConnection, tunnelForm, editingTunnelId) => {
        if (!selectedConnection) return;
        if (editingTunnelId) {
            setConnections(prev => prev.map(c => {
                if (c.id === selectedConnection) {
                    return {
                        ...c,
                        tunnels: c.tunnels.map(t => t.id === editingTunnelId ? {
                            ...t,
                            remoteHost: tunnelForm.remoteHost || '127.0.0.1',
                            remotePort: parseInt(tunnelForm.remotePort),
                            localPort: parseInt(tunnelForm.localPort)
                        } : t)
                    };
                }
                return c;
            }));
        } else {
            const tunnelData = {
                remoteHost: tunnelForm.remoteHost || '127.0.0.1',
                remotePort: parseInt(tunnelForm.remotePort),
                localPort: parseInt(tunnelForm.localPort),
                active: false,
                id: `pending-${Date.now()}`
            };
            setConnections(prev => prev.map(c => {
                if (c.id === selectedConnection) {
                    return { ...c, tunnels: [...(c.tunnels || []), tunnelData] };
                }
                return c;
            }));
        }
    };

    const deleteTunnel = async (selectedConnection, tunnelId) => {
        if (!window.confirm('Are you sure you want to delete this mapping?')) return;
        const conn = connections.find(c => c.id === selectedConnection);
        if (conn && conn.status === 'connected') {
            const tunnel = conn.tunnels?.find(t => t.id === tunnelId);
            if (tunnel && tunnel.active) {
                await window.electronAPI.closeTunnel({ connectionId: selectedConnection, tunnelId });
            }
        }
        setConnections(prev => prev.map(c => ({
            ...c,
            tunnels: c.id === selectedConnection
                ? (c.tunnels || []).filter(t => t.id !== tunnelId)
                : (c.tunnels || [])
        })));
    };

    return {
        connections,
        setConnections,
        groups,
        setGroups,
        isLoaded,
        latencies,
        setLatencies,
        maxRetries,
        setMaxRetries,
        handleConnect,
        handleDisconnect,
        deleteConnection,
        handleUnexpectedDisconnect,
        handleToggleTunnel,
        handleCreateTunnel,
        deleteTunnel
    };
};
