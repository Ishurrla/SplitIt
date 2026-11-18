import { QueryClient } from '@tanstack/react-query'
import { NoAccessError } from '../groups/noAccess'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // "No access" is an answer, not a glitch: retrying would only repeat it.
      retry: (failures, error) => !(error instanceof NoAccessError) && failures < 2,
      refetchOnWindowFocus: false,
    },
  },
})
