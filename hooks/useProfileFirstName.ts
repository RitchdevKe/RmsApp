import { useProfileDisplay } from './useProfileDisplay';

type UseProfileFirstNameOptions = {
    /** When profile first_name is empty or looks like email, use first word of this */
    nameFallback?: string | null;
};

export function useProfileFirstName(options?: UseProfileFirstNameOptions) {
    const { displayName, loading } = useProfileDisplay(options);
    
    // displayName already does the exact fallback logic for us. 
    // We can just return it, though 'User' is its default.
    return { firstName: displayName === 'User' ? null : displayName, loading };
}
