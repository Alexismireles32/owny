'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const BOTTOM_NAV_ITEMS = [
    { href: '/dashboard', label: 'Build', icon: '✦' },
    { href: '/dashboard/storefront', label: 'Store', icon: '◇' },
    { href: '/dashboard/analytics', label: 'Analytics', icon: '▤' },
    { href: '/dashboard/orders', label: 'Orders', icon: '◫' },
    { href: '/dashboard/settings', label: 'Settings', icon: '⚙' },
];

export function MobileBottomNav() {
    const pathname = usePathname();

    return (
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur-sm sm:hidden">
            <div className="flex items-center justify-around px-1 py-1">
                {BOTTOM_NAV_ITEMS.map((item) => {
                    const active = item.href === '/dashboard'
                        ? pathname === '/dashboard'
                        : pathname.startsWith(item.href);
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                'flex flex-1 flex-col items-center gap-0.5 rounded-lg py-2 text-[10px] font-medium transition-colors',
                                active
                                    ? 'text-slate-900'
                                    : 'text-slate-400 active:text-slate-600'
                            )}
                        >
                            <span className={cn(
                                'text-base leading-none',
                                active ? 'text-slate-900' : 'text-slate-400'
                            )}>{item.icon}</span>
                            <span>{item.label}</span>
                            {active && (
                                <span className="mt-0.5 h-0.5 w-4 rounded-full bg-slate-900" />
                            )}
                        </Link>
                    );
                })}
            </div>
            {/* Safe area for home indicator on iOS */}
            <div className="h-[env(safe-area-inset-bottom)]" />
        </nav>
    );
}
