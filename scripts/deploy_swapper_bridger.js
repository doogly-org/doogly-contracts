require('dotenv').config();
const hre = require("hardhat");

async function main() {
  // Load the private key from .env file
  const privateKey = process.env.EVM_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("Please set your PRIVATE_KEY in a .env file");
  }

  // Create a wallet instance from the private key
  const wallet = new hre.ethers.Wallet(privateKey, hre.ethers.provider);

  console.log("Deploying contracts with the account:", wallet.address);

  // Replace these addresses with the actual addresses for your network
  const axelarGateway = process.env.AXELAR_GATEWAY;
  const axelarGasReceiver = process.env.AXELAR_GAS_RECEIVER;
  const uniswapV3Factory = process.env.UNISWAP_V3_FACTORY;
  const uniswapV3Router = process.env.UNISWAP_V3_ROUTER;
  const usdcAddress = process.env.USDC_ADDRESS;
  const axlUsdcAddress = process.env.AXL_USDC_ADDRESS;
  const hypercertContract = process.env.HYPERCERT_CONTRACT;

  const SwapperBridger = await hre.ethers.getContractFactory("SwapperBridger", wallet);
  const swapperBridger = await SwapperBridger.deploy(
    axelarGateway,
    axelarGasReceiver,
    uniswapV3Factory,
    uniswapV3Router,
    usdcAddress,
    axlUsdcAddress,
    hypercertContract
  );

  await swapperBridger.deployed();

  console.log("SwapperBridger deployed to:", swapperBridger.address);

  // Wait for a few block confirmations to ensure the contract is mined
  console.log("Waiting for block confirmations...");
  await swapperBridger.deployTransaction.wait(5);

  // Verify the contract on Etherscan
  console.log("Verifying contract on Etherscan...");
  await hre.run("verify:verify", {
    address: swapperBridger.address,
    constructorArguments: [
      axelarGateway,
      axelarGasReceiver,
      uniswapV3Factory,
      uniswapV3Router,
      usdcAddress,
      axlUsdcAddress,
      hypercertContract
    ],
  });

  console.log("Contract verified on Etherscan");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
