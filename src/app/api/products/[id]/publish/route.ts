// POST /api/products/[id]/publish
// Set active version, status=published

import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { triggerProductPublishedEmail } from '@/lib/email/triggers';

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
        .select('id, handle, display_name, profiles(email)')
        .eq('profile_id', user.id)
        .single();

    if (!creator) {
        return NextResponse.json({ error: 'Creator profile required' }, { status: 403 });
    }

    // Verify ownership and get product
    const { data: product } = await supabase
        .from('products')
        .select('id, title, slug, creator_id, active_version_id')
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

    // Send publish notification email
    try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const profile = (creator as unknown as { profiles: { email: string } | null })?.profiles;
        if (profile?.email) {
            await triggerProductPublishedEmail({
                creatorEmail: profile.email,
                creatorName: (creator as unknown as { display_name: string })?.display_name || 'Creator',
                productTitle: product.title || 'Your product',
                hubUrl: `${appUrl}/c/${(creator as unknown as { handle: string })?.handle || ''}`,
                productUrl: `${appUrl}/p/${product.slug}`,
            });
        }
    } catch {
        // Best-effort email — don't fail the publish
    }

    return NextResponse.json({ message: 'Product published', productId: id });
}
