// GET /api/admin/products — List all products (admin only)
// POST /api/admin/products — Takedown single product

import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim());

async function verifyAdmin(supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !ADMIN_EMAILS.includes(user.email || '')) return null;
    return user;
}

export async function GET() {
    const supabase = await createClient();
    const user = await verifyAdmin(supabase);
    if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { data: products, error } = await supabase
        .from('products')
        .select('id, title, slug, type, status, price_cents, creator_id, created_at')
        .order('created_at', { ascending: false })
        .limit(200);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ products });
}

export async function POST(request: Request) {
    const supabase = await createClient();
    const user = await verifyAdmin(supabase);
    if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { action, productId } = await request.json();

    if (action === 'takedown' && productId) {
        const { error } = await supabase
            .from('products')
            .update({ status: 'archived' })
            .eq('id', productId);

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ success: true });
    }

    if (action === 'restore' && productId) {
        const { error } = await supabase
            .from('products')
            .update({ status: 'draft' })
            .eq('id', productId);

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
