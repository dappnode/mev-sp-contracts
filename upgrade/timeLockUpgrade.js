/* eslint-disable no-console, no-unused-vars, no-use-before-define */
const hre = require("hardhat");
const { ethers, upgrades } = require("hardhat");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const fs = require("fs");
const { expect } = require("chai");

const upgradeParameters = require("./upgrade_parameters.json");

const pathOutputJson = path.join(
  __dirname,
  `./upgrade_output_${new Date().getTime() / 1000}.json`
);

async function main() {
  // Load provider
  let currentProvider = ethers.provider;
  if (upgradeParameters.multiplierGas || upgradeParameters.maxFeePerGas) {
    if (process.env.HARDHAT_NETWORK !== "hardhat") {
      currentProvider = ethers.getDefaultProvider(
        `https://${process.env.HARDHAT_NETWORK}.infura.io/v3/${process.env.INFURA_PROJECT_ID}`
      );
      if (
        upgradeParameters.maxPriorityFeePerGas &&
        upgradeParameters.maxFeePerGas
      ) {
        console.log(
          `Hardcoded gas used: MaxPriority${upgradeParameters.maxPriorityFeePerGas} gwei, MaxFee${upgradeParameters.maxFeePerGas} gwei`
        );
        const FEE_DATA = new ethers.FeeData(
          null,
          ethers.parseUnits(upgradeParameters.maxFeePerGas, "gwei"),
          ethers.parseUnits(upgradeParameters.maxPriorityFeePerGas, "gwei")
        );

        currentProvider.getFeeData = async () => FEE_DATA;
      } else {
        console.log("Multiplier gas used: ", upgradeParameters.multiplierGas);
        async function overrideFeeData() {
          const feedata = await ethers.provider.getFeeData();
          return new ethers.FeeData(
            null,
            (feedata.maxFeePerGas * BigInt(upgradeParameters.multiplierGas)) /
              1000n,
            (feedata.maxPriorityFeePerGas *
              BigInt(upgradeParameters.multiplierGas)) /
              1000n
          );
        }
        currentProvider.getFeeData = overrideFeeData;
      }
    }
  }

  // Check contract name existence
  for (const upgrade of upgradeParameters.upgrades) {
    await ethers.getContractFactory(upgrade.contractName);
  }

  // Load deployer
  let deployer;
  if (upgradeParameters.deployerPvtKey) {
    deployer = new ethers.Wallet(
      upgradeParameters.deployerPvtKey,
      currentProvider
    );
  } else if (process.env.MNEMONIC) {
    deployer = ethers.HDNodeWallet.fromMnemonic(
      ethers.Mnemonic.fromPhrase(process.env.MNEMONIC),
      "m/44'/60'/0'/0/0"
    ).connect(currentProvider);
  } else {
    [deployer] = await ethers.getSigners();
  }

  console.log("deploying with: ", deployer.address);

  // compìle contracts
  await hre.run("compile");

  const proxyAdmin = await upgrades.admin.getInstance();
  const timelockAddress = await proxyAdmin.owner();
  const output = [];

  // Upgrade zkevm
  for (const upgrade of upgradeParameters.upgrades) {
    const proxydappnodeAddress = upgrade.address;
    const dappnodeZkEVMFactory = await ethers.getContractFactory(
      upgrade.contractName,
      deployer
    );

    // Assert correct admin
    expect(
      await upgrades.erc1967.getAdminAddress(proxydappnodeAddress)
    ).to.be.equal(proxyAdmin.target);

    let newImpldappnodeAddress;

    if (upgrade.constructorArgs) {
      newImpldappnodeAddress = await upgrades.prepareUpgrade(
        proxydappnodeAddress,
        dappnodeZkEVMFactory,
        {
          constructorArgs: upgrade.constructorArgs,
          unsafeAllow: ["constructor", "state-variable-immutable"],
        }
      );

      console.log({ newImpldappnodeAddress });
      console.log("you can verify the new impl address with:");
      console.log(
        `npx hardhat verify --constructor-args upgrade/arguments.js ${newImpldappnodeAddress} --network ${process.env.HARDHAT_NETWORK}\n`
      );
      console.log(
        "Copy the following constructor arguments on: upgrade/arguments.js \n",
        upgrade.constructorArgs
      );
    } else {
      newImpldappnodeAddress = await upgrades.prepareUpgrade(
        proxydappnodeAddress,
        dappnodeZkEVMFactory
      );

      console.log({ newImpldappnodeAddress });
      console.log("you can verify the new impl address with:");
      console.log(
        `npx hardhat verify ${newImpldappnodeAddress} --network ${process.env.HARDHAT_NETWORK}`
      );
    }

    // Use timelock
    const salt = upgradeParameters.timelockSalt || ethers.ZeroHash;

    let operation;
    if (upgrade.callAfterUpgrade) {
      operation = genOperation(
        proxyAdmin.target,
        0, // value
        proxyAdmin.interface.encodeFunctionData("upgradeAndCall", [
          proxydappnodeAddress,
          newImpldappnodeAddress,
          dappnodeZkEVMFactory.interface.encodeFunctionData(
            upgrade.callAfterUpgrade.functionName,
            upgrade.callAfterUpgrade.arguments
          ),
        ]),
        ethers.ZeroHash, // predecesoor
        salt // salt
      );
    } else {
      operation = genOperation(
        proxyAdmin.target,
        0, // value
        proxyAdmin.interface.encodeFunctionData("upgrade", [
          proxydappnodeAddress,
          newImpldappnodeAddress,
        ]),
        ethers.ZeroHash, // predecesoor
        salt // salt
      );
    }

    // Timelock operations
    const TimelockFactory = await ethers.getContractFactory(
      "TimelockController",
      deployer
    );
    const minDelay = upgradeParameters.timelockMinDelay || 0;

    // Schedule operation
    const scheduleData = TimelockFactory.interface.encodeFunctionData(
      "schedule",
      [
        operation.target,
        operation.value,
        operation.data,
        operation.predecessor,
        operation.salt,
        minDelay,
      ]
    );
    // Execute operation
    const executeData = TimelockFactory.interface.encodeFunctionData(
      "execute",
      [
        operation.target,
        operation.value,
        operation.data,
        operation.predecessor,
        operation.salt,
      ]
    );

    console.log({ scheduleData });
    console.log({ executeData });

    const outputJson = {
      contractName: upgrade.contractName,
      scheduleData,
      executeData,
      timelockContractAdress: timelockAddress,
    };

    // Decode the scheduleData for better readibility
    const timelockTx = TimelockFactory.interface.parseTransaction({
      data: scheduleData,
    });
    const paramsArray = timelockTx?.fragment.inputs;
    const objectDecoded = {};

    for (let i = 0; i < paramsArray?.length; i++) {
      const currentParam = paramsArray[i];
      objectDecoded[currentParam.name] = timelockTx?.args[i];

      if (currentParam.name == "data") {
        const decodedProxyAdmin = proxyAdmin.interface.parseTransaction({
          data: timelockTx?.args[i],
        });
        const objectDecodedData = {};
        const paramsArrayData = decodedProxyAdmin?.fragment.inputs;

        objectDecodedData.signature = decodedProxyAdmin?.signature;
        objectDecodedData.selector = decodedProxyAdmin?.selector;

        for (let j = 0; j < paramsArrayData?.length; j++) {
          const currentParam = paramsArrayData[j];
          objectDecodedData[currentParam.name] = decodedProxyAdmin?.args[j];
        }
        objectDecoded["decodedData"] = objectDecodedData;
      }
    }

    outputJson.decodedScheduleData = objectDecoded;

    fs.writeFileSync(pathOutputJson, JSON.stringify(outputJson, null, 1));
  }
}
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

// OZ test functions
function genOperation(target, value, data, predecessor, salt) {
  const id = ethers.solidityPackedKeccak256(
    ["address", "uint256", "bytes", "uint256", "bytes32"],
    [target, value, data, predecessor, salt]
  );
  return {
    id,
    target,
    value,
    data,
    predecessor,
    salt,
  };
}

Object.defineProperty(BigInt.prototype, "toJSON", {
  get() {
    "use strict";
    return () => String(this);
  },
});
