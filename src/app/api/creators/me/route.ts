import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
    const supabase = await createClient();

    const {
        data: { user },
        error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json(
            { error: 'Unauthorized' },
            { status: 401 }
        );
    }

    // Fetch creator record joined with profile
    const { data: creator, error } = await supabase
        .from('creators')
        .select(`
            *,
            profile:profiles(*)
        `)
        .eq('profile_id', user.id)
        .single();

    if (error || !creator) {
        return NextResponse.json(
            { error: 'Creator profile not found' },
            { status: 404 }
        );
    }

    return NextResponse.json({ creator });
}

export async function PATCH(request: Request) {
    const supabase = await createClient();

    const {
        data: { user },
        error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json(
            { error: 'Unauthorized' },
            { status: 401 }
        );
    }

    const body = await request.json();

    // Only allow updating specific fields
    const allowedFields = ['display_name', 'bio', 'avatar_url', 'brand_tokens', 'featured_product_id'];
    const updates: Record<string, unknown> = {};

    for (const field of allowedFields) {
        if (field in body) {
            updates[field] = body[field];
        }
    }

    if (Object.keys(updates).length === 0) {
        return NextResponse.json(
            { error: 'No valid fields to update' },
            { status: 400 }
        );
    }

    const { data: creator, error } = await supabase
        .from('creators')
        .update(updates)
        .eq('profile_id', user.id)
        .select()
        .single();

    if (error) {
        console.error('Creator update error:', error);
        return NextResponse.json(
            { error: 'Failed to update creator profile' },
            { status: 500 }
        );
    }

    return NextResponse.json({ creator });
}
