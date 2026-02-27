'use client';

// LivePreview — Sandboxed iframe for rendering AI-generated HTML
// Uses srcdoc to inject HTML directly, updates in real-time as content streams

interface LivePreviewProps {
    html: string;
    isLoading?: boolean;
    className?: string;
}

export default function LivePreview({ html, isLoading = false, className = '' }: LivePreviewProps) {
    if (!html && !isLoading) {
        return null;
    }

    return (
        <div className={`relative h-full w-full overflow-hidden rounded-xl border border-slate-200 bg-white ${className}`}>
            {isLoading && !html && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white/95 text-sm text-slate-600">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-slate-600" />
                    <span>Building your product...</span>
                </div>
            )}

            {isLoading && html && (
                <div className="absolute right-3 top-3 z-10 flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 backdrop-blur">
                    <div className="h-2 w-2 animate-pulse rounded-full bg-slate-500" />
                    <span className="text-xs font-medium text-slate-600">Generating</span>
                </div>
            )}

            <iframe
                srcDoc={html || '<!DOCTYPE html><html><body></body></html>'}
                className="h-full w-full border-0"
                sandbox="allow-scripts allow-same-origin"
                title="Product Preview"
                style={{ backgroundColor: '#fff' }}
            />
        </div>
    );
}
