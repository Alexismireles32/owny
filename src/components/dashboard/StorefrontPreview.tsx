'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { getApiErrorMessage, isAuthStatus, readJsonSafe } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface StorefrontPreviewProps {
    handle: string;
    storefrontKey: number;
    onRestyle: () => void;
    creatorId: string;
}

function normalizePath(path: string): string {
    if (!path) return '/';
    const withLeadingSlash = path.startsWith('/') ? path : `/${path}`;
    return withLeadingSlash.length > 1
        ? withLeadingSlash.replace(/\/+$/, '')
        : withLeadingSlash;
}

export function StorefrontPreview({ handle, storefrontKey, onRestyle, creatorId }: StorefrontPreviewProps) {
    const [designPrompt, setDesignPrompt] = useState('');
    const [restyling, setRestyling] = useState(false);
    const [iframeLoaded, setIframeLoaded] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const storefrontPath = `/c/${handle}`;
    const normalizedStorefrontPath = normalizePath(storefrontPath);

    const applyRestyle = useCallback(async (prompt: string) => {
        if (!prompt.trim() || restyling) return;

        setRestyling(true);
        setError(null);
        try {
            const res = await fetch('/api/storefront/restyle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ creatorId, prompt }),
            });

            const payload = await readJsonSafe<{ error?: string }>(res);
            if (!res.ok) {
                if (isAuthStatus(res.status)) {
                    window.location.href = '/sign-in?next=%2Fdashboard';
                    return;
                }
                setError(getApiErrorMessage(payload, 'Could not apply storefront style changes.'));
                return;
            }

            setDesignPrompt('');
            onRestyle();
        } catch {
            setError('Network error while applying storefront style changes.');
        } finally {
            setRestyling(false);
        }
    }, [creatorId, onRestyle, restyling]);

    const handleRestyle = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        await applyRestyle(designPrompt);
    }, [applyRestyle, designPrompt]);

    const forceStorefrontPath = useCallback(() => {
        const iframe = iframeRef.current;
        if (!iframe) return;

        try {
            iframe.contentWindow?.location.replace(storefrontPath);
        } catch {
            // Fallback when location access is blocked by browser policies.
            iframe.src = storefrontPath;
        }
        setIframeLoaded(false);
    }, [storefrontPath]);

    const validateIframePath = useCallback(() => {
        const iframe = iframeRef.current;
        if (!iframe) return;

        try {
            const currentPath = normalizePath(iframe.contentWindow?.location.pathname || '');
            if (currentPath !== normalizedStorefrontPath) {
                forceStorefrontPath();
                return;
            }
            setIframeLoaded(true);
        } catch {
            forceStorefrontPath();
        }
    }, [forceStorefrontPath, normalizedStorefrontPath]);

    useEffect(() => {
        setIframeLoaded(false);
    }, [handle, storefrontKey]);

    useEffect(() => {
        const intervalId = window.setInterval(() => {
            const iframe = iframeRef.current;
            if (!iframe || !iframe.contentWindow) return;

            try {
                const currentPath = normalizePath(iframe.contentWindow.location.pathname || '');
                if (currentPath !== normalizedStorefrontPath) {
                    forceStorefrontPath();
                }
            } catch {
                forceStorefrontPath();
            }
        }, 500);

        return () => window.clearInterval(intervalId);
    }, [forceStorefrontPath, normalizedStorefrontPath]);

    return (
        <div className="flex h-full min-h-0 flex-col items-center gap-3 overflow-y-auto p-3 sm:p-4">
            <div className="relative aspect-[9/19.5] w-full max-w-[340px] min-h-[260px] overflow-hidden rounded-[2rem] border border-slate-200 bg-slate-100 p-2">
                <div className="relative h-full w-full overflow-hidden rounded-[1.6rem] border border-slate-200 bg-white">
                    <div className="absolute left-1/2 top-0 z-10 h-5 w-28 -translate-x-1/2 rounded-b-xl border border-t-0 border-slate-200 bg-slate-100" />
                    {!iframeLoaded && (
                        <div className="absolute inset-0 z-[5] flex flex-col items-center justify-center gap-2 text-xs text-slate-500">
                            <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-slate-500" />
                            <span>Loading storefront</span>
                        </div>
                    )}
                    <iframe
                        ref={iframeRef}
                        key={storefrontKey}
                        src={storefrontPath}
                        className={`h-full w-full border-0 bg-white transition-opacity duration-300 ${iframeLoaded ? 'opacity-100' : 'opacity-0'}`}
                        title="Storefront Preview"
                        sandbox="allow-same-origin allow-scripts"
                        onLoad={validateIframePath}
                    />
                </div>
            </div>

            <form className="flex w-full max-w-[340px] gap-2" onSubmit={handleRestyle}>
                <Input
                    value={designPrompt}
                    onChange={(e) => setDesignPrompt(e.target.value)}
                    placeholder="Describe the redesign direction..."
                    className="h-9 flex-1 text-sm"
                    disabled={restyling}
                />
                <Button
                    type="submit"
                    size="sm"
                    className="h-9 px-3 text-xs font-semibold"
                    disabled={restyling || !designPrompt.trim()}
                >
                    {restyling ? 'Applying' : 'Apply'}
                </Button>
            </form>

            {error && <p className="w-full max-w-[340px] rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
        </div>
    );
}
