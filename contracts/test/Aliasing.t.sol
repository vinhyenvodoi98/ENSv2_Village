// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";

import {IRegistry} from "ensv2/registry/interfaces/IRegistry.sol";

import {AgentRegistry} from "../src/AgentRegistry.sol";
import {AgentResolver} from "../src/AgentResolver.sol";

/// @notice Task 08 — record aliasing (mechanism A) and namespace aliasing (mechanism B).
contract AliasingTest is Test {
    AgentRegistry internal registry;
    AgentResolver internal resolver;

    address internal fleetOwner = makeAddr("fleetOwner");
    address internal parentOwner = makeAddr("parentOwner");
    address internal parentKey = makeAddr("parentKey");
    address internal childOwner = makeAddr("childOwner");
    address internal childKey = makeAddr("childKey");

    bytes32 internal parentNode;
    bytes32 internal childNode;

    function setUp() public {
        registry = new AgentRegistry(fleetOwner);
        resolver = new AgentResolver(registry);

        vm.prank(fleetOwner);
        parentNode = registry.spawn(
            "parent1", parentOwner, parentKey, AgentRegistry.Tier.Wildcard, 0, true, true, address(resolver)
        );

        vm.prank(fleetOwner);
        childNode = registry.spawn(
            "child1", childOwner, childKey, AgentRegistry.Tier.Wildcard, 0, true, true, address(resolver)
        );
    }

    ////////////////////////////////////////////////////////////////////////
    // Mechanism A — record aliasing: unset key falls back to the parent node
    ////////////////////////////////////////////////////////////////////////

    function test_childWithNoOwnValue_inheritsParents() public {
        vm.prank(parentOwner);
        resolver.setText(parentNode, "agent.model", "gpt-4o");

        vm.prank(childOwner);
        resolver.setParentNode(childNode, address(resolver), parentNode);

        assertEq(resolver.text(childNode, "agent.model"), "gpt-4o");
        // ownText reports nothing set directly — this is exactly the "inherited, not own"
        // signal the UI (task 12) needs.
        assertEq(resolver.ownText(childNode, "agent.model"), "");
    }

    function test_childWithOwnValue_overridesParent_parentUnaffected() public {
        vm.prank(parentOwner);
        resolver.setText(parentNode, "agent.model", "gpt-4o");

        vm.prank(childOwner);
        resolver.setParentNode(childNode, address(resolver), parentNode);

        vm.prank(childOwner);
        resolver.setText(childNode, "agent.model", "claude-opus");

        assertEq(resolver.text(childNode, "agent.model"), "claude-opus");
        assertEq(resolver.ownText(childNode, "agent.model"), "claude-opus");
        assertEq(resolver.text(parentNode, "agent.model"), "gpt-4o");
    }

    function test_noParentSet_readsEmpty() public view {
        assertEq(resolver.text(childNode, "agent.model"), "");
    }

    ////////////////////////////////////////////////////////////////////////
    // Cross-key aliasing: "model" reads from "agent.model" on the same node
    ////////////////////////////////////////////////////////////////////////

    function test_crossKeyAlias_modelReadsAgentModel() public {
        vm.prank(parentOwner);
        resolver.setText(parentNode, "agent.model", "gpt-4o");

        assertEq(resolver.text(parentNode, "model"), "gpt-4o");
    }

    function test_crossKeyAlias_doesNotShadowAnExplicitValue() public {
        vm.prank(parentOwner);
        resolver.setText(parentNode, "agent.model", "gpt-4o");

        // "model" itself is an unreserved key -> writable once granted as a key writer.
        vm.prank(parentOwner);
        resolver.grantKeyWriter(parentNode, "model", parentOwner);
        vm.prank(parentOwner);
        resolver.setText(parentNode, "model", "explicit-value");

        assertEq(resolver.text(parentNode, "model"), "explicit-value");
    }

    ////////////////////////////////////////////////////////////////////////
    // Loop guard: A's parent is B, B's parent is A
    ////////////////////////////////////////////////////////////////////////

    function test_aliasingCycle_doesNotExhaustGas_stopsAtDepthLimit() public {
        vm.prank(parentOwner);
        resolver.setParentNode(parentNode, address(resolver), childNode);
        vm.prank(childOwner);
        resolver.setParentNode(childNode, address(resolver), parentNode);

        uint256 gasBefore = gasleft();
        string memory value = resolver.text(parentNode, "agent.model");
        uint256 gasUsed = gasBefore - gasleft();

        assertEq(value, "");
        // Bounded by MAX_ALIAS_DEPTH hops, not proportional to the block gas limit.
        assertLt(gasUsed, 500_000);
    }

    ////////////////////////////////////////////////////////////////////////
    // A revoked/expired ancestor does not leak its old value
    ////////////////////////////////////////////////////////////////////////

    function test_revokedParent_childReadsEmpty() public {
        vm.prank(parentOwner);
        resolver.setText(parentNode, "agent.model", "gpt-4o");

        vm.prank(childOwner);
        resolver.setParentNode(childNode, address(resolver), parentNode);

        vm.prank(fleetOwner);
        registry.revoke("parent1");

        assertEq(resolver.text(childNode, "agent.model"), "");
    }

    ////////////////////////////////////////////////////////////////////////
    // Cross-resolver aliasing: parent and child live on different AgentResolver
    // instances (task 07's Sovereign-tier sub-registry shape).
    ////////////////////////////////////////////////////////////////////////

    function test_crossResolver_childOnDifferentRegistry_inheritsParent() public {
        vm.prank(parentOwner);
        resolver.setText(parentNode, "agent.model", "gpt-4o");

        AgentRegistry childRegistry = new AgentRegistry(parentKey);
        AgentResolver childResolver = childRegistry.defaultResolver();

        vm.prank(parentKey);
        bytes32 grandchildNode = childRegistry.spawn(
            "worker", childOwner, childKey, AgentRegistry.Tier.Wildcard, 0, true, true, address(childResolver)
        );

        vm.prank(childOwner);
        childResolver.setParentNode(grandchildNode, address(resolver), parentNode);

        assertEq(childResolver.text(grandchildNode, "agent.model"), "gpt-4o");
    }

    ////////////////////////////////////////////////////////////////////////
    // setParentNode authorization
    ////////////////////////////////////////////////////////////////////////

    function test_setParentNode_requiresAgentAdmin() public {
        vm.prank(childKey); // AGENT_SELF, not AGENT_ADMIN
        vm.expectRevert(
            abi.encodeWithSelector(AgentResolver.AgentResolverUnauthorized.selector, childNode, bytes32(0), childKey)
        );
        resolver.setParentNode(childNode, address(resolver), parentNode);
    }

    ////////////////////////////////////////////////////////////////////////
    // Mechanism B — namespace aliasing: two names, one shared registry
    ////////////////////////////////////////////////////////////////////////

    function test_namespaceAliasing_writeThroughA_visibleThroughB() public {
        NamespaceRoot teamA = new NamespaceRoot();
        NamespaceRoot teamB = new NamespaceRoot();

        // Both "team-a.eth" and "team-b.eth" point at the very same fleet registry/resolver.
        teamA.setNamespace("team-a", registry, address(resolver));
        teamB.setNamespace("team-b", registry, address(resolver));

        assertEq(address(teamA.getSubregistry("team-a")), address(teamB.getSubregistry("team-b")));
        assertEq(teamA.getResolver("team-a"), teamB.getResolver("team-b"));

        // Write via the namespace-A vantage point...
        AgentResolver resolverViaA = AgentResolver(teamA.getResolver("team-a"));
        vm.prank(parentKey);
        resolverViaA.setText(parentNode, "status", "online");

        // ...observe it via the namespace-B vantage point.
        AgentResolver resolverViaB = AgentResolver(teamB.getResolver("team-b"));
        assertEq(resolverViaB.text(parentNode, "status"), "online");
    }
}

/// @dev Minimal `IRegistry` stand-in for a real ENSv2 root registry, used only to prove
///      namespace aliasing: two labels resolving to the identical sub-registry/resolver pair
///      is all "multiple namespaces share one fleet" requires — `AgentRegistry` itself has no
///      notion of which parent name(s) point at it.
contract NamespaceRoot is IRegistry {
    mapping(string label => IRegistry) internal _subregistries;
    mapping(string label => address) internal _resolvers;

    function setNamespace(string calldata label, IRegistry subregistry, address resolver_) external {
        _subregistries[label] = subregistry;
        _resolvers[label] = resolver_;
    }

    function getSubregistry(string calldata label) external view returns (IRegistry) {
        return _subregistries[label];
    }

    function getResolver(string calldata label) external view returns (address) {
        return _resolvers[label];
    }

    function getParent() external pure returns (IRegistry parent, string memory label) {
        return (IRegistry(address(0)), "");
    }
}
