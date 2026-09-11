// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";

import {IPermissionedRegistry} from "ensv2/registry/interfaces/IPermissionedRegistry.sol";
import {IPermissionedResolver} from "ensv2/resolver/interfaces/IPermissionedResolver.sol";
import {PermissionedResolverLib} from "ensv2/resolver/libraries/PermissionedResolverLib.sol";
import {IRegistry} from "ensv2/registry/interfaces/IRegistry.sol";
import {IVerifiableFactory} from "@ensdomains/verifiable-factory/IVerifiableFactory.sol";

import {AgentRegistry} from "../src/AgentRegistry.sol";
import {WildcardResolver} from "../src/WildcardResolver.sol";
import {WildcardStateStore} from "../src/WildcardStateStore.sol";

/// @notice Deploys the AgentVillage contract system to Sepolia and attaches it to the fleet's
///         parent ENSv2 name (task 09).
///
/// Deploy order: a shared ENSv2 `PermissionedResolver` UUPS proxy (via `VerifiableFactory`,
/// pointed at the hackathon deployment's already-verified `permissionedResolverImpl`) -> pass its
/// address into `AgentRegistry`'s constructor as `defaultResolver` -> `WildcardStateStore` ->
/// `WildcardResolver` -> attach `AgentRegistry` as the parent name's subregistry and
/// `WildcardResolver` as its resolver on the real ENSv2 `ETHRegistry`. `Roles` (task 04) is a
/// constants-only library with no external functions, so it has nothing to deploy — its constants
/// are inlined at compile time.
///
/// Every agent gets a *real* ENSv2 resolver from day one now — no more bespoke `AgentResolver`
/// (removed; see task 39's plan). Per-key write access (`status`/`heartbeat`/`last-output` to the
/// agent's own key, `agent.endpoint`/`agent.model`/`avatar` to the owner) is granted by whichever
/// caller spawns/promotes the agent (`authorizeTextRoles`), not by this deploy script — this
/// script only needs the deployer to hold every `_ADMIN` bit on the shared resolver's
/// `ROOT_RESOURCE` so it *can* grant those later, which is what `initialize` below sets up.
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

    /// @dev `VerifiableFactory.deployProxy`'s user-supplied salt — this script only ever deploys
    ///      one shared resolver, so any fixed value works; the factory itself mixes in
    ///      `msg.sender` before hashing, so this can't collide with another deployer's proxy.
    uint256 internal constant RESOLVER_SALT = uint256(keccak256("agentvillage-permissioned-resolver"));

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

        // The fleet's shared ENSv2 `PermissionedResolver` — a UUPS proxy over the hackathon
        // deployment's already-verified implementation, `initialize`d with `deployer` holding
        // every record-setter role *and* its admin bit at `ROOT_RESOURCE`. The admin bits are
        // what let `deployer` (or anything acting as `FLEET_ADMIN`) call `authorizeTextRoles` for
        // each newly spawned/promoted agent afterward; the plain bits let `deployer` itself write
        // records directly (useful for seeding/testing) without a separate per-name grant.
        uint256 resolverRoleBitmap = PermissionedResolverLib.ROLE_SET_TEXT
            | PermissionedResolverLib.ROLE_SET_TEXT_ADMIN | PermissionedResolverLib.ROLE_SET_ADDR
            | PermissionedResolverLib.ROLE_SET_ADDR_ADMIN | PermissionedResolverLib.ROLE_SET_CONTENTHASH
            | PermissionedResolverLib.ROLE_SET_CONTENTHASH_ADMIN | PermissionedResolverLib.ROLE_SET_DATA
            | PermissionedResolverLib.ROLE_SET_DATA_ADMIN;
        address resolverProxy = IVerifiableFactory(ensAddrs.verifiableFactory).deployProxy(
            ensAddrs.permissionedResolverImpl,
            RESOLVER_SALT,
            abi.encodeCall(IPermissionedResolver.initialize, (deployer, resolverRoleBitmap, new bytes[](0)))
        );

        AgentRegistry registry = new AgentRegistry(deployer, resolverProxy);
        WildcardStateStore stateStore = new WildcardStateStore(registry);
        WildcardResolver wildcardResolver = new WildcardResolver(registry, stateStore, PARENT_NODE);

        registry.setParent(IRegistry(address(ethRegistry)), PARENT_LABEL);
        ethRegistry.setSubregistry(anyId, IRegistry(address(registry)));
        ethRegistry.setResolver(anyId, address(wildcardResolver));

        vm.stopBroadcast();

        console2.log("PermissionedResolver:", resolverProxy);
        console2.log("AgentRegistry:      ", address(registry));
        console2.log("WildcardStateStore: ", address(stateStore));
        console2.log("WildcardResolver:   ", address(wildcardResolver));

        _writeDeployments(registry, stateStore, wildcardResolver, resolverProxy, ensAddrs);
    }

    /// @dev Groups the read-only ENS-side addresses so `_writeDeployments` doesn't need a
    ///      seven-parameter signature.
    struct HackathonAddresses {
        address ethRegistry;
        address ethRegistrar;
        address rootRegistry;
        address verifiableFactory;
        address permissionedResolverImpl;
        address mockUsdc;
        address universalResolver;
        uint256 ethRegistrarFirstBlock;
        uint256 ensDeploymentFirstBlock;
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
            permissionedResolverImpl: vm.parseJsonAddress(j, ".permissionedResolverImpl"),
            mockUsdc: vm.parseJsonAddress(j, ".mockUsdc"),
            universalResolver: vm.parseJsonAddress(j, ".upgradableUniversalResolverProxy"),
            // Not an address, but the same kind of fact: an ENS-side constant this repo must not
            // hardcode twice. The frontend floors its "names owned by" log scan here, because the
            // registrar predates our own `deployBlock` (see the comment in hackathon.json).
            ethRegistrarFirstBlock: vm.parseJsonUint(j, ".ethRegistrarFirstBlock"),
            // Floor for enumerating a name's subnames via `LabelRegistered` on whatever registry
            // governs them (task 34) — no registry in this deployment predates the root registry
            // itself. See the comment in hackathon.json for how this was derived.
            ensDeploymentFirstBlock: vm.parseJsonUint(j, ".ensDeploymentFirstBlock")
        });
    }

    /// @dev Single source of truth for every AgentVillage + hackathon ENSv2 address, read by both
    ///      the frontend (task 10) and the agent runner (task 15) — no address may be hardcoded
    ///      anywhere else.
    function _writeDeployments(
        AgentRegistry registry,
        WildcardStateStore stateStore,
        WildcardResolver wildcardResolver,
        address resolverProxy,
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
        vm.serializeUint(json, "ethRegistrarFirstBlock", ens.ethRegistrarFirstBlock);
        vm.serializeUint(json, "ensDeploymentFirstBlock", ens.ensDeploymentFirstBlock);
        vm.serializeAddress(json, "rootRegistry", ens.rootRegistry);
        vm.serializeAddress(json, "verifiableFactory", ens.verifiableFactory);
        vm.serializeAddress(json, "permissionedResolverImpl", ens.permissionedResolverImpl);
        vm.serializeAddress(json, "mockUsdc", ens.mockUsdc);
        vm.serializeAddress(json, "universalResolver", ens.universalResolver);
        vm.serializeAddress(json, "agentRegistry", address(registry));
        vm.serializeAddress(json, "permissionedResolver", resolverProxy);
        vm.serializeAddress(json, "wildcardStateStore", address(stateStore));
        vm.serializeAddress(json, "wildcardResolver", address(wildcardResolver));
        vm.serializeString(json, "parentName", string.concat(PARENT_LABEL, ".eth"));
        string memory out = vm.serializeBytes32(json, "parentNode", PARENT_NODE);

        vm.writeJson(out, string.concat(vm.projectRoot(), "/../src/lib/contracts/deployments.json"));
    }
}
