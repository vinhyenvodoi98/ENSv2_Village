export { useAgentTree, fetchAgentTree, AGENT_TIERS, type AgentTier, type AgentTreeNode } from "./useAgentTree";
export {
  useNamespaceTree,
  useKingdomRegistry,
  useKingdomOwner,
  flattenNamespace,
  buildResolverIndex,
  namespaceKey,
  type NamespaceNode,
} from "./useNamespaceTree";
export { useAgentRecords, type AgentRecord, type AgentRecords } from "./useAgentRecords";
export { useRecordParent, type RecordParentLink } from "./useRecordParent";
export { useWildcardRecord, type WildcardRecord } from "./useWildcardRecord";
export { useResolve, type ResolveResult } from "./useResolve";
export { useEnsAvatars, type EnsAvatarDirectory } from "./useEnsAvatars";
export { useRoles, type RoleGrant } from "./useRoles";
export { useLastHeartbeats, type LastHeartbeat } from "./useLastHeartbeats";
export { useAgentEvents, type AgentEvent } from "./useAgentEvents";
export { useOwnedEthNames, type OwnedEthName } from "./useOwnedEthNames";
export { useSelectedKingdom } from "./useSelectedKingdom";
export { useClaimName, hasStoredClaim, CLAIM_DURATION_OPTIONS, type ClaimStep } from "./useClaimName";
export { useFoundKingdom } from "./useFoundKingdom";
export { useKeyWriters, type KeyWriterGrant } from "./useKeyWriters";
export { useEffectiveRoles } from "./useEffectiveRoles";
export { useTxAction, useDeployAction, useDeployedContractAddress, describeError, type TxState } from "./useTxAction";
export {
  ROLE,
  hasRole,
  isRoleAdmin,
  canWriteKey,
  canManageKey,
  STANDARD_RECORD_KEYS,
  type RecordKeyDef,
  type RecordKeyKind,
} from "./permissions";
export { useBlockGatedQuery } from "./query";
export { fetchContractEventsChunked } from "./logs";
export { useNameChildren, type EnsChildName, type EnsNameChildren } from "./useNameChildren";

// Task 33 — ENSv2 control panel read layer. Deliberately free of AgentVillage's own
// `AgentRegistry` tier ladder: everything below maps one-to-one onto a function ENSv2 itself
// exposes (`IRegistry`, `IPermissionedRegistry`, `IEnhancedAccessControl`, `IUniversalResolver`).
//
// Re-exported here for discoverability, but the control-panel routes import these from their own
// modules directly rather than through this barrel: pulling in `@/lib/ens` would drag the whole
// agent/tier/heartbeat stack into `/ens`'s module graph, which task 33 explicitly rules out.
export {
  useEnsName,
  useEnsNameRoles,
  NAME_STATUS,
  type EnsNameState,
  type EnsNameRoles,
  type NameStatus,
  type RegistryHop,
} from "./useEnsName";
export {
  fetchReverseName,
  useReverseName,
  ETH_COIN_TYPE,
  REVERSE_COIN_TYPE,
  type ReverseName,
} from "./useReverseName";
export {
  addressPath,
  ensPath,
  labelhash,
  leafLabel,
  nameNode,
  normalizeName,
  parentName,
  parseSearchInput,
  splitLabels,
  type SearchTarget,
} from "./name";
export {
  ADMIN_ROLE_SHIFT,
  REGISTRY_ROLES,
  RESOLVER_ROLES,
  ROOT_RESOURCE,
  decodeRoles,
  hasRoleBit,
  heldRoles,
  resolverResource,
  roleBit,
  type DecodedRole,
  type EnsRoleDef,
  type EnsRoleScope,
} from "./registryRoles";
