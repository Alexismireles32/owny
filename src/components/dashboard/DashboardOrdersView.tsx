'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface Order {
    id: string;
    buyerEmail: string;
    productTitle: string;
    productType: string;
    amountCents: number;
    currency: string;
    status: string;
    createdAt: string;
}

interface DashboardOrdersViewProps {
    creatorId: string;
}

function SkeletonRow() {
    return (
        <div className="flex items-center justify-between py-3 border-b last:border-0">
            <div className="animate-pulse space-y-2">
                <div className="h-4 w-36 rounded bg-slate-200" />
                <div className="h-3 w-24 rounded bg-slate-200" />
            </div>
            <div className="animate-pulse space-y-1 text-right">
                <div className="h-4 w-14 rounded bg-slate-200 ml-auto" />
                <div className="h-3 w-16 rounded bg-slate-200 ml-auto" />
            </div>
        </div>
    );
}

export function DashboardOrdersView({ creatorId }: DashboardOrdersViewProps) {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            try {
                const res = await fetch('/api/orders');
                if (res.ok && !cancelled) {
                    const json = await res.json();
                    setOrders(json.orders || []);
                }
            } catch { /* ignore */ }
            if (!cancelled) setLoading(false);
        }
        void load();
        return () => { cancelled = true; };
    }, [creatorId]);

    return (
        <div className="h-full min-h-0 overflow-y-auto bg-transparent relative p-4 sm:p-8">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-[500px] bg-[radial-gradient(ellipse_100%_100%_at_50%_-20%,rgba(99,102,241,0.08),transparent)]" />
            <div className="mx-auto w-full max-w-4xl space-y-8 relative z-10">
                <div className="mb-8">
                    <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Orders</h1>
                    <p className="mt-2 text-sm text-slate-500">View your recent customer purchases.</p>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm">Recent Orders</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="space-y-0">
                                <SkeletonRow />
                                <SkeletonRow />
                                <SkeletonRow />
                                <SkeletonRow />
                            </div>
                        ) : orders.length === 0 ? (
                            <div className="py-10 text-center">
                                <p className="text-3xl mb-2">📦</p>
                                <p className="text-sm font-medium text-slate-900">No orders yet</p>
                                <p className="mt-1 text-sm text-slate-500">
                                    When customers purchase your products, orders will appear here.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-0">
                                {orders.map((order) => (
                                    <div key={order.id} className="flex items-center justify-between py-3 border-b last:border-0">
                                        <div>
                                            <p className="text-sm font-medium text-slate-900">{order.productTitle}</p>
                                            <div className="mt-0.5 flex items-center gap-1.5">
                                                <span className="text-xs text-slate-500">{order.buyerEmail}</span>
                                                <Badge variant={order.status === 'completed' ? 'default' : 'secondary'} className="text-xs">
                                                    {order.status}
                                                </Badge>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-medium text-slate-900">
                                                {order.amountCents === 0 ? 'Free' : `$${(order.amountCents / 100).toFixed(2)}`}
                                            </p>
                                            <p className="text-xs text-slate-500">
                                                {new Date(order.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
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
