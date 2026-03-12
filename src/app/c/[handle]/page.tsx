// /c/[handle] — Creator Hub (public catalog page)

import { ArrowRight, BookOpenText, FileText, ListChecks, Sparkles, Star, Zap } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { PublicFooter } from '@/components/public-footer';
import { trackPageView } from '@/lib/track-view';
import { ShareButton } from '@/components/storefront/ShareButton';
import { StorefrontBuyButton } from '@/components/storefront/StorefrontBuyButton';
import { FadeIn, FadeInStagger, FadeInStaggerItem } from '@/components/storefront/ProductPageAnimations';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

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
    sm: '18px',
    md: '24px',
    lg: '30px',
    full: '9999px',
};

const TYPE_ICONS: Record<string, ReactNode> = {
    pdf_guide: <FileText className="size-5" />,
    mini_course: <BookOpenText className="size-5" />,
    challenge_7day: <Zap className="size-5" />,
    checklist_toolkit: <ListChecks className="size-5" />,
};

function withAlpha(color: string, alpha: number): string {
    const percent = Math.max(0, Math.min(100, Math.round(alpha * 100)));
    return `color-mix(in srgb, ${color} ${percent}%, transparent)`;
}

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

    const { data: creator } = await supabase
        .from('creators')
        .select('id, handle, display_name, bio, avatar_url, featured_product_id, brand_tokens')
        .eq('handle', handle)
        .single();

    if (!creator) {
        notFound();
    }

    trackPageView({ path: `/c/${handle}`, creatorId: creator.id });

    const { data: products } = await supabase
        .from('products')
        .select('id, slug, type, title, description, price_cents, currency, access_type, published_at')
        .eq('creator_id', creator.id)
        .eq('status', 'published')
        .order('published_at', { ascending: false });

    const featuredProduct = creator.featured_product_id
        ? products?.find((product) => product.id === creator.featured_product_id) || null
        : products?.[0] || null;
    const otherProducts = (products || []).filter((product) => product.id !== featuredProduct?.id);

    const bt = (creator.brand_tokens || {}) as BrandTokens;
    const primary = bt.primaryColor || '#2563eb';
    const secondary = bt.secondaryColor || '#f97316';
    const background = bt.backgroundColor || '#f8fafc';
    const text = bt.textColor || '#0f172a';
    const fontFamily = FONT_MAP[bt.fontFamily || 'inter'] || FONT_MAP.inter;
    const radius = RADIUS_MAP[bt.borderRadius || 'md'] || RADIUS_MAP.md;
    const mood = bt.mood || 'clean';
    const isDark = mood === 'premium' || background.includes('#0') || background.includes('#1');
    const mutedText = withAlpha(text, isDark ? 0.7 : 0.62);
    const surfaceBg = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.86)';
    const surfaceBorder = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.08)';
    const pageBackground = `radial-gradient(circle at top left, ${withAlpha(primary, 0.16)}, transparent 32%), radial-gradient(circle at top right, ${withAlpha(secondary, 0.14)}, transparent 28%), linear-gradient(180deg, ${background} 0%, #ffffff 100%)`;
    const heroGlow = `linear-gradient(135deg, ${withAlpha(primary, 0.18)} 0%, ${withAlpha(secondary, 0.12)} 56%, transparent 100%)`;
    const productCount = products?.length || 0;

    const googleFontUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(
        bt.fontFamily === 'playfair'
            ? 'Playfair Display'
            : bt.fontFamily === 'outfit'
                ? 'Outfit'
                : bt.fontFamily === 'roboto'
                    ? 'Roboto'
                    : 'Inter'
    )}:wght@400;500;600;700;800&display=swap`;

    return (
        <>
            <link rel="stylesheet" href={googleFontUrl} />
            <div
                className="min-h-screen"
                style={{
                    background: pageBackground,
                    color: text,
                    fontFamily,
                }}
            >
                {/* ── Hero ────────────────────────────── */}
                <header className="relative overflow-hidden border-b border-slate-200/70">
                    <div className="absolute inset-0 opacity-80" style={{ background: heroGlow }} />
                    <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)', backgroundSize: '28px 28px' }} />

                    <div className="relative mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-18">
                        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
                            <FadeIn>
                                <div className="flex items-center gap-3">
                                    {creator.avatar_url ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={creator.avatar_url}
                                            alt={creator.display_name}
                                            className="size-16 rounded-full border-2 border-white/80 object-cover shadow-lg"
                                        />
                                    ) : (
                                        <div
                                            className="inline-flex size-16 items-center justify-center rounded-full border-2 border-white/80 text-lg font-bold text-white shadow-lg"
                                            style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }}
                                        >
                                            {creator.display_name?.slice(0, 1) || 'C'}
                                        </div>
                                    )}
                                    <div>
                                        <Badge
                                            variant="outline"
                                            className="border-white/70 bg-white/70 text-[10px] uppercase tracking-[0.18em] text-slate-700"
                                        >
                                            Creator Store
                                        </Badge>
                                        <p className="mt-1 text-base font-medium" style={{ color: mutedText }}>@{creator.handle}</p>
                                    </div>
                                </div>

                                <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl" style={{ color: text }}>
                                    {creator.display_name}
                                </h1>
                                {creator.bio && (
                                    <p className="mt-4 max-w-2xl text-sm leading-7 sm:text-base" style={{ color: mutedText }}>
                                        {creator.bio}
                                    </p>
                                )}

                                <div className="mt-7 flex flex-wrap items-center gap-3">
                                    <ShareButton handle={creator.handle} primaryColor={primary} />
                                    {featuredProduct && (
                                        <Link
                                            href={`/p/${featuredProduct.slug}`}
                                            className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-transform duration-200 hover:-translate-y-0.5"
                                            style={{
                                                borderColor: withAlpha(primary, 0.22),
                                                background: 'rgba(255,255,255,0.72)',
                                                color: text,
                                            }}
                                        >
                                            Explore featured
                                            <ArrowRight className="size-4" />
                                        </Link>
                                    )}
                                </div>
                            </FadeIn>

                            {/* Stats cards — slimmed down from the old "Store highlight" */}
                            <FadeIn delay={0.1}>
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <div
                                        className="rounded-[26px] border px-4 py-4 shadow-[0_20px_50px_-42px_rgba(15,23,42,0.35)] backdrop-blur"
                                        style={{ background: surfaceBg, borderColor: surfaceBorder, borderRadius: radius }}
                                    >
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: mutedText }}>
                                            Products
                                        </p>
                                        <p className="mt-2 text-3xl font-semibold tracking-tight">{productCount}</p>
                                        <p className="mt-1 text-xs" style={{ color: mutedText }}>Available now</p>
                                    </div>
                                    <div
                                        className="rounded-[26px] border px-4 py-4 shadow-[0_20px_50px_-42px_rgba(15,23,42,0.35)] backdrop-blur"
                                        style={{ background: surfaceBg, borderColor: surfaceBorder, borderRadius: radius }}
                                    >
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: mutedText }}>
                                            Featured
                                        </p>
                                        <p className="mt-2 text-lg font-semibold tracking-tight">
                                            {featuredProduct ? formatProductType(featuredProduct.type) : 'Curating now'}
                                        </p>
                                        <p className="mt-1 text-xs" style={{ color: mutedText }}>
                                            {featuredProduct ? 'Lead offer' : 'Coming soon'}
                                        </p>
                                    </div>
                                </div>
                            </FadeIn>
                        </div>
                    </div>
                </header>

                {/* ── Main Catalog ────────────────────── */}
                <main className="mx-auto max-w-6xl px-4 pb-28 pt-10 sm:px-6 sm:pt-12 lg:pb-16">
                    {/* Featured Product */}
                    {featuredProduct && (
                        <FadeIn>
                            <section className="mb-12">
                                <div className="mb-4 flex items-center gap-2">
                                    <span
                                        className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]"
                                        style={{
                                            borderColor: withAlpha(primary, 0.22),
                                            background: withAlpha(primary, 0.12),
                                            color: primary,
                                        }}
                                    >
                                        <Star className="size-3" />
                                        Featured product
                                    </span>
                                </div>

                                <Link href={`/p/${featuredProduct.slug}`} className="block">
                                    <article
                                        className="overflow-hidden rounded-[34px] border p-6 shadow-[0_28px_90px_-56px_rgba(15,23,42,0.35)] transition-transform duration-300 hover:-translate-y-1 sm:p-7"
                                        style={{
                                            background: surfaceBg,
                                            borderColor: withAlpha(primary, 0.2),
                                            borderRadius: radius,
                                        }}
                                    >
                                        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span
                                                        className="inline-flex size-10 items-center justify-center rounded-xl text-white shadow-md"
                                                        style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }}
                                                    >
                                                        {TYPE_ICONS[featuredProduct.type] || <Sparkles className="size-5" />}
                                                    </span>
                                                    <Badge
                                                        variant="outline"
                                                        className="border-none text-[10px] uppercase tracking-[0.16em]"
                                                        style={{
                                                            background: withAlpha(primary, 0.12),
                                                            color: primary,
                                                        }}
                                                    >
                                                        {formatProductType(featuredProduct.type)}
                                                    </Badge>
                                                </div>
                                                <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                                                    {featuredProduct.title}
                                                </h2>
                                                {featuredProduct.description && (
                                                    <p className="mt-4 max-w-2xl text-sm leading-7 sm:text-base" style={{ color: mutedText }}>
                                                        {featuredProduct.description}
                                                    </p>
                                                )}
                                            </div>

                                            <div className="rounded-[28px] border bg-white/82 p-5 shadow-[0_24px_70px_-52px_rgba(15,23,42,0.3)]">
                                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: mutedText }}>
                                                    Offer
                                                </p>
                                                <p className="mt-3 text-4xl font-semibold tracking-tight" style={{ color: text }}>
                                                    {formatPrice(featuredProduct.price_cents, featuredProduct.currency)}
                                                </p>
                                                <p className="mt-2 text-sm leading-6" style={{ color: mutedText }}>
                                                    {featuredProduct.access_type === 'email_gated'
                                                        ? 'Email-gated access with instant delivery.'
                                                        : 'Secure checkout and immediate library access.'}
                                                </p>
                                                <div className="mt-5 flex items-center gap-3">
                                                    <StorefrontBuyButton
                                                        productId={featuredProduct.id}
                                                        productSlug={featuredProduct.slug}
                                                        isFree={!featuredProduct.price_cents || featuredProduct.price_cents === 0}
                                                        primaryColor={primary}
                                                    />
                                                    <span className="text-sm font-medium" style={{ color: mutedText }}>
                                                        Open product
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </article>
                                </Link>
                            </section>
                        </FadeIn>
                    )}

                    {/* Product Grid */}
                    {otherProducts.length > 0 && (
                        <section>
                            <FadeIn>
                                <div className="mb-5 flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: mutedText }}>
                                            Browse the catalog
                                        </p>
                                        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                                            More digital products
                                        </h2>
                                    </div>
                                    <span className="hidden rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-500 sm:inline-flex">
                                        {otherProducts.length} {otherProducts.length === 1 ? 'product' : 'products'}
                                    </span>
                                </div>
                            </FadeIn>

                            <FadeInStagger className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                                {otherProducts.map((product, idx) => (
                                    <FadeInStaggerItem key={product.id}>
                                        <Link href={`/p/${product.slug}`} className="block h-full">
                                            <article
                                                className="flex h-full flex-col rounded-[30px] border p-5 shadow-[0_24px_70px_-56px_rgba(15,23,42,0.32)] transition-transform duration-300 hover:-translate-y-1"
                                                style={{
                                                    background: surfaceBg,
                                                    borderColor: surfaceBorder,
                                                    borderRadius: radius,
                                                }}
                                            >
                                                <div className="flex items-center justify-between gap-3">
                                                    <div className="flex items-center gap-2">
                                                        <span
                                                            className="inline-flex size-8 items-center justify-center rounded-lg text-white shadow-sm"
                                                            style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }}
                                                        >
                                                            {TYPE_ICONS[product.type] || <Sparkles className="size-4" />}
                                                        </span>
                                                        <Badge
                                                            variant="outline"
                                                            className="border-none text-[10px] uppercase tracking-[0.16em]"
                                                            style={{
                                                                background: withAlpha(primary, 0.12),
                                                                color: primary,
                                                            }}
                                                        >
                                                            {formatProductType(product.type)}
                                                        </Badge>
                                                    </div>
                                                    {idx === 0 && (
                                                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                                            New
                                                        </span>
                                                    )}
                                                </div>

                                                <h3 className="mt-4 text-xl font-semibold tracking-tight text-slate-950">
                                                    {product.title}
                                                </h3>
                                                {product.description && (
                                                    <p className="mt-3 flex-1 text-sm leading-7" style={{ color: mutedText }}>
                                                        {product.description}
                                                    </p>
                                                )}
                                                <div className="mt-5 flex items-center justify-between gap-3">
                                                    <div>
                                                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: mutedText }}>
                                                            Price
                                                        </p>
                                                        <p className="mt-1 text-lg font-semibold">{formatPrice(product.price_cents, product.currency)}</p>
                                                    </div>
                                                </div>
                                                <StorefrontBuyButton
                                                    productId={product.id}
                                                    productSlug={product.slug}
                                                    isFree={!product.price_cents || product.price_cents === 0}
                                                    primaryColor={primary}
                                                    fullWidth
                                                />
                                            </article>
                                        </Link>
                                    </FadeInStaggerItem>
                                ))}
                            </FadeInStagger>
                        </section>
                    )}

                    {/* Empty State */}
                    {(!products || products.length === 0) && (
                        <FadeIn>
                            <section
                                className="rounded-[32px] border px-6 py-16 text-center shadow-[0_24px_70px_-56px_rgba(15,23,42,0.3)]"
                                style={{ background: surfaceBg, borderColor: surfaceBorder, borderRadius: radius }}
                            >
                                <span
                                    className="mx-auto inline-flex size-16 items-center justify-center rounded-2xl text-white shadow-lg"
                                    style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }}
                                >
                                    <Sparkles className="size-7" />
                                </span>
                                <p className="mt-5 text-xl font-semibold text-slate-950">
                                    {creator.display_name} is building something special.
                                </p>
                                <p className="mx-auto mt-3 max-w-md text-sm leading-7" style={{ color: mutedText }}>
                                    The first product is being crafted right now. Follow along and be first to know when it drops.
                                </p>
                                <div className="mt-6">
                                    <ShareButton handle={creator.handle} primaryColor={primary} />
                                </div>
                            </section>
                        </FadeIn>
                    )}
                </main>

                {/* ── Mobile Sticky CTA (for featured product) ── */}
                {featuredProduct && (
                    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/80 bg-white/96 px-4 py-3 shadow-[0_-18px_40px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden">
                        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
                            <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-slate-950">{featuredProduct.title}</p>
                                <p className="text-lg font-bold tracking-tight" style={{ color: primary }}>
                                    {formatPrice(featuredProduct.price_cents, featuredProduct.currency)}
                                </p>
                            </div>
                            <StorefrontBuyButton
                                productId={featuredProduct.id}
                                productSlug={featuredProduct.slug}
                                isFree={!featuredProduct.price_cents || featuredProduct.price_cents === 0}
                                primaryColor={primary}
                            />
                        </div>
                    </div>
                )}

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
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency || 'usd',
    }).format(cents / 100);
}
