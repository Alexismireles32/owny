// POST /api/admin/refund — Trigger Stripe refund + revoke entitlement
// PRD §8.8

import { createClient } from '@/lib/supabase/server';
import { getStripe } from '@/lib/stripe';
import { NextResponse } from 'next/server';
import { log } from '@/lib/logger';

async function verifyAdmin() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { user: null, supabase };

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    if (profile?.role !== 'admin') return { user: null, supabase };
    return { user, supabase };
}

export async function POST(request: Request) {
    const { user, supabase } = await verifyAdmin();
    if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await request.json();
    const { orderId } = body as { orderId: string };

    if (!orderId) {
        return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
    }

    // Fetch order
    const { data: order } = await supabase
        .from('orders')
        .select('id, buyer_profile_id, product_id, status, stripe_payment_intent_id, amount_cents')
        .eq('id', orderId)
        .single();

    if (!order) {
        return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (order.status === 'refunded') {
        return NextResponse.json({ error: 'Order already refunded' }, { status: 400 });
    }

    if (!order.stripe_payment_intent_id) {
        return NextResponse.json({ error: 'No payment intent found for this order' }, { status: 400 });
    }

    try {
        // Trigger Stripe refund
        const stripe = getStripe();
        await stripe.refunds.create({
            payment_intent: order.stripe_payment_intent_id,
        });

        // Update order status
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

        log.info('Admin refund processed', {
            orderId,
            productId: order.product_id,
            amountCents: order.amount_cents,
            adminId: user.id,
        });

        return NextResponse.json({ success: true });
    } catch (err) {
        log.error('Admin refund failed', {
            orderId,
            error: err instanceof Error ? err.message : 'Unknown error',
        });
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Refund failed' },
            { status: 500 }
        );
    }
}
