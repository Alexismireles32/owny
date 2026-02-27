import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { DashboardSidebarNav } from '@/components/dashboard/DashboardSidebarNav';
import { getDashboardContext } from './_lib/get-dashboard-context';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
    const { creator } = await getDashboardContext();

    return (
        <div className="flex h-screen flex-col bg-slate-100 text-slate-900">
            <header className="h-14 border-b border-slate-200 bg-white">
                <div className="mx-auto flex h-full w-full max-w-[1600px] items-center justify-between px-4 sm:px-6">
                    <span className="text-sm font-semibold tracking-[0.08em] text-slate-900">OWNY</span>

                    <div className="flex items-center gap-3">
                        <span className="hidden text-sm text-slate-500 sm:inline">{creator.display_name}</span>
                        <form action="/api/auth/signout" method="POST">
                            <Button type="submit" size="sm" variant="outline">
                                Sign out
                            </Button>
                        </form>
                    </div>
                </div>
            </header>

            {creator.stripe_connect_status !== 'connected' && (
                <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 sm:px-6">
                    <div className="mx-auto flex w-full max-w-[1600px] items-center justify-center gap-2 text-sm text-amber-900">
                        <span>Connect Stripe to start selling your products.</span>
                        <Button asChild size="sm" variant="outline" className="border-amber-300 bg-white text-amber-900 hover:bg-amber-100">
                            <a href="/connect-stripe">Connect now</a>
                        </Button>
                    </div>
                </div>
            )}

            <div className="min-h-0 flex-1 p-2 sm:p-3">
                <div className="mx-auto flex h-full w-full max-w-[1600px] gap-2">
                    <DashboardSidebarNav
                        displayName={creator.display_name}
                        handle={creator.handle}
                        avatarUrl={creator.avatar_url}
                    />
                    <main className="min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white">
                        {children}
                    </main>
                </div>
            </div>
        </div>
    );
}
