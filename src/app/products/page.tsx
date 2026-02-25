// /products — Creator's product list page
// Shows all products for the current creator with status, type, and quick actions

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default async function ProductsPage() {
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

    const { data: products } = await supabase
        .from('products')
        .select('id, title, slug, type, status, price_cents, currency, created_at')
        .eq('creator_id', creator.id)
        .order('created_at', { ascending: false });

    const formatType = (type: string) => {
        const map: Record<string, string> = {
            pdf_guide: 'PDF Guide',
            mini_course: 'Mini Course',
            challenge_7day: '7-Day Challenge',
            checklist_toolkit: 'Toolkit',
        };
        return map[type] || type;
    };

    const formatPrice = (cents: number | null, currency: string) => {
        if (!cents || cents === 0) return 'Free';
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency || 'usd',
        }).format(cents / 100);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
            <header className="border-b bg-white/80 backdrop-blur-sm">
                <div className="container mx-auto flex h-16 items-center justify-between px-4">
                    <div className="flex items-center gap-3">
                        <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
                            ← Dashboard
                        </Link>
                        <h1 className="text-sm font-medium">My Products</h1>
                    </div>
                    <Link href="/dashboard">
                        <Button size="sm">+ New Product</Button>
                    </Link>
                </div>
            </header>

            <main className="container mx-auto max-w-3xl px-4 py-8">
                <div className="mb-6">
                    <h2 className="text-2xl font-bold">Products</h2>
                    <p className="text-muted-foreground text-sm mt-1">
                        {products?.length || 0} {(products?.length || 0) === 1 ? 'product' : 'products'}
                    </p>
                </div>

                {!products || products.length === 0 ? (
                    <div className="rounded-xl border bg-white p-12 text-center">
                        <p className="text-3xl mb-3">📦</p>
                        <p className="font-medium text-lg">No products yet</p>
                        <p className="text-sm text-muted-foreground mt-1 mb-4">
                            Create your first digital product from your video content.
                        </p>
                        <Link href="/dashboard">
                            <Button>Create Your First Product</Button>
                        </Link>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {products.map((product) => (
                            <Link
                                key={product.id}
                                href={`/products/${product.id}`}
                                className="block rounded-xl border bg-white p-5 hover:shadow-md transition-shadow"
                            >
                                <div className="flex items-start justify-between">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-semibold">{product.title}</h3>
                                            <Badge
                                                variant={product.status === 'published' ? 'default' : 'secondary'}
                                            >
                                                {product.status}
                                            </Badge>
                                        </div>
                                        <p className="text-sm text-muted-foreground mt-1">
                                            {formatType(product.type)} · {formatPrice(product.price_cents, product.currency)}
                                        </p>
                                    </div>
                                    <span className="text-xs text-muted-foreground">
                                        {new Date(product.created_at).toLocaleDateString()}
                                    </span>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
