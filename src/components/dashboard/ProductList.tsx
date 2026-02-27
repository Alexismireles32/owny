'use client';

import { useState } from 'react';
import { getApiErrorMessage, isAuthStatus, readJsonSafe } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

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
        <div className="flex h-full min-h-0 flex-col overflow-y-auto p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-900">Products</h3>
                <Badge variant="outline" className="text-xs text-slate-600">{products.length}</Badge>
            </div>

            {error && <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

            {products.length === 0 ? (
                <Card className="border-dashed">
                    <CardContent className="py-10 text-center">
                        <p className="text-base font-semibold text-slate-900">No products yet</p>
                        <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">
                            Create your first product in the Generator tab.
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 gap-2">
                    {products.map((product) => (
                        <Card key={product.id} className="gap-0 py-0">
                            <CardHeader className="pb-2">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <CardTitle className="line-clamp-2 text-sm leading-snug text-slate-900">
                                            {product.title}
                                        </CardTitle>
                                        <p className="mt-1 text-xs text-slate-500">{TYPE_LABELS[product.type] || product.type}</p>
                                    </div>
                                    <Badge
                                        variant={product.status === 'published' ? 'secondary' : 'outline'}
                                        className="shrink-0 text-[10px] uppercase tracking-[0.12em]"
                                    >
                                        {product.status}
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent className="pb-4">
                                <div className="flex flex-wrap gap-2">
                                    <Button asChild size="sm" variant="outline">
                                        <a href={`/products/${product.id}/builder`}>Open</a>
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant={product.status === 'published' ? 'destructive' : 'default'}
                                        onClick={() => handleTogglePublish(product)}
                                        disabled={toggling === product.id}
                                    >
                                        {product.status === 'published' ? 'Unpublish' : 'Publish'}
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
