'use client';

// Analytics page — Creator dashboard
// PRD §M13: revenue, purchases, top products, page views

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

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

export default function AnalyticsPage() {
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
        load();
        return () => { cancelled = true; };
    }, []);

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="animate-spin h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
            </div>
        );
    }

    if (!data) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <p className="text-muted-foreground">Failed to load analytics.</p>
            </div>
        );
    }

    const months = Object.keys(data.monthlyRevenue).sort();
    const maxMonthlyRevenue = Math.max(...Object.values(data.monthlyRevenue), 1);

    return (
        <div className="min-h-screen bg-slate-50">
            <div className="max-w-6xl mx-auto px-4 py-8">
                <div className="flex items-center justify-between mb-8">
                    <h1 className="text-2xl font-bold">Analytics</h1>
                    <Link href="/dashboard" className="text-sm text-indigo-500 hover:text-indigo-600">
                        ← Dashboard
                    </Link>
                </div>

                {/* KPIs */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm text-muted-foreground">Total Revenue</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-2xl font-bold text-green-600">
                                ${(data.totalRevenueCents / 100).toFixed(2)}
                            </p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm text-muted-foreground">Purchases</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-2xl font-bold">{data.purchaseCount}</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm text-muted-foreground">Products</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-2xl font-bold">{data.productCount}</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm text-muted-foreground">Page Views</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-2xl font-bold">{data.totalViews.toLocaleString()}</p>
                        </CardContent>
                    </Card>
                </div>

                {/* Revenue Chart (simple bar) */}
                {months.length > 0 && (
                    <Card className="mb-8">
                        <CardHeader>
                            <CardTitle className="text-sm">Monthly Revenue</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-end gap-2 h-40">
                                {months.map((month) => {
                                    const rev = data.monthlyRevenue[month];
                                    const height = (rev / maxMonthlyRevenue) * 100;
                                    return (
                                        <div key={month} className="flex-1 flex flex-col items-center gap-1">
                                            <span className="text-xs text-muted-foreground">
                                                ${(rev / 100).toFixed(0)}
                                            </span>
                                            <div
                                                className="w-full bg-indigo-500 rounded-t-sm transition-all"
                                                style={{ height: `${Math.max(height, 2)}%` }}
                                            />
                                            <span className="text-xs text-muted-foreground">
                                                {month.slice(5)}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Top Products */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm">Top Products</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {data.topProducts.length === 0 ? (
                            <p className="text-muted-foreground text-sm">No products yet.</p>
                        ) : (
                            <div className="space-y-3">
                                {data.topProducts.map((product) => (
                                    <div key={product.id} className="flex items-center justify-between py-2 border-b last:border-0">
                                        <div className="flex items-center gap-3">
                                            <div>
                                                <Link href={`/products/${product.id}`} className="font-medium text-sm hover:text-indigo-500">
                                                    {product.title}
                                                </Link>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <Badge variant="secondary" className="text-xs">{product.type}</Badge>
                                                    <Badge variant={product.status === 'published' ? 'default' : 'secondary'} className="text-xs">
                                                        {product.status}
                                                    </Badge>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-medium text-sm text-green-600">
                                                ${(product.revenueCents / 100).toFixed(2)}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {product.salesCount} sale{product.salesCount !== 1 ? 's' : ''}
                                            </p>
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
