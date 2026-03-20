import React, { useState, useRef, useEffect } from 'react';
import { Download, Upload, Check, Lock, X } from 'lucide-react';

export const ExportImportModal = ({ title, connections, onConfirm, onCancel, requirePassword, actionLabel }) => {
    // Lazy initialize selectedIds to avoid re-calculation on every render
    const [selectedIds, setSelectedIds] = useState(() => connections.map(c => c.id));
    const [password, setPassword] = useState('');

    const toggleId = (id) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    return (
        <div
            style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 3000, backdropFilter: 'blur(8px)'
            }}
            onClick={onCancel}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
        >
            <div
                className="card"
                style={{ width: '420px', padding: '24px', border: '1px solid var(--border-color)', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}
                onClick={e => e.stopPropagation()}
            >
                <h4 id="modal-title" style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {actionLabel === 'Export' ? <Download size={18} /> : <Upload size={18} />} {title}
                </h4>

                <div
                    style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '24px', paddingRight: '4px' }}
                    role="group"
                    aria-label="Selection list"
                >
                    {connections.map(c => (
                        <div
                            key={c.id}
                            onClick={() => toggleId(c.id)}
                            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggleId(c.id)}
                            tabIndex={0}
                            role="checkbox"
                            aria-checked={selectedIds.includes(c.id)}
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
                        <label
                            htmlFor="export-password"
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase' }}
                        >
                            <Lock size={12} /> Master Encryption Password
                        </label>
                        <input
                            id="export-password"
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

export const GroupModal = ({ title, initialData, onConfirm, onCancel, iconMap, colors }) => {
    const [name, setName] = useState(initialData.name);
    const [selectedIcon, setSelectedIcon] = useState(initialData.icon);
    const [selectedColor, setSelectedColor] = useState(initialData.color);
    const inputRef = useRef(null);

    useEffect(() => {
        if (inputRef.current) inputRef.current.focus();
    }, []);

    return (
        <div
            style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 2000, backdropFilter: 'blur(4px)'
            }}
            onClick={onCancel}
            role="dialog"
            aria-modal="true"
            aria-labelledby="group-modal-title"
        >
            <div
                className="card"
                style={{ width: '380px', padding: '24px', border: '1px solid var(--border-color)', boxShadow: '0 20px 40px rgba(0,0,0,0.4)' }}
                onClick={e => e.stopPropagation()}
            >
                <h4 id="group-modal-title" style={{ fontSize: '16px', fontWeight: '600', marginBottom: '20px' }}>{title}</h4>

                <div style={{ marginBottom: '20px' }}>
                    <label
                        htmlFor="group-name"
                        style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase' }}
                    >
                        Name
                    </label>
                    <input
                        id="group-name"
                        ref={inputRef}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Group Name"
                    />
                </div>

                <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase' }}>Icon & Color</label>
                    <div
                        style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px', marginBottom: '20px' }}
                        role="radiogroup"
                        aria-label="Select icon"
                    >
                        {Object.entries(iconMap).map(([key, IconComp]) => {
                            const TypedIcon = IconComp as any;
                            return (
                                <div
                                    key={key}
                                    onClick={() => setSelectedIcon(key)}
                                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setSelectedIcon(key)}
                                    tabIndex={0}
                                    role="radio"
                                    aria-checked={selectedIcon === key}
                                    style={{
                                        height: '36px',
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        backgroundColor: selectedIcon === key ? 'var(--bg-primary)' : 'rgba(255,255,255,0.03)',
                                        border: `1px solid ${selectedIcon === key ? 'var(--accent)' : 'transparent'}`,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        transition: 'background-color 0.15s, border-color 0.15s, box-shadow 0.15s',
                                        boxShadow: selectedIcon === key ? '0 0 0 3px rgba(10, 132, 255, 0.2)' : 'none'
                                    }}
                                >
                                    {TypedIcon && <TypedIcon size={18} color={selectedIcon === key ? selectedColor : 'var(--text-secondary)'} style={{ opacity: selectedIcon === key ? 1 : 0.6 }} />}
                                </div>
                            );
                        })}
                    </div>
                    <div
                        style={{ display: 'flex', gap: '6px' }}
                        role="radiogroup"
                        aria-label="Select color"
                    >
                        {colors.map(c => (
                            <div
                                key={c.value}
                                onClick={() => setSelectedColor(c.value)}
                                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setSelectedColor(c.value)}
                                tabIndex={0}
                                role="radio"
                                aria-checked={selectedColor === c.value}
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
