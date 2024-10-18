//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { AxelarExecutable } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/executable/AxelarExecutable.sol';
import { IAxelarGateway } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IAxelarGateway.sol';
import { IERC20 } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IERC20.sol';
import { IAxelarGasService } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IAxelarGasService.sol';
import { ISwapRouter } from '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';
import { IUniswapV3Factory } from '@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol';


/**
 * @title Call Contract With Token 
 * @notice Send a token along with an Axelar GMP message between two blockchains
 */
contract CallContractWithToken is AxelarExecutable {
    IAxelarGasService public immutable gasService;

    // Define the Uniswap V3 Factory address
    address public UNISWAP_V3_FACTORY;
    // Define the Uniswap V3 SwapRouter address
    address public  UNISWAP_V3_ROUTER;

    // Define the USDC and axlUSDC token addresses
    address public USDC;
    address public AXL_USDC; // Replace with actual axlUSDC address

    event Executed();
    event TokenSwapped(address indexed fromToken, address indexed toToken, uint256 amountIn, uint256 amountOut);

    /**
     * 
     * @param _gateway address of axl gateway on deployed chain
     * @param _gasReceiver address of axl gas service on deployed chain
     */
    constructor(address _gateway, address _gasReceiver, address _uniswapV3Factory, address _uniswapV3Router, address _usdc, address _axlUSDC) AxelarExecutable(_gateway) {
        gasService = IAxelarGasService(_gasReceiver);
        UNISWAP_V3_FACTORY = _uniswapV3Factory;
        UNISWAP_V3_ROUTER = _uniswapV3Router;
        USDC = _usdc;
        AXL_USDC = _axlUSDC;
    }

    /**
     * @notice swap token to USDC using uniswap v3 router
     * @param inputTokenAddress address of token being sent
     * @param amount amount of tokens being sent
     */
    function swapToken(address inputTokenAddress, uint256 amount) external returns (uint256) {
        require(IERC20(inputTokenAddress).balanceOf(msg.sender) >= amount, "Insufficient balance");
        require(IERC20(inputTokenAddress).allowance(msg.sender, address(this)) >= amount, "Insufficient allowance");
        
        // Transfer tokens from user to contract
        require(IERC20(inputTokenAddress).transferFrom(msg.sender, address(this), amount), "Transfer failed");

        // Approve the router to spend the input token
        require(IERC20(inputTokenAddress).approve(UNISWAP_V3_ROUTER, amount), "Approval failed");

        // Define possible fee tiers
        uint24[3] memory feeTiers = [uint24(100), uint24(500), uint24(3000)]; // 0.01%, 0.05%, 0.3%

        // Find the best path
        bytes memory bestPath;
        for (uint i = 0; i < feeTiers.length; i++) {
            for (uint j = 0; j < feeTiers.length; j++) {
                bytes memory currentPath = abi.encodePacked(
                    inputTokenAddress,
                    feeTiers[i],
                    USDC,
                    feeTiers[j],
                    AXL_USDC
                );
                if (IUniswapV3Factory(UNISWAP_V3_FACTORY).getPool(inputTokenAddress, USDC, feeTiers[i]) != address(0) &&
                    IUniswapV3Factory(UNISWAP_V3_FACTORY).getPool(USDC, AXL_USDC, feeTiers[j]) != address(0)) {
                    bestPath = currentPath;
                    break;
                }
            }
            if (bestPath.length > 0) break;
        }

        require(bestPath.length > 0, "No valid pool found for the swap");

        // Set up the parameters for the multi-hop swap
        ISwapRouter.ExactInputParams memory params = ISwapRouter.ExactInputParams({
            path: bestPath,
            recipient: address(this),
            deadline: block.timestamp + 15 minutes,
            amountIn: amount,
            amountOutMinimum: 0 // As requested, keeping this at 0
        });

        // Execute the multi-hop swap
        uint256 axlUsdcAmount;
        try ISwapRouter(UNISWAP_V3_ROUTER).exactInput(params) returns (uint256 amountOut) {
            axlUsdcAmount = amountOut;
        } catch Error(string memory reason) {
            revert(string(abi.encodePacked("Swap failed: ", reason)));
        } catch {
            revert("Swap failed with unknown error");
        }

        require(axlUsdcAmount > 0, "Swap resulted in zero output");

        // Emit an event with swap details
        emit TokenSwapped(inputTokenAddress, AXL_USDC, amount, axlUsdcAmount);

        // Return the final amount of axlUSDC
        return axlUsdcAmount;
    }

    /**
     * @notice trigger interchain tx from src chain
     * @dev destinationAddresses will be passed in as gmp message in this tx
     * @param destinationChain name of the dest chain (ex. "Fantom")
     * @param destinationAddress address on dest chain this tx is going to
     * @param hcRecipientAddress recipient addresses receiving hypercert mbol of token being sent
     * @param inputTokenAddress address of token being sent
     * @param amount amount of tokens being sent
     */
    function sendDonation(
        string memory destinationChain,
        string memory destinationAddress,
        address hcRecipientAddress,
        address inputTokenAddress,
        uint256 amount
    ) external payable {
        require(msg.value > 0, 'Gas payment is required');


        // Swap inputTokenAddress to USDC using uniswap v3 router

        uint256 axlUsdcAmount = this.swapToken(inputTokenAddress, amount);

        // Update the amount and symbol for the cross-chain transfer
        amount = axlUsdcAmount;

        address tokenAddress = gateway.tokenAddresses('aUSDC');
        IERC20(tokenAddress).transferFrom(msg.sender, address(this), amount);
        IERC20(tokenAddress).approve(address(gateway), amount);
        bytes memory payload = abi.encode(hcRecipientAddress);
        gasService.payNativeGasForContractCallWithToken{ value: msg.value }(
            address(this),
            destinationChain,
            destinationAddress,
            payload,
            'aUSDC',
            amount,
            msg.sender
        );
        gateway.callContractWithToken(destinationChain, destinationAddress, payload, 'aUSDC', amount);
    }

    /**
     * @notice logic to be executed on dest chain
     * @dev this is triggered automatically by relayer
     * @param payload encoded gmp message sent from src chain
     * @param tokenSymbol symbol of token sent from src chain
     * @param amount amount of tokens sent from src chain
     */
    function _executeWithToken(
        string calldata,
        string calldata,
        bytes calldata payload,
        string calldata tokenSymbol,
        uint256 amount
    ) internal override {
        address recipient = abi.decode(payload, (address));
        address tokenAddress = gateway.tokenAddresses(tokenSymbol);

        uint256 sentAmount = amount;
        
        // Send hypercert to recipient
        // TODO: Replace tokenaddress with hypercert address
        IERC20(tokenAddress).transfer(recipient, sentAmount);

        emit Executed();
    }
}
