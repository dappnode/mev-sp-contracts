// const path = require('path');
// require("dotenv").config({ path: path.join(__dirname, "./.env") });
process.env.HARDHAT_NETWORK = "holesky";
const hre = require('hardhat');
const {ethers}  = require('hardhat');

const fs = require('fs');

async function main() {
    const userAddress = "0xAf25B9bF1C6fecf22bDB86B16db2296bfEc0E366" // example found of puffer ( is SC but its enough) https://holesky.etherscan.io/address/0xAf25B9bF1C6fecf22bDB86B16db2296bfEc0E366
    // console.log(deployer.address);

    const EigenPodManagerAddress = "0x30770d7E3e71112d7A6b7259542D1f680a70e315"; // holesky deployment
    const eigenPodManagerContract = await ethers.getContractAt("IEigenPodManager", EigenPodManagerAddress);
    
    const getPodAddress = eigenPodManagerContract.ownerToPod(userAddress);
    const eigenPodContract = await ethers.getContractAt("IEigenPod", getPodAddress);
    if(getPodAddress == ethers.constants.AddressZero) {
        throw new Error("pod does not exist")
    };

    // Get the validators restaked

    const validators = [];
    const filter = eigenPodContract.filters.ValidatorRestaked(
        undefined,
    );
    const events = await eigenPodContract.queryFilter(filter, 0, "latest");
    events.forEach((e) => {
        validators.push(e.args.validatorIndex);
    });
    
    console.log(validators)
}

// 1689836316

/*
 * We recommend this pattern to be able to use async/await everywhere
 * and properly handle errors.
 */
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
