/* eslint-disable no-await-in-loop */
/* eslint-disable no-console */

const { ethers, upgrades } = require("hardhat");
const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const pathOutputJson = path.join(__dirname, "./deploy_output.json");
const pathOZUpgradability = path.join(
  __dirname,
  `../.openzeppelin/${process.env.HARDHAT_NETWORK}.json`
);

async function main() {
  if (fs.existsSync(pathOZUpgradability)) {
    throw new Error(
      `There's upgradability information from previous deployments. Please delete:\n${pathOZUpgradability}`
    );
  }

  const [deployer] = await ethers.getSigners();
  console.log("Using deployer:", deployer.address);

  const governanceAddress = "0xafF0CA253b97e54440965855cec0A8a2E2399896";
  const subscriptionCollateral = BigInt("10000000000000000"); // 0.01 ETH
  const poolFee = 1000;
  const feeRecipient = governanceAddress;
  const checkPointSlotSize = 7200; // 1 day
  const quorum = 1;

  const minDelayTimelock = 3600; // 1h
  const timelockControllerAddress = governanceAddress;

  // Deploy Proxy
  const factory = await ethers.getContractFactory(
    "DappnodeSmoothingPool",
    deployer
  );
  let dappnodeSmoothingPool;

  for (let i = 0; i < 20; i++) {
    try {
      dappnodeSmoothingPool = await upgrades.deployProxy(factory, [
        governanceAddress,
        subscriptionCollateral,
        poolFee,
        feeRecipient,
        checkPointSlotSize,
        quorum,
      ]);
      await dappnodeSmoothingPool.waitForDeployment();
      break;
    } catch (error) {
      console.log(`Deploy attempt ${i + 1} failed:`, error.message);
    }
  }

  if (!dappnodeSmoothingPool) {
    console.error("❌ Failed to deploy the contract after multiple attempts.");
    process.exit(1);
  }

  const deployedAddress = await dappnodeSmoothingPool.getAddress();
  console.log("\n✅ DappnodeSmoothingPool deployed to:", deployedAddress);
  console.log("Deployer:", deployer.address);

  console.log("\n📋 Contract configuration:");
  console.log(
    "subscriptionCollateral:",
    (await dappnodeSmoothingPool.subscriptionCollateral()).toString()
  );
  console.log("governance:", await dappnodeSmoothingPool.governance());
  console.log("owner:", await dappnodeSmoothingPool.owner());
  console.log("poolFee:", await dappnodeSmoothingPool.poolFee());
  console.log(
    "poolFeeRecipient:",
    await dappnodeSmoothingPool.poolFeeRecipient()
  );
  console.log(
    "checkpointSlotSize:",
    await dappnodeSmoothingPool.checkpointSlotSize()
  );
  console.log("quorum:", await dappnodeSmoothingPool.quorum());

  // Deploy Timelock
  const TimelockFactory = await ethers.getContractFactory(
    "TimelockController",
    deployer
  );
  const timelockContract = await TimelockFactory.deploy(
    minDelayTimelock,
    [timelockControllerAddress],
    [timelockControllerAddress],
    timelockControllerAddress
  );
  await timelockContract.waitForDeployment();

  const timelockAddress = await timelockContract.getAddress();
  console.log("\n✅ TimelockController deployed to:", timelockAddress);
  console.log("minDelay:", (await timelockContract.getMinDelay()).toString());

  // Optional: Transfer ProxyAdmin ownership if allowed
  try {
    console.log("\n🔁 Attempting to transfer ProxyAdmin ownership...");
    await upgrades.admin.transferProxyAdminOwnership(timelockAddress);
    console.log("✅ ProxyAdmin ownership transferred to timelock.");
  } catch (e) {
    console.warn(
      "⚠️ Skipped transferProxyAdminOwnership (maybe not current admin):",
      e.message
    );
  }

  // Transfer contract ownership to governance address
  const tx = await dappnodeSmoothingPool.transferOwnership(governanceAddress);
  await tx.wait();
  console.log(
    "✅ Contract ownership transferred to governance:",
    governanceAddress
  );

  // Write addresses to file
  const outputJson = {
    dappnodeSmoothingPool: deployedAddress,
    timelockContract: timelockAddress,
  };
  fs.writeFileSync(pathOutputJson, JSON.stringify(outputJson, null, 2));
  console.log("\n📦 Output written to:", pathOutputJson);
}

main().catch((err) => {
  console.error("❌ Deployment failed:", err);
  process.exit(1);
});
