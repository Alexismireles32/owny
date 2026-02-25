// /dashboard — New split-pane dashboard
// Left: Mobile storefront preview + analytics toggle
// Right: Lovable-style product builder + products list toggle

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/DashboardShell';

export default async function DashboardPage() {
    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect('/sign-in');

    const { data: creator } = await supabase
        .from('creators')
        .select('id, display_name, handle, avatar_url, pipeline_status')
        .eq('profile_id', user.id)
        .single();

    if (!creator) redirect('/');

    // Pipeline status is available but doesn't block dashboard access

    // Fetch products
    const { data: products } = await supabase
        .from('products')
        .select('id, title, type, status, slug, created_at')
        .eq('creator_id', creator.id)
        .order('created_at', { ascending: false });

    // Fetch stats
    const creatorId = creator.id;

    const { data: orders } = await supabase
        .from('orders')
        .select('amount_cents, product_id')
        .eq('status', 'paid')
        .in('product_id',
            (await supabase.from('products').select('id').eq('creator_id', creatorId)).data?.map(p => p.id) || []
        );

    const totalRevenueCents = orders?.reduce((sum, o) => sum + (o.amount_cents || 0), 0) || 0;
    const salesCount = orders?.length || 0;

    const { count: viewCount } = await supabase
        .from('page_views')
        .select('*', { count: 'exact', head: true })
        .eq('creator_id', creatorId);

    return (
        <div className="min-h-screen" style={{ background: '#0f0f1a' }}>
            {/* Header */}
            <header style={{
                height: '64px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 1.5rem',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                background: 'rgba(0,0,0,0.3)',
            }}>
                <span style={{
                    fontSize: '1.25rem',
                    fontWeight: 800,
                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                }}>
                    Owny
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>
                        {creator.display_name}
                    </span>
                    <form action="/api/auth/signout" method="POST">
                        <button
                            type="submit"
                            style={{
                                background: 'none',
                                border: 'none',
                                color: 'rgba(255,255,255,0.3)',
                                fontSize: '0.75rem',
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                            }}
                        >
                            Sign Out
                        </button>
                    </form>
                </div>
            </header>

            <DashboardShell
                creatorId={creator.id}
                handle={creator.handle}
                displayName={creator.display_name}
                avatarUrl={creator.avatar_url}
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
