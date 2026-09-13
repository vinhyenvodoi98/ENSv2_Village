// Diagnostic: deploy a brand-new PermissionedRegistry with the CURRENT bytecode/ABI (bypassing the
// browser entirely) and try register() on it directly, to check whether the current contract code
// is sound or whether an already-founded registry on-chain is simply stale relative to it.
import { createWalletClient, createPublicClient, http, zeroAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { permissionedRegistryAbi, ethRegistryAbi } from "../src/lib/contracts/abis.ts";
import { permissionedRegistryBytecode } from "../src/lib/contracts/bytecode.ts";

const rpcUrl = process.env.SEPOLIA_RPC_URL ?? process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL;
const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
const account = privateKeyToAccount(privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`);
const transport = http(rpcUrl);
const publicClient = createPublicClient({ chain: sepolia, transport });
const walletClient = createWalletClient({ account, chain: sepolia, transport });

const labelStore = "0xD7351F76866123A7E49381F38a30a96AdBa7E855"; // ETHRegistry's LABEL_STORE, reused
const ROOT_OWNER_BITMAP = (1n << 0n) | (1n << 128n) | (1n << 4n) | (1n << 132n) | (1n << 8n * 4n) | (1n << (8n * 4n + 128n));
// ^ ROLE_REGISTRAR (nybble0) + admin, ROLE_REGISTER_RESERVED (nybble1) + admin, ROLE_SET_URI (nybble8) + admin

console.log("Deploying test PermissionedRegistry...");
const deployHash = await walletClient.deployContract({
  abi: permissionedRegistryAbi,
  bytecode: permissionedRegistryBytecode,
  args: [labelStore, account.address, ROOT_OWNER_BITMAP],
});
console.log("Deploy tx:", deployHash);
const deployReceipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
const newRegistry = deployReceipt.contractAddress;
console.log("New registry:", newRegistry, "status:", deployReceipt.status);

console.log("\nReading LABEL_STORE() back from the new registry...");
const readBack = await publicClient.readContract({ address: newRegistry, abi: permissionedRegistryAbi, functionName: "LABEL_STORE" });
console.log("LABEL_STORE() =", readBack);

const expiry = BigInt(Math.floor(Date.now() / 1000)) + 31536000n;
console.log("\nSimulating register(\"test-label\", ...) on the fresh registry...");
try {
  const result = await publicClient.simulateContract({
    address: newRegistry,
    abi: ethRegistryAbi,
    functionName: "register",
    args: ["test-label", account.address, zeroAddress, zeroAddress, 0n, expiry],
    account: account.address,
  });
  console.log("Simulate SUCCEEDED. tokenId:", result.result);
} catch (err) {
  console.log("Simulate REVERTED:", err.shortMessage, err.cause?.reason);
}
