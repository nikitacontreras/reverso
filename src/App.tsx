import React, { useState, useEffect, useReducer, Suspense } from 'react';
import { AlertCircle, Edit2, Power } from 'lucide-react';

// Components
import Sidebar from './components/Sidebar';
import PreferencesWindow from './components/PreferencesWindow';
import ConnectionForm from './components/ConnectionForm';
import MappingsTab from './components/MappingsTab';
import FilesTab from './components/FilesTab';
import LocalMachineTab from './components/LocalMachineTab';
import TerminalView from './components/TerminalView';
import EmptyState from './components/EmptyState';
import DistroIcon from './components/DistroIcon';

const Dashboard = React.lazy(() => import('./components/Dashboard'));

// Hooks
import { useConnections } from './hooks/useConnections';
import { useTerminal } from './hooks/useTerminal';

// Utils
import { formatBytes } from './utils/format';

// Types & Initial State
const initialState = {
    view: {
        selectedConnection: null as string | null,
        activeTab: 'mappings',
        currentView: 'dashboard' as 'dashboard' | 'local' | 'connection' | 'adding' | 'preferences',
    },
    config: {
        runAtStartup: false,
        persistTerminal: true,
        maxRetries: 3,
        aliases: [
            { id: '1', name: 'logs', command: 'tail -f /var/log/syslog' },
            { id: '2', name: 'docker-clean', command: 'docker system prune -a' }
        ],
    },
    data: {
        error: null as string | null,
        networkEvents: [] as any[],
        tunnelStats: {} as any,
        history: [] as any[],
        cloudflareTunnels: {} as any,
        isCloudflareInstalled: false,
    },
    forms: {
        tunnelForm: { remoteHost: '127.0.0.1', remotePort: '', localPort: '' },
        connectionForm: { name: '', host: '', port: '22', username: '', password: '' },
        editingTunnelId: null as string | null,
        isEditingConnection: false,
    },
    toasts: [] as any[]
};

type AppState = typeof initialState;

function appReducer(state: AppState, action: any): AppState {
    switch (action.type) {
        case 'SET_VIEW':
            return { ...state, view: { ...state.view, ...action.payload } };
        case 'SET_CONFIG':
            return { ...state, config: { ...state.config, ...action.payload } };
        case 'SET_DATA':
            return { ...state, data: { ...state.data, ...action.payload } };
        case 'SET_FORMS':
            return { ...state, forms: { ...state.forms, ...action.payload } };
        case 'ADD_TOAST':
            return { ...state, toasts: [...state.toasts, action.payload] };
        case 'REMOVE_TOAST':
            return { ...state, toasts: state.toasts.filter(t => t.id !== action.payload) };
        case 'SET_ERROR':
            return { ...state, data: { ...state.data, error: action.payload } };
        case 'UPDATE_CF_TUNNELS':
            return {
                ...state,
                data: {
                    ...state.data,
                    cloudflareTunnels: { ...state.data.cloudflareTunnels, ...action.payload }
                }
            };
        default:
            return state;
    }
}

export default function App() {
    const [state, dispatch] = useReducer(appReducer, initialState);
    const { view, config, data, forms, toasts } = state;

    const showToast = (message: string, type = 'error') => {
        const id = Date.now();
        dispatch({ type: 'ADD_TOAST', payload: { id, message, type } });
        setTimeout(() => dispatch({ type: 'REMOVE_TOAST', payload: id }), 5000);
    };

    // Use Hooks
    const {
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
    } = useConnections(showToast);

    const {
        terminalSessions,
        addTerminalTab,
        removeTerminalTab,
        switchTerminalTab
    } = useTerminal();



    // Listeners
    useEffect(() => {
        const removeListener = window.electronAPI.onConnectionError(({ id, message }) => {
            handleUnexpectedDisconnect(id, message);
        });

        const removeNetworkListener = window.electronAPI.onNetworkEvent((event: any) => {
            dispatch({
                type: 'SET_DATA', payload: {
                    networkEvents: [{ id: Date.now(), ...event }, ...data.networkEvents].slice(0, 50)
                }
            });
        });

        const checkCF = async () => {
            const res = await window.electronAPI.checkCloudflare();
            const payload: any = { isCloudflareInstalled: res.success };
            if (res.success) {
                const list = await window.electronAPI.listCloudflare();
                const cfMap = {};
                list.forEach((t: any) => { cfMap[t.localPort] = { url: t.url, status: t.status }; });
                payload.cloudflareTunnels = cfMap;
            }
            dispatch({ type: 'SET_DATA', payload });
        };
        checkCF();

        const removeCFListener = window.electronAPI.onCloudflareStatus((cfData) => {
            dispatch({
                type: 'UPDATE_CF_TUNNELS',
                payload: { [cfData.localPort]: { url: cfData.url || data.cloudflareTunnels[cfData.localPort]?.url, status: cfData.status } }
            });
        });

        return () => {
            if (removeListener) removeListener();
            if (removeNetworkListener) removeNetworkListener();
            if (removeCFListener) removeCFListener();
        };
    }, [handleUnexpectedDisconnect, data.networkEvents, data.cloudflareTunnels]);

    // Save config Persistence
    useEffect(() => {
        if (!isLoaded) return;
        window.electronAPI.saveConfig({
            connections,
            groups,
            settings: {
                runAtStartup: config.runAtStartup,
                maxRetries: config.maxRetries,
                persistTerminal: config.persistTerminal,
                aliases: config.aliases
            }
        });
    }, [connections, groups, config, isLoaded]);

    // Latency Polling
    useEffect(() => {
        const checkLatency = async () => {
            const connectedSet = connections.filter(c => c.status === 'connected');
            for (const conn of connectedSet) {
                const result = await window.electronAPI.ping(conn.host);
                if (result.success) {
                    setLatencies((prev: any) => ({ ...prev, [conn.id]: result.latency }));
                }
            }
        };
        const interval = setInterval(checkLatency, 30000);
        checkLatency();
        return () => clearInterval(interval);
    }, [connections, setLatencies]);

    // Traffic Polling
    useEffect(() => {
        if (view.currentView !== 'dashboard') return;
        const fetchStats = async () => {
            const stats = await window.electronAPI.getTunnelStats();
            const totalUp = Object.values(stats).reduce((acc: number, s: any) => acc + (s.up || 0), 0);
            const totalDown = Object.values(stats).reduce((acc: number, s: any) => acc + (s.down || 0), 0);
            const lats = Object.values(latencies).filter((l: any) => l > 0) as number[];
            const avgLat = lats.length > 0 ? Math.round(lats.reduce((a, b) => a + b, 0) / lats.length) : 0;

            dispatch({
                type: 'SET_DATA', payload: {
                    tunnelStats: stats,
                    history: [...data.history, {
                        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                        up: totalUp,
                        down: totalDown,
                        latency: avgLat
                    }].slice(-30)
                }
            });
        };
        const interval = setInterval(fetchStats, 1000);
        fetchStats();
        return () => clearInterval(interval);
    }, [view.currentView, latencies, data.history]);

    const handleConnectAndSelect = async (idOrConfig) => {
        dispatch({ type: 'SET_VIEW', payload: { currentView: 'connection' } });
        const result = await handleConnect(idOrConfig);
        if (result?.success) {
            dispatch({ type: 'SET_VIEW', payload: { selectedConnection: result.id, activeTab: 'mappings' } });
            if (!terminalSessions[result.id] || (terminalSessions[result.id]?.tabs?.length || 0) === 0) {
                addTerminalTab(result.id);
            }
        }
    };

    const onToggleCloudflare = async (port) => {
        const tunnel = data.cloudflareTunnels[port];
        if (tunnel?.status === 'connected') {
            await window.electronAPI.stopCloudflare(port);
        } else {
            dispatch({
                type: 'UPDATE_CF_TUNNELS',
                payload: { [port]: { ...data.cloudflareTunnels[port], id: port.toString(), status: 'starting' } }
            });
            await window.electronAPI.startCloudflare(port);
        }
    };

    const currentConn = connections.find(c => c.id === view.selectedConnection);

    return (
        <>
            <TitleBar currentView={view.currentView} />

            <div className="container">
                <Sidebar
                    connections={connections}
                    selectedConnection={view.selectedConnection}
                    isAddingConnection={view.currentView === 'adding'}
                    isPreferencesOpen={view.currentView === 'preferences'}
                    isDashboardOpen={view.currentView === 'dashboard'}
                    isLocalMachineOpen={view.currentView === 'local'}
                    groups={groups}
                    onAddConnection={() => {
                        dispatch({ type: 'SET_FORMS', payload: { connectionForm: { name: '', host: '', port: '22', username: '', password: '' }, isEditingConnection: false } });
                        dispatch({ type: 'SET_VIEW', payload: { currentView: 'adding', selectedConnection: null } });
                    }}
                    onSelectConnection={(id) => {
                        dispatch({ type: 'SET_VIEW', payload: { currentView: 'connection', selectedConnection: id, activeTab: 'mappings' } });
                        const conn = connections.find(c => c.id === id);
                        if (conn?.status === 'connected' && (!terminalSessions[id] || terminalSessions[id].tabs.length === 0)) {
                            addTerminalTab(id);
                        }
                    }}
                    onOpenPreferences={() => dispatch({ type: 'SET_VIEW', payload: { currentView: 'preferences', selectedConnection: null } })}
                    onOpenDashboard={() => dispatch({ type: 'SET_VIEW', payload: { currentView: 'dashboard', selectedConnection: null } })}
                    onOpenLocalMachine={() => dispatch({ type: 'SET_VIEW', payload: { currentView: 'local', selectedConnection: null } })}
                    onDeleteConnection={deleteConnection}
                    onUpdateGroups={setGroups}
                    onReorderConnections={setConnections}
                    onConnect={handleConnectAndSelect}
                    onDisconnect={handleDisconnect}
                    onEdit={(id) => {
                        const conn = connections.find(c => c.id === id);
                        if (conn) {
                            dispatch({ type: 'SET_FORMS', payload: { connectionForm: { ...conn }, isEditingConnection: true } });
                            dispatch({ type: 'SET_VIEW', payload: { currentView: 'adding', selectedConnection: id } });
                        }
                    }}
                    onConnectAll={(groupId) => {
                        const g = groups.find(gr => gr.id === groupId);
                        g?.connectionIds.forEach(id => {
                            if (connections.find(c => c.id === id)?.status === 'disconnected') handleConnectAndSelect(id);
                        });
                    }}
                    showToast={showToast}
                />

                <MainContent
                    view={view}
                    data={data}
                    forms={forms}
                    connections={connections}
                    terminalSessions={terminalSessions}
                    onDispatch={dispatch}
                    onConnectAndSelect={handleConnectAndSelect}
                    onDisconnect={handleDisconnect}
                    onToggleCloudflare={onToggleCloudflare}
                    onHandleCreateTunnel={handleCreateTunnel}
                    onHandleToggleTunnel={handleToggleTunnel}
                    onDeleteTunnel={deleteTunnel}
                    addTerminalTab={addTerminalTab}
                    removeTerminalTab={removeTerminalTab}
                    switchTerminalTab={switchTerminalTab}
                />
            </div>

            <Modals
                view={view}
                forms={forms}
                config={config}
                onDispatch={dispatch}
                onHandleConnectAndSelect={handleConnectAndSelect}
                setConnections={setConnections}
                setMaxRetries={setMaxRetries}
            />

            <ToastList toasts={toasts} onRemove={(id) => dispatch({ type: 'REMOVE_TOAST', payload: id })} />
        </>
    );
}

// --- Sub-Components ---

const TitleBar = ({ currentView }: any) => (
    <div className="titlebar">
        Reverso
        {currentView === 'dashboard' && <span style={{ marginLeft: '12px', fontSize: '11px', opacity: 0.5 }}>• Dashboard</span>}
        {currentView === 'local' && <span style={{ marginLeft: '12px', fontSize: '11px', opacity: 0.5 }}>• Local Machine</span>}
    </div>
);

const MainContent = ({ view, data, forms, connections, terminalSessions, onDispatch, onConnectAndSelect, onDisconnect, onToggleCloudflare, onHandleCreateTunnel, onHandleToggleTunnel, onDeleteTunnel, addTerminalTab, removeTerminalTab, switchTerminalTab }: any) => {
    const currentConn = connections.find(c => c.id === view.selectedConnection);

    return (
        <main className="main-content" style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            {data.error && (
                <div className="card" style={{ borderLeft: '4px solid var(--danger)', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                    <AlertCircle color="var(--danger)" size={20} />
                    <div style={{ flex: 1, fontSize: '14px' }}>{data.error}</div>
                    <button onClick={() => onDispatch({ type: 'SET_ERROR', payload: null })} className="btn-icon">×</button>
                </div>
            )}

            {view.currentView === 'dashboard' ? (
                <div style={{ padding: '24px', flex: 1, overflowY: 'auto' }}>
                    <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)' }}>Loading Dashboard...</div>}>
                        <Dashboard connections={connections} history={data.history} tunnelStats={data.tunnelStats} networkEvents={data.networkEvents} />
                    </Suspense>
                </div>
            ) : view.currentView === 'local' ? (
                <div style={{ padding: '24px', flex: 1, overflowY: 'auto' }}>
                    <LocalMachineTab
                        cloudflareTunnels={data.cloudflareTunnels}
                        isCloudflareInstalled={data.isCloudflareInstalled}
                        onToggleCloudflare={onToggleCloudflare}
                    />
                </div>
            ) : view.selectedConnection && currentConn ? (
                <ConnectionView
                    conn={currentConn}
                    activeTab={view.activeTab}
                    forms={forms}
                    data={data}
                    onDispatch={onDispatch}
                    onDisconnect={onDisconnect}
                    onConnectAndSelect={onConnectAndSelect}
                    onToggleCloudflare={onToggleCloudflare}
                    onHandleCreateTunnel={onHandleCreateTunnel}
                    onHandleToggleTunnel={onHandleToggleTunnel}
                    onDeleteTunnel={onDeleteTunnel}
                    terminalSessions={terminalSessions}
                    addTerminalTab={addTerminalTab}
                    removeTerminalTab={removeTerminalTab}
                    switchTerminalTab={switchTerminalTab}
                />
            ) : (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <EmptyState onAdd={() => onDispatch({ type: 'SET_VIEW', payload: { currentView: 'adding' } })} />
                </div>
            )}
        </main>
    );
};

const ConnectionView = ({ conn, activeTab, forms, data, onDispatch, onDisconnect, onConnectAndSelect, onToggleCloudflare, onHandleCreateTunnel, onHandleToggleTunnel, onDeleteTunnel, terminalSessions, addTerminalTab, removeTerminalTab, switchTerminalTab }: any) => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ padding: '24px 24px 0 24px', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <DistroIcon distro={conn.distro} size={32} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '800' }}>{conn.name}</h1>
                        <button
                            className="btn-icon"
                            onClick={() => { onDispatch({ type: 'SET_FORMS', payload: { connectionForm: { ...conn }, isEditingConnection: true } }); }}
                            style={{ padding: '6px', opacity: 0.5 }}
                        >
                            <Edit2 size={16} />
                        </button>
                    </div>
                </div>

                <button
                    className="btn-icon"
                    onClick={() => conn.status === 'connected' ? onDisconnect(conn.id) : onConnectAndSelect(conn.id)}
                    style={{
                        padding: '8px',
                        backgroundColor: conn.status === 'connected' ? 'rgba(255, 59, 48, 0.1)' : 'rgba(52, 199, 89, 0.1)',
                        borderRadius: '8px'
                    }}
                >
                    <Power size={20} color={conn.status === 'connected' ? 'var(--danger)' : 'var(--success)'} />
                </button>
            </div>
            <p style={{ margin: 0, opacity: 0.5, fontSize: '13px' }}>{conn.username}@{conn.host}</p>
        </div>

        <div className="tabs">
            <button className={`tab ${activeTab === 'mappings' ? 'active' : ''}`} onClick={() => onDispatch({ type: 'SET_VIEW', payload: { activeTab: 'mappings' } })}>Mappings</button>
            <button className={`tab ${activeTab === 'terminal' ? 'active' : ''}`} onClick={() => {
                onDispatch({ type: 'SET_VIEW', payload: { activeTab: 'terminal' } });
                if (conn.status === 'connected' && (!terminalSessions[conn.id] || terminalSessions[conn.id].tabs.length === 0)) {
                    addTerminalTab(conn.id);
                }
            }}>Terminal</button>
            <button className={`tab ${activeTab === 'files' ? 'active' : ''}`} onClick={() => onDispatch({ type: 'SET_VIEW', payload: { activeTab: 'files' } })}>Files</button>
        </div>

        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {activeTab === 'mappings' && (
                <div style={{ padding: '0 24px 24px 24px', overflowY: 'auto', flex: 1 }}>
                    <MappingsTab
                        currentConn={conn}
                        tunnelForm={forms.tunnelForm}
                        setTunnelForm={(f: any) => onDispatch({ type: 'SET_FORMS', payload: { tunnelForm: f } })}
                        onCreateTunnel={(e: any) => {
                            e.preventDefault();
                            onHandleCreateTunnel(conn.id, forms.tunnelForm, forms.editingTunnelId);
                            onDispatch({ type: 'SET_FORMS', payload: { tunnelForm: { remoteHost: '127.0.0.1', remotePort: '', localPort: '' }, editingTunnelId: null } });
                        }}
                        onToggleTunnel={(tid: string) => onHandleToggleTunnel(conn.id, tid)}
                        onDeleteTunnel={(tid: string) => onDeleteTunnel(conn.id, tid)}
                        editingTunnelId={forms.editingTunnelId}
                        setEditingTunnelId={(v: string | null) => onDispatch({ type: 'SET_FORMS', payload: { editingTunnelId: v } })}
                        onEditTunnel={(tid: string) => {
                            const t = conn.tunnels.find((tun: any) => tun.id === tid);
                            onDispatch({ type: 'SET_FORMS', payload: { tunnelForm: { remoteHost: t.remoteHost, remotePort: t.remotePort.toString(), localPort: t.localPort.toString() }, editingTunnelId: tid } });
                        }}
                        cloudflareTunnels={data.cloudflareTunnels}
                        isCloudflareInstalled={data.isCloudflareInstalled}
                        onToggleCloudflare={onToggleCloudflare}
                    />
                </div>
            )}
            {activeTab === 'terminal' && (
                <TerminalView
                    connection={conn}
                    session={terminalSessions[conn.id] || { tabs: [], activeId: null }}
                    onAddTab={() => addTerminalTab(conn.id)}
                    onRemoveTab={(sid: string) => removeTerminalTab(conn.id, sid)}
                    onSwitchTab={(sid: string) => switchTerminalTab(conn.id, sid)}
                />
            )}
            {activeTab === 'files' && <div style={{ padding: '24px', flex: 1 }}><FilesTab currentConn={conn} /></div>}
        </div>
    </div>
);

const Modals = ({ view, forms, config, onDispatch, onHandleConnectAndSelect, setConnections, setMaxRetries }: any) => (
    <>
        {(view.currentView === 'adding' || forms.isEditingConnection) && (
            <div
                className="modal-overlay"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
                        onDispatch({ type: 'SET_VIEW', payload: { currentView: 'dashboard' } });
                        onDispatch({ type: 'SET_FORMS', payload: { isEditingConnection: false } });
                    }
                }}
                onClick={() => {
                    onDispatch({ type: 'SET_VIEW', payload: { currentView: 'dashboard' } });
                    onDispatch({ type: 'SET_FORMS', payload: { isEditingConnection: false } });
                }}
            >
                <div className="modal-container" role="presentation" onClick={e => e.stopPropagation()}>
                    <ConnectionForm
                        form={forms.connectionForm}
                        setForm={(f: any) => onDispatch({ type: 'SET_FORMS', payload: { connectionForm: f } })}
                        onSave={(e: any) => {
                            e.preventDefault();
                            if (forms.isEditingConnection) {
                                setConnections((prev: any[]) => prev.map(c => c.id === view.selectedConnection ? { ...c, ...forms.connectionForm } : c));
                                onDispatch({ type: 'SET_FORMS', payload: { isEditingConnection: false } });
                            } else {
                                onHandleConnectAndSelect(forms.connectionForm);
                            }
                        }}
                        onCancel={() => { onDispatch({ type: 'SET_VIEW', payload: { currentView: 'dashboard' } }); onDispatch({ type: 'SET_FORMS', payload: { isEditingConnection: false } }); }}
                        isEditing={forms.isEditingConnection}
                    />
                </div>
            </div>
        )}

        {view.currentView === 'preferences' && (
            <div
                className="modal-overlay"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
                        onDispatch({ type: 'SET_VIEW', payload: { currentView: 'dashboard' } });
                    }
                }}
                onClick={() => onDispatch({ type: 'SET_VIEW', payload: { currentView: 'dashboard' } })}
            >
                <div className="modal-container" role="presentation" onClick={e => e.stopPropagation()}>
                    <PreferencesWindow
                        runAtStartup={config.runAtStartup}
                        toggleStartup={async () => {
                            const v = !config.runAtStartup;
                            await window.electronAPI.setRunAtStartup(v);
                            onDispatch({ type: 'SET_CONFIG', payload: { runAtStartup: v } });
                        }}
                        maxRetries={config.maxRetries}
                        setMaxRetries={setMaxRetries}
                        persistTerminal={config.persistTerminal}
                        setPersistTerminal={(v: boolean) => onDispatch({ type: 'SET_CONFIG', payload: { persistTerminal: v } })}
                        aliases={config.aliases}
                        setAliases={(v: any[]) => onDispatch({ type: 'SET_CONFIG', payload: { aliases: v } })}
                    />
                </div>
            </div>
        )}
    </>
);

const ToastList = ({ toasts, onRemove }: any) => (
    <div style={{ position: 'fixed', bottom: '24px', right: '24px', display: 'flex', flexDirection: 'column', gap: '12px', zIndex: 9999 }}>
        {toasts.map((toast: any) => (
            <div key={toast.id} className="card toast" style={{ borderLeft: `4px solid ${toast.type === 'error' ? 'var(--danger)' : 'var(--warning)'}` }}>
                <AlertCircle color={toast.type === 'error' ? 'var(--danger)' : 'var(--warning)'} size={18} />
                <div style={{ fontSize: '13px', lineHeight: '1.4', flex: 1 }}>{toast.message}</div>
                <button onClick={() => onRemove(toast.id)} className="btn-icon">×</button>
            </div>
        ))}
    </div>
);
