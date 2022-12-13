/* eslint-disable no-await-in-loop */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */

const { ethers } = require('hardhat');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const pathOutputJson = path.join(__dirname, './deploy_output.json');

const deployParameters = require('./deploy_parameters.json');

async function main() {
    const atemptsDeployProxy = 20;
    let currentProvider = ethers.provider;
    if (deployParameters.multiplierGas || deployParameters.maxFeePerGas) {
        if (process.env.HARDHAT_NETWORK !== 'hardhat') {
            currentProvider = new ethers.providers.JsonRpcProvider(`https://${process.env.HARDHAT_NETWORK}.infura.io/v3/${process.env.INFURA_PROJECT_ID}`);
            if (deployParameters.maxPriorityFeePerGas && deployParameters.maxFeePerGas) {
                console.log(`Hardcoded gas used: MaxPriority${deployParameters.maxPriorityFeePerGas} gwei, MaxFee${deployParameters.maxFeePerGas} gwei`);
                const FEE_DATA = {
                    maxFeePerGas: ethers.utils.parseUnits(deployParameters.maxFeePerGas, 'gwei'),
                    maxPriorityFeePerGas: ethers.utils.parseUnits(deployParameters.maxPriorityFeePerGas, 'gwei'),
                };
                currentProvider.getFeeData = async () => FEE_DATA;
            } else {
                console.log('Multiplier gas used: ', deployParameters.multiplierGas);
                async function overrideFeeData() {
                    const feedata = await ethers.provider.getFeeData();
                    return {
                        maxFeePerGas: feedata.maxFeePerGas.mul(deployParameters.multiplierGas),
                        maxPriorityFeePerGas: feedata.maxPriorityFeePerGas.mul(deployParameters.multiplierGas),
                    };
                }
                currentProvider.getFeeData = overrideFeeData;
            }
        }
    }

    let deployer;
    if (deployParameters.privateKey) {
        deployer = new ethers.Wallet(deployParameters.privateKey, currentProvider);
    } else {
        deployer = ethers.Wallet.fromMnemonic(process.env.MNEMONIC, 'm/44\'/60\'/0\'/0/0').connect(currentProvider);
    }

    const { suscriptionMerkleTree } = deployParameters;
    const oracleAddress = deployParameters.oracleAddress || deployer.address;

    /*
     * Deploy dappnode smoothing pool
     */

    const dappnodeSmoothingPoolFactory = await ethers.getContractFactory('DappnodeSmoothingPool');
    let dappnodeSmoothingPool;
    for (let i = 0; i < atemptsDeployProxy; i++) {
        try {
            dappnodeSmoothingPool = await upgrades.deployProxy(
                dappnodeSmoothingPoolFactory,
                [
                    suscriptionMerkleTree,
                    oracleAddress,
                ],
            );
            break;
        } catch (error) {
            console.log(`attempt ${i}`);
            console.log('upgrades.deployProxy of dappnode smoothing pool ', error);
        }
    }

    console.log('\n#######################');
    console.log('##### Deployment dappnodeSmoothingPool #####');
    console.log('#######################');
    console.log('deployer:', deployer.address);
    console.log('suscriptionMerkleTree:', suscriptionMerkleTree);
    console.log('oracleAddress:', oracleAddress);

    console.log('#######################\n');
    console.log('dappnodeSmoothingPool deployed to:', dappnodeSmoothingPool.address);

    console.log('\n#######################');
    console.log('#####    Checks    #####');
    console.log('#######################');
    console.log('suscriptionMerkleTree:', await dappnodeSmoothingPool.suscriptionsRoot());
    console.log('oracleAddress:', await dappnodeSmoothingPool.oracle());

    const outputJson = {
        dappnodeSmoothingPool: dappnodeSmoothingPool.address,
    };
    fs.writeFileSync(pathOutputJson, JSON.stringify(outputJson, null, 1));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
