'use client';

// Admin error boundary
import { useEffect } from 'react';

export default function AdminError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error('Admin error:', error);
    }, [error]);

    return (
        <div
            style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'linear-gradient(135deg, #f8fafc, #f1f5f9)',
                fontFamily: "'Inter', system-ui, sans-serif",
                padding: '2rem',
            }}
        >
            <div style={{ textAlign: 'center', maxWidth: '420px' }}>
                <p style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🔧</p>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b', marginBottom: '0.5rem' }}>
                    Admin Panel Error
                </h2>
                <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '1.5rem', lineHeight: 1.6 }}>
                    Something went wrong in the admin panel.
                </p>
                {error.digest && (
                    <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '1rem' }}>
                        Ref: {error.digest}
                    </p>
                )}
                <button
                    onClick={reset}
                    style={{
                        padding: '0.6rem 1.5rem',
                        borderRadius: '0.5rem',
                        border: 'none',
                        background: '#6366f1',
                        color: '#fff',
                        fontWeight: 600,
                        fontSize: '0.875rem',
                        cursor: 'pointer',
                    }}
                >
                    Try Again
                </button>
            </div>
        </div>
    );
}
