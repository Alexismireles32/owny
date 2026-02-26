'use client';

import {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useState,
    useCallback,
    type ReactNode,
} from 'react';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import type { Profile, Creator } from '@/types/database';

interface AuthState {
    user: User | null;
    profile: Profile | null;
    creator: Creator | null;
    isLoading: boolean;
    isCreator: boolean;
    isAdmin: boolean;
    refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
    user: null,
    profile: null,
    creator: null,
    isLoading: true,
    isCreator: false,
    isAdmin: false,
    refreshProfile: async () => { },
});

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [creator, setCreator] = useState<Creator | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const supabase = useMemo(() => createClient(), []);

    const fetchProfile = useCallback(
        async (userId: string) => {
            const { data: profileData } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single();

            if (profileData) {
                setProfile(profileData as Profile);

                // If creator, fetch creator record too
                if (profileData.role === 'creator') {
                    const { data: creatorData } = await supabase
                        .from('creators')
                        .select('*')
                        .eq('profile_id', userId)
                        .single();

                    setCreator(creatorData as Creator | null);
                } else {
                    setCreator(null);
                }
            }
        },
        [supabase]
    );

    const refreshProfile = useCallback(async () => {
        if (user) {
            await fetchProfile(user.id);
        }
    }, [user, fetchProfile]);

    useEffect(() => {
        // Get initial session
        const getInitialSession = async () => {
            const {
                data: { user: initialUser },
            } = await supabase.auth.getUser();

            if (initialUser) {
                setUser(initialUser);
                await fetchProfile(initialUser.id);
            }
            setIsLoading(false);
        };

        getInitialSession();

        // Listen for auth state changes
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (session?.user) {
                setUser(session.user);
                await fetchProfile(session.user.id);
            } else {
                setUser(null);
                setProfile(null);
                setCreator(null);
            }
            setIsLoading(false);
        });

        return () => {
            subscription.unsubscribe();
        };
    }, [supabase, fetchProfile]);

    return (
        <AuthContext.Provider
            value={{
                user,
                profile,
                creator,
                isLoading,
                isCreator: profile?.role === 'creator',
                isAdmin: profile?.role === 'admin',
                refreshProfile,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
