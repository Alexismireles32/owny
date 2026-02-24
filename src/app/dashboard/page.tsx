import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function DashboardPage() {
    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect('/sign-in');
    }

    const { data: creator } = await supabase
        .from('creators')
        .select('id, display_name, handle')
        .eq('profile_id', user.id)
        .single();

    // Fetch real stats
    const creatorId = creator?.id;

    // Products count
    const { count: productCount } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('creator_id', creatorId || '');

    // Revenue total
    const { data: orders } = await supabase
        .from('orders')
        .select('amount_cents, product_id')
        .eq('status', 'paid')
        .in('product_id',
            creatorId
                ? (await supabase.from('products').select('id').eq('creator_id', creatorId)).data?.map(p => p.id) || []
                : []
        );

    const totalRevenueCents = orders?.reduce((sum, o) => sum + (o.amount_cents || 0), 0) || 0;
    const purchaseCount = orders?.length || 0;

    // Videos imported
    const { count: videoCount } = await supabase
        .from('videos')
        .select('*', { count: 'exact', head: true })
        .eq('creator_id', creatorId || '');

    // Page views
    const { count: viewCount } = await supabase
        .from('page_views')
        .select('*', { count: 'exact', head: true })
        .eq('creator_id', creatorId || '');

    const formatCurrency = (cents: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'usd',
        }).format(cents / 100);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
            <header className="border-b bg-white/80 backdrop-blur-sm">
                <div className="container mx-auto flex h-16 items-center justify-between px-4">
                    <h1 className="text-xl font-bold">
                        <span className="text-primary">Owny</span>
                    </h1>
                    <div className="flex items-center gap-4">
                        <Link href="/analytics" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                            Analytics
                        </Link>
                        <span className="text-sm text-muted-foreground">
                            {creator?.display_name || user.email}
                        </span>
                        <form action="/api/auth/signout" method="POST">
                            <button
                                type="submit"
                                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                            >
                                Sign Out
                            </button>
                        </form>
                    </div>
                </div>
            </header>

            <main className="container mx-auto px-4 py-12">
                <div className="mb-8">
                    <h2 className="text-3xl font-bold">
                        Welcome, {creator?.display_name || 'Creator'} 👋
                    </h2>
                    <p className="text-muted-foreground mt-1">
                        {creator?.handle ? `owny.store/c/${creator.handle}` : 'Your creator dashboard'}
                    </p>
                </div>

                <div className="grid gap-6 md:grid-cols-4">
                    <div className="rounded-xl border bg-white p-6">
                        <h3 className="font-semibold text-lg">Products</h3>
                        <p className="text-3xl font-bold mt-2">{productCount || 0}</p>
                        <p className="text-sm text-muted-foreground mt-1">
                            {productCount ? (
                                <Link href="/products" className="hover:underline">View all →</Link>
                            ) : (
                                'No products yet'
                            )}
                        </p>
                    </div>

                    <div className="rounded-xl border bg-white p-6">
                        <h3 className="font-semibold text-lg">Revenue</h3>
                        <p className="text-3xl font-bold mt-2">{formatCurrency(totalRevenueCents)}</p>
                        <p className="text-sm text-muted-foreground mt-1">
                            {purchaseCount} {purchaseCount === 1 ? 'sale' : 'sales'}
                        </p>
                    </div>

                    <div className="rounded-xl border bg-white p-6">
                        <h3 className="font-semibold text-lg">Videos</h3>
                        <p className="text-3xl font-bold mt-2">{videoCount || 0}</p>
                        <p className="text-sm text-muted-foreground mt-1">
                            {videoCount ? 'Imported' : (
                                <Link href="/import" className="hover:underline">Import now →</Link>
                            )}
                        </p>
                    </div>

                    <div className="rounded-xl border bg-white p-6">
                        <h3 className="font-semibold text-lg">Page Views</h3>
                        <p className="text-3xl font-bold mt-2">{viewCount || 0}</p>
                        <p className="text-sm text-muted-foreground mt-1">
                            {viewCount ? (
                                <Link href="/analytics" className="hover:underline">View analytics →</Link>
                            ) : (
                                'No views yet'
                            )}
                        </p>
                    </div>
                </div>

                {/* Quick actions */}
                <div className="mt-8 grid gap-4 md:grid-cols-3">
                    <Link href="/import" className="rounded-xl border bg-white p-5 hover:shadow-md transition-shadow">
                        <h3 className="font-semibold">Import Videos</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                            Import from TikTok, CSV, or add manually
                        </p>
                    </Link>
                    <Link href="/products/new" className="rounded-xl border bg-white p-5 hover:shadow-md transition-shadow">
                        <h3 className="font-semibold">Create Product</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                            Turn your videos into a digital product
                        </p>
                    </Link>
                    <Link href="/connect-stripe" className="rounded-xl border bg-white p-5 hover:shadow-md transition-shadow">
                        <h3 className="font-semibold">Stripe Setup</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                            Connect Stripe to start receiving payments
                        </p>
                    </Link>
                </div>
            </main>
        </div>
    );
}
