'use client';

// Storefront error boundary — public creator page errors
import { useEffect } from 'react';

export default function StorefrontError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error('Storefront error:', error);
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
                <p style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🏪</p>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b', marginBottom: '0.5rem' }}>
                    Store Temporarily Unavailable
                </h2>
                <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '1.5rem', lineHeight: 1.6 }}>
                    We&apos;re having trouble loading this page. Please try again in a moment.
                </p>
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
                    Reload
                </button>
            </div>
        </div>
    );
}
