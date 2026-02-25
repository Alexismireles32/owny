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
        <Suspense fallback={null}>
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
                    const res = await fetch('/api/scrape/profile', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ handle: handleFromQuery }),
                    });

                    if (!res.ok) {
                        let payload: { error?: string } | null = null;
                        try {
                            payload = await res.json();
                        } catch {
                            payload = null;
                        }
                        setError(payload?.error || 'We could not start your content analysis. Please try again.');
                        setLoading(false);
                        return;
                    }
                } catch {
                    // Pipeline trigger failed — user can still access dashboard
                    setError('We could not start your content analysis. Please try again.');
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
                ? `Check your email to confirm your account. We will continue setting up @${handleFromQuery} after verification.`
                : 'Check your email to confirm your account, then come back to sign in.'
        );
        setLoading(false);
    }

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
                            {message}
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
