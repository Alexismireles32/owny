import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    const supabase = await createClient();

    // Verify authenticated user
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

    // Parse body
    const body = await request.json();
    const { handle, displayName, brandTokens } = body;

    // Validate required fields
    if (!handle || !displayName) {
        return NextResponse.json(
            { error: 'Handle and display name are required' },
            { status: 400 }
        );
    }

    // Validate handle format
    const handleRegex = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
    if (!handleRegex.test(handle)) {
        return NextResponse.json(
            { error: 'Invalid handle format' },
            { status: 400 }
        );
    }

    // Check if user already has a creator record
    const { data: existingCreator } = await supabase
        .from('creators')
        .select('id')
        .eq('profile_id', user.id)
        .single();

    if (existingCreator) {
        return NextResponse.json(
            { error: 'Creator profile already exists' },
            { status: 409 }
        );
    }

    // Check handle uniqueness
    const { data: handleExists } = await supabase
        .from('creators')
        .select('id')
        .eq('handle', handle)
        .single();

    if (handleExists) {
        return NextResponse.json(
            { error: 'This handle is already taken' },
            { status: 409 }
        );
    }

    // Create creator record
    const { data: creator, error: createError } = await supabase
        .from('creators')
        .insert({
            profile_id: user.id,
            handle,
            display_name: displayName,
            brand_tokens: brandTokens || {},
        })
        .select()
        .single();

    if (createError) {
        console.error('Creator creation error:', createError);
        return NextResponse.json(
            { error: 'Failed to create creator profile' },
            { status: 500 }
        );
    }

    // Upgrade profile role to 'creator'
    const { error: roleError } = await supabase
        .from('profiles')
        .update({ role: 'creator' })
        .eq('id', user.id);

    if (roleError) {
        console.error('Role upgrade error:', roleError);
        // Creator was created but role wasn't upgraded — non-fatal
    }

    return NextResponse.json({ creator }, { status: 201 });
}
