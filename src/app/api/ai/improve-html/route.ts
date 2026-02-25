// POST /api/ai/improve-html
// Takes current HTML + improvement instruction, returns improved HTML
// Uses Claude for targeted HTML editing

import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { improveProductHTML } from '@/lib/ai/router';
import { rateLimitResponse } from '@/lib/rate-limit';
import { log } from '@/lib/logger';

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
    const { html, instruction } = body as { html: string; instruction: string };

    if (!html || !instruction) {
        return NextResponse.json(
            { error: 'html and instruction are required' },
            { status: 400 }
        );
    }

    try {
        const result = await improveProductHTML(html, instruction);
        return NextResponse.json({
            html: result.html,
            metadata: {
                model: result.model,
                improvedAt: new Date().toISOString(),
            },
        });
    } catch (err) {
        log.error('Improve HTML error', { error: err instanceof Error ? err.message : 'Unknown' });
        return NextResponse.json({
            error: err instanceof Error ? err.message : 'Failed to improve HTML',
        }, { status: 500 });
    }
}
