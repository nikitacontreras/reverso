import React from 'react';
import { ToggleRight, ToggleLeft } from 'lucide-react';

const PreferencesWindow = ({
    runAtStartup,
    toggleStartup,
    maxRetries,
    setMaxRetries,
    persistTerminal,
    setPersistTerminal
}) => {
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
            </div>
        </div>
    );
};

export default PreferencesWindow;
