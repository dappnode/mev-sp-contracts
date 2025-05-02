require("dotenv").config();
require("@nomicfoundation/hardhat-toolbox");
require("@openzeppelin/hardhat-upgrades");
require("hardhat-dependency-compiler");

DEFAULT_MNEMONIC =
  "test test test test test test test test test test test junk";

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  dependencyCompiler: {
    paths: ["@openzeppelin/contracts/governance/TimelockController.sol"], // ,
    // keep: true
  },
  solidity: {
    compilers: [
      {
        version: "0.8.21",
        settings: {
          optimizer: {
            enabled: true,
            runs: 999999,
          },
          evmVersion: "shanghai",
        },
      },
      {
        version: "0.6.11",
        settings: {
          optimizer: {
            enabled: true,
            runs: 999999,
          },
        },
      },
    ],
  },
  networks: {
    kurtosis: {
      url: process.env.KURTOSIS_RPC_URL || "http://65.109.102.216:42002/", // adjust as needed
      chainId: 3151908,
      accounts: process.env.PVTK_DEPLOYMENT
        ? [process.env.PVTK_DEPLOYMENT]
        : [],
    },
  },
  gasReporter: {
    enabled: !!process.env.REPORT_GAS,
    outputFile: process.env.REPORT_GAS_FILE ? "./gas_report.md" : null,
    noColors: !!process.env.REPORT_GAS_FILE,
  },
  etherscan: {
    apiKey: {
      hoodi: `${process.env.ETHERSCAN_API_KEY}`,
      sepolia: `${process.env.ETHERSCAN_API_KEY}`,
      mainnet: `${process.env.ETHERSCAN_API_KEY}`,
    },
    customChains: [
      {
        network: "kurtosis",
        chainId: 3151908,
        urls: {
          apiURL: "https://api-hoodi.etherscan.io/api",
          browserURL: "https://hoodi.etherscan.io/",
        },
      },
    ],
  },
};
