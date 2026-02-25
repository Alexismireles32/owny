// src/proxy.ts
// Supabase auth session refresh + role-based route protection

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Routes that don't require authentication
const PUBLIC_ROUTES = [
    '/sign-in',
    '/sign-up',
    '/auth/callback',
    '/legal',
    '/sandbox',
];

// Route prefixes that are public (dynamic segments)
const PUBLIC_PREFIXES = [
    '/c/',    // Creator hub: /c/[handle]
    '/p/',    // Product page: /p/[slug]
];

// Routes that require creator role
const CREATOR_ROUTES = [
    '/dashboard',
    '/import',
    '/products',
    '/connect-stripe',
    '/analytics',
];

// Routes that require admin role
const ADMIN_ROUTES = [
    '/admin',
];

function isPublicRoute(pathname: string): boolean {
    if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) return true;
    if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true;
    if (pathname === '/') return true;
    return false;
}

function isCreatorRoute(pathname: string): boolean {
    return CREATOR_ROUTES.some((route) => pathname.startsWith(route));
}

function isAdminRoute(pathname: string): boolean {
    return ADMIN_ROUTES.some((route) => pathname.startsWith(route));
}

export async function proxy(request: NextRequest) {
    let supabaseResponse = NextResponse.next({
        request,
    });

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) =>
                        request.cookies.set(name, value)
                    );
                    supabaseResponse = NextResponse.next({
                        request,
                    });
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    );
                },
            },
        }
    );

    // IMPORTANT: Do not remove this line.
    // Refreshing the auth token is critical for server-side rendering.
    const {
        data: { user },
    } = await supabase.auth.getUser();

    const pathname = request.nextUrl.pathname;

    // Public routes — no auth needed
    if (isPublicRoute(pathname)) {
        // If authenticated user hits sign-in/sign-up, redirect to dashboard
        if (user && (pathname === '/sign-in' || pathname === '/sign-up')) {
            const url = request.nextUrl.clone();
            url.pathname = '/dashboard';
            return NextResponse.redirect(url);
        }
        return supabaseResponse;
    }

    // API routes — let them handle their own auth
    if (pathname.startsWith('/api/')) {
        return supabaseResponse;
    }

    // Protected routes — require authentication
    if (!user) {
        const url = request.nextUrl.clone();
        url.pathname = '/sign-in';
        url.searchParams.set('next', pathname);
        return NextResponse.redirect(url);
    }

    // Onboard route — always accessible to authenticated users
    if (pathname === '/onboard') {
        return supabaseResponse;
    }

    // For creator/admin routes, check role
    if (isCreatorRoute(pathname) || isAdminRoute(pathname)) {
        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single();

        if (!profile) {
            // Profile not found — shouldn't happen, redirect to sign-in
            const url = request.nextUrl.clone();
            url.pathname = '/sign-in';
            return NextResponse.redirect(url);
        }

        // Admin route check
        if (isAdminRoute(pathname) && profile.role !== 'admin') {
            const url = request.nextUrl.clone();
            url.pathname = '/dashboard';
            return NextResponse.redirect(url);
        }

        // Creator route check
        if (isCreatorRoute(pathname) && profile.role !== 'creator' && profile.role !== 'admin') {
            const url = request.nextUrl.clone();
            url.pathname = '/onboard';
            return NextResponse.redirect(url);
        }
    }

    return supabaseResponse;
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - public assets
         */
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
};
