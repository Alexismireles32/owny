'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface Analytics {
    totalRevenueCents: number;
    purchaseCount: number;
    totalViews: number;
    monthlyRevenue: Record<string, number>;
    topProducts: {
        id: string;
        title: string;
        slug: string;
        type: string;
        status: string;
        priceCents: number;
        salesCount: number;
        revenueCents: number;
    }[];
    productCount: number;
}

interface DashboardAnalyticsViewProps {
    creatorId: string;
}

function SkeletonCard() {
    return (
        <Card>
            <CardContent className="pt-4">
                <div className="animate-pulse space-y-2">
                    <div className="h-3 w-16 rounded bg-slate-200" />
                    <div className="h-7 w-24 rounded bg-slate-200" />
                </div>
            </CardContent>
        </Card>
    );
}

function SkeletonRow() {
    return (
        <div className="flex items-center justify-between py-3 border-b last:border-0">
            <div className="animate-pulse flex items-center gap-3">
                <div className="space-y-2">
                    <div className="h-4 w-32 rounded bg-slate-200" />
                    <div className="h-3 w-20 rounded bg-slate-200" />
                </div>
            </div>
            <div className="animate-pulse space-y-1 text-right">
                <div className="h-4 w-14 rounded bg-slate-200 ml-auto" />
                <div className="h-3 w-10 rounded bg-slate-200 ml-auto" />
            </div>
        </div>
    );
}

export function DashboardAnalyticsView({ creatorId }: DashboardAnalyticsViewProps) {
    const [data, setData] = useState<Analytics | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            try {
                const res = await fetch('/api/analytics');
                if (res.ok && !cancelled) {
                    const json = await res.json();
                    setData(json);
                }
            } catch { /* ignore */ }
            if (!cancelled) setLoading(false);
        }
        void load();
        return () => { cancelled = true; };
    }, [creatorId]);

    const months = data ? Object.keys(data.monthlyRevenue).sort() : [];
    const maxMonthlyRevenue = data ? Math.max(...Object.values(data.monthlyRevenue), 1) : 1;

    return (
        <div className="h-full min-h-0 overflow-y-auto bg-transparent relative p-4 sm:p-8">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-[500px] bg-[radial-gradient(ellipse_100%_100%_at_50%_-20%,rgba(16,185,129,0.08),transparent)]" />
            <div className="mx-auto w-full max-w-4xl space-y-8 relative z-10">
                <div className="mb-8">
                    <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Analytics</h1>
                    <p className="mt-2 text-sm text-slate-500">Track your revenue, sales, and product performance.</p>
                </div>

                {/* KPI Cards */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {loading ? (
                        <>
                            <SkeletonCard />
                            <SkeletonCard />
                            <SkeletonCard />
                            <SkeletonCard />
                        </>
                    ) : (
                        <>
                            <Card>
                                <CardContent className="pt-4 text-center">
                                    <p className="text-2xl font-bold text-emerald-600">
                                        ${((data?.totalRevenueCents ?? 0) / 100).toFixed(2)}
                                    </p>
                                    <p className="text-xs text-slate-500">Total Revenue</p>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="pt-4 text-center">
                                    <p className="text-2xl font-bold">{data?.purchaseCount ?? 0}</p>
                                    <p className="text-xs text-slate-500">Purchases</p>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="pt-4 text-center">
                                    <p className="text-2xl font-bold">{data?.productCount ?? 0}</p>
                                    <p className="text-xs text-slate-500">Products</p>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="pt-4 text-center">
                                    <p className="text-2xl font-bold">{(data?.totalViews ?? 0).toLocaleString()}</p>
                                    <p className="text-xs text-slate-500">Page Views</p>
                                </CardContent>
                            </Card>
                        </>
                    )}
                </div>

                {/* Monthly Revenue Chart */}
                {loading ? (
                    <Card>
                        <CardHeader><CardTitle className="text-sm">Monthly Revenue</CardTitle></CardHeader>
                        <CardContent>
                            <div className="flex items-end gap-2 h-40">
                                {Array.from({ length: 6 }).map((_, i) => (
                                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                                        <div className="animate-pulse h-3 w-8 rounded bg-slate-200" />
                                        <div className="animate-pulse w-full rounded-t-sm bg-slate-200" style={{ height: `${20 + i * 12}%` }} />
                                        <div className="animate-pulse h-3 w-6 rounded bg-slate-200" />
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                ) : months.length > 0 && data ? (
                    <Card>
                        <CardHeader><CardTitle className="text-sm">Monthly Revenue</CardTitle></CardHeader>
                        <CardContent>
                            <div className="flex items-end gap-2 h-40">
                                {months.map((month) => {
                                    const rev = data.monthlyRevenue[month];
                                    const height = (rev / maxMonthlyRevenue) * 100;
                                    return (
                                        <div key={month} className="flex-1 flex flex-col items-center gap-1">
                                            <span className="text-xs text-slate-500">${(rev / 100).toFixed(0)}</span>
                                            <div
                                                className="w-full rounded-t-sm bg-slate-900 transition-all"
                                                style={{ height: `${Math.max(height, 2)}%` }}
                                            />
                                            <span className="text-xs text-slate-500">{month.slice(5)}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </CardContent>
                    </Card>
                ) : null}

                {/* Top Products */}
                <Card>
                    <CardHeader><CardTitle className="text-sm">Top Products</CardTitle></CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="space-y-0">
                                <SkeletonRow />
                                <SkeletonRow />
                                <SkeletonRow />
                            </div>
                        ) : (data?.topProducts?.length ?? 0) === 0 ? (
                            <p className="text-sm text-slate-500">No products with sales yet.</p>
                        ) : (
                            <div className="space-y-0">
                                {data?.topProducts.map((product) => (
                                    <div key={product.id} className="flex items-center justify-between py-3 border-b last:border-0">
                                        <div>
                                            <p className="text-sm font-medium text-slate-900">{product.title}</p>
                                            <div className="mt-0.5 flex items-center gap-1.5">
                                                <Badge variant="secondary" className="text-xs">{product.type.replace(/_/g, ' ')}</Badge>
                                                <Badge variant={product.status === 'published' ? 'default' : 'secondary'} className="text-xs">{product.status}</Badge>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-medium text-emerald-600">${(product.revenueCents / 100).toFixed(2)}</p>
                                            <p className="text-xs text-slate-500">{product.salesCount} sale{product.salesCount !== 1 ? 's' : ''}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
