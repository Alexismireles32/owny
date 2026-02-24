// GET + POST /api/progress — Get/update progress for a product
// PRD §8.7

import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const supabase = await createClient();

    const {
        data: { user },
        error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const productId = url.searchParams.get('productId');

    if (!productId) {
        return NextResponse.json({ error: 'productId is required' }, { status: 400 });
    }

    // Verify entitlement
    const { data: entitlement } = await supabase
        .from('entitlements')
        .select('id')
        .eq('buyer_profile_id', user.id)
        .eq('product_id', productId)
        .eq('status', 'active')
        .single();

    if (!entitlement) {
        return NextResponse.json({ error: 'Not entitled to this product' }, { status: 403 });
    }

    const { data: progress } = await supabase
        .from('course_progress')
        .select('*')
        .eq('buyer_profile_id', user.id)
        .eq('product_id', productId)
        .single();

    return NextResponse.json({
        progress: progress?.progress_data || {
            completedBlockIds: [],
            lastAccessedAt: null,
            percentComplete: 0,
        },
    });
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

    const body = await request.json();
    const { productId, completedBlockIds, percentComplete } = body;

    if (!productId) {
        return NextResponse.json({ error: 'productId is required' }, { status: 400 });
    }

    // Verify entitlement
    const { data: entitlement } = await supabase
        .from('entitlements')
        .select('id')
        .eq('buyer_profile_id', user.id)
        .eq('product_id', productId)
        .eq('status', 'active')
        .single();

    if (!entitlement) {
        return NextResponse.json({ error: 'Not entitled to this product' }, { status: 403 });
    }

    const progressData = {
        completedBlockIds: completedBlockIds || [],
        lastAccessedAt: new Date().toISOString(),
        percentComplete: percentComplete || 0,
    };

    // Upsert progress
    const { error } = await supabase
        .from('course_progress')
        .upsert({
            buyer_profile_id: user.id,
            product_id: productId,
            progress_data: progressData,
        }, { onConflict: 'buyer_profile_id,product_id' });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ progress: progressData });
}
