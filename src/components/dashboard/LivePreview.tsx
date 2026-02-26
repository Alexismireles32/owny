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
        <div className={`relative w-full h-full overflow-hidden rounded-xl bg-white ${className}`}>
            {/* Loading shimmer overlay */}
            {isLoading && !html && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-gray-950/90">
                    <div className="flex flex-col items-center gap-4">
                        {/* Animated code icon */}
                        <div className="relative">
                            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center animate-pulse">
                                <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
                                </svg>
                            </div>
                            {/* Orbiting dot */}
                            <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full animate-bounce" />
                        </div>
                        <div className="text-white/80 text-sm font-medium">Building your product...</div>
                        {/* Shimmer bar */}
                        <div className="w-48 h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-full"
                                style={{
                                    animation: 'shimmer 2s ease-in-out infinite',
                                    width: '40%',
                                }}
                            />
                        </div>
                    </div>
                    <style>{`
                        @keyframes shimmer {
                            0% { transform: translateX(-100%); }
                            100% { transform: translateX(350%); }
                        }
                    `}</style>
                </div>
            )}

            {/* Status overlay when loading with partial HTML */}
            {isLoading && html && (
                <div className="absolute top-3 right-3 z-10 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/70 backdrop-blur-sm">
                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                    <span className="text-white/90 text-xs font-medium">Generating...</span>
                </div>
            )}

            {/* The iframe */}
            <iframe
                srcDoc={html || '<!DOCTYPE html><html><body></body></html>'}
                className="w-full h-full border-0"
                sandbox="allow-scripts allow-same-origin"
                title="Product Preview"
                style={{ backgroundColor: '#fff' }}
            />
        </div>
    );
}
