'use client';

// AnalyticsPanel — Compact stats view for the dashboard left panel

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface AnalyticsPanelProps {
    stats: {
        revenue: number;
        sales: number;
        pageViews: number;
    };
    handle: string;
}

export function AnalyticsPanel({ stats, handle }: AnalyticsPanelProps) {
    const formatCurrency = (cents: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'usd',
        }).format(cents / 100);
    };

    return (
        <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-3 sm:p-4">
            <Card className="gap-0 py-0">
                <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Revenue
                    </CardTitle>
                </CardHeader>
                <CardContent className="pb-5">
                    <p className="text-3xl font-bold tracking-tight text-slate-900">{formatCurrency(stats.revenue)}</p>
                    <p className="mt-1 text-sm text-slate-500">
                        {stats.sales} {stats.sales === 1 ? 'sale' : 'sales'}
                    </p>
                </CardContent>
            </Card>

            <Card className="gap-0 py-0">
                <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Page Views
                    </CardTitle>
                </CardHeader>
                <CardContent className="pb-5">
                    <p className="text-3xl font-bold tracking-tight text-slate-900">{stats.pageViews}</p>
                    <p className="mt-1 text-sm text-slate-500">/{handle}</p>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 gap-2">
                <Button asChild variant="outline" className="justify-center">
                    <a href="/analytics">View analytics</a>
                </Button>
            </div>
        </div>
    );
}
