/* eslint-disable @next/next/no-img-element */
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { getDashboardContext } from '../_lib/get-dashboard-context';

function initialsFromName(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'U';
    if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
    return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

export default async function DashboardAccountPage() {
    const { user, creator } = await getDashboardContext();
    const initials = initialsFromName(creator.display_name);

    return (
        <div className="h-full min-h-0 overflow-y-auto p-4 sm:p-6">
            <Card className="mx-auto w-full max-w-2xl border-slate-200 py-0 shadow-none">
                <CardContent className="space-y-6 px-5 py-6 sm:px-8">
                    <div className="flex items-center gap-4">
                        {creator.avatar_url ? (
                            <img
                                src={creator.avatar_url}
                                alt={creator.display_name}
                                className="h-16 w-16 rounded-full border border-slate-200 object-cover"
                                referrerPolicy="no-referrer"
                            />
                        ) : (
                            <div className="inline-flex h-16 w-16 items-center justify-center rounded-full border border-slate-300 bg-slate-100 text-base font-semibold text-slate-700">
                                {initials}
                            </div>
                        )}

                        <div>
                            <h1 className="text-xl font-semibold tracking-tight text-slate-900">{creator.display_name}</h1>
                            <p className="mt-1 text-sm text-slate-500">@{creator.handle}</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Email</p>
                            <p className="mt-1 text-sm text-slate-900">{user.email || 'No email found'}</p>
                        </div>
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Storefront</p>
                            <a
                                href={`/c/${creator.handle}`}
                                className="mt-1 inline-block text-sm text-slate-900 underline underline-offset-4 hover:text-slate-600"
                            >
                                owny.store/c/{creator.handle}
                            </a>
                        </div>
                    </div>

                    <form action="/api/auth/signout" method="POST" className="pt-2">
                        <Button type="submit" variant="outline">
                            Sign out
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
