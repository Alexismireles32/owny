// POST /api/ai/improve-block
// PRD §8.5: Improve single block via Kimi Instant mode
// Body: { block, instruction, context }

import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { DEFAULT_KIMI_MODEL } from '@/lib/ai/kimi';
import { rateLimitResponse } from '@/lib/rate-limit';
import { log } from '@/lib/logger';
import type { DSLBlock } from '@/types/product-dsl';
import type { ProductContext } from '@/lib/ai/router';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    const supabase = await createClient();

    const {
        data: { user },
        error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limiting: 20 AI requests/hour per creator
    const rl = rateLimitResponse(user.id, 'ai');
    if (rl) return rl;

    const body = await request.json();
    const { block, instruction, context } = body as {
        block: DSLBlock;
        instruction: string;
        context: ProductContext;
    };

    if (!block || !instruction) {
        return NextResponse.json(
            { error: 'block and instruction are required' },
            { status: 400 }
        );
    }

    // Provide defaults for context
    const ctx: ProductContext = {
        productType: context?.productType || 'pdf_guide',
        themeTokens: context?.themeTokens || {
            primaryColor: '#6366f1',
            secondaryColor: '#8b5cf6',
            backgroundColor: '#ffffff',
            textColor: '#1f2937',
            fontFamily: 'inter',
            borderRadius: 'md',
            spacing: 'normal',
            shadow: 'sm',
            mood: 'professional',
        },
        pageType: context?.pageType || 'content',
        surroundingBlocks: context?.surroundingBlocks || [],
    };

    try {
        const { KimiBuilder } = await import('@/lib/ai/router');
        const kimi = new KimiBuilder();
        const improved = await kimi.improveBlock(block, instruction, ctx);
        return NextResponse.json({ block: improved, model: DEFAULT_KIMI_MODEL });
    } catch (err) {
        log.error('Improve block error', { error: err instanceof Error ? err.message : 'Unknown' });
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Failed to improve block' },
            { status: 500 }
        );
    }
}
