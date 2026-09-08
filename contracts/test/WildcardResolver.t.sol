// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IAddrResolver} from "@ens/contracts/resolvers/profiles/IAddrResolver.sol";
import {IContentHashResolver} from "@ens/contracts/resolvers/profiles/IContentHashResolver.sol";
import {IExtendedResolver} from "@ens/contracts/resolvers/profiles/IExtendedResolver.sol";
import {ITextResolver} from "@ens/contracts/resolvers/profiles/ITextResolver.sol";
import {NameCoder} from "@ens/contracts/utils/NameCoder.sol";

import {AgentRegistry} from "../src/AgentRegistry.sol";
import {AgentResolver} from "../src/AgentResolver.sol";
import {WildcardResolver} from "../src/WildcardResolver.sol";
import {WildcardStateStore} from "../src/WildcardStateStore.sol";

contract WildcardResolverTest is Test {
    AgentRegistry internal registry;
    AgentResolver internal agentResolver;
    WildcardStateStore internal stateStore;
    WildcardResolver internal wildcard;

    address internal fleetOwner = makeAddr("fleetOwner");
    address internal agentOwner = makeAddr("agentOwner");
    address internal agentKey = makeAddr("agentKey");
    address internal wildcardKey = makeAddr("wildcardKey");
    address internal stranger = makeAddr("stranger");

    bytes32 internal parentNode = keccak256("agentvillage.eth");

    // Wrapped in a fake outer label so `resolve` is exercised exactly like a real
    // UniversalResolver call — it only ever reads the first label.
    bytes internal constant SCOUT_01_NAME_SUFFIX = "agentvillage.eth";

    function setUp() public {
        registry = new AgentRegistry(fleetOwner);
        agentResolver = new AgentResolver(registry);
        stateStore = new WildcardStateStore(registry);
        wildcard = new WildcardResolver(registry, stateStore, parentNode);
    }

    function _nameFor(string memory label) internal pure returns (bytes memory) {
        return NameCoder.encode(string.concat(label, ".agentvillage.eth"));
    }

    ////////////////////////////////////////////////////////////////////////
    // supportsInterface
    ////////////////////////////////////////////////////////////////////////

    function test_supportsInterface() public view {
        assertTrue(wildcard.supportsInterface(type(IExtendedResolver).interfaceId));
        assertTrue(wildcard.supportsInterface(type(IERC165).interfaceId));
        assertFalse(wildcard.supportsInterface(bytes4(0xdeadbeef)));
    }

    ////////////////////////////////////////////////////////////////////////
    // Unminted label — resolved entirely by rule, never reverts
    ////////////////////////////////////////////////////////////////////////

    function test_unminted_addr_isDeterministic_andNeverReverts() public view {
        bytes memory data = abi.encodeWithSelector(IAddrResolver.addr.selector, bytes32(uint256(0xdead)));
        bytes memory result = wildcard.resolve(_nameFor("scout-01"), data);
        address decoded = abi.decode(result, (address));

        address expected =
            address(uint160(uint256(keccak256(abi.encodePacked(parentNode, string("scout-01"))))));
        assertEq(decoded, expected);
    }

    function test_unminted_addr_differsPerLabel() public view {
        bytes memory dataA = abi.encodeWithSelector(IAddrResolver.addr.selector, bytes32(uint256(1)));
        bytes memory dataB = abi.encodeWithSelector(IAddrResolver.addr.selector, bytes32(uint256(1)));

        address a = abi.decode(wildcard.resolve(_nameFor("scout-01"), dataA), (address));
        address b = abi.decode(wildcard.resolve(_nameFor("scout-02"), dataB), (address));
        assertTrue(a != b);
    }

    function test_unminted_tier_isWildcard() public view {
        bytes memory data = abi.encodeWithSelector(ITextResolver.text.selector, bytes32(uint256(0xdead)), "agent.tier");
        bytes memory result = wildcard.resolve(_nameFor("scout-01"), data);
        assertEq(abi.decode(result, (string)), "wildcard");
    }

    function test_unminted_contenthash_isEmpty() public view {
        bytes memory data = abi.encodeWithSelector(IContentHashResolver.contenthash.selector, bytes32(uint256(0xdead)));
        bytes memory result = wildcard.resolve(_nameFor("scout-01"), data);
        assertEq(abi.decode(result, (bytes)).length, 0);
    }

    function test_unminted_unknownTextKey_isEmpty() public view {
        bytes memory data = abi.encodeWithSelector(ITextResolver.text.selector, bytes32(uint256(0xdead)), "bio");
        bytes memory result = wildcard.resolve(_nameFor("scout-01"), data);
        assertEq(abi.decode(result, (string)), "");
    }

    function test_unsupportedSelector_reverts() public {
        bytes memory data = abi.encodeWithSelector(bytes4(0x12345678), bytes32(uint256(0xdead)));
        vm.expectRevert(abi.encodeWithSelector(WildcardResolver.UnsupportedQuery.selector, bytes4(0x12345678)));
        wildcard.resolve(_nameFor("scout-01"), data);
    }

    ////////////////////////////////////////////////////////////////////////
    // Wildcard heartbeat — the agent writes with its own key, resolution reads it back
    ////////////////////////////////////////////////////////////////////////

    function test_wildcardAgent_canWriteStatus_withOwnKey_andReadItBack() public {
        vm.prank(fleetOwner);
        stateStore.setWildcardKey("scout-01", wildcardKey);

        vm.prank(wildcardKey);
        stateStore.setStatus("scout-01", "online");

        bytes memory data = abi.encodeWithSelector(ITextResolver.text.selector, bytes32(uint256(0xdead)), "agent.status");
        bytes memory result = wildcard.resolve(_nameFor("scout-01"), data);
        assertEq(abi.decode(result, (string)), "online");
    }

    function test_wildcardAgent_addr_usesFleetConfiguredKey_whenAssigned() public {
        vm.prank(fleetOwner);
        stateStore.setWildcardKey("scout-01", wildcardKey);

        bytes memory data = abi.encodeWithSelector(IAddrResolver.addr.selector, bytes32(uint256(0xdead)));
        bytes memory result = wildcard.resolve(_nameFor("scout-01"), data);
        assertEq(abi.decode(result, (address)), wildcardKey);
    }

    function test_stranger_cannotWriteStatus() public {
        vm.prank(fleetOwner);
        stateStore.setWildcardKey("scout-01", wildcardKey);

        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(
                WildcardStateStore.NotWildcardKey.selector, keccak256(bytes("scout-01")), stranger
            )
        );
        stateStore.setStatus("scout-01", "hijacked");
    }

    function test_setWildcardKey_requiresFleetAdmin() public {
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(
                WildcardStateStore.NotFleetAdmin.selector, keccak256(bytes("scout-01")), stranger
            )
        );
        stateStore.setWildcardKey("scout-01", wildcardKey);
    }

    ////////////////////////////////////////////////////////////////////////
    // Priority: a real mint always yields — the wildcard rules never apply to it
    ////////////////////////////////////////////////////////////////////////

    function test_mintedLabel_resolvesThroughAgentResolver_notWildcardRules() public {
        vm.prank(fleetOwner);
        bytes32 labelhash = registry.spawn(
            "scout-01", agentOwner, agentKey, AgentRegistry.Tier.Wildcard, 0, true, true, address(agentResolver)
        );

        address realAddr = makeAddr("realOnchainAddr");
        vm.prank(agentOwner);
        agentResolver.grantKeyWriter(labelhash, "addr", agentOwner);
        vm.prank(agentOwner);
        agentResolver.setAddr(labelhash, realAddr);

        bytes memory data = abi.encodeWithSelector(IAddrResolver.addr.selector, bytes32(uint256(0xdead)));
        bytes memory result = wildcard.resolve(_nameFor("scout-01"), data);
        address decoded = abi.decode(result, (address));

        assertEq(decoded, realAddr);
        address wildcardDerived =
            address(uint160(uint256(keccak256(abi.encodePacked(parentNode, string("scout-01"))))));
        assertTrue(decoded != wildcardDerived);
    }

    function test_mintedLabel_tier_comesFromAgentResolver_notHardcodedWildcard() public {
        // `agent.tier` is a reserved key on AgentResolver (task 05) — nobody can write it
        // through the record store, so a minted agent's resolver read is always empty, never
        // the wildcard layer's hardcoded `"wildcard"`. Proves the wildcard's `"agent.tier" ==
        // "wildcard"` rule genuinely stops applying once resolution yields to AgentResolver.
        vm.prank(fleetOwner);
        registry.spawn(
            "scout-01", agentOwner, agentKey, AgentRegistry.Tier.Wildcard, 0, true, true, address(agentResolver)
        );

        bytes memory data = abi.encodeWithSelector(ITextResolver.text.selector, bytes32(uint256(0xdead)), "agent.tier");
        bytes memory result = wildcard.resolve(_nameFor("scout-01"), data);
        assertEq(abi.decode(result, (string)), "");
    }

    function test_expiredAgent_fallsBackToWildcardRules_becauseRegistryReportsInactive() public {
        vm.prank(fleetOwner);
        registry.spawn(
            "scout-01",
            agentOwner,
            agentKey,
            AgentRegistry.Tier.Wildcard,
            uint64(block.timestamp + 1),
            true,
            true,
            address(agentResolver)
        );
        vm.warp(block.timestamp + 2);

        bytes memory data = abi.encodeWithSelector(ITextResolver.text.selector, bytes32(uint256(0xdead)), "agent.tier");
        bytes memory result = wildcard.resolve(_nameFor("scout-01"), data);
        assertEq(abi.decode(result, (string)), "wildcard");
    }
}
