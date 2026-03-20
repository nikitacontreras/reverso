import React, { useState, useEffect } from 'react';
import { RefreshCw, Monitor, Globe, ExternalLink, Copy, Loader, Search, Zap, AlertCircle } from 'lucide-react';

const LocalMachineTab = ({
    cloudflareTunnels,
    isCloudflareInstalled,
    onToggleCloudflare
}) => {
    const [localPorts, setLocalPorts] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [error, setError] = useState(null);

    const scanPorts = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const result = await window.electronAPI.detectLocalPorts();
            if (result.success) {
                // Filter out common system ports or handle as needed
                setLocalPorts(result.services.sort((a, b) => a.port - b.port));
            } else {
                setError(result.error);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        scanPorts();
    }, []);

    const filteredPorts = localPorts.filter(p =>
        p.port.toString().includes(search) ||
        p.name.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', animation: 'fadeIn 0.4s ease-out' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '28px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <Monitor size={32} color="var(--success)" /> Local Machine
                    </h1>
                    <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: 'var(--text-secondary)' }}>
                        Detecting listening ports on your current device
                    </p>
                </div>
                <button
                    className="btn btn-secondary"
                    onClick={scanPorts}
                    disabled={isLoading}
                    style={{ background: 'rgba(52, 199, 89, 0.1)', color: 'var(--success)', border: 'none' }}
                >
                    {isLoading ? <Loader size={16} className="spin" /> : <RefreshCw size={16} />}
                    Refresh Scan
                </button>
            </div>

            <div className="card" style={{ marginBottom: '24px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Search size={18} style={{ opacity: 0.4 }} />
                <input
                    placeholder="Search by port or process name..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{ border: 'none', background: 'none', padding: 0 }}
                />
            </div>

            {error && (
                <div className="card" style={{ borderLeft: '4px solid var(--danger)', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                    <AlertCircle color="var(--danger)" size={20} />
                    <div style={{ flex: 1, fontSize: '14px' }}>{error}</div>
                </div>
            )}

            <div className="card" style={{ flex: 1, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', backgroundColor: 'rgba(0,0,0,0.1)' }}>
                <div style={{ overflowY: 'auto', flex: 1 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ position: 'sticky', top: 0, backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', zIndex: 10 }}>
                                <th style={{ padding: '14px 20px', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Process</th>
                                <th style={{ padding: '14px 20px', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Local Endpoint</th>
                                <th style={{ padding: '14px 20px', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-secondary)', textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr>
                                    <td colSpan={3} style={{ padding: '60px', textAlign: 'center' }}>
                                        <Loader size={32} className="spin" style={{ opacity: 0.2, marginBottom: '12px' }} />
                                        <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Scanning system for listening ports...</div>
                                    </td>
                                </tr>
                            ) : filteredPorts.length === 0 ? (
                                <tr>
                                    <td colSpan={3} style={{ padding: '60px', textAlign: 'center' }}>
                                        <Search size={32} style={{ opacity: 0.1, marginBottom: '12px' }} />
                                        <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>No listening ports found</div>
                                    </td>
                                </tr>
                            ) : (
                                filteredPorts.map(service => {
                                    const cfTunnel = cloudflareTunnels[service.port];
                                    const isCFActive = cfTunnel?.status === 'connected';
                                    const isCFStarting = cfTunnel?.status === 'starting';

                                    return (
                                        <React.Fragment key={service.port}>
                                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                                <td style={{ padding: '14px 20px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                        <div style={{
                                                            width: '32px', height: '32px', borderRadius: '8px',
                                                            backgroundColor: 'rgba(255,255,255,0.05)', display: 'flex',
                                                            alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)'
                                                        }}>
                                                            <Zap size={16} />
                                                        </div>
                                                        <div style={{ fontWeight: '600', fontSize: '13px' }}>{service.name}</div>
                                                    </div>
                                                </td>
                                                <td style={{ padding: '14px 20px' }}>
                                                    <div style={{ padding: '4px 8px', borderRadius: '4px', backgroundColor: 'rgba(50, 215, 75, 0.1)', color: 'var(--success)', fontWeight: '700', fontFamily: 'monospace', fontSize: '12px', display: 'inline-block' }}>
                                                        127.0.0.1:{service.port}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                                                    {isCloudflareInstalled ? (
                                                        <button
                                                            className="btn"
                                                            style={{
                                                                padding: '6px 14px',
                                                                borderRadius: '8px',
                                                                backgroundColor: isCFActive ? 'rgba(243, 128, 32, 0.1)' : 'rgba(255,255,255,0.05)',
                                                                color: isCFActive ? '#f38020' : 'var(--text-primary)',
                                                                border: isCFActive ? '1px solid rgba(243, 128, 32, 0.2)' : '1px solid var(--border-color)',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '8px',
                                                                cursor: 'pointer'
                                                            }}
                                                            onClick={() => onToggleCloudflare(service.port)}
                                                            disabled={isCFStarting}
                                                        >
                                                            {isCFStarting ? <Loader size={14} className="spin" /> : <Globe size={14} />}
                                                            <span style={{ fontSize: '12px', fontWeight: '700' }}>
                                                                {isCFStarting ? 'EXPOSING...' : (isCFActive ? 'STOP PUBLIC' : 'EXPOSE PUBLIC')}
                                                            </span>
                                                        </button>
                                                    ) : (
                                                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', opacity: 0.5 }}>Cloudflare not installed</div>
                                                    )}
                                                </td>
                                            </tr>
                                            {isCFActive && (
                                                <tr>
                                                    <td colSpan={3} style={{ padding: '0 20px 14px 20px' }}>
                                                        <div style={{
                                                            backgroundColor: 'rgba(243, 128, 32, 0.05)',
                                                            borderRadius: '8px',
                                                            padding: '10px 14px',
                                                            border: '1px solid rgba(243, 128, 32, 0.1)',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'space-between',
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
                                                                style={{ padding: '4px 8px', fontSize: '10px', backgroundColor: 'rgba(255,255,255,0.1)', color: 'var(--text-secondary)', border: 'none', borderRadius: '4px' }}
                                                                onClick={() => {
                                                                    navigator.clipboard.writeText(cfTunnel.url);
                                                                }}
                                                            >
                                                                <Copy size={12} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {!isCloudflareInstalled && (
                <div className="card" style={{ marginTop: '20px', border: '1px solid #f38020', background: 'rgba(243, 128, 32, 0.05)' }}>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <Globe size={24} color="#f38020" />
                        <div>
                            <div style={{ fontWeight: '700', fontSize: '14px', marginBottom: '4px' }}>Cloudflared not found</div>
                            <p style={{ fontSize: '13px', opacity: 0.8, margin: 0 }}>
                                To expose your local ports to the internet, you need to install `cloudflared`.
                                Run `brew install cloudflared` on your Mac.
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LocalMachineTab;
