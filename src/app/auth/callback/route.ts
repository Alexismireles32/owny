import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

function sanitizeNextPath(next: string | null): string {
    if (!next || !next.startsWith('/')) return '/dashboard';
    return next;
}

function buildRedirectUrl(request: Request, origin: string, next: string): string {
    const forwardedHost = request.headers.get('x-forwarded-host');
    const isLocalEnv = process.env.NODE_ENV === 'development';

    if (isLocalEnv) {
        return `${origin}${next}`;
    }
    if (forwardedHost) {
        return `https://${forwardedHost}${next}`;
    }
    return `${origin}${next}`;
}

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get('code');
    const rawNext = searchParams.get('next');
    const next = sanitizeNextPath(rawNext);
    const hasExplicitNext = rawNext !== null;

    if (code) {
        const supabase = await createClient();
        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (!error) {
            // Check if user has a creator profile to decide redirect
            const {
                data: { user },
            } = await supabase.auth.getUser();

            if (user) {
                // If the caller explicitly asked for a path, honor it after auth.
                if (hasExplicitNext) {
                    return NextResponse.redirect(buildRedirectUrl(request, origin, next));
                }

                const { data: profile } = await supabase
                    .from('profiles')
                    .select('role')
                    .eq('id', user.id)
                    .single();

                if (profile?.role === 'creator') {
                    return NextResponse.redirect(`${origin}/dashboard`);
                }

                // Check if they have a creator record (in case role wasn't updated yet)
                const { data: creator } = await supabase
                    .from('creators')
                    .select('id')
                    .eq('profile_id', user.id)
                    .single();

                if (creator) {
                    return NextResponse.redirect(`${origin}/dashboard`);
                }
            }

            // Default: redirect to next param or dashboard
            return NextResponse.redirect(buildRedirectUrl(request, origin, next));
        }
    }

    // Auth code error — redirect to sign-in with error
    return NextResponse.redirect(`${origin}/sign-in?error=auth_callback_error`);
}
