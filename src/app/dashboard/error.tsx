'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function DashboardError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error('Dashboard error:', error);
    }, [error]);

    return (
        <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
            <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center">
                <p className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">Dashboard error</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Something went wrong</h2>
                <p className="mt-2 text-sm text-slate-600">
                    Your data is safe. Try again and continue where you left off.
                </p>
                {error.digest && (
                    <p className="mt-2 text-xs text-slate-400">Ref: {error.digest}</p>
                )}

                <div className="mt-5 flex justify-center gap-2">
                    <Button type="button" onClick={reset}>
                        Try again
                    </Button>
                    <Button asChild type="button" variant="outline">
                        <a href="/dashboard">Reload</a>
                    </Button>
                </div>
            </div>
        </div>
    );
}
