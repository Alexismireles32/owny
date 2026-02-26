'use client';

import { useState } from 'react';
import { StorefrontPreview } from './StorefrontPreview';
import { AnalyticsPanel } from './AnalyticsPanel';
import { ProductBuilder } from './ProductBuilder';
import { ProductList } from './ProductList';
import { WelcomeTour } from './WelcomeTour';
import { getApiErrorMessage, isAuthStatus, readJsonSafe } from '@/lib/utils';

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
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.7rem',
                    padding: '0.6rem 1rem',
                    background: 'linear-gradient(90deg, rgba(245,158,11,0.18), rgba(245,158,11,0.08))',
                    borderBottom: '1px solid rgba(245,158,11,0.3)',
                    fontSize: '0.78rem',
                    color: '#fcd34d',
                }}>
                    <span>💳</span>
                    <span>Connect Stripe to start selling your products.</span>
                    <a
                        href="/connect-stripe"
                        style={{
                            padding: '0.3rem 0.65rem',
                            borderRadius: '0.5rem',
                            background: 'rgba(245,158,11,0.22)',
                            border: '1px solid rgba(245,158,11,0.45)',
                            color: '#fde68a',
                            fontWeight: 600,
                            fontSize: '0.72rem',
                            textDecoration: 'none',
                            transition: 'background 0.2s ease',
                        }}
                    >
                        Connect Now →
                    </a>
                </div>
            )}

            <div className="shell-root">
                <style>{`
                    .shell-root {
                        --shell-line: rgba(255, 255, 255, 0.12);
                        --shell-muted: rgba(226, 232, 240, 0.58);
                        --shell-text: rgba(241, 245, 249, 0.94);
                        position: relative;
                        display: flex;
                        height: calc(100vh - 64px);
                        overflow: hidden;
                        background:
                            radial-gradient(900px 320px at 10% -10%, rgba(34, 211, 238, 0.14), transparent 62%),
                            radial-gradient(900px 320px at 90% -12%, rgba(245, 158, 11, 0.14), transparent 62%),
                            linear-gradient(145deg, #07101f, #101d2d 52%, #12253b);
                    }
                    .shell-root::before {
                        content: '';
                        position: absolute;
                        inset: 0;
                        pointer-events: none;
                        background-image:
                            linear-gradient(rgba(255, 255, 255, 0.035) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
                        background-size: 40px 40px;
                        mask-image: linear-gradient(to bottom, rgba(0, 0, 0, 0.5), transparent 96%);
                    }
                    .shell-left,
                    .shell-right {
                        position: relative;
                        z-index: 1;
                        min-height: 0;
                        display: flex;
                        flex-direction: column;
                    }
                    .shell-left {
                        width: 40%;
                        min-width: 340px;
                        border-right: 1px solid var(--shell-line);
                        background: rgba(4, 10, 18, 0.5);
                    }
                    .shell-right {
                        width: 60%;
                        flex: 1;
                        background: rgba(5, 11, 20, 0.34);
                    }
                    .shell-tabs {
                        display: flex;
                        gap: 0.45rem;
                        padding: 0.75rem 0.85rem;
                        border-bottom: 1px solid var(--shell-line);
                        background: rgba(2, 8, 16, 0.68);
                        backdrop-filter: blur(10px);
                    }
                    .shell-tab {
                        border: 1px solid transparent;
                        background: rgba(255, 255, 255, 0.05);
                        color: var(--shell-muted);
                        border-radius: 0.72rem;
                        font-size: 0.74rem;
                        font-weight: 600;
                        letter-spacing: 0.02em;
                        padding: 0.5rem 0.7rem;
                        cursor: pointer;
                        transition: all 0.2s ease;
                        font-family: inherit;
                        white-space: nowrap;
                    }
                    .shell-tab:hover {
                        color: rgba(241, 245, 249, 0.88);
                        border-color: rgba(34, 211, 238, 0.25);
                    }
                    .shell-tab.active {
                        color: var(--shell-text);
                        border-color: rgba(34, 211, 238, 0.44);
                        background: linear-gradient(145deg, rgba(34, 211, 238, 0.17), rgba(8, 145, 178, 0.16));
                        box-shadow: 0 0 0 1px rgba(34, 211, 238, 0.2);
                    }
                    .shell-panel {
                        flex: 1;
                        min-height: 0;
                        display: flex;
                        flex-direction: column;
                        overflow: hidden;
                    }
                    .shell-error {
                        margin: 0.7rem 0.9rem 0;
                        border-radius: 0.8rem;
                        border: 1px solid rgba(248, 113, 113, 0.33);
                        background: rgba(248, 113, 113, 0.11);
                        color: #fecaca;
                        font-size: 0.74rem;
                        padding: 0.55rem 0.7rem;
                    }
                    @media (max-width: 980px) {
                        .shell-root {
                            flex-direction: column;
                            height: auto;
                            min-height: calc(100vh - 64px);
                        }
                        .shell-left,
                        .shell-right {
                            width: 100%;
                            min-width: 0;
                        }
                        .shell-left {
                            border-right: none;
                            border-bottom: 1px solid var(--shell-line);
                            min-height: 50vh;
                        }
                        .shell-right {
                            min-height: 50vh;
                        }
                    }
                `}</style>

                <div className="shell-left">
                    <div className="shell-tabs">
                        <button
                            type="button"
                            className={`shell-tab ${leftTab === 'preview' ? 'active' : ''}`}
                            onClick={() => setLeftTab('preview')}
                        >
                            Preview Studio
                        </button>
                        <button
                            type="button"
                            className={`shell-tab ${leftTab === 'analytics' ? 'active' : ''}`}
                            onClick={() => setLeftTab('analytics')}
                        >
                            Performance
                        </button>
                    </div>
                    <div className="shell-panel">
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
                </div>

                <div className="shell-right">
                    <div className="shell-tabs">
                        <button
                            type="button"
                            className={`shell-tab ${rightTab === 'builder' ? 'active' : ''}`}
                            onClick={() => setRightTab('builder')}
                        >
                            Product Generator
                        </button>
                        <button
                            type="button"
                            className={`shell-tab ${rightTab === 'products' ? 'active' : ''}`}
                            onClick={() => setRightTab('products')}
                        >
                            Product Inventory ({products.length})
                        </button>
                    </div>
                    {productsError && <div className="shell-error">{productsError}</div>}
                    <div className="shell-panel">
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
                </div>
            </div>
        </>
    );
}
