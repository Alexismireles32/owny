// /api/jobs/process — Cron-triggered job processing endpoint
// PRD M3/M4 — Processes queued import/indexing jobs
// Intended to be called by Vercel Cron (e.g., every 1 minute)

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { processBatch } from '@/lib/import/job-processor';
import { log } from '@/lib/logger';

export async function POST(request: Request) {
    // Verify cron secret to prevent unauthorized triggers
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const supabase = await createClient();
        const result = await processBatch(supabase, 10);

        log.info('Job batch processed', {
            ...result,
            category: 'jobs',
        });

        return NextResponse.json(result);
    } catch (err) {
        log.error('Job processing failed', {
            error: err instanceof Error ? err.message : 'Unknown error',
            category: 'jobs',
        });

        return NextResponse.json(
            { error: 'Job processing failed' },
            { status: 500 }
        );
    }
}
