// GET /api/stripe/connect/status — Check Connect account status
// PRD §8.6

import { createClient } from '@/lib/supabase/server';
import { getStripe } from '@/lib/stripe';
import { NextResponse } from 'next/server';

export async function GET() {
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

    if (!creator.stripe_connect_account_id) {
        return NextResponse.json({
            status: 'unconnected',
            chargesEnabled: false,
            payoutsEnabled: false,
        });
    }

    // Check actual status from Stripe
    const stripe = getStripe();
    const account = await stripe.accounts.retrieve(creator.stripe_connect_account_id);

    const newStatus = account.charges_enabled && account.payouts_enabled
        ? 'connected'
        : 'pending';

    // Sync status to DB if changed
    if (newStatus !== creator.stripe_connect_status) {
        await supabase
            .from('creators')
            .update({ stripe_connect_status: newStatus })
            .eq('id', creator.id);
    }

    return NextResponse.json({
        status: newStatus,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        accountId: creator.stripe_connect_account_id,
    });
}
