const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');

// const { StandardMerkleTree } = require("merkletreejs");
const { MerkleTree } = require('merkletreejs');

describe('DappnodeSmoothingPool test', () => {
    let deployer;
    let oracle;
    let addressValidator1; let addressValidator2; let
        poolRecipient1;

    let dappnodeSmoothingPool;

    let valuesSuscription;
    let leafsSuscriptions;
    let suscriptionMerkleTree;

    beforeEach('Deploy contract', async () => {
        // Load signers
        [deployer, oracle, addressValidator1, addressValidator2, poolRecipient1] = await ethers.getSigners();

        // Load Merkle Trees
        valuesSuscription = [
            [addressValidator1.address, 1],
            [addressValidator2.address, 2],
        ];
        leafsSuscriptions = valuesSuscription.map((suscription) => ethers.utils.solidityKeccak256(['address', 'uint32'], suscription));
        suscriptionMerkleTree = new MerkleTree(
            leafsSuscriptions,
            ethers.utils.keccak256,
            { sortPairs: true },
        ); // sort : true? leafs sorted too?

        // Deploy dappnode smoothing pool
        const dappnodeSmoothingPoolFactory = await ethers.getContractFactory('DappnodeSmoothingPool');
        dappnodeSmoothingPool = await upgrades.deployProxy(
            dappnodeSmoothingPoolFactory,
            [
                suscriptionMerkleTree.getHexRoot(),
                oracle.address,
            ],
        );
        await dappnodeSmoothingPool.deployed();
    });

    it('should check the initialize', async () => {
        expect(await dappnodeSmoothingPool.suscriptionsRoot()).to.be.equal(suscriptionMerkleTree.getHexRoot());
        expect(await dappnodeSmoothingPool.oracle()).to.be.equal(oracle.address);
    });

    it('Should chek suscription', async () => {
        const merkleProofInvalid = suscriptionMerkleTree.getHexProof(leafsSuscriptions[1]);
        const merkleProof = suscriptionMerkleTree.getHexProof(leafsSuscriptions[0]);
        const validatorID = 1;

        // Check suscribeValidator
        await expect(dappnodeSmoothingPool.connect(addressValidator1).suscribeValidator(
            validatorID,
            poolRecipient1.address,
            merkleProofInvalid,
        ))
            .to.be.revertedWith('DappnodeSmoothingPool::suscription Invalid proof');

        await expect(dappnodeSmoothingPool.connect(addressValidator1).suscribeValidator(
            validatorID,
            poolRecipient1.address,
            merkleProof,
        ))
            .to.emit(dappnodeSmoothingPool, 'SuscribeValidator')
            .withArgs(validatorID, addressValidator1.address, poolRecipient1.address);

        // Check suscription
        const suscriptionBlockNumber = await ethers.provider.getBlockNumber();
        let suscription = await dappnodeSmoothingPool.validatorToSuscription(1);
        expect(await suscription.depositAddress).to.be.equal(addressValidator1.address);
        expect(await suscription.blockStart).to.be.equal(suscriptionBlockNumber);
        expect(await suscription.blockEnd).to.be.equal(0);
        expect(await suscription.poolRecipient).to.be.equal(poolRecipient1.address);

        await expect(dappnodeSmoothingPool.connect(addressValidator1).suscribeValidator(
            validatorID,
            poolRecipient1.address,
            merkleProof,
        ))
            .to.be.revertedWith('DappnodeSmoothingPool::_newSuscription validator already suscribed');

        // Check update suscription
        await expect(dappnodeSmoothingPool.connect(deployer).updateSuscription(validatorID, deployer.address))
            .to.be.revertedWith('DappnodeSmoothingPool::updateSuscription deposit address must match msg.sender');

        await expect(dappnodeSmoothingPool.connect(addressValidator1).updateSuscription(
            validatorID,
            addressValidator1.address,
        ))
            .to.emit(dappnodeSmoothingPool, 'UpdateSuscription')
            .withArgs(validatorID, addressValidator1.address, false);

        suscription = await dappnodeSmoothingPool.validatorToSuscription(1);
        expect(await suscription.depositAddress).to.be.equal(addressValidator1.address);
        expect(await suscription.blockStart).to.be.equal(suscriptionBlockNumber);
        expect(await suscription.blockEnd).to.be.equal(0);
        expect(await suscription.poolRecipient).to.be.equal(addressValidator1.address);

        // Check unsuscribeValidator
        await expect(dappnodeSmoothingPool.connect(deployer).unsuscribeValidator(validatorID))
            .to.be.revertedWith('DappnodeSmoothingPool::unsuscribeValidator validator has not been suscribed');

        await expect(dappnodeSmoothingPool.connect(addressValidator1).unsuscribeValidator(validatorID))
            .to.emit(dappnodeSmoothingPool, 'UnsuscribeValidator')
            .withArgs(validatorID);

        const unSuscriptionBlockNumber = await ethers.provider.getBlockNumber();
        suscription = await dappnodeSmoothingPool.validatorToSuscription(1);
        expect(await suscription.depositAddress).to.be.equal(addressValidator1.address);
        expect(await suscription.blockStart).to.be.equal(suscriptionBlockNumber);
        expect(await suscription.blockEnd).to.be.equal(unSuscriptionBlockNumber);
        expect(await suscription.poolRecipient).to.be.equal(addressValidator1.address);
    });

    it('should check oracle methods', async () => {
        // Check update suscriptions root
        expect(await dappnodeSmoothingPool.suscriptionsRoot()).to.be.equal(suscriptionMerkleTree.getHexRoot());

        await expect(dappnodeSmoothingPool.connect(deployer).updateSuscriptionsRoot(ethers.constants.HashZero))
            .to.be.revertedWith('DappnodeSmoothingPool::onlyOracle: only oracle');

        await expect(dappnodeSmoothingPool.connect(oracle).updateSuscriptionsRoot(ethers.constants.HashZero))
            .to.emit(dappnodeSmoothingPool, 'UpdateSuscriptionsRoot')
            .withArgs(ethers.constants.HashZero);

        expect(await dappnodeSmoothingPool.suscriptionsRoot()).to.be.equal(ethers.constants.HashZero);

        // Check update updateRewardsRoot root
        expect(await dappnodeSmoothingPool.rewardsRoot()).to.be.equal(ethers.constants.HashZero);

        await expect(dappnodeSmoothingPool.connect(deployer).updateRewardsRoot(suscriptionMerkleTree.getHexRoot()))
            .to.be.revertedWith('DappnodeSmoothingPool::onlyOracle: only oracle');

        await expect(dappnodeSmoothingPool.connect(oracle).updateRewardsRoot(suscriptionMerkleTree.getHexRoot()))
            .to.emit(dappnodeSmoothingPool, 'UpdateRewardsRoot')
            .withArgs(suscriptionMerkleTree.getHexRoot());
        expect(await dappnodeSmoothingPool.rewardsRoot()).to.be.equal(suscriptionMerkleTree.getHexRoot());

        // Check suscribe oracle
        const suscriptionBlockNumber = await ethers.provider.getBlockNumber();
        const validatorID = 10;

        await expect(dappnodeSmoothingPool.connect(deployer).suscribeOracle(
            [validatorID],
            [poolRecipient1.address],
            [suscriptionBlockNumber],
        ))
            .to.be.revertedWith('DappnodeSmoothingPool::onlyOracle: only oracle');
        await expect(dappnodeSmoothingPool.connect(oracle).suscribeOracle(
            [validatorID],
            [addressValidator1.address],
            [suscriptionBlockNumber],
        ))
            .to.emit(dappnodeSmoothingPool, 'SuscribeValidator')
            .withArgs(validatorID, addressValidator1.address, addressValidator1.address);

        const suscription = await dappnodeSmoothingPool.validatorToSuscription(validatorID);
        expect(await suscription.depositAddress).to.be.equal(addressValidator1.address);
        expect(await suscription.blockStart).to.be.equal(suscriptionBlockNumber);
        expect(await suscription.blockEnd).to.be.equal(0);
        expect(await suscription.poolRecipient).to.be.equal(addressValidator1.address);
    });
    it('Should claimRewards and unbann method', async () => {
        const depositAddress = addressValidator1.address;
        const poolRecipient = addressValidator1.address;
        const availableBalance = ethers.utils.parseEther('10');
        const unbanBalance = 0;

        const valuesRewards = [
            [depositAddress, poolRecipient, availableBalance, unbanBalance],
            [addressValidator2.address, addressValidator2.address, ethers.utils.parseEther('1'), 0],
        ];
        const leafsRewards = valuesRewards.map((rewardLeaf) => ethers.utils.solidityKeccak256(['address', 'address', 'uint256', 'uint256'], rewardLeaf));
        const rewardsMerkleTree = new MerkleTree(leafsRewards, ethers.utils.keccak256, { sortPairs: true });

        const merkleProofInvalid = rewardsMerkleTree.getHexProof(leafsRewards[1]);
        const merkleProof = rewardsMerkleTree.getHexProof(leafsRewards[0]);

        // Update rewards root
        await expect(dappnodeSmoothingPool.connect(oracle).updateRewardsRoot(rewardsMerkleTree.getHexRoot()))
            .to.emit(dappnodeSmoothingPool, 'UpdateRewardsRoot')
            .withArgs(rewardsMerkleTree.getHexRoot());
        expect(await dappnodeSmoothingPool.rewardsRoot()).to.be.equal(rewardsMerkleTree.getHexRoot());

        // Check claimRewards
        await expect(dappnodeSmoothingPool.claimRewards(depositAddress, poolRecipient, availableBalance, unbanBalance, merkleProofInvalid))
            .to.be.revertedWith('DappnodeSmoothingPool::claimRewards Invalid proof');

        await expect(dappnodeSmoothingPool.claimRewards(depositAddress, poolRecipient, availableBalance, unbanBalance, merkleProof))
            .to.be.revertedWith('DappnodeSmoothingPool::claimRewards: ETH_TRANSFER_FAILED');

        // Send ether
        await expect(deployer.sendTransaction({
            to: dappnodeSmoothingPool.address,
            value: availableBalance,
        })).to.emit(dappnodeSmoothingPool, 'Donation')
            .withArgs(availableBalance);

        // Check events

        const balancePoolRecipient = await ethers.provider.getBalance(poolRecipient);
        await expect(dappnodeSmoothingPool.connect(deployer).claimRewards(
            depositAddress,
            poolRecipient,
            availableBalance,
            unbanBalance,
            merkleProof,
        ))
            .to.emit(dappnodeSmoothingPool, 'ClaimRewards')
            .withArgs(depositAddress, poolRecipient, availableBalance);

        const balancePoolRecipientAfter = await ethers.provider.getBalance(poolRecipient);
        expect(balancePoolRecipient.add(availableBalance)).to.be.equal(balancePoolRecipientAfter)
    });
});

/*
 * OZ impl
 * Leaf:keccak256(abi.encodePacked(depositAddress, poolRecipient, availableBalance, unbanBalance)
 * const valuesRewards = [
 *     ["0x1111111111111111111111111111111111111111", "5000000000000000000"],
 *     ["0x2222222222222222222222222222222222222222", "2500000000000000000"]
 * ];
 * const rewardsMerkleTree = StandardMerkleTree.of(valuesSuscription, ["address", "address", "uint256", "uint256"]);
 * Load Merkle Trees OZ
 * valuesSuscription = [
 *     [addressValidator1.address, 1],
 *     [addressValidator2.address, 2]
 * ];
 * suscriptionMerkleTree = StandardMerkleTree.of(valuesSuscription, ["address", "uint32"]);
 */
