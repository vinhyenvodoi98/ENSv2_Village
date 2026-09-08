// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";

import {IEnhancedAccessControl} from "ensv2/access-control/interfaces/IEnhancedAccessControl.sol";

import {AgentRegistry} from "../src/AgentRegistry.sol";
import {Roles} from "../src/Roles.sol";

contract AgentRegistryTest is Test {
    AgentRegistry internal registry;

    address internal fleetOwner = makeAddr("fleetOwner");
    address internal agentOwner = makeAddr("agentOwner");
    address internal agentKey = makeAddr("agentKey");
    address internal stranger = makeAddr("stranger");
    address internal operator = makeAddr("operator");
    address internal auditor = makeAddr("auditor");

    bytes32 internal constant LABELHASH = keccak256(bytes("agent1"));

    function setUp() public {
        registry = new AgentRegistry(fleetOwner);
    }

    function _spawn(string memory label, bool revocable, bool transferable, uint64 expiry)
        internal
        returns (bytes32 labelhash)
    {
        vm.prank(fleetOwner);
        return
            registry.spawn(label, agentOwner, agentKey, AgentRegistry.Tier.Wildcard, expiry, revocable, transferable, address(0));
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

    function test_spawn_grantsAgentSelfAndAgentAdmin() public {
        bytes32 labelhash = _spawn("agent1", true, true, 0);
        uint256 resource = uint256(labelhash);

        assertTrue(registry.hasRoles(resource, Roles.AGENT_SELF, agentKey));
        assertFalse(registry.hasRoles(resource, Roles.AGENT_ADMIN, agentKey));

        assertTrue(registry.hasRoles(resource, Roles.AGENT_ADMIN, agentOwner));
        assertTrue(registry.hasRoles(resource, Roles.AGENT_ADMIN_ADMIN, agentOwner));
        assertTrue(registry.hasRoles(resource, Roles.OPERATOR_ADMIN, agentOwner));
        assertTrue(registry.hasRoles(resource, Roles.AUDITOR_ADMIN, agentOwner));
        assertFalse(registry.hasRoles(resource, Roles.FLEET_ADMIN, agentOwner));
    }

    function test_spawn_revertsWhenNotFleetAdmin() public {
        uint256 rootResource = registry.ROOT_RESOURCE();

        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(
                IEnhancedAccessControl.EACUnauthorizedAccountRoles.selector, rootResource, Roles.FLEET_ADMIN, stranger
            )
        );
        registry.spawn("agent1", agentOwner, agentKey, AgentRegistry.Tier.Wildcard, 0, true, true, address(0));
    }

    function test_spawn_revertsOnDuplicateLabel() public {
        _spawn("agent1", true, true, 0);
        vm.prank(fleetOwner);
        vm.expectRevert(abi.encodeWithSelector(AgentRegistry.AgentAlreadyExists.selector, LABELHASH));
        registry.spawn("agent1", agentOwner, agentKey, AgentRegistry.Tier.Wildcard, 0, true, true, address(0));
    }

    ////////////////////////////////////////////////////////////////////////
    // expiry / renew
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
        vm.prank(fleetOwner);
        registry.spawn("agent1", agentOwner, agentKey, AgentRegistry.Tier.Wildcard, expiry, true, true, address(0xBEEF));

        assertEq(registry.getResolver("agent1"), address(0xBEEF));

        vm.warp(expiry);
        assertEq(registry.getResolver("agent1"), address(0));
        assertEq(address(registry.getSubregistry("agent1")), address(0));
    }

    function test_renew_extendsExpiry_byFleetAdmin() public {
        uint64 expiry = uint64(block.timestamp + 1 days);
        _spawn("agent1", true, true, expiry);

        vm.prank(fleetOwner);
        registry.renew("agent1", 1 days);

        AgentRegistry.AgentRecord memory record = registry.agentOf("agent1");
        assertEq(record.expiry, expiry + 1 days);
    }

    function test_renew_revertsWhenExpiryIsInfinite() public {
        _spawn("agent1", true, true, 0);

        vm.prank(fleetOwner);
        vm.expectRevert(abi.encodeWithSelector(AgentRegistry.AgentHasNoExpiry.selector, LABELHASH));
        registry.renew("agent1", 1 days);
    }

    function test_renew_revertsWhenCallerIsNotFleetAdmin() public {
        uint64 expiry = uint64(block.timestamp + 1 days);
        _spawn("agent1", true, true, expiry);

        vm.prank(agentOwner);
        vm.expectRevert(
            abi.encodeWithSelector(
                IEnhancedAccessControl.EACUnauthorizedAccountRoles.selector, uint256(LABELHASH), Roles.FLEET_ADMIN, agentOwner
            )
        );
        registry.renew("agent1", 1 days);
    }

    ////////////////////////////////////////////////////////////////////////
    // transfer
    ////////////////////////////////////////////////////////////////////////

    function test_transfer_movesOwnerAndRoleBundle() public {
        bytes32 labelhash = _spawn("agent1", true, true, 0);
        uint256 resource = uint256(labelhash);

        vm.prank(fleetOwner);
        registry.transfer("agent1", stranger);

        AgentRegistry.AgentRecord memory record = registry.agentOf("agent1");
        assertEq(record.owner, stranger);

        assertFalse(registry.hasRoles(resource, Roles.AGENT_ADMIN, agentOwner));
        assertFalse(registry.hasRoles(resource, Roles.AGENT_ADMIN_ADMIN, agentOwner));
        assertTrue(registry.hasRoles(resource, Roles.AGENT_ADMIN, stranger));
        assertTrue(registry.hasRoles(resource, Roles.AGENT_ADMIN_ADMIN, stranger));
    }

    function test_transfer_revertsWhenNotTransferable() public {
        _spawn("agent1", true, false, 0);

        vm.prank(fleetOwner);
        vm.expectRevert(abi.encodeWithSelector(AgentRegistry.NotTransferable.selector, LABELHASH));
        registry.transfer("agent1", stranger);
    }

    function test_transfer_revertsWhenCallerIsNotFleetAdmin() public {
        _spawn("agent1", true, true, 0);

        vm.prank(agentOwner);
        vm.expectRevert(
            abi.encodeWithSelector(
                IEnhancedAccessControl.EACUnauthorizedAccountRoles.selector, uint256(LABELHASH), Roles.FLEET_ADMIN, agentOwner
            )
        );
        registry.transfer("agent1", stranger);
    }

    ////////////////////////////////////////////////////////////////////////
    // revoke
    ////////////////////////////////////////////////////////////////////////

    function test_revoke_marksInactive() public {
        _spawn("agent1", true, true, 0);

        vm.prank(fleetOwner);
        registry.revoke("agent1");

        assertFalse(registry.isActive("agent1"));
        assertTrue(registry.agentOf("agent1").revoked);
    }

    function test_revoke_revertsWhenNotRevocable() public {
        _spawn("agent1", false, true, 0);

        vm.prank(fleetOwner);
        vm.expectRevert(abi.encodeWithSelector(AgentRegistry.NotRevocable.selector, LABELHASH));
        registry.revoke("agent1");
    }

    ////////////////////////////////////////////////////////////////////////
    // setAgentKey / setAgentResolver — AGENT_ADMIN
    ////////////////////////////////////////////////////////////////////////

    function test_setAgentKey_byAgentAdmin_rotatesAgentSelf() public {
        bytes32 labelhash = _spawn("agent1", true, true, 0);
        uint256 resource = uint256(labelhash);
        address newKey = makeAddr("newKey");

        vm.prank(agentOwner);
        registry.setAgentKey("agent1", newKey);

        assertEq(registry.agentOf("agent1").agentKey, newKey);
        assertFalse(registry.hasRoles(resource, Roles.AGENT_SELF, agentKey));
        assertTrue(registry.hasRoles(resource, Roles.AGENT_SELF, newKey));
    }

    function test_setAgentKey_byFleetAdmin_alsoAllowed() public {
        _spawn("agent1", true, true, 0);
        address newKey = makeAddr("newKey");

        vm.prank(fleetOwner);
        registry.setAgentKey("agent1", newKey);
        assertEq(registry.agentOf("agent1").agentKey, newKey);
    }

    function test_setAgentKey_revertsWhenCallerLacksAgentAdmin() public {
        _spawn("agent1", true, true, 0);

        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(
                IEnhancedAccessControl.EACUnauthorizedAccountRoles.selector, uint256(LABELHASH), Roles.AGENT_ADMIN, stranger
            )
        );
        registry.setAgentKey("agent1", makeAddr("newKey"));
    }

    function test_setAgentResolver_byAgentAdmin() public {
        _spawn("agent1", true, true, 0);

        vm.prank(agentOwner);
        registry.setAgentResolver("agent1", address(0xCAFE));

        assertEq(registry.getResolver("agent1"), address(0xCAFE));
    }

    ////////////////////////////////////////////////////////////////////////
    // OPERATOR — delegated record writes
    ////////////////////////////////////////////////////////////////////////

    function test_operator_grantedByOwner_canWriteRecord() public {
        _spawn("agent1", true, true, 0);

        vm.prank(agentOwner);
        registry.grantAgentRole("agent1", Roles.OPERATOR, operator);

        vm.prank(operator);
        registry.setRecord("agent1", "bio", "hello");
        assertEq(registry.recordOf("agent1", "bio"), "hello");
    }

    function test_operator_revertsBeforeGrant() public {
        _spawn("agent1", true, true, 0);

        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(
                IEnhancedAccessControl.EACUnauthorizedAccountRoles.selector, uint256(LABELHASH), Roles.OPERATOR, operator
            )
        );
        registry.setRecord("agent1", "bio", "hello");
    }

    function test_operator_revokedByOwner_writingRecordReverts() public {
        _spawn("agent1", true, true, 0);

        vm.startPrank(agentOwner);
        registry.grantAgentRole("agent1", Roles.OPERATOR, operator);
        registry.revokeAgentRole("agent1", Roles.OPERATOR, operator);
        vm.stopPrank();

        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(
                IEnhancedAccessControl.EACUnauthorizedAccountRoles.selector, uint256(LABELHASH), Roles.OPERATOR, operator
            )
        );
        registry.setRecord("agent1", "bio", "hello");
    }

    ////////////////////////////////////////////////////////////////////////
    // AUDITOR — read-only
    ////////////////////////////////////////////////////////////////////////

    function test_auditor_canBeGrantedByAnyAgentAdmin_butCannotWrite() public {
        _spawn("agent1", true, true, 0);

        vm.prank(agentOwner);
        registry.grantAgentRole("agent1", Roles.AUDITOR, auditor);
        assertTrue(registry.hasRoles(uint256(LABELHASH), Roles.AUDITOR, auditor));

        vm.prank(auditor);
        vm.expectRevert(
            abi.encodeWithSelector(
                IEnhancedAccessControl.EACUnauthorizedAccountRoles.selector, uint256(LABELHASH), Roles.OPERATOR, auditor
            )
        );
        registry.setRecord("agent1", "bio", "hello");
    }

    ////////////////////////////////////////////////////////////////////////
    // Privilege escalation — AGENT_SELF must never grant, revoke, or transfer
    ////////////////////////////////////////////////////////////////////////

    function test_agentSelf_cannotGrantRoles() public {
        _spawn("agent1", true, true, 0);

        vm.prank(agentKey);
        vm.expectRevert(
            abi.encodeWithSelector(
                IEnhancedAccessControl.EACCannotGrantRoles.selector, uint256(LABELHASH), Roles.AGENT_SELF, agentKey
            )
        );
        registry.grantAgentRole("agent1", Roles.AGENT_SELF, stranger);
    }

    function test_agentSelf_cannotRevokeRoles() public {
        _spawn("agent1", true, true, 0);

        vm.prank(agentKey);
        vm.expectRevert(
            abi.encodeWithSelector(
                IEnhancedAccessControl.EACCannotRevokeRoles.selector, uint256(LABELHASH), Roles.AGENT_ADMIN, agentKey
            )
        );
        registry.revokeAgentRole("agent1", Roles.AGENT_ADMIN, agentOwner);
    }

    function test_agentSelf_cannotTransfer() public {
        _spawn("agent1", true, true, 0);

        vm.prank(agentKey);
        vm.expectRevert(
            abi.encodeWithSelector(
                IEnhancedAccessControl.EACUnauthorizedAccountRoles.selector, uint256(LABELHASH), Roles.FLEET_ADMIN, agentKey
            )
        );
        registry.transfer("agent1", agentKey);
    }

    function test_agentSelf_cannotRevoke() public {
        _spawn("agent1", true, true, 0);

        vm.prank(agentKey);
        vm.expectRevert(
            abi.encodeWithSelector(
                IEnhancedAccessControl.EACUnauthorizedAccountRoles.selector, uint256(LABELHASH), Roles.FLEET_ADMIN, agentKey
            )
        );
        registry.revoke("agent1");
    }

    function test_agentSelf_cannotChangeOwnKey() public {
        _spawn("agent1", true, true, 0);

        vm.prank(agentKey);
        vm.expectRevert(
            abi.encodeWithSelector(
                IEnhancedAccessControl.EACUnauthorizedAccountRoles.selector, uint256(LABELHASH), Roles.AGENT_ADMIN, agentKey
            )
        );
        registry.setAgentKey("agent1", agentKey);
    }
}
