// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Minimal ERC-20 surface for the hackathon `MockUSDC` payment token — just what
///         `RegisterParent.s.sol` and the frontend registration flow (task 31) need: mint test
///         balance, approve `ETHRegistrar`, and read balance/allowance/decimals.
interface IMockERC20 {
    function mint(address to, uint256 amount) external;
    function approve(address spender, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function decimals() external view returns (uint8);
}
