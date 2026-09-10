import { keepPreviousData, useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { useBlockNumber } from "wagmi";

/// Shared "auto-refresh on new blocks" wrapper every hook in `src/lib/ens/` is built on. Folding
/// the current block number into the query key (rather than a manual refetch interval) means a
/// new Sepolia block — and whatever heartbeat/record write it carries — reaches the UI on its
/// own, no F5 needed; `staleTime` (set globally in `src/components/providers.tsx`) still governs
/// how eagerly React Query treats that data as fresh in the meantime.
///
/// `placeholderData: keepPreviousData` is load-bearing here, not cosmetic: every new block
/// changes the query key, so without it React Query sees a key it has *never* cached and drops
/// straight into `isLoading`/`isPending` — on every single block, for every hook built on this,
/// all at once. That's the whole UI blanking out and re-rendering every ~12s (Sepolia's block
/// time) that it looks like without this. With it, the previous block's data stays on screen
/// (only `isFetching` flips) until the new block's fetch resolves, then swaps in — refetch still
/// happens every block, it just stops being visible as a reset.
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
    placeholderData: keepPreviousData,
    ...options,
  });
}
