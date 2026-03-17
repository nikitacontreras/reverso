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
    Loader
} from 'lucide-react';
import TerminalView from './components/TerminalView';
import DistroIcon from './components/DistroIcon';
import EmptyState from './components/EmptyState';
import Sidebar from './components/Sidebar';
import PreferencesWindow from './components/PreferencesWindow';
import ConnectionForm from './components/ConnectionForm';
import MappingsTab from './components/MappingsTab';
import FilesTab from './components/FilesTab';

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
    const [isLoaded, setIsLoaded] = useState(false);
    const [groups, setGroups] = useState([]); // { id, name, connectionIds: [] }
    const [terminalSessions, setTerminalSessions] = useState({}); // { connId: { tabs: [], activeId: null } }
    const [toasts, setToasts] = useState([]);
    const [latencies, setLatencies] = useState({}); // { connId: ms }
    const [isDashboardOpen, setIsDashboardOpen] = useState(false);

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
            setIsLoaded(true);
        };
        load();

        const removeListener = window.electronAPI.onConnectionError(({ id, message }) => {
            handleUnexpectedDisconnect(id, message);
        });

        return () => {
            if (removeListener) removeListener();
        };
    }, []);

    useEffect(() => {
        if (!isLoaded) return;
        connectionsRef.current = connections;
        window.electronAPI.saveConfig({
            connections,
            groups,
            settings: { runAtStartup, maxRetries, persistTerminal }
        });
    }, [connections, groups, runAtStartup, maxRetries, persistTerminal, isLoaded]);

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
        setTunnelForm({ remoteHost: '127.0.0.1', remotePort: '', localPort: '' });
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

    const deleteTunnel = (tunnelId) => {
        if (!window.confirm('Are you sure you want to delete this mapping?')) return;
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
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                            <h2 style={{ marginBottom: '20px' }}>Global Dashboard</h2>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
                                <div className="card" style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>CONNECTED SERVERS</div>
                                    <div style={{ fontSize: '24px', fontWeight: '700' }}>{connections.filter(c => c.status === 'connected').length}</div>
                                </div>
                                <div className="card" style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>ACTIVE TUNNELS</div>
                                    <div style={{ fontSize: '24px', fontWeight: '700' }}>{connections.reduce((acc, c) => acc + (c.tunnels?.filter(t => t.active).length || 0), 0)}</div>
                                </div>
                                <div className="card" style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>AVG. LATENCY</div>
                                    <div style={{ fontSize: '24px', fontWeight: '700' }}>
                                        {(() => {
                                            const lats = Object.values(latencies).filter((l: any) => l > 0) as number[];
                                            return lats.length > 0 ? `${Math.round(lats.reduce((a, b) => a + b, 0) / lats.length)} ms` : '--';
                                        })()}
                                    </div>
                                </div>
                            </div>

                            <h3>Active Tunnels</h3>
                            <div className="card" style={{ flex: 1, padding: 0, overflowY: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                    <thead>
                                        <tr style={{ textAlign: 'left', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)' }}>
                                            <th style={{ padding: '12px' }}>Connection</th>
                                            <th style={{ padding: '12px' }}>Local Port</th>
                                            <th style={{ padding: '12px' }}>Destination</th>
                                            <th style={{ padding: '12px' }}>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {connections.flatMap(c => (c.tunnels || []).filter(t => t.active).map(t => (
                                            <tr key={`${c.id}-${t.id}`} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                <td style={{ padding: '12px' }}>{c.name || c.host}</td>
                                                <td style={{ padding: '12px' }}><code style={{ color: 'var(--accent)' }}>{t.localPort}</code></td>
                                                <td style={{ padding: '12px' }}>{t.remoteHost}:{t.remotePort}</td>
                                                <td style={{ padding: '12px' }}><span className="badge badge-success">ACTIVE</span></td>
                                            </tr>
                                        )))}
                                        {connections.every(c => !(c.tunnels || []).some(t => t.active)) && (
                                            <tr>
                                                <td colSpan={4} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>No active tunnels found</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
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
