// src/lib/stripe.ts — Stripe server-side client singleton

import Stripe from 'stripe';
import { hasUsableStripeSecretKey } from '@/lib/stripe-mode';

let stripeInstance: Stripe | null = null;

export function getStripe(): Stripe {
    if (stripeInstance) return stripeInstance;

    const key = process.env.STRIPE_SECRET_KEY;
    if (!key || !hasUsableStripeSecretKey()) {
        throw new Error('STRIPE_SECRET_KEY is not configured with a real value');
    }

    stripeInstance = new Stripe(key, {
        typescript: true,
    });

    return stripeInstance;
}

/**
 * Platform application fee percentage (e.g., 10%)
 */
export const APP_FEE_PERCENT = 10;

/**
 * Calculate application fee in cents
 */
export function calculateAppFee(amountCents: number): number {
    return Math.round(amountCents * (APP_FEE_PERCENT / 100));
}
