import { describe, expect, it } from 'vitest';
import {
    buildMarketAwareProductDescription,
    buildMarketOfferContext,
    buildMarketSearchQuery,
    chooseInitialProductPrice,
    type MarketOfferBrief,
} from '@/lib/ai/market-offer-intel';
import type { CreatorDNA } from '@/lib/ai/creator-dna';

const creatorDna: CreatorDNA = {
    handle: 'creator',
    displayName: 'Creator Name',
    bio: 'Creator helping other creators package and sell their expertise.',
    voice: {
        tone: 'clear and direct',
        vocabulary: 'practical',
        speakingStyle: 'structured',
        catchphrases: ['let’s go'],
        personality: 'coach',
        contentFocus: 'monetization',
    },
    visual: {
        primaryColor: '#111827',
        secondaryColor: '#4f46e5',
        backgroundColor: '#ffffff',
        textColor: '#111827',
        fontFamily: 'inter',
        mood: 'clean',
    },
    audienceHypothesis: [
        'Creator audience focused on growth, workflow, and monetization.',
    ],
    immutableRules: ['Stay grounded in creator evidence.'],
};

const marketOfferBrief: MarketOfferBrief = {
    searchQuery: 'research creator digital products',
    marketCategory: 'Creator monetization playbooks',
    buyerUrgency: 'high',
    monetizationConfidence: 0.82,
    recommendedPriceCents: 5800,
    priceRationale: 'Comparable products cluster in the mid-ticket range.',
    offerAngle: 'Turn your best videos into a premium guide buyers can act on fast.',
    promiseStyle: 'Position it as a focused shortcut, not a generic content dump.',
    differentiationHooks: ['Built from the creator’s actual transcript library'],
    objectionHandling: ['Show why this is faster than piecing together scattered content'],
    packagingNotes: ['Lead with transformation and implementation speed'],
    ctaIdeas: ['Start building your offer'],
    seoKeywords: ['creator monetization', 'digital products for creators'],
    citations: [
        {
            title: 'Creator economy pricing benchmark',
            url: 'https://example.com/pricing-benchmark',
            whyItMatters: 'Supports the pricing band.',
        },
    ],
};

describe('market offer intelligence helpers', () => {
    it('builds a market search query grounded in the creator audience', () => {
        const query = buildMarketSearchQuery({
            topicQuery: 'creator monetization systems',
            productType: 'mini_course',
            creatorDna,
        });

        expect(query).toContain('creator monetization systems');
        expect(query.toLowerCase()).toContain('mini course');
        expect(query.toLowerCase()).toContain('pricing');
        expect(query.toLowerCase()).toContain('audience context');
    });

    it('uses market pricing when available and rounds to sensible bands', () => {
        expect(chooseInitialProductPrice('mini_course', marketOfferBrief)).toBe(5800);
        expect(chooseInitialProductPrice('pdf_guide', {
            ...marketOfferBrief,
            recommendedPriceCents: 5833,
        })).toBe(5800);
    });

    it('falls back to product defaults when no market brief exists', () => {
        expect(chooseInitialProductPrice('pdf_guide', null)).toBe(2900);
        expect(chooseInitialProductPrice('challenge_7day', null)).toBe(4900);
    });

    it('formats a market offer context block for downstream prompts', () => {
        const context = buildMarketOfferContext(marketOfferBrief);

        expect(context).toContain('MARKET OFFER INTELLIGENCE');
        expect(context).toContain('Buyer urgency: high');
        expect(context).toContain('Recommended price: $58.00');
        expect(context).toContain('Research anchors: Creator economy pricing benchmark');
        expect(context).toContain('Use this only for packaging');
    });

    it('builds a stronger market-aware description when positioning exists', () => {
        const description = buildMarketAwareProductDescription({
            topicQuery: 'creator monetization systems',
            productType: 'mini_course',
            marketOfferBrief,
        });

        expect(description).toContain('Turn your best videos into a premium guide');
        expect(description).toContain('focused shortcut');
    });
});
