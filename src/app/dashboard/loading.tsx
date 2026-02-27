export default function DashboardLoading() {
    return (
        <div className="flex h-screen flex-col bg-slate-100">
            <header className="h-14 border-b border-slate-200 bg-white px-4 sm:px-6">
                <div className="mx-auto flex h-full w-full max-w-[1600px] items-center justify-between">
                    <div className="h-4 w-16 animate-pulse rounded bg-slate-200" />
                    <div className="h-8 w-20 animate-pulse rounded bg-slate-200" />
                </div>
            </header>

            <div className="min-h-0 flex-1 p-2 sm:p-3">
                <div className="mx-auto flex h-full w-full max-w-[1600px] gap-2">
                    <aside className="w-16 shrink-0 rounded-xl border border-slate-200 bg-white sm:w-56">
                        <div className="space-y-2 p-2 sm:p-3">
                            <div className="h-3 w-10 animate-pulse rounded bg-slate-200" />
                            <div className="h-10 animate-pulse rounded bg-slate-100" />
                            <div className="h-10 animate-pulse rounded bg-slate-100" />
                            <div className="h-10 animate-pulse rounded bg-slate-100" />
                        </div>
                    </aside>

                    <main className="min-h-0 flex-1 rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
                        <div className="space-y-3">
                            <div className="h-4 w-48 animate-pulse rounded bg-slate-200" />
                            <div className="h-10 w-full animate-pulse rounded bg-slate-100" />
                            <div className="h-10 w-full animate-pulse rounded bg-slate-100" />
                            <div className="h-[60vh] w-full animate-pulse rounded bg-slate-100" />
                        </div>
                    </main>
                </div>
            </div>
        </div>
    );
}
