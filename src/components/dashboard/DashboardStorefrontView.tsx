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
        <div className="h-full min-h-0 overflow-y-auto bg-transparent relative">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-[500px] bg-[radial-gradient(ellipse_100%_100%_at_50%_-20%,rgba(14,165,233,0.08),transparent)]" />
            
            <div className="mx-auto flex min-h-full w-full max-w-[1240px] flex-col gap-6 p-4 sm:p-8 relative z-10">
                <section className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
                    <div className="max-w-2xl">
                        <Badge variant="outline" className="border-slate-200/80 bg-white/60 shadow-sm text-[10px] uppercase tracking-[0.16em] text-slate-600 mb-4 px-2.5 py-0.5 backdrop-blur-sm">
                            Storefront Control
                        </Badge>
                        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl lg:text-[2.5rem] leading-tight">
                            Make your creator hub <br className="hidden sm:block" />
                            <span className="text-slate-500">feel unmistakably yours.</span>
                        </h1>
                    </div>
                    
                    <div className="flex shrink-0">
                        <div className="flex items-center gap-4 rounded-xl border border-slate-200/60 bg-white/60 px-5 py-3 shadow-sm backdrop-blur-md">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-50 text-sky-600 border border-sky-100/50">
                                <Sparkles className="size-5" />
                            </div>
                            <div>
                                <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Public Path</p>
                                <p className="text-sm font-semibold text-slate-900 mt-0.5">/c/{handle}</p>
                            </div>
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
