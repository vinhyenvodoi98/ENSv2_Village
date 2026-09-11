import { usePublicClient } from "wagmi";
import { enhancedAccessControlAbi } from "@/lib/contracts/abis";
import { useBlockGatedQuery } from "./query";
import { decodeRoles, REGISTRY_ROLES, type DecodedRole } from "./registryRoles";
import type { EnsChildName } from "./useNameChildren";

const REGISTRY_TOKEN_ROLES = REGISTRY_ROLES.filter((role) => role.scope === "token");

/// Task 36's "the actions the connected wallet's roles actually permit" — one `roles(resource,
/// account)` read per child, on the shared subregistry contract all of them live in, batched into a
/// single multicall the same way `useRoleAssignees.ts` batches per-candidate reads. Keyed by
/// `tokenId` (stable across a child's own re-registration the way `resource` is not).
export function useChildRoles(subregistry: `0x${string}` | null, children: readonly EnsChildName[], account: `0x${string}` | undefined) {
  const publicClient = usePublicClient();
  const tokenIds = children.map((c) => c.tokenId.toString());

  return useBlockGatedQuery<Map<string, DecodedRole[]>>(
    ["childRoles", subregistry, account, tokenIds.join(",")],
    async () => {
      const empty = new Map<string, DecodedRole[]>();
      if (!publicClient || !subregistry || !account || children.length === 0) return empty;

      const contract = { address: subregistry, abi: enhancedAccessControlAbi } as const;
      const bitmaps = await publicClient.multicall({
        allowFailure: false,
        contracts: children.map(
          (child) => ({ ...contract, functionName: "roles", args: [child.resource, account] }) as const
        ),
      });

      const map = new Map<string, DecodedRole[]>();
      children.forEach((child, i) => {
        map.set(child.tokenId.toString(), decodeRoles(bitmaps[i], REGISTRY_TOKEN_ROLES));
      });
      return map;
    },
    { enabled: !!publicClient && !!subregistry && !!account && children.length > 0 }
  );
}
