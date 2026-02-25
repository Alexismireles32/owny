import { createClient, createAdminClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function AdminProductsPage() {
    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect('/sign-in');

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    if (profile?.role !== 'admin') redirect('/dashboard');

    // Data queries use admin client (bypasses RLS)
    const adminSupabase = createAdminClient();

    // Fetch all products with creator info
    const { data: products } = await adminSupabase
        .from('products')
        .select(`
            id, title, slug, type, status, price_cents, currency, created_at, published_at,
            creators!inner(handle, display_name)
        `)
        .order('created_at', { ascending: false })
        .limit(200);

    // Check for active takedowns
    const { data: takedowns } = await adminSupabase
        .from('takedowns')
        .select('product_id, reason')
        .eq('status', 'active');

    const takedownMap = new Map<string, string>();
    for (const td of takedowns || []) {
        takedownMap.set(td.product_id, td.reason);
    }

    const formatPrice = (cents: number | null, currency: string) => {
        if (!cents) return 'Free';
        return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
    };

    const statusColor = (status: string) => {
        switch (status) {
            case 'published': return 'bg-green-50 text-green-700';
            case 'draft': return 'bg-slate-100 text-slate-600';
            case 'archived': return 'bg-red-50 text-red-700';
            default: return 'bg-slate-100 text-slate-600';
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
            <header className="border-b bg-white/80 backdrop-blur-sm">
                <div className="container mx-auto flex h-16 items-center justify-between px-4">
                    <div className="flex items-center gap-4">
                        <h1 className="text-xl font-bold">
                            <span className="text-primary">Owny</span>
                            <span className="text-muted-foreground ml-2 text-sm font-normal">Admin</span>
                        </h1>
                        <nav className="hidden sm:flex items-center gap-3 text-sm">
                            <Link href="/admin/creators" className="text-muted-foreground hover:text-foreground transition-colors">Creators</Link>
                            <Link href="/admin/products" className="font-medium text-primary">Products</Link>
                            <Link href="/admin/jobs" className="text-muted-foreground hover:text-foreground transition-colors">Jobs</Link>
                        </nav>
                    </div>
                    <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                        ← Dashboard
                    </Link>
                </div>
            </header>

            <main className="container mx-auto px-4 py-8">
                <div className="mb-6">
                    <h2 className="text-2xl font-bold">Products ({products?.length || 0})</h2>
                </div>

                <div className="overflow-x-auto rounded-xl border bg-white">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b bg-slate-50">
                                <th className="text-left px-4 py-3 font-medium">Product</th>
                                <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Creator</th>
                                <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Type</th>
                                <th className="text-left px-4 py-3 font-medium">Status</th>
                                <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Price</th>
                                <th className="text-left px-4 py-3 font-medium">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(products || []).map((product) => {
                                const creator = product.creators as unknown as { handle: string; display_name: string };
                                const isTakenDown = takedownMap.has(product.id);
                                const takedownReason = takedownMap.get(product.id);

                                return (
                                    <tr key={product.id} className="border-b last:border-0 hover:bg-slate-50/50">
                                        <td className="px-4 py-3">
                                            <div>
                                                <span className="font-medium">{product.title}</span>
                                                <p className="text-xs text-muted-foreground mt-0.5">/{product.slug}</p>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                                            @{creator?.handle}
                                        </td>
                                        <td className="px-4 py-3 hidden md:table-cell">
                                            <span className="text-xs">{product.type.replace('_', ' ')}</span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(product.status)}`}>
                                                {product.status}
                                            </span>
                                            {isTakenDown && (
                                                <p className="text-xs text-red-500 mt-1">Takedown: {takedownReason}</p>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 hidden md:table-cell">
                                            {formatPrice(product.price_cents, product.currency || 'usd')}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex gap-2">
                                                {product.status === 'published' && !isTakenDown ? (
                                                    <TakedownButton productId={product.id} />
                                                ) : product.status === 'archived' ? (
                                                    <RestoreButton productId={product.id} />
                                                ) : null}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {(!products || products.length === 0) && (
                                <tr>
                                    <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                                        No products yet.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </main>
        </div>
    );
}

function TakedownButton({ productId }: { productId: string }) {
    return (
        <form action="/api/admin/takedown" method="POST">
            <input type="hidden" name="action" value="takedown" />
            <input type="hidden" name="productId" value={productId} />
            <input type="hidden" name="reason" value="Admin takedown" />
            <button type="submit" className="text-xs text-red-600 hover:text-red-800 font-medium">
                Takedown
            </button>
        </form>
    );
}

function RestoreButton({ productId }: { productId: string }) {
    return (
        <form action="/api/admin/takedown" method="POST">
            <input type="hidden" name="action" value="lift" />
            <input type="hidden" name="productId" value={productId} />
            <button type="submit" className="text-xs text-green-600 hover:text-green-800 font-medium">
                Restore
            </button>
        </form>
    );
}
