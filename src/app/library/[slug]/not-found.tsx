// Custom 404 for library content viewer 
import Link from 'next/link';

export default function LibraryContentNotFound() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
            <div className="text-center max-w-md">
                <p className="text-5xl mb-4">📚</p>
                <h1 className="text-2xl font-bold text-slate-900 mb-2">Content Not Found</h1>
                <p className="text-slate-500 mb-6">
                    This content doesn&apos;t exist or you may not have access to it.
                </p>
                <Link
                    href="/library"
                    className="inline-flex items-center px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
                >
                    Back to Library
                </Link>
            </div>
        </div>
    );
}
