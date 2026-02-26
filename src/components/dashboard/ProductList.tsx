'use client';

import { useState } from 'react';
import { getApiErrorMessage, isAuthStatus, readJsonSafe } from '@/lib/utils';

interface Product {
    id: string;
    title: string;
    type: string;
    status: string;
    slug: string;
    created_at: string;
}

interface ProductListProps {
    products: Product[];
    onRefresh: () => void;
    onPublishToggle: () => void;
}

const TYPE_LABELS: Record<string, string> = {
    pdf_guide: 'PDF Guide',
    mini_course: 'Mini Course',
    challenge_7day: '7-Day Challenge',
    checklist_toolkit: 'Checklist Toolkit',
};

export function ProductList({ products, onRefresh, onPublishToggle }: ProductListProps) {
    const [toggling, setToggling] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleTogglePublish = async (product: Product) => {
        setToggling(product.id);
        setError(null);
        const newStatus = product.status === 'published' ? 'draft' : 'published';

        try {
            const res = await fetch(`/api/products/${product.id}/publish`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus }),
            });

            const payload = await readJsonSafe<{ error?: string }>(res);
            if (!res.ok) {
                if (isAuthStatus(res.status)) {
                    window.location.href = '/sign-in?next=%2Fdashboard';
                    return;
                }

                setError(getApiErrorMessage(payload, `Could not ${newStatus === 'published' ? 'publish' : 'unpublish'} this product.`));
                return;
            }

            onRefresh();
            onPublishToggle();
        } catch {
            setError(`Network error while trying to ${newStatus === 'published' ? 'publish' : 'unpublish'} this product.`);
        } finally {
            setToggling(null);
        }
    };

    return (
        <div className="inventory-root">
            <style>{`
                .inventory-root {
                    flex: 1;
                    min-height: 0;
                    overflow-y: auto;
                    padding: 1rem;
                    color: rgba(241, 245, 249, 0.94);
                }
                .inventory-header {
                    display: flex;
                    align-items: baseline;
                    justify-content: space-between;
                    gap: 0.8rem;
                    margin-bottom: 0.85rem;
                }
                .inventory-title {
                    margin: 0;
                    font-size: 0.95rem;
                    letter-spacing: 0.01em;
                    font-weight: 700;
                }
                .inventory-subtitle {
                    margin: 0.2rem 0 0;
                    font-size: 0.72rem;
                    color: rgba(226, 232, 240, 0.56);
                }
                .inventory-count {
                    border-radius: 999px;
                    border: 1px solid rgba(34, 211, 238, 0.38);
                    background: rgba(34, 211, 238, 0.14);
                    color: #67e8f9;
                    font-size: 0.62rem;
                    letter-spacing: 0.07em;
                    text-transform: uppercase;
                    padding: 0.25rem 0.56rem;
                    font-weight: 700;
                    white-space: nowrap;
                }
                .inventory-error {
                    border-radius: 0.82rem;
                    border: 1px solid rgba(248, 113, 113, 0.35);
                    background: rgba(248, 113, 113, 0.13);
                    color: #fecaca;
                    font-size: 0.74rem;
                    padding: 0.56rem 0.66rem;
                    margin-bottom: 0.65rem;
                }
                .inventory-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
                    gap: 0.72rem;
                }
                .inventory-card {
                    border: 1px solid rgba(226, 232, 240, 0.12);
                    border-radius: 1rem;
                    padding: 0.86rem;
                    background:
                        linear-gradient(150deg, rgba(6, 16, 28, 0.8), rgba(11, 26, 41, 0.75));
                    display: flex;
                    flex-direction: column;
                    gap: 0.7rem;
                    transition: border-color 0.22s ease, transform 0.22s ease, box-shadow 0.22s ease;
                }
                .inventory-card:hover {
                    border-color: rgba(34, 211, 238, 0.33);
                    transform: translateY(-1px);
                    box-shadow: 0 14px 24px rgba(0, 0, 0, 0.24);
                }
                .inventory-top {
                    display: flex;
                    align-items: flex-start;
                    justify-content: space-between;
                    gap: 0.8rem;
                }
                .inventory-name {
                    margin: 0;
                    font-size: 0.84rem;
                    line-height: 1.38;
                    font-weight: 600;
                    color: rgba(241, 245, 249, 0.95);
                }
                .inventory-meta {
                    margin-top: 0.34rem;
                    font-size: 0.67rem;
                    color: rgba(226, 232, 240, 0.56);
                }
                .inventory-status {
                    border-radius: 999px;
                    font-size: 0.6rem;
                    letter-spacing: 0.08em;
                    text-transform: uppercase;
                    padding: 0.23rem 0.54rem;
                    border: 1px solid transparent;
                    font-weight: 700;
                    white-space: nowrap;
                }
                .inventory-status.published {
                    color: #bbf7d0;
                    background: rgba(34, 197, 94, 0.14);
                    border-color: rgba(34, 197, 94, 0.32);
                }
                .inventory-status.draft {
                    color: #fde68a;
                    background: rgba(245, 158, 11, 0.14);
                    border-color: rgba(245, 158, 11, 0.32);
                }
                .inventory-actions {
                    display: flex;
                    gap: 0.42rem;
                    flex-wrap: wrap;
                }
                .inventory-btn {
                    border-radius: 0.7rem;
                    border: 1px solid rgba(226, 232, 240, 0.2);
                    background: rgba(226, 232, 240, 0.08);
                    color: rgba(241, 245, 249, 0.9);
                    font-size: 0.68rem;
                    font-weight: 600;
                    letter-spacing: 0.01em;
                    padding: 0.4rem 0.58rem;
                    font-family: inherit;
                    cursor: pointer;
                    text-decoration: none;
                    transition: all 0.2s ease;
                    display: inline-flex;
                    align-items: center;
                }
                .inventory-btn:hover {
                    border-color: rgba(34, 211, 238, 0.4);
                    color: #a5f3fc;
                    background: rgba(34, 211, 238, 0.14);
                }
                .inventory-btn.publish {
                    border-color: rgba(34, 197, 94, 0.35);
                    background: rgba(34, 197, 94, 0.15);
                    color: #bbf7d0;
                }
                .inventory-btn.unpublish {
                    border-color: rgba(248, 113, 113, 0.35);
                    background: rgba(248, 113, 113, 0.14);
                    color: #fecaca;
                }
                .inventory-btn:disabled {
                    opacity: 0.45;
                    cursor: not-allowed;
                }
                .inventory-date {
                    font-size: 0.63rem;
                    color: rgba(226, 232, 240, 0.4);
                }
                .inventory-empty {
                    margin-top: 0.4rem;
                    border-radius: 1rem;
                    border: 1px dashed rgba(226, 232, 240, 0.2);
                    background: rgba(226, 232, 240, 0.04);
                    text-align: center;
                    padding: 2rem 1rem;
                }
                .inventory-empty-title {
                    font-size: 0.92rem;
                    font-weight: 700;
                    margin: 0;
                }
                .inventory-empty-copy {
                    margin: 0.45rem auto 0;
                    max-width: 46ch;
                    color: rgba(226, 232, 240, 0.58);
                    font-size: 0.75rem;
                    line-height: 1.5;
                }
            `}</style>

            <div className="inventory-header">
                <div>
                    <h3 className="inventory-title">Product Inventory</h3>
                    <p className="inventory-subtitle">Manage launch status and move drafts into your storefront.</p>
                </div>
                <span className="inventory-count">{products.length} items</span>
            </div>

            {error && <div className="inventory-error">{error}</div>}

            {products.length === 0 ? (
                <div className="inventory-empty">
                    <p className="inventory-empty-title">No products yet</p>
                    <p className="inventory-empty-copy">
                        Use the Product Generator tab to create your first launch-ready asset from your existing TikTok content.
                    </p>
                </div>
            ) : (
                <div className="inventory-grid">
                    {products.map((product) => (
                        <article key={product.id} className="inventory-card">
                            <div className="inventory-top">
                                <div>
                                    <p className="inventory-name">{product.title}</p>
                                    <p className="inventory-meta">{TYPE_LABELS[product.type] || product.type}</p>
                                </div>
                                <span className={`inventory-status ${product.status}`}>{product.status}</span>
                            </div>

                            <div className="inventory-actions">
                                <a href={`/products/${product.id}/builder`} className="inventory-btn">Open Builder</a>
                                <button
                                    type="button"
                                    className={`inventory-btn ${product.status === 'published' ? 'unpublish' : 'publish'}`}
                                    onClick={() => handleTogglePublish(product)}
                                    disabled={toggling === product.id}
                                >
                                    {product.status === 'published' ? 'Unpublish' : 'Publish'}
                                </button>
                            </div>

                            <div className="inventory-date">Created {formatCreatedDate(product.created_at)}</div>
                        </article>
                    ))}
                </div>
            )}
        </div>
    );
}

function formatCreatedDate(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return 'Unknown';
    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}
