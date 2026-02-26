'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';

export default function SignUpPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
                <p className="text-muted-foreground animate-pulse">Loading sign up...</p>
            </div>
        }>
            <SignUpForm />
        </Suspense>
    );
}

function SignUpForm() {
    const searchParams = useSearchParams();
    const handleFromQuery = (searchParams.get('handle') || '').replace(/^@/, '').trim().toLowerCase();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [statusText, setStatusText] = useState('');
    const [resendCooldown, setResendCooldown] = useState(0);
    const router = useRouter();
    const supabase = createClient();

    useEffect(() => {
        if (!handleFromQuery) return;

        // Best-effort prefetch while user fills auth form.
        void fetch('/api/scrape/prefetch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ handle: handleFromQuery }),
        }).catch(() => {
            // Silent warmup; normal flow still works without cache hit.
        });
    }, [handleFromQuery]);

    async function startPipelineForHandle(handle: string): Promise<boolean> {
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

            return res.ok;
        }

        return false;
    }

    async function handleSignUp(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        setError(null);

        if (password !== confirmPassword) {
            setError('Passwords do not match');
            setLoading(false);
            return;
        }

        if (password.length < 6) {
            setError('Password must be at least 6 characters');
            setLoading(false);
            return;
        }

        const { error, data } = await supabase.auth.signUp({
            email,
            password,
            options: {
                emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(
                    handleFromQuery
                        ? `/onboard?handle=${encodeURIComponent(handleFromQuery)}`
                        : '/dashboard'
                )}`,
            },
        });

        if (error) {
            setError(error.message);
            setLoading(false);
            return;
        }

        // If email confirmation is disabled, user is immediately authenticated
        if (data.session) {
            // If we have a handle from onboarding, trigger the scrape pipeline
            if (handleFromQuery) {
                setStatusText('Setting up your storefront...');
                try {
                    const started = await startPipelineForHandle(handleFromQuery);
                    if (!started) {
                        // Pipeline failed but account was created — redirect to sign-in with context
                        setStatusText('');
                        setMessage(
                            `Your account was created! The content pipeline couldn't start right now. Sign in and try connecting @${handleFromQuery} again from the dashboard.`
                        );
                        setLoading(false);
                        return;
                    }
                } catch {
                    // Pipeline trigger failed — account still created
                    setStatusText('');
                    setMessage(
                        `Your account was created! The content pipeline couldn't start right now. Sign in and try connecting @${handleFromQuery} again from the dashboard.`
                    );
                    setLoading(false);
                    return;
                }
            }
            router.push('/progress');
            router.refresh();
            return;
        }

        // Email confirmation enabled
        setMessage(
            handleFromQuery
                ? `Check your email to confirm your account. We'll continue setting up @${handleFromQuery} after verification.`
                : 'Check your email to confirm your account, then come back to sign in.'
        );
        setResendCooldown(60);
        setLoading(false);
    }

    // Resend verification email
    async function handleResend() {
        if (resendCooldown > 0 || !email) return;
        const { error: resendError } = await supabase.auth.resend({
            type: 'signup',
            email,
        });
        if (resendError) {
            setError(resendError.message);
        } else {
            setResendCooldown(60);
        }
    }

    // Cooldown timer
    useEffect(() => {
        if (resendCooldown <= 0) return;
        const timer = setInterval(() => {
            setResendCooldown((c) => Math.max(0, c - 1));
        }, 1000);
        return () => clearInterval(timer);
    }, [resendCooldown]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4">
            <Card className="w-full max-w-md">
                <CardHeader className="text-center">
                    <CardTitle className="text-2xl font-bold">
                        Create your <span className="text-primary">Owny</span> account
                    </CardTitle>
                    <CardDescription>
                        {handleFromQuery
                            ? <>Sign up to claim <strong>@{handleFromQuery}</strong>&apos;s storefront</>
                            : 'Start turning your content into products'
                        }
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
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
                            <div className="flex items-center gap-2 mb-2">
                                <span style={{ fontSize: '1.25rem' }}>📧</span>
                                <strong>Verification email sent!</strong>
                            </div>
                            <p className="mb-3">{message}</p>
                            <button
                                type="button"
                                onClick={handleResend}
                                disabled={resendCooldown > 0}
                                className="text-xs font-semibold px-3 py-1.5 rounded-full bg-green-100 hover:bg-green-200 text-green-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {resendCooldown > 0
                                    ? `Resend in ${resendCooldown}s`
                                    : 'Resend verification email'
                                }
                            </button>
                        </div>
                    )}

                    <form onSubmit={handleSignUp} className="space-y-4">
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
                        <div className="space-y-2">
                            <label htmlFor="confirm-password" className="text-sm font-medium">
                                Confirm Password
                            </label>
                            <Input
                                id="confirm-password"
                                type="password"
                                placeholder="••••••••"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                                minLength={6}
                            />
                        </div>
                        <Button type="submit" className="w-full" disabled={loading}>
                            {loading ? 'Creating account...' : 'Create Account'}
                        </Button>
                    </form>

                    <div className="text-center text-sm text-muted-foreground">
                        Already have an account?{' '}
                        <Link
                            href={handleFromQuery ? `/sign-in?handle=${encodeURIComponent(handleFromQuery)}` : '/sign-in'}
                            className="text-primary hover:underline font-medium"
                        >
                            Sign In
                        </Link>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
