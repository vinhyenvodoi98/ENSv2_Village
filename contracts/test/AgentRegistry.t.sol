// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {AgentRegistry} from "../src/AgentRegistry.sol";

contract AgentRegistryTest is Test {
    AgentRegistry internal registry;

    address internal admin = makeAddr("admin");
    address internal agentOwner = makeAddr("agentOwner");
    address internal agentKey = makeAddr("agentKey");
    address internal stranger = makeAddr("stranger");

    function setUp() public {
        registry = new AgentRegistry(admin);
    }

    function _spawn(string memory label, bool revocable, bool transferable, uint64 expiry)
        internal
        returns (bytes32 labelhash)
    {
        vm.prank(admin);
        return registry.spawn(label, agentOwner, agentKey, AgentRegistry.Tier.Wildcard, expiry, revocable, transferable, address(0));
    }

    ////////////////////////////////////////////////////////////////////////
    // spawn
    ////////////////////////////////////////////////////////////////////////

    function test_spawn_setsRecordFields() public {
        bytes32 labelhash = _spawn("agent1", true, true, 0);

        AgentRegistry.AgentRecord memory record = registry.agentOfLabelhash(labelhash);
        assertTrue(record.exists);
        assertFalse(record.revoked);
        assertEq(record.owner, agentOwner);
        assertEq(record.agentKey, agentKey);
        assertEq(uint8(record.tier), uint8(AgentRegistry.Tier.Wildcard));
        assertEq(record.expiry, 0);
        assertTrue(record.revocable);
        assertTrue(record.transferable);
        assertTrue(registry.isActiveLabelhash(labelhash));
    }

    function test_spawn_revertsWhenNotAdmin() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        registry.spawn("agent1", agentOwner, agentKey, AgentRegistry.Tier.Wildcard, 0, true, true, address(0));
    }

    function test_spawn_revertsOnDuplicateLabel() public {
        _spawn("agent1", true, true, 0);
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(AgentRegistry.AgentAlreadyExists.selector, keccak256(bytes("agent1"))));
        registry.spawn("agent1", agentOwner, agentKey, AgentRegistry.Tier.Wildcard, 0, true, true, address(0));
    }

    ////////////////////////////////////////////////////////////////////////
    // expiry
    ////////////////////////////////////////////////////////////////////////

    function test_isActive_falseAfterExpiry() public {
        uint64 expiry = uint64(block.timestamp + 1 days);
        bytes32 labelhash = _spawn("agent1", true, true, expiry);

        assertTrue(registry.isActiveLabelhash(labelhash));

        vm.warp(expiry);
        assertFalse(registry.isActiveLabelhash(labelhash));
    }

    function test_getResolver_and_getSubregistry_zeroWhenExpired() public {
        uint64 expiry = uint64(block.timestamp + 1 days);
        vm.prank(admin);
        registry.spawn("agent1", agentOwner, agentKey, AgentRegistry.Tier.Wildcard, expiry, true, true, address(0xBEEF));

        assertEq(registry.getResolver("agent1"), address(0xBEEF));

        vm.warp(expiry);
        assertEq(registry.getResolver("agent1"), address(0));
        assertEq(address(registry.getSubregistry("agent1")), address(0));
    }

    function test_renew_extendsExpiry() public {
        uint64 expiry = uint64(block.timestamp + 1 days);
        _spawn("agent1", true, true, expiry);

        vm.prank(agentOwner);
        registry.renew("agent1", 1 days);

        AgentRegistry.AgentRecord memory record = registry.agentOf("agent1");
        assertEq(record.expiry, expiry + 1 days);
    }

    function test_renew_revertsWhenExpiryIsInfinite() public {
        _spawn("agent1", true, true, 0);

        vm.prank(agentOwner);
        vm.expectRevert(abi.encodeWithSelector(AgentRegistry.AgentHasNoExpiry.selector, keccak256(bytes("agent1"))));
        registry.renew("agent1", 1 days);
    }

    ////////////////////////////////////////////////////////////////////////
    // transfer
    ////////////////////////////////////////////////////////////////////////

    function test_transfer_movesOwner() public {
        _spawn("agent1", true, true, 0);

        vm.prank(agentOwner);
        registry.transfer("agent1", stranger);

        AgentRegistry.AgentRecord memory record = registry.agentOf("agent1");
        assertEq(record.owner, stranger);
    }

    function test_transfer_revertsWhenNotTransferable() public {
        _spawn("agent1", true, false, 0);

        vm.prank(agentOwner);
        vm.expectRevert(abi.encodeWithSelector(AgentRegistry.NotTransferable.selector, keccak256(bytes("agent1"))));
        registry.transfer("agent1", stranger);
    }

    function test_transfer_revertsWhenCallerIsNotAgentOwner() public {
        _spawn("agent1", true, true, 0);

        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(AgentRegistry.NotAgentOwner.selector, keccak256(bytes("agent1")), stranger)
        );
        registry.transfer("agent1", stranger);
    }

    ////////////////////////////////////////////////////////////////////////
    // revoke
    ////////////////////////////////////////////////////////////////////////

    function test_revoke_marksInactive() public {
        _spawn("agent1", true, true, 0);

        vm.prank(agentOwner);
        registry.revoke("agent1");

        assertFalse(registry.isActive("agent1"));
        assertTrue(registry.agentOf("agent1").revoked);
    }

    function test_revoke_revertsWhenNotRevocable() public {
        _spawn("agent1", false, true, 0);

        vm.prank(agentOwner);
        vm.expectRevert(abi.encodeWithSelector(AgentRegistry.NotRevocable.selector, keccak256(bytes("agent1"))));
        registry.revoke("agent1");
    }

    ////////////////////////////////////////////////////////////////////////
    // agentKey cannot touch ownership
    ////////////////////////////////////////////////////////////////////////

    function test_agentKey_cannotTransferOrRevokeOrAdmin() public {
        _spawn("agent1", true, true, 0);

        vm.startPrank(agentKey);
        vm.expectRevert(
            abi.encodeWithSelector(AgentRegistry.NotAgentOwner.selector, keccak256(bytes("agent1")), agentKey)
        );
        registry.transfer("agent1", agentKey);

        vm.expectRevert(
            abi.encodeWithSelector(AgentRegistry.NotAgentOwner.selector, keccak256(bytes("agent1")), agentKey)
        );
        registry.revoke("agent1");

        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, agentKey));
        registry.setAgentKey("agent1", agentKey);
        vm.stopPrank();
    }

    ////////////////////////////////////////////////////////////////////////
    // setAgentKey
    ////////////////////////////////////////////////////////////////////////

    function test_setAgentKey_onlyAdmin() public {
        _spawn("agent1", true, true, 0);
        address newKey = makeAddr("newKey");

        vm.prank(admin);
        registry.setAgentKey("agent1", newKey);
        assertEq(registry.agentOf("agent1").agentKey, newKey);

        vm.prank(agentOwner);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, agentOwner));
        registry.setAgentKey("agent1", agentKey);
    }
}
