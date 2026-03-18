import React, { useState } from 'react';
import { ToggleRight, ToggleLeft, Plus, Trash2 } from 'lucide-react';

const PreferencesWindow = ({
    runAtStartup,
    toggleStartup,
    maxRetries,
    setMaxRetries,
    persistTerminal,
    setPersistTerminal,
    aliases,
    setAliases
}) => {
    const [newAliasName, setNewAliasName] = useState('');
    const [newAliasCmd, setNewAliasCmd] = useState('');

    const handleAddAlias = () => {
        if (!newAliasName || !newAliasCmd) return;
        setAliases([...aliases, { id: Date.now().toString(), name: newAliasName, command: newAliasCmd }]);
        setNewAliasName('');
        setNewAliasCmd('');
    };

    const handleRemoveAlias = (id) => {
        setAliases(aliases.filter(a => a.id !== id));
    };
    return (
        <div className="card">
            <h2>Preferences</h2>
            <div style={{ marginTop: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0', borderBottom: '1px solid var(--border-color)' }}>
                    <div>
                        <div style={{ fontSize: '14px', fontWeight: '500' }}>Launch at login</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Automatically start Reverso when you log in.</div>
                    </div>
                    <button
                        className="btn"
                        style={{ padding: '4px', backgroundColor: 'transparent', color: runAtStartup ? 'var(--success)' : 'var(--text-secondary)' }}
                        onClick={toggleStartup}
                    >
                        {runAtStartup ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                    </button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0', borderBottom: '1px solid var(--border-color)' }}>
                    <div>
                        <div style={{ fontSize: '14px', fontWeight: '500' }}>Max Auto-Retries</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Number of times to attempt reconnection when dropped.</div>
                    </div>
                    <input
                        type="number"
                        style={{ width: '60px', textAlign: 'center' }}
                        value={maxRetries}
                        onChange={e => setMaxRetries(parseInt(e.target.value) || 0)}
                    />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0', borderBottom: '1px solid var(--border-color)' }}>
                    <div>
                        <div style={{ fontSize: '14px', fontWeight: '500' }}>Persist Terminal Session</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Keep terminal alive when switching tabs.</div>
                    </div>
                    <button
                        className="btn"
                        style={{ padding: '4px', backgroundColor: 'transparent', color: persistTerminal ? 'var(--success)' : 'var(--text-secondary)' }}
                        onClick={() => setPersistTerminal(!persistTerminal)}
                    >
                        {persistTerminal ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                    </button>
                </div>

                <div style={{ padding: '24px 0 16px 0' }}>
                    <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>Global Aliases (Auto-injected)</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px' }}>These aliases will be automatically created when you open a terminal in any connected server.</div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                        {aliases.map(alias => (
                            <div key={alias.id} style={{ display: 'flex', gap: '12px', alignItems: 'center', backgroundColor: 'var(--bg-primary)', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                                <div style={{ fontWeight: '600', width: '120px', color: 'var(--accent)' }}>{alias.name}</div>
                                <div style={{ flex: 1, fontFamily: 'monospace', fontSize: '13px', color: 'var(--text-secondary)' }}>{alias.command}</div>
                                <button className="btn" style={{ padding: '4px', border: 'none', background: 'transparent' }} onClick={() => handleRemoveAlias(alias.id)}>
                                    <Trash2 size={16} color="var(--danger)" />
                                </button>
                            </div>
                        ))}
                        {aliases.length === 0 && <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontStyle: 'italic', padding: '8px' }}>No aliases assigned.</div>}
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                        <input placeholder="Alias (e.g. logs)" value={newAliasName} onChange={e => setNewAliasName(e.target.value.replace(/\s+/g, ''))} style={{ width: '120px' }} />
                        <input placeholder="Command (e.g. tail -f /var/log/syslog)" value={newAliasCmd} onChange={e => setNewAliasCmd(e.target.value)} style={{ flex: 1 }} />
                        <button className="btn btn-primary" onClick={handleAddAlias}>
                            <Plus size={16} /> Add
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PreferencesWindow;
