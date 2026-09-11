import { zeroAddress, type PublicClient } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import { enhancedAccessControlAbi, ethRegistryAbi } from "@/lib/contracts/abis";
import { CONTRACTS } from "@/lib/contracts/addresses";
import { labelhash, leafLabel, nameNode, normalizeName, parentName, splitLabels } from "./name";
import { useBlockGatedQuery } from "./query";
import {
  RESOLVER_ROLES,
  REGISTRY_ROLES,
  ROOT_RESOURCE,
  decodeRoles,
  resolverResource,
  type DecodedRole,
} from "./registryRoles";

/// `IPermissionedRegistry.Status` — mirrored, not guessed (`PermissionedRegistry._constructStatus`:
/// an expired entry reads back as `AVAILABLE`, an unexpired one with no token owner as `RESERVED`).
export const NAME_STATUS = ["available", "reserved", "registered"] as const;
export type NameStatus = (typeof NAME_STATUS)[number];

export type RegistryHop = {
  /// The label looked up at this hop, e.g. `"eth"`.
  label: string;
  /// The registry the lookup was made *against*.
  parentRegistry: `0x${string}`;
  /// What `getSubregistry(label)` answered — `zeroAddress` means the walk stops here.
  subregistry: `0x${string}`;
};

export type EnsNameState = {
  name: string;
  label: string;
  parent: string;
  /// ENSIP-1 namehash of the full name — the resolver's key for records and EACL resources.
  node: `0x${string}`;
  /// `LibLabel.id(label)`: the leaf label's hash, the registry's key for everything below.
  labelhash: bigint;
  /// Every `getSubregistry` hop from `CONTRACTS.rootRegistry` down, so the UI can *show* that the
  /// governing registry was walked to rather than hardcoded.
  path: RegistryHop[];
  /// The `IPermissionedRegistry` that governs this name, i.e. the registry its parent points at.
  /// `null` when the walk broke before reaching it — a parent with no subregistry.
  registry: `0x${string}` | null;
  /// Set when `registry` is `null`: the hop whose `getSubregistry` answered `address(0)`.
  brokenAt: RegistryHop | null;
  /// Whether the governing registry answers the `IPermissionedRegistry` surface at all. Every
  /// ENS-operated registry does, but `IRegistry` — the interface a parent actually points at via
  /// `setSubregistry` — only requires `getResolver`/`getSubregistry`, so a name can legitimately
  /// live in a custom registry (AgentVillage's own `AgentRegistry` is one) that has no `getState`,
  /// no expiry and no EACL resource to report. Owner/expiry/tokenId/resource are `null` in that
  /// case, and the panel says why rather than showing an error.
  isPermissionedRegistry: boolean;
  /// Everything below is read from the governing registry, and is `null` when there is none.
  status: NameStatus | null;
  owner: `0x${string}` | null;
  /// `State.latestOwner` — the ERC-1155 holder even when the name has expired, which is how an
  /// expired-but-not-yet-reclaimed name still shows who used to hold it.
  latestOwner: `0x${string}` | null;
  expiry: bigint | null;
  tokenId: bigint | null;
  /// The name's EACL resource on the registry — the first argument of every `roles()` read below.
  resource: bigint | null;
  /// `address(0)` means "not set", which is exactly what gates task 35's records editor.
  resolver: `0x${string}` | null;
  /// `address(0)` means "no subname registry wired", which gates task 36's subname self-service.
  subregistry: `0x${string}` | null;
};

function statusFromChain(raw: number): NameStatus {
  return NAME_STATUS[raw] ?? "available";
}

/// Walks `IRegistry.getSubregistry(label)` root-first — `rootRegistry` → `eth` → … — until the
/// registry that governs `name`'s own leaf label is reached. The only addresses trusted as a
/// starting point are the roots in `deployments.json`; every registry after that comes off-chain,
/// so a name under someone else's user registry resolves the same way `agentvillage.eth` does.
async function walkRegistries(
  publicClient: PublicClient,
  labels: string[]
): Promise<{ registry: `0x${string}` | null; path: RegistryHop[]; brokenAt: RegistryHop | null }> {
  const path: RegistryHop[] = [];
  let current: `0x${string}` = CONTRACTS.rootRegistry;

  // Leaf-first labels, walked parent-first: for `a.b.eth` that's `eth`, then `b`; `a` itself is
  // resolved *inside* whatever registry those hops land on, not walked past.
  for (const label of labels.slice(1).reverse()) {
    const subregistry = await publicClient.readContract({
      address: current,
      abi: ethRegistryAbi,
      functionName: "getSubregistry",
      args: [label],
    });
    const hop: RegistryHop = { label, parentRegistry: current, subregistry };
    path.push(hop);
    if (!subregistry || subregistry === zeroAddress) {
      return { registry: null, path, brokenAt: hop };
    }
    current = subregistry;
  }

  return { registry: current, path, brokenAt: null };
}

/// The control panel's read layer: from a plain name string to the true on-chain state of that
/// name, with no fixture and no hardcoded registry address anywhere in between.
///
/// A name that was never registered, or whose registration has lapsed, resolves *successfully*
/// here with `status: "available"` — task 33 treats that as a first-class state the panel renders,
/// not an error. So does a name whose parent has no subregistry at all (`registry: null`): there
/// is no contract that could answer for it, which is a different and worth-distinguishing fact.
export function useEnsName(name: string | null | undefined) {
  const publicClient = usePublicClient();
  const normalized = name ? normalizeName(name) : "";

  return useBlockGatedQuery<EnsNameState | null>(
    ["ensName", normalized],
    async () => {
      if (!publicClient) throw new Error("useEnsName: missing publicClient");
      const labels = splitLabels(normalized);
      if (labels.length === 0) return null;

      const label = leafLabel(normalized);
      const base = {
        name: normalized,
        label,
        parent: parentName(normalized),
        node: nameNode(normalized),
        labelhash: labelhash(label),
      };

      const { registry, path, brokenAt } = await walkRegistries(publicClient, labels);
      if (!registry) {
        return {
          ...base,
          path,
          registry: null,
          brokenAt,
          isPermissionedRegistry: false,
          status: null,
          owner: null,
          latestOwner: null,
          expiry: null,
          tokenId: null,
          resource: null,
          resolver: null,
          subregistry: null,
        };
      }

      const contract = { address: registry, abi: ethRegistryAbi } as const;
      // `getState` bundles status/expiry/latestOwner/tokenId/resource in one call, so the five
      // values can never disagree by being read a block apart. `getOwner` is still read on its own
      // because it is the *expiry-aware* owner (`ownerOf` zeroes out once the name lapses) while
      // `State.latestOwner` is not — the difference is what "expired, previously held by" needs.
      //
      // `allowFailure` because reaching a registry is not the same as it being a
      // `PermissionedRegistry`: `getResolver`/`getSubregistry` are all `IRegistry` guarantees, and a
      // custom subregistry without the permissioned surface reverts on the rest. That is a state to
      // report, not a read to fail.
      const [stateResult, ownerResult, resolverResult, subregistryResult] = await publicClient.multicall({
        allowFailure: true,
        contracts: [
          { ...contract, functionName: "getState", args: [base.labelhash] },
          { ...contract, functionName: "getOwner", args: [base.labelhash] },
          { ...contract, functionName: "getResolver", args: [label] },
          { ...contract, functionName: "getSubregistry", args: [label] },
        ] as const,
      });

      const state = stateResult.status === "success" ? stateResult.result : null;
      const owner = ownerResult.status === "success" ? ownerResult.result : null;
      const resolver = resolverResult.status === "success" ? resolverResult.result : null;
      const subregistry = subregistryResult.status === "success" ? subregistryResult.result : null;

      return {
        ...base,
        path,
        registry,
        brokenAt: null,
        isPermissionedRegistry: state !== null,
        status: state ? statusFromChain(Number(state.status)) : null,
        owner: !owner || owner === zeroAddress ? null : owner,
        latestOwner: !state || state.latestOwner === zeroAddress ? null : state.latestOwner,
        expiry: state ? state.expiry : null,
        tokenId: state ? state.tokenId : null,
        resource: state ? state.resource : null,
        resolver,
        subregistry,
      };
    },
    { enabled: !!publicClient && normalized.length > 0 }
  );
}

export type EnsNameRoles = {
  account: `0x${string}`;
  /// Raw `IEnhancedAccessControl.roles(resource, account)` bitmaps, kept alongside the decoded
  /// view so the panel can show the number the chain actually returned.
  registryBitmap: bigint;
  registryRootBitmap: bigint;
  registryRoles: DecodedRole[];
  registryRootRoles: DecodedRole[];
  /// `null` when the name has no resolver, or when its resolver is not an EACL contract at all
  /// (AgentVillage's own `WildcardResolver`, for one, has no `roles()` — the call reverts). That is
  /// a fact about the resolver, not a failure: it simply has no per-name roles to report.
  resolverBitmap: bigint | null;
  resolverRoles: DecodedRole[] | null;
};

/// Which of the ENSv2 registry/resolver roles the **connected wallet** actually holds on this name,
/// read straight off `IEnhancedAccessControl.roles(resource, account)`. This is the gate every
/// write button in tasks 34–37 enables against.
///
/// The connected address is part of the query key, so switching wallets re-reads on its own — no
/// reload, and no stale "you may do this" left on screen from the previous account.
export function useEnsNameRoles(state: EnsNameState | null | undefined) {
  const publicClient = usePublicClient();
  const { address } = useAccount();

  const registry = state?.registry ?? null;
  const resource = state?.resource ?? null;
  const resolver = state?.resolver && state.resolver !== zeroAddress ? state.resolver : null;
  const node = state?.node ?? null;

  return useBlockGatedQuery<EnsNameRoles | null>(
    ["ensNameRoles", state?.name, registry, resource?.toString(), resolver, address],
    async () => {
      if (!publicClient || !address || !registry || resource === null) return null;

      const registryContract = { address: registry, abi: enhancedAccessControlAbi } as const;
      const [registryBitmap, registryRootBitmap] = await publicClient.multicall({
        allowFailure: false,
        contracts: [
          { ...registryContract, functionName: "roles", args: [resource, address] },
          { ...registryContract, functionName: "roles", args: [ROOT_RESOURCE, address] },
        ] as const,
      });

      // A resolver that isn't a `PermissionedResolver` has no `roles()` at all — AgentVillage's own
      // `WildcardResolver` is one, and the call reverts outright. That's a fact about the resolver,
      // not a failed read, so it degrades to "no resolver roles to report" instead of taking the
      // whole summary down with it.
      let resolverBitmap: bigint | null = null;
      if (resolver && node) {
        try {
          resolverBitmap = await publicClient.readContract({
            address: resolver,
            abi: enhancedAccessControlAbi,
            functionName: "roles",
            args: [resolverResource(node), address],
          });
        } catch {
          resolverBitmap = null;
        }
      }

      return {
        account: address,
        registryBitmap,
        registryRootBitmap,
        registryRoles: decodeRoles(registryBitmap, REGISTRY_ROLES.filter((role) => role.scope === "token")),
        registryRootRoles: decodeRoles(
          registryRootBitmap,
          REGISTRY_ROLES.filter((role) => role.scope === "root")
        ),
        resolverBitmap,
        resolverRoles: resolverBitmap === null ? null : decodeRoles(resolverBitmap, RESOLVER_ROLES),
      };
    },
    { enabled: !!publicClient && !!address && !!registry && resource !== null }
  );
}
