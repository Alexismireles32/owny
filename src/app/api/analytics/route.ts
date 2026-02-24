// GET /api/analytics — Creator analytics dashboard data
// PRD §M13: revenue total, purchase count, top products, page views

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

    const { data: creator } = await supabase
        .from('creators')
        .select('id')
        .eq('profile_id', user.id)
        .single();

    if (!creator) {
        return NextResponse.json({ error: 'Creator profile required' }, { status: 403 });
    }

    // Revenue + purchase count from orders
    const { data: orders } = await supabase
        .from('orders')
        .select('amount_cents, status, created_at')
        .eq('creator_id', creator.id)
        .eq('status', 'paid');

    const totalRevenueCents = (orders || []).reduce((sum, o) => sum + (o.amount_cents || 0), 0);
    const purchaseCount = (orders || []).length;

    // Revenue by month (last 12 months)
    const monthlyRevenue: Record<string, number> = {};
    for (const order of orders || []) {
        const month = new Date(order.created_at).toISOString().slice(0, 7); // YYYY-MM
        monthlyRevenue[month] = (monthlyRevenue[month] || 0) + (order.amount_cents || 0);
    }

    // Top products by revenue
    const { data: products } = await supabase
        .from('products')
        .select('id, title, slug, type, status, price_cents')
        .eq('creator_id', creator.id)
        .order('created_at', { ascending: false });

    // Aggregate sales per product
    const { data: allOrders } = await supabase
        .from('orders')
        .select('product_id, amount_cents')
        .eq('creator_id', creator.id)
        .eq('status', 'paid');

    const productSales: Record<string, { count: number; revenue: number }> = {};
    for (const o of allOrders || []) {
        const pid = o.product_id;
        if (!productSales[pid]) productSales[pid] = { count: 0, revenue: 0 };
        productSales[pid].count++;
        productSales[pid].revenue += o.amount_cents || 0;
    }

    const topProducts = (products || [])
        .map((p) => ({
            id: p.id,
            title: p.title,
            slug: p.slug,
            type: p.type,
            status: p.status,
            priceCents: p.price_cents,
            salesCount: productSales[p.id]?.count || 0,
            revenueCents: productSales[p.id]?.revenue || 0,
        }))
        .sort((a, b) => b.revenueCents - a.revenueCents)
        .slice(0, 10);

    // Page views (if table exists)
    let totalViews = 0;
    try {
        const { count } = await supabase
            .from('page_views')
            .select('*', { count: 'exact', head: true })
            .eq('creator_id', creator.id);
        totalViews = count || 0;
    } catch {
        // page_views table may not exist yet
    }

    return NextResponse.json({
        totalRevenueCents,
        purchaseCount,
        totalViews,
        monthlyRevenue,
        topProducts,
        productCount: (products || []).length,
    });
}
