import type {
  Abi,
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
}): Promise<GetContractEventsReturnType<TAbi, TEventName>> {
  const { publicClient, address, abi, eventName, fromBlock, toBlock } = params;
  const maxSpan = params.maxSpan ?? DEFAULT_MAX_SPAN;
  const logs: GetContractEventsReturnType<TAbi, TEventName> = [];

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
        });
        logs.push(...window);
        cursor = end + 1n;
        break;
      } catch (error) {
        if (span <= 1_000n) throw error;
        span /= 2n;
      }
    }
  }

  return logs;
}
