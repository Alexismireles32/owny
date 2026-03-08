'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

interface SimulatedCheckoutCompleterProps {
    sessionId: string;
}

export function SimulatedCheckoutCompleter({ sessionId }: SimulatedCheckoutCompleterProps) {
    const router = useRouter();
    const startedRef = useRef(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (startedRef.current) return;
        startedRef.current = true;

        let cancelled = false;

        async function completeSimulatedCheckout() {
            try {
                const response = await fetch('/api/stripe/dev/complete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId }),
                });
                const payload = await response.json().catch(() => null) as { error?: string } | null;

                if (!response.ok) {
                    throw new Error(payload?.error || 'Unable to complete simulated checkout.');
                }

                if (cancelled) return;

                router.replace(`/checkout-success?session_id=${encodeURIComponent(sessionId)}`);
                router.refresh();
            } catch (err) {
                if (cancelled) return;
                setError(err instanceof Error ? err.message : 'Unable to complete simulated checkout.');
            }
        }

        void completeSimulatedCheckout();

        return () => {
            cancelled = true;
        };
    }, [router, sessionId]);

    if (error) {
        return (
            <p className="text-xs text-destructive">
                Local Stripe simulation failed: {error}
            </p>
        );
    }

    return (
        <p className="text-xs text-muted-foreground">
            Local Stripe simulation is replaying the completion webhook now.
        </p>
    );
}
