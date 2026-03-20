import React from 'react';
import {
    Zap, Activity, ArrowUp, ArrowDown, AlertCircle
} from 'lucide-react';
import {
    AreaChart, Area, XAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';
import DistroIcon from './DistroIcon';
import { formatBytes } from '../utils/format';

const Dashboard = ({
    connections,
    history,
    tunnelStats,
    networkEvents
}) => {
    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', animation: 'fadeIn 0.4s ease-out' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                <h1 style={{ margin: 0, fontSize: '28px', fontWeight: '700' }}>Network Ecosystem</h1>
            </div>

            {/* Charts Section */}
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

            {/* List Section */}
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
                                    <td colSpan={4} style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '14px' }}>
                                        No active tunnels detected
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            {/* <div style={{ marginTop: '24px' }}>
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
            </div> */}
        </div>
    );
};

export const DashboardStatCard = ({ icon, label, value, total }: any) => (
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

export default Dashboard;
