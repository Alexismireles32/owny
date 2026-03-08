// POST /api/stripe/checkout — Create Checkout Session with application fee
// PRD §8.6

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getStripe, calculateAppFee } from '@/lib/stripe';
import { NextResponse } from 'next/server';
import { getStripeCheckoutSetupMessage, hasUsableStripeSecretKey, isFakeStripeModeEnabled } from '@/lib/stripe-mode';

export async function POST(request: Request) {
    const supabase = await createClient();
    const adminSupabase = createAdminClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    const body = await request.json();
    const { productId } = body;

    if (!productId) {
        return NextResponse.json({ error: 'productId is required' }, { status: 400 });
    }

    if (!user) {
        return NextResponse.json(
            { error: 'Sign in is required before unlocking or purchasing a product.' },
            { status: 401 }
        );
    }

    // Fetch the published product through the admin client after authenticating the buyer.
    // Checkout should not depend on buyer-side RLS visibility for public product metadata.
    const { data: product, error: productError } = await adminSupabase
        .from('products')
        .select(`
            id, slug, title, description, price_cents, currency, access_type, status,
            creators!products_creator_id_fkey(id, stripe_connect_account_id, stripe_connect_status, display_name)
        `)
        .eq('id', productId)
        .eq('status', 'published')
        .single();

    if (productError) {
        console.error('[/api/stripe/checkout] product lookup failed', {
            productId,
            userId: user.id,
            error: productError.message,
        });
        return NextResponse.json({ error: 'Unable to load product for checkout' }, { status: 500 });
    }

    if (!product) {
        return NextResponse.json({ error: 'Product not found or not published' }, { status: 404 });
    }

    const creator = product.creators as unknown as {
        id: string;
        stripe_connect_account_id: string | null;
        stripe_connect_status: string;
        display_name: string;
    };

    // Handle free / email-gated products
    if (product.access_type === 'public' || product.access_type === 'email_gated' || !product.price_cents) {
        const { error: entitlementError } = await adminSupabase
            .from('entitlements')
            .upsert({
                buyer_profile_id: user.id,
                product_id: product.id,
                status: 'active',
                granted_via: 'purchase',
            }, { onConflict: 'buyer_profile_id,product_id' });

        if (entitlementError) {
            console.error('[/api/stripe/checkout] free entitlement grant failed', {
                productId: product.id,
                userId: user.id,
                error: entitlementError.message,
            });
            return NextResponse.json({ error: 'Unable to unlock this product right now' }, { status: 500 });
        }

        return NextResponse.json({ free: true, productSlug: product.slug });
    }

    if (product.access_type === 'subscription') {
        return NextResponse.json(
            { error: 'Subscription checkout is not supported in the current purchase flow.' },
            { status: 400 }
        );
    }

    // Paid products require creator's Stripe Connect
    if (!creator.stripe_connect_account_id || creator.stripe_connect_status !== 'connected') {
        return NextResponse.json(
            { error: 'Creator has not completed Stripe setup' },
            { status: 400 }
        );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const fakeStripeEnabled = isFakeStripeModeEnabled();

    if (!fakeStripeEnabled && !hasUsableStripeSecretKey()) {
        return NextResponse.json(
            { error: getStripeCheckoutSetupMessage() },
            { status: 503 }
        );
    }

    // Create a pending order
    const { data: order, error: orderError } = await adminSupabase
        .from('orders')
        .insert({
            buyer_profile_id: user.id,
            product_id: product.id,
            status: 'pending',
            amount_cents: product.price_cents,
            currency: product.currency || 'usd',
        })
        .select('id')
        .single();

    if (orderError) {
        console.error('[/api/stripe/checkout] order creation failed', {
            productId: product.id,
            userId: user.id,
            error: orderError.message,
        });
        return NextResponse.json({ error: 'Unable to create checkout right now' }, { status: 500 });
    }

    if (fakeStripeEnabled) {
        const fakeSessionId = `e2e_session_${crypto.randomUUID()}`;
        const { error: fakeSessionError } = await adminSupabase
            .from('orders')
            .update({ stripe_checkout_session_id: fakeSessionId })
            .eq('id', order.id);

        if (fakeSessionError) {
            console.error('[/api/stripe/checkout] fake session update failed', {
                productId: product.id,
                orderId: order.id,
                error: fakeSessionError.message,
            });
            return NextResponse.json({ error: 'Unable to create checkout right now' }, { status: 500 });
        }

        return NextResponse.json({
            url: `/checkout-success?session_id=${encodeURIComponent(fakeSessionId)}&simulate=1`,
        });
    }

    // Create Checkout Session
    const stripe = getStripe();
    const appFee = calculateAppFee(product.price_cents);
    const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [
            {
                price_data: {
                    currency: product.currency || 'usd',
                    product_data: {
                        name: product.title,
                        description: product.description || undefined,
                    },
                    unit_amount: product.price_cents,
                },
                quantity: 1,
            },
        ],
        payment_intent_data: {
            application_fee_amount: appFee,
            transfer_data: {
                destination: creator.stripe_connect_account_id,
            },
        },
        success_url: `${appUrl}/checkout-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/p/${product.slug}`,
        metadata: {
            product_id: product.id,
            order_id: order?.id || '',
            buyer_profile_id: user.id,
        },
        customer_email: user.email || undefined,
    });

    // Update order with session ID
    if (order) {
        await adminSupabase
            .from('orders')
            .update({ stripe_checkout_session_id: session.id })
            .eq('id', order.id);
    }

    return NextResponse.json({ url: session.url });
}
