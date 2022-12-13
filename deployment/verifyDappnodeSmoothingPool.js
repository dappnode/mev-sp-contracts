/* eslint-disable import/no-dynamic-require, no-await-in-loop, no-restricted-syntax, guard-for-in */
require('dotenv').config();
// const path = require('path');
const hre = require('hardhat');
const { expect } = require('chai');
// const { ethers } = require('hardhat');

const openzeppelinUpgrade = require(`../../.openzeppelin/${process.env.HARDHAT_NETWORK}.json`);

const pathDeployOutputParameters = path.join(__dirname, './deploy_output.json');
const deployOutputParameters = require(pathDeployOutputParameters);


async function main() {
    // load deployer account
    if (typeof process.env.ETHERSCAN_API_KEY === 'undefined') {
        throw new Error('Etherscan API KEY has not been defined');
    }

    // verify upgradable SC (dappnode smoothing pool)
    for (const implementation in openzeppelinUpgrade.impls) {
        const { address } = openzeppelinUpgrade.impls[implementation];
        try {
            await hre.run('verify:verify', { address });
        } catch (error) {
            expect(error.message.toLowerCase().includes('already verified')).to.be.equal(true);
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
