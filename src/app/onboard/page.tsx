'use client';

// /onboard — Redirect to home page HandleInput if no creator,
// or to dashboard if already onboarded.
// Per SCRAPE_CREATORS_FLOW.md: TikTok handle is the single entry point.

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { HandleInput } from '@/components/landing/HandleInput';

export default function OnboardPage() {
    return (
        <Suspense fallback={null}>
            <OnboardContent />
        </Suspense>
    );
}

function OnboardContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const handleFromQuery = (searchParams.get('handle') || '').replace(/^@/, '').trim().toLowerCase();
    const [checking, setChecking] = useState(true);
    const [needsOnboard, setNeedsOnboard] = useState(false);
    const [autoStarting, setAutoStarting] = useState(false);
    const [autoAttempted, setAutoAttempted] = useState(false);
    const [autoError, setAutoError] = useState<string | null>(null);

    useEffect(() => {
        async function check() {
            try {
                const supabase = createBrowserClient(
                    process.env.NEXT_PUBLIC_SUPABASE_URL!,
                    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
                );
                const { data: { user } } = await supabase.auth.getUser();

                if (!user) {
                    router.replace(
                        handleFromQuery
                            ? `/sign-in?handle=${encodeURIComponent(handleFromQuery)}`
                            : '/sign-in'
                    );
                    return;
                }

                const { data: creator } = await supabase
                    .from('creators')
                    .select('id, pipeline_status')
                    .eq('profile_id', user.id)
                    .maybeSingle();

                if (creator && !handleFromQuery) {
                    router.replace('/dashboard');
                    return;
                }

                setNeedsOnboard(true);
            } catch {
                setNeedsOnboard(true);
            } finally {
                setChecking(false);
            }
        }
        void check();
    }, [handleFromQuery, router]);

    useEffect(() => {
        if (checking || !needsOnboard || !handleFromQuery || autoAttempted) return;

        async function autoStart() {
            setAutoAttempted(true);
            setAutoStarting(true);
            setAutoError(null);

            try {
                const res = await fetch('/api/scrape/profile', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ handle: handleFromQuery }),
                });

                let payload: { error?: string } | null = null;
                try {
                    payload = await res.json();
                } catch {
                    payload = null;
                }

                if (!res.ok) {
                    throw new Error(payload?.error || 'We could not start your content analysis. Please try again.');
                }

                router.replace('/progress');
                router.refresh();
            } catch (error) {
                setAutoError(error instanceof Error ? error.message : 'We could not start your content analysis.');
                setAutoStarting(false);
            }
        }

        void autoStart();
    }, [autoAttempted, checking, handleFromQuery, needsOnboard, router]);

    if (checking) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
                <p className="text-muted-foreground animate-pulse">Loading...</p>
            </div>
        );
    }

    if (!needsOnboard) return null;

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 px-6 py-20">
            <div className="max-w-lg w-full text-center space-y-8">
                <h1 className="text-4xl font-bold text-slate-900">
                    {handleFromQuery ? `Setting up @${handleFromQuery}` : 'Connect your TikTok'}
                </h1>
                <p className="text-lg text-slate-500">
                    {handleFromQuery
                        ? 'We are preparing your storefront and analyzing your content.'
                        : 'Enter your TikTok username to start creating digital products from your content.'}
                </p>

                {autoStarting ? (
                    <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-700 flex items-center justify-center gap-2">
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Starting your pipeline...
                    </div>
                ) : (
                    <HandleInput initialHandle={handleFromQuery} />
                )}

                {autoError && (
                    <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                        {autoError}
                    </p>
                )}

                <p className="text-xs text-slate-400">
                    We&apos;ll analyze your videos and build your creator profile automatically.
                </p>
            </div>
        </div>
    );
}
