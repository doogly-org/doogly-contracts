//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { AxelarExecutable } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/executable/AxelarExecutable.sol';
import { IAxelarGateway } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IAxelarGateway.sol';
import { IERC20 } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IERC20.sol';
import { IAxelarGasService } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IAxelarGasService.sol';
import {IV3SwapRouter} from '@uniswap/swap-router-contracts/contracts/interfaces/IV3SwapRouter.sol';
import { IUniswapV3Factory } from '@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol';
import { IUniswapV3Pool } from '@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol';
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

interface IHypercertToken {
    function splitFraction(
        address account,
        uint256 tokenID,
        uint256[] memory _values
    ) external;

    function unitsOf(uint256 tokenId) external view returns (uint256);
}

interface IAllo {
    function fundPool(uint256 _poolId, uint256 _amount) external payable;
}

/**
 * @title Call Contract With Token 
 * @notice Send a token along with an Axelar GMP message between two blockchains
 */
contract SwapperBridger is AxelarExecutable, ReentrancyGuard {
    using Strings for bytes;
    using Strings for uint256;
    IAxelarGasService public immutable gasService;
    address public immutable hypercertContract;

    event CrossChainTransfer(
        address operator,
        address token,
        uint256 amount,
        address splitsAddress,
        uint256 hypercertFractionId,
        address fractionRecipient
    );

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
    constructor(address _gateway, address _gasReceiver, address _uniswapV3Factory, address _uniswapV3Router, address _usdc, address _axlUSDC, address _hypercertContract) AxelarExecutable(_gateway) {
        gasService = IAxelarGasService(_gasReceiver);
        UNISWAP_V3_FACTORY = _uniswapV3Factory;
        UNISWAP_V3_ROUTER = _uniswapV3Router;
        USDC = _usdc;
        AXL_USDC = _axlUSDC;
        hypercertContract = _hypercertContract;
    }

    /**
     * @notice swap token to USDC using uniswap v3 router
     * @param inputTokenAddress address of token being sent
     * @param amount amount of tokens being sent
     */
    function _swapToken(address inputTokenAddress, uint256 amount) internal returns (uint256) {

        if (inputTokenAddress == AXL_USDC) {
            // Transfer axlUSDC tokens from user to contract
            require(IERC20(inputTokenAddress).transferFrom(msg.sender, address(this), amount), "Transfer failed");

            return amount;
        }

        uint256 axlUsdcAmount;
        
        // Approve the router to spend the input token (if it's not native token)
        if (inputTokenAddress != address(0)) {
            require(IERC20(inputTokenAddress).approve(UNISWAP_V3_ROUTER, amount), "Approval failed");
        }

        bytes memory path;
        if (inputTokenAddress == USDC) {
            // If input is USDC, do single swap to axlUSDC
            path = abi.encodePacked(USDC, findBestFeeTier(USDC, AXL_USDC), AXL_USDC);
        } else {
            // For other tokens, do multihop swap: token -> USDC -> axlUSDC
            path = abi.encodePacked(
                inputTokenAddress, 
                findBestFeeTier(inputTokenAddress, USDC), 
                USDC, 
                findBestFeeTier(USDC, AXL_USDC), 
                AXL_USDC
            );
        }

        // Transfer axlUSDC tokens from user to contract
        require(IERC20(inputTokenAddress).transferFrom(msg.sender, address(this), amount), "Transfer failed");

        // Set up the parameters for the swap
        IV3SwapRouter.ExactInputParams memory params = IV3SwapRouter.ExactInputParams({
            path: path,
            recipient: address(this),
            // deadline: block.timestamp + 15 minutes,
            amountIn: amount,
            amountOutMinimum: 0 // As requested, keeping this at 0
        });

        // Execute the swap
        try IV3SwapRouter(UNISWAP_V3_ROUTER).exactInput{value: inputTokenAddress == address(0) ? amount : 0}(params) returns (uint256 amountOut) {
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

    function findBestFeeTier(address tokenA, address tokenB) internal view returns (uint24) {
        uint24[4] memory feeTiers = [uint24(500), uint24(3000), uint24(10000), uint24(100)]; // 0.05%, 0.3%, 1%, 0.01%
        uint128 highestLiquidity = 0;
        uint24 bestFeeTier = 0;
        
        for (uint i = 0; i < feeTiers.length; i++) {
            address poolAddress = IUniswapV3Factory(UNISWAP_V3_FACTORY).getPool(tokenA, tokenB, feeTiers[i]);
            if (poolAddress != address(0)) {
                uint128 liquidity = IUniswapV3Pool(poolAddress).liquidity();
                if (liquidity > highestLiquidity) {
                    highestLiquidity = liquidity;
                    bestFeeTier = feeTiers[i];
                }
            }
        }
        
        require(bestFeeTier != 0, "No valid pool found for the swap");
        return bestFeeTier;
    }

    function bytesToHexString(bytes memory data) internal pure returns (string memory) {
        bytes memory alphabet = "0123456789abcdef";
        bytes memory str = new bytes(2 + data.length * 2);
        str[0] = "0";
        str[1] = "x";
        for (uint256 i = 0; i < data.length; i++) {
            str[2 + i * 2] = alphabet[uint8(data[i] >> 4)];
            str[3 + i * 2] = alphabet[uint8(data[i] & 0x0f)];
        }
        return string(str);
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
        uint256 poolId,
        address _splitsAddress,
        uint256 _hypercertFractionId,
        address inputTokenAddress,
        uint256 amount
    ) external payable {
        require(msg.value > 0, 'Gas payment is required');

        uint256 swappedAmount = _swapToken(inputTokenAddress, amount);

        // Update the amount and symbol for the cross-chain transfer
        amount = swappedAmount;

        address tokenAddress = gateway.tokenAddresses('axlUSDC');

        IERC20(tokenAddress).approve(address(gateway), amount);
        bytes memory payload = abi.encode(hcRecipientAddress, _splitsAddress, _hypercertFractionId, _poolId);
        gasService.payNativeGasForContractCallWithToken{ value: msg.value }(
            address(this),
            destinationChain,
            destinationAddress,
            payload,
            'axlUSDC',
            amount,
            msg.sender
        );
        gateway.callContractWithToken(destinationChain, destinationAddress, payload, 'axlUSDC', amount);
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
        (address hypercertRecipient, address recipientAddress, uint256 hypercertFractionId, uint256 poolId) = abi.decode(payload, (address, address, uint256, uint256));
        uint256 amountOut;
        // Swap and transfer funds to allo pool if poolId is provided or else to recipient
        if (poolId != 0) {
          amountOut = _swapAxlUsdcToUsdc(amount, address(this));

          // Approve the Allo contract to withdraw funds
          require(IERC20(USDC).approve(recipientAddress, amount), "Approval failed");
          
          // Fund allo pool
          IAllo(recipientAddress).fundPool(poolId, amountOut);
        } else {
          amountOut = _swapAxlUsdcToUsdc(amount, recipientAddress);
        }
        
        _receiveCrossChain(USDC, amountOut, recipientAddress, hypercertFractionId, hypercertRecipient);
   
        emit Executed();
    }

    function _receiveCrossChain(
        address _token,
        uint256 _amount,
        address _splitsAddress,
        uint256 _hypercertFractionId,
        address _fractionRecipient
    ) internal nonReentrant {
        require(_splitsAddress != address(0), "Invalid splits address");
        require(_fractionRecipient != address(0), "Invalid recipient address");

        // Check available balance in fraction
        uint256 availableBalance = IHypercertToken(hypercertContract).unitsOf(
            _hypercertFractionId
        );

        // Check if amount is available in fraction
        if(_amount <= availableBalance) {
            // Build splits params array
            uint256[] memory updatedFractionBalances = new uint256[](2);
            updatedFractionBalances[0] = availableBalance - _amount;
            updatedFractionBalances[1] = _amount;
            
            // Encode the function call to splitFraction
            bytes memory data = abi.encodeWithSignature(
                "splitFraction(address,uint256,uint256[])",
                _fractionRecipient,
                _hypercertFractionId,
                updatedFractionBalances
            );

            // Call the function with the contract as msg.sender
            (bool success, ) = hypercertContract.call(data);
            require(success, "Function call failed");
        }

        // Celebrate
        emit CrossChainTransfer(
            msg.sender,
            _token,
            _amount,
            _splitsAddress,
            _hypercertFractionId,
            _fractionRecipient
        );
    }

    /**
     * @notice Swap bridged axlUSDC back to USDC
     * @param _amount Amount of axlUSDC to swap
     * @param _splitsAddress Receiver address
     */
    function _swapAxlUsdcToUsdc(uint256 _amount, address _splitsAddress) internal returns (uint256) {
        require(IERC20(AXL_USDC).balanceOf(address(this)) >= _amount, "Insufficient axlUSDC balance");

        // Approve the router to spend axlUSDC
        require(IERC20(AXL_USDC).approve(UNISWAP_V3_ROUTER, _amount), "Approval failed");

        // Transfer axlUSDC tokens to contract
        require(IERC20(AXL_USDC).transfer(address(this), _amount), "Transfer failed");

        // Set up the swap path
        bytes memory path = abi.encodePacked(
            AXL_USDC,
            findBestFeeTier(AXL_USDC, USDC),
            USDC
        );

        // Set up the parameters for the swap
        IV3SwapRouter.ExactInputParams memory params = IV3SwapRouter.ExactInputParams({
            path: path,
            recipient: _splitsAddress,
            // deadline: block.timestamp + 15 minutes,
            amountIn: _amount,
            amountOutMinimum: 0 // Consider setting a minimum amount out for production
        });

        // Execute the swap
        uint256 usdcAmount;
        try IV3SwapRouter(UNISWAP_V3_ROUTER).exactInput(params) returns (uint256 amountOut) {
            usdcAmount = amountOut;
        } catch Error(string memory reason) {
            revert(string(abi.encodePacked("Swap failed: ", reason)));
        } catch {
            revert("Swap failed with unknown error");
        }

        if (usdcAmount < _amount) {
          require(_amount - usdcAmount < _amount/20, "Bad axlUSDC/USDC rate");
        }

        // Emit an event with swap details
        emit TokenSwapped(AXL_USDC, USDC, _amount, usdcAmount);

        return usdcAmount;
    }
}
