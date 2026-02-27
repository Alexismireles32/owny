// /api/jobs/process — Cron-triggered job processing endpoint
// PRD M3/M4 — Processes queued import/indexing jobs + pipeline queue jobs
// Intended to be called by Vercel Cron (e.g., every 1 minute)

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { processBatch } from '@/lib/import/job-processor';
import { processPipelineJobBatch } from '@/lib/pipeline/queue';
import { log } from '@/lib/logger';

export async function POST(request: Request) {
    // Verify cron secret to prevent unauthorized triggers
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
        log.error('CRON_SECRET is not configured for jobs processor');
        return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 500 });
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const supabase = createAdminClient();
        const [importJobs, pipelineJobs] = await Promise.all([
            processBatch(supabase, 10),
            processPipelineJobBatch(10),
        ]);

        log.info('Job batch processed', {
            importJobs,
            pipelineJobs,
            category: 'jobs',
        });

        return NextResponse.json({
            importJobs,
            pipelineJobs,
        });
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
