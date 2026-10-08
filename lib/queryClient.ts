import { QueryClient } from '@tanstack/react-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false, // Prevent aggressive refetching on pane focus/interaction
      refetchOnReconnect: true,
      retry: 1,
    },
  },
});

// Persist the React Query cache to localStorage so the app renders with
// last session's data immediately on next load — eliminates the blank/empty
// state while load_all_app_state RPC is in flight.
export const localStoragePersister = createSyncStoragePersister({
  storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  key: 'taskme-query-cache',
  // Throttle writes to avoid hammering localStorage on every mutation
  throttleTime: 2000,
});

