// /c/[handle] — Creator Hub (public catalog page)
// PRD: Public page showing creator profile + published products

import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { PublicFooter } from '@/components/public-footer';
import { trackPageView } from '@/lib/track-view';

interface Props {
    params: Promise<{ handle: string }>;
}

export default async function CreatorHubPage({ params }: Props) {
    const { handle } = await params;
    const supabase = await createClient();

    // Fetch creator by handle
    const { data: creator } = await supabase
        .from('creators')
        .select('*, profiles(email)')
        .eq('handle', handle)
        .single();

    if (!creator) {
        notFound();
    }

    // Track page view (fire-and-forget)
    trackPageView({ path: `/c/${handle}`, creatorId: creator.id });

    // Fetch published products
    const { data: products } = await supabase
        .from('products')
        .select('id, slug, type, title, description, price_cents, currency, access_type, published_at')
        .eq('creator_id', creator.id)
        .eq('status', 'published')
        .order('published_at', { ascending: false });

    // Get featured product
    const featuredProduct = creator.featured_product_id
        ? products?.find((p) => p.id === creator.featured_product_id)
        : null;

    const otherProducts = products?.filter((p) => p.id !== creator.featured_product_id) || [];
    const brandTokens = (creator.brand_tokens || {}) as Record<string, string>;
    const primaryColor = brandTokens.primaryColor || '#6366f1';

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
            {/* Creator header */}
            <header
                className="relative py-16 px-4"
                style={{
                    background: `linear-gradient(135deg, ${primaryColor}22, ${primaryColor}08)`,
                }}
            >
                <div className="container mx-auto max-w-3xl text-center">
                    {creator.avatar_url && (
                        <img
                            src={creator.avatar_url}
                            alt={creator.display_name}
                            className="w-20 h-20 rounded-full mx-auto mb-4 border-4 border-white shadow-lg object-cover"
                        />
                    )}
                    <h1 className="text-3xl font-bold">{creator.display_name}</h1>
                    <p className="text-muted-foreground mt-1">@{creator.handle}</p>
                    {creator.bio && (
                        <p className="text-sm mt-3 max-w-md mx-auto text-muted-foreground">
                            {creator.bio}
                        </p>
                    )}
                </div>
            </header>

            <main className="container mx-auto max-w-3xl px-4 py-8">
                {/* Featured product */}
                {featuredProduct && (
                    <div className="mb-8">
                        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
                            ⭐ Featured
                        </h2>
                        <Link href={`/p/${featuredProduct.slug}`}>
                            <div
                                className="rounded-xl border-2 p-6 bg-white hover:shadow-lg transition-shadow cursor-pointer"
                                style={{ borderColor: primaryColor + '40' }}
                            >
                                <div className="flex items-start justify-between">
                                    <div>
                                        <h3 className="text-xl font-bold">{featuredProduct.title}</h3>
                                        {featuredProduct.description && (
                                            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                                {featuredProduct.description}
                                            </p>
                                        )}
                                        <div className="flex items-center gap-2 mt-3">
                                            <Badge variant="secondary">
                                                {formatProductType(featuredProduct.type)}
                                            </Badge>
                                            <span className="text-sm font-semibold">
                                                {formatPrice(featuredProduct.price_cents, featuredProduct.currency)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </Link>
                    </div>
                )}

                {/* Product grid */}
                {otherProducts.length > 0 && (
                    <div>
                        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
                            Products
                        </h2>
                        <div className="grid gap-4 sm:grid-cols-2">
                            {otherProducts.map((product) => (
                                <Link key={product.id} href={`/p/${product.slug}`}>
                                    <div className="rounded-xl border bg-white p-5 hover:shadow-md transition-shadow cursor-pointer h-full">
                                        <h3 className="font-semibold">{product.title}</h3>
                                        {product.description && (
                                            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                                {product.description}
                                            </p>
                                        )}
                                        <div className="flex items-center gap-2 mt-3">
                                            <Badge variant="outline">
                                                {formatProductType(product.type)}
                                            </Badge>
                                            <span className="text-sm font-medium">
                                                {formatPrice(product.price_cents, product.currency)}
                                            </span>
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </div>
                )}

                {(!products || products.length === 0) && (
                    <p className="text-center text-muted-foreground py-12">
                        No products available yet. Check back soon!
                    </p>
                )}
            </main>

            <PublicFooter />
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
