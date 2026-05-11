import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 30s — most pages are read-mostly and the user can manually refetch
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: (failureCount, err) => {
        // Don't retry network unavailability — fall back to synthetic immediately
        if (err instanceof Error && err.name === 'ApiUnavailableError') return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
  },
});
