import type { SupabaseClient } from '@supabase/supabase-js';
import { triggerPurchaseEmail } from '@/lib/email/triggers';
import { log } from '@/lib/logger';

export interface CompleteCheckoutSessionPurchaseInput {
    supabase: Pick<SupabaseClient, 'from'>;
    productId: string;
    sessionId: string;
    paymentIntentId: string;
    amountCents: number;
    currency: string;
    orderId?: string | null;
    buyerProfileId?: string | null;
    customerEmail?: string | null;
    sendPurchaseEmail?: boolean;
}

export async function completeCheckoutSessionPurchase(
    input: CompleteCheckoutSessionPurchaseInput
): Promise<{ buyerProfileId: string | null }> {
    let resolvedBuyerProfileId = input.buyerProfileId || null;

    if (input.orderId) {
        const { data: updatedOrder } = await input.supabase
            .from('orders')
            .update({
                status: 'paid',
                stripe_payment_intent_id: input.paymentIntentId,
                stripe_checkout_session_id: input.sessionId,
            })
            .eq('id', input.orderId)
            .select('buyer_profile_id')
            .single();

        resolvedBuyerProfileId = (updatedOrder?.buyer_profile_id as string | null) || resolvedBuyerProfileId;
    } else if (resolvedBuyerProfileId) {
        await input.supabase.from('orders').insert({
            buyer_profile_id: resolvedBuyerProfileId,
            product_id: input.productId,
            status: 'paid',
            amount_cents: input.amountCents,
            currency: input.currency || 'usd',
            stripe_checkout_session_id: input.sessionId,
            stripe_payment_intent_id: input.paymentIntentId,
        });
    } else {
        log.error('Checkout completion missing order and buyer profile context', {
            productId: input.productId,
            sessionId: input.sessionId,
        });
    }

    if (resolvedBuyerProfileId) {
        await input.supabase.from('entitlements').upsert({
            buyer_profile_id: resolvedBuyerProfileId,
            product_id: input.productId,
            status: 'active',
            granted_via: 'purchase',
        }, { onConflict: 'buyer_profile_id,product_id' });
    } else {
        log.error('Unable to grant entitlement after checkout completion', {
            productId: input.productId,
            sessionId: input.sessionId,
        });
    }

    if (input.sendPurchaseEmail !== false && input.customerEmail && input.productId) {
        try {
            const { data: productData } = await input.supabase
                .from('products')
                .select('title, creators!products_creator_id_fkey(display_name)')
                .eq('id', input.productId)
                .single();

            const creator = productData?.creators as { display_name?: string } | null | undefined;
            await triggerPurchaseEmail({
                buyerEmail: input.customerEmail,
                buyerName: input.customerEmail.split('@')[0],
                productTitle: (productData?.title as string | undefined) || 'Your purchase',
                creatorName: creator?.display_name || 'Creator',
            });
        } catch (emailErr) {
            log.error('Failed to send purchase email', {
                error: emailErr instanceof Error ? emailErr.message : 'Unknown',
                productId: input.productId,
            });
        }
    }

    return { buyerProfileId: resolvedBuyerProfileId };
}
