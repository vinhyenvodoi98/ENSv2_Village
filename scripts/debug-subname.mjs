// Diagnostic: replicate exactly what SubnameManagerPanel's "Register a subname" does for a given
// parent name + test label, and surface the real revert reason via publicClient.simulateContract
// (no wallet involved) instead of the app's generic "execution reverted" fallback.
//
// Usage: node --env-file=.env scripts/debug-subname.mjs <parentName> <label> [ownerAddress]
import { createPublicClient, http, zeroAddress, keccak256, toBytes, encodePacked } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import deployments from "../src/lib/contracts/deployments.json" with { type: "json" };
import { ethRegistryAbi } from "../src/lib/contracts/abis.ts";

const [, , parentArg, labelArg, ownerArg] = process.argv;
if (!parentArg || !labelArg) {
  console.error("Usage: node --env-file=.env scripts/debug-subname.mjs <parentName> <label> [ownerAddress]");
  process.exit(1);
}

const rpcUrl = process.env.SEPOLIA_RPC_URL ?? process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL;
if (!rpcUrl) throw new Error("SEPOLIA_RPC_URL is not set in .env");
const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });

const owner = ownerArg ?? privateKeyToAccount(
  (process.env.WALLET_2_PRIVATE_KEY ?? process.env.DEPLOYER_PRIVATE_KEY).replace(/^(?!0x)/, "0x")
).address;

function splitLabels(name) {
  return name.split(".").filter(Boolean);
}

async function walkRegistries(labels) {
  let current = deployments.rootRegistry;
  const path = [];
  for (const label of labels.slice(1).reverse()) {
    const subregistry = await publicClient.readContract({
      address: current,
      abi: ethRegistryAbi,
      functionName: "getSubregistry",
      args: [label],
    });
    path.push({ label, parentRegistry: current, subregistry });
    if (!subregistry || subregistry === zeroAddress) return { registry: null, path };
    current = subregistry;
  }
  return { registry: current, path };
}

const labels = splitLabels(parentArg);
const { registry, path } = await walkRegistries(labels);
console.log("Registry walk:", path);
if (!registry) {
  console.error(`No registry governs ${parentArg} — walk broke before reaching it.`);
  process.exit(1);
}
console.log(`Registry for ${parentArg}: ${registry}`);

const leafLabel = labels[0];
const labelHash = BigInt(keccak256(toBytes(leafLabel)));

const [state, subregistryAddr, resolverAddr] = await publicClient.multicall({
  allowFailure: true,
  contracts: [
    { address: registry, abi: ethRegistryAbi, functionName: "getState", args: [labelHash] },
    { address: registry, abi: ethRegistryAbi, functionName: "getSubregistry", args: [leafLabel] },
    { address: registry, abi: ethRegistryAbi, functionName: "getResolver", args: [leafLabel] },
  ],
});
console.log("getState:", state);
console.log("getSubregistry(leaf):", subregistryAddr);
console.log("getResolver(leaf):", resolverAddr);

const subregistry = subregistryAddr.status === "success" ? subregistryAddr.result : null;
if (!subregistry || subregistry === zeroAddress) {
  console.error(`${parentArg} has no subregistry set yet — "Found your own registry" step isn't done, so register() has nowhere to be called on.`);
  process.exit(1);
}
console.log(`${parentArg}'s subregistry (where register() is called): ${subregistry}`);

// roles(ROOT_RESOURCE, owner) on that subregistry — same check useCanRegister does.
const ROLE_REGISTRAR_BIT = 1n; // nybble 0
const rolesBitmap = await publicClient.readContract({
  address: subregistry,
  abi: ethRegistryAbi,
  functionName: "roles",
  args: [0n, owner],
});
console.log(`roles(ROOT_RESOURCE, ${owner}) on subregistry = ${rolesBitmap.toString(16)} — ROLE_REGISTRAR held: ${(rolesBitmap & ROLE_REGISTRAR_BIT) !== 0n}`);

const expiry = BigInt(Math.floor(Date.now() / 1000)) + 31536000n;
const registryBitmap = 0n; // "records-only"-equivalent minimal bitmap; irrelevant to whether the call reverts structurally

console.log(`\nSimulating register("${labelArg}", ${owner}, address(0), address(0), ${registryBitmap}, ${expiry}) on ${subregistry} as ${owner}...`);
try {
  const result = await publicClient.simulateContract({
    address: subregistry,
    abi: ethRegistryAbi,
    functionName: "register",
    args: [labelArg, owner, zeroAddress, zeroAddress, registryBitmap, expiry],
    account: owner,
  });
  console.log("Simulate SUCCEEDED — would not revert. Result:", result.result);
} catch (err) {
  console.error("Simulate REVERTED.");
  console.error("err.shortMessage:", err.shortMessage);
  console.error("err.cause?.reason:", err.cause?.reason);
  console.error("err.cause?.data:", err.cause?.data);
  console.error(err);
}
