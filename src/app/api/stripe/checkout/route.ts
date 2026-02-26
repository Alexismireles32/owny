// POST /api/stripe/checkout — Create Checkout Session with application fee
// PRD §8.6

import { createClient } from '@/lib/supabase/server';
import { getStripe, calculateAppFee } from '@/lib/stripe';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    const body = await request.json();
    const { productId } = body;

    if (!productId) {
        return NextResponse.json({ error: 'productId is required' }, { status: 400 });
    }

    // Fetch product with creator's Stripe account
    const { data: product } = await supabase
        .from('products')
        .select(`
            id, slug, title, description, price_cents, currency, access_type, status,
            creators(id, stripe_connect_account_id, stripe_connect_status, display_name)
        `)
        .eq('id', productId)
        .eq('status', 'published')
        .single();

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
        // For free products, create entitlement directly
        if (user) {
            await supabase.from('entitlements').upsert({
                buyer_profile_id: user.id,
                product_id: product.id,
                status: 'active',
                granted_via: 'purchase',
            }, { onConflict: 'buyer_profile_id,product_id' });
        }

        return NextResponse.json({ free: true, productSlug: product.slug });
    }

    // Paid products require creator's Stripe Connect
    if (!creator.stripe_connect_account_id || creator.stripe_connect_status !== 'connected') {
        return NextResponse.json(
            { error: 'Creator has not completed Stripe setup' },
            { status: 400 }
        );
    }

    const stripe = getStripe();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const appFee = calculateAppFee(product.price_cents);

    // Create a pending order
    const { data: order } = await supabase
        .from('orders')
        .insert({
            buyer_profile_id: user?.id || null,
            product_id: product.id,
            creator_id: creator.id,
            status: 'pending',
            amount_cents: product.price_cents,
            currency: product.currency || 'usd',
        })
        .select('id')
        .single();

    // Create Checkout Session
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
            buyer_profile_id: user?.id || '',
        },
        customer_email: user?.email || undefined,
    });

    // Update order with session ID
    if (order) {
        await supabase
            .from('orders')
            .update({ stripe_checkout_session_id: session.id })
            .eq('id', order.id);
    }

    return NextResponse.json({ url: session.url });
}
