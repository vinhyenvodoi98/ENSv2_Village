// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IETHRegistrar} from "ensv2/registrar/interfaces/IETHRegistrar.sol";

/// @notice `IETHRegistrar` plus the two commitment-age immutables the frontend needs to read
///         directly off the contract (task 30 requirement 5) instead of hardcoding `60`/`86400`.
///         `ETHRegistrar.sol` exposes these as public immutables, which Solidity turns into view
///         getters with this exact signature, but they aren't declared on the vendored interface.
interface IETHRegistrarWithConstants is IETHRegistrar {
    function MIN_COMMITMENT_AGE() external view returns (uint64);
    function MAX_COMMITMENT_AGE() external view returns (uint64);
}
