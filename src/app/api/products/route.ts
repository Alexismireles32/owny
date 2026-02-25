// GET + POST /api/products
// List creator's products / Create new product + draft version

import { createClient } from '@/lib/supabase/server';
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
        .select('id')
        .eq('profile_id', user.id)
        .single();

    if (!creator) {
        return NextResponse.json({ error: 'Creator profile required' }, { status: 403 });
    }

    const { data: products, error } = await supabase
        .from('products')
        .select('id, title, slug, type, status, description, access_type, price_cents, currency, active_version_id, created_at, updated_at')
        .eq('creator_id', creator.id)
        .order('created_at', { ascending: false });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ products });
}

export async function POST(request: Request) {
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
        .select('id')
        .eq('profile_id', user.id)
        .single();

    if (!creator) {
        return NextResponse.json({ error: 'Creator profile required' }, { status: 403 });
    }

    const body = await request.json();
    const { type, title, description, accessType = 'paid', priceCents, currency = 'usd' } = body;

    if (!type || !title) {
        return NextResponse.json({ error: 'type and title are required' }, { status: 400 });
    }

    // Generate slug from title
    const baseSlug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 60);
    const slug = `${baseSlug}-${Date.now().toString(36)}`;

    // Create product
    const { data: product, error: productError } = await supabase
        .from('products')
        .insert({
            creator_id: creator.id,
            slug,
            type,
            title,
            description: description || null,
            status: 'draft',
            access_type: accessType,
            price_cents: priceCents || null,
            currency,
        })
        .select()
        .single();

    if (productError) {
        return NextResponse.json({ error: productError.message }, { status: 500 });
    }

    // Create initial draft version
    const { data: version, error: versionError } = await supabase
        .from('product_versions')
        .insert({
            product_id: product.id,
            version_number: 1,
            build_packet: {},
            dsl_json: {},
            source_video_ids: [],
        })
        .select()
        .single();

    if (versionError) {
        console.error('Version creation error:', versionError);
    }

    // Set active version
    if (version) {
        await supabase
            .from('products')
            .update({ active_version_id: version.id })
            .eq('id', product.id);
    }

    return NextResponse.json({ product, version }, { status: 201 });
}
