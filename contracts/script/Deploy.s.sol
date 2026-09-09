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
/// Precondition: `PARENT_LABEL` (e.g. `agentvillage`) must already be registered on Sepolia
/// `ETHRegistry` with `DEPLOYER_PRIVATE_KEY`'s address as owner, via `ETHRegistrar`'s
/// commit/register flow (see `docs/ensv2-reference.md` §2 and §"Chưa xác minh được", and
/// `contracts/script/README.md` for the exact commands used) — this script only attaches
/// contracts to an already-owned name, it does not register one.
contract Deploy is Script {
    /// @dev ETHRegistry (`PermissionedRegistry` for `.eth`) on Sepolia — verified via `cast code`
    ///      in `docs/ensv2-reference.md` §1. These two ENSv2-owned addresses (not ours) are the
    ///      only ones this repo is allowed to hardcode — both get recorded into
    ///      `deployments.json` below precisely so nothing downstream has to repeat that.
    address internal constant ETH_REGISTRY = 0xBDC85dD5b15D7ecb354cd7cb6f2c50b4f2c4F0E2;

    /// @dev `ManagedUniversalResolverProxy` on Sepolia — verified via `cast code` in
    ///      `docs/ensv2-reference.md` §1. The real address a dApp calls to resolve.
    address internal constant UNIVERSAL_RESOLVER = 0x6d80F2172CFdEc5730fE683860C33d26fC42e6F1;

    string internal constant PARENT_LABEL = "agentvillage";

    /// @dev `cast namehash "agentvillage.eth"`.
    bytes32 internal constant PARENT_NODE =
        0x50beecd863f427e95caa987d9dd9c85fe7c8498708329c53022f969be631ec86;

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        IPermissionedRegistry ethRegistry = IPermissionedRegistry(ETH_REGISTRY);
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

        _writeDeployments(registry, stateStore, wildcardResolver);
    }

    /// @dev Single source of truth for every AgentVillage address, read by both the frontend
    ///      (task 10) and the agent runner (task 15) — no address may be hardcoded anywhere else.
    function _writeDeployments(
        AgentRegistry registry,
        WildcardStateStore stateStore,
        WildcardResolver wildcardResolver
    )
        internal
    {
        string memory json = "deployments";
        vm.serializeUint(json, "chainId", block.chainid);
        vm.serializeUint(json, "deployBlock", block.number);
        vm.serializeAddress(json, "ethRegistry", ETH_REGISTRY);
        vm.serializeAddress(json, "universalResolver", UNIVERSAL_RESOLVER);
        vm.serializeAddress(json, "agentRegistry", address(registry));
        vm.serializeAddress(json, "agentResolver", address(registry.defaultResolver()));
        vm.serializeAddress(json, "wildcardStateStore", address(stateStore));
        vm.serializeAddress(json, "wildcardResolver", address(wildcardResolver));
        vm.serializeString(json, "parentName", string.concat(PARENT_LABEL, ".eth"));
        string memory out = vm.serializeBytes32(json, "parentNode", PARENT_NODE);

        vm.writeJson(out, string.concat(vm.projectRoot(), "/../src/lib/contracts/deployments.json"));
    }
}
