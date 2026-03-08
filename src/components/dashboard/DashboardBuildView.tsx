'use client';

import { useCallback, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Clock3, Layers3, Rocket, Sparkles } from 'lucide-react';
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
    const shouldReduceMotion = useReducedMotion();
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
    const publishedCount = useMemo(() => products.filter((product) => product.status === 'published').length, [products]);
    const draftCount = useMemo(() => products.filter((product) => product.status !== 'published').length, [products]);

    return (
        <div className="h-full min-h-0 overflow-y-auto bg-[linear-gradient(180deg,#f8fafc_0%,#fff7ed_28%,#ffffff_100%)]">
            <div className="mx-auto w-full max-w-[1380px] space-y-5 p-3 sm:p-5">
                <section className="relative overflow-hidden rounded-[32px] border border-orange-200/70 bg-gradient-to-br from-amber-50 via-orange-50 to-rose-100 p-4 sm:p-6">
                    <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-orange-300/35 blur-3xl" />
                    <div className="pointer-events-none absolute -left-20 bottom-0 h-56 w-56 rounded-full bg-amber-300/30 blur-3xl" />
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.72),transparent_60%)]" />

                    <div className="relative z-10 space-y-5">
                        <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
                            <motion.div
                                initial={shouldReduceMotion ? false : { opacity: 0, y: 18 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.4, ease: 'easeOut' }}
                            >
                                <Badge
                                    variant="outline"
                                    className="border-orange-200 bg-white/70 text-[10px] uppercase tracking-[0.16em] text-orange-900"
                                >
                                    Owny Studio
                                </Badge>
                                <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl lg:text-[2.9rem]">
                                    Build a premium digital product from your creator catalog.
                                </h1>
                                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-700 sm:text-base">
                                    The goal is not just to generate a page. It is to turn your videos, transcripts,
                                    and brand DNA into an offer that looks premium, feels on-brand, and can actually sell.
                                </p>
                            </motion.div>

                            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                                <motion.div
                                    initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.32, delay: 0.05, ease: 'easeOut' }}
                                    className="rounded-[28px] border border-white/80 bg-white/75 p-4 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.3)] backdrop-blur"
                                >
                                    <div className="flex items-center gap-2 text-slate-900">
                                        <Layers3 className="size-4" />
                                        <span className="text-sm font-medium">Projects</span>
                                    </div>
                                    <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{products.length}</p>
                                    <p className="mt-1 text-xs leading-5 text-slate-600">Active drafts and published products.</p>
                                </motion.div>
                                <motion.div
                                    initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.32, delay: 0.1, ease: 'easeOut' }}
                                    className="rounded-[28px] border border-white/80 bg-white/75 p-4 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.3)] backdrop-blur"
                                >
                                    <div className="flex items-center gap-2 text-slate-900">
                                        <Rocket className="size-4" />
                                        <span className="text-sm font-medium">Published</span>
                                    </div>
                                    <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{publishedCount}</p>
                                    <p className="mt-1 text-xs leading-5 text-slate-600">Products already live on your storefront.</p>
                                </motion.div>
                                <motion.div
                                    initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.32, delay: 0.15, ease: 'easeOut' }}
                                    className="rounded-[28px] border border-white/80 bg-white/75 p-4 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.3)] backdrop-blur"
                                >
                                    <div className="flex items-center gap-2 text-slate-900">
                                        <Clock3 className="size-4" />
                                        <span className="text-sm font-medium">In progress</span>
                                    </div>
                                    <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{draftCount}</p>
                                    <p className="mt-1 text-xs leading-5 text-slate-600">Drafts waiting for another round of polish.</p>
                                </motion.div>
                            </div>
                        </div>

                        <div className="overflow-hidden rounded-[32px] border border-white/80 bg-white/88 shadow-[0_30px_90px_-48px_rgba(15,23,42,0.45)] backdrop-blur">
                            <div className="h-[78vh] min-h-[720px] sm:h-[74vh] sm:min-h-[680px] lg:h-[70vh] lg:min-h-[560px]">
                                <ProductBuilder
                                    creatorId={creatorId}
                                    displayName={displayName}
                                    onProductCreated={handleProductCreated}
                                />
                            </div>
                        </div>
                    </div>
                </section>

                <section className="rounded-[30px] border border-slate-200/80 bg-white/92 p-4 shadow-[0_24px_70px_-52px_rgba(15,23,42,0.38)] backdrop-blur sm:p-5">
                    <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 p-1 text-amber-700">
                                    <Sparkles className="size-3.5" />
                                </span>
                                <h2 className="text-lg font-semibold tracking-tight text-slate-900">Recent Projects</h2>
                            </div>
                            <p className="mt-1 text-sm text-slate-500">Drafts, published products, and the latest build quality signals.</p>
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
                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                            {recentProjects.map((product) => (
                                <motion.div
                                    key={product.id}
                                    initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.22, ease: 'easeOut' }}
                                >
                                    <Card className="overflow-hidden border-slate-200/80 py-0 shadow-[0_20px_55px_-44px_rgba(15,23,42,0.35)] transition-transform duration-200 hover:-translate-y-0.5">
                                        <CardContent className="flex items-center justify-between gap-3 px-4 py-4">
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-semibold text-slate-950">{product.title}</p>
                                            <p className="mt-1 truncate text-xs text-slate-500">
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
                                </motion.div>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
