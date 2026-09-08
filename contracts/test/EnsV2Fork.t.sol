// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {NameCoder} from "@ens/contracts/utils/NameCoder.sol";
import {IUniversalResolverV2} from "ensv2/universalResolver/interfaces/IUniversalResolverV2.sol";

/// @notice Forks Sepolia and reads a real value from a deployed ENSv2 contract, proving the
/// pinned interface in docs/ensv2-reference.md matches what is actually on-chain.
contract EnsV2ForkTest is Test {
    // ManagedUniversalResolverProxy on Sepolia — see docs/ensv2-reference.md.
    IUniversalResolverV2 constant UNIVERSAL_RESOLVER =
        IUniversalResolverV2(0x6d80F2172CFdEc5730fE683860C33d26fC42e6F1);

    function setUp() public {
        uint256 forkId = vm.createFork(vm.envString("SEPOLIA_RPC_URL"));
        vm.selectFork(forkId);
    }

    function test_findOwner_ofEth_isNotZero() public view {
        address owner = UNIVERSAL_RESOLVER.findOwner(NameCoder.encode("eth"));
        assertNotEq(owner, address(0));
    }
}
