import React from 'react';
import { Database, Plus } from 'lucide-react';

const EmptyState = ({ onAdd }) => {
    return (
        <div className="empty-state" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: 'var(--bg-secondary)', padding: '20px', borderRadius: '50%', marginBottom: '16px' }}>
                <Database size={48} strokeWidth={1} />
            </div>
            <h2>Welcome to Reverso</h2>
            <p style={{ maxWidth: '300px', marginTop: '8px', color: 'var(--text-secondary)' }}>Select a connection or add a new one to start tunneling.</p>
            <button className="btn btn-primary" style={{ marginTop: '24px', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={onAdd}>
                <Plus size={16} /> New Connection
            </button>
        </div>
    );
};

export default EmptyState;
