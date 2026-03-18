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

    const handleAddAlias = (e) => {
        e.preventDefault();
        if (!newAliasName || !newAliasCmd) return;
        setAliases([...aliases, { id: Date.now().toString(), name: newAliasName, command: newAliasCmd }]);
        setNewAliasName('');
        setNewAliasCmd('');
    };

    const handleRemoveAlias = (id) => {
        setAliases(aliases.filter(a => a.id !== id));
    };

    return (
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px', maxWidth: '800px', margin: '0 auto', width: '100%' }}>
            <h2 style={{ fontSize: '24px', fontWeight: '700', margin: '32px 0 24px 0', letterSpacing: '-0.5px' }}>Preferences</h2>

            {/* General Section */}
            <div style={{ marginBottom: '32px' }}>
                <h3 style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: '700', letterSpacing: '0.5px', marginBottom: '8px', marginLeft: '8px' }}>
                    General
                </h3>
                <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '10px', overflow: 'hidden' }}>

                    {/* Startup Toggle */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border-color)' }}>
                        <div>
                            <div style={{ fontSize: '14px', fontWeight: '500' }}>Launch at login</div>
                            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>Automatically start Reverso when you log in.</div>
                        </div>
                        <button
                            onClick={toggleStartup}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}
                        >
                            {runAtStartup ? <ToggleRight size={36} color="var(--success)" strokeWidth={1.5} /> : <ToggleLeft size={36} color="var(--text-secondary)" strokeWidth={1.5} />}
                        </button>
                    </div>

                    {/* Max Retries */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border-color)' }}>
                        <div>
                            <div style={{ fontSize: '14px', fontWeight: '500' }}>Auto-Reconnect Retries</div>
                            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>Number of connection attempts when a drop occurs.</div>
                        </div>
                        <input
                            type="number"
                            style={{ width: '60px', textAlign: 'center', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '6px' }}
                            value={maxRetries}
                            onChange={e => setMaxRetries(parseInt(e.target.value) || 0)}
                        />
                    </div>

                    {/* Persist Terminal */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px' }}>
                        <div>
                            <div style={{ fontSize: '14px', fontWeight: '500' }}>Persist Terminal Session</div>
                            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>Keep terminal active in the background when switching connections.</div>
                        </div>
                        <button
                            onClick={() => setPersistTerminal(!persistTerminal)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}
                        >
                            {persistTerminal ? <ToggleRight size={36} color="var(--success)" strokeWidth={1.5} /> : <ToggleLeft size={36} color="var(--text-secondary)" strokeWidth={1.5} />}
                        </button>
                    </div>

                </div>
            </div>

            {/* Aliases Section */}
            <div style={{ marginBottom: '48px' }}>
                <h3 style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: '700', letterSpacing: '0.5px', marginBottom: '8px', marginLeft: '8px' }}>
                    Global Aliases (Auto-Injected)
                </h3>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px', marginLeft: '8px' }}>
                    These aliases will be injected automatically when you open a terminal in any connected server.
                </div>

                <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '10px', overflow: 'hidden' }}>
                    {aliases.length === 0 ? (
                        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px', borderBottom: '1px solid var(--border-color)' }}>
                            No aliases assigned yet.
                        </div>
                    ) : (
                        aliases.map((alias, index) => (
                            <div key={alias.id} style={{ display: 'flex', alignItems: 'center', padding: '12px 20px', borderBottom: '1px solid var(--border-color)', backgroundColor: index % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                                <div style={{ width: '140px', fontWeight: '600', color: 'var(--accent)', fontSize: '13px' }}>{alias.name}</div>
                                <div style={{ flex: 1, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', fontSize: '12px', color: 'var(--text-secondary)' }}>
                                    {alias.command}
                                </div>
                                <button
                                    onClick={() => handleRemoveAlias(alias.id)}
                                    style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                    title="Delete Alias"
                                >
                                    <Trash2 size={14} color="var(--danger)" />
                                </button>
                            </div>
                        ))
                    )}

                    {/* Add New Alias Form */}
                    <form onSubmit={handleAddAlias} style={{ display: 'flex', gap: '12px', padding: '16px 20px', backgroundColor: 'var(--bg-primary)' }}>
                        <input
                            placeholder="Alias name (e.g. up)"
                            value={newAliasName}
                            onChange={e => setNewAliasName(e.target.value.replace(/\s+/g, ''))}
                            style={{ width: '160px', backgroundColor: 'var(--card-bg)' }}
                        />
                        <input
                            placeholder="Command (e.g. tail -f /var/log/syslog)"
                            value={newAliasCmd}
                            onChange={e => setNewAliasCmd(e.target.value)}
                            style={{ flex: 1, backgroundColor: 'var(--card-bg)' }}
                        />
                        <button type="submit" className="btn btn-primary" style={{ padding: '8px 16px', fontWeight: '600', gap: '6px' }}>
                            <Plus size={16} /> Add
                        </button>
                    </form>
                </div>
            </div>

        </div>
    );
};

export default PreferencesWindow;
