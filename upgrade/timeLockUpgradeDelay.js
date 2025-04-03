/* eslint-disable no-console, no-unused-vars, no-use-before-define */
const hre = require("hardhat");
const { ethers, upgrades } = require("hardhat");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const fs = require("fs");
const { expect } = require("chai");

const pathOutputJson = path.join(__dirname, `./upgradeMinDelay.json`);
const upgradeParameters = require("./upgrade_parameters.json");

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

  const newDelay = 60 * 5;

  const proxyAdmin = await upgrades.admin.getInstance();
  const timelockAddress = await proxyAdmin.owner();
  const output = [];

  // Timelock operations
  const TimelockFactory = await ethers.getContractFactory(
    "TimelockController",
    deployer
  );

  // Use timelock
  const salt = upgradeParameters.timelockSalt || ethers.ZeroHash;

  const operation = genOperation(
    timelockAddress,
    0, // value
    TimelockFactory.interface.encodeFunctionData("updateDelay", [newDelay]),
    ethers.ZeroHash, // predecesoor
    salt // salt
  );

  const timelockContract = TimelockFactory.attach(timelockAddress);
  const minDelay = await timelockContract.getMinDelay();

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
  const executeData = TimelockFactory.interface.encodeFunctionData("execute", [
    operation.target,
    operation.value,
    operation.data,
    operation.predecessor,
    operation.salt,
  ]);

  console.log({ scheduleData });
  console.log({ executeData });

  const outputJson = {
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
      const decodedProxyAdmin = TimelockFactory.interface.parseTransaction({
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
