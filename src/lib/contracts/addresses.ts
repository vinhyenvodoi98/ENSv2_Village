import deployments from "./deployments.json";

/// Typed accessor for `deployments.json` (written by `contracts/script/Deploy.s.sol`, task 09) —
/// the single source of truth for every AgentVillage/ENSv2 address. Nothing in `src/` may
/// hardcode a `0x...` address outside of this file re-exporting that JSON.
export const CONTRACTS = {
  deployment: deployments.deployment,
  chainId: deployments.chainId,
  deployBlock: BigInt(deployments.deployBlock),
  ethRegistry: deployments.ethRegistry as `0x${string}`,
  ethRegistrar: deployments.ethRegistrar as `0x${string}`,
  /// Earliest block that can hold a `NameRegistered` event from `ethRegistrar` — the floor for any
  /// "which names does this address own" scan. Deliberately *not* `deployBlock`: the registrar
  /// predates AgentVillage's own contracts, and `agentvillage.eth` was registered three blocks
  /// before them, so scanning from `deployBlock` hid it.
  ethRegistrarFirstBlock: BigInt(deployments.ethRegistrarFirstBlock),
  /// Earliest block any contract in this hackathon ENSv2 deployment could have logged anything —
  /// the floor for enumerating a name's subnames via `LabelRegistered` on whatever registry
  /// governs them (task 34). No registry here predates the root registry itself.
  ensDeploymentFirstBlock: BigInt(deployments.ensDeploymentFirstBlock),
  rootRegistry: deployments.rootRegistry as `0x${string}`,
  verifiableFactory: deployments.verifiableFactory as `0x${string}`,
  /// The hackathon ENSv2 deployment's already-verified `PermissionedResolver` UUPS implementation
  /// (`contracts/deployments/hackathon.json`) — what task 35's self-service "deploy your own
  /// resolver" flow points `VerifiableFactory.deployProxy` at. Not something this app deploys.
  permissionedResolverImpl: deployments.permissionedResolverImpl as `0x${string}`,
  mockUsdc: deployments.mockUsdc as `0x${string}`,
  universalResolver: deployments.universalResolver as `0x${string}`,
  agentRegistry: deployments.agentRegistry as `0x${string}`,
  agentResolver: deployments.agentResolver as `0x${string}`,
  wildcardStateStore: deployments.wildcardStateStore as `0x${string}`,
  wildcardResolver: deployments.wildcardResolver as `0x${string}`,
  parentName: deployments.parentName,
  parentNode: deployments.parentNode as `0x${string}`,
} as const;
