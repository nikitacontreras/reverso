import React, { useState, useEffect, useRef } from 'react';
import {
    Plus,
    Play,
    Edit2,
    X,
    Terminal as TerminalIcon,
    AlertCircle,
    Power,
    Monitor,
    Loader,
    ArrowUp,
    ArrowDown,
    Zap,
    ExternalLink,
    Server,
    Link2,
    CheckCircle2,
    Activity
} from 'lucide-react';
import TerminalView from './components/TerminalView';
import DistroIcon from './components/DistroIcon';
import EmptyState from './components/EmptyState';
import Sidebar from './components/Sidebar';
import PreferencesWindow from './components/PreferencesWindow';
import ConnectionForm from './components/ConnectionForm';
import MappingsTab from './components/MappingsTab';
import FilesTab from './components/FilesTab';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function App() {
    const [connections, setConnections] = useState([]);
    const [selectedConnection, setSelectedConnection] = useState(null);
    const [isAddingConnection, setIsAddingConnection] = useState(false);
    const [isEditingConnection, setIsEditingConnection] = useState(false);
    const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);
    const [activeTab, setActiveTab] = useState('mappings');
    const [error, setError] = useState(null);
    const [warnings, setWarnings] = useState({});
    const [runAtStartup, setRunAtStartup] = useState(false);
    const [maxRetries, setMaxRetries] = useState(3);
    const [persistTerminal, setPersistTerminal] = useState(true);
    const [aliases, setAliases] = useState([
        { id: '1', name: 'logs', command: 'tail -f /var/log/syslog' },
        { id: '2', name: 'docker-clean', command: 'docker system prune -a' }
    ]);
    const [isLoaded, setIsLoaded] = useState(false);
    const [groups, setGroups] = useState([]); // { id, name, connectionIds: [] }
    const [terminalSessions, setTerminalSessions] = useState({}); // { connId: { tabs: [], activeId: null } }
    const [toasts, setToasts] = useState([]);
    const [latencies, setLatencies] = useState({}); // { connId: ms }
    const [isDashboardOpen, setIsDashboardOpen] = useState(false);
    const [tunnelStats, setTunnelStats] = useState({}); // { tunnelId: { up, down } }
    const [history, setHistory] = useState([]); // Array of { time, up, down, latency }
    const [networkEvents, setNetworkEvents] = useState([]); // Array of { id, time, type, message, tunnelId }
    const [editingTunnelId, setEditingTunnelId] = useState(null);

    const showToast = (message, type = 'error') => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 5000);
    };

    const addTerminalTab = (connId) => {
        const shellId = `shell-${Date.now()}`;
        setTerminalSessions(prev => {
            const connSessions = prev[connId] || { tabs: [], activeId: null };
            const newTabs = [...connSessions.tabs, { id: shellId, title: `Terminal ${connSessions.tabs.length + 1}` }];
            return {
                ...prev,
                [connId]: {
                    tabs: newTabs,
                    activeId: shellId
                }
            };
        });
    };

    const removeTerminalTab = (connId, shellId) => {
        setTerminalSessions(prev => {
            const connSessions = prev[connId];
            if (!connSessions) return prev;

            const newTabs = connSessions.tabs.filter(t => t.id !== shellId);
            let nextActiveId = connSessions.activeId;

            if (shellId === connSessions.activeId) {
                nextActiveId = newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null;
            }

            window.electronAPI.closeShell({ connectionId: connId, shellId });

            return {
                ...prev,
                [connId]: {
                    tabs: newTabs,
                    activeId: nextActiveId
                }
            };
        });
    };

    const switchTerminalTab = (connId, shellId) => {
        setTerminalSessions(prev => ({
            ...prev,
            [connId]: {
                ...(prev[connId] || {}),
                activeId: shellId
            }
        }));
    };


    const retryCount = useRef({});
    const connectionsRef = useRef([]);
    const manualDisconnects = useRef(new Set());

    useEffect(() => {
        connectionsRef.current = connections;
    }, [connections]);

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
            const startup = await window.electronAPI.getRunAtStartup();
            setRunAtStartup(startup);
            setPersistTerminal(savedSettings.persistTerminal !== undefined ? savedSettings.persistTerminal : true);
            if (savedSettings.aliases && savedSettings.aliases.length > 0) {
                setAliases(savedSettings.aliases);
            }
            setIsLoaded(true);
        };
        load();

        const removeListener = window.electronAPI.onConnectionError(({ id, message }) => {
            handleUnexpectedDisconnect(id, message);
        });

        const removeNetworkListener = window.electronAPI.onNetworkEvent((event: any) => {
            setNetworkEvents(prev => [{ id: Date.now(), ...event }, ...prev].slice(0, 50));
        });

        return () => {
            if (removeListener) removeListener();
            if (removeNetworkListener) removeNetworkListener();
        };
    }, []);

    useEffect(() => {
        if (!isLoaded) return;
        connectionsRef.current = connections;
        window.electronAPI.saveConfig({
            connections,
            groups,
            settings: { runAtStartup, maxRetries, persistTerminal, aliases }
        });
    }, [connections, groups, runAtStartup, maxRetries, persistTerminal, aliases, isLoaded]);

    // Latency Polling
    useEffect(() => {
        const checkLatency = async () => {
            const connectedSet = connections.filter(c => c.status === 'connected');
            for (const conn of connectedSet) {
                const result = await window.electronAPI.ping(conn.host);
                if (result.success) {
                    setLatencies(prev => ({ ...prev, [conn.id]: result.latency }));
                }
            }
        };
        const interval = setInterval(checkLatency, 30000);
        checkLatency();
        return () => clearInterval(interval);
    }, [connections]);

    // Traffic Polling
    useEffect(() => {
        if (!isDashboardOpen) return;
        const fetchStats = async () => {
            const stats = await window.electronAPI.getTunnelStats();
            setTunnelStats(stats);

            // Collect historical data
            const totalUp = Object.values(stats).reduce((acc: number, s: any) => acc + (s.up || 0), 0);
            const totalDown = Object.values(stats).reduce((acc: number, s: any) => acc + (s.down || 0), 0);

            const lats = Object.values(latencies).filter((l: any) => l > 0) as number[];
            const avgLat = lats.length > 0 ? Math.round(lats.reduce((a, b) => a + b, 0) / lats.length) : 0;

            setHistory(prev => {
                const newData = [...prev, {
                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                    up: totalUp,
                    down: totalDown,
                    latency: avgLat
                }];
                return newData.slice(-30); // Keep last 30 readings
            });
        };
        const interval = setInterval(fetchStats, 1000);
        fetchStats();
        return () => clearInterval(interval);
    }, [isDashboardOpen, latencies]);

    const handleUnexpectedDisconnect = (id, message) => {
        const conn = connectionsRef.current.find(c => c.id === id);

        setConnections(prev => prev.map(c => {
            if (c.id === id) {
                return { ...c, status: 'disconnected' };
            }
            return c;
        }));

        if (manualDisconnects.current.has(id)) {
            manualDisconnects.current.delete(id);
            return;
        }

        if (!conn || conn.status !== 'connected') {
            return;
        }

        if (!retryCount.current[id]) retryCount.current[id] = 0;

        if (retryCount.current[id] < maxRetries) {
            retryCount.current[id]++;
            console.log(`Auto-retrying connection ${id}... (${retryCount.current[id]}/${maxRetries})`);
            handleConnect(id, connectionsRef.current);
        } else {
            setWarnings(prev => ({ ...prev, [id]: `Connection failed after ${maxRetries} attempts. ${message}` }));
            retryCount.current[id] = 0;
        }
    };

    const [form, setForm] = useState({
        name: '',
        host: '',
        port: '22',
        username: '',
        password: ''
    });

    const [tunnelForm, setTunnelForm] = useState({
        remoteHost: '127.0.0.1',
        remotePort: '',
        localPort: ''
    });

    const handleConnect = async (idOrConfig, currentConns = connections) => {
        let config;
        let id;

        if (typeof idOrConfig === 'string') {
            id = idOrConfig;
            config = currentConns.find(c => c.id === id);
            if (!config) return;
        } else {
            id = Date.now().toString();
            config = { ...idOrConfig, id, status: 'connecting', tunnels: [], distro: 'linux' };
            setConnections(prev => [...prev, config]);
            setIsAddingConnection(false);
        }

        setConnections(prev => prev.map(c => c.id === id ? { ...c, status: 'connecting' } : c));
        setWarnings(prev => {
            const newWarnings = { ...prev };
            delete newWarnings[id];
            return newWarnings;
        });

        if (config.password === 'REPLACE_PASSWORD') {
            showToast(`Please edit the connection "${config.name}" and enter the real password first.`, 'warning');
            setConnections(prev => prev.map(c => c.id === id ? { ...c, status: 'disconnected' } : c));
            return;
        }

        try {
            const result = await window.electronAPI.connectSSH(config);
            if (result && result.success) {
                retryCount.current[id] = 0;
                // ... rest of success logic unchanged (simplified for replacement)
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
                        showToast(`Tunnel error: ${tResult.error}`, 'error');
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
                setSelectedConnection(id);

                setTerminalSessions(prev => {
                    if (!prev[id] || !prev[id].tabs || prev[id].tabs.length === 0) {
                        const shellId = `shell-${Date.now()}`;
                        return {
                            ...prev,
                            [id]: { tabs: [{ id: shellId, title: 'Terminal 1' }], activeId: shellId }
                        };
                    }
                    return prev;
                });
            } else {
                const errorMsg = result?.error || 'Unknown error';
                showToast(`Failed to connect to ${config.name}: ${errorMsg}`, 'error');
                setConnections(prev => prev.map(c => c.id === id ? { ...c, status: 'disconnected' } : c));
            }
        } catch (err) {
            console.error('SSH Connect Exception:', err);
            showToast(`Connection error: ${err.message || 'System error'}`, 'error');
            setConnections(prev => prev.map(c => c.id === id ? { ...c, status: 'disconnected' } : c));
        }
    };

    const handleDisconnect = async (id) => {
        manualDisconnects.current.add(id);
        retryCount.current[id] = 0;
        await window.electronAPI.disconnectSSH(id);
        setConnections(prev => prev.map(c => {
            if (c.id === id) {
                return {
                    ...c,
                    status: 'disconnected'
                };
            }
            return c;
        }));
    };

    const handleToggleTunnel = async (tunnelId) => {
        const conn = connections.find(c => c.id === selectedConnection);
        const tunnel = conn.tunnels.find(t => t.id === tunnelId);
        const newActiveStatus = !tunnel.active;

        if (conn.status === 'connected') {
            if (tunnel.active) {
                const result = await window.electronAPI.closeTunnel({
                    connectionId: selectedConnection,
                    tunnelId
                });
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
                    setError(result.error);
                }
            }
        } else {
            setConnections(prev => prev.map(c => ({
                ...c,
                tunnels: c.id === selectedConnection
                    ? c.tunnels.map(t => t.id === tunnelId ? { ...t, active: newActiveStatus } : t)
                    : c.tunnels
            })));
        }
    };

    const handleCreateTunnel = async (e) => {
        e.preventDefault();
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
            setEditingTunnelId(null);
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
                    return {
                        ...c,
                        tunnels: [...(c.tunnels || []), tunnelData]
                    };
                }
                return c;
            }));
        }
        setTunnelForm({ remoteHost: '127.0.0.1', remotePort: '', localPort: '' });
    };

    const handleEditTunnel = (tunnelId) => {
        const conn = connections.find(c => c.id === selectedConnection);
        const tunnel = conn.tunnels.find(t => t.id === tunnelId);
        if (tunnel) {
            setTunnelForm({
                remoteHost: tunnel.remoteHost,
                remotePort: tunnel.remotePort.toString(),
                localPort: tunnel.localPort.toString()
            });
            setEditingTunnelId(tunnelId);
        }
    };

    const startEdit = () => {
        const conn = connections.find(c => c.id === selectedConnection);
        setForm({
            name: conn.name,
            host: conn.host,
            port: conn.port,
            username: conn.username,
            password: conn.password
        });
        setIsEditingConnection(true);
    };

    const saveEdit = (e) => {
        e.preventDefault();
        setConnections(prev => prev.map(c => {
            if (c.id === selectedConnection) {
                return { ...c, ...form };
            }
            return c;
        }));
        setIsEditingConnection(false);
    };

    const deleteTunnel = async (tunnelId) => {
        if (!window.confirm('Are you sure you want to delete this mapping?')) return;

        const conn = connections.find(c => c.id === selectedConnection);
        if (conn && conn.status === 'connected') {
            const tunnel = conn.tunnels?.find(t => t.id === tunnelId);
            if (tunnel && tunnel.active) {
                await window.electronAPI.closeTunnel({
                    connectionId: selectedConnection,
                    tunnelId
                });
            }
        }

        setConnections(prev => prev.map(c => ({
            ...c,
            tunnels: c.id === selectedConnection
                ? (c.tunnels || []).filter(t => t.id !== tunnelId)
                : (c.tunnels || [])
        })));
    };

    const deleteConnection = (id, e) => {
        e.stopPropagation();
        if (!window.confirm('Are you sure you want to delete this connection?')) return;
        const conn = connections.find(c => c.id === id);
        if (conn && conn.status === 'connected') {
            window.electronAPI.disconnectSSH(id);
        }
        setConnections(prev => prev.filter(c => c.id !== id));
        if (selectedConnection === id) setSelectedConnection(null);
    };

    const toggleStartup = async () => {
        const newVal = !runAtStartup;
        await window.electronAPI.setRunAtStartup(newVal);
        setRunAtStartup(newVal);
    };

    const handleReorderConnections = (newConnections) => {
        setConnections(newConnections);
    };

    const handleUpdateGroups = (newGroups) => {
        setGroups(newGroups);
    };

    const handleConnectAll = (groupId) => {
        const group = groups.find(g => g.id === groupId);
        if (!group) return;
        group.connectionIds.forEach(id => {
            const conn = connections.find(c => c.id === id);
            if (conn && conn.status === 'disconnected') {
                handleConnect(id);
            }
        });
    };

    const currentConn = connections.find(c => c.id === selectedConnection);

    return (
        <>
            <div className="titlebar">
                Reverso
                {isDashboardOpen && <span style={{ marginLeft: '12px', fontSize: '11px', opacity: 0.5 }}>• Dashboard</span>}
            </div>
            <div className="container">
                <Sidebar
                    connections={connections}
                    selectedConnection={selectedConnection}
                    isAddingConnection={isAddingConnection}
                    isPreferencesOpen={isPreferencesOpen}
                    onAddConnection={() => {
                        setForm({ name: '', host: '', port: '22', username: '', password: '' });
                        setIsAddingConnection(true);
                        setIsPreferencesOpen(false);
                        setIsEditingConnection(false);
                        setIsDashboardOpen(false);
                    }}
                    onSelectConnection={(id) => { setSelectedConnection(id); setIsPreferencesOpen(false); setIsEditingConnection(false); setIsDashboardOpen(false); }}
                    onDeleteConnection={deleteConnection}
                    onOpenPreferences={() => { setIsPreferencesOpen(true); setSelectedConnection(null); setIsDashboardOpen(false); }}
                    onOpenDashboard={() => { setIsDashboardOpen(true); setSelectedConnection(null); setIsPreferencesOpen(false); }}
                    isDashboardOpen={isDashboardOpen}
                    groups={groups}
                    onUpdateGroups={handleUpdateGroups}
                    onReorderConnections={handleReorderConnections}
                    onConnect={handleConnect}
                    onDisconnect={handleDisconnect}
                    onEdit={startEdit}
                    onConnectAll={handleConnectAll}
                />

                <main className="main-content">
                    {error && (
                        <div className="card" style={{ borderLeft: '4px solid var(--danger)', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                            <AlertCircle color="var(--danger)" size={20} />
                            <div style={{ flex: 1, fontSize: '14px' }}>{error}</div>
                            <button onClick={() => setError(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>×</button>
                        </div>
                    )}

                    {isDashboardOpen ? (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', animation: 'fadeIn 0.4s ease-out' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                                <h1 style={{ margin: 0, fontSize: '28px', fontWeight: '700' }}>Network Ecosystem</h1>
                                {/* <div style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--success)', animation: 'pulse 2s infinite' }} />
                                    Real-time Monitoring
                                </div> */}
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px', marginBottom: '32px' }}>
                                <div className="card" style={{ height: '220px', padding: '20px', display: 'flex', flexDirection: 'column' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: '700' }}>
                                            <Zap size={16} color="var(--accent)" /> TRAFFIC FLOW (BYTES)
                                        </div>
                                        <div style={{ fontSize: '10px', opacity: 0.5 }}>REAL-TIME (1s)</div>
                                    </div>
                                    <div style={{ flex: 1, minHeight: 0 }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={history}>
                                                <defs>
                                                    <linearGradient id="colorUp" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#0a84ff" stopOpacity={0.3} />
                                                        <stop offset="95%" stopColor="#0a84ff" stopOpacity={0} />
                                                    </linearGradient>
                                                    <linearGradient id="colorDown" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#32d74b" stopOpacity={0.3} />
                                                        <stop offset="95%" stopColor="#32d74b" stopOpacity={0} />
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                                                <XAxis dataKey="time" hide />
                                                <Tooltip
                                                    contentStyle={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '11px' }}
                                                    itemStyle={{ fontSize: '11px', padding: '0px' }}
                                                />
                                                <Area type="monotone" dataKey="up" stroke="#0a84ff" fillOpacity={1} fill="url(#colorUp)" strokeWidth={2} isAnimationActive={false} />
                                                <Area type="monotone" dataKey="down" stroke="#32d74b" fillOpacity={1} fill="url(#colorDown)" strokeWidth={2} isAnimationActive={false} />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>

                                <div className="card" style={{ height: '220px', padding: '20px', display: 'flex', flexDirection: 'column' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: '700' }}>
                                            <Activity size={16} color="#ff9f0a" /> AVG. NETWORK LATENCY (ms)
                                        </div>
                                        <div style={{ fontSize: '20px', fontWeight: '800', color: '#ff9f0a' }}>
                                            {history.length > 0 ? history[history.length - 1].latency : 0} ms
                                        </div>
                                    </div>
                                    <div style={{ flex: 1, minHeight: 0 }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={history}>
                                                <defs>
                                                    <linearGradient id="colorLat" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#ff9f0a" stopOpacity={0.3} />
                                                        <stop offset="95%" stopColor="#ff9f0a" stopOpacity={0} />
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                                                <XAxis dataKey="time" hide />
                                                <Tooltip
                                                    contentStyle={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '11px' }}
                                                />
                                                <Area type="monotone" dataKey="latency" stroke="#ff9f0a" fillOpacity={1} fill="url(#colorLat)" strokeWidth={2} isAnimationActive={false} />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>Active Traffic Channels</h3>
                                <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><ArrowUp size={14} color="#007aff" /> Upload</span>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><ArrowDown size={14} color="#34c759" /> Download</span>
                                </div>
                            </div>

                            <div className="card" style={{ flex: 1, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', border: '1px solid var(--border-color)', backgroundColor: 'rgba(0,0,0,0.2)' }}>
                                <div style={{ overflowY: 'auto', flex: 1 }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                        <thead>
                                            <tr style={{ position: 'sticky', top: 0, backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', zIndex: 10 }}>
                                                <th style={{ padding: '14px 20px', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Source Node</th>
                                                <th style={{ padding: '14px 20px', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Local Entry</th>
                                                <th style={{ padding: '14px 20px', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Destination</th>
                                                <th style={{ padding: '14px 20px', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-secondary)', textAlign: 'right' }}>Transfer Activity</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {connections.flatMap(c => (c.tunnels || []).filter(t => t.active).map(t => {
                                                const tunnelId = `${t.remoteHost}:${t.remotePort}:${t.localPort}`;
                                                const stats = tunnelStats[tunnelId] || { up: 0, down: 0 };
                                                const isActive = c.status === 'connected';

                                                return (
                                                    <tr key={`${c.id}-${t.id}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', backgroundColor: isActive ? 'transparent' : 'rgba(255,59,48,0.05)' }}>
                                                        <td style={{ padding: '14px 20px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                                <DistroIcon distro={c.distro} size={24} />
                                                                <div>
                                                                    <div style={{ fontWeight: '600', fontSize: '13px' }}>{c.name || c.host}</div>
                                                                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{c.username}</div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td style={{ padding: '14px 20px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                <div style={{ padding: '4px 8px', borderRadius: '4px', backgroundColor: 'rgba(10, 132, 255, 0.1)', color: 'var(--accent)', fontWeight: '700', fontFamily: 'monospace', fontSize: '12px' }}>
                                                                    :{t.localPort}
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td style={{ padding: '14px 20px' }}>
                                                            <div style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                <span style={{ opacity: 0.6 }}>{t.remoteHost}:</span>
                                                                <span style={{ fontWeight: '600' }}>{t.remotePort}</span>
                                                            </div>
                                                        </td>
                                                        <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                                                            {!isActive ? (
                                                                <div style={{ fontSize: '11px', color: 'var(--danger)', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                                                                    <AlertCircle size={12} /> Disconnected
                                                                </div>
                                                            ) : (
                                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                                                                    <div style={{ display: 'flex', gap: '10px', fontSize: '12px', fontWeight: '600', fontFamily: 'monospace' }}>
                                                                        <span style={{ color: '#007aff' }}>{formatBytes(stats.up)} ↑</span>
                                                                        <span style={{ color: '#34c759' }}>{formatBytes(stats.down)} ↓</span>
                                                                    </div>
                                                                    <div style={{ width: '80px', height: '2px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '2px', position: 'relative', overflow: 'hidden' }}>
                                                                        <div
                                                                            style={{
                                                                                position: 'absolute', top: 0, left: 0, height: '100%',
                                                                                backgroundColor: 'var(--success)',
                                                                                width: (stats.up + stats.down) > 0 ? '100%' : '0%',
                                                                                animation: (stats.up + stats.down) > 0 ? 'pulseGlow 1.5s infinite' : 'none'
                                                                            }}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            }))}
                                            {connections.every(c => !(c.tunnels || []).some(t => t.active)) && (
                                                <tr>
                                                    <td colSpan={4} style={{ padding: '80px 20px', textAlign: 'center' }}>
                                                        <Link2 size={40} style={{ opacity: 0.1, marginBottom: '16px' }} />
                                                        <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>No active data streams initiated</div>
                                                        <div style={{ color: 'var(--text-secondary)', fontSize: '12px', opacity: 0.6, marginTop: '4px' }}>Connect to a server and enable mappings to see traffic here</div>
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div style={{ marginTop: '24px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: '700' }}>
                                    <Activity size={14} /> LIVE NETWORK EVENTS LOG
                                </div>
                                <div className="card" style={{ height: '180px', backgroundColor: '#000', padding: '12px', overflowY: 'auto', fontFamily: 'monospace', fontSize: '11px', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                                    {networkEvents.length === 0 ? (
                                        <div style={{ opacity: 0.3 }}>Waiting for network activity...</div>
                                    ) : (
                                        networkEvents.map((ev: any) => (
                                            <div key={ev.id} style={{ marginBottom: '4px', animation: 'fadeIn 0.2s ease-out' }}>
                                                <span style={{ opacity: 0.4 }}>[{ev.time}]</span>{' '}
                                                <span style={{ color: ev.type === 'error' ? '#ff3b30' : '#34c759', fontWeight: '700' }}>
                                                    {ev.type === 'error' ? '✖ FAIL' : '✔ OK'}
                                                </span>{' '}
                                                <span style={{ color: 'var(--text-primary)' }}>{ev.message}</span>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : isPreferencesOpen ? (
                        <PreferencesWindow
                            runAtStartup={runAtStartup}
                            toggleStartup={toggleStartup}
                            maxRetries={maxRetries}
                            setMaxRetries={setMaxRetries}
                            persistTerminal={persistTerminal}
                            setPersistTerminal={setPersistTerminal}
                            aliases={aliases}
                            setAliases={setAliases}
                        />
                    ) : currentConn ? (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                                <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                                    <DistroIcon distro={currentConn.distro} size={48} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
                                            <h1 style={{ margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '30vw' }} title={currentConn.name || currentConn.host}>{currentConn.name || currentConn.host}</h1>
                                            <button className="btn btn-secondary" style={{ padding: '4px', border: 'none', flexShrink: 0 }} onClick={startEdit}>
                                                <Edit2 size={14} />
                                            </button>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span className={`badge ${currentConn.status === 'connected' ? 'badge-success' : 'badge-danger'}`}
                                                style={{ backgroundColor: currentConn.status === 'connecting' ? '#ff950033' : undefined, color: currentConn.status === 'connecting' ? '#ff9500' : undefined }}>
                                                {currentConn.status}
                                            </span>
                                            {currentConn.status === 'connected' && latencies[currentConn.id] && (
                                                <span style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: '600' }}>
                                                    {latencies[currentConn.id]}ms
                                                </span>
                                            )}
                                            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{currentConn.username}@{currentConn.host}</span>
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    {currentConn.status === 'connected' ? (
                                        <button className="btn btn-secondary" style={{ color: 'var(--danger)' }} onClick={() => handleDisconnect(currentConn.id)}>
                                            <Power size={16} /> Disconnect
                                        </button>
                                    ) : (
                                        <button
                                            className="btn btn-primary"
                                            onClick={() => handleConnect(currentConn.id)}
                                            disabled={currentConn.status === 'connecting'}
                                            style={{ opacity: currentConn.status === 'connecting' ? 0.7 : 1, cursor: currentConn.status === 'connecting' ? 'not-allowed' : 'pointer' }}
                                        >
                                            {currentConn.status === 'connecting' ? (
                                                <Loader size={16} className="spin" />
                                            ) : (
                                                <Play size={16} fill="white" />
                                            )}
                                            {currentConn.status === 'connecting' ? 'Connecting...' : 'Connect'}
                                        </button>
                                    )}
                                </div>
                            </div>

                            {warnings[currentConn.id] && (
                                <div className="card" style={{ borderLeft: '4px solid #ff9500', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px', backgroundColor: '#ff950011' }}>
                                    <AlertCircle color="#ff9500" size={20} />
                                    <div style={{ flex: 1, fontSize: '13px', fontWeight: '500' }}>{warnings[currentConn.id]}</div>
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: '2px', marginBottom: '16px', borderBottom: '1px solid var(--border-color)' }}>
                                <button
                                    onClick={() => setActiveTab('mappings')}
                                    style={{
                                        padding: '8px 16px',
                                        border: 'none',
                                        background: 'none',
                                        fontSize: '13px',
                                        fontWeight: '500',
                                        color: activeTab === 'mappings' ? 'var(--accent)' : 'var(--text-secondary)',
                                        borderBottom: activeTab === 'mappings' ? '2px solid var(--accent)' : 'none',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Mappings
                                </button>
                                <button
                                    onClick={() => setActiveTab('files')}
                                    style={{
                                        padding: '8px 16px',
                                        border: 'none',
                                        background: 'none',
                                        fontSize: '13px',
                                        fontWeight: '500',
                                        color: activeTab === 'files' ? 'var(--accent)' : 'var(--text-secondary)',
                                        borderBottom: activeTab === 'files' ? '2px solid var(--accent)' : 'none',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Files
                                </button>
                                <button
                                    onClick={() => setActiveTab('terminal')}
                                    style={{
                                        padding: '8px 16px',
                                        border: 'none',
                                        background: 'none',
                                        fontSize: '13px',
                                        fontWeight: '500',
                                        color: activeTab === 'terminal' ? 'var(--accent)' : 'var(--text-secondary)',
                                        borderBottom: activeTab === 'terminal' ? '2px solid var(--accent)' : 'none',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Terminal
                                </button>
                            </div>

                            <div style={{ display: activeTab === 'mappings' ? 'block' : 'none' }}>
                                <MappingsTab
                                    currentConn={currentConn}
                                    tunnelForm={tunnelForm}
                                    setTunnelForm={setTunnelForm}
                                    onToggleTunnel={handleToggleTunnel}
                                    onDeleteTunnel={deleteTunnel}
                                    onCreateTunnel={handleCreateTunnel}
                                    onEditTunnel={handleEditTunnel}
                                    editingTunnelId={editingTunnelId}
                                    setEditingTunnelId={setEditingTunnelId}
                                />
                            </div>

                            <div style={{ display: activeTab === 'files' ? 'block' : 'none' }}>
                                <FilesTab key={currentConn.id} currentConn={currentConn} />
                            </div>

                            <div
                                className="card"
                                style={{
                                    padding: '12px',
                                    backgroundColor: '#1c1c1e',
                                    flex: 1,
                                    display: activeTab === 'terminal' || persistTerminal ? 'flex' : 'none',
                                    flexDirection: 'column',
                                    marginBottom: 0,
                                    visibility: activeTab === 'terminal' ? 'visible' : (persistTerminal ? 'hidden' : 'visible'),
                                    height: activeTab === 'terminal' ? 'auto' : (persistTerminal ? '0px' : 'auto'),
                                    margin: activeTab === 'terminal' ? undefined : (persistTerminal ? '0px' : undefined),
                                    opacity: activeTab === 'terminal' ? 1 : (persistTerminal ? 0 : 1),
                                    pointerEvents: activeTab === 'terminal' ? 'auto' : 'none',
                                    border: activeTab === 'terminal' ? undefined : (persistTerminal ? 'none' : undefined)
                                }}
                            >
                                {currentConn.status === 'connected' ? (
                                    <>
                                        <div style={{ display: 'flex', gap: '4px', marginBottom: '8px', overflowX: 'auto', borderBottom: '1px solid #333', paddingBottom: '8px' }}>
                                            {terminalSessions[currentConn.id]?.tabs.map(tab => (
                                                <div
                                                    key={tab.id}
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '6px',
                                                        padding: '4px 12px',
                                                        backgroundColor: terminalSessions[currentConn.id].activeId === tab.id ? '#333' : 'transparent',
                                                        borderRadius: '4px',
                                                        cursor: 'pointer',
                                                        fontSize: '12px',
                                                        color: terminalSessions[currentConn.id].activeId === tab.id ? '#fff' : '#888'
                                                    }}
                                                    onClick={() => switchTerminalTab(currentConn.id, tab.id)}
                                                >
                                                    <TerminalIcon size={12} />
                                                    {tab.title}
                                                    <X
                                                        size={12}
                                                        style={{ marginLeft: '4px', opacity: 0.6 }}
                                                        onClick={(e) => { e.stopPropagation(); removeTerminalTab(currentConn.id, tab.id); }}
                                                    />
                                                </div>
                                            ))}
                                            <button
                                                className="btn"
                                                style={{ padding: '4px 8px', backgroundColor: 'transparent', color: '#888' }}
                                                onClick={() => addTerminalTab(currentConn.id)}
                                            >
                                                <Plus size={14} />
                                            </button>
                                        </div>
                                        <div style={{ flex: 1, position: 'relative' }}>
                                            {terminalSessions[currentConn.id]?.tabs.map(tab => (
                                                <div
                                                    key={tab.id}
                                                    style={{
                                                        position: 'absolute',
                                                        top: 0, left: 0, right: 0, bottom: 0,
                                                        display: terminalSessions[currentConn.id].activeId === tab.id ? 'flex' : 'none',
                                                        flexDirection: 'column'
                                                    }}
                                                >
                                                    <TerminalView
                                                        connectionId={currentConn.id}
                                                        shellId={tab.id}
                                                        active={activeTab === 'terminal' && terminalSessions[currentConn.id].activeId === tab.id}
                                                    />
                                                </div>
                                            ))}
                                            {(!terminalSessions[currentConn.id]?.tabs || terminalSessions[currentConn.id].tabs.length === 0) && (
                                                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <button className="btn btn-secondary" onClick={() => addTerminalTab(currentConn.id)}>
                                                        <Plus size={16} /> Open Terminal Run
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </>
                                ) : (
                                    <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                        <Monitor size={48} strokeWidth={1} style={{ marginBottom: '16px' }} />
                                        <p>Connect to SSH to use the terminal.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <EmptyState onAddConnection={() => setIsAddingConnection(true)} />
                    )}
                </main>
            </div>

            {(isAddingConnection || isEditingConnection) && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 2000, backdropFilter: 'blur(8px)'
                }}>
                    <div style={{ width: '450px', maxWidth: '90vw' }}>
                        <ConnectionForm
                            isEditing={isEditingConnection}
                            form={form}
                            setForm={setForm}
                            onSave={isEditingConnection ? saveEdit : (e) => { e.preventDefault(); handleConnect(form); }}
                            onCancel={() => { setIsAddingConnection(false); setIsEditingConnection(false); }}
                        />
                    </div>
                </div>
            )}

            <div style={{
                position: 'fixed',
                bottom: '24px',
                right: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                zIndex: 9999,
                maxWidth: '350px'
            }}>
                {toasts.map(toast => (
                    <div
                        key={toast.id}
                        className="card"
                        style={{
                            margin: 0,
                            padding: '12px 16px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            borderLeft: `4px solid ${toast.type === 'error' ? 'var(--danger)' : 'var(--warning)'}`,
                            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                            animation: 'slideIn 0.3s ease-out',
                            backgroundColor: 'rgba(30, 30, 32, 0.95)',
                            backdropFilter: 'blur(10px)'
                        }}
                    >
                        <AlertCircle color={toast.type === 'error' ? 'var(--danger)' : 'var(--warning)'} size={18} />
                        <div style={{ fontSize: '13px', lineHeight: '1.4', flex: 1 }}>{toast.message}</div>
                        <button
                            onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '18px', padding: '0 4px' }}
                        >
                            ×
                        </button>
                    </div>
                ))}
            </div>
        </>
    );
};

const DashboardStatCard = ({ icon, label, value, total }: any) => (
    <div className="card" style={{ margin: 0, padding: '18px', display: 'flex', flexDirection: 'column', gap: '12px', border: '1px solid var(--border-color)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {icon}
            {label}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            <div style={{ fontSize: '28px', fontWeight: '800', letterSpacing: '-0.5px' }}>{value}</div>
            {total !== undefined && <div style={{ fontSize: '14px', opacity: 0.4 }}>/ {total}</div>}
        </div>
        <div style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: '3px', backgroundColor: 'rgba(255,255,255,0.03)' }}>
            <div style={{ height: '100%', width: total ? `${(value / total) * 100}%` : '100%', backgroundColor: 'var(--accent)', opacity: 0.6 }} />
        </div>
    </div>
);

function formatBytes(bytes: number, decimals = 1) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

