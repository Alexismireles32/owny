// src/lib/track-view.ts
// PRD §M13 — Server-side page view tracking

import { createClient } from '@/lib/supabase/server';

/**
 * Track a page view server-side. Call from server components.
 * Intentionally fire-and-forget (no await needed from caller).
 */
export async function trackPageView(opts: {
    path: string;
    creatorId?: string;
    productId?: string;
    referrer?: string;
}) {
    try {
        const supabase = await createClient();
        await supabase.from('page_views').insert({
            path: opts.path,
            creator_id: opts.creatorId || null,
            product_id: opts.productId || null,
            referrer: opts.referrer || null,
        });
    } catch {
        // Silently fail — page view tracking should never break the page
    }
}
