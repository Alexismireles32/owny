'use client';

import { useState } from 'react';
import { StorefrontPreview } from './StorefrontPreview';
import { AnalyticsPanel } from './AnalyticsPanel';
import { ProductBuilder } from './ProductBuilder';
import { ProductList } from './ProductList';
import { WelcomeTour } from './WelcomeTour';
import { cn, getApiErrorMessage, isAuthStatus, readJsonSafe } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface DashboardShellProps {
    creatorId: string;
    handle: string;
    displayName: string;
    stripeConnectStatus: string;
    stats: {
        revenue: number;
        sales: number;
        pageViews: number;
    };
    products: Array<{
        id: string;
        title: string;
        type: string;
        status: string;
        slug: string;
        created_at: string;
    }>;
}

type LeftTab = 'preview' | 'analytics';
type RightTab = 'builder' | 'products';

export function DashboardShell({
    creatorId,
    handle,
    displayName,
    stripeConnectStatus,
    stats,
    products: initialProducts,
}: DashboardShellProps) {
    const [leftTab, setLeftTab] = useState<LeftTab>('preview');
    const [rightTab, setRightTab] = useState<RightTab>('builder');
    const [storefrontKey, setStorefrontKey] = useState(0);
    const [products, setProducts] = useState(initialProducts);
    const [productsError, setProductsError] = useState<string | null>(null);

    const refreshStorefront = () => setStorefrontKey((k) => k + 1);

    const refreshProducts = async () => {
        setProductsError(null);
        try {
            const res = await fetch('/api/products');
            const data = await readJsonSafe<{ products?: Record<string, unknown>[]; error?: string }>(res);
            if (!res.ok) {
                if (isAuthStatus(res.status)) {
                    window.location.href = '/sign-in?next=%2Fdashboard';
                    return;
                }
                setProductsError(getApiErrorMessage(data, 'Could not refresh products.'));
                return;
            }

            setProducts((data?.products || []).map((p: Record<string, unknown>) => ({
                id: p.id as string,
                title: p.title as string,
                type: p.type as string,
                status: p.status as string,
                slug: p.slug as string,
                created_at: p.created_at as string,
            })));
        } catch {
            setProductsError('Network error while refreshing products.');
        }
    };

    return (
        <>
            {initialProducts.length === 0 && <WelcomeTour displayName={displayName} />}

            {stripeConnectStatus !== 'connected' && (
                <div className="border-b border-amber-200 bg-amber-50/80 px-4 py-2 sm:px-6">
                    <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center justify-center gap-2 text-sm text-amber-900">
                        <span>Connect Stripe to start selling your products.</span>
                        <Button asChild size="sm" variant="outline" className="border-amber-300 bg-white text-amber-900 hover:bg-amber-100">
                            <a href="/connect-stripe">Connect now</a>
                        </Button>
                    </div>
                </div>
            )}

            <div className="h-[calc(100vh-64px)] bg-slate-50 p-2 sm:p-3">
                <div className="mx-auto grid h-full w-full max-w-[1600px] grid-cols-1 gap-2 xl:grid-cols-[minmax(340px,0.95fr)_minmax(460px,1.35fr)]">
                    <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
                        <div className="flex items-center gap-2 border-b border-slate-200 p-2.5">
                            <Button
                                type="button"
                                size="sm"
                                variant={leftTab === 'preview' ? 'default' : 'outline'}
                                className={cn('rounded-full text-xs', leftTab === 'preview' ? 'shadow-none' : 'text-slate-600')}
                                onClick={() => setLeftTab('preview')}
                            >
                                Preview
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant={leftTab === 'analytics' ? 'default' : 'outline'}
                                className={cn('rounded-full text-xs', leftTab === 'analytics' ? 'shadow-none' : 'text-slate-600')}
                                onClick={() => setLeftTab('analytics')}
                            >
                                Analytics
                            </Button>
                        </div>
                        <div className="min-h-0 flex-1">
                            {leftTab === 'preview' ? (
                                <StorefrontPreview
                                    handle={handle}
                                    storefrontKey={storefrontKey}
                                    onRestyle={refreshStorefront}
                                    creatorId={creatorId}
                                />
                            ) : (
                                <AnalyticsPanel stats={stats} handle={handle} />
                            )}
                        </div>
                    </section>

                    <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
                        <div className="flex items-center gap-2 border-b border-slate-200 p-2.5">
                            <Button
                                type="button"
                                size="sm"
                                variant={rightTab === 'builder' ? 'default' : 'outline'}
                                className={cn('rounded-full text-xs', rightTab === 'builder' ? 'shadow-none' : 'text-slate-600')}
                                onClick={() => setRightTab('builder')}
                            >
                                Build
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant={rightTab === 'products' ? 'default' : 'outline'}
                                className={cn('rounded-full text-xs', rightTab === 'products' ? 'shadow-none' : 'text-slate-600')}
                                onClick={() => setRightTab('products')}
                            >
                                Products
                            </Button>
                        </div>
                        {productsError && (
                            <div className="mx-3 mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                                {productsError}
                            </div>
                        )}
                        <div className="min-h-0 flex-1">
                            {rightTab === 'builder' ? (
                                <ProductBuilder
                                    creatorId={creatorId}
                                    displayName={displayName}
                                    onProductCreated={() => {
                                        void refreshProducts();
                                        refreshStorefront();
                                    }}
                                />
                            ) : (
                                <ProductList
                                    products={products}
                                    onRefresh={() => {
                                        void refreshProducts();
                                    }}
                                    onPublishToggle={refreshStorefront}
                                />
                            )}
                        </div>
                    </section>
                </div>
            </div>
        </>
    );
}
