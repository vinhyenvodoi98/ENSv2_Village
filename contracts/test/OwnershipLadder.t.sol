// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";

import {IRegistry} from "ensv2/registry/interfaces/IRegistry.sol";

import {AgentRegistry} from "../src/AgentRegistry.sol";
import {Roles} from "../src/Roles.sol";

/// @notice Task 07 — the 4-tier ownership ladder (`AgentRegistry.promote`).
contract OwnershipLadderTest is Test {
    AgentRegistry internal registry;

    address internal fleetOwner = makeAddr("fleetOwner");
    address internal agentOwner = makeAddr("agentOwner");
    address internal agentKey = makeAddr("agentKey");

    bytes32 internal constant LABELHASH = keccak256(bytes("agent1"));

    function setUp() public {
        registry = new AgentRegistry(fleetOwner);

        vm.prank(fleetOwner);
        registry.spawn("agent1", agentOwner, agentKey, AgentRegistry.Tier.Wildcard, 0, false, false, address(0));
    }

    function _heartbeat(uint256 n) internal {
        vm.startPrank(agentKey);
        for (uint256 i; i < n; ++i) {
            registry.heartbeat("agent1");
        }
        vm.stopPrank();
    }

    function _promote(AgentRegistry.Tier toTier) internal {
        vm.prank(fleetOwner);
        registry.promote("agent1", toTier, IRegistry(address(0)));
    }

    ////////////////////////////////////////////////////////////////////////
    // Full ladder, 0 -> 1 -> 2 -> 3
    ////////////////////////////////////////////////////////////////////////

    function test_fullLadder_0to1to2to3() public {
        // 0 -> 1 (Leased): earn 3 heartbeats, mint for real
        _heartbeat(3);
        _promote(AgentRegistry.Tier.Leased);

        AgentRegistry.AgentRecord memory record = registry.agentOf("agent1");
        assertEq(uint8(record.tier), uint8(AgentRegistry.Tier.Leased));
        assertTrue(record.revocable);
        assertFalse(record.transferable);
        assertEq(record.resolver, address(registry.defaultResolver()));
        assertGt(record.expiry, block.timestamp);

        // 1 -> 2 (Owned): earn 3 more heartbeats (6 total)
        _heartbeat(3);
        _promote(AgentRegistry.Tier.Owned);

        record = registry.agentOf("agent1");
        assertEq(uint8(record.tier), uint8(AgentRegistry.Tier.Owned));
        assertFalse(record.revocable);
        assertTrue(record.transferable);

        // 2 -> 3 (Sovereign): earn 3 more heartbeats (9 total), attach own sub-registry
        _heartbeat(3);
        AgentRegistry childRegistry = new AgentRegistry(agentKey);

        vm.prank(fleetOwner);
        registry.promote("agent1", AgentRegistry.Tier.Sovereign, childRegistry);

        record = registry.agentOf("agent1");
        assertEq(uint8(record.tier), uint8(AgentRegistry.Tier.Sovereign));
        assertEq(record.expiry, 0);
        assertFalse(record.revocable);
        assertEq(address(record.subregistry), address(childRegistry));
    }

    ////////////////////////////////////////////////////////////////////////
    // Sovereign is a one-way door
    ////////////////////////////////////////////////////////////////////////

    function _promoteAllTheWayToSovereign() internal returns (AgentRegistry childRegistry) {
        _heartbeat(9);
        _promote(AgentRegistry.Tier.Leased);
        _promote(AgentRegistry.Tier.Owned);

        childRegistry = new AgentRegistry(agentKey);
        vm.prank(fleetOwner);
        registry.promote("agent1", AgentRegistry.Tier.Sovereign, childRegistry);
    }

    function test_revoke_revertsAfterReachingSovereign() public {
        _promoteAllTheWayToSovereign();

        vm.prank(fleetOwner);
        vm.expectRevert(abi.encodeWithSelector(AgentRegistry.NotRevocable.selector, LABELHASH));
        registry.revoke("agent1");
    }

    function test_setTier_revertsAfterReachingSovereign() public {
        _promoteAllTheWayToSovereign();

        vm.prank(fleetOwner);
        vm.expectRevert(abi.encodeWithSelector(AgentRegistry.SovereignAgent.selector, LABELHASH));
        registry.setTier("agent1", AgentRegistry.Tier.Wildcard);
    }

    function test_promote_revertsPastSovereign() public {
        AgentRegistry childRegistry = _promoteAllTheWayToSovereign();

        vm.prank(fleetOwner);
        vm.expectRevert(
            abi.encodeWithSelector(
                AgentRegistry.InvalidPromotion.selector, AgentRegistry.Tier.Sovereign, AgentRegistry.Tier.Sovereign
            )
        );
        registry.promote("agent1", AgentRegistry.Tier.Sovereign, childRegistry);
    }

    function test_sovereign_canMintChildAgent() public {
        AgentRegistry childRegistry = _promoteAllTheWayToSovereign();

        address childOwner = makeAddr("childOwner");
        address childKey = makeAddr("childKey");

        vm.prank(agentKey);
        bytes32 childLabelhash =
            childRegistry.spawn("worker", childOwner, childKey, AgentRegistry.Tier.Wildcard, 0, true, false, address(0));

        assertTrue(childRegistry.agentOfLabelhash(childLabelhash).exists);
        assertTrue(childRegistry.hasRoles(uint256(childLabelhash), Roles.AGENT_SELF, childKey));
    }

    ////////////////////////////////////////////////////////////////////////
    // Only upward, adjacent moves are allowed
    ////////////////////////////////////////////////////////////////////////

    function test_promote_revertsInReverseDirection() public {
        _heartbeat(3);
        _promote(AgentRegistry.Tier.Leased);

        vm.prank(fleetOwner);
        vm.expectRevert(
            abi.encodeWithSelector(
                AgentRegistry.InvalidPromotion.selector, AgentRegistry.Tier.Leased, AgentRegistry.Tier.Wildcard
            )
        );
        registry.promote("agent1", AgentRegistry.Tier.Wildcard, IRegistry(address(0)));
    }

    function test_promote_revertsWhenSkippingATier() public {
        _heartbeat(6);

        vm.prank(fleetOwner);
        vm.expectRevert(
            abi.encodeWithSelector(
                AgentRegistry.InvalidPromotion.selector, AgentRegistry.Tier.Wildcard, AgentRegistry.Tier.Owned
            )
        );
        registry.promote("agent1", AgentRegistry.Tier.Owned, IRegistry(address(0)));
    }

    ////////////////////////////////////////////////////////////////////////
    // The heartbeat gate — not just a button click
    ////////////////////////////////////////////////////////////////////////

    function test_promote_revertsWithoutEnoughHeartbeats() public {
        vm.prank(fleetOwner);
        vm.expectRevert(
            abi.encodeWithSelector(AgentRegistry.InsufficientHeartbeats.selector, LABELHASH, uint64(0), uint64(3))
        );
        registry.promote("agent1", AgentRegistry.Tier.Leased, IRegistry(address(0)));
    }

    function test_heartbeat_onlyAgentSelfCanCallIt() public {
        vm.prank(agentOwner);
        vm.expectRevert(
            abi.encodeWithSelector(
                bytes4(keccak256("EACUnauthorizedAccountRoles(uint256,uint256,address)")),
                uint256(LABELHASH),
                Roles.AGENT_SELF,
                agentOwner
            )
        );
        registry.heartbeat("agent1");
    }

    ////////////////////////////////////////////////////////////////////////
    // Leased tier actually expires
    ////////////////////////////////////////////////////////////////////////

    function test_leased_expiresWithoutRenewal() public {
        _heartbeat(3);
        _promote(AgentRegistry.Tier.Leased);

        AgentRegistry.AgentRecord memory record = registry.agentOf("agent1");
        vm.warp(record.expiry);

        assertFalse(registry.isActive("agent1"));
        assertEq(registry.getResolver("agent1"), address(0));
    }
}
