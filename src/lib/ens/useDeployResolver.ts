"use client";

import { useMemo, useState } from "react";
import { decodeEventLog, encodeFunctionData, keccak256, stringToBytes, type Address } from "viem";
import { useAccount, usePublicClient, useWaitForTransactionReceipt } from "wagmi";
import { permissionedResolverAbi, verifiableFactoryAbi } from "@/lib/contracts/abis";
import { CONTRACTS } from "@/lib/contracts/addresses";
import { fetchContractEventsChunked } from "./logs";
import { ADMIN_ROLE_SHIFT, RESOLVER_ROLES } from "./registryRoles";
import { useTxAction } from "./useTxAction";

/// Task 35's "no resolver" self-service escape hatch: a name owner deploys their **own** ENSv2
/// `PermissionedResolver` UUPS proxy straight from their wallet, no backend deploy involved.
/// `PermissionedResolver`'s constructor calls `_disableInitializers()` (`contracts/lib/
/// contracts-v2/.../resolver/PermissionedResolver.sol`), which is the UUPS tell that it must sit
/// behind a proxy — `VerifiableFactory.deployProxy(implementation, salt, initData)` deploys one and
/// `delegatecall`s `initData` (the `initialize` call) into it in the same transaction.
///
/// The deployer is granted every `RESOLVER_ROLES` bit — base *and* admin — at `ROOT_RESOURCE`
/// (`registryRoles.ts`'s vocabulary, not a retyped bitmap): full control over their own instance
/// from block one. The real deployed `PermissionedResolver`'s `initialize(Grant[] grants, bytes[]
/// calls)` applies each `Grant` via its internal `_grantRoles(ROOT_RESOURCE, ...)` directly — this
/// bypasses the contract's own public `grantRoles(resource, bitmap, account)`, which always
/// reverts (`EACCannotGrantRoles`) on this implementation ("use `grantSetterRoles()` instead", per
/// its own doc comment) — so `initialize` is the only place root roles can be granted in one shot.
function fullResolverRoleBitmap(): bigint {
  return RESOLVER_ROLES.reduce((bitmap, role) => bitmap | role.bit | (role.bit << ADMIN_ROLE_SHIFT), 0n);
}

export function useDeployResolver() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const deploy = useTxAction();
  const [salt, setSalt] = useState<bigint | null>(null);
  const [existingAddress, setExistingAddress] = useState<Address | null>(null);

  const receipt = useWaitForTransactionReceipt({ hash: deploy.txHash });

  /// Read back off the mined receipt rather than the (unavailable, for a state-changing call)
  /// return value of `deployProxy` — `VerifiableFactory.ProxyDeployed(sender, proxyAddress, salt,
  /// implementation)` is emitted in the same transaction, so this is exact, not a guess.
  const deployedFromReceipt = useMemo<Address | null>(() => {
    if (!receipt.data) return null;
    for (const log of receipt.data.logs) {
      try {
        const decoded = decodeEventLog({ abi: verifiableFactoryAbi, data: log.data, topics: log.topics });
        if (decoded.eventName === "ProxyDeployed") return decoded.args.proxyAddress;
      } catch {
        // Not a `ProxyDeployed` log (or not from this ABI) — keep scanning the receipt.
      }
    }
    return null;
  }, [receipt.data]);

  const resolverAddress = existingAddress ?? deployedFromReceipt;

  /// `salt` is derived from the ENS name being deployed for, so retrying for the same name after a
  /// failed attempt reuses the same CREATE2 address instead of orphaning proxies; a genuinely new
  /// deploy for a different name gets a different salt automatically.
  async function deployFor(name: string) {
    if (!address) return;
    const nameSalt = BigInt(keccak256(stringToBytes(name)));
    setSalt(nameSalt);
    setExistingAddress(null);

    /// `VerifiableFactory.deployProxy` folds `msg.sender` into its CREATE2 salt
    /// (`outerSalt = keccak256(abi.encode(msg.sender, salt))`), so this exact wallet redeploying
    /// for a name it has already deployed a resolver for collides at the same address: `create2`
    /// returns the zero address and the function does a bare `revert(0, 0)` — no reason, so the
    /// wallet/RPC only ever shows "execution reverted". Scanning past `ProxyDeployed` logs for this
    /// sender first turns that guaranteed-to-fail redeploy into reusing the resolver that's already
    /// there, instead of a confusing revert on every click after the first successful one.
    if (publicClient) {
      try {
        const toBlock = await publicClient.getBlockNumber();
        const logs = await fetchContractEventsChunked({
          publicClient,
          address: CONTRACTS.verifiableFactory,
          abi: verifiableFactoryAbi,
          eventName: "ProxyDeployed",
          fromBlock: CONTRACTS.ensDeploymentFirstBlock,
          toBlock,
          args: { sender: address },
        });
        const match = logs.find((log) => log.args.salt === nameSalt);
        if (match?.args.proxyAddress) {
          setExistingAddress(match.args.proxyAddress);
          return;
        }
      } catch {
        // Log scan failed (RPC hiccup) — fall through to a normal deploy attempt; worst case is
        // the same revert this scan exists to avoid, not a new failure mode.
      }
    }

    const initData = encodeFunctionData({
      abi: permissionedResolverAbi,
      functionName: "initialize",
      args: [[{ account: address, roleBitmap: fullResolverRoleBitmap() }], []],
    });
    await deploy
      .send({
        address: CONTRACTS.verifiableFactory,
        abi: verifiableFactoryAbi,
        functionName: "deployProxy",
        args: [CONTRACTS.permissionedResolverImpl, nameSalt, initData],
      })
      .catch(() => {});
  }

  function reset() {
    deploy.reset();
    setSalt(null);
    setExistingAddress(null);
  }

  return { deployFor, reset, state: deploy.state, txHash: deploy.txHash, error: deploy.error, resolverAddress, salt };
}
