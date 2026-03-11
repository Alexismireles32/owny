'use client';

import { useCallback, useMemo, useState } from 'react';
import { Clock3, Layers3, Rocket } from 'lucide-react';
import { ProductBuilder } from './ProductBuilder';
import { Badge } from '@/components/ui/badge';
import { getApiErrorMessage, isAuthStatus, readJsonSafe } from '@/lib/utils';

interface DashboardBuildViewProps {
    creatorId: string;
    displayName: string;
    initialProducts: ProductSummary[];
}

interface ProductSummary {
    id: string;
    title: string;
    type: string;
    status: string;
    slug: string;
    created_at: string;
    active_version_number?: number | null;
    active_build_packet?: Record<string, unknown> | null;
}



export function DashboardBuildView({ creatorId, displayName, initialProducts }: DashboardBuildViewProps) {
    const [products, setProducts] = useState<ProductSummary[]>(initialProducts);
    const [, setProductsError] = useState<string | null>(null);

    const refreshProducts = useCallback(async () => {
        setProductsError(null);
        try {
            const res = await fetch('/api/products');
            const data = await readJsonSafe<{ products?: ProductSummary[]; error?: string }>(res);
            if (!res.ok) {
                if (isAuthStatus(res.status)) {
                    window.location.href = '/sign-in?next=%2Fdashboard';
                    return;
                }
                setProductsError(getApiErrorMessage(data, 'Could not refresh recent projects.'));
                return;
            }
            setProducts(Array.isArray(data?.products) ? data.products.slice(0, 12) : []);
        } catch {
            setProductsError('Network error while refreshing recent projects.');
        }
    }, []);

    const handleProductCreated = useCallback(() => {
        void refreshProducts();
    }, [refreshProducts]);

    const publishedCount = useMemo(() => products.filter((product) => product.status === 'published').length, [products]);
    const draftCount = useMemo(() => products.filter((product) => product.status !== 'published').length, [products]);

    return (
        <div className="flex h-full min-h-0 flex-col bg-transparent relative">
            {/* Subtle mesh/glow background */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-[400px] bg-[radial-gradient(ellipse_100%_100%_at_50%_-20%,rgba(120,119,198,0.12),transparent)]" />

            {/* Compact header bar with title + stats */}
            <div className="shrink-0 relative z-10 px-4 pt-4 pb-3 sm:px-6 sm:pt-5 sm:pb-3">
                <div className="mx-auto w-full max-w-[1400px]">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <Badge
                                variant="outline"
                                className="border-slate-200/80 bg-white/60 shadow-sm text-[10px] uppercase tracking-[0.16em] text-slate-600 px-2.5 py-0.5 backdrop-blur-sm"
                            >
                                Creation Hub
                            </Badge>
                            <h1 className="text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">
                                Build premium products
                            </h1>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <div className="flex items-center gap-2 rounded-lg border border-slate-200/60 bg-white/60 px-3 py-1.5 shadow-sm backdrop-blur-md text-xs">
                                <Layers3 className="size-3.5 text-slate-500" />
                                <span className="font-medium text-slate-900">{products.length}</span>
                                <span className="text-slate-400">projects</span>
                            </div>
                            <div className="flex items-center gap-2 rounded-lg border border-slate-200/60 bg-white/60 px-3 py-1.5 shadow-sm backdrop-blur-md text-xs">
                                <Rocket className="size-3.5 text-emerald-500" />
                                <span className="font-medium text-slate-900">{publishedCount}</span>
                                <span className="text-slate-400">published</span>
                            </div>
                            <div className="flex items-center gap-2 rounded-lg border border-slate-200/60 bg-white/60 px-3 py-1.5 shadow-sm backdrop-blur-md text-xs">
                                <Clock3 className="size-3.5 text-amber-500" />
                                <span className="font-medium text-slate-900">{draftCount}</span>
                                <span className="text-slate-400">drafts</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ProductBuilder fills all remaining height */}
            <div className="flex-1 min-h-0 px-4 pb-4 sm:px-6 sm:pb-5 relative z-10">
                <div className="mx-auto h-full w-full max-w-[1400px]">
                    <div className="h-full overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-slate-900/5">
                        <ProductBuilder
                            creatorId={creatorId}
                            displayName={displayName}
                            onProductCreated={handleProductCreated}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
