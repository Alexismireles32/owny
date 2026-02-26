// Loading skeleton for library content viewer
export default function LibraryLoading() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
            <div className="container mx-auto max-w-3xl px-4 py-12">
                {/* Header skeleton */}
                <div className="flex items-center gap-3 mb-8">
                    <div className="w-6 h-6 rounded bg-slate-200 animate-pulse" />
                    <div className="w-48 h-5 rounded bg-slate-200 animate-pulse" />
                </div>

                {/* Title skeleton */}
                <div className="space-y-3 mb-8">
                    <div className="w-3/4 h-8 rounded bg-slate-200 animate-pulse" />
                    <div className="w-1/2 h-5 rounded bg-slate-100 animate-pulse" />
                </div>

                {/* Content card skeleton */}
                <div className="rounded-xl bg-white border border-slate-200 p-8 space-y-4">
                    <div className="w-full h-4 rounded bg-slate-100 animate-pulse" />
                    <div className="w-5/6 h-4 rounded bg-slate-100 animate-pulse" />
                    <div className="w-4/6 h-4 rounded bg-slate-100 animate-pulse" />
                    <div className="w-full h-48 rounded-lg bg-slate-50 animate-pulse mt-4" />
                </div>
            </div>
        </div>
    );
}
