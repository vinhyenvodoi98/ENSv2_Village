// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";

import {AgentRegistry} from "../src/AgentRegistry.sol";
import {WildcardStateStore} from "../src/WildcardStateStore.sol";

/// @notice Seeds the AgentVillage fleet deployed by `Deploy.s.sol` with real on-chain agents so
///         the UI has something to show immediately (task 09).
///
/// **This is seed data, not fake data** — every agent below is minted for real on Sepolia
/// (or, for the wildcard-tier one, assigned a real signing key in `WildcardStateStore`), through
/// the exact same `AgentRegistry`/`WildcardStateStore` entry points a human fleet owner would
/// use. Nothing here is mocked or hardcoded outside of the addresses read from
/// `deployments.json`, which this script itself reads rather than hardcoding.
///
/// Agent keys are derived deterministically from a label-specific seed phrase via `vm.addr` —
/// reproducible or replaceable at any time by re-running this script with different keys
/// (`AgentRegistry.setAgentKey`), but real, distinct signing addresses, not the deployer's own.
contract Seed is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        string memory deploymentsJson =
            vm.readFile(string.concat(vm.projectRoot(), "/../src/lib/contracts/deployments.json"));
        AgentRegistry registry =
            AgentRegistry(vm.parseJsonAddress(deploymentsJson, ".agentRegistry"));
        WildcardStateStore stateStore =
            WildcardStateStore(vm.parseJsonAddress(deploymentsJson, ".wildcardStateStore"));
        address agentResolver = vm.parseJsonAddress(deploymentsJson, ".agentResolver");

        address scoutKey = vm.addr(uint256(keccak256("agentvillage-seed-scout-00-key")));
        address sentinelKey = vm.addr(uint256(keccak256("agentvillage-seed-sentinel-01-key")));
        address curatorKey = vm.addr(uint256(keccak256("agentvillage-seed-curator-02-key")));

        vm.startBroadcast(deployerKey);

        // Tier 0 (Wildcard): never minted in `AgentRegistry` — zero mint gas by design (task 06).
        // Assigning a real key here is what lets `scout-00.agentvillage.eth` heartbeat for real
        // via `WildcardStateStore.setStatus`, resolved back out through `WildcardResolver`.
        stateStore.setWildcardKey("scout-00", scoutKey);

        // Tier 1 (Leased): expiring, revocable, not transferable (task 07's 0->1 terminal state).
        registry.spawn(
            "sentinel-01",
            deployer,
            sentinelKey,
            AgentRegistry.Tier.Leased,
            uint64(block.timestamp + 30 days),
            true,
            false,
            agentResolver
        );

        // Tier 2 (Owned): no longer revocable, transferable (task 07's 1->2 terminal state).
        registry.spawn(
            "curator-02",
            deployer,
            curatorKey,
            AgentRegistry.Tier.Owned,
            uint64(block.timestamp + 365 days),
            false,
            true,
            agentResolver
        );

        vm.stopBroadcast();

        console2.log("Wildcard  scout-00.agentvillage.eth    key:", scoutKey);
        console2.log("Leased    sentinel-01.agentvillage.eth  key:", sentinelKey);
        console2.log("Owned     curator-02.agentvillage.eth   key:", curatorKey);
    }
}
