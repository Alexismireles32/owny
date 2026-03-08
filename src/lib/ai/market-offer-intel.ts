import { z } from 'zod';
import type { ProductType } from '@/types/build-packet';
import type { CreatorDNA } from '@/lib/ai/creator-dna';
import { requestKimiStructuredObjectWithWebSearch } from '@/lib/ai/kimi-structured';

const DEFAULT_PRICE_BY_TYPE: Record<ProductType, number> = {
    pdf_guide: 2900,
    checklist_toolkit: 3900,
    challenge_7day: 4900,
    mini_course: 7900,
};

const MarketOfferBriefSchema = z.object({
    marketCategory: z.string().default(''),
    buyerUrgency: z.enum(['low', 'medium', 'high']).default('medium'),
    monetizationConfidence: z.number().min(0).max(1).default(0.5),
    recommendedPriceCents: z.number().int().min(0).max(250000).default(0),
    priceRationale: z.string().default(''),
    offerAngle: z.string().default(''),
    promiseStyle: z.string().default(''),
    differentiationHooks: z.array(z.string()).default([]),
    objectionHandling: z.array(z.string()).default([]),
    packagingNotes: z.array(z.string()).default([]),
    ctaIdeas: z.array(z.string()).default([]),
    seoKeywords: z.array(z.string()).default([]),
    citations: z.array(z.object({
        title: z.string().default(''),
        url: z.string().default(''),
        whyItMatters: z.string().default(''),
    })).default([]),
});

export interface MarketOfferBrief extends z.infer<typeof MarketOfferBriefSchema> {
    searchQuery: string;
}

function productTypeLabel(productType: ProductType): string {
    switch (productType) {
        case 'pdf_guide':
            return 'PDF guide';
        case 'mini_course':
            return 'mini course';
        case 'challenge_7day':
            return '7-day challenge';
        case 'checklist_toolkit':
            return 'checklist toolkit';
        default:
            return 'digital product';
    }
}

function compactAudience(dna: CreatorDNA): string {
    return dna.audienceHypothesis.slice(0, 2).join(' ');
}

function clampRecommendedPriceCents(value: number | null | undefined, productType: ProductType): number {
    const fallback = DEFAULT_PRICE_BY_TYPE[productType];
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        return fallback;
    }

    const bounded = Math.max(900, Math.min(19900, value));
    return Math.round(bounded / 100) * 100;
}

export function buildMarketSearchQuery(input: {
    topicQuery: string;
    productType: ProductType;
    creatorDna: CreatorDNA;
}): string {
    const label = productTypeLabel(input.productType);
    const audience = compactAudience(input.creatorDna);

    return [
        `Research 2026 market signals for a ${label} about "${input.topicQuery}".`,
        `Focus on pricing, positioning, buyer objections, packaging, and CTA patterns.`,
        `Audience context: ${audience}`,
        `Return insights useful for selling a creator-led digital product.`,
    ].join(' ');
}

export function chooseInitialProductPrice(
    productType: ProductType,
    marketOfferBrief: MarketOfferBrief | null | undefined
): number {
    return clampRecommendedPriceCents(marketOfferBrief?.recommendedPriceCents, productType);
}

export function buildMarketOfferContext(marketOfferBrief: MarketOfferBrief | null | undefined): string | null {
    if (!marketOfferBrief) return null;

    const lines = [
        'MARKET OFFER INTELLIGENCE',
        `- Market category: ${marketOfferBrief.marketCategory || 'Creator digital products'}`,
        `- Buyer urgency: ${marketOfferBrief.buyerUrgency}`,
        `- Monetization confidence: ${Math.round(marketOfferBrief.monetizationConfidence * 100)}%`,
        `- Recommended price: $${(marketOfferBrief.recommendedPriceCents / 100).toFixed(2)}`,
        `- Offer angle: ${marketOfferBrief.offerAngle || 'Lead with the strongest practical transformation.'}`,
        `- Promise style: ${marketOfferBrief.promiseStyle || 'Specific and grounded.'}`,
    ];

    if (marketOfferBrief.differentiationHooks.length > 0) {
        lines.push(`- Differentiation hooks: ${marketOfferBrief.differentiationHooks.slice(0, 4).join('; ')}`);
    }
    if (marketOfferBrief.objectionHandling.length > 0) {
        lines.push(`- Buyer objections to answer: ${marketOfferBrief.objectionHandling.slice(0, 4).join('; ')}`);
    }
    if (marketOfferBrief.packagingNotes.length > 0) {
        lines.push(`- Packaging notes: ${marketOfferBrief.packagingNotes.slice(0, 4).join('; ')}`);
    }
    if (marketOfferBrief.ctaIdeas.length > 0) {
        lines.push(`- CTA ideas: ${marketOfferBrief.ctaIdeas.slice(0, 3).join('; ')}`);
    }
    if (marketOfferBrief.seoKeywords.length > 0) {
        lines.push(`- Search terms: ${marketOfferBrief.seoKeywords.slice(0, 6).join(', ')}`);
    }
    if (marketOfferBrief.citations.length > 0) {
        lines.push(`- Research anchors: ${marketOfferBrief.citations.slice(0, 3).map((citation) => {
            const title = citation.title || 'Untitled source';
            return citation.url ? `${title} (${citation.url})` : title;
        }).join('; ')}`);
    }

    lines.push('Use this only for packaging, pricing, and positioning. Do not use it as product-content evidence.');
    return lines.join('\n');
}

export function buildMarketAwareProductDescription(input: {
    topicQuery: string;
    productType: ProductType;
    marketOfferBrief: MarketOfferBrief | null | undefined;
}): string {
    const label = productTypeLabel(input.productType).toLowerCase();
    const angle = input.marketOfferBrief?.offerAngle?.trim();
    const promise = input.marketOfferBrief?.promiseStyle?.trim();

    if (angle && promise) {
        return `${angle} ${promise}`.slice(0, 220);
    }
    if (angle) {
        return angle.slice(0, 220);
    }

    return `Creator-built ${label} on ${input.topicQuery}`.slice(0, 220);
}

export async function generateMarketOfferBrief(input: {
    topicQuery: string;
    productType: ProductType;
    creatorDna: CreatorDNA;
}): Promise<MarketOfferBrief | null> {
    if (!process.env.KIMI_API_KEY) return null;

    const searchQuery = buildMarketSearchQuery(input);
    const parsed = await requestKimiStructuredObjectWithWebSearch({
        systemPrompt: `You are Owny's market offer strategist.
Use current web search results to improve positioning for creator-led digital products.

Rules:
- Use web research for pricing, market framing, objections, SEO, CTA language, and packaging.
- Do not invent creator-specific expertise or product lessons from the web.
- Keep the product grounded in creator evidence; the web only informs how to package and sell it.
- Return only a JSON object.`,
        userPrompt: `Creator: ${input.creatorDna.displayName} (@${input.creatorDna.handle})
Topic: ${input.topicQuery}
Product type: ${productTypeLabel(input.productType)}
Audience signals: ${compactAudience(input.creatorDna)}

Search for current market signals and return a concise strategy object with:
- marketCategory
- buyerUrgency
- monetizationConfidence
- recommendedPriceCents
- priceRationale
- offerAngle
- promiseStyle
- differentiationHooks[]
- objectionHandling[]
- packagingNotes[]
- ctaIdeas[]
- seoKeywords[]
- citations[] as { title, url, whyItMatters }

Search query to use when useful: ${searchQuery}`,
        schema: MarketOfferBriefSchema,
        maxTokens: 3200,
        maxRounds: 4,
        operation: 'market.offer.web_research',
    });

    return {
        ...parsed,
        searchQuery,
        recommendedPriceCents: clampRecommendedPriceCents(parsed.recommendedPriceCents, input.productType),
    };
}
