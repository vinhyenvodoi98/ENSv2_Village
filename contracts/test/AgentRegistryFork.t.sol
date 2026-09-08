// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";

import {ILabelStore} from "ensv2/utils/interfaces/ILabelStore.sol";
import {IRegistry} from "ensv2/registry/interfaces/IRegistry.sol";
import {PermissionedRegistry} from "ensv2/registry/PermissionedRegistry.sol";
import {RegistryRolesLib} from "ensv2/registry/libraries/RegistryRolesLib.sol";

import {AgentRegistry} from "../src/AgentRegistry.sol";

/// @notice Forks Sepolia, deploys a `PermissionedRegistry` (the real ENSv2 registry
/// implementation, per docs/ensv2-reference.md) standing in for a name we control there
/// — we do not yet own `agentvillage.eth` on Sepolia, see task 09 — attaches `AgentRegistry`
/// as its subregistry exactly the way a real parent name would, and mints one agent through it.
contract AgentRegistryForkTest is Test {
    // LabelStore on Sepolia — shared by every PermissionedRegistry instance, see
    // docs/ensv2-reference.md.
    ILabelStore constant LABEL_STORE = ILabelStore(0x532CD0CC4AC0793d838F71A67d29B2D790D18777);

    PermissionedRegistry internal parentRegistry;
    AgentRegistry internal agentRegistry;

    address internal admin = makeAddr("admin");
    address internal agentOwner = makeAddr("agentOwner");
    address internal agentKey = makeAddr("agentKey");

    string constant PARENT_LABEL = "agentvillage-test";

    function setUp() public {
        uint256 forkId = vm.createFork(vm.envString("SEPOLIA_RPC_URL"));
        vm.selectFork(forkId);

        vm.startPrank(admin);
        // `admin` gets every registry role at ROOT_RESOURCE, mirroring how the real
        // `agentvillage.eth` owner would be provisioned on the real ETHRegistry.
        parentRegistry = new PermissionedRegistry(
            LABEL_STORE,
            admin,
            RegistryRolesLib.ROLE_REGISTRAR |
                RegistryRolesLib.ROLE_SET_SUBREGISTRY |
                RegistryRolesLib.ROLE_SET_RESOLVER |
                RegistryRolesLib.ROLE_SET_PARENT
        );
        agentRegistry = new AgentRegistry(admin);

        parentRegistry.register(
            PARENT_LABEL, admin, IRegistry(address(0)), address(0), 0, uint64(block.timestamp + 365 days)
        );
        parentRegistry.setSubregistry(uint256(keccak256(bytes(PARENT_LABEL))), agentRegistry);
        agentRegistry.setParent(parentRegistry, PARENT_LABEL);
        vm.stopPrank();
    }

    function test_attachAsSubregistry_andSpawnOneAgent() public {
        // The parent name's subregistry is our AgentRegistry — this is the exact lookup
        // path `LibRegistry.findResolver`/`findExactRegistry` walk on real ENSv2 traversal.
        assertEq(address(parentRegistry.getSubregistry(PARENT_LABEL)), address(agentRegistry));

        (IRegistry parent, string memory label) = agentRegistry.getParent();
        assertEq(address(parent), address(parentRegistry));
        assertEq(label, PARENT_LABEL);

        vm.prank(admin);
        bytes32 labelhash = agentRegistry.spawn(
            "agent1", agentOwner, agentKey, AgentRegistry.Tier.Wildcard, 0, true, true, address(0xBEEF)
        );

        assertTrue(agentRegistry.isActiveLabelhash(labelhash));
        AgentRegistry.AgentRecord memory record = agentRegistry.agentOfLabelhash(labelhash);
        assertEq(record.owner, agentOwner);
        assertEq(record.agentKey, agentKey);
        assertEq(agentRegistry.getResolver("agent1"), address(0xBEEF));
    }
}
