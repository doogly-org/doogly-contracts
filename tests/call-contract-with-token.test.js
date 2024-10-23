const { utils } = require('ethers');
const { forkNetwork, relay, deployContract } = require('@axelar-network/axelar-local-dev');
const SwapperBridger = require('../artifacts/contracts/CallContractWithToken.sol/SwapperBridger.json');

const { expect } = require('chai');

// Add this at the top of your file
const IERC20_ABI = [
    "function balanceOf(address account) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function transfer(address recipient, uint256 amount) returns (bool)",
];

describe('Call Contract With Token', async () => {
    
    let polygon;
    let avalanche;

    let polygonUserWallet;
    let avalancheUserWallet;
    let avalancheUserWalletTwo;

    let deployedContractPolygon;
    let deployedContractAvalanche;

    let aUSDCPolygon;
    let aUSDCAvalanche;

    let avalancheUniswapV3Router;
    let avalancheUniswapV3Factory;
    let polygonUniswapV3Router;
    let polygonUniswapV3Factory;
    let impersonatedSigner
    let addressToImpersonate
    let daiAddress
    let axlUSDCAddressPolygon
    let axlUSDCAddressAvalanche

    // Function to wait for transaction receipt and block confirmation
    async function waitForTransactionAndConfirmation(txHash, confirmations = 3) {
      // Wait for the transaction receipt
      let receipt = null;
      while (receipt === null) {
          receipt = await polygon.ganacheProvider.send("eth_getTransactionReceipt", [txHash]);
          if (!receipt) {
              await new Promise(resolve => setTimeout(resolve, 100)); // Wait for 100ms before checking again
          }
      }

      // Get the block number of the transaction
      const txBlockNumber = parseInt(receipt.blockNumber, 16);

      // Wait for the specified number of confirmations
      let currentBlockNumber = txBlockNumber;
      while (currentBlockNumber < txBlockNumber + confirmations) {
          await polygon.ganacheProvider.send("evm_mine"); // Mine a new block
          const latestBlock = await polygon.ganacheProvider.send("eth_getBlockByNumber", ["latest", false]);
          currentBlockNumber = parseInt(latestBlock.number, 16);
      }

      return receipt;
  }

    before(async function () {
      this.timeout(1000000)
      try{
        // Initialize a Polygon network
        polygon = await forkNetwork({
          name: "Polygon",
          gateway: "0x6f015F16De9fC8791b234eF68D486d2bF203FBA8",
          rpc: "https://polygon-rpc.com",
          chainId: 137,
          constAddressDeployer: "0x98B2920D53612483F91F12Ed7754E51b4A77919e",
          create3Deployer: "0x6513Aedb4D1593BA12e50644401D976aebDc90d8",
          tokenName: "MATIC",
          tokenSymbol: "MATIC",
          gasService: "0x2d5d7d31F671F86C782533cc367F14109a082712",
          AxelarGasService: {
              address: "0x2d5d7d31F671F86C782533cc367F14109a082712",
          },
          AxelarDepositService: {
              address: "0xc1DCb196BA862B337Aa23eDA1Cb9503C0801b955",
          },
        }, {
          ganacheOptions: {
            wallet: {
              unlockedAccounts: [
                "0x2183227eB9A21451718003FdBe36b6b6CBD58Fb2",
              ]
            }
          }
          
        });

        polygon.tokens["USDC"] = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";

        polygonUniswapV3Router = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
        polygonUniswapV3Factory = "0x1F98431c8aD98523631AE4a59f267346ea31F984";

        // Initialize an Avalanche network
        avalanche = await forkNetwork({
            name: 'Avalanche',
            gateway: "0x5029C0EFf6C34351a0CEc334542cDb22c7928f78",
            rpc: "https://api.avax.network/ext/bc/C/rpc",
            chainId: 43114,
            constAddressDeployer: "0x98B2920D53612483F91F12Ed7754E51b4A77919e",
            create3Deployer: "0x6513Aedb4D1593BA12e50644401D976aebDc90d8",
            tokenName: "AVAX",
            tokenSymbol: "AVAX",
            gasService: "0x319B4890828E31980199496328e689672885F892",
            AxelarGasService: {
                address: "0x2d5d7d31F671F86C782533cc367F14109a082712",
            },
            AxelarDepositService: {
                address: "0xc1DCb196BA862B337Aa23eDA1Cb9503C0801b955",
            },
        });

        avalanche.tokens["USDC"] = "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E";

        avalancheUniswapV3Router = "0xbb00FF08d01D300023C629E8fFfFcb65A5a578cE";
        avalancheUniswapV3Factory = "0x60aE616a2155Ee3d9A68541Ba4544862310933d4";

        // Extract user wallets for both networks
        [polygonUserWallet] = polygon.userWallets;
        [avalancheUserWallet] = avalanche.userWallets;


        // DAI token address on Polygon
        daiAddress = "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063";
        axlUSDCAddressPolygon = "0x750e4C4984a9e0f12978eA6742Bc1c5D248f40ed";
        axlUSDCAddressAvalanche = "0xfaB550568C688d5D8A52C7d794cb93Edc26eC0eC";

        // Address to impersonate (replace with the address you want to impersonate)
        addressToImpersonate = "0x2183227eB9A21451718003FdBe36b6b6CBD58Fb2";

        // Set ETH balance for the impersonated account
        await polygon.ganacheProvider.send("evm_setAccountBalance", [addressToImpersonate, "0x56BC75E2D63100000"]); // 100 ETH

      } catch (error) {
        console.error("Error in before hook:", error);
        throw error;
      }
        
        // Deploy USDC token on the Polygon network
        // await polygon.deployToken('USDC', 'aUSDC', 6, BigInt(100_000e6));

        // Deploy USDC token on the Fantom network
        // await avalanche.deployToken('USDC', 'aUSDC', 6, BigInt(100_000e6));

        // Get token contracts for both chains
        // aUSDCPolygon = polygon.getTokenContract('aUSDC');
        // aUSDCAvalanche = await avalanche.getTokenContract('aUSDC');

        // await polygon.giveToken(polygonUserWallet.address, 'aUSDC', BigInt(100e6));
    });

    describe('src chain', async () => {
        beforeEach(async () => {
          console.log(polygon.tokens)
            deployedContractPolygon = await deployContract(polygonUserWallet, SwapperBridger, [
                polygon.gateway.address,
                polygon.gasService.address,
                polygonUniswapV3Factory,
                polygonUniswapV3Router,
                polygon.tokens.USDC,
                axlUSDCAddressPolygon,
            ], {
              "gasLimit": 6660666
            });

            deployedContractAvalanche = await deployContract(avalancheUserWallet, SwapperBridger, [
                avalanche.gateway.address,
                avalanche.gasService.address,
                avalancheUniswapV3Factory,
                avalancheUniswapV3Router,
                avalanche.tokens.USDC,
                axlUSDCAddressAvalanche,
            ], {
              "gasLimit": 6660666
            });
        });
        // afterEach(async () => {
        //     await relay();
        // });
        it('should set correct gateway and gas service addresses on src chain', async () => {
            expect(await deployedContractPolygon.gateway()).to.equal(polygon.gateway.address);
            expect(await deployedContractPolygon.gasService()).to.equal(polygon.gasService.address);
        });

        it('should successfully trigger interchain tx', async () => {
            try {
                const maticBalance = await polygon.ganacheProvider.send("eth_getBalance", [addressToImpersonate, "latest"]);
                console.log(`MATIC balance: ${utils.formatEther(maticBalance)}`);

                // Check DAI balance
                const daiBalance = await polygon.ganacheProvider.send("eth_call", [{
                    to: daiAddress,
                    data: utils.hexlify(utils.concat([
                        utils.id("balanceOf(address)").slice(0, 10),
                        utils.hexZeroPad(addressToImpersonate, 32)
                    ]))
                }, "latest"]);
                const daiBalanceFormatted = utils.formatUnits(daiBalance, 18);
                console.log(`DAI balance: ${daiBalanceFormatted}`);

                // Check DAI allowance
                const allowanceData = utils.hexlify(utils.concat([
                    utils.id("allowance(address,address)").slice(0, 10),
                    utils.hexZeroPad(addressToImpersonate, 32),
                    utils.hexZeroPad(deployedContractPolygon.address, 32)
                ]));
                const daiAllowance = await polygon.ganacheProvider.send("eth_call", [{
                    to: daiAddress,
                    data: allowanceData
                }, "latest"]);
                const daiAllowanceFormatted = utils.formatUnits(daiAllowance, 18);
                console.log(`DAI allowance: ${daiAllowanceFormatted}`);

                // Approve DAI spending if necessary
                if (parseFloat(daiAllowanceFormatted) < 1) {
                    console.log("Approving DAI spending...");
                    const approveData = utils.hexlify(utils.concat([
                        utils.id("approve(address,uint256)").slice(0, 10),
                        utils.hexZeroPad(deployedContractPolygon.address, 32),
                        utils.hexZeroPad(utils.parseUnits("1", 18).toHexString(), 32)
                    ]));
                    const approveTx = await polygon.ganacheProvider.send("eth_sendTransaction", [{
                        from: addressToImpersonate,
                        to: daiAddress,
                        data: approveData,
                        gasLimit: utils.hexlify(6660666),
                    }]);
                    console.log("DAI spending approved, transaction:", approveTx);
                }

                console.log("Calling sendDonation...");
                const abiCoder = new utils.AbiCoder();
                const sendDonationData = utils.hexlify(
                    utils.concat([
                        utils.id("sendDonation(string,string,address,address,uint256,address,uint256)").slice(0, 10),
                        abiCoder.encode(
                            ["string", "string", "address", "address", "uint256", "address", "uint256"],
                            [
                                avalanche.name,
                                deployedContractAvalanche.address,
                                avalancheUserWallet.address,
                                splitsAddress, // You need to define this
                                hypercertFractionId, // You need to define this
                                daiAddress,
                                utils.parseUnits("1", 18)
                            ]
                        )
                    ])
                );

                const tx = await polygon.ganacheProvider.send("eth_sendTransaction", [{
                    from: addressToImpersonate,
                    to: deployedContractPolygon.address,
                    data: sendDonationData,
                    gasLimit: utils.hexlify(16660666),
                    value: utils.parseEther("10").toHexString(),
                }]);

                console.log("Transaction sent:", tx);
                
                const txReceipt = await waitForTransactionAndConfirmation(tx, 3);
                console.log("Transaction receipt:", txReceipt);

            } catch (error) {
                console.error("Error in sendDonation:", error);
                throw error;
            }
        });

        // it('should pay gas via axelar gas service', async () => {
        //     const payload = utils.defaultAbiCoder.encode(['address[]'], [[avalancheUserWallet.address, avalancheUserWalletTwo.address]]);
        //     const hashedPayload = utils.keccak256(payload);
        //     await expect(
        //         deployedContractPolygon.sendToMany(
        //             avalanche.name,
        //             deployedContractAvalanche.address,
        //             [avalancheUserWallet.address, avalancheUserWalletTwo.address],
        //             'aUSDC',
        //             6e6,
        //             {
        //                 value: (1e18).toString(),
        //             },
        //         ),
        //     )
        //         .to.emit(polygon.gasService, 'NativeGasPaidForContractCallWithToken')
        //         .withArgs(
        //             deployedContractPolygon.address,
        //             avalanche.name,
        //             deployedContractAvalanche.address,
        //             hashedPayload,
        //             'aUSDC',
        //             6e6,
        //             (1e18).toString(),
        //             polygonUserWallet.address,
        //         );
        // });
    });

    // describe('dest chain', async () => {
    //     beforeEach(async () => {
    //         deployedContractPolygon = await deployContract(polygonUserWallet, SwapperBridger, [
    //             polygon.gateway.address,
    //             polygon.gasService.address,
    //         ]);
    //         deployedContractAvalanche = await deployContract(avalancheUserWallet, SwapperBridger, [
    //             avalanche.gateway.address,
    //             avalanche.gasService.address,
    //         ]);

    //         await aUSDCPolygon.connect(polygonUserWallet).approve(deployedContractPolygon.address, (100e18).toString());
    //     });
    //     afterEach(async () => {
    //         await relay();
    //     });
    //     it('should set correct gateway addresses and gas service addresses on dest chain', async () => {
    //         expect(await deployedContractAvalanche.gateway()).to.equal(avalanche.gateway.address);
    //         expect(await deployedContractAvalanche.gasService()).to.equal(avalanche.gasService.address);
    //     });

    //     it('should distribute token evenly', async () => {
    //         const receiverOneBalanceBefore = await aUSDCAvalanche.balanceOf(avalancheUserWalletTwo.address);
    //         const receiverTwoBalanceBefore = await aUSDCAvalanche.balanceOf(avalancheUserWalletTwo.address);

    //         await deployedContractPolygon.sendToMany(
    //             avalanche.name,
    //             deployedContractAvalanche.address,
    //             [avalancheUserWallet.address, avalancheUserWalletTwo.address],
    //             'aUSDC',
    //             6e6,
    //             {
    //                 value: (1e18).toString(),
    //             },
    //         );

    //         await relay();

    //         const receiverOneBalanceAfter = await aUSDCAvalanche.balanceOf(avalancheUserWallet.address);
    //         expect(receiverOneBalanceAfter).to.equal(parseInt(receiverOneBalanceBefore) + 3e6);

    //         const receiverTwoBalanceAfter = await aUSDCAvalanche.balanceOf(avalancheUserWalletTwo.address);
    //         expect(receiverTwoBalanceAfter).to.equal(parseInt(receiverTwoBalanceBefore) + 3e6);
    //     });
    //     it('should emit Executed event', async () => {
    //         const ExecutedEvent = deployedContractAvalanche.filters.Executed();

    //         const blockNumberBefore = await avalanche.lastRelayedBlock;
    //         const blockInfoBefore = await avalanche.provider.getLogs(blockNumberBefore);
    //         const eventsBefore = await deployedContractAvalanche.queryFilter(ExecutedEvent, blockInfoBefore.hash);

    //         await deployedContractPolygon.sendToMany(
    //             avalanche.name,
    //             deployedContractAvalanche.address,
    //             [avalancheUserWallet.address, avalancheUserWalletTwo.address],
    //             'aUSDC',
    //             6e6,
    //             {
    //                 value: (1e18).toString(),
    //             },
    //         );

    //         await relay();

    //         const blockNumberAfter = await avalanche.lastRelayedBlock;
    //         const blockInfoAfter = await avalanche.provider.getLogs(blockNumberAfter);

    //         const eventsAfter = await deployedContractAvalanche.queryFilter(ExecutedEvent, blockInfoAfter.hash);

    //         expect(eventsBefore.length + 1).to.equal(eventsAfter.length);

    //         for (const events in eventsAfter) {
    //             const event = eventsAfter[events];
    //             expect(event.event).to.equal('Executed');
    //         }
    //     });
    // });
});


















