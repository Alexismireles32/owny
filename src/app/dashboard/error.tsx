'use client';

// Dashboard error boundary — creator-facing errors in the studio
import { useEffect } from 'react';

export default function DashboardError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error('Dashboard error:', error);
    }, [error]);

    return (
        <div
            style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#060d18',
                fontFamily: "'Inter', system-ui, sans-serif",
                padding: '2rem',
            }}
        >
            <div style={{ textAlign: 'center', maxWidth: '420px' }}>
                <p style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🛠️</p>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.5rem' }}>
                    Studio Error
                </h2>
                <p style={{ fontSize: '0.875rem', color: '#94a3b8', marginBottom: '1.5rem', lineHeight: 1.6 }}>
                    Something went wrong in your studio. Your data is safe — just try again.
                </p>
                {error.digest && (
                    <p style={{ fontSize: '0.75rem', color: '#475569', marginBottom: '1rem' }}>
                        Ref: {error.digest}
                    </p>
                )}
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                    <button
                        onClick={reset}
                        style={{
                            padding: '0.6rem 1.5rem',
                            borderRadius: '0.5rem',
                            border: 'none',
                            background: '#22d3ee',
                            color: '#0f172a',
                            fontWeight: 600,
                            fontSize: '0.875rem',
                            cursor: 'pointer',
                        }}
                    >
                        Try Again
                    </button>
                    <a
                        href="/dashboard"
                        style={{
                            padding: '0.6rem 1.5rem',
                            borderRadius: '0.5rem',
                            border: '1px solid rgba(226,232,240,0.2)',
                            background: 'rgba(226,232,240,0.08)',
                            color: '#e2e8f0',
                            fontWeight: 600,
                            fontSize: '0.875rem',
                            textDecoration: 'none',
                        }}
                    >
                        Reload Studio
                    </a>
                </div>
            </div>
        </div>
    );
}
