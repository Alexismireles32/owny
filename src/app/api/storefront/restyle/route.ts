// POST /api/storefront/restyle — AI-powered storefront restyling
// Takes a design prompt and updates brand_tokens

import { createClient } from '@/lib/supabase/server';
import { requestKimiStructuredObject } from '@/lib/ai/kimi-structured';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const StorefrontRestyleSchema = z.object({
    primaryColor: z.string().default('#6366f1'),
    secondaryColor: z.string().default('#8b5cf6'),
    backgroundColor: z.string().default('#ffffff'),
    textColor: z.string().default('#1f2937'),
    fontFamily: z.enum(['inter', 'outfit', 'roboto', 'playfair']).default('inter'),
    mood: z.enum(['clean', 'bold', 'premium', 'fresh', 'playful', 'energetic']).default('clean'),
    borderRadius: z.enum(['sm', 'md', 'lg', 'full']).default('md'),
    restyleSummary: z.string().default(''),
});

function buildFallbackTokens(currentTokens: Record<string, string>, prompt: string) {
    const promptLower = prompt.toLowerCase();

    let primaryColor = currentTokens.primaryColor || '#6366f1';
    let secondaryColor = currentTokens.secondaryColor || '#8b5cf6';
    let backgroundColor = currentTokens.backgroundColor || '#ffffff';
    let textColor = currentTokens.textColor || '#1f2937';
    let fontFamily = currentTokens.fontFamily || 'inter';
    let mood = currentTokens.mood || 'clean';
    let borderRadius = currentTokens.borderRadius || 'md';

    if (promptLower.includes('dark')) {
        backgroundColor = '#0f172a';
        textColor = '#f8fafc';
        mood = 'premium';
    }
    if (promptLower.includes('red') || promptLower.includes('warm')) {
        primaryColor = '#ef4444';
        secondaryColor = '#f97316';
        mood = 'energetic';
    }
    if (promptLower.includes('blue') || promptLower.includes('ocean')) {
        primaryColor = '#2563eb';
        secondaryColor = '#06b6d4';
    }
    if (promptLower.includes('green') || promptLower.includes('nature')) {
        primaryColor = '#16a34a';
        secondaryColor = '#14b8a6';
        mood = 'fresh';
    }
    if (promptLower.includes('purple') || promptLower.includes('royal')) {
        primaryColor = '#7c3aed';
        secondaryColor = '#a855f7';
        mood = 'premium';
    }
    if (promptLower.includes('pink') || promptLower.includes('playful')) {
        primaryColor = '#ec4899';
        secondaryColor = '#f97316';
        mood = 'playful';
        borderRadius = 'full';
    }
    if (promptLower.includes('minimal') || promptLower.includes('clean')) {
        primaryColor = '#0f172a';
        secondaryColor = '#475569';
        backgroundColor = '#ffffff';
        textColor = '#0f172a';
        mood = 'clean';
    }
    if (promptLower.includes('editorial') || promptLower.includes('luxury')) {
        fontFamily = 'playfair';
        mood = 'premium';
    }
    if (promptLower.includes('modern') || promptLower.includes('fashion')) {
        fontFamily = 'outfit';
        borderRadius = 'lg';
    }

    return {
        primaryColor,
        secondaryColor,
        backgroundColor,
        textColor,
        fontFamily,
        mood,
        borderRadius,
        restyleSummary: 'Fallback style mapping applied from the prompt.',
    };
}

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

    const currentTokens = (creator.brand_tokens || {}) as Record<string, string>;
    let generatedTokens = buildFallbackTokens(currentTokens, prompt);

    if (process.env.KIMI_API_KEY) {
        try {
            generatedTokens = await requestKimiStructuredObject({
                systemPrompt: `You are Owny's storefront art director.
Translate a creator's storefront redesign prompt into polished brand tokens for a premium creator storefront.

Rules:
- Return only a JSON object.
- Generate tasteful, high-contrast tokens that will look intentional on mobile and desktop.
- Keep values practical for a Next.js storefront using real CSS colors and simple font keys.
- Do not return gradients or raw CSS blobs. Return structured tokens only.`,
                userPrompt: `Current tokens:
${JSON.stringify(currentTokens, null, 2)}

Restyle request:
${prompt}

Return a JSON object with:
- primaryColor
- secondaryColor
- backgroundColor
- textColor
- fontFamily (inter | outfit | roboto | playfair)
- mood (clean | bold | premium | fresh | playful | energetic)
- borderRadius (sm | md | lg | full)
- restyleSummary`,
                schema: StorefrontRestyleSchema,
                maxTokens: 1200,
                thinking: 'disabled',
            });
        } catch {
            generatedTokens = buildFallbackTokens(currentTokens, prompt);
        }
    }

    const newTokens = {
        ...currentTokens,
        ...generatedTokens,
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
