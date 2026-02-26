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
        <div className="min-h-screen" style={{ background: '#060d18' }}>
            <header
                style={{
                    height: '64px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0 1.2rem',
                    borderBottom: '1px solid rgba(226,232,240,0.14)',
                    background:
                        'linear-gradient(100deg, rgba(7,18,32,0.95), rgba(9,21,35,0.9) 42%, rgba(8,21,35,0.9))',
                    backdropFilter: 'blur(10px)',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
                    <span
                        style={{
                            fontSize: '1.05rem',
                            fontWeight: 800,
                            letterSpacing: '0.03em',
                            color: '#e2e8f0',
                        }}
                    >
                        OWNY
                    </span>
                    <span
                        style={{
                            border: '1px solid rgba(34,211,238,0.35)',
                            borderRadius: '999px',
                            padding: '0.2rem 0.5rem',
                            fontSize: '0.6rem',
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            color: '#67e8f9',
                            background: 'rgba(34,211,238,0.1)',
                            fontWeight: 700,
                        }}
                    >
                        Studio
                    </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.95rem' }}>
                    <span style={{ fontSize: '0.72rem', color: 'rgba(226,232,240,0.64)' }}>{creator.display_name}</span>
                    <form action="/api/auth/signout" method="POST">
                        <button
                            type="submit"
                            style={{
                                border: '1px solid rgba(226,232,240,0.2)',
                                borderRadius: '0.7rem',
                                padding: '0.34rem 0.58rem',
                                background: 'rgba(226,232,240,0.08)',
                                color: 'rgba(226,232,240,0.86)',
                                fontSize: '0.66rem',
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                                fontWeight: 600,
                            }}
                        >
                            Sign out
                        </button>
                    </form>
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
