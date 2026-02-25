import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';

export default async function AdminCreatorsPage() {
    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect('/sign-in');

    // Verify admin role
    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    if (profile?.role !== 'admin') redirect('/dashboard');

    // Data queries use admin client (bypasses RLS — admin needs to see ALL creators/products)
    const adminSupabase = createAdminClient();

    // Fetch all creators
    const { data: creators } = await adminSupabase
        .from('creators')
        .select('id, handle, display_name, bio, avatar_url, stripe_connect_status, created_at, profile_id')
        .order('created_at', { ascending: false });

    // Fetch product counts per creator
    const { data: products } = await adminSupabase
        .from('products')
        .select('creator_id, status');

    const productCounts = new Map<string, { total: number; published: number }>();
    for (const p of products || []) {
        const existing = productCounts.get(p.creator_id) || { total: 0, published: 0 };
        existing.total++;
        if (p.status === 'published') existing.published++;
        productCounts.set(p.creator_id, existing);
    }

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
                            <Link href="/admin/creators" className="font-medium text-primary">Creators</Link>
                            <Link href="/admin/products" className="text-muted-foreground hover:text-foreground transition-colors">Products</Link>
                            <Link href="/admin/jobs" className="text-muted-foreground hover:text-foreground transition-colors">Jobs</Link>
                        </nav>
                    </div>
                    <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                        ← Dashboard
                    </Link>
                </div>
            </header>

            <main className="container mx-auto px-4 py-8">
                <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <h2 className="text-2xl font-bold">Creators ({creators?.length || 0})</h2>
                </div>

                <div className="overflow-x-auto rounded-xl border bg-white">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b bg-slate-50">
                                <th className="text-left px-4 py-3 font-medium">Creator</th>
                                <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Handle</th>
                                <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Stripe</th>
                                <th className="text-left px-4 py-3 font-medium">Products</th>
                                <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Joined</th>
                                <th className="text-left px-4 py-3 font-medium">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(creators || []).map((creator) => {
                                const counts = productCounts.get(creator.id) || { total: 0, published: 0 };
                                return (
                                    <tr key={creator.id} className="border-b last:border-0 hover:bg-slate-50/50">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                {creator.avatar_url ? (
                                                    <Image src={creator.avatar_url} alt="" width={32} height={32} className="w-8 h-8 rounded-full" />
                                                ) : (
                                                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                                                        {creator.display_name?.[0]?.toUpperCase() || '?'}
                                                    </div>
                                                )}
                                                <span className="font-medium">{creator.display_name}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                                            @{creator.handle}
                                        </td>
                                        <td className="px-4 py-3 hidden md:table-cell">
                                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${creator.stripe_connect_status === 'connected'
                                                ? 'bg-green-50 text-green-700'
                                                : creator.stripe_connect_status === 'pending'
                                                    ? 'bg-yellow-50 text-yellow-700'
                                                    : 'bg-slate-100 text-slate-600'
                                                }`}>
                                                {creator.stripe_connect_status || 'unconnected'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="font-medium">{counts.total}</span>
                                            <span className="text-muted-foreground"> ({counts.published} live)</span>
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground text-xs hidden md:table-cell">
                                            {new Date(creator.created_at).toLocaleDateString()}
                                        </td>
                                        <td className="px-4 py-3">
                                            <form action={`/api/admin/creators`} method="POST">
                                                <input type="hidden" name="action" value="takedown" />
                                                <input type="hidden" name="creatorId" value={creator.id} />
                                                <button
                                                    type="submit"
                                                    className="text-xs text-red-600 hover:text-red-800 font-medium"
                                                >
                                                    Takedown All
                                                </button>
                                            </form>
                                        </td>
                                    </tr>
                                );
                            })}
                            {(!creators || creators.length === 0) && (
                                <tr>
                                    <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                                        No creators yet.
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
