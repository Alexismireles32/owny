import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export interface DashboardContext {
    user: {
        id: string;
        email: string | null;
    };
    creator: {
        id: string;
        display_name: string;
        handle: string;
        avatar_url: string | null;
        stripe_connect_status: string | null;
    };
}

export const getDashboardContext = cache(async (): Promise<DashboardContext> => {
    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect('/sign-in');
    }

    const { data: creator } = await supabase
        .from('creators')
        .select('id, display_name, handle, avatar_url, stripe_connect_status')
        .eq('profile_id', user.id)
        .single();

    if (!creator) {
        redirect('/');
    }

    return {
        user: {
            id: user.id,
            email: user.email ?? null,
        },
        creator: {
            id: creator.id,
            display_name: creator.display_name,
            handle: creator.handle,
            avatar_url: creator.avatar_url,
            stripe_connect_status: creator.stripe_connect_status,
        },
    };
});
