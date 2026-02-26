'use client';

// Library error boundary — buyer-facing content viewer errors
import { useEffect } from 'react';
import Link from 'next/link';

export default function LibraryError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error('Library error:', error);
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
                <p style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>📚</p>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b', marginBottom: '0.5rem' }}>
                    Content Loading Error
                </h2>
                <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '1.5rem', lineHeight: 1.6 }}>
                    We couldn&apos;t load your content right now. Please try again.
                </p>
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
                    <Link
                        href="/library"
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
                        Back to Library
                    </Link>
                </div>
            </div>
        </div>
    );
}
