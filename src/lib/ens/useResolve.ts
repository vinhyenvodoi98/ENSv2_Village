import { encodeFunctionData, decodeFunctionResult, namehash, stringToBytes, concat, bytesToHex, type Hex } from "viem";
import { usePublicClient } from "wagmi";
import { universalResolverAbi } from "@/lib/contracts/abis";
import { CONTRACTS } from "@/lib/contracts/addresses";
import { useBlockGatedQuery } from "./query";

const addrAbi = [
  { type: "function", name: "addr", stateMutability: "view", inputs: [{ name: "node", type: "bytes32" }], outputs: [{ name: "", type: "address" }] },
] as const;
const textAbi = [
  { type: "function", name: "text", stateMutability: "view", inputs: [{ name: "node", type: "bytes32" }, { name: "key", type: "string" }], outputs: [{ name: "", type: "string" }] },
] as const;

export type ResolveResult = {
  address: `0x${string}`;
  texts: Record<string, string>;
  /// The resolver `UniversalResolver` actually found and forwarded to — real registration wins
  /// over the wildcard fallback (task 06), so this is the concrete proof of which path answered.
  resolver: `0x${string}`;
};

/// Resolves `name` (e.g. `scout-01.agentvillage.eth`) through the real ENSv2 `UniversalResolver`
/// — `LibRegistry.findResolver` walking the tree from root down, exactly ENS's own resolution
/// path (`docs/ensv2-reference.md` §5) — rather than reading `AgentRegistry`/`AgentResolver`
/// directly. This is what proves ENSIP-10 wildcard resolution end-to-end: an unminted label
/// resolves through `WildcardResolver`, a minted one through its own `AgentResolver`, and this
/// hook can't tell the difference in advance any more than a real ENS client could.
export function useResolve(name: string | undefined, textKeys: readonly string[] = []) {
  const publicClient = usePublicClient();

  return useBlockGatedQuery<ResolveResult>(
    ["resolve", name, ...textKeys],
    async () => {
      if (!publicClient || !name) throw new Error("useResolve: missing publicClient/name");

      const node = namehash(name);
      const dnsEncoded = dnsEncodeName(name);

      const addrCalldata = encodeFunctionData({ abi: addrAbi, functionName: "addr", args: [node] });
      const textCalldatas = textKeys.map((key) => encodeFunctionData({ abi: textAbi, functionName: "text", args: [node, key] }));

      const [addrResult, ...textResults] = await Promise.all(
        [addrCalldata, ...textCalldatas].map((calldata) =>
          publicClient.readContract({
            address: CONTRACTS.universalResolver,
            abi: universalResolverAbi,
            functionName: "resolve",
            args: [dnsEncoded, calldata],
          })
        )
      );

      const [addrData, resolver] = addrResult as [Hex, `0x${string}`];
      const address = decodeFunctionResult({ abi: addrAbi, functionName: "addr", data: addrData }) as `0x${string}`;

      const texts: Record<string, string> = {};
      textKeys.forEach((key, i) => {
        const [textData] = textResults[i] as [Hex, `0x${string}`];
        texts[key] = decodeFunctionResult({ abi: textAbi, functionName: "text", data: textData }) as string;
      });

      return { address, texts, resolver };
    },
    { enabled: !!name }
  );
}

/// DNS-encodes a dotted name per ENSIP-10 (`resolve(bytes,bytes)`'s `name` argument): each label
/// prefixed by its length byte, terminated by a zero-length label. Not exported by `viem`'s
/// public API, so implemented directly rather than reaching into its internals.
function dnsEncodeName(name: string): Hex {
  const labels = name.split(".").filter(Boolean);
  const parts = labels.flatMap((label) => {
    const bytes = stringToBytes(label);
    return [new Uint8Array([bytes.length]), bytes];
  });
  parts.push(new Uint8Array([0]));
  return bytesToHex(concat(parts));
}
