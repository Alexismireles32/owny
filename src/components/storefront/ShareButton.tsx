'use client';

// Share / Copy Link button for the storefront
import { useState } from 'react';
import { Check, Share2 } from 'lucide-react';

function withAlpha(color: string, alpha: number): string {
    const percent = Math.max(0, Math.min(100, Math.round(alpha * 100)));
    return `color-mix(in srgb, ${color} ${percent}%, transparent)`;
}

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
            className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold shadow-[0_16px_36px_-28px_rgba(15,23,42,0.38)] transition-transform duration-200 hover:-translate-y-0.5"
            style={{
                borderColor: withAlpha(primaryColor, 0.22),
                background: `linear-gradient(180deg, ${withAlpha(primaryColor, 0.14)}, ${withAlpha(primaryColor, 0.07)})`,
                color: primaryColor,
                cursor: 'pointer',
                fontFamily: 'inherit',
            }}
        >
            {copied ? <Check className="size-4" /> : <Share2 className="size-4" />}
            {copied ? 'Link copied' : 'Share store'}
        </button>
    );
}
