// /products/[id] — Product detail/manage page (creator-only)

import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ProductActions } from './product-actions';

interface Props {
    params: Promise<{ id: string }>;
}

export default async function ProductDetailPage({ params }: Props) {
    const { id } = await params;
    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect('/sign-in');

    const { data: creator } = await supabase
        .from('creators')
        .select('id')
        .eq('profile_id', user.id)
        .single();

    if (!creator) redirect('/onboard');

    const { data: product, error: productError } = await supabase
        .from('products')
        .select(`
            *,
            product_versions(id, version_number, published_at, created_at)
        `)
        .eq('id', id)
        .single();

    // If query errored (likely RLS/session issue), redirect instead of hard 404
    if (productError && !product) {
        console.error('Product query error:', productError.message, { id, creatorId: creator.id });
        // If PGRST116 (no rows), the product genuinely doesn't exist or RLS blocks it
        // Redirect to products list with a message rather than showing a 404 page
        redirect('/products');
    }

    if (!product || product.creator_id !== creator.id) {
        notFound();
    }

    const versions = (product.product_versions || []) as {
        id: string;
        version_number: number;
        published_at: string | null;
        created_at: string;
    }[];

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
            <header className="border-b bg-white/80 backdrop-blur-sm">
                <div className="container mx-auto flex h-16 items-center justify-between px-4">
                    <div className="flex items-center gap-3">
                        <Link href="/products" className="text-sm text-muted-foreground hover:text-foreground">
                            ← Products
                        </Link>
                        <Separator orientation="vertical" className="h-4" />
                        <h1 className="text-sm font-medium truncate max-w-xs">{product.title}</h1>
                    </div>
                    <ProductActions productId={product.id} status={product.status} />
                </div>
            </header>

            <main className="container mx-auto max-w-3xl px-4 py-8">
                <div className="flex items-start justify-between mb-6">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <h2 className="text-2xl font-bold">{product.title}</h2>
                            <Badge variant={product.status === 'published' ? 'default' : 'secondary'}>
                                {product.status}
                            </Badge>
                        </div>
                        <p className="text-muted-foreground">
                            {formatProductType(product.type)} · {formatPrice(product.price_cents, product.currency)}
                        </p>
                        {product.description && (
                            <p className="text-sm text-muted-foreground mt-2">{product.description}</p>
                        )}
                    </div>
                </div>

                {/* Quick stats */}
                <div className="grid grid-cols-3 gap-4 mb-8">
                    <Card>
                        <CardContent className="pt-4 text-center">
                            <p className="text-2xl font-bold">{versions.length}</p>
                            <p className="text-xs text-muted-foreground">Versions</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-4 text-center">
                            <p className="text-2xl font-bold">{product.status === 'published' ? '✅' : '—'}</p>
                            <p className="text-xs text-muted-foreground">Published</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-4 text-center">
                            <p className="text-2xl font-bold">
                                {product.slug ? (
                                    <Link href={`/p/${product.slug}`} className="text-primary hover:underline text-sm">
                                        View
                                    </Link>
                                ) : '—'}
                            </p>
                            <p className="text-xs text-muted-foreground">Sales Page</p>
                        </CardContent>
                    </Card>
                </div>

                {/* Version history */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Version History</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {versions.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No versions yet.</p>
                        ) : (
                            <div className="space-y-2">
                                {versions
                                    .sort((a, b) => b.version_number - a.version_number)
                                    .map((v) => (
                                        <div
                                            key={v.id}
                                            className={`flex items-center justify-between px-3 py-2 rounded-lg ${v.id === product.active_version_id
                                                ? 'bg-primary/5 border border-primary/20'
                                                : 'bg-muted/50'
                                                }`}
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-medium">v{v.version_number}</span>
                                                {v.id === product.active_version_id && (
                                                    <Badge variant="outline" className="text-xs">Active</Badge>
                                                )}
                                                {v.published_at && (
                                                    <Badge variant="secondary" className="text-xs">Published</Badge>
                                                )}
                                            </div>
                                            <span className="text-xs text-muted-foreground">
                                                {new Date(v.created_at).toLocaleDateString()}
                                            </span>
                                        </div>
                                    ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* AI builder placeholder */}
                <Card className="mt-4">
                    <CardContent className="py-12 text-center">
                        <p className="text-3xl mb-2">🤖</p>
                        <p className="font-medium">AI Product Builder</p>
                        <p className="text-sm text-muted-foreground mt-1">
                            Design and customize your product pages with the Vibe Builder.
                        </p>
                        <Link href={`/products/${product.id}/builder`}>
                            <Button className="mt-4">
                                Open Builder
                            </Button>
                        </Link>
                    </CardContent>
                </Card>
            </main>
        </div>
    );
}

function formatProductType(type: string): string {
    const map: Record<string, string> = {
        pdf_guide: 'PDF Guide',
        mini_course: 'Mini Course',
        challenge_7day: '7-Day Challenge',
        checklist_toolkit: 'Toolkit',
    };
    return map[type] || type;
}

function formatPrice(cents: number | null, currency: string): string {
    if (!cents || cents === 0) return 'Free';
    const amount = cents / 100;
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency || 'usd',
    }).format(amount);
}
