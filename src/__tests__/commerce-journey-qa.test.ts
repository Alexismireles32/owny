import { describe, expect, it } from 'vitest';
import { evaluateCommerceJourneyQa } from '@/lib/commerce/commerce-journey-qa';

describe('commerce journey QA', () => {
    it('passes a paid product with connected Stripe and delivery HTML', () => {
        const report = evaluateCommerceJourneyQa({
            title: 'Creator Systems Playbook',
            slug: 'creator-systems-playbook',
            accessType: 'paid',
            priceCents: 7900,
            currency: 'usd',
            productType: 'mini_course',
            creatorHandle: 'creator',
            stripeConnectStatus: 'connected',
            stripeConnectAccountId: 'acct_123',
            hasGeneratedHtml: true,
            qualityPassed: true,
            browserQaPassed: true,
        });

        expect(report.passed).toBe(true);
        expect(report.score).toBe(100);
    });

    it('fails a paid product without Stripe Connect readiness', () => {
        const report = evaluateCommerceJourneyQa({
            title: 'Creator Systems Playbook',
            slug: 'creator-systems-playbook',
            accessType: 'paid',
            priceCents: 7900,
            currency: 'usd',
            productType: 'mini_course',
            creatorHandle: 'creator',
            stripeConnectStatus: 'pending',
            stripeConnectAccountId: null,
            hasGeneratedHtml: true,
            qualityPassed: true,
            browserQaPassed: true,
        });

        expect(report.passed).toBe(false);
        expect(report.issues.some((issue) => issue.includes('Stripe Connect'))).toBe(true);
    });

    it('fails unsupported subscription access flows', () => {
        const report = evaluateCommerceJourneyQa({
            title: 'Creator Systems Playbook',
            slug: 'creator-systems-playbook',
            accessType: 'subscription',
            priceCents: 2900,
            currency: 'usd',
            productType: 'mini_course',
            creatorHandle: 'creator',
            stripeConnectStatus: 'connected',
            stripeConnectAccountId: 'acct_123',
            hasGeneratedHtml: true,
            qualityPassed: true,
            browserQaPassed: true,
        });

        expect(report.passed).toBe(false);
        expect(report.issues.some((issue) => issue.includes('not supported'))).toBe(true);
    });

    it('fails when a free product still carries a paid price', () => {
        const report = evaluateCommerceJourneyQa({
            title: 'Creator Systems Playbook',
            slug: 'creator-systems-playbook',
            accessType: 'public',
            priceCents: 1900,
            currency: 'usd',
            productType: 'pdf_guide',
            creatorHandle: 'creator',
            stripeConnectStatus: null,
            stripeConnectAccountId: null,
            hasGeneratedHtml: true,
            qualityPassed: true,
            browserQaPassed: true,
        });

        expect(report.passed).toBe(false);
        expect(report.issues.some((issue) => issue.includes('should not carry a paid price'))).toBe(true);
    });
});
