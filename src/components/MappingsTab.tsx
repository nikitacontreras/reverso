import React from 'react';
import { ToggleRight, ToggleLeft, Trash2, Link as LinkIcon, ChevronRight, Plus } from 'lucide-react';

const MappingsTab = ({
    currentConn,
    tunnelForm,
    setTunnelForm,
    onToggleTunnel,
    onDeleteTunnel,
    onCreateTunnel
}) => {
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
                        {currentConn.tunnels.map(t => (
                            <div key={t.id} className="tunnel-row" style={{ borderBottom: '1px solid var(--border-color)', padding: '16px 0' }}>
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
                                        onClick={(e) => { e.stopPropagation(); onDeleteTunnel(t.id); }}
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="card">
                <h3 style={{ fontSize: '14px', marginBottom: '20px' }}>Add New Mapping</h3>
                <form onSubmit={onCreateTunnel} style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-end' }}>
                    <div className="input-group" style={{ marginBottom: 0, flex: '2 1 200px' }}>
                        <label style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Target Host</label>
                        <input placeholder="127.0.0.1" value={tunnelForm.remoteHost} onChange={e => setTunnelForm({ ...tunnelForm, remoteHost: e.target.value })} required />
                    </div>
                    <div className="input-group" style={{ marginBottom: 0, flex: '1 1 80px' }}>
                        <label style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Target Port</label>
                        <input type="number" placeholder="80" value={tunnelForm.remotePort} onChange={e => setTunnelForm({ ...tunnelForm, remotePort: e.target.value })} required />
                    </div>
                    <div className="input-group" style={{ marginBottom: 0, flex: '1 1 80px' }}>
                        <label style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Local Port</label>
                        <input type="number" placeholder="8080" value={tunnelForm.localPort} onChange={e => setTunnelForm({ ...tunnelForm, localPort: e.target.value })} required />
                    </div>
                    <button type="submit" className="btn btn-primary" style={{ height: '40px', padding: '0 20px', flexShrink: 0 }}>
                        <Plus size={16} /> Add Mapping
                    </button>
                </form>
            </div>
        </div>
    );
};

export default MappingsTab;
