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

        // Force a fit on connection
        const performFit = () => {
            if (terminalRef.current && active) {
                try {
                    fitAddon.fit();
                    window.electronAPI.resizeShell({
                        connectionId,
                        shellId,
                        rows: term.rows,
                        cols: term.cols
                    });
                } catch (e) {
                    console.warn('Fit failed', e);
                }
            }
        };

        // Efficient resize observer
        const resizeObserver = new ResizeObserver(() => {
            requestAnimationFrame(performFit);
        });

        if (terminalRef.current) {
            resizeObserver.observe(terminalRef.current);
        }

        term.onData(data => {
            window.electronAPI.sendShellData({ connectionId, shellId, data });
        });

        const handleData = (payload) => {
            if (payload.shellId === shellId) {
                term.write(payload.data);
            }
        };

        const removeShellDataListener = window.electronAPI.onShellData(handleData);
        window.electronAPI.startShell({ connectionId, shellId });

        return () => {
            resizeObserver.disconnect();
            if (removeShellDataListener) removeShellDataListener();
            term.dispose();
        };
    }, [connectionId, shellId]); // Removed 'active' from deps because ResizeObserver handles it

    useEffect(() => {
        if (active && xtermRef.current && fitAddonRef.current) {
            // Re-fit when tab becomes active (switching tabs)
            setTimeout(() => {
                fitAddonRef.current.fit();
                window.electronAPI.resizeShell({
                    connectionId,
                    shellId,
                    rows: xtermRef.current.rows,
                    cols: xtermRef.current.cols
                });
            }, 50);
        }
    }, [active]);

    return (
        <div style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: '#1c1c1e', minHeight: 0 }}>
            <div
                ref={terminalRef}
                style={{
                    flex: 1,
                    width: '100%',
                    height: '100%',
                    padding: '8px',
                    overflow: 'hidden'
                }}
            />
        </div>
    );
}
