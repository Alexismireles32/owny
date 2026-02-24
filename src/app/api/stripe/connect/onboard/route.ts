// POST /api/stripe/connect/onboard — Create Stripe Connect account link
// PRD §8.6: Stripe Connect Standard onboarding flow

import { createClient } from '@/lib/supabase/server';
import { getStripe } from '@/lib/stripe';
import { NextResponse } from 'next/server';

export async function POST() {
    const supabase = await createClient();

    const {
        data: { user },
        error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: creator } = await supabase
        .from('creators')
        .select('id, stripe_connect_account_id, stripe_connect_status')
        .eq('profile_id', user.id)
        .single();

    if (!creator) {
        return NextResponse.json({ error: 'Creator profile required' }, { status: 403 });
    }

    const stripe = getStripe();
    let accountId = creator.stripe_connect_account_id;

    // Create Stripe Connect account if none exists
    if (!accountId) {
        const account = await stripe.accounts.create({
            type: 'standard',
            email: user.email,
            metadata: { creator_id: creator.id },
        });

        accountId = account.id;

        await supabase
            .from('creators')
            .update({
                stripe_connect_account_id: accountId,
                stripe_connect_status: 'pending',
            })
            .eq('id', creator.id);
    }

    // Create account link for onboarding
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const accountLink = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: `${appUrl}/connect-stripe`,
        return_url: `${appUrl}/connect-stripe?completed=true`,
        type: 'account_onboarding',
    });

    return NextResponse.json({ url: accountLink.url });
}
