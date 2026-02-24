// POST /api/ai/build-product
// PRD §8.5: Build Packet → Product DSL (Kimi K2.5 with retry + Claude fallback)
// Body: { buildPacket }

import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { generateDSLWithRetry } from '@/lib/ai/router';
import { rateLimitResponse } from '@/lib/rate-limit';
import { log } from '@/lib/logger';
import type { BuildPacket } from '@/types/build-packet';

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

    // Verify creator
    const { data: creator } = await supabase
        .from('creators')
        .select('id')
        .eq('profile_id', user.id)
        .single();

    if (!creator) {
        return NextResponse.json({ error: 'Creator profile required' }, { status: 403 });
    }

    const body = await request.json();
    const { buildPacket } = body as { buildPacket: BuildPacket };

    if (!buildPacket || !buildPacket.productType) {
        return NextResponse.json(
            { error: 'buildPacket is required' },
            { status: 400 }
        );
    }

    try {
        const { dsl, model } = await generateDSLWithRetry(buildPacket);

        return NextResponse.json({
            dsl,
            metadata: {
                model,
                generatedAt: new Date().toISOString(),
                pageCount: dsl.pages?.length || 0,
                blockCount: dsl.pages?.reduce((sum, p) => sum + (p.blocks?.length || 0), 0) || 0,
            },
        });
    } catch (err) {
        log.error('Build product error', { error: err instanceof Error ? err.message : 'Unknown' });

        return NextResponse.json({
            error: err instanceof Error ? err.message : 'Failed to generate product',
            manualEditRequired: true,
        }, { status: 500 });
    }
}
