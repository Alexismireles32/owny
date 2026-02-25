'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { createBrowserClient } from '@supabase/ssr';

type Step = 'handle' | 'brand';

const MOOD_OPTIONS = [
    'Motivational',
    'Educational',
    'Fun & Playful',
    'Professional',
    'Minimalist',
    'Bold & Edgy',
] as const;

export default function OnboardPage() {
    const router = useRouter();
    const [step, setStep] = useState<Step>('handle');
    const [loading, setLoading] = useState(false);
    const [checkingOnboard, setCheckingOnboard] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Guard: if user already has a creator profile, redirect to dashboard
    useEffect(() => {
        async function checkExistingCreator() {
            try {
                const supabase = createBrowserClient(
                    process.env.NEXT_PUBLIC_SUPABASE_URL!,
                    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
                );
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) {
                    router.replace('/sign-in');
                    return;
                }
                const { data: creator } = await supabase
                    .from('creators')
                    .select('id')
                    .eq('profile_id', user.id)
                    .single();

                if (creator) {
                    // Already onboarded — send to dashboard
                    router.replace('/dashboard');
                    return;
                }
            } catch {
                // Supabase error — let them try onboarding
            }
            setCheckingOnboard(false);
        }
        checkExistingCreator();
    }, [router]);

    // Step 1: Identity
    const [handle, setHandle] = useState('');
    const [displayName, setDisplayName] = useState('');

    // Step 2: Brand DNA
    const [primaryColor, setPrimaryColor] = useState('#6366f1');
    const [secondaryColor, setSecondaryColor] = useState('#f59e0b');
    const [mood, setMood] = useState<string>('Motivational');

    function handleContinueToNext() {
        if (!handle.trim() || !displayName.trim()) {
            setError('Handle and display name are required');
            return;
        }

        // Validate handle format (lowercase, alphanumeric, hyphens)
        const handleRegex = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
        if (!handleRegex.test(handle.toLowerCase())) {
            setError('Handle must be 3–40 characters, lowercase letters, numbers, and hyphens only');
            return;
        }

        setError(null);
        setStep('brand');
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const res = await fetch('/api/creators/onboard', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    handle: handle.toLowerCase().trim(),
                    displayName: displayName.trim(),
                    brandTokens: {
                        primaryColor,
                        secondaryColor,
                        mood,
                    },
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.error || 'Something went wrong');
                setLoading(false);
                return;
            }

            router.push('/dashboard');
            router.refresh();
        } catch {
            setError('Network error — please try again');
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4">
            {checkingOnboard ? (
                <p className="text-muted-foreground animate-pulse">Loading...</p>
            ) : (
                <Card className="w-full max-w-lg">
                    <CardHeader className="text-center">
                        <CardTitle className="text-2xl font-bold">
                            Set up your creator profile
                        </CardTitle>
                        <CardDescription>
                            {step === 'handle'
                                ? 'Step 1 of 2 — Choose your identity'
                                : 'Step 2 of 2 — Define your brand'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {/* Progress bar */}
                        <div className="flex gap-2">
                            <div className={`h-1.5 flex-1 rounded-full ${step === 'handle' || step === 'brand' ? 'bg-primary' : 'bg-muted'
                                }`} />
                            <div className={`h-1.5 flex-1 rounded-full ${step === 'brand' ? 'bg-primary' : 'bg-muted'
                                }`} />
                        </div>

                        {error && (
                            <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
                                {error}
                            </div>
                        )}

                        {step === 'handle' ? (
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label htmlFor="handle" className="text-sm font-medium">
                                        Handle
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm text-muted-foreground">owny.store/c/</span>
                                        <Input
                                            id="handle"
                                            placeholder="your-handle"
                                            value={handle}
                                            onChange={(e) => setHandle(e.target.value.toLowerCase())}
                                            required
                                        />
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        Your unique URL. Lowercase letters, numbers, and hyphens.
                                    </p>
                                </div>

                                <div className="space-y-2">
                                    <label htmlFor="display-name" className="text-sm font-medium">
                                        Display Name
                                    </label>
                                    <Input
                                        id="display-name"
                                        placeholder="Your Name"
                                        value={displayName}
                                        onChange={(e) => setDisplayName(e.target.value)}
                                        required
                                    />
                                </div>

                                <Button
                                    type="button"
                                    className="w-full"
                                    onClick={handleContinueToNext}
                                >
                                    Continue
                                </Button>
                            </div>
                        ) : (
                            <form onSubmit={handleSubmit} className="space-y-6">
                                {/* Color pickers */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label htmlFor="primary-color" className="text-sm font-medium">
                                            Primary Color
                                        </label>
                                        <div className="flex items-center gap-3">
                                            <input
                                                id="primary-color"
                                                type="color"
                                                value={primaryColor}
                                                onChange={(e) => setPrimaryColor(e.target.value)}
                                                className="h-10 w-10 cursor-pointer rounded border-0"
                                            />
                                            <Input
                                                value={primaryColor}
                                                onChange={(e) => setPrimaryColor(e.target.value)}
                                                className="font-mono text-sm"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label htmlFor="secondary-color" className="text-sm font-medium">
                                            Secondary Color
                                        </label>
                                        <div className="flex items-center gap-3">
                                            <input
                                                id="secondary-color"
                                                type="color"
                                                value={secondaryColor}
                                                onChange={(e) => setSecondaryColor(e.target.value)}
                                                className="h-10 w-10 cursor-pointer rounded border-0"
                                            />
                                            <Input
                                                value={secondaryColor}
                                                onChange={(e) => setSecondaryColor(e.target.value)}
                                                className="font-mono text-sm"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Mood selector */}
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Mood / Tone</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {MOOD_OPTIONS.map((m) => (
                                            <button
                                                key={m}
                                                type="button"
                                                onClick={() => setMood(m)}
                                                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${mood === m
                                                    ? 'border-primary bg-primary/10 text-primary'
                                                    : 'border-border bg-background text-muted-foreground hover:border-primary/50'
                                                    }`}
                                            >
                                                {m}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Preview */}
                                <div
                                    className="rounded-xl p-6 text-center"
                                    style={{
                                        background: `linear-gradient(135deg, ${primaryColor}22, ${secondaryColor}22)`,
                                        borderLeft: `4px solid ${primaryColor}`,
                                    }}
                                >
                                    <p className="text-lg font-bold" style={{ color: primaryColor }}>
                                        {displayName || 'Your Name'}
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                        @{handle || 'your-handle'} · {mood}
                                    </p>
                                </div>

                                <div className="flex gap-3">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="flex-1"
                                        onClick={() => setStep('handle')}
                                    >
                                        Back
                                    </Button>
                                    <Button type="submit" className="flex-1" disabled={loading}>
                                        {loading ? 'Creating...' : 'Launch My Store'}
                                    </Button>
                                </div>
                            </form>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
