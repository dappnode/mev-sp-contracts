/* eslint-disable no-await-in-loop */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */

const { ethers } = require('hardhat');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const pathOutputJson = path.join(__dirname, './deploy_output.json');
// const deployParameters = require('./deploy_parameters.json');

async function main() {
    const atemptsDeployProxy = 20;
    const currentProvider = ethers.provider;

    let deployer;
    if (process.env.PVTK_DEPLOYMENT) {
        deployer = new ethers.Wallet(process.env.PVTK_DEPLOYMENT, currentProvider);
        console.log('using pvtKey', deployer.address);
    } else {
        deployer = ethers.Wallet.fromMnemonic(process.env.MNEMONIC, 'm/44\'/60\'/0\'/0/0').connect(currentProvider);
        console.log('using Mnemonic', deployer.address);
    }

    // Deploy parameters
    const governanceAddress = deployer.address;
    const subscriptionCollateral = ethers.BigNumber.from(ethers.utils.parseEther('0.08'));
    const poolFee = 1000;
    const feeRecipient = '0xE46F9bE81f9a3ACA1808Bb8c36D353436bb96091';
    const checkPointSlotSize = 7200;
    const quorum = 1;

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
                    governanceAddress,
                    subscriptionCollateral,
                    poolFee,
                    feeRecipient,
                    checkPointSlotSize,
                    quorum,
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

    console.log('#######################\n');
    console.log('dappnodeSmoothingPool deployed to:', dappnodeSmoothingPool.address);

    console.log('\n#######################');
    console.log('#####    Checks    #####');
    console.log('#######################');
    console.log('subscriptionCollateral:', await dappnodeSmoothingPool.subscriptionCollateral());
    console.log('governanceAddress:', await dappnodeSmoothingPool.governance());
    console.log('owner:', await dappnodeSmoothingPool.owner());
    console.log('poolFee:', await dappnodeSmoothingPool.poolFee());
    console.log('poolFeeRecipient:', await dappnodeSmoothingPool.poolFeeRecipient());
    console.log('checkpointSlotSize:', await dappnodeSmoothingPool.checkpointSlotSize());
    console.log('quorum:', await dappnodeSmoothingPool.quorum());

    const outputJson = {
        dappnodeSmoothingPool: dappnodeSmoothingPool.address,
    };
    fs.writeFileSync(pathOutputJson, JSON.stringify(outputJson, null, 1));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
