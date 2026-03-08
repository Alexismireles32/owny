// /checkout-success — Post-checkout success page
// PRD M6: Shows purchase confirmation

import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { SimulatedCheckoutCompleter } from './simulated-checkout-completer';

interface Props {
    searchParams: Promise<{ session_id?: string; simulate?: string }>;
}

export default async function CheckoutSuccessPage({ searchParams }: Props) {
    const { session_id, simulate } = await searchParams;
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    let product: { id: string; title: string; slug: string; type: string } | null = null;
    let orderStatus: string | null = null;
    let entitlementReady = false;
    let requiresSignInToAccess = false;
    const hasSessionId = typeof session_id === 'string' && session_id.length > 0;
    const shouldSimulateCompletion = simulate === '1';
    const refreshHref = hasSessionId
        ? `/checkout-success?session_id=${encodeURIComponent(session_id)}${shouldSimulateCompletion ? '&simulate=1' : ''}`
        : '/library';

    if (hasSessionId) {
        // Look up the order from session ID
        const { data: order } = await supabase
            .from('orders')
            .select('product_id, status, buyer_profile_id, products(id, title, slug, type)')
            .eq('stripe_checkout_session_id', session_id)
            .maybeSingle();

        if (order?.products) {
            product = order.products as unknown as { id: string; title: string; slug: string; type: string };
            orderStatus = order.status as string;
            requiresSignInToAccess = Boolean(order.buyer_profile_id) && !user;
        }

        if (user && product) {
            const { data: entitlement } = await supabase
                .from('entitlements')
                .select('id')
                .eq('buyer_profile_id', user.id)
                .eq('product_id', product.id)
                .eq('status', 'active')
                .maybeSingle();
            entitlementReady = Boolean(entitlement);
        }
    }

    const viewState = (() => {
        if (product && entitlementReady) return 'complete';
        if (product && requiresSignInToAccess) return 'sign_in';
        if (!user && hasSessionId) return 'auth_required';
        if (product && hasSessionId) return 'processing';
        return 'fallback';
    })();

    const title = viewState === 'complete'
        ? 'Purchase Complete!'
        : viewState === 'sign_in'
            ? 'Sign In To Access'
            : viewState === 'auth_required'
                ? 'Sign In To Verify'
            : viewState === 'processing'
                ? 'Finalizing Access'
                : 'Checkout Status';

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
            <Card className="max-w-md w-full text-center">
                <CardHeader>
                    <div className="text-5xl mb-3">🎉</div>
                    <h1 className="text-2xl font-semibold leading-none tracking-tight">{title}</h1>
                </CardHeader>
                <CardContent className="space-y-4">
                    {viewState === 'complete' && product ? (
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
                    ) : viewState === 'sign_in' && product ? (
                        <>
                            <p className="text-muted-foreground">
                                Your order is ready for <strong>{product.title}</strong>, but you need to sign in to open it in your library.
                            </p>
                            <div className="flex flex-col gap-2">
                                <Link href={`/sign-in?next=${encodeURIComponent(`/library/${product.slug}`)}`}>
                                    <Button className="w-full">Sign In To Continue</Button>
                                </Link>
                                <Link href={`/p/${product.slug}`}>
                                    <Button variant="outline" className="w-full">Back to Product</Button>
                                </Link>
                            </div>
                        </>
                    ) : viewState === 'processing' && product ? (
                        <>
                            <p className="text-muted-foreground">
                                We&apos;re still finalizing your access to <strong>{product.title}</strong>{orderStatus ? ` (${orderStatus})` : ''}. This usually completes within a few seconds after Stripe redirects back.
                            </p>
                            {shouldSimulateCompletion && session_id && (
                                <SimulatedCheckoutCompleter sessionId={session_id} />
                            )}
                            <div className="flex flex-col gap-2">
                                <Link href={refreshHref}>
                                    <Button className="w-full">Refresh Status</Button>
                                </Link>
                                <Link href="/library">
                                    <Button variant="outline" className="w-full">
                                        Go to My Library
                                    </Button>
                                </Link>
                            </div>
                        </>
                    ) : viewState === 'auth_required' ? (
                        <>
                            <p className="text-muted-foreground">
                                Sign back in to verify this Stripe redirect and reopen your library access.
                            </p>
                            <div className="flex flex-col gap-2">
                                <Link href={`/sign-in?next=${encodeURIComponent(refreshHref)}`}>
                                    <Button className="w-full">Sign In To Verify</Button>
                                </Link>
                                <Link href="/">
                                    <Button variant="outline" className="w-full">Go Home</Button>
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
