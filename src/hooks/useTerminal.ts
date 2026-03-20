import { useState } from 'react';

export const useTerminal = () => {
    const [terminalSessions, setTerminalSessions] = useState({});

    const addTerminalTab = (connId) => {
        const shellId = `shell-${Date.now()}`;
        setTerminalSessions(prev => {
            const connSessions = prev[connId] || { tabs: [], activeId: null };
            const newTabs = [...connSessions.tabs, { id: shellId, title: `Terminal ${connSessions.tabs.length + 1}` }];
            return {
                ...prev,
                [connId]: { tabs: newTabs, activeId: shellId }
            };
        });
    };

    const removeTerminalTab = (connId, shellId) => {
        setTerminalSessions(prev => {
            const connSessions = prev[connId];
            if (!connSessions) return prev;
            const newTabs = connSessions.tabs.filter(t => t.id !== shellId);
            let nextActiveId = connSessions.activeId;
            if (shellId === connSessions.activeId) {
                nextActiveId = newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null;
            }
            window.electronAPI.closeShell({ connectionId: connId, shellId });
            return {
                ...prev,
                [connId]: { tabs: newTabs, activeId: nextActiveId }
            };
        });
    };

    const switchTerminalTab = (connId, shellId) => {
        setTerminalSessions(prev => ({
            ...prev,
            [connId]: { ...(prev[connId] || {}), activeId: shellId }
        }));
    };

    return {
        terminalSessions,
        setTerminalSessions,
        addTerminalTab,
        removeTerminalTab,
        switchTerminalTab
    };
};
