// POST /api/products/[id]/versions
// Save a new version (DSL + build packet)

import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(
    request: Request,
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

    // Verify product ownership
    const { data: product } = await supabase
        .from('products')
        .select('id, creator_id')
        .eq('id', id)
        .single();

    if (!product || product.creator_id !== creator.id) {
        return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    // Get latest version number
    const { data: latestVersion } = await supabase
        .from('product_versions')
        .select('version_number')
        .eq('product_id', id)
        .order('version_number', { ascending: false })
        .limit(1)
        .single();

    const nextVersionNumber = (latestVersion?.version_number || 0) + 1;

    const body = await request.json();
    const { buildPacket = {}, dslJson = {}, generatedHtml = null, sourceVideoIds = [] } = body;

    const { data: version, error } = await supabase
        .from('product_versions')
        .insert({
            product_id: id,
            version_number: nextVersionNumber,
            build_packet: buildPacket,
            dsl_json: dslJson,
            generated_html: generatedHtml,
            source_video_ids: sourceVideoIds,
        })
        .select()
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Update product's active version
    await supabase
        .from('products')
        .update({ active_version_id: version.id })
        .eq('id', id);

    return NextResponse.json({ version }, { status: 201 });
}
