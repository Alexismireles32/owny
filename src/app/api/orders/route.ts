import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: creator } = await supabase
        .from('creators')
        .select('id')
        .eq('profile_id', user.id)
        .single();

    if (!creator) {
        return NextResponse.json({ error: 'No creator profile' }, { status: 404 });
    }

    const { data: orders } = await supabase
        .from('orders')
        .select(`
            id,
            status,
            amount_cents,
            currency,
            created_at,
            buyer_email,
            products(id, title, type)
        `)
        .eq('creator_id', creator.id)
        .order('created_at', { ascending: false })
        .limit(50);

    const formatted = (orders || []).map((order) => {
        const product = order.products as unknown as { id: string; title: string; type: string } | null;
        return {
            id: order.id,
            buyerEmail: order.buyer_email || 'Unknown',
            productTitle: product?.title || 'Unknown Product',
            productType: product?.type || '',
            amountCents: order.amount_cents || 0,
            currency: order.currency || 'usd',
            status: order.status || 'pending',
            createdAt: order.created_at,
        };
    });

    return NextResponse.json({ orders: formatted });
}
