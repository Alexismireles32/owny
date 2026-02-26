'use client';

// /connect-stripe — Stripe Connect onboarding page for creators

import { useState, useEffect, useCallback, Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useRouter, useSearchParams } from 'next/navigation';
import { getApiErrorMessage, isAuthStatus, readJsonSafe } from '@/lib/utils';

export default function ConnectStripePage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>}>
            <ConnectStripeContent />
        </Suspense>
    );
}

function ConnectStripeContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const justCompleted = searchParams.get('completed') === 'true';

    const [status, setStatus] = useState<{
        status: string;
        chargesEnabled: boolean;
        payoutsEnabled: boolean;
    } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [checking, setChecking] = useState(true);

    const fetchStatus = useCallback(async () => {
        setError(null);
        try {
            const res = await fetch('/api/stripe/connect/status');
            const data = await readJsonSafe<{
                status?: string;
                chargesEnabled?: boolean;
                payoutsEnabled?: boolean;
                error?: string;
            }>(res);

            if (!res.ok) {
                if (isAuthStatus(res.status)) {
                    router.replace('/sign-in?next=%2Fconnect-stripe');
                    return;
                }
                setError(getApiErrorMessage(data, 'Could not load Stripe status.'));
                setStatus(null);
                return;
            }

            setStatus({
                status: data?.status || 'unconnected',
                chargesEnabled: Boolean(data?.chargesEnabled),
                payoutsEnabled: Boolean(data?.payoutsEnabled),
            });
        } catch {
            setError('Network error while checking Stripe status.');
        } finally {
            setChecking(false);
        }
    }, [router]);

    useEffect(() => {
        const load = async () => { await fetchStatus(); };
        load();
    }, [fetchStatus]);

    // Re-check on return from Stripe
    useEffect(() => {
        if (justCompleted) {
            const load = async () => { await fetchStatus(); };
            load();
        }
    }, [justCompleted, fetchStatus]);

    async function handleConnect() {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/stripe/connect/onboard', { method: 'POST' });
            const data = await readJsonSafe<{ url?: string; error?: string }>(res);

            if (!res.ok) {
                if (isAuthStatus(res.status)) {
                    router.replace('/sign-in?next=%2Fconnect-stripe');
                    return;
                }
                setError(getApiErrorMessage(data, 'Could not start Stripe onboarding.'));
                return;
            }

            if (data?.url) {
                window.location.href = data.url;
                return;
            }

            setError('Stripe did not return an onboarding link. Please retry.');
        } catch {
            setError('Network error while starting Stripe onboarding.');
        } finally {
            setLoading(false);
        }
    }

    const isConnected = status?.status === 'connected';
    const isPending = status?.status === 'pending';

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
            <header className="border-b bg-white/80 backdrop-blur-sm">
                <div className="container mx-auto flex h-16 items-center justify-between px-4">
                    <div className="flex items-center gap-3">
                        <a href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                            ← Dashboard
                        </a>
                        <span className="text-muted-foreground">|</span>
                        <h1 className="text-sm font-medium">Stripe Connect</h1>
                    </div>
                    <span className="text-xl font-bold text-primary">Owny</span>
                </div>
            </header>

            <main className="container mx-auto max-w-lg px-4 py-12">
                <Card>
                    <CardHeader className="text-center">
                        <div className="text-4xl mb-2">
                            {isConnected ? '✅' : isPending ? '⏳' : '💳'}
                        </div>
                        <CardTitle>
                            {isConnected
                                ? 'Stripe Connected!'
                                : isPending
                                    ? 'Finish Setup'
                                    : 'Connect Stripe'}
                        </CardTitle>
                        <CardDescription>
                            {isConnected
                                ? 'Your account is ready to receive payments.'
                                : 'Connect your Stripe account to start selling products.'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {checking ? (
                            <p className="text-sm text-muted-foreground text-center">Checking status…</p>
                        ) : (
                            <>
                                {error && (
                                    <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                                        {error}
                                    </p>
                                )}
                                <div className="flex items-center justify-between py-2">
                                    <span className="text-sm">Account Status</span>
                                    <Badge
                                        variant={isConnected ? 'default' : isPending ? 'secondary' : 'outline'}
                                    >
                                        {status?.status || 'unconnected'}
                                    </Badge>
                                </div>

                                {status && (
                                    <>
                                        <div className="flex items-center justify-between py-2">
                                            <span className="text-sm">Charges</span>
                                            <span className="text-sm">
                                                {status.chargesEnabled ? '✅ Enabled' : '❌ Disabled'}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between py-2">
                                            <span className="text-sm">Payouts</span>
                                            <span className="text-sm">
                                                {status.payoutsEnabled ? '✅ Enabled' : '❌ Disabled'}
                                            </span>
                                        </div>
                                    </>
                                )}

                                {!isConnected && (
                                    <Button
                                        onClick={handleConnect}
                                        disabled={loading}
                                        className="w-full"
                                        size="lg"
                                    >
                                        {loading
                                            ? 'Redirecting to Stripe…'
                                            : isPending
                                                ? 'Continue Setup'
                                                : 'Connect with Stripe'}
                                    </Button>
                                )}

                                {isConnected && (
                                    <Button
                                        variant="outline"
                                        className="w-full"
                                        onClick={() => window.location.href = '/dashboard'}
                                    >
                                        Back to Dashboard
                                    </Button>
                                )}
                            </>
                        )}
                    </CardContent>
                </Card>

                <p className="text-xs text-muted-foreground text-center mt-6">
                    Owny takes a 10% platform fee on each sale. The rest goes directly to your Stripe account.
                </p>
            </main>
        </div>
    );
}
