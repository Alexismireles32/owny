'use client';

// HandleInput — TikTok username entry component
// The single entry point for all digital product creation
// Per SCRAPE_CREATORS_FLOW.md §Main Entry Point

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getApiErrorMessage, readJsonSafe } from '@/lib/utils';

const HANDLE_REGEX = /^[a-zA-Z0-9._]{1,24}$/;

interface HandleInputProps {
    onSuccess?: (creatorId: string) => void;
    initialHandle?: string;
}

export function HandleInput({ onSuccess, initialHandle = '' }: HandleInputProps) {
    const router = useRouter();
    const [handle, setHandle] = useState(initialHandle);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [retryAfter, setRetryAfter] = useState<number | null>(null);

    const normalizeHandle = (raw: string): string => {
        return raw.replace(/^@/, '').trim().toLowerCase();
    };

    useEffect(() => {
        setHandle(initialHandle);
    }, [initialHandle]);

    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setRetryAfter(null);

        const normalized = normalizeHandle(handle);

        if (!normalized) {
            setError('Please enter your TikTok username');
            return;
        }

        if (!HANDLE_REGEX.test(normalized)) {
            setError('Invalid username. Use letters, numbers, dots, and underscores (max 24 characters).');
            return;
        }

        setLoading(true);

        try {
            let res: Response | null = null;
            for (let attempt = 1; attempt <= 3; attempt++) {
                res = await fetch('/api/scrape/profile', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ handle: normalized }),
                });
                if (res.status !== 401 || attempt === 3) break;
                await new Promise((resolve) => setTimeout(resolve, attempt * 250));
            }

            if (!res) {
                setError('Could not connect your profile. Please try again.');
                setLoading(false);
                return;
            }

            const data = await readJsonSafe<{ error?: string; creatorId?: string }>(res);

            if (res.status === 401) {
                // Warm anonymous profile cache while redirecting to auth.
                void fetch('/api/scrape/prefetch', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ handle: normalized }),
                    keepalive: true,
                }).catch(() => {
                    // Best effort only.
                });

                setLoading(false);
                router.push(`/sign-up?handle=${encodeURIComponent(normalized)}`);
                return;
            }

            if (res.status === 429) {
                const retry = parseInt(res.headers.get('Retry-After') || '60', 10);
                setRetryAfter(retry);
                setError(`Too many requests. Please try again in ${retry} seconds.`);
                setLoading(false);

                // Countdown timer
                const interval = setInterval(() => {
                    setRetryAfter((prev) => {
                        if (prev && prev > 1) return prev - 1;
                        clearInterval(interval);
                        return null;
                    });
                }, 1000);
                return;
            }

            if (!res.ok) {
                setError(getApiErrorMessage(data, 'Something went wrong. Please try again.'));
                setLoading(false);
                return;
            }

            if (!data?.creatorId) {
                setError('Unexpected response while connecting your profile. Please try again.');
                setLoading(false);
                return;
            }

            // Success! Pipeline is running in the background
            if (onSuccess) {
                setLoading(false);
                onSuccess(data.creatorId);
            } else {
                // Go to progress page to watch pipeline stages
                router.push('/progress');
            }
        } catch {
            setError('Network error. Please check your connection and try again.');
            setLoading(false);
        }
    }, [handle, onSuccess, router]);

    return (
        <form onSubmit={handleSubmit} className="w-full max-w-md mx-auto">
            <div className="space-y-4">
                <div className="relative">
                    <div className="flex items-stretch rounded-2xl border-2 border-slate-200 bg-white shadow-lg shadow-slate-200/50 transition-all focus-within:border-indigo-500 focus-within:shadow-indigo-200/30 overflow-hidden">
                        <span className="flex items-center pl-5 pr-1 text-slate-400 text-lg font-medium select-none">
                            @
                        </span>
                        <input
                            type="text"
                            value={handle}
                            onChange={(e) => setHandle(e.target.value)}
                            placeholder="your_tiktok_username"
                            disabled={loading}
                            className="flex-1 py-4 pr-4 bg-transparent text-lg font-medium text-slate-900 placeholder:text-slate-300 outline-none disabled:opacity-50"
                            autoComplete="off"
                            autoCapitalize="off"
                            spellCheck={false}
                        />
                        <button
                            type="submit"
                            disabled={loading || !handle.trim()}
                            className="m-2 px-6 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-semibold text-sm transition-all hover:from-indigo-700 hover:to-violet-700 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
                        >
                            {loading ? (
                                <span className="flex items-center gap-2">
                                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                    </svg>
                                    Analyzing...
                                </span>
                            ) : (
                                'Get Started'
                            )}
                        </button>
                    </div>
                </div>

                {error && (
                    <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
                        <svg className="h-4 w-4 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                        <span>
                            {error}
                            {retryAfter && <span className="font-mono ml-1">({retryAfter}s)</span>}
                        </span>
                    </div>
                )}

                <p className="text-center text-xs text-slate-400">
                    We&apos;ll analyze your TikTok content to create personalized digital products
                </p>
            </div>
        </form>
    );
}
