// POST /api/admin/takedown — Create/lift product takedown (uses takedowns table)
// PRD §8.8 + §12

import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { log } from '@/lib/logger';

interface TakedownBody {
    action?: 'takedown' | 'lift';
    productId?: string;
    reason?: string;
}

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

function readFormString(value: FormDataEntryValue | null): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

async function parseTakedownBody(request: Request): Promise<TakedownBody | null> {
    const contentType = request.headers.get('content-type') || '';

    try {
        if (contentType.includes('application/json')) {
            return await request.json() as TakedownBody;
        }

        const formData = await request.formData();
        return {
            action: readFormString(formData.get('action')) as TakedownBody['action'],
            productId: readFormString(formData.get('productId')),
            reason: readFormString(formData.get('reason')),
        };
    } catch {
        return null;
    }
}

export async function POST(request: Request) {
    const { user, supabase } = await verifyAdmin();
    if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await parseTakedownBody(request);
    if (!body) {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { action, productId, reason } = body;

    if (!productId) {
        return NextResponse.json({ error: 'productId is required' }, { status: 400 });
    }

    if (action === 'takedown') {
        if (!reason) {
            return NextResponse.json({ error: 'reason is required for takedown' }, { status: 400 });
        }

        // Insert into takedowns table
        const { error: takedownError } = await supabase.from('takedowns').insert({
            product_id: productId,
            reason,
            status: 'active',
            admin_profile_id: user.id,
        });

        if (takedownError) {
            return NextResponse.json({ error: takedownError.message }, { status: 500 });
        }

        // Archive the product
        const { error: productError } = await supabase
            .from('products')
            .update({ status: 'archived' })
            .eq('id', productId);

        if (productError) {
            return NextResponse.json({ error: productError.message }, { status: 500 });
        }

        log.info('Product taken down', { productId, reason, adminId: user.id });
        return NextResponse.json({ success: true, action: 'takedown' });
    }

    if (action === 'lift') {
        // Lift the takedown
        const { error: liftError } = await supabase
            .from('takedowns')
            .update({ status: 'lifted' })
            .eq('product_id', productId)
            .eq('status', 'active');

        if (liftError) {
            return NextResponse.json({ error: liftError.message }, { status: 500 });
        }

        // Restore product to draft
        const { error: productError } = await supabase
            .from('products')
            .update({ status: 'draft' })
            .eq('id', productId);

        if (productError) {
            return NextResponse.json({ error: productError.message }, { status: 500 });
        }

        log.info('Takedown lifted', { productId, adminId: user.id });
        return NextResponse.json({ success: true, action: 'lift' });
    }

    return NextResponse.json({ error: 'Invalid action. Use "takedown" or "lift".' }, { status: 400 });
}
