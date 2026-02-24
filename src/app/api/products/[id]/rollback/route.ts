// POST /api/products/[id]/rollback
// Revert to previous version

import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const supabase = await createClient();
    const { id } = await params;

    const {
        data: { user },
        error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: creator } = await supabase
        .from('creators')
        .select('id')
        .eq('profile_id', user.id)
        .single();

    if (!creator) {
        return NextResponse.json({ error: 'Creator profile required' }, { status: 403 });
    }

    // Verify ownership
    const { data: product } = await supabase
        .from('products')
        .select('id, creator_id, active_version_id')
        .eq('id', id)
        .single();

    if (!product || product.creator_id !== creator.id) {
        return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    // Get the version before the current active one
    const { data: versions } = await supabase
        .from('product_versions')
        .select('id, version_number')
        .eq('product_id', id)
        .order('version_number', { ascending: false })
        .limit(2);

    if (!versions || versions.length < 2) {
        return NextResponse.json({ error: 'No previous version to rollback to' }, { status: 400 });
    }

    const previousVersion = versions[1]; // Second most recent

    const { error } = await supabase
        .from('products')
        .update({ active_version_id: previousVersion.id })
        .eq('id', id);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
        message: 'Rolled back to version ' + previousVersion.version_number,
        activeVersionId: previousVersion.id,
    });
}
