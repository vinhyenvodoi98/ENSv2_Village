import deployments from "./deployments.json";

/// Typed accessor for `deployments.json` (written by `contracts/script/Deploy.s.sol`, task 09) —
/// the single source of truth for every AgentVillage/ENSv2 address. Nothing in `src/` may
/// hardcode a `0x...` address outside of this file re-exporting that JSON.
export const CONTRACTS = {
  chainId: deployments.chainId,
  deployBlock: BigInt(deployments.deployBlock),
  ethRegistry: deployments.ethRegistry as `0x${string}`,
  universalResolver: deployments.universalResolver as `0x${string}`,
  agentRegistry: deployments.agentRegistry as `0x${string}`,
  agentResolver: deployments.agentResolver as `0x${string}`,
  wildcardStateStore: deployments.wildcardStateStore as `0x${string}`,
  wildcardResolver: deployments.wildcardResolver as `0x${string}`,
  parentName: deployments.parentName,
  parentNode: deployments.parentNode as `0x${string}`,
} as const;
