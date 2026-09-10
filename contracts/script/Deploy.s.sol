// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";

import {IPermissionedRegistry} from "ensv2/registry/interfaces/IPermissionedRegistry.sol";
import {IRegistry} from "ensv2/registry/interfaces/IRegistry.sol";

import {AgentRegistry} from "../src/AgentRegistry.sol";
import {WildcardResolver} from "../src/WildcardResolver.sol";
import {WildcardStateStore} from "../src/WildcardStateStore.sol";

/// @notice Deploys the AgentVillage contract system to Sepolia and attaches it to the fleet's
///         parent ENSv2 name (task 09).
///
/// Deploy order: `AgentRegistry` (which deploys its own `AgentResolver` internally — see
/// `AgentRegistry.defaultResolver`, task 03/05) -> `WildcardStateStore` -> `WildcardResolver`
/// -> attach `AgentRegistry` as the parent name's subregistry and `WildcardResolver` as its
/// resolver on the real ENSv2 `ETHRegistry`. `Roles` (task 04) is a constants-only library with
/// no external functions, so it has nothing to deploy — its constants are inlined at compile time.
///
/// Precondition: `PARENT_LABEL` (e.g. `agentvillage`) must already be registered on the
/// **hackathon** ENSv2 deployment's `ETHRegistry` with `DEPLOYER_PRIVATE_KEY`'s address as owner
/// (task 30) — run `contracts/script/RegisterParent.s.sol` first. This script only attaches
/// contracts to an already-owned name, it does not register one.
contract Deploy is Script {
    string internal constant PARENT_LABEL = "agentvillage";

    /// @dev `cast namehash "agentvillage.eth"` — the same node regardless of which ENSv2
    ///      deployment `agentvillage.eth` is registered against.
    bytes32 internal constant PARENT_NODE =
        0x50beecd863f427e95caa987d9dd9c85fe7c8498708329c53022f969be631ec86;

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        HackathonAddresses memory ensAddrs = _readHackathonAddresses();
        IPermissionedRegistry ethRegistry = IPermissionedRegistry(ensAddrs.ethRegistry);
        uint256 anyId = uint256(keccak256(bytes(PARENT_LABEL)));

        require(
            ethRegistry.getOwner(anyId) == deployer,
            "Deploy: parent name not owned by DEPLOYER_PRIVATE_KEY's address - register it first"
        );

        vm.startBroadcast(deployerKey);

        AgentRegistry registry = new AgentRegistry(deployer);
        WildcardStateStore stateStore = new WildcardStateStore(registry);
        WildcardResolver wildcardResolver = new WildcardResolver(registry, stateStore, PARENT_NODE);

        registry.setParent(IRegistry(address(ethRegistry)), PARENT_LABEL);
        ethRegistry.setSubregistry(anyId, IRegistry(address(registry)));
        ethRegistry.setResolver(anyId, address(wildcardResolver));

        vm.stopBroadcast();

        console2.log("AgentRegistry:      ", address(registry));
        console2.log("AgentResolver:      ", address(registry.defaultResolver()));
        console2.log("WildcardStateStore: ", address(stateStore));
        console2.log("WildcardResolver:   ", address(wildcardResolver));

        _writeDeployments(registry, stateStore, wildcardResolver, ensAddrs);
    }

    /// @dev Groups the read-only ENS-side addresses so `_writeDeployments` doesn't need a
    ///      seven-parameter signature.
    struct HackathonAddresses {
        address ethRegistry;
        address ethRegistrar;
        address rootRegistry;
        address verifiableFactory;
        address mockUsdc;
        address universalResolver;
    }

    /// @dev ENS-side hackathon addresses (task 30) live in
    ///      `contracts/deployments/hackathon.json`, not hardcoded here — that file is sourced
    ///      from `docs/ensv2-reference.md`'s verified address table, and is the only place a
    ///      standard-Beta vs. hackathon swap needs to happen. `universalResolver` is
    ///      `upgradableUniversalResolverProxy` specifically (task 30 requirement 1: tested both
    ///      proxies' `resolve(bytes,bytes)` via `cast call` — see docs/ensv2-reference.md Result).
    function _readHackathonAddresses() internal view returns (HackathonAddresses memory) {
        string memory j = vm.readFile(string.concat(vm.projectRoot(), "/deployments/hackathon.json"));
        return HackathonAddresses({
            ethRegistry: vm.parseJsonAddress(j, ".ethRegistry"),
            ethRegistrar: vm.parseJsonAddress(j, ".ethRegistrar"),
            rootRegistry: vm.parseJsonAddress(j, ".rootRegistry"),
            verifiableFactory: vm.parseJsonAddress(j, ".verifiableFactory"),
            mockUsdc: vm.parseJsonAddress(j, ".mockUsdc"),
            universalResolver: vm.parseJsonAddress(j, ".upgradableUniversalResolverProxy")
        });
    }

    /// @dev Single source of truth for every AgentVillage + hackathon ENSv2 address, read by both
    ///      the frontend (task 10) and the agent runner (task 15) — no address may be hardcoded
    ///      anywhere else.
    function _writeDeployments(
        AgentRegistry registry,
        WildcardStateStore stateStore,
        WildcardResolver wildcardResolver,
        HackathonAddresses memory ens
    )
        internal
    {
        string memory json = "deployments";
        vm.serializeString(json, "deployment", "hackathon");
        vm.serializeUint(json, "chainId", block.chainid);
        vm.serializeUint(json, "deployBlock", block.number);
        vm.serializeAddress(json, "ethRegistry", ens.ethRegistry);
        vm.serializeAddress(json, "ethRegistrar", ens.ethRegistrar);
        vm.serializeAddress(json, "rootRegistry", ens.rootRegistry);
        vm.serializeAddress(json, "verifiableFactory", ens.verifiableFactory);
        vm.serializeAddress(json, "mockUsdc", ens.mockUsdc);
        vm.serializeAddress(json, "universalResolver", ens.universalResolver);
        vm.serializeAddress(json, "agentRegistry", address(registry));
        vm.serializeAddress(json, "agentResolver", address(registry.defaultResolver()));
        vm.serializeAddress(json, "wildcardStateStore", address(stateStore));
        vm.serializeAddress(json, "wildcardResolver", address(wildcardResolver));
        vm.serializeString(json, "parentName", string.concat(PARENT_LABEL, ".eth"));
        string memory out = vm.serializeBytes32(json, "parentNode", PARENT_NODE);

        vm.writeJson(out, string.concat(vm.projectRoot(), "/../src/lib/contracts/deployments.json"));
    }
}
