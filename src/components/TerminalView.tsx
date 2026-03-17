import React, { useRef, useEffect } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

export default function TerminalView({ connectionId, shellId, active }) {
    const terminalRef = useRef(null);
    const xtermRef = useRef(null);
    const fitAddonRef = useRef(new FitAddon());

    useEffect(() => {
        if (!terminalRef.current) return;

        const term = new Terminal({
            cursorBlink: true,
            fontSize: 13,
            fontFamily: 'Menlo, Monaco, "Courier New", monospace',
            theme: {
                background: '#1c1c1e',
                foreground: '#f5f5f7',
            },
        });

        term.loadAddon(fitAddonRef.current);
        term.open(terminalRef.current);

        // Initial fit and sync
        setTimeout(() => {
            if (terminalRef.current) {
                fitAddonRef.current.fit();
                window.electronAPI.resizeShell({
                    connectionId,
                    shellId,
                    rows: term.rows,
                    cols: term.cols
                });
            }
        }, 50);

        xtermRef.current = term;

        term.onData(data => {
            window.electronAPI.sendShellData({ connectionId, shellId, data });
        });

        term.onResize(({ cols, rows }) => {
            window.electronAPI.resizeShell({ connectionId, shellId, rows, cols });
        });

        const handleData = (payload) => {
            if (payload.shellId === shellId) {
                term.write(payload.data);
            }
        };

        const removeShellDataListener = window.electronAPI.onShellData(handleData);
        window.electronAPI.startShell({ connectionId, shellId });

        const handleResize = () => {
            if (active) {
                fitAddonRef.current.fit();
            }
        };

        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            if (removeShellDataListener) removeShellDataListener();
            term.dispose();
        };
    }, [connectionId, shellId]);

    useEffect(() => {
        if (active && xtermRef.current) {
            // Re-fit when tab becomes active
            setTimeout(() => {
                if (terminalRef.current) {
                    fitAddonRef.current.fit();
                    window.electronAPI.resizeShell({
                        connectionId,
                        shellId,
                        rows: xtermRef.current.rows,
                        cols: xtermRef.current.cols
                    });
                }
            }, 50);
        }
    }, [active, shellId]);

    return (
        <div
            ref={terminalRef}
            style={{
                flex: 1,
                backgroundColor: '#1c1c1e',
                borderRadius: '8px',
                padding: '8px',
                overflow: 'hidden'
            }}
        />
    );
}
