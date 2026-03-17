import React, { useState, useEffect } from 'react';
import { Folder, File, ArrowUp, RefreshCw, AlertCircle } from 'lucide-react';

const FilesTab = ({ currentConn }: any) => {
    const [currentPath, setCurrentPath] = useState('/');
    const [files, setFiles] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingFolder, setLoadingFolder] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const loadDirectory = async (pathObj: string) => {
        if (!currentConn || currentConn.status !== 'connected') return;
        setLoading(true);
        setError(null);
        try {
            const result = await window.electronAPI.sftpReaddir({
                connectionId: currentConn.id,
                path: pathObj
            });
            if (result.success) {
                setFiles(result.list);
                setCurrentPath(pathObj);
            } else {
                setError(result.error);
            }
        } catch (err: any) {
            setError(err.message || 'Failed to read directory');
        } finally {
            setLoading(false);
            setLoadingFolder(null);
        }
    };

    useEffect(() => {
        // Load files when connection acts connected. Don't auto-fetch if we already have files, unless it changed
        if (currentConn && currentConn.status === 'connected' && files.length === 0) {
            loadDirectory(currentPath);
        }
    }, [currentConn?.status]);

    const handleNavigate = (file: any) => {
        if (loading) return; // Prevent multiple clicks while loading

        const isDir = file.longname.startsWith('d');
        if (isDir) {
            if (file.filename === '.' || file.filename === '..') return; // ignore these if they appear
            const separator = currentPath.endsWith('/') ? '' : '/';
            const newPath = `${currentPath}${separator}${file.filename}`;
            setLoadingFolder(file.filename);
            loadDirectory(newPath);
        }
    };

    const handleUp = () => {
        if (currentPath === '/') return;
        const parts = currentPath.split('/').filter(Boolean);
        parts.pop();
        const newPath = '/' + parts.join('/') || '/';
        loadDirectory(newPath);
    };

    return (
        <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <button className="btn btn-secondary" style={{ padding: '6px' }} onClick={handleUp} disabled={currentPath === '/' || loading}>
                    <ArrowUp size={16} />
                </button>
                <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                    <input
                        value={currentPath}
                        readOnly
                        style={{ fontFamily: 'monospace', fontSize: '13px', padding: '6px 10px', width: '100%', boxSizing: 'border-box' }}
                    />
                </div>
                <button className="btn btn-secondary" style={{ padding: '6px' }} onClick={() => loadDirectory(currentPath)} disabled={loading}>
                    <RefreshCw size={16} className={loading ? 'spin' : ''} />
                </button>
            </div>

            {error && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--danger)', fontSize: '13px', marginBottom: '16px' }}>
                    <AlertCircle size={14} />
                    {error}
                </div>
            )}

            <div style={{ flex: 1, overflowY: 'auto' }}>
                {loading && files.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)' }}>Loading...</div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <tbody>
                            {files.filter(f => f.filename !== '.' && f.filename !== '..').map((f, i) => {
                                const isDir = f.longname.startsWith('d');
                                return (
                                    <tr
                                        key={f.filename + i}
                                        onClick={() => handleNavigate(f)}
                                        style={{
                                            cursor: isDir ? 'pointer' : 'default',
                                            borderBottom: '1px solid var(--border-color)',
                                            transition: 'background-color 0.2s'
                                        }}
                                        onMouseEnter={(e) => { if (isDir) e.currentTarget.style.backgroundColor = 'var(--bg-primary)'; }}
                                        onMouseLeave={(e) => { if (isDir) e.currentTarget.style.backgroundColor = 'transparent'; }}
                                    >
                                        <td style={{ padding: '8px 4px', width: '24px' }}>
                                            {loadingFolder === f.filename ? (
                                                <RefreshCw size={16} color="var(--accent)" className="spin" />
                                            ) : isDir ? (
                                                <Folder size={16} fill="var(--accent)" color="var(--accent)" />
                                            ) : (
                                                <File size={16} color="var(--text-secondary)" />
                                            )}
                                        </td>
                                        <td style={{ padding: '8px 4px' }}>
                                            {f.filename}
                                        </td>
                                        <td style={{ padding: '8px 4px', textAlign: 'right', color: 'var(--text-secondary)', fontSize: '12px' }}>
                                            {!isDir && f.attrs.size ? `${(f.attrs.size / 1024).toFixed(1)} KB` : ''}
                                        </td>
                                    </tr>
                                );
                            })}
                            {files.length === 0 && !loading && !error && (
                                <tr>
                                    <td colSpan={3} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)' }}>Empty directory</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default FilesTab;
