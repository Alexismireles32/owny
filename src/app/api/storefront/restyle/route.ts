// POST /api/storefront/restyle — AI-powered storefront restyling
// Takes a design prompt and updates brand_tokens

import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { creatorId, prompt } = await request.json();

    if (!creatorId || !prompt) {
        return NextResponse.json({ error: 'creatorId and prompt are required' }, { status: 400 });
    }

    // Verify ownership
    const { data: creator } = await supabase
        .from('creators')
        .select('id, brand_tokens')
        .eq('id', creatorId)
        .eq('profile_id', user.id)
        .single();

    if (!creator) {
        return NextResponse.json({ error: 'Creator not found' }, { status: 403 });
    }

    // For now: generate brand tokens from the prompt using heuristic color mapping
    // This will be replaced with AI (Kimi) in Phase 4
    const currentTokens = (creator.brand_tokens || {}) as Record<string, string>;
    const promptLower = prompt.toLowerCase();

    let primaryColor = currentTokens.primaryColor || '#6366f1';
    let bgGradient = currentTokens.bgGradient || 'linear-gradient(135deg, #f8fafc, #f1f5f9)';

    // Simple heuristic color mapping from prompt
    if (promptLower.includes('dark')) {
        bgGradient = 'linear-gradient(135deg, #0f172a, #1e293b)';
    }
    if (promptLower.includes('red') || promptLower.includes('warm')) primaryColor = '#ef4444';
    if (promptLower.includes('blue') || promptLower.includes('ocean')) primaryColor = '#3b82f6';
    if (promptLower.includes('green') || promptLower.includes('nature')) primaryColor = '#22c55e';
    if (promptLower.includes('purple') || promptLower.includes('royal')) primaryColor = '#8b5cf6';
    if (promptLower.includes('pink') || promptLower.includes('playful')) primaryColor = '#ec4899';
    if (promptLower.includes('orange') || promptLower.includes('energy')) primaryColor = '#f97316';
    if (promptLower.includes('gold') || promptLower.includes('premium')) primaryColor = '#eab308';
    if (promptLower.includes('minimal') || promptLower.includes('clean')) {
        primaryColor = '#0f172a';
        bgGradient = 'linear-gradient(135deg, #ffffff, #f8fafc)';
    }

    const newTokens = {
        ...currentTokens,
        primaryColor,
        bgGradient,
        lastPrompt: prompt,
    };

    const { error } = await supabase
        .from('creators')
        .update({ brand_tokens: newTokens })
        .eq('id', creatorId);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ tokens: newTokens });
}
