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
        <div className="h-full min-h-0 overflow-y-auto bg-transparent relative">
            {/* Subtle mesh/glow background */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-[600px] bg-[radial-gradient(ellipse_100%_100%_at_50%_-20%,rgba(120,119,198,0.12),transparent)]" />
            
            <div className="mx-auto w-full max-w-[1240px] space-y-8 p-4 sm:p-8 relative z-10">
                <section className="space-y-6">
                    <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
                        <motion.div
                            initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.4, ease: 'easeOut' }}
                            className="max-w-2xl"
                        >
                            <Badge
                                variant="outline"
                                className="border-slate-200/80 bg-white/60 shadow-sm text-[10px] uppercase tracking-[0.16em] text-slate-600 mb-4 px-2.5 py-0.5 backdrop-blur-sm"
                            >
                                Creation Hub
                            </Badge>
                            <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl lg:text-[2.5rem] leading-tight">
                                Build premium products <br className="hidden sm:block" />
                                <span className="text-slate-500">from your creator catalog.</span>
                            </h1>
                        </motion.div>

                        <div className="flex flex-wrap gap-3">
                            <motion.div
                                initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.3, delay: 0.05, ease: 'easeOut' }}
                                className="flex items-center gap-3 rounded-xl border border-slate-200/60 bg-white/60 px-4 py-2.5 shadow-sm backdrop-blur-md"
                            >
                                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100/80 text-slate-600">
                                    <Layers3 className="size-4" />
                                </div>
                                <div>
                                    <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Projects</p>
                                    <p className="text-sm font-semibold text-slate-900 leading-none mt-0.5">{products.length}</p>
                                </div>
                            </motion.div>
                            <motion.div
                                initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.3, delay: 0.1, ease: 'easeOut' }}
                                className="flex items-center gap-3 rounded-xl border border-slate-200/60 bg-white/60 px-4 py-2.5 shadow-sm backdrop-blur-md"
                            >
                                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100/50">
                                    <Rocket className="size-4" />
                                </div>
                                <div>
                                    <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Published</p>
                                    <p className="text-sm font-semibold text-slate-900 leading-none mt-0.5">{publishedCount}</p>
                                </div>
                            </motion.div>
                            <motion.div
                                initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.3, delay: 0.15, ease: 'easeOut' }}
                                className="flex items-center gap-3 rounded-xl border border-slate-200/60 bg-white/60 px-4 py-2.5 shadow-sm backdrop-blur-md"
                            >
                                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600 border border-amber-100/50">
                                    <Clock3 className="size-4" />
                                </div>
                                <div>
                                    <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Drafts</p>
                                    <p className="text-sm font-semibold text-slate-900 leading-none mt-0.5">{draftCount}</p>
                                </div>
                            </motion.div>
                        </div>
                    </div>

                    <div className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-slate-900/5 transition-all">
                        <div className="h-[70vh] min-h-[600px] lg:h-[65vh] lg:min-h-[500px]">
                            <ProductBuilder
                                creatorId={creatorId}
                                displayName={displayName}
                                onProductCreated={handleProductCreated}
                            />
                        </div>
                    </div>
                </section>

                <section className="space-y-4 pt-4">
                    <div className="flex items-center justify-between gap-3 px-1">
                        <div className="flex items-center gap-2 text-slate-900">
                            <Sparkles className="size-4 text-violet-500" />
                            <h2 className="text-sm font-medium tracking-tight">Recent Projects</h2>
                        </div>
                        <Button type="button" size="sm" variant="ghost" className="h-8 px-3 text-xs text-slate-500 hover:text-slate-900 hover:bg-white/60" onClick={() => void refreshProducts()}>
                            Refresh
                        </Button>
                    </div>

                    {productsError && (
                        <div className="rounded-xl border border-red-200 bg-red-50/50 px-3 py-2 text-xs text-red-600">
                            {productsError}
                        </div>
                    )}

                    {recentProjects.length === 0 ? (
                        <Card className="border-dashed bg-transparent border-slate-300/60 shadow-none rounded-xl">
                            <CardContent className="px-5 py-8 text-center">
                                <p className="text-sm font-medium text-slate-900">No projects yet</p>
                                <p className="mt-1 text-xs text-slate-500">
                                    Your first generated product will appear here.
                                </p>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
                            {recentProjects.map((product) => (
                                <motion.div
                                    key={product.id}
                                    initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.2, ease: 'easeOut' }}
                                    className="group"
                                >
                                    <a
                                        href={`/products/${product.id}/builder`}
                                        className="relative flex h-full flex-col justify-between overflow-hidden rounded-xl border border-slate-200/60 bg-white/80 p-4 shadow-sm backdrop-blur-sm transition-all hover:bg-white hover:shadow-md hover:border-slate-300 ring-1 ring-transparent hover:ring-slate-900/5 group-hover:-translate-y-0.5"
                                    >
                                        <div>
                                            <div className="flex items-start justify-between gap-3 mb-1">
                                                <Badge
                                                    variant={product.status === 'published' ? 'secondary' : 'outline'}
                                                    className="shrink-0 text-[9px] uppercase tracking-[0.1em] font-medium bg-transparent border-slate-200 text-slate-500"
                                                >
                                                    {product.status}
                                                </Badge>
                                            </div>
                                            <div className="mt-2 min-w-0">
                                                <p className="truncate text-sm font-medium text-slate-900 group-hover:text-violet-600 transition-colors">{product.title}</p>
                                                <p className="mt-1 text-xs text-slate-500 flex items-center gap-1.5">
                                                    <span>{TYPE_LABELS[product.type] || product.type}</span>
                                                    <span className="h-1 w-1 rounded-full bg-slate-300"></span>
                                                    <span>{formatCreatedDate(product.created_at)}</span>
                                                </p>
                                            </div>
                                        </div>

                                        {(() => {
                                            const buildMetadata = parseBuildMetadata(product.active_build_packet || null);
                                            if (!buildMetadata) return null;
                                            const modeLabel = formatBuildModeLabel(buildMetadata.htmlBuildMode);
                                            const timingLabel = formatStageTimingSummary(buildMetadata.stageTimingsMs);
                                            return (
                                                <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3">
                                                    {modeLabel && (
                                                        <span className="inline-flex items-center rounded-md bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 ring-1 ring-inset ring-slate-200/50">
                                                            {modeLabel}
                                                        </span>
                                                    )}
                                                    {typeof product.active_version_number === 'number' && (
                                                        <span className="inline-flex items-center rounded-md bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 ring-1 ring-inset ring-slate-200/50">
                                                            v{product.active_version_number}
                                                        </span>
                                                    )}
                                                    {typeof buildMetadata.qualityOverallScore === 'number' && (
                                                        <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${buildMetadata.qualityOverallPassed ? 'bg-emerald-50 text-emerald-700 ring-emerald-200/50' : 'bg-slate-50 text-slate-600 ring-slate-200/50'}`}>
                                                            Q{buildMetadata.qualityOverallScore}
                                                        </span>
                                                    )}
                                                    {timingLabel && (
                                                        <span className="text-[10px] text-slate-400 ml-auto">{timingLabel}</span>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                    </a>
                                </motion.div>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
