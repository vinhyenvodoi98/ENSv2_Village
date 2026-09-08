// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IAddrResolver} from "@ens/contracts/resolvers/profiles/IAddrResolver.sol";
import {IContentHashResolver} from "@ens/contracts/resolvers/profiles/IContentHashResolver.sol";
import {ITextResolver} from "@ens/contracts/resolvers/profiles/ITextResolver.sol";

import {AgentRegistry} from "../src/AgentRegistry.sol";
import {AgentResolver} from "../src/AgentResolver.sol";
import {Roles} from "../src/Roles.sol";

contract AgentResolverTest is Test {
    AgentRegistry internal registry;
    AgentResolver internal resolver;

    address internal fleetOwner = makeAddr("fleetOwner");
    address internal agentOwner = makeAddr("agentOwner");
    address internal agentKey = makeAddr("agentKey");
    address internal operator = makeAddr("operator");
    address internal stranger = makeAddr("stranger");

    bytes32 internal node;

    function setUp() public {
        registry = new AgentRegistry(fleetOwner);
        resolver = new AgentResolver(registry);

        vm.prank(fleetOwner);
        node = registry.spawn(
            "agent1", agentOwner, agentKey, AgentRegistry.Tier.Wildcard, 0, true, true, address(resolver)
        );
    }

    ////////////////////////////////////////////////////////////////////////
    // supportsInterface
    ////////////////////////////////////////////////////////////////////////

    function test_supportsInterface() public view {
        assertTrue(resolver.supportsInterface(type(IAddrResolver).interfaceId));
        assertTrue(resolver.supportsInterface(type(ITextResolver).interfaceId));
        assertTrue(resolver.supportsInterface(type(IContentHashResolver).interfaceId));
        assertTrue(resolver.supportsInterface(type(IERC165).interfaceId));
        assertFalse(resolver.supportsInterface(bytes4(0xdeadbeef)));
    }

    ////////////////////////////////////////////////////////////////////////
    // AGENT_SELF keys
    ////////////////////////////////////////////////////////////////////////

    function test_agentSelf_canWriteStatus() public {
        vm.prank(agentKey);
        resolver.setText(node, "status", "online");
        assertEq(resolver.text(node, "status"), "online");
    }

    function test_agentSelf_cannotWriteEndpoint() public {
        vm.prank(agentKey);
        vm.expectRevert(
            abi.encodeWithSelector(
                AgentResolver.AgentResolverUnauthorized.selector, node, keccak256(bytes("agent.endpoint")), agentKey
            )
        );
        resolver.setText(node, "agent.endpoint", "https://evil.example");
    }

    function test_agentAdmin_canWriteEndpoint() public {
        vm.prank(agentOwner);
        resolver.setText(node, "agent.endpoint", "https://agent1.example");
        assertEq(resolver.text(node, "agent.endpoint"), "https://agent1.example");
    }

    function test_agentAdmin_cannotWriteStatus() public {
        // AGENT_ADMIN is not AGENT_SELF — the role table is exact, not hierarchical.
        vm.prank(agentOwner);
        vm.expectRevert(
            abi.encodeWithSelector(
                AgentResolver.AgentResolverUnauthorized.selector, node, keccak256(bytes("status")), agentOwner
            )
        );
        resolver.setText(node, "status", "online");
    }

    ////////////////////////////////////////////////////////////////////////
    // Reserved keys — registry-only
    ////////////////////////////////////////////////////////////////////////

    function test_reservedKeys_revertEvenForFleetOwner() public {
        vm.prank(fleetOwner);
        vm.expectRevert(
            abi.encodeWithSelector(AgentResolver.ReservedKey.selector, node, keccak256(bytes("agent.owner")))
        );
        resolver.setText(node, "agent.owner", "0xnew");
    }

    ////////////////////////////////////////////////////////////////////////
    // Per-key OPERATOR grants
    ////////////////////////////////////////////////////////////////////////

    function test_operator_grantedForBioKey_canWriteBioOnly() public {
        vm.prank(agentOwner);
        resolver.grantKeyWriter(node, "bio", operator);

        vm.prank(operator);
        resolver.setText(node, "bio", "hello world");
        assertEq(resolver.text(node, "bio"), "hello world");

        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(
                AgentResolver.AgentResolverUnauthorized.selector, node, keccak256(bytes("notes")), operator
            )
        );
        resolver.setText(node, "notes", "should not work");
    }

    function test_operator_revoked_cannotWriteAnymore() public {
        vm.prank(agentOwner);
        resolver.grantKeyWriter(node, "bio", operator);

        vm.prank(agentOwner);
        resolver.revokeKeyWriter(node, "bio", operator);

        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(
                AgentResolver.AgentResolverUnauthorized.selector, node, keccak256(bytes("bio")), operator
            )
        );
        resolver.setText(node, "bio", "hello again");
    }

    function test_grantKeyWriter_requiresAgentAdmin() public {
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(AgentResolver.AgentResolverUnauthorized.selector, node, bytes32(0), stranger)
        );
        resolver.grantKeyWriter(node, "bio", operator);
    }

    ////////////////////////////////////////////////////////////////////////
    // Expiry / revocation — resolver keeps no cached copy, queries the registry live
    ////////////////////////////////////////////////////////////////////////

    function test_expiredAgent_readsReturnEmpty() public {
        vm.prank(agentKey);
        resolver.setText(node, "status", "online");

        vm.prank(agentOwner);
        resolver.grantKeyWriter(node, "addr", agentOwner);
        vm.prank(agentOwner);
        resolver.setAddr(node, agentOwner);

        vm.prank(fleetOwner);
        registry.spawn(
            "agent2", agentOwner, agentKey, AgentRegistry.Tier.Wildcard, uint64(block.timestamp + 1), true, true, address(resolver)
        );
        bytes32 node2 = keccak256(bytes("agent2"));

        vm.prank(agentKey);
        resolver.setText(node2, "status", "online");

        vm.warp(block.timestamp + 2);

        assertFalse(registry.isActiveLabelhash(node2));
        assertEq(resolver.text(node2, "status"), "");
        assertEq(resolver.addr(node2), payable(address(0)));
    }

    function test_revokedAgent_diesImmediatelySameBlock() public {
        vm.prank(agentKey);
        resolver.setText(node, "status", "online");
        assertEq(resolver.text(node, "status"), "online");

        vm.prank(fleetOwner);
        registry.revoke("agent1");

        assertFalse(registry.isActiveLabelhash(node));
        assertEq(resolver.text(node, "status"), "");
    }
}
