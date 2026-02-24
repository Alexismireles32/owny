// GET /api/content/[productSlug]/download — Generate signed URL for PDF download
// PRD §8.7

import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ productSlug: string }> }
) {
    const supabase = await createClient();
    const { productSlug } = await params;

    const {
        data: { user },
        error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Look up product by slug
    const { data: product } = await supabase
        .from('products')
        .select('id, type, title, slug')
        .eq('slug', productSlug)
        .single();

    if (!product) {
        return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    // Check entitlement
    const { data: entitlement } = await supabase
        .from('entitlements')
        .select('id')
        .eq('buyer_profile_id', user.id)
        .eq('product_id', product.id)
        .eq('status', 'active')
        .single();

    if (!entitlement) {
        return NextResponse.json({ error: 'Not entitled to this product' }, { status: 403 });
    }

    // Generate signed URL from Supabase Storage
    // PDF files are stored at: products/{productId}/output.pdf
    const storagePath = `products/${product.id}/output.pdf`;

    const { data: signedUrl, error } = await supabase.storage
        .from('product-assets')
        .createSignedUrl(storagePath, 3600); // 1 hour expiry

    if (error || !signedUrl) {
        return NextResponse.json(
            { error: 'Download not available yet. The product may still be generating.' },
            { status: 404 }
        );
    }

    // Update last accessed
    await supabase
        .from('course_progress')
        .upsert({
            buyer_profile_id: user.id,
            product_id: product.id,
            progress_data: {
                lastAccessedAt: new Date().toISOString(),
                percentComplete: 100, // PDF = instant "complete"
                completedBlockIds: [],
            },
        }, { onConflict: 'buyer_profile_id,product_id' });

    return NextResponse.json({
        downloadUrl: signedUrl.signedUrl,
        filename: `${product.title}.pdf`,
    });
}
