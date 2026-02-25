// /checkout-success — Post-checkout success page
// PRD M6: Shows purchase confirmation

import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Props {
    searchParams: Promise<{ session_id?: string }>;
}

export default async function CheckoutSuccessPage({ searchParams }: Props) {
    const { session_id } = await searchParams;
    const supabase = await createClient();

    let product: { title: string; slug: string; type: string } | null = null;
    const hasSessionId = typeof session_id === 'string' && session_id.length > 0;

    if (hasSessionId) {
        // Look up the order from session ID
        const { data: order } = await supabase
            .from('orders')
            .select('product_id, status, products(title, slug, type)')
            .eq('stripe_checkout_session_id', session_id)
            .single();

        if (order?.products) {
            product = order.products as unknown as { title: string; slug: string; type: string };
        }
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
            <Card className="max-w-md w-full text-center">
                <CardHeader>
                    <div className="text-5xl mb-3">🎉</div>
                    <CardTitle className="text-2xl">
                        {product ? 'Purchase Complete!' : 'Checkout Status'}
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {product ? (
                        <>
                            <p className="text-muted-foreground">
                                You now have access to <strong>{product.title}</strong>.
                            </p>
                            <div className="flex flex-col gap-2">
                                <Link href={`/p/${product.slug}`}>
                                    <Button className="w-full">View Product</Button>
                                </Link>
                                <Link href="/library">
                                    <Button variant="outline" className="w-full">
                                        Go to My Library
                                    </Button>
                                </Link>
                            </div>
                        </>
                    ) : (
                        <>
                            <p className="text-muted-foreground">
                                {hasSessionId
                                    ? 'We could not verify this checkout session yet. Please check your email or library in a moment.'
                                    : 'Checkout sessions are verified from Stripe redirects only.'}
                            </p>
                            <div className="flex flex-col gap-2">
                                <Link href="/library">
                                    <Button className="w-full">Go to My Library</Button>
                                </Link>
                                <Link href="/">
                                    <Button variant="outline" className="w-full">Go Home</Button>
                                </Link>
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
