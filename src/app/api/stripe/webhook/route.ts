// POST /api/stripe/webhook — Handle Stripe webhook events with idempotency
// PRD §8.6: stripe_events table for dedup, handleCheckoutCompleted, handleRefund

import { getStripe } from '@/lib/stripe';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { log } from '@/lib/logger';
import { triggerPurchaseEmail, triggerRefundEmail } from '@/lib/email/triggers';

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

    // Idempotency: check if we already processed this event
    const { data: existingEvent } = await supabase
        .from('stripe_events')
        .select('id')
        .eq('stripe_event_id', event.id)
        .single();

    if (existingEvent) {
        return NextResponse.json({ received: true, duplicate: true });
    }

    // Record the event
    await supabase.from('stripe_events').insert({
        stripe_event_id: event.id,
        event_type: event.type,
        payload: event.data as unknown as Record<string, unknown>,
        processing_status: 'received',
    });

    try {
        switch (event.type) {
            case 'checkout.session.completed':
                await handleCheckoutCompleted(supabase, event.data.object as unknown as Record<string, unknown>);
                break;

            case 'charge.refunded':
                await handleRefund(supabase, event.data.object as unknown as Record<string, unknown>);
                break;

            case 'account.updated':
                await handleConnectAccountUpdate(supabase, event.data.object as unknown as Record<string, unknown>);
                break;

            default:
                // Unhandled event type — still mark as processed
                break;
        }

        await supabase
            .from('stripe_events')
            .update({
                processing_status: 'processed',
                processed_at: new Date().toISOString(),
            })
            .eq('stripe_event_id', event.id);
        log.webhook(event.type, { stripeEventId: event.id, status: 'processed' });
    } catch (err) {
        log.error('Webhook handler error', { stripeEventId: event.id, eventType: event.type, error: err instanceof Error ? err.message : 'Unknown' });
        await supabase
            .from('stripe_events')
            .update({
                processing_status: 'failed',
                error_message: err instanceof Error ? err.message : 'Unknown error',
            })
            .eq('stripe_event_id', event.id);

        // Return non-2xx so Stripe retries this event.
        return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
    }

    return NextResponse.json({ received: true });
}

/**
 * handleCheckoutCompleted:
 * - Update order status to 'paid'
 * - Create entitlement for buyer
 * - Create buyer profile if first purchase (guest)
 */
async function handleCheckoutCompleted(
    supabase: ReturnType<typeof getServiceSupabase>,
    session: Record<string, unknown>
) {
    const metadata = session.metadata as Record<string, string> | undefined;
    const productId = metadata?.product_id;
    const orderId = metadata?.order_id;
    const buyerProfileId = metadata?.buyer_profile_id;
    const sessionId = session.id as string;
    const paymentIntentId = session.payment_intent as string;

    if (!productId) {
        log.error('checkout.session.completed missing product_id', { sessionId });
        return;
    }

    // Update order
    if (orderId) {
        await supabase
            .from('orders')
            .update({
                status: 'paid',
                stripe_payment_intent_id: paymentIntentId,
            })
            .eq('id', orderId);
    } else {
        // Create order if missing (e.g., guest checkout)
        const customerEmail = session.customer_email as string;
        await supabase.from('orders').insert({
            buyer_profile_id: buyerProfileId || null,
            product_id: productId,
            status: 'paid',
            amount_cents: (session.amount_total as number) || 0,
            currency: (session.currency as string) || 'usd',
            stripe_checkout_session_id: sessionId,
            stripe_payment_intent_id: paymentIntentId,
        });

        // Log for buyer account creation
        if (!buyerProfileId && customerEmail) {
            log.info('Guest purchase — buyer account creation pending', { email: customerEmail });
        }
    }

    // Create entitlement
    if (buyerProfileId) {
        await supabase.from('entitlements').upsert({
            buyer_profile_id: buyerProfileId,
            product_id: productId,
            status: 'active',
            granted_via: 'purchase',
        }, { onConflict: 'buyer_profile_id,product_id' });
    }

    // Send purchase confirmation email
    try {
        const customerEmail = (session.customer_details as Record<string, unknown>)?.email as string
            || session.customer_email as string;
        if (customerEmail && productId) {
            const { data: productData } = await supabase
                .from('products')
                .select('title, creators(display_name)')
                .eq('id', productId)
                .single();
            const creator = productData?.creators as unknown as { display_name: string } | null;
            await triggerPurchaseEmail({
                buyerEmail: customerEmail,
                buyerName: customerEmail.split('@')[0],
                productTitle: productData?.title || 'Your purchase',
                creatorName: creator?.display_name || 'Creator',
            });
        }
    } catch (emailErr) {
        log.error('Failed to send purchase email', { error: emailErr instanceof Error ? emailErr.message : 'Unknown' });
    }
}

/**
 * handleRefund: revoke entitlement and update order status
 */
async function handleRefund(
    supabase: ReturnType<typeof getServiceSupabase>,
    charge: Record<string, unknown>
) {
    const paymentIntentId = charge.payment_intent as string;

    if (!paymentIntentId) return;

    // Find the order
    const { data: order } = await supabase
        .from('orders')
        .select('id, buyer_profile_id, product_id')
        .eq('stripe_payment_intent_id', paymentIntentId)
        .single();

    if (!order) {
        log.error('Refund: order not found for payment intent', { paymentIntentId });
        return;
    }

    // Update order to refunded
    await supabase
        .from('orders')
        .update({
            status: 'refunded',
            refunded_at: new Date().toISOString(),
        })
        .eq('id', order.id);

    // Revoke entitlement
    await supabase
        .from('entitlements')
        .update({ status: 'revoked' })
        .eq('buyer_profile_id', order.buyer_profile_id)
        .eq('product_id', order.product_id);

    // Send refund notification email
    try {
        const { data: buyerProfile } = await supabase
            .from('profiles')
            .select('email')
            .eq('id', order.buyer_profile_id)
            .single();
        const { data: productData } = await supabase
            .from('products')
            .select('title')
            .eq('id', order.product_id)
            .single();
        if (buyerProfile?.email) {
            const amountCents = (charge.amount_refunded as number) || (charge.amount as number) || 0;
            await triggerRefundEmail({
                buyerEmail: buyerProfile.email,
                buyerName: buyerProfile.email.split('@')[0],
                productTitle: productData?.title || 'Product',
                amountFormatted: `$${(amountCents / 100).toFixed(2)}`,
            });
        }
    } catch (emailErr) {
        log.error('Failed to send refund email', { error: emailErr instanceof Error ? emailErr.message : 'Unknown' });
    }
}

/**
 * handleConnectAccountUpdate: update creator's Stripe Connect status
 */
async function handleConnectAccountUpdate(
    supabase: ReturnType<typeof getServiceSupabase>,
    account: Record<string, unknown>
) {
    const accountId = account.id as string;
    const chargesEnabled = account.charges_enabled as boolean;
    const detailsSubmitted = account.details_submitted as boolean;

    if (!accountId) return;

    let status: string;
    if (chargesEnabled && detailsSubmitted) {
        status = 'connected';
    } else if (detailsSubmitted) {
        status = 'pending';
    } else {
        status = 'unconnected';
    }

    await supabase
        .from('creators')
        .update({ stripe_connect_status: status })
        .eq('stripe_connect_account_id', accountId);

    log.webhook('account.updated', {
        stripeEventId: accountId,
        status,
        chargesEnabled: String(chargesEnabled),
        detailsSubmitted: String(detailsSubmitted),
    });
}
