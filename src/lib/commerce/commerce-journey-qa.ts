import type { ProductType } from '@/types/build-packet';

type CommerceCheckKey =
    | 'listingReady'
    | 'deliveryReady'
    | 'pricingReady'
    | 'checkoutReady'
    | 'libraryReady'
    | 'experienceReady';

interface CommerceJourneyCheck {
    passed: boolean;
    note: string;
}

export interface CommerceJourneyQaReport {
    passed: boolean;
    score: number;
    issues: string[];
    checks: Record<CommerceCheckKey, CommerceJourneyCheck>;
}

interface CommerceJourneyQaInput {
    title: string | null;
    slug: string | null;
    accessType: string | null;
    priceCents: number | null;
    currency: string | null;
    productType: ProductType;
    creatorHandle: string | null;
    stripeConnectStatus: string | null;
    stripeConnectAccountId: string | null;
    hasGeneratedHtml: boolean;
    qualityPassed?: boolean | null;
    browserQaPassed?: boolean | null;
}

function hasPositivePrice(value: number | null | undefined): boolean {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function evaluateCommerceJourneyQa(input: CommerceJourneyQaInput): CommerceJourneyQaReport {
    const accessType = input.accessType || 'paid';
    const titleReady = Boolean(input.title && input.title.trim().length >= 4);
    const slugReady = Boolean(input.slug && input.slug.trim().length >= 3);
    const hasSupportedProductType = [
        'pdf_guide',
        'mini_course',
        'challenge_7day',
        'checklist_toolkit',
    ].includes(input.productType);
    const experienceReady = input.qualityPassed !== false && input.browserQaPassed !== false;

    const pricingReady = (() => {
        if (accessType === 'paid') {
            return hasPositivePrice(input.priceCents) && Boolean(input.currency && input.currency.trim().length >= 3);
        }
        if (accessType === 'public' || accessType === 'email_gated') {
            return !hasPositivePrice(input.priceCents);
        }
        return false;
    })();

    const checkoutReady = (() => {
        if (accessType === 'paid') {
            return Boolean(
                input.creatorHandle
                && input.stripeConnectAccountId
                && input.stripeConnectStatus === 'connected'
            );
        }
        if (accessType === 'public' || accessType === 'email_gated') {
            return true;
        }
        return false;
    })();

    const checks: Record<CommerceCheckKey, CommerceJourneyCheck> = {
        listingReady: {
            passed: titleReady && slugReady,
            note: titleReady && slugReady
                ? 'Title and slug are present for checkout, success, and library routes.'
                : 'Product title or slug is missing, so the storefront and library handoff is incomplete.',
        },
        deliveryReady: {
            passed: input.hasGeneratedHtml,
            note: input.hasGeneratedHtml
                ? 'A generated HTML deliverable exists for post-purchase access.'
                : 'No generated HTML deliverable is attached to the active version.',
        },
        pricingReady: {
            passed: pricingReady,
            note: pricingReady
                ? 'Pricing is coherent for the selected access model.'
                : accessType === 'paid'
                    ? 'Paid checkout requires a positive price and currency.'
                    : accessType === 'subscription'
                        ? 'Subscription pricing is not supported by the current checkout flow.'
                        : 'Free or email-gated products should not carry a paid price.',
        },
        checkoutReady: {
            passed: checkoutReady,
            note: checkoutReady
                ? accessType === 'paid'
                    ? 'Creator Stripe Connect is ready for paid checkout.'
                    : 'This access model can complete without Stripe Connect.'
                : accessType === 'paid'
                    ? 'Paid checkout is blocked because Stripe Connect is not fully connected.'
                    : 'This access model is not fully supported by the current checkout flow.',
        },
        libraryReady: {
            passed: slugReady && hasSupportedProductType,
            note: slugReady && hasSupportedProductType
                ? 'The purchase can resolve into a supported library destination.'
                : 'The library destination is incomplete or uses an unsupported product type.',
        },
        experienceReady: {
            passed: experienceReady,
            note: experienceReady
                ? 'Quality and browser QA are aligned with a publishable commerce experience.'
                : 'The product still fails quality or browser QA, so post-purchase delivery is not reliable.',
        },
    };

    const issues = Object.values(checks)
        .filter((check) => !check.passed)
        .map((check) => check.note);

    const score = Math.max(
        0,
        100
        - (checks.listingReady.passed ? 0 : 12)
        - (checks.deliveryReady.passed ? 0 : 24)
        - (checks.pricingReady.passed ? 0 : 18)
        - (checks.checkoutReady.passed ? 0 : 24)
        - (checks.libraryReady.passed ? 0 : 10)
        - (checks.experienceReady.passed ? 0 : 12)
    );

    return {
        passed: issues.length === 0,
        score,
        issues,
        checks,
    };
}
