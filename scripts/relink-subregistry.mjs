// One-off fix: point taio-newgate.eth's subregistry at the freshly-deployed, ABI-compatible
// PermissionedRegistry (see scripts/deploy-test-registry.mjs) instead of the stale one that
// predates the contracts-v2 refactor (missing LABEL_STORE / current register() encoding).
import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { ethRegistryAbi } from "../src/lib/contracts/abis.ts";
import deployments from "../src/lib/contracts/deployments.json" with { type: "json" };

const [, , tokenIdArg, newRegistryArg] = process.argv;
if (!tokenIdArg || !newRegistryArg) {
  console.error("Usage: node --env-file=.env scripts/relink-subregistry.mjs <tokenId> <newRegistryAddress>");
  process.exit(1);
}

const rpcUrl = process.env.SEPOLIA_RPC_URL ?? process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL;
const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
const account = privateKeyToAccount(privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`);
const transport = http(rpcUrl);
const publicClient = createPublicClient({ chain: sepolia, transport });
const walletClient = createWalletClient({ account, chain: sepolia, transport });

const ethRegistry = deployments.ethRegistry;
const tokenId = BigInt(tokenIdArg);

console.log(`Simulating setSubregistry(${tokenId}, ${newRegistryArg}) on ${ethRegistry} as ${account.address}...`);
await publicClient.simulateContract({
  address: ethRegistry,
  abi: ethRegistryAbi,
  functionName: "setSubregistry",
  args: [tokenId, newRegistryArg],
  account: account.address,
});
console.log("Simulate OK — sending tx.");

const hash = await walletClient.writeContract({
  address: ethRegistry,
  abi: ethRegistryAbi,
  functionName: "setSubregistry",
  args: [tokenId, newRegistryArg],
});
console.log("Tx sent:", hash);
const receipt = await publicClient.waitForTransactionReceipt({ hash });
console.log("Status:", receipt.status, "block", receipt.blockNumber);
