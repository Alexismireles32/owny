import type { SupabaseClient } from '@supabase/supabase-js';
import { triggerRefundEmail } from '@/lib/email/triggers';
import { log } from '@/lib/logger';
import { completeCheckoutSessionPurchase } from '@/lib/commerce/order-fulfillment';

type SupabaseStore = Pick<SupabaseClient, 'from'>;

interface ProcessStripeEventInput {
    supabase: SupabaseStore;
    eventId: string;
    eventType: string;
    payload: Record<string, unknown>;
    sendPurchaseEmail?: boolean;
}

export async function processStripeEvent(
    input: ProcessStripeEventInput
): Promise<{ duplicate: boolean }> {
    const { data: existingEvent } = await input.supabase
        .from('stripe_events')
        .select('id')
        .eq('stripe_event_id', input.eventId)
        .maybeSingle();

    if (existingEvent) {
        return { duplicate: true };
    }

    await input.supabase.from('stripe_events').insert({
        stripe_event_id: input.eventId,
        event_type: input.eventType,
        payload: input.payload,
        processing_status: 'received',
    });

    try {
        switch (input.eventType) {
            case 'checkout.session.completed':
                await handleCheckoutCompleted(input.supabase, input.payload, input.sendPurchaseEmail !== false);
                break;

            case 'charge.refunded':
                await handleRefund(input.supabase, input.payload);
                break;

            case 'account.updated':
                await handleConnectAccountUpdate(input.supabase, input.payload);
                break;

            default:
                break;
        }

        await input.supabase
            .from('stripe_events')
            .update({
                processing_status: 'processed',
                processed_at: new Date().toISOString(),
            })
            .eq('stripe_event_id', input.eventId);

        log.webhook(input.eventType, {
            stripeEventId: input.eventId,
            status: 'processed',
        });

        return { duplicate: false };
    } catch (err) {
        await input.supabase
            .from('stripe_events')
            .update({
                processing_status: 'failed',
                error_message: err instanceof Error ? err.message : 'Unknown error',
            })
            .eq('stripe_event_id', input.eventId);

        throw err;
    }
}

async function handleCheckoutCompleted(
    supabase: SupabaseStore,
    session: Record<string, unknown>,
    sendPurchaseEmail: boolean
) {
    const metadata = session.metadata as Record<string, string> | undefined;
    const productId = metadata?.product_id;
    const orderId = metadata?.order_id;
    const buyerProfileId = metadata?.buyer_profile_id;
    const sessionId = session.id as string;
    const paymentIntentId = (session.payment_intent as string | undefined) || `pi_${sessionId}`;

    if (!productId) {
        log.error('checkout.session.completed missing product_id', { sessionId });
        return;
    }

    await completeCheckoutSessionPurchase({
        supabase,
        productId,
        orderId,
        buyerProfileId,
        sessionId,
        paymentIntentId,
        amountCents: (session.amount_total as number) || 0,
        currency: (session.currency as string) || 'usd',
        sendPurchaseEmail,
        customerEmail:
            ((session.customer_details as Record<string, unknown> | undefined)?.email as string | undefined)
            || (session.customer_email as string | undefined)
            || null,
    });
}

async function handleRefund(
    supabase: SupabaseStore,
    charge: Record<string, unknown>
) {
    const paymentIntentId = charge.payment_intent as string;

    if (!paymentIntentId) return;

    const { data: order } = await supabase
        .from('orders')
        .select('id, buyer_profile_id, product_id')
        .eq('stripe_payment_intent_id', paymentIntentId)
        .maybeSingle();

    if (!order) {
        log.error('Refund: order not found for payment intent', { paymentIntentId });
        return;
    }

    await supabase
        .from('orders')
        .update({
            status: 'refunded',
            refunded_at: new Date().toISOString(),
        })
        .eq('id', order.id);

    await supabase
        .from('entitlements')
        .update({ status: 'revoked' })
        .eq('buyer_profile_id', order.buyer_profile_id)
        .eq('product_id', order.product_id);

    try {
        const { data: buyerProfile } = await supabase
            .from('profiles')
            .select('email')
            .eq('id', order.buyer_profile_id)
            .maybeSingle();
        const { data: productData } = await supabase
            .from('products')
            .select('title')
            .eq('id', order.product_id)
            .maybeSingle();
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
        log.error('Failed to send refund email', {
            error: emailErr instanceof Error ? emailErr.message : 'Unknown',
        });
    }
}

async function handleConnectAccountUpdate(
    supabase: SupabaseStore,
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
