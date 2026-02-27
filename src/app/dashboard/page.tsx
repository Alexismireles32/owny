// /dashboard — New split-pane dashboard
// Left: Mobile storefront preview + analytics toggle
// Right: Lovable-style product builder + products list toggle

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { Button } from '@/components/ui/button';

export default async function DashboardPage() {
    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect('/sign-in');

    const { data: creator } = await supabase
        .from('creators')
        .select('id, display_name, handle, avatar_url, pipeline_status, stripe_connect_status')
        .eq('profile_id', user.id)
        .single();

    if (!creator) redirect('/');

    const { data: products } = await supabase
        .from('products')
        .select('id, title, type, status, slug, created_at')
        .eq('creator_id', creator.id)
        .order('created_at', { ascending: false });

    const creatorId = creator.id;

    const { data: orders } = await supabase
        .from('orders')
        .select('amount_cents, product_id')
        .eq('status', 'paid')
        .in(
            'product_id',
            (await supabase.from('products').select('id').eq('creator_id', creatorId)).data?.map((p) => p.id) || []
        );

    const totalRevenueCents = orders?.reduce((sum, o) => sum + (o.amount_cents || 0), 0) || 0;
    const salesCount = orders?.length || 0;

    const { count: viewCount } = await supabase
        .from('page_views')
        .select('*', { count: 'exact', head: true })
        .eq('creator_id', creatorId);

    return (
        <div className="min-h-screen bg-slate-100 text-slate-900">
            <header className="h-14 border-b border-slate-200 bg-white">
                <div className="mx-auto flex h-full w-full max-w-[1600px] items-center justify-between px-4 sm:px-6">
                    <div className="flex items-center">
                        <span className="text-sm font-semibold tracking-[0.08em] text-slate-900">OWNY</span>
                    </div>

                    <div className="flex items-center gap-3">
                        <span className="hidden text-sm text-slate-500 sm:inline">{creator.display_name}</span>
                        <form action="/api/auth/signout" method="POST">
                            <Button type="submit" size="sm" variant="outline">
                                Sign out
                            </Button>
                        </form>
                    </div>
                </div>
            </header>

            <DashboardShell
                creatorId={creator.id}
                handle={creator.handle}
                displayName={creator.display_name}
                stripeConnectStatus={creator.stripe_connect_status || 'unconnected'}
                stats={{
                    revenue: totalRevenueCents,
                    sales: salesCount,
                    pageViews: viewCount || 0,
                }}
                products={products || []}
            />
        </div>
    );
}
