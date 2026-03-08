// POST /api/stripe/webhook — Handle Stripe webhook events with idempotency
// PRD §8.6: stripe_events table for dedup, handleCheckoutCompleted, handleRefund

import { getStripe } from '@/lib/stripe';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { log } from '@/lib/logger';
import { processStripeEvent } from '@/lib/commerce/stripe-events';

// Use service role for webhook handler (no user auth context)
function getServiceSupabase() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    return createServiceClient(url, key);
}

export async function POST(request: Request) {
    const stripe = getStripe();
    const body = await request.text();
    const sig = request.headers.get('stripe-signature');

    if (!sig) {
        return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
    }

    let event;
    try {
        event = stripe.webhooks.constructEvent(
            body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET!
        );
    } catch (err) {
        log.error('Webhook sig verification failed', { error: err instanceof Error ? err.message : 'Unknown' });
        return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    const supabase = getServiceSupabase();

    try {
        const result = await processStripeEvent({
            supabase,
            eventId: event.id,
            eventType: event.type,
            payload: event.data.object as unknown as Record<string, unknown>,
        });

        if (result.duplicate) {
            return NextResponse.json({ received: true, duplicate: true });
        }
    } catch (err) {
        log.error('Webhook handler error', { stripeEventId: event.id, eventType: event.type, error: err instanceof Error ? err.message : 'Unknown' });
        return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
    }

    return NextResponse.json({ received: true });
}
