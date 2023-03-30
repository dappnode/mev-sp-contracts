/* eslint-disable no-console, no-unused-vars */
const hre = require('hardhat');
const { ethers, upgrades } = require('hardhat');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const upgradeParameters = require('./upgrade_parameters.json');

async function main() {
    // Set multiplier Gas
    let currentProvider = ethers.provider;
    if (upgradeParameters.multiplierGas) {
        if (process.env.HARDHAT_NETWORK !== 'hardhat') {
            const multiplierGas = upgradeParameters.multiplierGas;
            currentProvider = new ethers.providers.JsonRpcProvider(`https://${process.env.HARDHAT_NETWORK}.infura.io/v3/${process.env.INFURA_PROJECT_ID}`);
            async function overrideFeeData() {
                const feedata = await ethers.provider.getFeeData();
                return {
                    maxFeePerGas: feedata.maxFeePerGas.mul(multiplierGas),
                    maxPriorityFeePerGas: feedata.maxPriorityFeePerGas.mul(multiplierGas),
                };
            }
            currentProvider.getFeeData = overrideFeeData;
        }
    }
    let deployer;
    if (process.env.PVTK_DEPLOYMENT) {
        deployer = new ethers.Wallet(upgradeParameters.deployerPvtKey, currentProvider);
        console.log("using pvtkey:", deployer.address)
    } else if (process.env.MNEMONIC) {
        deployer = ethers.Wallet.fromMnemonic(process.env.MNEMONIC, 'm/44\'/60\'/0\'/0/0').connect(currentProvider);
        console.log("using mnemonic:", deployer.address)
    } else {
        [deployer] = (await ethers.getSigners());
    }

    // compìle contracts
    await hre.run('compile');

    for (const upgrade of upgradeParameters.upgrades) {
        const proxyAddress = upgrade.address;
        const contractFactory = await ethers.getContractFactory(upgrade.contractName, deployer);

        if (upgrade.constructorArgs) {
            const txUpgrade = await upgrades.upgradeProxy(proxyAddress, contractFactory,
                {
                    constructorArgs: upgrade.constructorArgs,
                    unsafeAllow: ['constructor', 'state-variable-immutable'],
                    call: { fn: upgrade.callAfterUpgrade.functionName, args: upgrade.callAfterUpgrade.arguments }
                });

            console.log(txUpgrade.deployTransaction);
            console.log(await txUpgrade.deployTransaction.wait());
            console.log('upgrade succesfull', upgrade.contractName);

            console.log(txUpgrade.address);
            console.log("you can verify the new impl address with:")
            console.log(`npx hardhat verify --constructor-args upgrade/arguments.js ${txUpgrade.address} --network ${process.env.HARDHAT_NETWORK}\n`);
            console.log("Copy the following constructor arguments on: upgrade/arguments.js \n", upgrade.constructorArgs)
        } else {
            const txUpgrade = await upgrades.upgradeProxy(proxyAddress, contractFactory)

            console.log(txUpgrade.address);
            console.log("you can verify the new impl address with:")
            console.log(`npx hardhat verify ${txUpgrade.address} --network ${process.env.HARDHAT_NETWORK}`);
        }
    }
}
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
