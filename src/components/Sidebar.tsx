import React, { useState, useEffect, useRef } from 'react';
import {
    Plus, Settings, Trash2, Folder, ChevronRight, ChevronDown,
    MoreVertical, Edit2, Play, Power, FolderPlus, Loader,
    Shapes, Code, Database, Globe, Cpu, Cloud, Terminal, Layers,
    Zap, Anchor, Shield, Star, Search, LayoutDashboard, Activity,
    Download, Upload, Check, ChevronLeft, Lock
} from 'lucide-react';
import DistroIcon from './DistroIcon';

const Sidebar = ({
    connections,
    selectedConnection,
    isAddingConnection,
    isPreferencesOpen,
    onAddConnection,
    onSelectConnection,
    onDeleteConnection,
    onOpenPreferences,
    onOpenDashboard,
    groups,
    onUpdateGroups,
    onReorderConnections,
    onConnect,
    onDisconnect,
    onEdit,
    onConnectAll,
    isDashboardOpen
}) => {
    const [search, setSearch] = useState('');
    const [contextMenu, setContextMenu] = useState(null); // { x, y, type, id }
    const [groupModalData, setGroupModalData] = useState(null); // { title, name, icon, color, onConfirm }
    const [exportModal, setExportModal] = useState(null); // { connections, onConfirm }
    const [importModal, setImportModal] = useState(null); // { data, onConfirm }
    const sidebarRef = useRef(null);

    const iconMap = {
        folder: Folder,
        code: Code,
        shapes: Shapes,
        database: Database,
        globe: Globe,
        cpu: Cpu,
        cloud: Cloud,
        terminal: Terminal,
        layers: Layers,
        zap: Zap,
        anchor: Anchor,
        shield: Shield,
        star: Star
    };

    const colors = [
        { name: 'Gray', value: '#8e8e93' },
        { name: 'Blue', value: '#0a84ff' },
        { name: 'Indigo', value: '#5e5ce6' },
        { name: 'Purple', value: '#bf5af2' },
        { name: 'Pink', value: '#ff375f' },
        { name: 'Orange', value: '#ff9f0a' },
        { name: 'Green', value: '#32d74b' },
        { name: 'Teal', value: '#64d2ff' }
    ];

    const toggleGroup = (id) => {
        onUpdateGroups(groups.map(g => g.id === id ? { ...g, expanded: !g.expanded } : g));
    };

    const handleContextMenu = (e, type, id) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, type, id });
    };

    useEffect(() => {
        const handleClick = () => setContextMenu(null);
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, []);

    // DnD
    const [dragOverId, setDragOverId] = useState(null);

    const handleDragStart = (e, type, id) => {
        e.dataTransfer.setData('type', type);
        e.dataTransfer.setData('id', id);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDrop = (e, targetGroupId = null, targetConnId = null) => {
        e.preventDefault();
        setDragOverId(null);
        const type = e.dataTransfer.getData('type');
        const id = e.dataTransfer.getData('id');

        if (type === 'connection' && id !== targetConnId) {
            // 1. Reorder the main connections array
            let newConnections = [...connections];
            const draggedIndex = newConnections.findIndex(c => c.id === id);

            if (draggedIndex !== -1) {
                const [draggedConn] = newConnections.splice(draggedIndex, 1);

                if (targetConnId) {
                    // Reorder before target connection
                    const targetIndex = newConnections.findIndex(c => c.id === targetConnId);
                    newConnections.splice(targetIndex, 0, draggedConn);
                } else if (!targetGroupId) {
                    // Drop at the bottom of the list (when dropped in sidebar empty space)
                    newConnections.push(draggedConn);
                } else {
                    // Drop into a group: keep its relative order in the main list
                    // or we could just put it back where it was, but let's just 
                    // put it back in the list so it's not lost.
                    newConnections.splice(draggedIndex, 0, draggedConn);
                }
            }

            // 2. Update group membership
            let newGroups = groups.map(g => ({
                ...g,
                connectionIds: g.connectionIds.filter(cid => cid !== id)
            }));

            if (targetGroupId) {
                newGroups = newGroups.map(g => {
                    if (g.id === targetGroupId) {
                        return { ...g, connectionIds: [...g.connectionIds, id] };
                    }
                    return g;
                });
            }

            onReorderConnections(newConnections);
            onUpdateGroups(newGroups);
        }
    };

    const handleDragOver = (e, targetId = null) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (targetId !== dragOverId) {
            setDragOverId(targetId);
        }
    };

    const handleDragLeave = () => {
        setDragOverId(null);
    };

    const addGroup = () => {
        setGroupModalData({
            title: 'New Group',
            name: '',
            icon: 'folder',
            color: colors[0].value,
            onConfirm: (data) => {
                onUpdateGroups([...groups, {
                    id: `group-${Date.now()}`,
                    name: data.name,
                    icon: data.icon,
                    color: data.color,
                    connectionIds: [],
                    expanded: true
                }]);
                setGroupModalData(null);
            }
        });
    };

    const deleteGroup = (id) => {
        if (window.confirm('Delete group? (Connections will be moved out)')) {
            onUpdateGroups(groups.filter(g => g.id !== id));
            setContextMenu(null);
        }
    };

    const editGroup = (id) => {
        const group = groups.find(g => g.id === id);
        setGroupModalData({
            title: 'Edit Group',
            name: group.name,
            icon: group.icon || 'folder',
            color: group.color || colors[0].value,
            onConfirm: (data) => {
                onUpdateGroups(groups.map(g => g.id === id ? {
                    ...g,
                    name: data.name,
                    icon: data.icon,
                    color: data.color
                } : g));
                setGroupModalData(null);
            }
        });
        setContextMenu(null);
    };

    const handleExport = () => {
        setExportModal({ connections: connections.map(c => ({ ...c, selected: true })) });
    };

    const handleImport = async () => {
        try {
            const data = await window.electronAPI.configImportPickFile();
            if (data) {
                setImportModal({
                    data,
                    connections: data.connections.map(c => ({ ...c, selected: true }))
                });
            }
        } catch (err) {
            alert(err.message);
        }
    };

    const filteredConnections = connections.filter(c =>
        c.name?.toLowerCase().includes(search.toLowerCase()) ||
        c.host?.toLowerCase().includes(search.toLowerCase()) ||
        c.username?.toLowerCase().includes(search.toLowerCase())
    );

    const filteredGroups = groups.map(g => ({
        ...g,
        filteredConnectionIds: g.connectionIds.filter(cid => {
            const c = connections.find(conn => conn.id === cid);
            return c && (
                c.name?.toLowerCase().includes(search.toLowerCase()) ||
                c.host?.toLowerCase().includes(search.toLowerCase()) ||
                c.username?.toLowerCase().includes(search.toLowerCase())
            );
        })
    })).filter(g => g.name.toLowerCase().includes(search.toLowerCase()) || g.filteredConnectionIds.length > 0);

    const ungroupedConnections = filteredConnections.filter(c => !new Set(groups.flatMap(g => g.connectionIds)).has(c.id));

    const renderConnection = (conn) => (
        <div
            key={conn.id}
            draggable
            onDragStart={(e) => handleDragStart(e, 'connection', conn.id)}
            onDragOver={(e) => handleDragOver(e, conn.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => { e.stopPropagation(); handleDrop(e, null, conn.id); }}
            onContextMenu={(e) => handleContextMenu(e, 'connection', conn.id)}
            onClick={() => onSelectConnection(conn.id)}
            style={{
                padding: '8px 10px',
                borderRadius: '6px',
                marginBottom: '2px',
                cursor: 'pointer',
                backgroundColor: selectedConnection === conn.id && !isPreferencesOpen ? 'var(--bg-primary)' : 'transparent',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                position: 'relative',
                transition: 'all 0.1s',
                borderTop: dragOverId === conn.id ? '2px solid var(--accent)' : '2px solid transparent'
            }}
            className="sidebar-item"
        >
            {conn.status === 'connecting' ? (
                <div style={{ width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Loader size={16} className="spin" color="var(--accent)" />
                </div>
            ) : (
                <DistroIcon distro={conn.distro} size={20} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={conn.name || conn.host}>{conn.name || conn.host}</span>
                    <div style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        backgroundColor: conn.status === 'connected' ? 'var(--success)' : (conn.status === 'connecting' ? '#ff9500' : 'transparent'),
                        flexShrink: 0
                    }} />
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{conn.username}@{conn.host}</div>
            </div>
            <MoreVertical size={14} style={{ opacity: 0.4 }} onClick={(e) => { e.stopPropagation(); handleContextMenu(e, 'connection', conn.id); }} />
        </div>
    );

    return (
        <aside className="sidebar" ref={sidebarRef} onDrop={(e) => handleDrop(e)} onDragOver={handleDragOver}>
            <div style={{ position: 'relative', marginBottom: '16px' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} />
                <input
                    placeholder="Search connections..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{
                        paddingLeft: '32px',
                        fontSize: '12px',
                        height: '32px',
                        backgroundColor: 'rgba(255,255,255,0.02)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '6px'
                    }}
                />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>CONNECTIONS</h3>
                <div style={{ display: 'flex', gap: '4px' }}>
                    <button className="btn btn-secondary" style={{ padding: '4px', border: 'none' }} onClick={handleImport} title="Import Config">
                        <Upload size={16} />
                    </button>
                    <button className="btn btn-secondary" style={{ padding: '4px', border: 'none' }} onClick={handleExport} title="Export Config">
                        <Download size={16} />
                    </button>
                    <div style={{ width: '4px' }} />
                    <button className="btn btn-secondary" style={{ padding: '4px', border: 'none' }} onClick={addGroup} title="Add Group">
                        <FolderPlus size={16} />
                    </button>
                    <button className="btn btn-secondary" style={{ padding: '4px', border: 'none' }} onClick={onAddConnection} title="Add Connection">
                        <Plus size={16} />
                    </button>
                </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', margin: '0 -4px', padding: '0 4px' }}>
                {filteredGroups.map(group => (
                    <div key={group.id} style={{ marginBottom: '4px' }}>
                        <div
                            onDrop={(e) => { e.stopPropagation(); handleDrop(e, group.id); }}
                            onDragOver={(e) => handleDragOver(e, group.id)}
                            onContextMenu={(e) => handleContextMenu(e, 'group', group.id)}
                            onClick={() => toggleGroup(group.id)}
                            style={{
                                padding: '6px 8px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                cursor: 'pointer',
                                borderRadius: '6px',
                                transition: 'background 0.1s',
                                border: dragOverId === group.id ? '2px solid var(--accent)' : '2px solid transparent'
                            }}
                            className="group-header"
                        >
                            {group.expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            {(() => {
                                const IconComp = iconMap[group.icon || 'folder'] || Folder;
                                return <IconComp size={18} fill={group.color || 'var(--text-secondary)'} color={group.color || 'var(--text-secondary)'} style={{ opacity: 1 }} />;
                            })()}
                            <span style={{
                                flex: 1,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                fontWeight: '500',
                                fontSize: '13px',
                                marginLeft: '2px'
                            }}>{group.name}</span>
                            <span style={{ fontSize: '10px', color: 'var(--text-secondary)', opacity: 0.5 }}>{group.filteredConnectionIds.length}</span>
                        </div>
                        {group.expanded && (
                            <div style={{ marginLeft: '24px', position: 'relative' }}>
                                <div style={{
                                    position: 'absolute',
                                    left: '-12px',
                                    top: 0,
                                    bottom: 0,
                                    width: '1px',
                                    backgroundColor: 'var(--border-color)',
                                    opacity: 0.3
                                }} />
                                {group.filteredConnectionIds.map(cid => {
                                    const conn = connections.find(c => c.id === cid);
                                    return conn ? renderConnection(conn) : null;
                                })}
                                {group.filteredConnectionIds.length === 0 && (
                                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)', padding: '8px', textAlign: 'center' }}>No matching connections</div>
                                )}
                            </div>
                        )}
                    </div>
                ))}

                {ungroupedConnections.map(renderConnection)}

                {connections.length === 0 && !isAddingConnection && (
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'center', marginTop: '40px' }}>
                        No saved connections
                    </div>
                )}
            </div>

            <div style={{ paddingTop: '16px', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <button
                    className="btn btn-secondary"
                    style={{
                        width: '100%',
                        justifyContent: 'flex-start',
                        backgroundColor: isDashboardOpen ? 'rgba(10, 132, 255, 0.1)' : 'transparent',
                        borderColor: isDashboardOpen ? 'var(--accent)' : 'transparent',
                        color: isDashboardOpen ? 'var(--accent)' : 'var(--text-primary)',
                        gap: '12px',
                        border: '1px solid transparent'
                    }}
                    onClick={onOpenDashboard}
                >
                    <Activity size={16} /> Active Tunnels
                </button>
                <button
                    className="btn btn-secondary"
                    style={{
                        width: '100%',
                        justifyContent: 'flex-start',
                        backgroundColor: isPreferencesOpen ? 'rgba(255,255,255,0.05)' : 'transparent',
                        borderColor: 'transparent',
                        gap: '12px',
                        border: '1px solid transparent'
                    }}
                    onClick={onOpenPreferences}
                >
                    <Settings size={16} /> Preferences
                </button>
            </div>

            {contextMenu && (
                <div
                    style={{
                        position: 'fixed',
                        top: contextMenu.y,
                        left: contextMenu.x,
                        backgroundColor: 'var(--card-bg)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                        padding: '4px',
                        zIndex: 1000,
                        minWidth: '160px'
                    }}
                >
                    {contextMenu.type === 'connection' && (
                        <>
                            <ContextItem icon={<Play size={14} />} label="Connect" onClick={() => { onConnect(contextMenu.id); setContextMenu(null); }} />
                            <ContextItem icon={<Power size={14} />} label="Disconnect" onClick={() => { onDisconnect(contextMenu.id); setContextMenu(null); }} destructive />
                            <div style={{ height: '1px', backgroundColor: 'var(--border-color)', margin: '4px 0' }} />
                            <ContextItem icon={<Edit2 size={14} />} label="Edit" onClick={() => { onSelectConnection(contextMenu.id); onEdit(); setContextMenu(null); }} />
                            <ContextItem icon={<Trash2 size={14} />} label="Delete" onClick={(e) => { onDeleteConnection(contextMenu.id, e); setContextMenu(null); }} destructive />
                        </>
                    )}
                    {contextMenu.type === 'group' && (
                        <>
                            <ContextItem icon={<Play size={14} />} label="Connect All" onClick={() => { onConnectAll(contextMenu.id); setContextMenu(null); }} />
                            <div style={{ height: '1px', backgroundColor: 'var(--border-color)', margin: '4px 0' }} />
                            <ContextItem icon={<Edit2 size={14} />} label="Customize" onClick={() => editGroup(contextMenu.id)} />
                            <ContextItem icon={<Trash2 size={14} />} label="Delete Group" onClick={() => deleteGroup(contextMenu.id)} destructive />
                        </>
                    )}
                </div>
            )}

            {exportModal && (
                <ExportImportModal
                    title="Export Connections"
                    connections={exportModal.connections}
                    onConfirm={async (selectedIds, password) => {
                        const res = await window.electronAPI.configExport({ connectionIds: selectedIds, password });
                        if (res.success) alert('Exported successfully!');
                        else if (res.error !== 'Cancelled') alert('Export failed: ' + res.error);
                        setExportModal(null);
                    }}
                    onCancel={() => setExportModal(null)}
                    requirePassword={true}
                    actionLabel="Export"
                />
            )}

            {importModal && (
                <ExportImportModal
                    title="Import Connections"
                    connections={importModal.connections}
                    onConfirm={async (selectedIds, password) => {
                        const res = await window.electronAPI.configImportExecute({
                            data: importModal.data,
                            password,
                            connectionIds: selectedIds
                        });
                        if (res.success) {
                            // Merge new connections and groups
                            const newConns = [...connections];
                            res.decryptedConnections.forEach(c => {
                                if (!newConns.find(nc => nc.id === c.id)) newConns.push(c);
                            });
                            onReorderConnections(newConns);

                            // Merge groups
                            if (res.groups) {
                                const newGroups = [...groups];
                                res.groups.forEach(g => {
                                    if (!newGroups.find(ng => ng.id === g.id)) newGroups.push(g);
                                });
                                onUpdateGroups(newGroups);
                            }
                            alert('Imported successfully!');
                        } else {
                            alert('Import failed: ' + res.error);
                        }
                        setImportModal(null);
                    }}
                    onCancel={() => setImportModal(null)}
                    requirePassword={importModal.data.connections.some(c => c.isEncrypted)}
                    actionLabel="Import"
                />
            )}
        </aside>
    );
};

const ExportImportModal = ({ title, connections, onConfirm, onCancel, requirePassword, actionLabel }) => {
    const [selectedIds, setSelectedIds] = useState(connections.map(c => c.id));
    const [password, setPassword] = useState('');

    const toggleId = (id) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 3000, backdropFilter: 'blur(8px)'
        }}>
            <div className="card" style={{ width: '420px', padding: '24px', border: '1px solid var(--border-color)', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
                <h4 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {actionLabel === 'Export' ? <Download size={18} /> : <Upload size={18} />} {title}
                </h4>

                <div style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '24px', paddingRight: '4px' }}>
                    {connections.map(c => (
                        <div
                            key={c.id}
                            onClick={() => toggleId(c.id)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '12px', padding: '10px',
                                borderRadius: '8px', cursor: 'pointer', marginBottom: '4px',
                                backgroundColor: selectedIds.includes(c.id) ? 'rgba(10, 132, 255, 0.1)' : 'transparent',
                                border: `1px solid ${selectedIds.includes(c.id) ? 'var(--accent)' : 'transparent'}`
                            }}
                        >
                            <div style={{
                                width: '18px', height: '18px', borderRadius: '4px',
                                border: '1px solid var(--border-color)',
                                backgroundColor: selectedIds.includes(c.id) ? 'var(--accent)' : 'transparent',
                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}>
                                {selectedIds.includes(c.id) && <Check size={14} color="white" />}
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '13px', fontWeight: '500' }}>{c.name || c.host}</div>
                                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{c.username}@{c.host}</div>
                            </div>
                        </div>
                    ))}
                </div>

                {requirePassword && (
                    <div style={{ marginBottom: '24px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase' }}>
                            <Lock size={12} /> Master Encryption Password
                        </label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter password..."
                            style={{ width: '100%' }}
                        />
                        <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '6px', opacity: 0.8 }}>
                            * This password will be used to {actionLabel.toLowerCase()} your SSH credentials securely.
                        </div>
                    </div>
                )}

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                    <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
                    <button
                        className="btn btn-primary"
                        disabled={selectedIds.length === 0 || (requirePassword && !password)}
                        onClick={() => onConfirm(selectedIds, password)}
                    >
                        {actionLabel} {selectedIds.length} items
                    </button>
                </div>
            </div>
        </div>
    );
};

const GroupModal = ({ title, initialData, onConfirm, onCancel, iconMap, colors }) => {
    const [name, setName] = useState(initialData.name);
    const [selectedIcon, setSelectedIcon] = useState(initialData.icon);
    const [selectedColor, setSelectedColor] = useState(initialData.color);
    const inputRef = useRef(null);

    useEffect(() => {
        if (inputRef.current) inputRef.current.focus();
    }, []);

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 2000, backdropFilter: 'blur(4px)'
        }}>
            <div className="card" style={{ width: '380px', padding: '24px', border: '1px solid var(--border-color)', boxShadow: '0 20px 40px rgba(0,0,0,0.4)' }}>
                <h4 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '20px' }}>{title}</h4>

                <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase' }}>Name</label>
                    <input
                        ref={inputRef}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Group Name"
                    />
                </div>

                <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase' }}>Icon & Color</label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px', marginBottom: '20px' }}>
                        {Object.entries(iconMap).map(([key, IconComp]) => (
                            <div
                                key={key}
                                onClick={() => setSelectedIcon(key)}
                                style={{
                                    height: '36px',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    backgroundColor: selectedIcon === key ? 'var(--bg-primary)' : 'rgba(255,255,255,0.03)',
                                    border: `1px solid ${selectedIcon === key ? 'var(--accent)' : 'transparent'}`,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'all 0.15s ease-in-out',
                                    boxShadow: selectedIcon === key ? '0 0 0 3px rgba(10, 132, 255, 0.2)' : 'none'
                                }}
                            >
                                {(() => {
                                    const IconComp = iconMap[key];
                                    return <IconComp size={18} color={selectedIcon === key ? selectedColor : 'var(--text-secondary)'} style={{ opacity: selectedIcon === key ? 1 : 0.6 }} />;
                                })()}
                            </div>
                        ))}
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                        {colors.map(c => (
                            <div
                                key={c.value}
                                onClick={() => setSelectedColor(c.value)}
                                style={{
                                    width: '24px',
                                    height: '24px',
                                    borderRadius: '50%',
                                    backgroundColor: c.value,
                                    cursor: 'pointer',
                                    border: selectedColor === c.value ? '2px solid white' : 'none',
                                    boxShadow: selectedColor === c.value ? '0 0 0 2px ' + c.value : 'none',
                                    transition: 'transform 0.2s',
                                    transform: selectedColor === c.value ? 'scale(1.1)' : 'scale(1)'
                                }}
                                title={c.name}
                            />
                        ))}
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '32px' }}>
                    <button
                        className="btn btn-secondary"
                        style={{ padding: '8px 24px', border: 'none', backgroundColor: 'var(--bg-primary)' }}
                        onClick={onCancel}
                    >
                        Cancel
                    </button>
                    <button
                        className="btn btn-primary"
                        style={{ padding: '8px 32px', filter: 'drop-shadow(0 2px 4px rgba(0, 113, 255, 0.3))' }}
                        onClick={() => onConfirm({ name, icon: selectedIcon, color: selectedColor })}
                    >
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
};

const ContextItem = ({ icon, label, onClick, destructive = false }) => (
    <div
        onClick={(e) => { e.stopPropagation(); onClick(e); }}
        style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '8px 12px',
            fontSize: '13px',
            cursor: 'pointer',
            borderRadius: '4px',
            color: destructive ? 'var(--danger)' : 'var(--text-primary)',
        }}
        className="context-item"
    >
        {icon}
        {label}
    </div>
);

export default Sidebar;
