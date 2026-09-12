import type {
  Abi,
  ContractEventArgs,
  ContractEventName,
  GetContractEventsReturnType,
  PublicClient,
} from "viem";

/// Most RPC providers cap `eth_getLogs` to a fixed block range — the endpoint this project runs
/// against rejects anything wider than 50,000 blocks ("exceed maximum block range: 50000"), and
/// others cap lower still. A single `fromBlock: <deployment>` query therefore works only for as long
/// as the chain stays within one window of the deployment, then starts failing outright. Every
/// historical read in the control panel goes through the chunked scan below instead.
const DEFAULT_MAX_SPAN = 49_999n;

/// Candidate sets discovered from append-only event history, keyed by `${event}:${address}`. Lives
/// at module scope so it survives the per-block query-key churn in `query.ts`. What it holds is
/// "this tokenId was registered at some point", which is wallet-independent and never expires —
/// who owns a name *now* is not cached here at all.
const candidatesByScope = new Map<string, Map<bigint, unknown>>();

/// Merges one scan's findings into the running candidate set for `scope` and returns the union.
///
/// Event history is append-only — a `NameRegistered`/`LabelRegistered` that fired in the past can
/// never un-fire — but this deployment's RPC does not always answer as though that were true:
/// identical `eth_getLogs` calls intermittently come back holding only the most recent slice of the
/// requested range, with no error and nothing marking the response as partial. Measured against the
/// configured endpoint, one unchanged query returned 124 logs, then 15, then 14 (the truncated
/// answers started at block 11668849/11678084 instead of the requested 11635740), and the union of
/// every answer was exactly the same 124.
///
/// A scan that *replaces* its candidate set therefore drops names out of the UI whenever a
/// truncated answer lands — the connected wallet's own `.eth` vanishing mid-session, taking the map
/// with it, was this. Merging leaves a scan only able to *add*: a truncated answer is a no-op, and
/// the next complete one heals whatever it missed. Callers still re-verify every candidate against
/// live registry state, so a transfer, expiry or revocation lands on the very next read.
export function mergeEventCandidates<V>(scope: string, fresh: ReadonlyMap<bigint, V>): Map<bigint, V> {
  let known = candidatesByScope.get(scope) as Map<bigint, V> | undefined;
  if (!known) {
    known = new Map<bigint, V>();
    candidatesByScope.set(scope, known as Map<bigint, unknown>);
  }
  for (const [tokenId, value] of fresh) known.set(tokenId, value);
  return new Map(known);
}

/// `getContractEvents` over an arbitrarily wide range, split into windows the RPC will accept.
///
/// A window that still gets rejected is retried at half the span, down to 1,000 blocks, so a
/// provider with a tighter cap than ours degrades into more requests rather than into an error. Logs
/// come back in ascending block order, exactly as a single un-chunked query would return them.
export async function fetchContractEventsChunked<
  TAbi extends Abi,
  TEventName extends ContractEventName<TAbi>,
>(params: {
  publicClient: PublicClient;
  address: `0x${string}`;
  abi: TAbi;
  eventName: TEventName;
  fromBlock: bigint;
  toBlock: bigint;
  maxSpan?: bigint;
  /// Narrows the scan server-side (e.g. `{ node }` for a `TextChanged` scan on one name) — same
  /// `args` shape `getContractEvents` itself takes, just threaded through the chunking.
  args?: ContractEventArgs<TAbi, TEventName>;
  /// Fired after every answered window with how far the walk has got. The chunking is the only
  /// place that knows a "single" history read is really N sequential requests, so it is the only
  /// place that can report real progress instead of a spinner. `total` is an estimate from the
  /// requested range and grows if a window has to be retried at a narrower span, so it never
  /// reports fewer windows than have already completed. `matched` is how many logs the walk has
  /// collected so far, so a caller can show a count that grows instead of a bar that only creeps.
  onProgress?: (scanned: number, total: number, matched: number) => void;
}): Promise<GetContractEventsReturnType<TAbi, TEventName>> {
  const { publicClient, address, abi, eventName, fromBlock, toBlock, args, onProgress } = params;
  const maxSpan = params.maxSpan ?? DEFAULT_MAX_SPAN;
  const logs: GetContractEventsReturnType<TAbi, TEventName> = [];

  const span0 = toBlock >= fromBlock ? toBlock - fromBlock + 1n : 0n;
  let estimatedWindows = Number((span0 + maxSpan - 1n) / maxSpan);
  let scanned = 0;
  onProgress?.(0, estimatedWindows, 0);

  let cursor = fromBlock;
  while (cursor <= toBlock) {
    let span = maxSpan;
    for (;;) {
      const end = cursor + span > toBlock ? toBlock : cursor + span;
      try {
        const window = await publicClient.getContractEvents({
          address,
          abi,
          eventName,
          fromBlock: cursor,
          toBlock: end,
          ...(args ? { args } : {}),
        });
        logs.push(...window);
        cursor = end + 1n;
        scanned += 1;
        if (scanned > estimatedWindows) estimatedWindows = scanned;
        onProgress?.(scanned, estimatedWindows, logs.length);
        break;
      } catch (error) {
        if (span <= 1_000n) throw error;
        span /= 2n;
      }
    }
  }

  return logs;
}
