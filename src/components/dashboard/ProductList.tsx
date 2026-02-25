'use client';

// ProductList — List of creator's products (drafts + published)
// Inline within the dashboard right panel

import { useState } from 'react';

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
    pdf_guide: '📄 PDF Guide',
    mini_course: '🎓 Mini Course',
    challenge_7day: '🔥 7-Day Challenge',
    checklist_toolkit: '✅ Toolkit',
};

export function ProductList({ products, onRefresh, onPublishToggle }: ProductListProps) {
    const [toggling, setToggling] = useState<string | null>(null);

    const handleTogglePublish = async (product: Product) => {
        setToggling(product.id);
        const newStatus = product.status === 'published' ? 'draft' : 'published';

        try {
            await fetch(`/api/products/${product.id}/publish`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus }),
            });
            onRefresh();
            onPublishToggle();
        } catch { /* silent */ }

        setToggling(null);
    };

    return (
        <div className="product-list">
            <style>{`
                .product-list {
                    flex: 1;
                    overflow-y: auto;
                    padding: 1rem;
                }
                .pl-empty {
                    text-align: center;
                    padding: 3rem 1rem;
                    color: rgba(255,255,255,0.3);
                    font-size: 0.9rem;
                }
                .pl-empty-icon {
                    font-size: 2.5rem;
                    margin-bottom: 0.75rem;
                }
                .pl-cards {
                    display: flex;
                    flex-direction: column;
                    gap: 0.75rem;
                }
                .pl-card {
                    background: rgba(255,255,255,0.03);
                    border: 1px solid rgba(255,255,255,0.06);
                    border-radius: 1rem;
                    padding: 1rem 1.25rem;
                    transition: all 0.2s;
                }
                .pl-card:hover {
                    background: rgba(255,255,255,0.05);
                    border-color: rgba(255,255,255,0.1);
                }
                .pl-card-header {
                    display: flex;
                    align-items: flex-start;
                    justify-content: space-between;
                    gap: 0.75rem;
                }
                .pl-card-title {
                    font-weight: 600;
                    color: white;
                    font-size: 0.9rem;
                }
                .pl-card-type {
                    font-size: 0.75rem;
                    color: rgba(255,255,255,0.4);
                    margin-top: 0.25rem;
                }
                .pl-badge {
                    display: inline-flex;
                    padding: 0.2rem 0.6rem;
                    border-radius: 2rem;
                    font-size: 0.65rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    flex-shrink: 0;
                }
                .pl-badge.draft {
                    background: rgba(251, 191, 36, 0.1);
                    color: #fbbf24;
                    border: 1px solid rgba(251, 191, 36, 0.2);
                }
                .pl-badge.published {
                    background: rgba(34, 197, 94, 0.1);
                    color: #4ade80;
                    border: 1px solid rgba(34, 197, 94, 0.2);
                }
                .pl-card-actions {
                    display: flex;
                    gap: 0.5rem;
                    margin-top: 0.75rem;
                }
                .pl-btn {
                    padding: 0.375rem 0.75rem;
                    border-radius: 0.5rem;
                    font-size: 0.7rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                    border: 1px solid rgba(255,255,255,0.1);
                    background: rgba(255,255,255,0.04);
                    color: rgba(255,255,255,0.7);
                    font-family: inherit;
                }
                .pl-btn:hover {
                    background: rgba(255,255,255,0.08);
                    color: white;
                }
                .pl-btn.publish {
                    background: rgba(34, 197, 94, 0.1);
                    border-color: rgba(34, 197, 94, 0.2);
                    color: #4ade80;
                }
                .pl-btn.publish:hover {
                    background: rgba(34, 197, 94, 0.2);
                }
                .pl-btn.unpublish {
                    background: rgba(239, 68, 68, 0.1);
                    border-color: rgba(239, 68, 68, 0.2);
                    color: #f87171;
                }
                .pl-btn:disabled {
                    opacity: 0.4;
                    cursor: not-allowed;
                }
                .pl-date {
                    font-size: 0.65rem;
                    color: rgba(255,255,255,0.2);
                    margin-top: 0.5rem;
                }
            `}</style>

            {products.length === 0 ? (
                <div className="pl-empty">
                    <div className="pl-empty-icon">📦</div>
                    No products yet.<br />
                    Use the Builder tab to create your first product!
                </div>
            ) : (
                <div className="pl-cards">
                    {products.map((product) => (
                        <div key={product.id} className="pl-card">
                            <div className="pl-card-header">
                                <div>
                                    <div className="pl-card-title">{product.title}</div>
                                    <div className="pl-card-type">
                                        {TYPE_LABELS[product.type] || product.type}
                                    </div>
                                </div>
                                <span className={`pl-badge ${product.status}`}>
                                    {product.status}
                                </span>
                            </div>
                            <div className="pl-card-actions">
                                <a
                                    href={`/products/${product.id}/builder`}
                                    className="pl-btn"
                                >
                                    ✏️ Edit
                                </a>
                                <button
                                    className={`pl-btn ${product.status === 'published' ? 'unpublish' : 'publish'}`}
                                    onClick={() => handleTogglePublish(product)}
                                    disabled={toggling === product.id}
                                >
                                    {product.status === 'published' ? 'Unpublish' : '🚀 Publish'}
                                </button>
                            </div>
                            <div className="pl-date">
                                Created {new Date(product.created_at).toLocaleDateString()}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
