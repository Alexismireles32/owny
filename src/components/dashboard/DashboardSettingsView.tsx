/* eslint-disable @next/next/no-img-element */
'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface DashboardSettingsViewProps {
    creatorId: string;
    handle: string;
    displayName: string;
    email: string;
    avatarUrl: string | null;
    stripeConnectStatus: string;
}

function initialsFromName(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'U';
    if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
    return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

export function DashboardSettingsView({
    handle,
    displayName,
    email,
    avatarUrl,
    stripeConnectStatus,
}: DashboardSettingsViewProps) {
    const initials = initialsFromName(displayName);
    const isStripeConnected = stripeConnectStatus === 'connected';

    return (
        <div className="h-full min-h-0 overflow-y-auto p-4 sm:p-6">
            <div className="mx-auto w-full max-w-2xl space-y-6">
                <div>
                    <h1 className="text-xl font-semibold tracking-tight text-slate-900">Settings</h1>
                    <p className="mt-1 text-sm text-slate-500">Manage your account and payment settings.</p>
                </div>

                {/* Profile */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm">Profile</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center gap-4">
                            {avatarUrl ? (
                                <img
                                    src={avatarUrl}
                                    alt={displayName}
                                    className="h-16 w-16 rounded-full border border-slate-200 object-cover"
                                    referrerPolicy="no-referrer"
                                />
                            ) : (
                                <div className="inline-flex h-16 w-16 items-center justify-center rounded-full border border-slate-300 bg-slate-100 text-base font-semibold text-slate-700">
                                    {initials}
                                </div>
                            )}
                            <div>
                                <h2 className="text-lg font-semibold text-slate-900">{displayName}</h2>
                                <p className="text-sm text-slate-500">@{handle}</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Email</p>
                                <p className="mt-1 text-sm text-slate-900">{email || 'No email found'}</p>
                            </div>
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Storefront</p>
                                <a
                                    href={`/c/${handle}`}
                                    className="mt-1 inline-block text-sm text-slate-900 underline underline-offset-4 hover:text-slate-600"
                                >
                                    owny.store/c/{handle}
                                </a>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Payments */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm">Payments</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-slate-900">Stripe Connect</p>
                                <p className="text-xs text-slate-500">Receive payouts from product sales</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <Badge variant={isStripeConnected ? 'default' : 'secondary'}>
                                    {isStripeConnected ? 'Connected' : stripeConnectStatus || 'Not connected'}
                                </Badge>
                                {!isStripeConnected && (
                                    <Button asChild size="sm" variant="outline">
                                        <a href="/connect-stripe">Connect</a>
                                    </Button>
                                )}
                            </div>
                        </div>
                        {isStripeConnected && (
                            <p className="text-xs text-slate-500">
                                Owny takes a 10% platform fee on each sale. The rest goes directly to your Stripe account.
                            </p>
                        )}
                    </CardContent>
                </Card>

                {/* Sign Out */}
                <form action="/api/auth/signout" method="POST">
                    <Button type="submit" variant="outline" className="w-full">
                        Sign Out
                    </Button>
                </form>
            </div>
        </div>
    );
}
