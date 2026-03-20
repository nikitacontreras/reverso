import React, { useState } from 'react';
import { ToggleRight, ToggleLeft, Trash2, Edit2, Link as LinkIcon, ChevronRight, Plus, Zap, RefreshCw, Loader, X, Globe, ExternalLink, Copy } from 'lucide-react';

const MappingsTab = ({
    currentConn,
    tunnelForm,
    setTunnelForm,
    onToggleTunnel,
    onDeleteTunnel,
    onCreateTunnel,
    onEditTunnel,
    editingTunnelId,
    setEditingTunnelId,
    cloudflareTunnels,
    isCloudflareInstalled,
    onToggleCloudflare
}) => {
    const [isDetecting, setIsDetecting] = useState(false);
    const [detectedServices, setDetectedServices] = useState([]);

    const detectServices = async () => {
        if (!currentConn || currentConn.status !== 'connected') return;
        setIsDetecting(true);
        try {
            const result = await window.electronAPI.detectServices(currentConn.id);
            if (result.success) {
                setDetectedServices(result.services || []);
            }
        } catch (err) {
            console.error('Detection failed', err);
        } finally {
            setIsDetecting(false);
        }
    };

    const addDetectedTunnel = (port) => {
        setTunnelForm({
            remoteHost: '127.0.0.1',
            remotePort: port.toString(),
            localPort: port.toString()
        });
    };
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="card" style={{ marginBottom: 0 }}>
                <h3 style={{ fontSize: '14px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <LinkIcon size={16} /> Mappings Configuration
                </h3>

                {(currentConn.tunnels || []).length === 0 ? (
                    <div style={{ padding: '32px', border: '1px dashed var(--border-color)', borderRadius: '12px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
                        No active mappings. Use the form below to add one.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {currentConn.tunnels.map(t => {
                            const cfTunnel = cloudflareTunnels[t.localPort];
                            const isCFActive = cfTunnel?.status === 'connected';
                            const isCFStarting = cfTunnel?.status === 'starting';

                            return (
                                <div key={t.id} style={{ borderBottom: '1px solid var(--border-color)', padding: '16px 0' }}>
                                    <div className="tunnel-row" style={{ border: 'none', padding: 0, marginBottom: isCFActive ? '12px' : 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: t.active ? 'rgba(0, 113, 227, 0.1)' : 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <LinkIcon size={14} color={t.active ? 'var(--accent)' : 'var(--text-secondary)'} />
                                            </div>
                                            <div style={{ fontSize: '13px', opacity: t.active ? 1 : 0.6 }}>
                                                <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Target Host</div>
                                                <span style={{ fontWeight: '600', fontFamily: 'monospace' }}>{t.remoteHost}:{t.remotePort}</span>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <ChevronRight size={14} color="var(--text-secondary)" style={{ opacity: 0.5 }} />
                                            <div style={{ fontSize: '13px', opacity: t.active ? 1 : 0.6 }}>
                                                <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Local Endpoint</div>
                                                <span style={{ fontWeight: '600', fontFamily: 'monospace' }}>127.0.0.1:{t.localPort}</span>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                            {isCloudflareInstalled && (
                                                <button
                                                    className="btn"
                                                    title={isCFActive ? "Stop Public Cloudflare Tunnel" : "Expose to Public Internet via Cloudflare"}
                                                    style={{
                                                        padding: '6px',
                                                        borderRadius: '6px',
                                                        backgroundColor: isCFActive ? 'rgba(243, 128, 32, 0.1)' : 'rgba(255,255,255,0.05)',
                                                        color: isCFActive ? '#f38020' : 'var(--text-secondary)',
                                                        border: isCFActive ? '1px solid rgba(243, 128, 32, 0.2)' : '1px solid transparent',
                                                        marginRight: '8px',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '6px'
                                                    }}
                                                    onClick={() => onToggleCloudflare(t.localPort)}
                                                    disabled={isCFStarting}
                                                >
                                                    {isCFStarting ? <Loader size={14} className="spin" /> : <Globe size={14} />}
                                                    <span style={{ fontSize: '11px', fontWeight: '700' }}>
                                                        {isCFStarting ? 'EXPOSING...' : 'PUBLIC'}
                                                    </span>
                                                </button>
                                            )}
                                            <button
                                                className="btn"
                                                style={{
                                                    padding: '4px',
                                                    backgroundColor: 'transparent',
                                                    color: t.active ? 'var(--success)' : 'var(--text-secondary)',
                                                    cursor: 'pointer',
                                                    transition: 'transform 0.2s'
                                                }}
                                                onClick={(e) => { e.stopPropagation(); onToggleTunnel(t.id); }}
                                            >
                                                {t.active ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                                            </button>
                                            <button
                                                className="btn"
                                                style={{ padding: '8px', backgroundColor: 'transparent', color: 'var(--text-secondary)', border: 'none' }}
                                                onClick={(e) => { e.stopPropagation(); onEditTunnel(t.id); }}
                                            >
                                                <Edit2 size={16} />
                                            </button>
                                            <button
                                                className="btn"
                                                style={{ padding: '8px', backgroundColor: 'transparent', color: 'var(--text-secondary)', border: 'none' }}
                                                onClick={(e) => { e.stopPropagation(); onDeleteTunnel(t.id); }}
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>

                                    {isCFActive && (
                                        <div style={{
                                            backgroundColor: 'rgba(243, 128, 32, 0.05)',
                                            borderRadius: '8px',
                                            padding: '12px 14px',
                                            border: '1px solid rgba(243, 128, 32, 0.1)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            gap: '16px',
                                            animation: 'slideDown 0.3s ease-out'
                                        }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                                    <div style={{ color: '#f38020', display: 'flex' }}><Globe size={14} /></div>
                                                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#f38020', whiteSpace: 'nowrap' }}>Cloudflare URL:</div>
                                                    <a
                                                        href={cfTunnel.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        style={{
                                                            fontSize: '12px',
                                                            color: 'var(--text-primary)',
                                                            textDecoration: 'none',
                                                            fontFamily: 'monospace',
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            whiteSpace: 'nowrap',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '4px'
                                                        }}
                                                    >
                                                        {cfTunnel.url}
                                                        <ExternalLink size={12} style={{ opacity: 0.5 }} />
                                                    </a>
                                                </div>
                                                <div style={{ fontSize: '10px', opacity: 0.5, color: 'var(--text-secondary)', marginLeft: '22px' }}>
                                                    * If you see "Site not found", wait 5-10 seconds for DNS propagation.
                                                </div>
                                            </div>
                                            <button
                                                className="btn"
                                                style={{ padding: '4px 8px', fontSize: '10px', backgroundColor: 'rgba(255,255,255,0.1)', color: 'var(--text-secondary)', border: 'none', borderRadius: '4px', flexShrink: 0 }}
                                                onClick={() => {
                                                    navigator.clipboard.writeText(cfTunnel.url);
                                                }}
                                            >
                                                <Copy size={12} />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '14px', margin: 0 }}>Add New Mapping</h3>
                    {currentConn.status === 'connected' && (
                        <button
                            className="btn btn-secondary"
                            style={{ padding: '4px 12px', fontSize: '12px', border: 'none', backgroundColor: 'rgba(10, 132, 255, 0.1)', color: 'var(--accent)' }}
                            onClick={detectServices}
                            disabled={isDetecting}
                        >
                            {isDetecting ? <Loader size={14} className="spin" /> : <Zap size={14} />}
                            {isDetecting ? 'Scanning...' : 'Magic Mapping'}
                        </button>
                    )}
                </div>

                {detectedServices.length > 0 && (
                    <div style={{ marginBottom: '20px', padding: '12px', backgroundColor: 'rgba(10, 132, 255, 0.05)', borderRadius: '8px', border: '1px solid rgba(10, 132, 255, 0.1)' }}>
                        <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--accent)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', justifyContent: 'space-between' }}>
                            Detected Services
                            <button onClick={() => setDetectedServices([])} style={{ border: 'none', background: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '10px' }}>Clear</button>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {detectedServices.map(service => (
                                <button
                                    key={service.port}
                                    onClick={() => addDetectedTunnel(service.port)}
                                    className="btn"
                                    style={{
                                        padding: '6px 12px',
                                        fontSize: '11px',
                                        backgroundColor: 'var(--card-bg)',
                                        borderColor: 'var(--border-color)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'flex-start',
                                        gap: '2px',
                                        minWidth: '80px'
                                    }}
                                >
                                    <span style={{ fontWeight: '700', color: 'var(--text-primary)' }}>Port {service.port}</span>
                                    <span style={{ fontSize: '9px', opacity: 0.7, color: 'var(--accent)' }}>{service.name}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <form onSubmit={onCreateTunnel} style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-end' }}>
                    <div className="input-group" style={{ marginBottom: 0, flex: '2 1 200px' }}>
                        <label htmlFor="target-host" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Target Host</label>
                        <input id="target-host" placeholder="127.0.0.1" value={tunnelForm.remoteHost} onChange={e => setTunnelForm({ ...tunnelForm, remoteHost: e.target.value })} required />
                    </div>
                    <div className="input-group" style={{ marginBottom: 0, flex: '1 1 80px' }}>
                        <label htmlFor="target-port" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Target Port</label>
                        <input id="target-port" type="number" placeholder="80" value={tunnelForm.remotePort} onChange={e => setTunnelForm({ ...tunnelForm, remotePort: e.target.value })} required />
                    </div>
                    <div className="input-group" style={{ marginBottom: 0, flex: '1 1 80px' }}>
                        <label htmlFor="local-port" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Local Port</label>
                        <input id="local-port" type="number" placeholder="8080" value={tunnelForm.localPort} onChange={e => setTunnelForm({ ...tunnelForm, localPort: e.target.value })} required />
                    </div>
                    <button type="submit" className="btn btn-primary" style={{ height: '40px', padding: '0 20px', flexShrink: 0 }}>
                        {editingTunnelId ? <RefreshCw size={16} /> : <Plus size={16} />}
                        {editingTunnelId ? 'Update Mapping' : 'Add Mapping'}
                    </button>
                    {editingTunnelId && (
                        <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ height: '40px', padding: '0 12px' }}
                            onClick={() => {
                                setEditingTunnelId(null);
                                setTunnelForm({ remoteHost: '127.0.0.1', remotePort: '', localPort: '' });
                            }}
                        >
                            <X size={16} />
                        </button>
                    )}
                </form>
            </div>
        </div>
    );
};

export default MappingsTab;
