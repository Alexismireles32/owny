// Loading skeleton for product sales page
export default function ProductLoading() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
            <div className="container mx-auto max-w-3xl px-4 py-12">
                {/* Back link skeleton */}
                <div className="w-24 h-4 rounded bg-slate-200 animate-pulse mb-8" />

                {/* Product header skeleton */}
                <div className="space-y-4 mb-8">
                    <div className="w-20 h-6 rounded-full bg-slate-200 animate-pulse" />
                    <div className="w-3/4 h-10 rounded bg-slate-200 animate-pulse" />
                    <div className="w-full h-5 rounded bg-slate-100 animate-pulse" />
                    <div className="w-2/3 h-5 rounded bg-slate-100 animate-pulse" />
                </div>

                {/* Content skeleton */}
                <div className="rounded-xl bg-white border border-slate-200 p-8 space-y-4">
                    <div className="w-full h-64 rounded-lg bg-slate-50 animate-pulse" />
                </div>

                {/* CTA skeleton */}
                <div className="mt-8 flex justify-center">
                    <div className="w-48 h-12 rounded-lg bg-slate-200 animate-pulse" />
                </div>
            </div>
        </div>
    );
}
