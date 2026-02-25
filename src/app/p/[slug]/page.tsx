// /p/[slug] — Product Sales Page (public)
// PRD: Renders product details, DSL preview, and CTA
// HTML products render in sandboxed iframe for safety
// Legacy DSL: BlockRenderer fallback

import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { PublicFooter } from '@/components/public-footer';
import { trackPageView } from '@/lib/track-view';
import { BlockRenderer } from '@/components/builder/block-renderer';
import { CheckoutCtaButton } from '@/components/checkout/checkout-cta-button';
import type { ProductDSL, ThemeTokens } from '@/types/product-dsl';
import type { Metadata } from 'next';

interface Props {
    params: Promise<{ slug: string }>;
}

// --- Dynamic SEO metadata ---
export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { slug } = await params;
    const supabase = await createClient();

    const { data: product } = await supabase
        .from('products')
        .select('title, description, type, creators(display_name)')
        .eq('slug', slug)
        .eq('status', 'published')
        .single();

    if (!product) {
        return { title: 'Product Not Found' };
    }

    const creator = product.creators as unknown as { display_name: string } | null;
    const typeLabel = formatProductType(product.type);

    return {
        title: `${product.title} | ${typeLabel} by ${creator?.display_name || 'Creator'}`,
        description: product.description || `${typeLabel} by ${creator?.display_name || 'Creator'} — Available on Owny`,
        openGraph: {
            title: product.title,
            description: product.description || `${typeLabel} available on Owny`,
            type: 'website',
            siteName: 'Owny',
        },
        twitter: {
            card: 'summary_large_image',
            title: product.title,
            description: product.description || `${typeLabel} available on Owny`,
        },
    };
}

export default async function ProductPage({ params }: Props) {
    const { slug } = await params;
    const supabase = await createClient();

    // Fetch product by slug with creator info — include archived for takedown message
    const { data: product } = await supabase
        .from('products')
        .select(`
            *,
            creators(handle, display_name, avatar_url, bio, brand_tokens)
        `)
        .eq('slug', slug)
        .single();

    if (!product) {
        notFound();
    }

    // Takedown enforcement: show "Unavailable" for archived products
    if (product.status === 'archived') {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col">
                <header className="border-b bg-white/80 backdrop-blur-sm">
                    <div className="container mx-auto flex h-14 items-center justify-between px-4">
                        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                            ← Home
                        </Link>
                        <span className="text-sm font-semibold">Owny</span>
                    </div>
                </header>
                <main className="flex-1 flex items-center justify-center px-4">
                    <div className="text-center">
                        <h1 className="text-2xl font-bold text-muted-foreground">Product Unavailable</h1>
                        <p className="text-muted-foreground mt-2">This product is no longer available.</p>
                    </div>
                </main>
                <PublicFooter />
            </div>
        );
    }

    // Only show published products to public
    if (product.status !== 'published') {
        notFound();
    }

    // Track page view (fire-and-forget)
    trackPageView({ path: `/p/${slug}`, productId: product.id, creatorId: product.creator_id });

    // Fetch active version DSL + HTML
    let dsl: ProductDSL | null = null;
    let generatedHtml: string | null = null;
    if (product.active_version_id) {
        const { data: version } = await supabase
            .from('product_versions')
            .select('dsl_json, generated_html')
            .eq('id', product.active_version_id)
            .single();
        if (version?.dsl_json && typeof version.dsl_json === 'object') {
            dsl = version.dsl_json as unknown as ProductDSL;
        }
        generatedHtml = (version as unknown as { generated_html: string | null })?.generated_html || null;
    }

    const creator = product.creators as unknown as {
        handle: string;
        display_name: string;
        avatar_url: string | null;
        bio: string | null;
        brand_tokens: Record<string, string>;
    };

    const primaryColor = creator?.brand_tokens?.primaryColor || '#6366f1';
    const isFree = !product.price_cents || product.price_cents === 0;

    // If we have generated HTML, render in sandboxed iframe.
    if (generatedHtml) {
        return (
            <div className="min-h-screen flex flex-col">
                {/* Nav */}
                <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
                    <div className="container mx-auto flex h-14 items-center justify-between px-4">
                        <Link
                            href={`/c/${creator?.handle || ''}`}
                            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                            ← Back to {creator?.display_name || 'Creator'}
                        </Link>
                        <span className="text-sm font-semibold">Owny</span>
                    </div>
                </header>

                {/* Sandboxed preview isolates generated HTML from the app shell. */}
                <main className="flex-1 bg-gradient-to-br from-slate-50 to-slate-100">
                    <iframe
                        srcDoc={generatedHtml}
                        sandbox="allow-scripts"
                        className="w-full border-0"
                        style={{ minHeight: '80vh' }}
                        title={product.title}
                    />
                </main>

                {/* Sticky CTA — always visible at bottom */}
                <div className="sticky bottom-0 z-40 bg-white/95 backdrop-blur-sm border-t shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
                    <div className="container mx-auto max-w-md text-center px-4 py-4">
                        <div className="flex items-center justify-center gap-4">
                            <p className="text-2xl font-bold" style={{ color: primaryColor }}>
                                {isFree ? 'Free' : formatPrice(product.price_cents, product.currency)}
                            </p>
                            <CheckoutCtaButton
                                productId={product.id}
                                productSlug={product.slug}
                                isFree={isFree}
                                size="lg"
                                className="text-white px-8"
                                style={{ backgroundColor: primaryColor }}
                            >
                                {isFree ? 'Get Free Access' : 'Buy Now'}
                            </CheckoutCtaButton>
                        </div>
                    </div>
                </div>

                <PublicFooter />
            </div>
        );
    }

    // Theme tokens for legacy DSL rendering
    const themeTokens: ThemeTokens = {
        primaryColor: creator?.brand_tokens?.primaryColor || '#6366f1',
        secondaryColor: creator?.brand_tokens?.secondaryColor || '#8b5cf6',
        backgroundColor: creator?.brand_tokens?.backgroundColor || '#ffffff',
        textColor: creator?.brand_tokens?.textColor || '#1f2937',
        fontFamily: creator?.brand_tokens?.fontFamily || 'inter',
        borderRadius: 'md',
        spacing: 'normal',
        shadow: 'sm',
        mood: creator?.brand_tokens?.mood || 'professional',
    };

    // Check if DSL has renderable content
    const firstPage = dsl?.pages?.[0];
    const hasBlocks = firstPage && firstPage.blocks && firstPage.blocks.length > 0;

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col">
            {/* Nav */}
            <header className="border-b bg-white/80 backdrop-blur-sm">
                <div className="container mx-auto flex h-14 items-center justify-between px-4">
                    <Link
                        href={`/c/${creator?.handle || ''}`}
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                        ← Back to {creator?.display_name || 'Creator'}
                    </Link>
                    <span className="text-sm font-semibold">Owny</span>
                </div>
            </header>

            <main className="container mx-auto max-w-2xl px-4 py-12 flex-1">
                {/* Product header */}
                <div className="text-center mb-8">
                    <Badge variant="secondary" className="mb-3">
                        {formatProductType(product.type)}
                    </Badge>
                    <h1 className="text-3xl font-bold leading-tight">{product.title}</h1>
                    {product.description && (
                        <p className="text-muted-foreground mt-3 max-w-lg mx-auto">
                            {product.description}
                        </p>
                    )}
                </div>

                {/* Creator card */}
                <div className="flex items-center justify-center gap-3 mb-8">
                    {creator?.avatar_url && (
                        <img
                            src={creator.avatar_url}
                            alt={creator.display_name}
                            className="w-10 h-10 rounded-full object-cover"
                        />
                    )}
                    <div className="text-sm">
                        <p className="font-medium">{creator?.display_name}</p>
                        <Link
                            href={`/c/${creator?.handle}`}
                            className="text-muted-foreground hover:underline"
                        >
                            @{creator?.handle}
                        </Link>
                    </div>
                </div>

                <Separator className="my-8" />

                {/* DSL Content Preview */}
                {hasBlocks ? (
                    <div className="rounded-xl border bg-white p-6 mb-8 space-y-4">
                        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">
                            Preview
                        </h2>
                        {firstPage.blocks.slice(0, 5).map((block) => (
                            <BlockRenderer
                                key={block.id}
                                block={block}
                                theme={themeTokens}
                            />
                        ))}
                        {firstPage.blocks.length > 5 && (
                            <p className="text-sm text-muted-foreground text-center pt-2">
                                + {firstPage.blocks.length - 5} more sections
                            </p>
                        )}
                    </div>
                ) : (
                    <div className="rounded-xl border border-dashed bg-white/50 p-12 mb-8 text-center">
                        <p className="text-muted-foreground">
                            This product is being built. Content coming soon.
                        </p>
                    </div>
                )}

                {/* CTA */}
                <div className="text-center">
                    <div className="mb-4">
                        <p className="text-3xl font-bold" style={{ color: primaryColor }}>
                            {isFree ? 'Free' : formatPrice(product.price_cents, product.currency)}
                        </p>
                        {product.access_type === 'email_gated' && (
                            <p className="text-xs text-muted-foreground mt-1">
                                Enter your email to access
                            </p>
                        )}
                    </div>
                    <CheckoutCtaButton
                        productId={product.id}
                        productSlug={product.slug}
                        isFree={isFree}
                        size="lg"
                        className="w-full max-w-xs text-white"
                        style={{ backgroundColor: primaryColor }}
                    >
                        {isFree ? 'Get Free Access' : 'Buy Now'}
                    </CheckoutCtaButton>
                    <p className="text-xs text-muted-foreground mt-3">
                        Secure checkout powered by Stripe
                    </p>
                </div>
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
