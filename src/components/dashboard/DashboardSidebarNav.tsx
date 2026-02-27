'use client';
/* eslint-disable @next/next/no-img-element */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

interface DashboardSidebarNavProps {
    displayName: string;
    handle: string;
    avatarUrl: string | null;
}

const NAV_ITEMS = [
    { href: '/dashboard', label: 'Build', short: 'B' },
    { href: '/dashboard/storefront', label: 'Storefront', short: 'S' },
];

function initialsFromName(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'U';
    if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
    return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

export function DashboardSidebarNav({ displayName, handle, avatarUrl }: DashboardSidebarNavProps) {
    const pathname = usePathname();
    const initials = initialsFromName(displayName);

    return (
        <aside className="w-16 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white sm:w-56">
            <div className="flex h-full min-h-0 flex-col p-2 sm:p-3">
                <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 sm:px-2">Studio</p>

                <nav className="mt-2 flex flex-1 flex-col gap-1">
                    {NAV_ITEMS.map((item) => {
                        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={cn(
                                    'flex h-10 items-center gap-2 rounded-md px-2 text-xs text-slate-600 transition-colors sm:px-3 sm:text-sm',
                                    active ? 'bg-slate-900 text-white' : 'hover:bg-slate-100 hover:text-slate-900'
                                )}
                            >
                                <span
                                    className={cn(
                                        'inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-semibold',
                                        active ? 'border-white/30 text-white' : 'border-slate-300 text-slate-500'
                                    )}
                                >
                                    {item.short}
                                </span>
                                <span className="hidden sm:inline">{item.label}</span>
                            </Link>
                        );
                    })}
                </nav>

                <Link
                    href="/dashboard/account"
                    className={cn(
                        'mt-2 flex h-11 items-center gap-2 rounded-md px-2 text-xs text-slate-600 transition-colors sm:px-3 sm:text-sm',
                        pathname === '/dashboard/account' || pathname.startsWith('/dashboard/account/')
                            ? 'bg-slate-900 text-white'
                            : 'hover:bg-slate-100 hover:text-slate-900'
                    )}
                >
                    {avatarUrl ? (
                        <img
                            src={avatarUrl}
                            alt={displayName}
                            className="h-6 w-6 rounded-full border border-slate-200 object-cover"
                            referrerPolicy="no-referrer"
                        />
                    ) : (
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 bg-slate-100 text-[10px] font-semibold text-slate-700">
                            {initials}
                        </span>
                    )}
                    <span className="hidden truncate sm:inline">@{handle}</span>
                </Link>
            </div>
        </aside>
    );
}
