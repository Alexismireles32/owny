'use client';

// DashboardShell — Split-pane layout
// Left 40%: StorefrontPreview (mobile frame + design prompt) with Preview/Analytics tabs
// Right 60%: Toggle between ProductBuilder (Lovable-style chatbox) and ProductList (drafts/published)

import { useState } from 'react';
import { StorefrontPreview } from './StorefrontPreview';
import { AnalyticsPanel } from './AnalyticsPanel';
import { ProductBuilder } from './ProductBuilder';
import { ProductList } from './ProductList';

interface DashboardShellProps {
    creatorId: string;
    handle: string;
    displayName: string;
    avatarUrl: string | null;
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
    avatarUrl,
    stats,
    products: initialProducts,
}: DashboardShellProps) {
    const [leftTab, setLeftTab] = useState<LeftTab>('preview');
    const [rightTab, setRightTab] = useState<RightTab>('builder');
    const [storefrontKey, setStorefrontKey] = useState(0);
    const [products, setProducts] = useState(initialProducts);

    const refreshStorefront = () => setStorefrontKey((k) => k + 1);
    const refreshProducts = async () => {
        try {
            const res = await fetch('/api/products');
            if (res.ok) {
                const data = await res.json();
                setProducts((data.products || []).map((p: Record<string, unknown>) => ({
                    id: p.id as string,
                    title: p.title as string,
                    type: p.type as string,
                    status: p.status as string,
                    slug: p.slug as string,
                    created_at: p.created_at as string,
                })));
            }
        } catch { /* silent — will retry on next action */ }
    };

    return (
        <div className="dashboard-shell">
            <style>{`
                .dashboard-shell {
                    display: flex;
                    height: calc(100vh - 64px);
                    overflow: hidden;
                    background: #0f0f1a;
                }
                .dash-left {
                    width: 40%;
                    min-width: 340px;
                    display: flex;
                    flex-direction: column;
                    border-right: 1px solid rgba(255,255,255,0.06);
                }
                .dash-right {
                    width: 60%;
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                }
                .dash-tabs {
                    display: flex;
                    gap: 0;
                    border-bottom: 1px solid rgba(255,255,255,0.06);
                    padding: 0 1rem;
                }
                .dash-tab {
                    padding: 0.75rem 1rem;
                    font-size: 0.8rem;
                    font-weight: 600;
                    color: rgba(255,255,255,0.4);
                    cursor: pointer;
                    border-bottom: 2px solid transparent;
                    transition: all 0.2s;
                    background: none;
                    border-top: none;
                    border-left: none;
                    border-right: none;
                    font-family: inherit;
                }
                .dash-tab:hover { color: rgba(255,255,255,0.7); }
                .dash-tab.active {
                    color: white;
                    border-bottom-color: #8b5cf6;
                }
                .dash-panel {
                    flex: 1;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                }
                @media (max-width: 768px) {
                    .dashboard-shell {
                        flex-direction: column;
                    }
                    .dash-left, .dash-right {
                        width: 100%;
                        min-width: unset;
                        height: 50vh;
                    }
                }
            `}</style>

            {/* Left Panel: Storefront Preview / Analytics */}
            <div className="dash-left">
                <div className="dash-tabs">
                    <button
                        className={`dash-tab ${leftTab === 'preview' ? 'active' : ''}`}
                        onClick={() => setLeftTab('preview')}
                    >
                        📱 Preview
                    </button>
                    <button
                        className={`dash-tab ${leftTab === 'analytics' ? 'active' : ''}`}
                        onClick={() => setLeftTab('analytics')}
                    >
                        📊 Analytics
                    </button>
                </div>
                <div className="dash-panel">
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

            {/* Right Panel: Builder / Product List */}
            <div className="dash-right">
                <div className="dash-tabs">
                    <button
                        className={`dash-tab ${rightTab === 'builder' ? 'active' : ''}`}
                        onClick={() => setRightTab('builder')}
                    >
                        ✨ Create Product
                    </button>
                    <button
                        className={`dash-tab ${rightTab === 'products' ? 'active' : ''}`}
                        onClick={() => setRightTab('products')}
                    >
                        📦 My Products ({products.length})
                    </button>
                </div>
                <div className="dash-panel">
                    {rightTab === 'builder' ? (
                        <ProductBuilder
                            creatorId={creatorId}
                            displayName={displayName}
                            onProductCreated={() => {
                                refreshProducts();
                                refreshStorefront();
                            }}
                        />
                    ) : (
                        <ProductList
                            products={products}
                            onRefresh={refreshProducts}
                            onPublishToggle={refreshStorefront}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
