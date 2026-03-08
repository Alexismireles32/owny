import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { DashboardSidebarNav } from '@/components/dashboard/DashboardSidebarNav';
import { MobileBottomNav } from '@/components/dashboard/MobileBottomNav';
import { getDashboardContext } from './_lib/get-dashboard-context';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
    const { creator } = await getDashboardContext();

    return (
        <div className="flex h-screen flex-col bg-slate-50 text-slate-900 selection:bg-slate-200">
            <header className="sticky top-0 z-40 h-14 border-b border-slate-200/60 bg-white/80 backdrop-blur-md">
                <div className="mx-auto flex h-full w-full max-w-[1600px] items-center justify-between px-4 sm:px-6">
                    <div className="flex items-center gap-4">
                        <span className="text-sm font-bold tracking-[0.05em] text-slate-950">OWNY</span>
                        {creator.stripe_connect_status !== 'connected' && (
                            <a href="/connect-stripe" className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-orange-200/60 bg-orange-50/50 px-2.5 py-1 text-xs font-medium text-orange-700 hover:bg-orange-100/50 transition-colors">
                                <span className="relative flex h-2 w-2">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
                                </span>
                                Connect Stripe
                            </a>
                        )}
                    </div>

                    <div className="flex items-center gap-3">
                        <span className="hidden text-sm text-slate-500 sm:inline">{creator.display_name}</span>
                        <form action="/api/auth/signout" method="POST">
                            <Button type="submit" size="sm" variant="outline" className="hidden sm:inline-flex">
                                Sign out
                            </Button>
                        </form>
                    </div>
                </div>
            </header>

            {creator.stripe_connect_status !== 'connected' && (
                <div className="sm:hidden border-b border-orange-100 bg-orange-50/50 px-4 py-2">
                    <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between gap-2 text-sm text-orange-900">
                        <span className="text-xs">Stripe required to sell</span>
                        <Button asChild size="sm" variant="outline" className="h-7 border-orange-200 bg-white text-orange-900 hover:bg-orange-100 text-xs px-2">
                            <a href="/connect-stripe">Connect</a>
                        </Button>
                    </div>
                </div>
            )}

            <div className="min-h-0 flex-1 p-2 pb-16 sm:p-5 sm:pb-5">
                <div className="mx-auto flex h-full w-full max-w-[1600px] gap-3 sm:gap-5">
                    <DashboardSidebarNav
                        displayName={creator.display_name}
                        handle={creator.handle}
                        avatarUrl={creator.avatar_url}
                    />
                    <main className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-slate-200/40 bg-white shadow-sm">
                        {children}
                    </main>
                </div>
            </div>

            <MobileBottomNav />
        </div>
    );
}

