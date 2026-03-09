'use client';

import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Laptop2, LoaderCircle, Smartphone, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

// LivePreview — Sandboxed iframe for rendering AI-generated HTML
// Uses srcdoc to inject HTML directly, updates in real-time as content streams

interface LivePreviewProps {
    html: string;
    isLoading?: boolean;
    className?: string;
}

export default function LivePreview({ html, isLoading = false, className = '' }: LivePreviewProps) {
    const shouldReduceMotion = useReducedMotion();
    const [surfaceMode, setSurfaceMode] = useState<'desktop' | 'mobile'>(() => {
        if (typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches) {
            return 'mobile';
        }
        return 'desktop';
    });

    return (
        <div
            className={`relative h-full w-full overflow-hidden rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,1))] shadow-[0_32px_80px_-48px_rgba(15,23,42,0.35)] ${className}`}
        >
            <div className="flex items-center justify-between border-b border-slate-200/60 bg-white/80 px-3 py-1.5 backdrop-blur">
                <div className="hidden items-center rounded-full border border-slate-200 bg-slate-100 p-0.5 sm:inline-flex">
                    <button
                        type="button"
                        onClick={() => setSurfaceMode('desktop')}
                        className={cn(
                            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] transition-colors',
                            surfaceMode === 'desktop' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                        )}
                    >
                        <Laptop2 className="size-3" />
                        Desktop
                    </button>
                    <button
                        type="button"
                        onClick={() => setSurfaceMode('mobile')}
                        className={cn(
                            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] transition-colors',
                            surfaceMode === 'mobile' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                        )}
                    >
                        <Smartphone className="size-3" />
                        Mobile
                    </button>
                </div>
                {isLoading && (
                    <div className="flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-500" />
                        <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-slate-400">Syncing</span>
                    </div>
                )}
            </div>

            <AnimatePresence initial={false}>
                {isLoading && !html && (
                    <motion.div
                        initial={shouldReduceMotion ? false : { opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={shouldReduceMotion ? undefined : { opacity: 0 }}
                        className="absolute inset-x-0 bottom-0 top-[33px] z-10 flex flex-col items-center justify-center gap-3 bg-white/92 text-sm text-slate-600 backdrop-blur-sm"
                    >
                        <LoaderCircle className="size-5 animate-spin text-slate-500" />
                        <span>Building your product...</span>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence initial={false}>
                {isLoading && html && (
                    <motion.div
                        initial={shouldReduceMotion ? false : { opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={shouldReduceMotion ? undefined : { opacity: 0, y: -6 }}
                        className="absolute right-4 top-20 z-10 flex items-center gap-2 rounded-full border border-sky-200 bg-white/95 px-3 py-1.5 shadow-sm backdrop-blur"
                    >
                        <div className="h-2 w-2 animate-pulse rounded-full bg-slate-500" />
                        <span className="text-xs font-medium text-slate-600">Generating</span>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="h-[calc(100%-33px)] bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.08),transparent_30%),linear-gradient(180deg,rgba(241,245,249,1),rgba(255,255,255,1))] p-2">
                {html ? (
                    <motion.div
                        initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.985 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.3, ease: 'easeOut' }}
                        className={cn(
                            'mx-auto h-full overflow-hidden bg-white shadow-[0_28px_70px_-46px_rgba(15,23,42,0.4)] transition-[max-width,border-radius,border-width] duration-300',
                            surfaceMode === 'mobile'
                                ? 'max-w-[390px] rounded-[34px] border-[10px] border-slate-950'
                                : 'max-w-full rounded-[24px] border border-slate-200/80'
                        )}
                    >
                        <iframe
                            srcDoc={html}
                            className="h-full w-full border-0"
                            sandbox="allow-scripts allow-same-origin"
                            title="Product Preview"
                            style={{ backgroundColor: '#fff' }}
                        />
                    </motion.div>
                ) : (
                    <motion.div
                        initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.34, ease: 'easeOut' }}
                        className="flex h-full flex-col items-center justify-center rounded-[24px] border border-dashed border-slate-300 bg-white/85 px-6 text-center"
                    >
                        <span className="rounded-full border border-amber-200 bg-amber-50 p-3 text-amber-700">
                            <Sparkles className="size-5" />
                        </span>
                        <h3 className="mt-4 text-lg font-semibold tracking-tight text-slate-950">
                            Your product preview will appear here.
                        </h3>
                        <p className="mt-2 max-w-md text-sm leading-6 text-slate-600">
                            Start with a format or describe the product you want. As Owny builds, the page will stream
                            into this canvas in real time.
                        </p>
                    </motion.div>
                )}
            </div>
        </div>
    );
}
