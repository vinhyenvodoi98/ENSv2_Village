// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";

import {IAddrResolver} from "@ens/contracts/resolvers/profiles/IAddrResolver.sol";
import {ITextResolver} from "@ens/contracts/resolvers/profiles/ITextResolver.sol";
import {NameCoder} from "@ens/contracts/utils/NameCoder.sol";

import {ILabelStore} from "ensv2/utils/interfaces/ILabelStore.sol";
import {IRegistry} from "ensv2/registry/interfaces/IRegistry.sol";
import {PermissionedRegistry} from "ensv2/registry/PermissionedRegistry.sol";
import {RegistryRolesLib} from "ensv2/registry/libraries/RegistryRolesLib.sol";

import {AgentRegistry} from "../src/AgentRegistry.sol";
import {AgentResolver} from "../src/AgentResolver.sol";
import {WildcardResolver} from "../src/WildcardResolver.sol";
import {WildcardStateStore} from "../src/WildcardStateStore.sol";

/// @notice Forks Sepolia and attaches `WildcardResolver` as the resolver of a real
/// `PermissionedRegistry` (the same ENSv2 implementation `agentvillage.eth` itself will use,
/// see task 09) standing in for our not-yet-owned parent name — same workaround as
/// `AgentRegistryForkTest`. This proves `resolve(bytes,bytes)` behaves correctly against real
/// deployed ENSv2 library bytecode (`NameCoder`, `ILabelStore`, `PermissionedRegistry`), which
/// is exactly the mechanism `UniversalResolverV2` invokes once it finds this resolver during
/// traversal (`docs/ensv2-reference.md` §5). Driving an actual end-to-end call through the
/// live `ManagedUniversalResolverProxy` needs `agentvillage.eth` to be a real, owned node in
/// the root tree — out of scope until task 09.
contract WildcardResolverForkTest is Test {
    ILabelStore constant LABEL_STORE = ILabelStore(0x532CD0CC4AC0793d838F71A67d29B2D790D18777);

    PermissionedRegistry internal parentRegistry;
    AgentRegistry internal agentRegistry;
    AgentResolver internal agentResolver;
    WildcardStateStore internal stateStore;
    WildcardResolver internal wildcard;

    address internal admin = makeAddr("admin");
    address internal agentOwner = makeAddr("agentOwner");
    address internal agentKey = makeAddr("agentKey");

    string constant PARENT_LABEL = "agentvillage-test";
    bytes32 internal parentNode;

    function setUp() public {
        uint256 forkId = vm.createFork(vm.envString("SEPOLIA_RPC_URL"));
        vm.selectFork(forkId);

        vm.startPrank(admin);
        parentRegistry = new PermissionedRegistry(
            LABEL_STORE,
            admin,
            RegistryRolesLib.ROLE_REGISTRAR | RegistryRolesLib.ROLE_SET_SUBREGISTRY
                | RegistryRolesLib.ROLE_SET_RESOLVER | RegistryRolesLib.ROLE_SET_PARENT
        );
        agentRegistry = new AgentRegistry(admin);
        agentResolver = new AgentResolver(agentRegistry);
        stateStore = new WildcardStateStore(agentRegistry);

        parentNode = NameCoder.namehash(NameCoder.encode(string.concat(PARENT_LABEL, ".eth")), 0);
        wildcard = new WildcardResolver(agentRegistry, stateStore, parentNode);

        parentRegistry.register(
            PARENT_LABEL, admin, IRegistry(address(0)), address(0), 0, uint64(block.timestamp + 365 days)
        );
        parentRegistry.setSubregistry(uint256(keccak256(bytes(PARENT_LABEL))), agentRegistry);
        parentRegistry.setResolver(uint256(keccak256(bytes(PARENT_LABEL))), address(wildcard));
        agentRegistry.setParent(parentRegistry, PARENT_LABEL);
        vm.stopPrank();
    }

    function _dnsName(string memory label) internal pure returns (bytes memory) {
        return NameCoder.encode(string.concat(label, ".", PARENT_LABEL, ".eth"));
    }

    function test_unmintedLabel_resolvesThroughWildcard_doesNotRevert() public view {
        // Random unminted label — never spawned in AgentRegistry.
        bytes memory data = abi.encodeWithSelector(IAddrResolver.addr.selector, bytes32(uint256(0xdead)));
        bytes memory result = wildcard.resolve(_dnsName("scout-random-42"), data);
        address decoded = abi.decode(result, (address));
        assertTrue(decoded != address(0));

        bytes memory tierData =
            abi.encodeWithSelector(ITextResolver.text.selector, bytes32(uint256(0xdead)), "agent.tier");
        assertEq(abi.decode(wildcard.resolve(_dnsName("scout-random-42"), tierData), (string)), "wildcard");
    }

    function test_mintedLabel_yieldsToAgentResolver_provingPriorityOrder() public {
        address wildcardDerived = address(
            uint160(uint256(keccak256(abi.encodePacked(parentNode, string("scout-random-42")))))
        );

        vm.prank(admin);
        bytes32 labelhash = agentRegistry.spawn(
            "scout-random-42", agentOwner, agentKey, AgentRegistry.Tier.Wildcard, 0, true, true, address(agentResolver)
        );

        address realAddr = makeAddr("realOnchainAddr");
        vm.prank(agentOwner);
        agentResolver.grantKeyWriter(labelhash, "addr", agentOwner);
        vm.prank(agentOwner);
        agentResolver.setAddr(labelhash, realAddr);

        bytes memory data = abi.encodeWithSelector(IAddrResolver.addr.selector, bytes32(uint256(0xdead)));
        address decoded = abi.decode(wildcard.resolve(_dnsName("scout-random-42"), data), (address));

        assertEq(decoded, realAddr);
        assertTrue(decoded != wildcardDerived);
    }

    function test_wildcardAgent_realHeartbeat_writtenByOwnKey_readBackThroughResolve() public {
        address wildcardKey = makeAddr("wildcardKey");

        vm.prank(admin);
        stateStore.setWildcardKey("scout-heartbeat", wildcardKey);

        vm.prank(wildcardKey);
        stateStore.setStatus("scout-heartbeat", "alive");

        bytes memory data =
            abi.encodeWithSelector(ITextResolver.text.selector, bytes32(uint256(0xdead)), "agent.status");
        assertEq(abi.decode(wildcard.resolve(_dnsName("scout-heartbeat"), data), (string)), "alive");
    }
}
