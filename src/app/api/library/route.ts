// GET /api/library — List buyer's entitled products
// PRD §8.7

import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
    const supabase = await createClient();

    const {
        data: { user },
        error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch active entitlements with product details
    const { data: entitlements, error } = await supabase
        .from('entitlements')
        .select(`
            id,
            status,
            granted_via,
            created_at,
            products(
                id, slug, type, title, description, price_cents, currency,
                creators(handle, display_name, avatar_url)
            )
        `)
        .eq('buyer_profile_id', user.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Fetch progress for each product
    const productIds = entitlements
        ?.map((e) => {
            const product = e.products as unknown as { id: string } | null;
            return product?.id;
        })
        .filter(Boolean) as string[] || [];

    const progressMap: Record<string, { percentComplete: number }> = {};

    if (productIds.length > 0) {
        const { data: progress } = await supabase
            .from('course_progress')
            .select('product_id, progress_data')
            .eq('buyer_profile_id', user.id)
            .in('product_id', productIds);

        if (progress) {
            for (const p of progress) {
                const data = p.progress_data as Record<string, unknown>;
                progressMap[p.product_id] = {
                    percentComplete: (data?.percentComplete as number) || 0,
                };
            }
        }
    }

    return NextResponse.json({
        entitlements: entitlements?.map((e) => ({
            ...e,
            progress: progressMap[(e.products as unknown as { id: string })?.id] || null,
        })),
    });
}
