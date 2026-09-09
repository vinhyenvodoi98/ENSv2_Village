import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { useBlockNumber } from "wagmi";

/// Shared "auto-refresh on new blocks" wrapper every hook in `src/lib/ens/` is built on. Folding
/// the current block number into the query key (rather than a manual refetch interval) means a
/// new Sepolia block — and whatever heartbeat/record write it carries — reaches the UI on its
/// own, no F5 needed; `staleTime` (set globally in `src/components/providers.tsx`) still governs
/// how eagerly React Query treats that data as fresh in the meantime.
export function useBlockGatedQuery<T>(
  queryKey: readonly unknown[],
  queryFn: () => Promise<T>,
  options?: Omit<UseQueryOptions<T, Error, T, readonly unknown[]>, "queryKey" | "queryFn">
) {
  const { data: blockNumber } = useBlockNumber({ watch: true });

  return useQuery({
    queryKey: [...queryKey, blockNumber?.toString()],
    queryFn,
    enabled: blockNumber !== undefined && (options?.enabled ?? true),
    ...options,
  });
}
