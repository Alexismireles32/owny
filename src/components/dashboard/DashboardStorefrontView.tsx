'use client';

import { useCallback, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { StorefrontPreview } from './StorefrontPreview';

interface DashboardStorefrontViewProps {
    creatorId: string;
    handle: string;
}

export function DashboardStorefrontView({ creatorId, handle }: DashboardStorefrontViewProps) {
    const [storefrontKey, setStorefrontKey] = useState(0);

    const refreshStorefront = useCallback(() => {
        setStorefrontKey((prev) => prev + 1);
    }, []);

    return (
        <div className="h-full min-h-0 overflow-y-auto bg-[linear-gradient(180deg,#f8fafc_0%,#eff6ff_26%,#ffffff_100%)]">
            <div className="mx-auto flex min-h-full w-full max-w-[1380px] flex-col gap-5 p-3 sm:p-5">
                <section className="relative overflow-hidden rounded-[32px] border border-sky-200/70 bg-[linear-gradient(135deg,rgba(239,246,255,1),rgba(255,255,255,0.94),rgba(224,242,254,1))] p-5 shadow-[0_28px_70px_-52px_rgba(15,23,42,0.35)] sm:p-6">
                    <div className="pointer-events-none absolute -right-12 -top-16 h-52 w-52 rounded-full bg-sky-300/30 blur-3xl" />
                    <div className="pointer-events-none absolute -left-10 bottom-0 h-44 w-44 rounded-full bg-amber-200/30 blur-3xl" />
                    <Badge variant="outline" className="border-sky-200 bg-white/70 text-[10px] uppercase tracking-[0.16em] text-sky-900">
                        Storefront Control
                    </Badge>
                    <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
                        <div className="max-w-3xl">
                            <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                                Make your creator hub feel unmistakably yours.
                            </h1>
                            <p className="mt-3 text-sm leading-6 text-slate-700 sm:text-base">
                                Refine the visual direction of your public storefront, preview it live, and keep it aligned
                                with the same premium language as the product builder.
                            </p>
                        </div>
                        <div className="rounded-[24px] border border-white/80 bg-white/75 px-4 py-3 shadow-[0_20px_55px_-40px_rgba(15,23,42,0.3)] backdrop-blur">
                            <div className="flex items-center gap-2 text-slate-900">
                                <Sparkles className="size-4 text-sky-700" />
                                <span className="text-sm font-medium">Public path</span>
                            </div>
                            <p className="mt-2 text-lg font-semibold tracking-tight text-slate-950">/c/{handle}</p>
                        </div>
                    </div>
                </section>

                <div className="min-h-0 flex-1">
                    <StorefrontPreview
                        creatorId={creatorId}
                        handle={handle}
                        storefrontKey={storefrontKey}
                        onRestyle={refreshStorefront}
                    />
                </div>
            </div>
        </div>
    );
}
