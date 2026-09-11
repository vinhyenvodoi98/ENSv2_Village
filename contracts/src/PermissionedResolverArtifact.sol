// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// Forces `forge build` to compile ENSv2's `PermissionedResolver` implementation (not just one of
// the narrow profile interfaces it implements), so `export-abis.mjs` can pull a single ABI that
// covers every setter/getter task 35's records editor calls — `setText`/`setAddr`/`setContenthash`
// /`setData`/`clearRecords`/`multicall` live directly on the contract, not on any one interface.
import "ensv2/resolver/PermissionedResolver.sol";
