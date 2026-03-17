import React from 'react';
import { Database, Plus } from 'lucide-react';

const EmptyState = ({ onAddConnection }) => {
    return (
        <div className="empty-state">
            <div style={{ background: 'var(--bg-secondary)', padding: '20px', borderRadius: '50%', marginBottom: '16px' }}>
                <Database size={48} strokeWidth={1} />
            </div>
            <h2>Welcome to Reverso</h2>
            <p style={{ maxWidth: '300px', marginTop: '8px' }}>Select a connection or add a new one to start tunneling.</p>
            <button className="btn btn-primary" style={{ marginTop: '24px' }} onClick={onAddConnection}>
                <Plus size={16} /> New Connection
            </button>
        </div>
    );
};

export default EmptyState;
