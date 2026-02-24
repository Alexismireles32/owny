// src/lib/stripe.ts — Stripe server-side client singleton

import Stripe from 'stripe';

let stripeInstance: Stripe | null = null;

export function getStripe(): Stripe {
    if (stripeInstance) return stripeInstance;

    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY is not set');

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
