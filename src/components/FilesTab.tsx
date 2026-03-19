import React, { useState, useEffect } from 'react';
import { Folder, File, ArrowUp, RefreshCw, AlertCircle, Download } from 'lucide-react';

const FilesTab = ({ currentConn }: any) => {
    const [currentPath, setCurrentPath] = useState('/');
    const [files, setFiles] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingFolder, setLoadingFolder] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [downloadProgress, setDownloadProgress] = useState<{ [key: string]: { transferred: number, total: number } }>({});

    useEffect(() => {
        const removeListener = window.electronAPI.onSftpDownloadProgress((data: any) => {
            if (data.connectionId !== currentConn?.id) return;
            setDownloadProgress(prev => ({
                ...prev,
                [data.remotePath]: { transferred: data.transferred, total: data.total }
            }));
        });
        return () => removeListener();
    }, [currentConn?.id]);

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
        const separator = currentPath.endsWith('/') ? '' : '/';
        const itemPath = `${currentPath}${separator}${file.filename}`;

        if (isDir) {
            if (file.filename === '.' || file.filename === '..') return; // ignore these if they appear
            setLoadingFolder(file.filename);
            loadDirectory(itemPath);
        }
    };

    const handleDownload = async (remotePath: string, filename: string) => {
        // Optimistically set 0% progress to show UI feedback instantly
        setDownloadProgress(prev => ({ ...prev, [remotePath]: { transferred: 0, total: 1 } }));
        try {
            const result = await window.electronAPI.sftpDownload({
                connectionId: currentConn.id,
                remotePath,
                filename
            });
            if (!result.success && !result.cancelled) {
                setError(result.error);
            }
        } catch (err: any) {
            setError(err.message || 'Download failed');
        } finally {
            // Clear progress after short delay so user sees 100% completion briefly
            setTimeout(() => {
                setDownloadProgress(prev => {
                    const newProg = { ...prev };
                    delete newProg[remotePath];
                    return newProg;
                });
            }, 1000);
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
                                const separator = currentPath.endsWith('/') ? '' : '/';
                                const itemPath = `${currentPath}${separator}${f.filename}`;
                                const progress = downloadProgress[itemPath];
                                const pct = progress ? Math.min(100, (progress.transferred / progress.total) * 100) : 0;

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
                                        <td style={{ padding: '8px 4px', width: '24px', position: 'relative' }}>
                                            {loadingFolder === f.filename ? (
                                                <RefreshCw size={16} color="var(--accent)" className="spin" />
                                            ) : isDir ? (
                                                <Folder size={16} fill="var(--accent)" color="var(--accent)" />
                                            ) : (
                                                <File size={16} color="var(--text-secondary)" />
                                            )}
                                        </td>
                                        <td style={{ padding: '8px 4px', position: 'relative' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <span style={{ color: progress ? 'var(--text-primary)' : 'inherit', fontWeight: progress ? 500 : 'normal' }}>
                                                    {f.filename}
                                                </span>
                                            </div>
                                        </td>
                                        <td style={{ padding: '8px 4px', textAlign: 'right', color: 'var(--text-secondary)', fontSize: '12px' }}>
                                            {progress ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px', minWidth: '160px' }}>
                                                    <div style={{ fontSize: '11px', display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                                                        <span style={{ color: 'var(--text-secondary)' }}>
                                                            {(progress.transferred / 1024 / 1024).toFixed(1)} / {(progress.total / 1024 / 1024).toFixed(1)} MB
                                                        </span>
                                                        <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{pct.toFixed(0)}%</span>
                                                    </div>
                                                    <div style={{ width: '100%', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)', height: '6px', borderRadius: '6px', overflow: 'hidden' }}>
                                                        <div style={{ width: `${pct}%`, height: '100%', backgroundColor: 'var(--accent)', transition: 'width 0.15s ease-out' }} />
                                                    </div>
                                                </div>
                                            ) : (
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px' }}>
                                                    <span>{!isDir && f.attrs.size ? `${(f.attrs.size / 1024 / 1024).toFixed(2)} MB` : ''}</span>
                                                    {!isDir && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleDownload(itemPath, f.filename); }}
                                                            style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '6px', cursor: 'pointer', display: 'flex' }}
                                                            title="Download File"
                                                        >
                                                            <Download size={14} color="var(--text-primary)" />
                                                        </button>
                                                    )}
                                                </div>
                                            )}
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
