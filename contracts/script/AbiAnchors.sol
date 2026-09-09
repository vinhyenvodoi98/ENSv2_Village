// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// Not used anywhere — exists solely so `forge build` compiles these ENSv2 interfaces and leaves
// their ABI in `contracts/out/`, for `contracts/script/export-abis.mjs` (task 10) to pick up.
// Nothing else in this repo happens to import `resolve(bytes,bytes)`'s real interface directly.
import {IUniversalResolver} from "@ens/contracts/universalResolver/IUniversalResolver.sol";
