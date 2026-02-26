'use client';

// Root error boundary — catches unhandled errors in the app
// Next.js App Router: error.tsx renders when a route segment throws

import { useEffect } from 'react';

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error('Unhandled application error:', error);
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
                <p style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>⚠️</p>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b', marginBottom: '0.5rem' }}>
                    Something went wrong
                </h2>
                <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '1.5rem', lineHeight: 1.6 }}>
                    An unexpected error occurred. Please try again or reload the page.
                </p>
                {error.digest && (
                    <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '1rem' }}>
                        Error ID: {error.digest}
                    </p>
                )}
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
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
                    <a
                        href="/"
                        style={{
                            padding: '0.6rem 1.5rem',
                            borderRadius: '0.5rem',
                            border: '1px solid #e2e8f0',
                            background: '#fff',
                            color: '#475569',
                            fontWeight: 600,
                            fontSize: '0.875rem',
                            textDecoration: 'none',
                        }}
                    >
                        Go Home
                    </a>
                </div>
            </div>
        </div>
    );
}
