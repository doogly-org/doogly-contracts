const { utils } = require('ethers');
const { forkNetwork, relay, deployContract } = require('@axelar-network/axelar-local-dev');
const CallContractWithToken = require('../artifacts/contracts/CallContractWithToken.sol/CallContractWithToken.json');

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
    let polygonUniswapV3Router;

    let impersonatedSigner
    let addressToImpersonate
    let daiAddress
    let axlUSDCAddress

    before(async () => {
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
          tokens: {
              "USDC": "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
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

        polygonUniswapV3Router = "0xE592427A0AEce92De3Edee1F18E0157C05861564";

        // Initialize an Avalanche network
        // avalanche = await forkNetwork({
        //     name: 'Avalanche',
        //     gateway: "0x5029C0EFf6C34351a0CEc334542cDb22c7928f78",
        //     rpc: "https://api.avax.network/ext/bc/C/rpc",
        //     chainId: 43114,
        //     constAddressDeployer: "0x98B2920D53612483F91F12Ed7754E51b4A77919e",
        //     create3Deployer: "0x6513Aedb4D1593BA12e50644401D976aebDc90d8",
        //     tokenName: "AVAX",
        //     tokenSymbol: "AVAX",
        //     gasService: "0x319B4890828E31980199496328e689672885F892",
        //     AxelarGasService: {
        //         address: "0x2d5d7d31F671F86C782533cc367F14109a082712",
        //     },
        //     AxelarDepositService: {
        //         address: "0xc1DCb196BA862B337Aa23eDA1Cb9503C0801b955",
        //     },
        //     tokens: {
        //         "USDC": "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
        //     },
        // });

        // avalancheUniswapV3Router = "0xbb00FF08d01D300023C629E8fFfFcb65A5a578cE";

        // Extract user wallets for both networks
        [polygonUserWallet] = polygon.userWallets;
        // [avalancheUserWallet, avalancheUserWalletTwo] = avalanche.userWallets;


        // DAI token address on Polygon
        daiAddress = "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063";
        axlUSDCAddress = "0x750e4C4984a9e0f12978eA6742Bc1c5D248f40ed";

        // Address to impersonate (replace with the address you want to impersonate)
        addressToImpersonate = "0x2183227eB9A21451718003FdBe36b6b6CBD58Fb2";
        
        // Impersonate the address in Ganache
        // const tx = await polygon.provider.send("evm_unlockUnknownAccount", [addressToImpersonate]);
        // console.log(tx)

        // Set ETH balance for the impersonated account
        polygon.ganacheProvider.send("evm_setAccountBalance", [addressToImpersonate, "0xDE0B6B3A7640000"]); // 1 ETH

        // Get the DAI contract
        // const daiContract = await polygon.getTokenContract(daiAddress);

        // Mint DAI tokens to the impersonated address
        // You might need to impersonate the DAI contract owner to do this
        // const daiOwner = await daiContract.owner();
        // await polygon.provider.send("evm_setAccountBalance", [daiOwner, "0x56BC75E2D63100000"]); // 100 ETH
        // const daiOwnerSigner = polygon.provider.getSigner(daiOwner);
        // console.log("deploying token");
        // await daiContract.connect(daiOwnerSigner).mint(polygonUserWallet, utils.parseUnits("1000000", 18)); // Mint 1 million DAI

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
            deployedContractPolygon = await deployContract(polygonUserWallet, CallContractWithToken, [
                //polygon.gateway,
                "0x6f015F16De9fC8791b234eF68D486d2bF203FBA8",
                //polygon.gasService,
                "0x2d5d7d31F671F86C782533cc367F14109a082712",
                polygonUniswapV3Router,
                //polygon.tokens.USDC,
                "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
                axlUSDCAddress,
            ], {
              "gasLimit": 6660666
            });

            // deployedContractAvalanche = await deployContract(avalancheUserWallet, CallContractWithToken, [
            //     avalanche.gateway.address,
            //     avalanche.gasService.address,
            //     avalancheUniswapV3Router,
            //     avalanche.tokens.USDC,
            //     aUSDCAvalanche.address,
            // ]);
            // await aUSDCPolygon.connect(polygonUserWallet).approve(deployedContractPolygon.address, (100e18).toString());
        });
        afterEach(async () => {
            await relay();
        });
        it('should set correct gateway and gas service addresses on src chain', async () => {
            expect(await deployedContractPolygon.gateway()).to.equal(polygon.gateway.address);
            expect(await deployedContractPolygon.gasService()).to.equal(polygon.gasService.address);
        });

        it('should execute swapToken function to swap DAI to USDC and USDC to aUSDC on Polygon', async function() {
            try {
                console.log(`Impersonated address: ${addressToImpersonate}`);
                console.log(`DAI address: ${daiAddress}`);
                console.log(`USDC address: 0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359`);

                // Create approve transaction data
                const approveData = utils.hexlify(
                    utils.concat([
                        utils.id("approve(address,uint256)").slice(0, 10),
                        utils.hexZeroPad(deployedContractPolygon.address, 32),
                        utils.hexZeroPad(utils.parseUnits("10", 18).toHexString(), 32)
                    ])
                );

                // Send approve transaction
                const approveTx = await polygon.ganacheProvider.send("eth_sendTransaction", [{
                    from: addressToImpersonate,
                    to: daiAddress,
                    data: approveData,
                    gasLimit: utils.hexlify(6660666),
                }]);

                console.log("Approval transaction sent:", approveTx);

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

                // Replace the existing waitForTransaction calls with the new function
                const approveReceipt = await waitForTransactionAndConfirmation(approveTx);
                console.log("Approval transaction receipt:", approveReceipt);

                const usdcApproveData = utils.hexlify(
                  utils.concat([
                      utils.id("approve(address,uint256)").slice(0, 10),
                      utils.hexZeroPad(polygonUniswapV3Router, 32),
                      utils.hexZeroPad(utils.parseUnits("100", 18).toHexString(), 32)
                  ])
                );

                // Send approve transaction
                const usdcApproveTx = await polygon.ganacheProvider.send("eth_sendTransaction", [{
                    from: addressToImpersonate,
                    to: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
                    data: usdcApproveData,
                    gasLimit: utils.hexlify(6660666),
                }]);

                console.log("Approval transaction sent:", usdcApproveTx);

                const usdcApproveReceipt = await waitForTransactionAndConfirmation(usdcApproveTx);
                console.log("USDC Approval transaction receipt:", usdcApproveReceipt);

                // Function to encode function calls
                function encodeFunctionCall(functionSignature, params) {
                    const functionSelector = utils.id(functionSignature).slice(0, 10);
                    const encodedParams = utils.defaultAbiCoder.encode(params.types, params.values);
                    return utils.hexConcat([functionSelector, encodedParams]);
                }

                // balanceOf call
                const balanceOfData = encodeFunctionCall("balanceOf(address)", {
                    types: ["address"],
                    values: [addressToImpersonate]
                });

                const daiBalance = await polygon.ganacheProvider.send("eth_call", [{
                    to: daiAddress,
                    data: balanceOfData
                }, "latest"]);

                // allowance calls
                const allowanceData = encodeFunctionCall("allowance(address,address)", {
                    types: ["address", "address"],
                    values: [addressToImpersonate, deployedContractPolygon.address]
                });

                const daiAllowance = await polygon.ganacheProvider.send("eth_call", [{
                    to: daiAddress,
                    data: allowanceData
                }, "latest"]);

                const usdcAllowance = await polygon.ganacheProvider.send("eth_call", [{
                    to: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
                    data: allowanceData
                }, "latest"]);

                console.log(`DAI Balance: ${utils.formatUnits(daiBalance, 18)}`);
                console.log(`DAI Allowance for contract: ${utils.formatUnits(daiAllowance, 18)}`);
                console.log(`USDC Allowance for contract: ${utils.formatUnits(usdcAllowance, 6)}`);

                // Create swapToken transaction data
                const swapData = utils.hexlify(
                    utils.concat([
                        utils.id("swapToken(address,uint256)").slice(0, 10),
                        utils.hexZeroPad(daiAddress, 32),
                        utils.hexZeroPad(utils.parseUnits("1", 18).toHexString(), 32)
                    ])
                );

                // Send swapToken transaction
                const swapTx = await polygon.ganacheProvider.send("eth_sendTransaction", [{
                    from: addressToImpersonate,
                    to: deployedContractPolygon.address,
                    data: swapData,
                    gasLimit: utils.hexlify(6660666)
                }]);

                console.log("Swap transaction sent:", swapTx);

                // For the swap transaction
                const swapReceipt = await waitForTransactionAndConfirmation(swapTx);
                console.log("Swap transaction receipt:", swapReceipt);

                // Check balances after swap
                const daiBalanceAfter = await polygon.ganacheProvider.send("eth_call", [{
                    to: daiAddress,
                    data: utils.hexlify(utils.concat([
                        utils.id("balanceOf(address)").slice(0, 10),
                        utils.hexZeroPad(addressToImpersonate, 32)
                    ]))
                }, "latest"]);

                const usdcBalanceAfter = await polygon.ganacheProvider.send("eth_call", [{
                    to: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
                    data: utils.hexlify(utils.concat([
                        utils.id("balanceOf(address)").slice(0, 10),
                        utils.hexZeroPad(addressToImpersonate, 32)
                    ]))
                }, "latest"]);

                console.log(`DAI balance after: ${utils.formatUnits(daiBalanceAfter, 18)}`);
                console.log(`USDC balance after: ${utils.formatUnits(usdcBalanceAfter, 6)}`);

                // Add your assertions here
                // For example:
                // expect(utils.parseUnits(daiBalanceAfter, 18)).to.be.lt(utils.parseUnits(daiBalanceBefore, 18));
                // expect(utils.parseUnits(usdcBalanceAfter, 6)).to.be.gt(utils.parseUnits(usdcBalanceBefore, 6));

            } catch (error) {
                console.error("Test failed with error:", error);
                throw error;
            }
        });

        // it('should deduct funds from msg.sender', async () => {
        //     const totalSupplyBefore = await aUSDCPolygon.totalSupply();
        //     const myBalanceBefore = await aUSDCPolygon.balanceOf(polygonUserWallet.address);

        //     await deployedContractPolygon.sendToMany(
        //         avalanche.name,
        //         deployedContractAvalanche.address,
        //         [avalancheUserWallet.address, avalancheUserWalletTwo.address],
        //         'aUSDC',
        //         6e6,
        //         {
        //             value: (1e18).toString(),
        //         },
        //     );

        //     const myBalanceAfter = await aUSDCPolygon.balanceOf(polygonUserWallet.address);
        //     const totalSupplyAfter = await aUSDCPolygon.totalSupply();

        //     expect(myBalanceAfter).to.equal(myBalanceBefore - 6e6);
        //     expect(totalSupplyAfter).to.equal(totalSupplyBefore - 6e6); //token was removed by the gateway on the src chain
        // });
        // it('should successfully trigger interchain tx', async () => {
        //     const payload = utils.defaultAbiCoder.encode(['address[]'], [[avalancheUserWallet.address, avalancheUserWalletTwo.address]]);
        //     const hashedPayload = utils.keccak256(payload);
        //     await expect(
        //         deployedContractPolygon.sendDonation(
        //             avalanche.name,
        //             deployedContractAvalanche.address,
        //             avalancheUserWallet.address,
        //             aUSDCPolygon.address,
        //             6e6,
        //             {
        //                 value: (1e18).toString(),
        //             },
        //         ),
        //     )
        //         .to.emit(polygon.gateway, 'ContractCallWithToken')
        //         .withArgs(
        //             deployedContractPolygon.address,
        //             avalanche.name,
        //             deployedContractAvalanche.address,
        //             hashedPayload,
        //             payload,
        //             aUSDCAvalanche.address,
        //             6e6,
        //         );
        // });

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
    //         deployedContractPolygon = await deployContract(polygonUserWallet, CallContractWithToken, [
    //             polygon.gateway.address,
    //             polygon.gasService.address,
    //         ]);
    //         deployedContractAvalanche = await deployContract(avalancheUserWallet, CallContractWithToken, [
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








