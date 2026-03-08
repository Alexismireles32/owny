import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { processStripeEvent } from '@/lib/commerce/stripe-events';
import { isFakeStripeModeEnabled } from '@/lib/stripe-mode';

export async function POST(request: Request) {
    if (!isFakeStripeModeEnabled()) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null) as { sessionId?: string } | null;
    const sessionId = body?.sessionId?.trim();

    if (!sessionId) {
        return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }

    const adminSupabase = createAdminClient();
    const { data: order, error: orderError } = await adminSupabase
        .from('orders')
        .select('id, buyer_profile_id, product_id, amount_cents, currency')
        .eq('stripe_checkout_session_id', sessionId)
        .maybeSingle();

    if (orderError) {
        console.error('[/api/stripe/dev/complete] order lookup failed', {
            sessionId,
            error: orderError.message,
        });
        return NextResponse.json({ error: 'Unable to load checkout session' }, { status: 500 });
    }

    if (!order) {
        return NextResponse.json({ error: 'Checkout session not found' }, { status: 404 });
    }

    if (order.buyer_profile_id !== user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    try {
        const result = await processStripeEvent({
            supabase: adminSupabase,
            eventId: `dev_checkout.session.completed:${sessionId}`,
            eventType: 'checkout.session.completed',
            sendPurchaseEmail: false,
            payload: {
                id: sessionId,
                payment_intent: `dev_pi_${sessionId.replace(/[^a-zA-Z0-9_]/g, '')}`,
                amount_total: order.amount_cents,
                currency: order.currency || 'usd',
                metadata: {
                    product_id: order.product_id,
                    order_id: order.id,
                    buyer_profile_id: order.buyer_profile_id,
                },
                customer_email: user.email || null,
            },
        });

        return NextResponse.json({
            received: true,
            duplicate: result.duplicate,
        });
    } catch (err) {
        console.error('[/api/stripe/dev/complete] simulated completion failed', {
            sessionId,
            error: err instanceof Error ? err.message : 'Unknown',
        });
        return NextResponse.json({ error: 'Unable to complete simulated checkout' }, { status: 500 });
    }
}
