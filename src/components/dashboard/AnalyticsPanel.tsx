'use client';

// AnalyticsPanel — Compact stats view for the dashboard left panel

import { motion, useReducedMotion } from 'motion/react';
import { ArrowUpRight, BadgeDollarSign, Eye, ShoppingBag } from 'lucide-react';
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
    const shouldReduceMotion = useReducedMotion();

    const formatCurrency = (cents: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'usd',
        }).format(cents / 100);
    };

    return (
        <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto bg-[linear-gradient(180deg,rgba(248,250,252,1),rgba(255,255,255,1))] p-3 sm:p-4">
            <motion.div
                initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.3, ease: 'easeOut' }}
            >
                <Card className="gap-0 overflow-hidden border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,247,237,1),rgba(255,255,255,0.96))] py-0 shadow-[0_24px_70px_-52px_rgba(15,23,42,0.38)]">
                    <CardHeader className="pb-2">
                        <div className="flex items-center gap-2">
                            <span className="rounded-full border border-amber-200 bg-white p-1 text-amber-700">
                                <BadgeDollarSign className="size-3.5" />
                            </span>
                            <CardTitle className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                                Revenue
                            </CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="pb-5">
                        <p className="text-3xl font-bold tracking-tight text-slate-900">{formatCurrency(stats.revenue)}</p>
                        <p className="mt-1 text-sm text-slate-500">
                            {stats.sales} {stats.sales === 1 ? 'sale' : 'sales'}
                        </p>
                    </CardContent>
                </Card>
            </motion.div>

            <motion.div
                initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.3, delay: 0.05, ease: 'easeOut' }}
            >
                <Card className="gap-0 overflow-hidden border-slate-200/80 py-0 shadow-[0_24px_70px_-52px_rgba(15,23,42,0.32)]">
                    <CardHeader className="pb-2">
                        <div className="flex items-center gap-2">
                            <span className="rounded-full border border-sky-200 bg-sky-50 p-1 text-sky-700">
                                <Eye className="size-3.5" />
                            </span>
                            <CardTitle className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                                Page Views
                            </CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="pb-5">
                        <p className="text-3xl font-bold tracking-tight text-slate-900">{stats.pageViews}</p>
                        <p className="mt-1 text-sm text-slate-500">/{handle}</p>
                    </CardContent>
                </Card>
            </motion.div>

            <motion.div
                initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.3, delay: 0.1, ease: 'easeOut' }}
            >
                <Card className="gap-0 overflow-hidden border-slate-200/80 py-0 shadow-[0_24px_70px_-52px_rgba(15,23,42,0.32)]">
                    <CardHeader className="pb-2">
                        <div className="flex items-center gap-2">
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 p-1 text-emerald-700">
                                <ShoppingBag className="size-3.5" />
                            </span>
                            <CardTitle className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                                Conversion snapshot
                            </CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="pb-5">
                        <p className="text-3xl font-bold tracking-tight text-slate-900">
                            {stats.pageViews > 0 ? `${((stats.sales / stats.pageViews) * 100).toFixed(1)}%` : '0.0%'}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">Sales divided by page views.</p>
                    </CardContent>
                </Card>
            </motion.div>

            <motion.div
                initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.3, delay: 0.15, ease: 'easeOut' }}
                className="grid grid-cols-1 gap-2"
            >
                <Button asChild variant="outline" className="justify-center rounded-xl border-slate-300 bg-white">
                    <a href="/analytics">
                        <ArrowUpRight />
                        View analytics
                    </a>
                </Button>
            </motion.div>
        </div>
    );
}
