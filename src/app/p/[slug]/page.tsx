// /p/[slug] — Product sales page (public)

import {
    ArrowLeft,
    ArrowRight,
    BadgeCheck,
    BookOpenText,
    ChevronDown,
    CreditCard,
    FileText,
    Layers3,
    ListChecks,
    MessageCircleQuestion,
    ShieldCheck,
    Sparkles,
    Zap,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { PublicFooter } from '@/components/public-footer';
import { trackPageView } from '@/lib/track-view';
import { BlockRenderer } from '@/components/builder/block-renderer';
import { CheckoutCtaButton } from '@/components/checkout/checkout-cta-button';
import { PublicGeneratedHtmlFrame } from '@/components/public-generated-html-frame';
import { FadeIn, FadeInStagger, FadeInStaggerItem } from '@/components/storefront/ProductPageAnimations';
import type { ProductDSL, ThemeTokens } from '@/types/product-dsl';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

interface Props {
    params: Promise<{ slug: string }>;
}

interface CreatorInfo {
    handle: string;
    display_name: string;
    avatar_url: string | null;
    bio: string | null;
    brand_tokens: Record<string, string | undefined>;
}

interface ProductRecord {
    id: string;
    slug: string;
    title: string;
    description: string | null;
    type: string;
    price_cents: number | null;
    currency: string;
    access_type: string | null;
    creator_id: string;
    status: string;
    active_version_id: string | null;
    creators: CreatorInfo;
}

function withAlpha(color: string, alpha: number): string {
    const percent = Math.max(0, Math.min(100, Math.round(alpha * 100)));
    return `color-mix(in srgb, ${color} ${percent}%, transparent)`;
}

const PRODUCT_TYPE_ICONS: Record<string, ReactNode> = {
    pdf_guide: <FileText className="size-7 text-white" />,
    mini_course: <BookOpenText className="size-7 text-white" />,
    challenge_7day: <Zap className="size-7 text-white" />,
    checklist_toolkit: <ListChecks className="size-7 text-white" />,
};

const PRODUCT_FAQ: Array<{ q: string; a: string }> = [
    {
        q: 'How do I access this product after buying?',
        a: 'Right after checkout you\'ll land in your personal library with instant access to the full product. No waiting, no extra steps.',
    },
    {
        q: 'Is my payment secure?',
        a: 'Absolutely. All payments are processed through Stripe, one of the most trusted payment platforms in the world. Your card information never touches our servers.',
    },
    {
        q: 'Can I get a refund?',
        a: 'Yes. If the product doesn\'t meet your expectations, reach out within 7 days for a full refund. See our refund policy for details.',
    },
    {
        q: 'Who created this product?',
        a: 'This product was built from a real creator\'s content library. Every insight is grounded in their published materials — nothing generic.',
    },
];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { slug } = await params;
    const supabase = await createClient();

    const { data: product } = await supabase
        .from('products')
        .select('title, description, type, creators!products_creator_id_fkey(display_name)')
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

    const { data: productData } = await supabase
        .from('products')
        .select(`
            id,
            slug,
            title,
            description,
            type,
            price_cents,
            currency,
            access_type,
            creator_id,
            status,
            active_version_id,
            creators!products_creator_id_fkey(handle, display_name, avatar_url, bio, brand_tokens)
        `)
        .eq('slug', slug)
        .single();

    if (!productData) {
        notFound();
    }

    const product = productData as unknown as ProductRecord;

    if (product.status === 'archived') {
        return (
            <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_100%)]">
                <header className="border-b border-slate-200/80 bg-white/85 backdrop-blur">
                    <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
                        <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-500 transition-colors hover:text-slate-900">
                            <ArrowLeft className="size-4" />
                            Home
                        </Link>
                        <span className="text-sm font-semibold text-slate-950">Owny</span>
                    </div>
                </header>
                <main className="mx-auto flex min-h-[70vh] max-w-2xl items-center justify-center px-4 text-center sm:px-6">
                    <div className="rounded-[30px] border border-slate-200 bg-white px-8 py-12 shadow-[0_28px_80px_-56px_rgba(15,23,42,0.28)]">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Unavailable</p>
                        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">This product is no longer available.</h1>
                        <p className="mt-3 text-sm leading-7 text-slate-500">
                            The creator removed this listing or it has been archived.
                        </p>
                    </div>
                </main>
                <PublicFooter />
            </div>
        );
    }

    if (product.status !== 'published') {
        notFound();
    }

    trackPageView({ path: `/p/${slug}`, productId: product.id, creatorId: product.creator_id });

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

    const creator = product.creators;
    const primaryColor = creator?.brand_tokens?.primaryColor || '#2563eb';
    const secondaryColor = creator?.brand_tokens?.secondaryColor || '#f97316';
    const pageAccent = `radial-gradient(circle at top left, ${withAlpha(primaryColor, 0.16)}, transparent 32%), radial-gradient(circle at top right, ${withAlpha(secondaryColor, 0.14)}, transparent 30%), linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)`;
    const isFree = !product.price_cents || product.price_cents === 0;
    const ctaLabel = isFree ? 'Get Free Access' : 'Buy Now';
    const typeLabel = formatProductType(product.type);
    const typeIcon = PRODUCT_TYPE_ICONS[product.type] || <Sparkles className="size-7 text-white" />;

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

    const firstPage = dsl?.pages?.[0];
    const hasBlocks = Boolean(firstPage?.blocks?.length);

    // Derive "What's Inside" from DSL block titles
    const insideItems = firstPage?.blocks
        ?.filter((b) => b.type === 'TextSection' || b.type === 'Steps' || b.type === 'ModuleHeader' || b.type === 'LessonContent' || b.type === 'DayHeader' || b.type === 'Checklist')
        ?.map((b) => (b as unknown as { props?: { title?: string } }).props?.title)
        ?.filter((t): t is string => Boolean(t))
        ?.slice(0, 8) || [];

    return (
        <div className="min-h-screen" style={{ background: pageAccent }}>
            {/* ── Sticky Header ──────────────────────────── */}
            <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/88 backdrop-blur">
                <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
                    <Link
                        href={`/c/${creator?.handle || ''}`}
                        className="inline-flex items-center gap-2 text-sm text-slate-500 transition-colors hover:text-slate-950"
                    >
                        <ArrowLeft className="size-4" />
                        Back to {creator?.display_name || 'Creator'}
                    </Link>
                    <span className="text-sm font-semibold text-slate-950">Owny</span>
                </div>
            </header>

            {/* ── Hero Section ───────────────────────────── */}
            <section className="relative overflow-hidden border-b border-slate-200/70">
                <div className="absolute inset-0 opacity-80" style={{ background: `linear-gradient(135deg, ${withAlpha(primaryColor, 0.16)} 0%, ${withAlpha(secondaryColor, 0.1)} 58%, transparent 100%)` }} />
                {/* Dot pattern overlay */}
                <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)', backgroundSize: '24px 24px' }} />

                <div className="relative mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
                    <div className="grid gap-8 lg:grid-cols-[1.08fr_0.92fr] lg:items-end">
                        <FadeIn>
                            <div className="flex items-center gap-3">
                                {/* Product type icon */}
                                <span
                                    className="inline-flex size-12 items-center justify-center rounded-2xl shadow-lg"
                                    style={{ background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})` }}
                                >
                                    {typeIcon}
                                </span>
                                <Badge
                                    variant="outline"
                                    className="border-white/80 bg-white/70 text-[10px] uppercase tracking-[0.16em] text-slate-700"
                                >
                                    {typeLabel}
                                </Badge>
                            </div>
                            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
                                {product.title}
                            </h1>
                            {product.description && (
                                <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
                                    {product.description}
                                </p>
                            )}

                            <div className="mt-7 flex flex-wrap gap-2">
                                <HeroPill label="Instant access" icon={<BadgeCheck className="size-3.5" />} />
                                <HeroPill label="Secure checkout" icon={<ShieldCheck className="size-3.5" />} />
                                <HeroPill label="Creator-built product" icon={<Sparkles className="size-3.5" />} />
                                <HeroPill label="7-day guarantee" icon={<ArrowRight className="size-3.5" />} />
                            </div>
                        </FadeIn>

                        <FadeIn delay={0.1}>
                            <div className="rounded-[32px] border border-white/80 bg-white/78 p-5 shadow-[0_28px_80px_-56px_rgba(15,23,42,0.35)] backdrop-blur sm:p-6">
                                <div className="flex items-center gap-3">
                                    {creator?.avatar_url ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={creator.avatar_url}
                                            alt={creator.display_name}
                                            className="size-14 rounded-full border border-slate-200 object-cover"
                                        />
                                    ) : (
                                        <div className="inline-flex size-14 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-sm font-semibold text-slate-700">
                                            {creator?.display_name?.slice(0, 1) || 'C'}
                                        </div>
                                    )}
                                    <div>
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">From the creator</p>
                                        <p className="mt-1 text-lg font-semibold text-slate-950">{creator?.display_name}</p>
                                        <Link href={`/c/${creator?.handle || ''}`} className="text-sm text-slate-500 transition-colors hover:text-slate-900">
                                            @{creator?.handle}
                                        </Link>
                                    </div>
                                </div>
                                {creator?.bio && (
                                    <p className="mt-4 text-sm leading-7 text-slate-600">
                                        {creator.bio}
                                    </p>
                                )}
                            </div>
                        </FadeIn>
                    </div>
                </div>
            </section>

            {/* ── Main Content Grid ──────────────────────── */}
            <main className="mx-auto grid max-w-6xl gap-6 px-4 pb-28 pt-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:pb-14 lg:pt-10">
                <div className="min-w-0 space-y-8">
                    {/* ── What's Inside Section ──────────── */}
                    {insideItems.length > 0 && (
                        <FadeIn>
                            <section className="rounded-[30px] border border-slate-200/80 bg-white p-5 shadow-[0_28px_80px_-56px_rgba(15,23,42,0.28)] sm:p-6">
                                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                    <ListChecks className="size-4" />
                                    What&apos;s inside
                                </div>
                                <FadeInStagger className="mt-4 grid gap-2 sm:grid-cols-2">
                                    {insideItems.map((item, i) => (
                                        <FadeInStaggerItem key={i}>
                                            <div className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-3">
                                                <span
                                                    className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-white"
                                                    style={{ background: primaryColor }}
                                                >
                                                    {i + 1}
                                                </span>
                                                <span className="text-sm font-medium text-slate-800">{item}</span>
                                            </div>
                                        </FadeInStaggerItem>
                                    ))}
                                </FadeInStagger>
                            </section>
                        </FadeIn>
                    )}

                    {/* ── Product Content ─────────────────── */}
                    <FadeIn delay={0.05}>
                        {generatedHtml ? (
                            <PublicGeneratedHtmlFrame
                                html={generatedHtml}
                                title={product.title}
                            />
                        ) : hasBlocks && firstPage ? (
                            <section className="overflow-hidden rounded-[30px] border border-slate-200/80 bg-white shadow-[0_28px_80px_-56px_rgba(15,23,42,0.3)]">
                                <div className="border-b border-slate-200/80 bg-white/90 px-5 py-4">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                        Product preview
                                    </p>
                                    <p className="mt-1 text-sm text-slate-600">
                                        Full preview of the product content.
                                    </p>
                                </div>
                                <div className="space-y-4 bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.10),transparent_30%),linear-gradient(180deg,rgba(248,250,252,1),rgba(255,255,255,1))] p-5 sm:p-6">
                                    {firstPage.blocks.map((block) => (
                                        <div key={block.id} className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-[0_24px_70px_-54px_rgba(15,23,42,0.24)]">
                                            <BlockRenderer block={block} theme={themeTokens} />
                                        </div>
                                    ))}
                                </div>
                            </section>
                        ) : (
                            <section className="rounded-[30px] border border-dashed border-slate-300 bg-white/80 px-6 py-16 text-center shadow-[0_24px_70px_-56px_rgba(15,23,42,0.22)]">
                                <p className="text-lg font-medium text-slate-950">This product is still being assembled.</p>
                                <p className="mt-2 text-sm leading-7 text-slate-500">
                                    The sales page content is not ready yet, but checkout and delivery are already configured.
                                </p>
                            </section>
                        )}
                    </FadeIn>

                    {/* ── FAQ Section ─────────────────────── */}
                    <FadeIn delay={0.1}>
                        <section className="rounded-[30px] border border-slate-200/80 bg-white p-5 shadow-[0_28px_80px_-56px_rgba(15,23,42,0.28)] sm:p-6">
                            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                <MessageCircleQuestion className="size-4" />
                                Frequently Asked Questions
                            </div>
                            <div className="mt-4 divide-y divide-slate-100">
                                {PRODUCT_FAQ.map((faq, index) => (
                                    <FaqItem key={index} question={faq.q} answer={faq.a} />
                                ))}
                            </div>
                        </section>
                    </FadeIn>

                    {/* ── Money-Back Guarantee ────────────── */}
                    <FadeIn delay={0.15}>
                        <section
                            className="rounded-[30px] border p-5 shadow-[0_28px_80px_-56px_rgba(15,23,42,0.28)] sm:p-6"
                            style={{
                                borderColor: withAlpha(primaryColor, 0.2),
                                background: `linear-gradient(135deg, ${withAlpha(primaryColor, 0.06)}, ${withAlpha(secondaryColor, 0.04)})`,
                            }}
                        >
                            <div className="flex items-start gap-4">
                                <span
                                    className="inline-flex size-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-lg"
                                    style={{ background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})` }}
                                >
                                    <ShieldCheck className="size-6" />
                                </span>
                                <div>
                                    <h3 className="text-lg font-semibold text-slate-950">7-Day Money-Back Guarantee</h3>
                                    <p className="mt-2 text-sm leading-7 text-slate-600">
                                        Not what you expected? Reach out within 7 days and we&apos;ll refund your purchase — no questions asked.
                                        We believe in the quality of every product our creators build.
                                    </p>
                                </div>
                            </div>
                        </section>
                    </FadeIn>
                </div>

                {/* ── Sidebar (Desktop) ───────────────────── */}
                <aside className="hidden lg:block">
                    <div className="sticky top-24 space-y-4">
                        <PurchasePanel
                            product={product}
                            creator={creator}
                            isFree={isFree}
                            ctaLabel={ctaLabel}
                            primaryColor={primaryColor}
                        />
                    </div>
                </aside>
            </main>

            {/* ── Mobile Sticky CTA ──────────────────────── */}
            <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/80 bg-white/96 px-4 py-3 shadow-[0_-18px_40px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden">
                <div className="mx-auto max-w-6xl">
                    <PurchasePanel
                        product={product}
                        creator={creator}
                        isFree={isFree}
                        ctaLabel={ctaLabel}
                        primaryColor={primaryColor}
                        compact
                    />
                </div>
            </div>

            <PublicFooter />
        </div>
    );
}

/* ──────────── Sub-components ──────────── */

function HeroPill({ label, icon }: { label: string; icon: ReactNode }) {
    return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm">
            {icon}
            {label}
        </span>
    );
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
    return (
        <details className="group py-4" id={`faq-${question.slice(0, 20).replace(/\s+/g, '-').toLowerCase()}`}>
            <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm font-semibold text-slate-900">
                {question}
                <ChevronDown className="size-4 shrink-0 text-slate-400 transition-transform duration-200 group-open:rotate-180" />
            </summary>
            <p className="mt-3 text-sm leading-7 text-slate-600">{answer}</p>
        </details>
    );
}

function PurchasePanel({
    product,
    creator,
    isFree,
    ctaLabel,
    primaryColor,
    compact = false,
}: {
    product: ProductRecord;
    creator: CreatorInfo;
    isFree: boolean;
    ctaLabel: string;
    primaryColor: string;
    compact?: boolean;
}) {
    if (compact) {
        return (
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-xl font-semibold tracking-tight text-slate-950">
                        {formatPrice(product.price_cents, product.currency)}
                    </p>
                    <p className="truncate text-xs text-slate-500">{formatProductType(product.type)}</p>
                </div>
                <CheckoutCtaButton
                    productId={product.id}
                    productSlug={product.slug}
                    isFree={isFree}
                    size="sm"
                    className="rounded-xl px-5 text-white shadow-[0_20px_36px_-24px_rgba(15,23,42,0.42)]"
                    style={{ backgroundColor: primaryColor }}
                >
                    {ctaLabel}
                </CheckoutCtaButton>
            </div>
        );
    }

    return (
        <section className="rounded-[30px] border border-slate-200/80 bg-white p-5 shadow-[0_28px_80px_-56px_rgba(15,23,42,0.28)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Purchase</p>
            <p className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">
                {formatPrice(product.price_cents, product.currency)}
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-500">
                {product.access_type === 'email_gated'
                    ? 'Email-gated delivery with fast access after submit.'
                    : 'Secure checkout powered by Stripe, then immediate library access.'}
            </p>

            <div className="mt-5">
                <CheckoutCtaButton
                    productId={product.id}
                    productSlug={product.slug}
                    isFree={isFree}
                    size="lg"
                    className="w-full rounded-2xl text-white shadow-[0_24px_40px_-26px_rgba(15,23,42,0.4)]"
                    style={{ backgroundColor: primaryColor }}
                >
                    {ctaLabel}
                </CheckoutCtaButton>
            </div>

            <div className="mt-5 space-y-3">
                <PurchaseLine
                    icon={<BadgeCheck className="size-4 text-emerald-600" />}
                    label="Instant library access after checkout"
                />
                <PurchaseLine
                    icon={<ShieldCheck className="size-4 text-sky-600" />}
                    label="Secure purchase flow with Stripe"
                />
                <PurchaseLine
                    icon={<BookOpenText className="size-4 text-amber-600" />}
                    label={`Built from ${creator.display_name}'s creator library`}
                />
                <PurchaseLine
                    icon={<ArrowRight className="size-4 text-violet-600" />}
                    label="7-day money-back guarantee"
                />
            </div>

            {/* Payment trust badges */}
            <div className="mt-5 flex items-center gap-2 rounded-2xl border border-slate-100 bg-slate-50/60 px-3 py-2.5">
                <CreditCard className="size-4 text-slate-400" />
                <span className="text-[11px] text-slate-500">Visa · Mastercard · Amex · Apple Pay</span>
            </div>

            <div className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
                <div className="flex items-center gap-2">
                    {creator.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={creator.avatar_url}
                            alt={creator.display_name}
                            className="size-10 rounded-full border border-slate-200 object-cover"
                        />
                    ) : (
                        <div className="inline-flex size-10 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-semibold text-slate-700">
                            {creator.display_name?.slice(0, 1) || 'C'}
                        </div>
                    )}
                    <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-950">{creator.display_name}</p>
                        <Link href={`/c/${creator.handle}`} className="text-xs text-slate-500 transition-colors hover:text-slate-900">
                            View creator storefront
                        </Link>
                    </div>
                </div>
            </div>

            <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
                <Layers3 className="size-3.5" />
                {formatProductType(product.type)}
                <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                    <ShieldCheck className="size-3" />
                    Guaranteed
                </span>
            </div>
        </section>
    );
}

function PurchaseLine({ icon, label }: { icon: ReactNode; label: string }) {
    return (
        <div className="flex items-center gap-2 text-sm text-slate-600">
            {icon}
            <span>{label}</span>
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
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency || 'usd',
    }).format(cents / 100);
}
