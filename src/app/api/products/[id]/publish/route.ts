// POST /api/products/[id]/publish
// Set active version, status=published

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

    // Verify ownership and get product
    const { data: product } = await supabase
        .from('products')
        .select('id, creator_id, active_version_id')
        .eq('id', id)
        .single();

    if (!product || product.creator_id !== creator.id) {
        return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    if (!product.active_version_id) {
        return NextResponse.json({ error: 'No version to publish' }, { status: 400 });
    }

    // Publish the product
    const { error: publishError } = await supabase
        .from('products')
        .update({
            status: 'published',
            published_at: new Date().toISOString(),
        })
        .eq('id', id);

    if (publishError) {
        return NextResponse.json({ error: publishError.message }, { status: 500 });
    }

    // Mark the active version as published
    await supabase
        .from('product_versions')
        .update({ published_at: new Date().toISOString() })
        .eq('id', product.active_version_id);

    return NextResponse.json({ message: 'Product published', productId: id });
}
