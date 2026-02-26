'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';

export default function SignInPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
                <p className="text-muted-foreground animate-pulse">Loading sign in...</p>
            </div>
        }>
            <SignInForm />
        </Suspense>
    );
}

function SignInForm() {
    const searchParams = useSearchParams();
    const handleFromQuery = (searchParams.get('handle') || '').replace(/^@/, '').trim().toLowerCase();
    const [activeTab, setActiveTab] = useState<'password' | 'magic'>('password');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [statusText, setStatusText] = useState<string | null>(null);
    const router = useRouter();
    const supabase = createClient();

    useEffect(() => {
        if (!handleFromQuery) return;

        // Best-effort prefetch while user signs in.
        void fetch('/api/scrape/prefetch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ handle: handleFromQuery }),
        }).catch(() => {
            // Silent warmup; primary flow remains unchanged.
        });
    }, [handleFromQuery]);

    async function startPipelineForHandle(handle: string): Promise<boolean> {
        setStatusText(`Setting up @${handle}...`);

        try {
            for (let attempt = 1; attempt <= 3; attempt++) {
                const res = await fetch('/api/scrape/profile', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ handle }),
                });

                if (res.status === 401 && attempt < 3) {
                    await new Promise((resolve) => setTimeout(resolve, attempt * 300));
                    continue;
                }

                if (!res.ok) {
                    let payload: { error?: string } | null = null;
                    try {
                        payload = await res.json();
                    } catch {
                        payload = null;
                    }

                    setError(payload?.error || 'We could not start your content analysis. Please try again.');
                    setStatusText(null);
                    return false;
                }

                return true;
            }

            setError('We could not start your content analysis. Please try again.');
            setStatusText(null);
            return false;
        } catch {
            setError('We could not start your content analysis. Please try again.');
            setStatusText(null);
            return false;
        }
    }

    async function handlePasswordLogin(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setMessage(null);
        setStatusText(null);

        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
            setError(error.message);
            setLoading(false);
            return;
        }

        if (handleFromQuery) {
            const started = await startPipelineForHandle(handleFromQuery);
            if (!started) {
                // Pipeline failed but user is signed in — don't block, send to dashboard
                router.push('/dashboard');
                router.refresh();
                return;
            }

            router.push('/progress');
            router.refresh();
            return;
        }

        router.push('/dashboard');
        router.refresh();
    }

    async function handleMagicLink(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setMessage(null);
        setStatusText(null);

        const nextPath = handleFromQuery
            ? `/onboard?handle=${encodeURIComponent(handleFromQuery)}`
            : '/dashboard';

        const { error } = await supabase.auth.signInWithOtp({
            email,
            options: {
                emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
            },
        });

        if (error) {
            setError(error.message);
            setLoading(false);
            return;
        }

        setMessage(
            handleFromQuery
                ? `Check your email for the login link. We will continue setting up @${handleFromQuery} after sign-in.`
                : 'Check your email for the login link!'
        );
        setLoading(false);
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4">
            <Card className="w-full max-w-md">
                <CardHeader className="text-center">
                    <CardTitle className="text-2xl font-bold">
                        Welcome to <span className="text-primary">Owny</span>
                    </CardTitle>
                    <CardDescription>
                        Sign in to your account
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Tab switcher */}
                    <div className="flex rounded-lg bg-muted p-1">
                        <button
                            onClick={() => { setActiveTab('password'); setError(null); setMessage(null); setStatusText(null); }}
                            className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${activeTab === 'password'
                                ? 'bg-background shadow-sm text-foreground'
                                : 'text-muted-foreground hover:text-foreground'
                                }`}
                        >
                            Email & Password
                        </button>
                        <button
                            onClick={() => { setActiveTab('magic'); setError(null); setMessage(null); setStatusText(null); }}
                            className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${activeTab === 'magic'
                                ? 'bg-background shadow-sm text-foreground'
                                : 'text-muted-foreground hover:text-foreground'
                                }`}
                        >
                            Magic Link
                        </button>
                    </div>

                    {/* Error / Success messages */}
                    {statusText && (
                        <div className="rounded-md bg-primary/10 px-4 py-3 text-sm text-primary flex items-center gap-2">
                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            {statusText}
                        </div>
                    )}
                    {error && (
                        <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
                            {error}
                        </div>
                    )}
                    {message && (
                        <div className="rounded-md bg-green-50 px-4 py-3 text-sm text-green-700">
                            {message}
                        </div>
                    )}

                    {activeTab === 'password' ? (
                        <form onSubmit={handlePasswordLogin} className="space-y-4">
                            <div className="space-y-2">
                                <label htmlFor="email" className="text-sm font-medium">
                                    Email
                                </label>
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="you@example.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <label htmlFor="password" className="text-sm font-medium">
                                    Password
                                </label>
                                <Input
                                    id="password"
                                    type="password"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    minLength={6}
                                />
                            </div>
                            <Button type="submit" className="w-full" disabled={loading}>
                                {loading ? 'Signing in...' : 'Sign In'}
                            </Button>
                        </form>
                    ) : (
                        <form onSubmit={handleMagicLink} className="space-y-4">
                            <div className="space-y-2">
                                <label htmlFor="magic-email" className="text-sm font-medium">
                                    Email
                                </label>
                                <Input
                                    id="magic-email"
                                    type="email"
                                    placeholder="you@example.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                />
                            </div>
                            <Button type="submit" className="w-full" disabled={loading}>
                                {loading ? 'Sending...' : 'Send Magic Link'}
                            </Button>
                        </form>
                    )}

                    <div className="text-center text-sm text-muted-foreground">
                        Don&apos;t have an account?{' '}
                        <Link
                            href={handleFromQuery ? `/sign-up?handle=${encodeURIComponent(handleFromQuery)}` : '/sign-up'}
                            className="text-primary hover:underline font-medium"
                        >
                            Sign Up
                        </Link>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
