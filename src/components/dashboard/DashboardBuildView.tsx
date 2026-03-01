'use client';

import { useCallback, useMemo, useState } from 'react';
import { ProductBuilder } from './ProductBuilder';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { formatBuildModeLabel, formatStageTimingSummary, parseBuildMetadata } from '@/lib/products/build-metadata';
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

const TYPE_LABELS: Record<string, string> = {
    pdf_guide: 'PDF Guide',
    mini_course: 'Mini Course',
    challenge_7day: '7-Day Challenge',
    checklist_toolkit: 'Checklist Toolkit',
};

function formatCreatedDate(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return 'Unknown date';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function DashboardBuildView({ creatorId, displayName, initialProducts }: DashboardBuildViewProps) {
    const [products, setProducts] = useState<ProductSummary[]>(initialProducts);
    const [productsError, setProductsError] = useState<string | null>(null);

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

    const recentProjects = useMemo(() => products.slice(0, 8), [products]);

    return (
        <div className="h-full min-h-0 overflow-y-auto bg-slate-50">
            <div className="mx-auto w-full max-w-[1300px] space-y-5 p-3 sm:p-5">
                <section className="relative overflow-hidden rounded-2xl border border-orange-200/70 bg-gradient-to-br from-amber-50 via-orange-50 to-rose-100 p-3 sm:p-5">
                    <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-orange-300/35 blur-3xl" />
                    <div className="pointer-events-none absolute -left-16 bottom-0 h-44 w-44 rounded-full bg-amber-300/35 blur-3xl" />

                    <div className="relative z-10 space-y-4">
                        <div>
                            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
                                What digital product will you build today?
                            </h1>
                            <p className="mt-1 text-sm text-slate-600">
                                Build from your real content, iterate fast, and ship polished products.
                            </p>
                        </div>

                        <div className="overflow-hidden rounded-2xl border border-white/80 bg-white/85 shadow-[0_20px_50px_-28px_rgba(15,23,42,0.45)] backdrop-blur">
                            <div className="h-[70vh] min-h-[560px]">
                                <ProductBuilder
                                    creatorId={creatorId}
                                    displayName={displayName}
                                    onProductCreated={handleProductCreated}
                                />
                            </div>
                        </div>
                    </div>
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                    <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                            <h2 className="text-lg font-semibold tracking-tight text-slate-900">Recent Projects</h2>
                            <p className="text-sm text-slate-500">Drafts and published digital products.</p>
                        </div>
                        <Button type="button" size="sm" variant="outline" onClick={() => void refreshProducts()}>
                            Refresh
                        </Button>
                    </div>

                    {productsError && (
                        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                            {productsError}
                        </div>
                    )}

                    {recentProjects.length === 0 ? (
                        <Card className="border-dashed py-0 shadow-none">
                            <CardContent className="px-5 py-10 text-center">
                                <p className="text-base font-semibold text-slate-900">No projects yet</p>
                                <p className="mt-1 text-sm text-slate-500">
                                    Your first generated product will appear here.
                                </p>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="grid grid-cols-1 gap-2">
                            {recentProjects.map((product) => (
                                <Card key={product.id} className="py-0 shadow-none">
                                    <CardContent className="flex items-center justify-between gap-3 px-4 py-3.5">
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-medium text-slate-900">{product.title}</p>
                                            <p className="mt-0.5 truncate text-xs text-slate-500">
                                                {TYPE_LABELS[product.type] || product.type} · {formatCreatedDate(product.created_at)}
                                            </p>
                                            {(() => {
                                                const buildMetadata = parseBuildMetadata(product.active_build_packet || null);
                                                if (!buildMetadata) return null;
                                                const modeLabel = formatBuildModeLabel(buildMetadata.htmlBuildMode);
                                                const timingLabel = formatStageTimingSummary(buildMetadata.stageTimingsMs);
                                                return (
                                                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                                        {modeLabel && (
                                                            <Badge variant="outline" className="text-[10px] uppercase tracking-[0.08em]">
                                                                {modeLabel}
                                                            </Badge>
                                                        )}
                                                        {typeof product.active_version_number === 'number' && (
                                                            <Badge variant="outline" className="text-[10px] uppercase tracking-[0.08em]">
                                                                v{product.active_version_number}
                                                            </Badge>
                                                        )}
                                                        {typeof buildMetadata.qualityOverallScore === 'number' && (
                                                            <Badge
                                                                variant={buildMetadata.qualityOverallPassed ? 'secondary' : 'outline'}
                                                                className="text-[10px] uppercase tracking-[0.08em]"
                                                            >
                                                                Q{buildMetadata.qualityOverallScore}
                                                            </Badge>
                                                        )}
                                                        {timingLabel && (
                                                            <span className="text-[11px] text-slate-500">{timingLabel}</span>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                        </div>

                                        <div className="flex shrink-0 items-center gap-2">
                                            <Badge
                                                variant={product.status === 'published' ? 'secondary' : 'outline'}
                                                className="text-[10px] uppercase tracking-[0.08em]"
                                            >
                                                {product.status}
                                            </Badge>
                                            <Button asChild size="xs" variant="outline">
                                                <a href={`/products/${product.id}/builder`}>Open</a>
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
