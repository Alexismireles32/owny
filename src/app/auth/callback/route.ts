import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get('code');
    const next = searchParams.get('next') ?? '/dashboard';

    if (code) {
        const supabase = await createClient();
        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (!error) {
            // Check if user has a creator profile to decide redirect
            const {
                data: { user },
            } = await supabase.auth.getUser();

            if (user) {
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
            const forwardedHost = request.headers.get('x-forwarded-host');
            const isLocalEnv = process.env.NODE_ENV === 'development';

            if (isLocalEnv) {
                return NextResponse.redirect(`${origin}${next}`);
            } else if (forwardedHost) {
                return NextResponse.redirect(`https://${forwardedHost}${next}`);
            } else {
                return NextResponse.redirect(`${origin}${next}`);
            }
        }
    }

    // Auth code error — redirect to sign-in with error
    return NextResponse.redirect(`${origin}/sign-in?error=auth_callback_error`);
}
