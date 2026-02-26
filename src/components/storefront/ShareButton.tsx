'use client';

// Share / Copy Link button for the storefront
import { useState } from 'react';

export function ShareButton({
    handle,
    primaryColor = '#6366f1',
}: {
    handle: string;
    primaryColor?: string;
}) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        const url = `${window.location.origin}/c/${handle}`;
        try {
            if (navigator.share) {
                await navigator.share({ title: `@${handle}'s Store`, url });
                return;
            }
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Fallback for older browsers
            const input = document.createElement('input');
            input.value = `${window.location.origin}/c/${handle}`;
            document.body.appendChild(input);
            input.select();
            document.execCommand('copy');
            document.body.removeChild(input);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    return (
        <button
            onClick={handleCopy}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.5rem 1rem',
                borderRadius: '9999px',
                border: `1px solid ${primaryColor}40`,
                background: `${primaryColor}15`,
                color: primaryColor,
                fontWeight: 600,
                fontSize: '0.8rem',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                fontFamily: 'inherit',
            }}
        >
            {copied ? '✓ Copied!' : '🔗 Share Store'}
        </button>
    );
}
