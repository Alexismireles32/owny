import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { PublicFooter } from '@/components/public-footer';

export default async function AccountPage() {
    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect('/sign-in');
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('role, created_at')
        .eq('id', user.id)
        .single();

    // Fetch active entitlements
    const { data: entitlements } = await supabase
        .from('entitlements')
        .select(`
            id, status, created_at,
            products(id, title, slug, type, access_type)
        `)
        .eq('buyer_profile_id', user.id)
        .eq('status', 'active');

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
            <header className="border-b bg-white/80 backdrop-blur-sm">
                <div className="container mx-auto flex h-16 items-center justify-between px-4">
                    <Link href="/library" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                        ← Back to Library
                    </Link>
                    <span className="text-xl font-bold text-primary">Owny</span>
                </div>
            </header>

            <main className="container mx-auto max-w-2xl px-4 py-12">
                <h1 className="text-3xl font-bold mb-8">My Account</h1>

                {/* Account Info */}
                <Card className="mb-6">
                    <CardHeader>
                        <CardTitle className="text-lg">Account Details</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div>
                            <p className="text-sm text-muted-foreground">Email</p>
                            <p className="font-medium">{user.email}</p>
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">Account Type</p>
                            <p className="font-medium capitalize">{profile?.role || 'buyer'}</p>
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">Member Since</p>
                            <p className="font-medium">
                                {profile?.created_at
                                    ? new Date(profile.created_at).toLocaleDateString('en-US', {
                                        year: 'numeric',
                                        month: 'long',
                                        day: 'numeric',
                                    })
                                    : '—'}
                            </p>
                        </div>
                    </CardContent>
                </Card>

                {/* Active Purchases */}
                <Card className="mb-6">
                    <CardHeader>
                        <CardTitle className="text-lg">Active Purchases</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {entitlements && entitlements.length > 0 ? (
                            <div className="space-y-3">
                                {entitlements.map((e) => {
                                    const product = e.products as unknown as {
                                        id: string;
                                        title: string;
                                        slug: string;
                                        type: string;
                                        access_type: string;
                                    } | null;
                                    return (
                                        <div key={e.id} className="flex items-center justify-between p-3 rounded-lg border">
                                            <div>
                                                <p className="font-medium">{product?.title || 'Unknown Product'}</p>
                                                <p className="text-xs text-muted-foreground capitalize">
                                                    {product?.type?.replace(/_/g, ' ') || ''}
                                                    {product?.access_type === 'subscription' && ' · Subscription'}
                                                </p>
                                            </div>
                                            <Link href={`/library/${product?.slug || ''}`}>
                                                <Button variant="outline" size="sm">View</Button>
                                            </Link>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <p className="text-muted-foreground text-sm">No active purchases yet.</p>
                        )}
                    </CardContent>
                </Card>

                <Separator className="my-6" />

                {/* Sign Out */}
                <form action="/api/auth/signout" method="POST">
                    <Button variant="outline" type="submit" className="w-full">
                        Sign Out
                    </Button>
                </form>
            </main>

            <PublicFooter />
        </div>
    );
}
