import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { supabase } from '../utils/supabaseClient';

type ProfileRow = {
    first_name?: string | null;
    full_name?: string | null;
};

type UseProfileDisplayOptions = {
    /** When profile first_name/full_name is empty or looks like email, use first word of this as display name */
    nameFallback?: string | null;
};

export function useProfileDisplay(options?: UseProfileDisplayOptions) {
    const nameFallback = options?.nameFallback;
    const queryClient = useQueryClient();

    const { data, isLoading } = useQuery({
        queryKey: ['user_profile_display'],
        staleTime: 10 * 60 * 1000, // 10 minutes cache
        gcTime: 60 * 60 * 1000,   // Keep in cache for an hour
        queryFn: async () => {
            const { data: userRes, error: userErr } = await supabase.auth.getUser();
            if (userErr || !userRes.user) {
                return { profile: null, email: null, metaFirstName: null, metaFullName: null };
            }
            const user = userRes.user;
            const { data: prof } = await supabase
                .from('profiles')
                .select('first_name, full_name')
                .eq('id', user.id)
                .maybeSingle();

            const profileResult = (prof as ProfileRow) ?? null;

            // Clean, non-blocking lazy upsert of names if they are emails or empty
            try {
                const looksLikeEmail = (s: string) => s.includes('@');
                const pickFirstWord = (s: string) => s.trim().split(/\s+/).filter(Boolean)[0] || '';
                const emailLocal = (user.email ?? '').split('@')[0] || '';

                const profFirst = String(profileResult?.first_name ?? '').trim();
                const profFull = String(profileResult?.full_name ?? '').trim();
                const metaFirst = String(((user.user_metadata as any)?.first_name ?? '')).trim();
                const metaFull = String(((user.user_metadata as any)?.full_name ?? '')).trim();
                const fallback = String(nameFallback ?? '').trim();

                const candidateFull =
                    (profFull && !looksLikeEmail(profFull) ? profFull : '') ||
                    (metaFull && !looksLikeEmail(metaFull) ? metaFull : '') ||
                    (fallback && !looksLikeEmail(fallback) ? fallback : '') ||
                    (metaFirst && !looksLikeEmail(metaFirst) ? metaFirst : '') ||
                    (emailLocal ? emailLocal : '');

                const candidateFirst =
                    (profFirst && !looksLikeEmail(profFirst) ? profFirst : '') ||
                    (metaFirst && !looksLikeEmail(metaFirst) ? metaFirst : '') ||
                    pickFirstWord(candidateFull) ||
                    'User';

                const safeFirst = candidateFirst.trim() || 'User';
                const safeFull = (candidateFull && !looksLikeEmail(candidateFull) ? candidateFull : safeFirst).trim();

                const needUpsert =
                    !profFirst ||
                    looksLikeEmail(profFirst) ||
                    !profFull ||
                    looksLikeEmail(profFull);

                if (needUpsert && safeFirst && safeFirst !== 'User') {
                    await supabase.from('profiles').upsert(
                        { id: user.id, first_name: safeFirst, full_name: safeFull, email: user.email ?? null },
                        { onConflict: 'id' },
                    );
                }
            } catch (e) {
                // non-blocking
            }

            return {
                profile: profileResult,
                email: user.email ?? null,
                metaFirstName: ((user.user_metadata ?? {}).first_name ?? null) as string | null,
                metaFullName: ((user.user_metadata ?? {}).full_name ?? null) as string | null,
            };
        }
    });

    // Invalidate profile query on auth state change (like SIGNED_IN, USER_UPDATED)
    useEffect(() => {
        const { data: sub } = supabase.auth.onAuthStateChange((event) => {
            if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
                const cachedUser = localStorage.getItem('taskme_session_cache');
                if (!cachedUser || event === 'USER_UPDATED') {
                    queryClient.invalidateQueries({ queryKey: ['user_profile_display'] });
                }
            }
        });
        return () => {
            sub.subscription.unsubscribe();
        };
    }, [queryClient]);

    const resolved = data ?? { profile: null, email: null, metaFirstName: null, metaFullName: null };

    const displayName = useMemo(() => {
        if (isLoading) return 'Loading...';
        const first = (resolved.profile?.first_name ?? '').trim();
        const full = (resolved.profile?.full_name ?? '').trim();
        const looksLikeEmail = (s: string) => s.includes('@');
        const fromProfile = first || full;
        if (fromProfile && !looksLikeEmail(fromProfile)) return fromProfile.split(/\s+/)[0];
        const metaFirst = (resolved.metaFirstName ?? '').trim();
        const metaFull = (resolved.metaFullName ?? '').trim();
        const fromMeta = metaFirst || metaFull;
        if (fromMeta && !looksLikeEmail(fromMeta)) return fromMeta.split(/\s+/)[0];
        const fallbackFirst = nameFallback?.trim()?.split(/\s+/)[0];
        if (fallbackFirst && !looksLikeEmail(fallbackFirst)) return fallbackFirst;
        const local = (resolved.email ?? '').split('@')[0]?.trim();
        if (local) return local.split(/[._-]/)[0] || 'User';
        return 'User';
    }, [isLoading, resolved.profile?.first_name, resolved.profile?.full_name, resolved.metaFirstName, resolved.metaFullName, resolved.email, nameFallback]);

    const initial = useMemo(() => {
        const d = (displayName ?? '').trim();
        return (d ? d.charAt(0) : 'U').toUpperCase();
    }, [displayName]);

    return { loading: isLoading, profile: resolved.profile, email: resolved.email, displayName, initial };
}
