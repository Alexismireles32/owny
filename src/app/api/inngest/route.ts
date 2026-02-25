// /api/inngest — Inngest webhook handler
// This single route serves all Inngest functions

import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest/client';
import { scrapePipeline } from '@/lib/inngest/pipeline';

export const { GET, POST, PUT } = serve({
    client: inngest,
    functions: [scrapePipeline],
});
