'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
    ArrowUpRight,
    Check,
    Laptop2,
    Palette,
    RefreshCcw,
    Smartphone,
    Sparkles,
    Wand2,
} from 'lucide-react';
import { getApiErrorMessage, isAuthStatus, readJsonSafe } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface StorefrontPreviewProps {
    handle: string;
    storefrontKey: number;
    onRestyle: () => void;
    creatorId: string;
}

const STYLE_PRESETS = [
    {
        label: 'Editorial luxury',
        hint: 'Elegant typography, restrained color, premium spacing',
        prompt: 'Make the storefront feel like an editorial luxury brand with elegant typography, restrained color, and premium spacing.',
    },
    {
        label: 'Creator energy',
        hint: 'Bold, bright, high-conversion with punchy contrast',
        prompt: 'Make the storefront feel bold, bright, creator-native, and high-conversion with strong sections and punchy contrast.',
    },
    {
        label: 'Minimal clarity',
        hint: 'Clean, legible, calm color, simple hierarchy',
        prompt: 'Restyle the storefront to feel minimal, clean, and highly legible with calm color and simple product hierarchy.',
    },
];

type PreviewMode = 'mobile' | 'desktop';

function normalizePath(path: string): string {
    if (!path) return '/';
    const withLeadingSlash = path.startsWith('/') ? path : `/${path}`;
    return withLeadingSlash.length > 1
        ? withLeadingSlash.replace(/\/+$/, '')
        : withLeadingSlash;
}

export function StorefrontPreview({ handle, storefrontKey, onRestyle, creatorId }: StorefrontPreviewProps) {
    const shouldReduceMotion = useReducedMotion();
    const [designPrompt, setDesignPrompt] = useState('');
    const [restyling, setRestyling] = useState(false);
    const [iframeLoaded, setIframeLoaded] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [previewMode, setPreviewMode] = useState<PreviewMode>('mobile');
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const storefrontPath = `/c/${handle}`;
    const normalizedStorefrontPath = normalizePath(storefrontPath);

    // Auto-dismiss success toast
    useEffect(() => {
        if (!success) return;
        const id = window.setTimeout(() => setSuccess(false), 3000);
        return () => window.clearTimeout(id);
    }, [success]);

    const applyRestyle = useCallback(async (prompt: string) => {
        if (!prompt.trim() || restyling) return;

        setRestyling(true);
        setError(null);
        setSuccess(false);
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
            setSuccess(true);
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
        <div className="min-h-0 overflow-y-auto bg-[linear-gradient(180deg,rgba(248,250,252,1),rgba(255,255,255,1))] p-3 sm:p-4">
            <div className="grid min-h-full gap-4 xl:grid-cols-[minmax(300px,0.9fr)_minmax(340px,0.8fr)]">
                {/* ── Left Panel: Controls ─────────── */}
                <motion.div
                    initial={shouldReduceMotion ? false : { opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.34, ease: 'easeOut' }}
                    className="rounded-[30px] border border-slate-200/80 bg-white/90 p-4 shadow-[0_28px_70px_-48px_rgba(15,23,42,0.35)] backdrop-blur sm:p-5"
                >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                Storefront Studio
                            </p>
                            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                                Direct the vibe of your storefront.
                            </h2>
                            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
                                Describe the creative direction you want and preview it on the live creator hub before
                                sending traffic there.
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button type="button" size="sm" variant="outline" onClick={forceStorefrontPath}>
                                <RefreshCcw />
                                Reload
                            </Button>
                            <Button asChild size="sm" variant="outline">
                                <a href={storefrontPath} target="_blank" rel="noreferrer">
                                    <ArrowUpRight />
                                    Open live
                                </a>
                            </Button>
                        </div>
                    </div>

                    {/* Quick-start presets with hover hints */}
                    <div className="mt-5 rounded-[28px] border border-slate-200 bg-[linear-gradient(135deg,rgba(15,23,42,0.98),rgba(30,41,59,0.94))] p-5 text-white shadow-[0_32px_80px_-48px_rgba(15,23,42,0.75)]">
                        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                            <Wand2 className="size-3.5" />
                            Quick starts
                        </div>
                        <div className="mt-4 space-y-2">
                            {STYLE_PRESETS.map((preset, index) => (
                                <motion.button
                                    key={preset.label}
                                    type="button"
                                    initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={
                                        shouldReduceMotion
                                            ? { duration: 0 }
                                            : { duration: 0.24, delay: 0.04 * index, ease: 'easeOut' }
                                    }
                                    whileHover={shouldReduceMotion ? undefined : { y: -2 }}
                                    className="flex w-full items-start gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-left transition-colors hover:bg-white/12"
                                    onClick={() => void applyRestyle(preset.prompt)}
                                    disabled={restyling}
                                >
                                    <Palette className="mt-0.5 size-4 shrink-0 text-slate-400" />
                                    <div>
                                        <span className="text-sm font-medium text-white">{preset.label}</span>
                                        <p className="mt-0.5 text-xs text-slate-400">{preset.hint}</p>
                                    </div>
                                </motion.button>
                            ))}
                        </div>
                    </div>

                    <form className="mt-5 rounded-[28px] border border-slate-200 bg-white p-3 shadow-[0_18px_50px_-40px_rgba(15,23,42,0.28)]" onSubmit={handleRestyle}>
                        <div className="flex items-center gap-2 rounded-[22px] border border-slate-200 bg-slate-50/70 px-2 py-2">
                            <Palette className="ml-2 hidden size-4 text-slate-400 sm:block" />
                            <Input
                                value={designPrompt}
                                onChange={(e) => setDesignPrompt(e.target.value)}
                                placeholder="Describe the redesign direction..."
                                className="h-10 flex-1 border-0 bg-transparent px-2 text-sm shadow-none focus-visible:ring-0"
                                disabled={restyling}
                            />
                            <Button
                                type="submit"
                                size="sm"
                                className="h-10 rounded-xl px-4"
                                disabled={restyling || !designPrompt.trim()}
                            >
                                <Sparkles />
                                {restyling ? 'Applying' : 'Apply'}
                            </Button>
                        </div>
                    </form>

                    {/* Success toast */}
                    {success && (
                        <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 8 }}
                            className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700"
                        >
                            <Check className="size-3.5" />
                            Style applied! The preview will refresh automatically.
                        </motion.div>
                    )}

                    {error && (
                        <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                            {error}
                        </p>
                    )}
                </motion.div>

                {/* ── Right Panel: Preview ─────────── */}
                <motion.div
                    initial={shouldReduceMotion ? false : { opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.34, delay: 0.05, ease: 'easeOut' }}
                    className="rounded-[30px] border border-slate-200/80 bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.12),transparent_30%),linear-gradient(180deg,rgba(248,250,252,1),rgba(255,255,255,1))] p-4 shadow-[0_28px_70px_-48px_rgba(15,23,42,0.35)] sm:p-5"
                >
                    {/* Header with mode toggle */}
                    <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Live Preview</p>
                            <p className="mt-1 text-sm font-medium text-slate-900">@{handle}</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                            {/* Mode toggle */}
                            <div className="flex rounded-full border border-slate-200 bg-slate-50 p-0.5">
                                <button
                                    type="button"
                                    onClick={() => setPreviewMode('mobile')}
                                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors ${
                                        previewMode === 'mobile'
                                            ? 'bg-white text-slate-900 shadow-sm'
                                            : 'text-slate-500 hover:text-slate-700'
                                    }`}
                                >
                                    <Smartphone className="size-3" />
                                    Mobile
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPreviewMode('desktop')}
                                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors ${
                                        previewMode === 'desktop'
                                            ? 'bg-white text-slate-900 shadow-sm'
                                            : 'text-slate-500 hover:text-slate-700'
                                    }`}
                                >
                                    <Laptop2 className="size-3" />
                                    Desktop
                                </button>
                            </div>
                            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                                {iframeLoaded ? 'Synced' : 'Loading'}
                            </span>
                        </div>
                    </div>

                    {/* Preview Frame */}
                    {previewMode === 'mobile' ? (
                        <div className="mx-auto relative aspect-[9/19.5] w-full max-w-[340px] min-h-[260px] overflow-hidden rounded-[2.4rem] border border-slate-200 bg-[linear-gradient(180deg,rgba(226,232,240,1),rgba(241,245,249,1))] p-2 shadow-[0_36px_90px_-56px_rgba(15,23,42,0.65)]">
                            <div className="absolute inset-x-8 top-2 h-5 rounded-full bg-white/40 blur-xl" />
                            <div className="relative h-full w-full overflow-hidden rounded-[1.9rem] border border-slate-200 bg-white">
                                <div className="absolute left-1/2 top-0 z-10 h-5 w-28 -translate-x-1/2 rounded-b-xl border border-t-0 border-slate-200 bg-slate-100" />
                                {!iframeLoaded && (
                                    <div className="absolute inset-0 z-[5] flex flex-col items-center justify-center gap-2 text-xs text-slate-500">
                                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-slate-500" />
                                        <span>Loading storefront</span>
                                    </div>
                                )}
                                <iframe
                                    ref={iframeRef}
                                    key={`${storefrontKey}-${previewMode}`}
                                    src={storefrontPath}
                                    className={`h-full w-full border-0 bg-white transition-opacity duration-300 ${iframeLoaded ? 'opacity-100' : 'opacity-0'}`}
                                    title="Storefront Preview"
                                    sandbox="allow-same-origin allow-scripts"
                                    onLoad={validateIframePath}
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="relative min-h-[420px] w-full overflow-hidden rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,rgba(226,232,240,1),rgba(241,245,249,1))] p-1.5 shadow-[0_36px_90px_-56px_rgba(15,23,42,0.5)]">
                            {/* Desktop browser chrome */}
                            <div className="flex items-center gap-1.5 rounded-t-xl border-b border-slate-200 bg-slate-100 px-3 py-2">
                                <span className="size-2.5 rounded-full bg-red-400" />
                                <span className="size-2.5 rounded-full bg-amber-400" />
                                <span className="size-2.5 rounded-full bg-emerald-400" />
                                <span className="ml-2 flex-1 rounded-md bg-white px-2 py-0.5 text-[10px] text-slate-400">
                                    owny.io/c/{handle}
                                </span>
                            </div>
                            {!iframeLoaded && (
                                <div className="absolute inset-0 z-[5] flex flex-col items-center justify-center gap-2 text-xs text-slate-500">
                                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-slate-500" />
                                    <span>Loading storefront</span>
                                </div>
                            )}
                            <iframe
                                ref={iframeRef}
                                key={`${storefrontKey}-${previewMode}`}
                                src={storefrontPath}
                                className={`h-[480px] w-full border-0 bg-white transition-opacity duration-300 ${iframeLoaded ? 'opacity-100' : 'opacity-0'}`}
                                title="Storefront Preview"
                                sandbox="allow-same-origin allow-scripts"
                                onLoad={validateIframePath}
                            />
                        </div>
                    )}

                    <div className="mx-auto mt-4 flex max-w-[420px] items-center justify-between rounded-[22px] border border-slate-200 bg-white/90 px-4 py-3 text-xs text-slate-500 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.3)]">
                        <span>{previewMode === 'mobile' ? 'Portrait preview' : 'Desktop preview'}</span>
                        <span>{normalizePath(storefrontPath)}</span>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
