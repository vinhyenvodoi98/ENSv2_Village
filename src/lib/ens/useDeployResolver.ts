"use client";

import { useMemo, useState } from "react";
import { decodeEventLog, encodeFunctionData, keccak256, stringToBytes, type Address } from "viem";
import { useAccount, useWaitForTransactionReceipt } from "wagmi";
import { permissionedResolverAbi, verifiableFactoryAbi } from "@/lib/contracts/abis";
import { CONTRACTS } from "@/lib/contracts/addresses";
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
/// (`registryRoles.ts`'s vocabulary, not a retyped bitmap), mirroring `Deploy.s.sol`'s own resolver
/// `initialize` call: full control over their own instance from block one, and the right to grant
/// (`authorizeTextRoles`/`grantRoles`) pieces of it away later via task 34/35's own panels.
function fullResolverRoleBitmap(): bigint {
  return RESOLVER_ROLES.reduce((bitmap, role) => bitmap | role.bit | (role.bit << ADMIN_ROLE_SHIFT), 0n);
}

export function useDeployResolver() {
  const { address } = useAccount();
  const deploy = useTxAction();
  const [salt, setSalt] = useState<bigint | null>(null);

  const receipt = useWaitForTransactionReceipt({ hash: deploy.txHash });

  /// Read back off the mined receipt rather than the (unavailable, for a state-changing call)
  /// return value of `deployProxy` — `VerifiableFactory.ProxyDeployed(sender, proxyAddress, salt,
  /// implementation)` is emitted in the same transaction, so this is exact, not a guess.
  const resolverAddress = useMemo<Address | null>(() => {
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

  /// `salt` is derived from the ENS name being deployed for, so retrying for the same name after a
  /// failed attempt reuses the same CREATE2 address instead of orphaning proxies; a genuinely new
  /// deploy for a different name gets a different salt automatically.
  async function deployFor(name: string) {
    if (!address) return;
    const nameSalt = BigInt(keccak256(stringToBytes(name)));
    setSalt(nameSalt);
    const initData = encodeFunctionData({
      abi: permissionedResolverAbi,
      functionName: "initialize",
      args: [address, fullResolverRoleBitmap(), []],
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
  }

  return { deployFor, reset, state: deploy.state, txHash: deploy.txHash, error: deploy.error, resolverAddress, salt };
}
