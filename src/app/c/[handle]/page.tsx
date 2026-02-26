// /c/[handle] — Creator Hub (public catalog page)
// Fully branded with creator's brand_tokens from pipeline extraction

import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { PublicFooter } from '@/components/public-footer';
import { trackPageView } from '@/lib/track-view';
import { ShareButton } from '@/components/storefront/ShareButton';
import { StorefrontBuyButton } from '@/components/storefront/StorefrontBuyButton';
import type { Metadata } from 'next';

interface Props {
    params: Promise<{ handle: string }>;
}

interface BrandTokens {
    primaryColor?: string;
    secondaryColor?: string;
    backgroundColor?: string;
    textColor?: string;
    fontFamily?: string;
    mood?: string;
    borderRadius?: string;
}

const FONT_MAP: Record<string, string> = {
    inter: "'Inter', sans-serif",
    outfit: "'Outfit', sans-serif",
    roboto: "'Roboto', sans-serif",
    playfair: "'Playfair Display', serif",
};

const RADIUS_MAP: Record<string, string> = {
    sm: '8px',
    md: '12px',
    lg: '16px',
    full: '9999px',
};

// --- Dynamic SEO metadata ---
export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { handle } = await params;
    const supabase = await createClient();
    const { data: creator } = await supabase
        .from('creators')
        .select('display_name, bio, avatar_url')
        .eq('handle', handle)
        .single();

    if (!creator) return { title: 'Creator Not Found' };

    return {
        title: `${creator.display_name} — Owny Store`,
        description: creator.bio || `Check out ${creator.display_name}'s digital products`,
        openGraph: {
            title: `${creator.display_name} — Owny Store`,
            description: creator.bio || `Digital products by ${creator.display_name}`,
            images: creator.avatar_url ? [{ url: creator.avatar_url }] : [],
        },
    };
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

    // Extract brand tokens with defaults
    const bt = (creator.brand_tokens || {}) as BrandTokens;
    const primary = bt.primaryColor || '#6366f1';
    const secondary = bt.secondaryColor || '#8b5cf6';
    const bg = bt.backgroundColor || '#ffffff';
    const text = bt.textColor || '#1f2937';
    const fontFamily = FONT_MAP[bt.fontFamily || 'inter'] || FONT_MAP.inter;
    const radius = RADIUS_MAP[bt.borderRadius || 'md'] || RADIUS_MAP.md;
    const mood = bt.mood || 'clean';

    // Mood-specific styles
    const isDark = mood === 'premium' || bg.startsWith('#0') || bg.startsWith('#1');
    const mutedText = isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)';
    const cardBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.9)';
    const cardBorder = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)';
    const cardHoverBorder = primary + '60';
    const heroGradient = isDark
        ? `linear-gradient(135deg, ${primary}30 0%, ${secondary}15 50%, transparent 100%)`
        : `linear-gradient(135deg, ${primary}15 0%, ${secondary}08 50%, transparent 100%)`;

    const googleFontUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(
        bt.fontFamily === 'playfair' ? 'Playfair Display' :
            bt.fontFamily === 'outfit' ? 'Outfit' :
                bt.fontFamily === 'roboto' ? 'Roboto' : 'Inter'
    )}:wght@400;500;600;700&display=swap`;

    return (
        <>
            {/* eslint-disable-next-line @next/next/no-page-custom-font */}
            <link rel="stylesheet" href={googleFontUrl} />
            <div
                className="min-h-screen"
                style={{
                    backgroundColor: bg,
                    color: text,
                    fontFamily,
                }}
            >
                {/* Creator header */}
                <header
                    className="relative py-20 px-4"
                    style={{ background: heroGradient }}
                >
                    {/* Subtle pattern overlay for premium feel */}
                    <div
                        className="absolute inset-0 opacity-5"
                        style={{
                            backgroundImage: 'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)',
                            backgroundSize: '32px 32px',
                        }}
                    />
                    <div className="container mx-auto max-w-2xl text-center relative z-10">
                        {creator.avatar_url && (
                            <img
                                src={creator.avatar_url}
                                alt={creator.display_name}
                                className="w-24 h-24 rounded-full mx-auto mb-5 border-4 shadow-xl object-cover"
                                style={{
                                    borderColor: primary + '40',
                                    boxShadow: `0 8px 32px ${primary}20`,
                                }}
                            />
                        )}
                        <h1
                            className="text-4xl font-bold tracking-tight"
                            style={{ color: text }}
                        >
                            {creator.display_name}
                        </h1>
                        <p className="mt-2 text-lg" style={{ color: mutedText }}>
                            @{creator.handle}
                        </p>
                        {creator.bio && (
                            <p
                                className="text-base mt-4 max-w-lg mx-auto leading-relaxed"
                                style={{ color: mutedText }}
                            >
                                {creator.bio}
                            </p>
                        )}
                        <div className="mt-5">
                            <ShareButton handle={creator.handle} primaryColor={primary} />
                        </div>
                    </div>
                </header>

                <main className="container mx-auto max-w-2xl px-4 py-10">
                    {/* Featured product */}
                    {featuredProduct && (
                        <div className="mb-10">
                            <h2
                                className="text-xs font-semibold uppercase tracking-widest mb-4"
                                style={{ color: primary }}
                            >
                                ⭐ Featured
                            </h2>
                            <Link href={`/p/${featuredProduct.slug}`}>
                                <div
                                    className="p-6 transition-all duration-300 hover:scale-[1.01]"
                                    style={{
                                        background: cardBg,
                                        border: `2px solid ${primary}30`,
                                        borderRadius: radius,
                                        boxShadow: `0 4px 24px ${primary}10`,
                                    }}
                                    onMouseEnter={undefined}
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1">
                                            <h3
                                                className="text-xl font-bold"
                                                style={{ color: text }}
                                            >
                                                {featuredProduct.title}
                                            </h3>
                                            {featuredProduct.description && (
                                                <p
                                                    className="text-sm mt-2 line-clamp-2 leading-relaxed"
                                                    style={{ color: mutedText }}
                                                >
                                                    {featuredProduct.description}
                                                </p>
                                            )}
                                            <div className="flex items-center gap-3 mt-4">
                                                <Badge
                                                    style={{
                                                        backgroundColor: primary + '15',
                                                        color: primary,
                                                        border: `1px solid ${primary}25`,
                                                    }}
                                                >
                                                    {formatProductType(featuredProduct.type)}
                                                </Badge>
                                                <span
                                                    className="text-sm font-bold"
                                                    style={{ color: primary }}
                                                >
                                                    {formatPrice(featuredProduct.price_cents, featuredProduct.currency)}
                                                </span>
                                                <StorefrontBuyButton
                                                    productId={featuredProduct.id}
                                                    productSlug={featuredProduct.slug}
                                                    isFree={!featuredProduct.price_cents || featuredProduct.price_cents === 0}
                                                    primaryColor={primary}
                                                />
                                            </div>
                                        </div>
                                        <div
                                            className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-white font-bold"
                                            style={{ backgroundColor: primary }}
                                        >
                                            →
                                        </div>
                                    </div>
                                </div>
                            </Link>
                        </div>
                    )}

                    {/* Product grid */}
                    {otherProducts.length > 0 && (
                        <div>
                            <h2
                                className="text-xs font-semibold uppercase tracking-widest mb-4"
                                style={{ color: mutedText }}
                            >
                                Products
                            </h2>
                            <div className="grid gap-4 sm:grid-cols-2">
                                {otherProducts.map((product) => (
                                    <Link key={product.id} href={`/p/${product.slug}`}>
                                        <div
                                            className="p-5 h-full transition-all duration-200 hover:scale-[1.02]"
                                            style={{
                                                background: cardBg,
                                                border: `1px solid ${cardBorder}`,
                                                borderRadius: radius,
                                            }}
                                        >
                                            <h3 className="font-semibold" style={{ color: text }}>
                                                {product.title}
                                            </h3>
                                            {product.description && (
                                                <p
                                                    className="text-sm mt-1.5 line-clamp-2"
                                                    style={{ color: mutedText }}
                                                >
                                                    {product.description}
                                                </p>
                                            )}
                                            <div className="flex items-center gap-2 mt-3">
                                                <Badge
                                                    variant="outline"
                                                    style={{
                                                        borderColor: cardBorder,
                                                        color: mutedText,
                                                    }}
                                                >
                                                    {formatProductType(product.type)}
                                                </Badge>
                                                <span
                                                    className="text-sm font-semibold"
                                                    style={{ color: text }}
                                                >
                                                    {formatPrice(product.price_cents, product.currency)}
                                                </span>
                                            </div>
                                            <StorefrontBuyButton
                                                productId={product.id}
                                                productSlug={product.slug}
                                                isFree={!product.price_cents || product.price_cents === 0}
                                                primaryColor={primary}
                                                fullWidth
                                            />
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    )}

                    {(!products || products.length === 0) && (
                        <div className="text-center py-16">
                            <p className="text-lg" style={{ color: mutedText }}>
                                No products available yet. Check back soon!
                            </p>
                        </div>
                    )}
                </main>

                <PublicFooter />
            </div>
        </>
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
