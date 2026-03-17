import React from 'react';

const ConnectionForm = ({
    isEditing,
    form,
    setForm,
    onSave,
    onCancel
}) => {
    return (
        <div className="card" style={{ margin: 0 }}>
            <h2>{isEditing ? 'Edit Connection' : 'New Connection'}</h2>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '24px' }}>Setup your SSH credentials to start forwarding ports.</p>

            <form onSubmit={onSave}>
                <div className="input-group">
                    <label>Display Name</label>
                    <input placeholder="e.g. My VPS" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: '16px' }}>
                    <div className="input-group">
                        <label>Hostname / IP</label>
                        <input placeholder="10.0.0.2" value={form.host} onChange={e => setForm({ ...form, host: e.target.value })} required />
                    </div>
                    <div className="input-group">
                        <label>SSH Port</label>
                        <input value={form.port} onChange={e => setForm({ ...form, port: e.target.value })} required />
                    </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div className="input-group">
                        <label>Username</label>
                        <input placeholder="root" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} required />
                    </div>
                    <div className="input-group">
                        <label>Password</label>
                        <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required />
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                    <button type="submit" className="btn btn-primary">{isEditing ? 'Save Changes' : 'Save & Connect'}</button>
                    <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
                </div>
            </form>
        </div>
    );
};

export default ConnectionForm;
