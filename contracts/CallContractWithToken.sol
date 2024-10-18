//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { AxelarExecutable } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/executable/AxelarExecutable.sol';
import { IAxelarGateway } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IAxelarGateway.sol';
import { IERC20 } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IERC20.sol';
import { IAxelarGasService } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IAxelarGasService.sol';
import { ISwapRouter } from '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';


/**
 * @title Call Contract With Token 
 * @notice Send a token along with an Axelar GMP message between two blockchains
 */
contract CallContractWithToken is AxelarExecutable {
    IAxelarGasService public immutable gasService;

    // Define the Uniswap V3 SwapRouter address
    address public  UNISWAP_V3_ROUTER;

    // Define the USDC and axlUSDC token addresses
    address public USDC;
    address public AXL_USDC; // Replace with actual axlUSDC address

    event Executed();

    /**
     * 
     * @param _gateway address of axl gateway on deployed chain
     * @param _gasReceiver address of axl gas service on deployed chain
     */
    constructor(address _gateway, address _gasReceiver, address _uniswapV3Router, address _usdc, address _axlUSDC) AxelarExecutable(_gateway) {
        gasService = IAxelarGasService(_gasReceiver);
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
        IERC20(inputTokenAddress).transferFrom(msg.sender, address(this), amount);
        
        // Approve the router to spend the input token
        IERC20(inputTokenAddress).approve(UNISWAP_V3_ROUTER, amount);

        // Set up the parameters for the first swap (input token to USDC)
        ISwapRouter.ExactInputSingleParams memory params1 = ISwapRouter.ExactInputSingleParams({
            tokenIn: inputTokenAddress,
            tokenOut: USDC,
            fee: 3000, // 0.3% fee tier, adjust if needed
            recipient: address(this),
            deadline: block.timestamp + 15 minutes,
            amountIn: amount,
            amountOutMinimum: 0, // Note: This should be calculated off-chain for production use
            sqrtPriceLimitX96: 0
        });

        // Execute the first swap
        uint256 usdcAmount = ISwapRouter(UNISWAP_V3_ROUTER).exactInputSingle(params1);

        // // Approve the router to spend USDC
        // IERC20(USDC).approve(UNISWAP_V3_ROUTER, usdcAmount);

        // // Set up the parameters for the second swap (USDC to axlUSDC)
        // ISwapRouter.ExactInputSingleParams memory params2 = ISwapRouter.ExactInputSingleParams({
        //     tokenIn: USDC,
        //     tokenOut: AXL_USDC,
        //     fee: 500, // 0.05% fee tier, adjust if needed
        //     recipient: address(this),
        //     deadline: block.timestamp + 15 minutes,
        //     amountIn: usdcAmount,
        //     amountOutMinimum: 0, // Note: This should be calculated off-chain for production use
        //     sqrtPriceLimitX96: 0
        // });

        // // Execute the second swap
        // uint256 axlUsdcAmount = ISwapRouter(UNISWAP_V3_ROUTER).exactInputSingle(params2);

        // Return the final amount of axlUSDC
        return usdcAmount;
        
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
