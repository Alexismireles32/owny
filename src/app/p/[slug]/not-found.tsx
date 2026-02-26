// Custom 404 page for product pages
import Link from 'next/link';

export default function ProductNotFound() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
            <div className="text-center max-w-md">
                <p className="text-5xl mb-4">📦</p>
                <h1 className="text-2xl font-bold text-slate-900 mb-2">Product Not Found</h1>
                <p className="text-slate-500 mb-6">
                    This product doesn&apos;t exist or may have been removed.
                </p>
                <Link
                    href="/"
                    className="inline-flex items-center px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
                >
                    Go Home
                </Link>
            </div>
        </div>
    );
}
