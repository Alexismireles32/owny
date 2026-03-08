'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Laptop2, LoaderCircle, Sparkles } from 'lucide-react';

interface PublicGeneratedHtmlFrameProps {
    html: string;
    title: string;
    className?: string;
    minHeight?: number;
}

export function PublicGeneratedHtmlFrame({
    html,
    title,
    className = '',
    minHeight = 960,
}: PublicGeneratedHtmlFrameProps) {
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const [frameHeight, setFrameHeight] = useState(minHeight);
    const [loaded, setLoaded] = useState(false);

    const measureFrame = useCallback(() => {
        const iframe = iframeRef.current;
        if (!iframe) return;

        try {
            const doc = iframe.contentDocument;
            if (!doc) return;

            const nextHeight = Math.max(
                doc.body?.scrollHeight || 0,
                doc.body?.offsetHeight || 0,
                doc.documentElement?.scrollHeight || 0,
                doc.documentElement?.offsetHeight || 0,
                minHeight
            );

            if (nextHeight > 0) {
                setFrameHeight(nextHeight + 4);
                setLoaded(true);
            }
        } catch {
            // Ignore measurement failures while the iframe is still loading.
        }
    }, [minHeight]);

    useEffect(() => {
        const iframe = iframeRef.current;
        if (!iframe) return;

        let observer: ResizeObserver | null = null;
        let intervalId: number | null = null;

        const attachObserver = () => {
            try {
                const doc = iframe.contentDocument;
                const root = doc?.documentElement;
                const body = doc?.body;
                if (!root || typeof ResizeObserver === 'undefined') return;

                observer?.disconnect();
                observer = new ResizeObserver(() => {
                    measureFrame();
                });
                observer.observe(root);
                if (body) observer.observe(body);
            } catch {
                // Keep polling if ResizeObserver cannot be attached.
            }
        };

        const handleLoad = () => {
            measureFrame();
            attachObserver();
        };

        iframe.addEventListener('load', handleLoad);
        intervalId = window.setInterval(() => {
            measureFrame();
        }, 1200);

        window.setTimeout(() => {
            measureFrame();
        }, 80);

        return () => {
            iframe.removeEventListener('load', handleLoad);
            observer?.disconnect();
            if (intervalId) {
                window.clearInterval(intervalId);
            }
        };
    }, [html, measureFrame, minHeight]);

    return (
        <div className={`overflow-hidden rounded-[30px] border border-slate-200/80 bg-white shadow-[0_28px_80px_-48px_rgba(15,23,42,0.32)] ${className}`}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 bg-white/90 px-4 py-3 backdrop-blur sm:px-5">
                <div className="flex items-center gap-2">
                    <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 p-1 text-slate-700">
                        <Laptop2 className="size-3.5" />
                    </span>
                    <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Sales Page</p>
                        <p className="text-sm font-medium text-slate-900">{title}</p>
                    </div>
                </div>
                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    {loaded ? 'Live render' : 'Loading'}
                </span>
            </div>

            <div className="relative bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.10),transparent_32%),linear-gradient(180deg,rgba(248,250,252,1),rgba(255,255,255,1))] p-3 sm:p-4">
                {!loaded && (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white/90 text-sm text-slate-500 backdrop-blur-sm">
                        <LoaderCircle className="size-5 animate-spin" />
                        <span>Loading the product page</span>
                    </div>
                )}
                <div className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-[0_24px_70px_-52px_rgba(15,23,42,0.35)]">
                    <iframe
                        ref={iframeRef}
                        srcDoc={html}
                        title={title}
                        sandbox="allow-same-origin allow-scripts"
                        className="w-full border-0 bg-white"
                        style={{ height: `${frameHeight}px`, minHeight: `${minHeight}px` }}
                    />
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1">
                        <Sparkles className="size-3.5" />
                        Auto-sized to content
                    </span>
                </div>
            </div>
        </div>
    );
}
