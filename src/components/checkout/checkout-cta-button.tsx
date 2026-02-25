'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import type { CSSProperties, ReactNode } from 'react';

interface CheckoutCtaButtonProps {
    productId: string;
    productSlug: string;
    isFree: boolean;
    size?: 'default' | 'sm' | 'lg' | 'icon';
    className?: string;
    style?: CSSProperties;
    children: ReactNode;
}

interface CheckoutResponse {
    url?: string;
    free?: boolean;
    productSlug?: string;
    error?: string;
}

export function CheckoutCtaButton({
    productId,
    productSlug,
    isFree,
    size = 'default',
    className,
    style,
    children,
}: CheckoutCtaButtonProps) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleCheckout() {
        if (loading) return;
        setLoading(true);
        setError(null);

        try {
            const res = await fetch('/api/stripe/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ productId }),
            });

            let payload: CheckoutResponse | null = null;
            try {
                payload = (await res.json()) as CheckoutResponse;
            } catch {
                payload = null;
            }

            if (res.status === 401) {
                router.push(`/sign-in?next=${encodeURIComponent(`/p/${productSlug}`)}`);
                return;
            }

            if (!res.ok) {
                throw new Error(payload?.error || 'Unable to start checkout. Please try again.');
            }

            if (payload?.url) {
                window.location.assign(payload.url);
                return;
            }

            if (payload?.free) {
                router.push(`/library/${payload.productSlug || productSlug}`);
                router.refresh();
                return;
            }

            throw new Error('Unexpected checkout response.');
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unable to start checkout. Please try again.';
            setError(message);
            setLoading(false);
            return;
        }

        setLoading(false);
    }

    return (
        <div>
            <Button
                type="button"
                size={size}
                className={className}
                style={style}
                onClick={handleCheckout}
                disabled={loading}
            >
                {loading ? (isFree ? 'Unlocking...' : 'Redirecting...') : children}
            </Button>
            {error && (
                <p className="text-xs text-destructive mt-2">
                    {error}
                </p>
            )}
        </div>
    );
}
