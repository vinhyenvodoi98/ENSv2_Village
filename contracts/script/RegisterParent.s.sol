// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IRegistry} from "ensv2/registry/interfaces/IRegistry.sol";

import {IETHRegistrarWithConstants} from "../src/IETHRegistrarWithConstants.sol";
import {IMockERC20} from "../src/IMockERC20.sol";

/// @notice Registers the AgentVillage parent name (e.g. `agentvillage.eth`) on the **hackathon**
///         `ETHRegistrar` (task 30) — the dedicated ENSv2 deployment indexed by the hackathon ENS
///         Explorer, separate from the standard ENSv2 Beta set task 09 registered against.
///
/// Runs the full commit-reveal flow for real: mint test `MockUSDC` -> approve `ETHRegistrar` for
/// the quoted price -> `commit()` -> wait past `MIN_COMMITMENT_AGE` (read from the contract, not
/// hardcoded) -> `register()`. `Deploy.s.sol` only *attaches* AgentVillage contracts to an
/// already-owned name — this script is what makes the deployer own it in the first place, and
/// it's the only supported way to reproduce that: no manual `cast send` steps, unlike task 09's
/// Beta-set registration which left nothing reproducible.
///
/// **Two invocations, not one**: `forge script` always simulates the entire script against a
/// local fork before broadcasting anything; `vm.sleep` during that simulation pass does not
/// advance the fork's `block.timestamp`, so a single `run()` doing commit -> sleep -> register
/// always fails `CommitmentTooNew` at simulation time, before any transaction is sent. Splitting
/// into `commitStep()`/`registerStep()`, run as two separate `forge script ... --sig` invocations
/// with a real shell `sleep` between them, lets `registerStep()`'s simulation start from the
/// live chain's actual `block.timestamp` (which has genuinely advanced), so it passes. Still
/// fully scripted and reproducible from env vars — no `cast send` by hand.
///
/// Reads the ENS-side hackathon addresses from `contracts/deployments/hackathon.json` (task 30
/// requirement 4) rather than hardcoding them here — that file is itself sourced from
/// `docs/ensv2-reference.md`'s verified address table.
///
/// Usage:
///   forge script script/RegisterParent.s.sol:RegisterParent --sig "commitStep()" --broadcast --rpc-url $SEPOLIA_RPC_URL
///   sleep 65
///   forge script script/RegisterParent.s.sol:RegisterParent --sig "registerStep()" --broadcast --rpc-url $SEPOLIA_RPC_URL
///
/// Env vars:
///   DEPLOYER_PRIVATE_KEY - registers the name to this address (required, shared with Deploy.s.sol)
///   PARENT_LABEL         - label to register, e.g. "agentvillage" (required)
///   DURATION             - registration length in seconds (optional, defaults to 365 days)
contract RegisterParent is Script {
    struct Params {
        uint256 deployerKey;
        address deployer;
        string label;
        uint64 duration;
        IETHRegistrarWithConstants registrar;
        IMockERC20 paymentToken;
    }

    /// @dev Commit's secret, persisted between the two invocations so `registerStep()` can reveal
    ///      the exact same value `commitStep()` committed to.
    function _statePath() internal view returns (string memory) {
        return string.concat(vm.projectRoot(), "/deployments/.register-state.json");
    }

    function _loadParams() internal returns (Params memory p) {
        p.deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        p.deployer = vm.addr(p.deployerKey);
        p.label = vm.envString("PARENT_LABEL");
        p.duration = uint64(vm.envOr("DURATION", uint256(365 days)));

        string memory j = vm.readFile(string.concat(vm.projectRoot(), "/deployments/hackathon.json"));
        p.registrar = IETHRegistrarWithConstants(vm.parseJsonAddress(j, ".ethRegistrar"));
        p.paymentToken = IMockERC20(vm.parseJsonAddress(j, ".mockUsdc"));
    }

    /// Step 1/2. Mints test `MockUSDC`, approves `ETHRegistrar`, and commits.
    function commitStep() external {
        Params memory p = _loadParams();
        require(p.registrar.isAvailable(p.label), "RegisterParent: label not available - pick another");

        bytes32 secret =
            keccak256(abi.encodePacked(p.label, p.deployer, block.timestamp, block.prevrandao));
        (uint256 base, uint256 premium) =
            p.registrar.getRegisterPrice(p.label, p.duration, IERC20(address(p.paymentToken)));
        uint256 price = base + premium;
        bytes32 commitment = p.registrar.makeCommitment(
            p.label, p.deployer, secret, IRegistry(address(0)), address(0), p.duration, bytes32(0)
        );

        console2.log("Label:              ", p.label);
        console2.log("Price:              ", price);
        console2.log("MIN_COMMITMENT_AGE: ", p.registrar.MIN_COMMITMENT_AGE());

        vm.startBroadcast(p.deployerKey);
        p.paymentToken.mint(p.deployer, price);
        p.paymentToken.approve(address(p.registrar), price);
        p.registrar.commit(commitment);
        vm.stopBroadcast();

        string memory json = "state";
        vm.serializeString(json, "label", p.label);
        vm.serializeUint(json, "duration", uint256(p.duration));
        string memory out = vm.serializeBytes32(json, "secret", secret);
        vm.writeJson(out, _statePath());

        console2.log("Committed. Wait past MIN_COMMITMENT_AGE, then run registerStep().");
    }

    /// Step 2/2. Reveals the commitment and registers. Run only after `MIN_COMMITMENT_AGE`
    /// seconds have really elapsed on-chain since `commitStep()`'s `commit()` transaction.
    function registerStep() external {
        Params memory p = _loadParams();
        string memory state = vm.readFile(_statePath());
        require(
            keccak256(bytes(vm.parseJsonString(state, ".label"))) == keccak256(bytes(p.label)),
            "RegisterParent: PARENT_LABEL does not match the pending commitment"
        );
        bytes32 secret = vm.parseJsonBytes32(state, ".secret");

        vm.startBroadcast(p.deployerKey);
        uint256 tokenId = p.registrar.register(
            p.label,
            p.deployer,
            secret,
            IRegistry(address(0)),
            address(0),
            p.duration,
            IERC20(address(p.paymentToken)),
            bytes32(0)
        );
        vm.stopBroadcast();

        console2.log("Registered. tokenId:", tokenId);
        console2.log("Name:", string.concat(p.label, ".eth"));

        vm.removeFile(_statePath());
    }
}
