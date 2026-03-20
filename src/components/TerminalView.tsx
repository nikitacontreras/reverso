import React, { useRef, useEffect } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Plus, X, Command } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';

function XTermInstance({ connectionId, shellId, active }) {
    const terminalRef = useRef(null);
    const xtermRef = useRef(null);
    const fitAddonRef = useRef(new FitAddon());

    useEffect(() => {
        if (!terminalRef.current) return;

        const term = new Terminal({
            cursorBlink: true,
            cursorStyle: 'bar',
            macOptionIsMeta: true,
            fontSize: 13,
            fontFamily: 'Menlo, Monaco, "Courier New", monospace',
            theme: {
                background: '#1c1c1e',
                foreground: '#f5f5f7',
                selectionBackground: 'rgba(255, 255, 255, 0.15)',
            },
            allowProposedApi: true,
            scrollback: 10000,
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(terminalRef.current);

        xtermRef.current = term;
        fitAddonRef.current = fitAddon;

        let resizeTimeout;
        const performFit = () => {
            if (terminalRef.current && active) {
                try {
                    fitAddon.fit();
                    clearTimeout(resizeTimeout);
                    resizeTimeout = setTimeout(() => {
                        window.electronAPI.resizeShell({
                            connectionId,
                            shellId,
                            rows: term.rows,
                            cols: term.cols
                        });
                    }, 100);
                } catch (e) { }
            }
        };

        const resizeObserver = new ResizeObserver(() => {
            requestAnimationFrame(performFit);
        });

        if (terminalRef.current) {
            resizeObserver.observe(terminalRef.current);
        }

        term.onData(data => {
            window.electronAPI.sendShellData({ connectionId, shellId, data });
        });

        const handleData = (event) => {
            if (event.shellId === shellId) {
                term.write(event.data);
            }
        };

        const removeListener = window.electronAPI.onShellData(handleData);

        window.electronAPI.startShell({
            connectionId,
            shellId,
            rows: term.rows || 25,
            cols: term.cols || 80
        });

        return () => {
            clearTimeout(resizeTimeout);
            resizeObserver.disconnect();
            if (removeListener) removeListener();
            term.dispose();
        };
    }, [connectionId, shellId]);

    useEffect(() => {
        if (active && xtermRef.current) {
            xtermRef.current.focus();
            setTimeout(() => {
                try { fitAddonRef.current.fit(); } catch (e) { }
            }, 50);
        }
    }, [active]);

    return (
        <div
            ref={terminalRef}
            style={{
                flex: 1,
                display: active ? 'block' : 'none',
                height: '100%',
                padding: '8px',
                backgroundColor: '#1c1c1e'
            }}
        />
    );
}

const EMPTY_ALIASES: any[] = [];

export default function TerminalView({ connection, session, onAddTab, onRemoveTab, onSwitchTab, aliases = EMPTY_ALIASES }) {
    if (!session || session.tabs.length === 0) return null;

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#1c1c1e', overflow: 'hidden' }}>
            {/* Terminal Tabs Bar */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                padding: '4px 8px',
                background: '#2c2c2e',
                borderBottom: '1px solid #3a3a3c',
                gap: '4px'
            }}>
                {session.tabs.map((tab, idx) => (
                    <div
                        key={tab.id}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                onSwitchTab(tab.id);
                            } else if (e.key === 'Backspace' || e.key === 'Delete') {
                                onRemoveTab(tab.id);
                            }
                        }}
                        onClick={() => onSwitchTab(tab.id)}
                        style={{
                            padding: '6px 12px',
                            borderRadius: '6px 6px 0 0',
                            backgroundColor: session.activeId === tab.id ? '#1c1c1e' : 'transparent',
                            color: session.activeId === tab.id ? '#fff' : '#8e8e93',
                            fontSize: '11px',
                            fontWeight: 500,
                            display: 'flex',
                            alignItems: 'center',
                            cursor: 'pointer',
                            gap: '8px',
                            border: 'none',
                            outline: 'none',
                            transition: 'background-color 0.2s, color 0.2s',
                        }}
                    >
                        cursor: 'pointer',
                        borderStyle: 'solid',
                        borderWidth: '1px 1px 0 1px',
                        borderColor: session.activeId === tab.id ? '#3a3a3c' : 'transparent',
                        userSelect: 'none'
                        }}
                    >
                        <span>Terminal {idx + 1}</span>
                        <X
                            size={12}
                            style={{ opacity: 0.5 }}
                            onClick={(e) => { e.stopPropagation(); onRemoveTab(tab.id); }}
                        />
                    </div>
                ))}
                <button
                    onClick={onAddTab}
                    className="btn-icon"
                    style={{ padding: '4px', marginLeft: '4px' }}
                >
                    <Plus size={14} />
                </button>
            </div>

            {/* Terminal Viewports */}
            <div style={{ flex: 1, position: 'relative', backgroundColor: '#1c1c1e' }}>
                {session.tabs.map(tab => (
                    <div
                        key={tab.id}
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            display: session.activeId === tab.id ? 'flex' : 'none',
                            flexDirection: 'column'
                        }}
                    >
                        <XTermInstance
                            connectionId={connection.id}
                            shellId={tab.id}
                            active={session.activeId === tab.id}
                        />
                    </div>
                ))}
            </div>

            {/* Quick Command Bar (Optional) */}
            {aliases.length > 0 && (
                <div style={{
                    padding: '8px 12px',
                    background: '#1c1c1e',
                    borderTop: '1px solid #3a3a3c',
                    display: 'flex',
                    gap: '8px',
                    overflowX: 'auto'
                }}>
                    <Command size={14} style={{ color: 'var(--text-secondary)' }} />
                    {aliases.map(alias => (
                        <button
                            key={alias.id}
                            onClick={() => window.electronAPI.sendShellData({
                                connectionId: connection.id,
                                shellId: session.activeId,
                                data: alias.command + '\n'
                            })}
                            style={{
                                fontSize: '10px',
                                padding: '2px 8px',
                                borderRadius: '4px',
                                background: '#2c2c2e',
                                border: '1px solid #3a3a3c',
                                color: '#a1a1a6',
                                whiteSpace: 'nowrap'
                            }}
                        >
                            {alias.name}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
