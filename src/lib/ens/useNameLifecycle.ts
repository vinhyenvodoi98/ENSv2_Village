"use client";

import { useCallback, useState } from "react";
import { zeroHash, type Address } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import { erc20Abi, ethRegistrarAbi, ethRegistryAbi } from "@/lib/contracts/abis";
import { CONTRACTS } from "@/lib/contracts/addresses";
import { CLAIM_DURATION_OPTIONS } from "./useClaimName";
import { useBlockGatedQuery } from "./query";
import { useTxAction } from "./useTxAction";
import type { EnsNameState } from "./useEnsName";

export type RenewPrice = { total: bigint; decimals: number; balance: bigint; allowance: bigint };

/// A name registered through `ethRegistrarAbi` (`state.registry === CONTRACTS.ethRegistry`) renews
/// through the registrar's own priced, permissionless `renew(label, duration, paymentToken,
/// referrer)` — `AbstractETHRegistrar.renew` reads `getRenewPrice`, pulls payment, then calls the
/// registry's `renew` itself using the registrar's own `ROLE_RENEW` grant, with no role check on
/// the caller. Anything else (a subname minted by an owner's own `PermissionedRegistry`, task 36)
/// renews for free through the registry's role-gated `renew(anyId, newExpiry)` — the caller must
/// hold `ROLE_RENEW` on the name directly. Same UI, two different chain paths, chosen by which
/// registry actually governs the name — never assumed from anything else.
export function useNameLifecycle(state: EnsNameState) {
  const { address } = useAccount();
  const publicClient = usePublicClient();

  const isEthRegistrarPath = state.registry === CONTRACTS.ethRegistry;

  const [duration, setDuration] = useState<bigint>(CLAIM_DURATION_OPTIONS[0].seconds);

  const priceQuery = useBlockGatedQuery<RenewPrice | null>(
    ["renewPrice", state.label, duration.toString(), address, isEthRegistrarPath],
    async () => {
      if (!publicClient || !address) return null;
      const [total, decimals, balance, allowance] = await publicClient.multicall({
        allowFailure: false,
        contracts: [
          {
            address: CONTRACTS.ethRegistrar,
            abi: ethRegistrarAbi,
            functionName: "getRenewPrice",
            args: [state.label, duration, CONTRACTS.mockUsdc],
          },
          { address: CONTRACTS.mockUsdc, abi: erc20Abi, functionName: "decimals" },
          { address: CONTRACTS.mockUsdc, abi: erc20Abi, functionName: "balanceOf", args: [address] },
          { address: CONTRACTS.mockUsdc, abi: erc20Abi, functionName: "allowance", args: [address, CONTRACTS.ethRegistrar] },
        ] as const,
      });
      return { total, decimals, balance, allowance };
    },
    { enabled: !!publicClient && !!address && isEthRegistrarPath }
  );
  const price = isEthRegistrarPath ? (priceQuery.data ?? null) : null;

  const mintAction = useTxAction();
  const approveAction = useTxAction();
  const renewAction = useTxAction();

  const mint = useCallback(async () => {
    if (!price || !address) return;
    const amount = (price.total * 3n) / 2n;
    await mintAction.send({ address: CONTRACTS.mockUsdc, abi: erc20Abi, functionName: "mint", args: [address, amount] });
  }, [price, address, mintAction]);

  const approve = useCallback(async () => {
    if (!price) return;
    const amount = (price.total * 6n) / 5n;
    await approveAction.send({
      address: CONTRACTS.mockUsdc,
      abi: erc20Abi,
      functionName: "approve",
      args: [CONTRACTS.ethRegistrar, amount],
    });
  }, [price, approveAction]);

  const renew = useCallback(async () => {
    if (isEthRegistrarPath) {
      await renewAction.send({
        address: CONTRACTS.ethRegistrar,
        abi: ethRegistrarAbi,
        functionName: "renew",
        args: [state.label, duration, CONTRACTS.mockUsdc, zeroHash],
      });
      return;
    }
    if (!state.registry || state.tokenId === null || state.expiry === null) return;
    const newExpiry = state.expiry + duration;
    await renewAction.send({
      address: state.registry,
      abi: ethRegistryAbi,
      functionName: "renew",
      args: [state.tokenId, newExpiry],
    });
  }, [isEthRegistrarPath, state.registry, state.tokenId, state.expiry, state.label, duration, renewAction]);

  const resultingExpiry = state.expiry !== null ? state.expiry + duration : null;

  const transferAction = useTxAction();
  const transfer = useCallback(
    async (to: Address) => {
      if (!state.registry || state.tokenId === null || !address) return;
      await transferAction.send({
        address: state.registry,
        abi: ethRegistryAbi,
        functionName: "safeTransferFrom",
        args: [address, to, state.tokenId, 1n, "0x"],
      });
    },
    [state.registry, state.tokenId, address, transferAction]
  );

  const resolverAction = useTxAction();
  const setResolver = useCallback(
    async (resolver: Address) => {
      if (!state.registry || state.tokenId === null) return;
      await resolverAction.send({
        address: state.registry,
        abi: ethRegistryAbi,
        functionName: "setResolver",
        args: [state.tokenId, resolver],
      });
    },
    [state.registry, state.tokenId, resolverAction]
  );

  const subregistryAction = useTxAction();
  const setSubregistry = useCallback(
    async (registry: Address) => {
      if (!state.registry || state.tokenId === null) return;
      await subregistryAction.send({
        address: state.registry,
        abi: ethRegistryAbi,
        functionName: "setSubregistry",
        args: [state.tokenId, registry],
      });
    },
    [state.registry, state.tokenId, subregistryAction]
  );

  return {
    isEthRegistrarPath,
    duration,
    setDuration,
    durationOptions: CLAIM_DURATION_OPTIONS,
    price,
    mintNeeded: isEthRegistrarPath && !!price && price.balance < price.total,
    approveNeeded: isEthRegistrarPath && !!price && price.allowance < price.total,
    resultingExpiry,
    renew: { run: renew, ...toStatus(renewAction) },
    mint: { run: mint, ...toStatus(mintAction) },
    approve: { run: approve, ...toStatus(approveAction) },
    transfer: { run: transfer, ...toStatus(transferAction) },
    setResolver: { run: setResolver, ...toStatus(resolverAction) },
    setSubregistry: { run: setSubregistry, ...toStatus(subregistryAction) },
  };
}

function toStatus(action: ReturnType<typeof useTxAction>) {
  return { state: action.state, txHash: action.txHash, error: action.error };
}
