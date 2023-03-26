const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');

// const { StandardMerkleTree } = require("merkletreejs");
const { MerkleTree } = require('merkletreejs');

describe('DappnodeSmoothingPool test', () => {
    let deployer;
    let oracle;
    let validator1; let validator2; let
        rewardRecipientValidator2;

    let dappnodeSmoothingPool;

    const suscriptionCollateral = ethers.BigNumber.from(ethers.utils.parseEther("0.01"));

    beforeEach('Deploy contract', async () => {
        // Load signers
        [deployer, oracle, validator1, validator2, rewardRecipientValidator2, donator] = await ethers.getSigners();

        // Deploy dappnode smoothing pool
        const dappnodeSmoothingPoolFactory = await ethers.getContractFactory('DappnodeSmoothingPool');
        dappnodeSmoothingPool = await upgrades.deployProxy(
            dappnodeSmoothingPoolFactory,
            [
                oracle.address,
                suscriptionCollateral
            ],
        );
        await dappnodeSmoothingPool.deployed();
    });

    it('should check the initialize', async () => {
        expect(await dappnodeSmoothingPool.oracle()).to.be.equal(oracle.address);
        expect(await dappnodeSmoothingPool.suscriptionCollateral()).to.be.equal(suscriptionCollateral);
    });

    it('should check the initialize', async () => {
        const donationValue = ethers.utils.parseEther("1");
        await expect(donator.sendTransaction({
            to: dappnodeSmoothingPool.address,
            value: donationValue
        })).to.emit(dappnodeSmoothingPool, "EtherReceived").withArgs(donator.address, donationValue)

        await expect(donator.sendTransaction({
            to: dappnodeSmoothingPool.address,
            value: donationValue,
            data: "0x123123123132"
        })).to.emit(dappnodeSmoothingPool, "EtherReceived").withArgs(donator.address, donationValue)
    });


    it('Should suscribe validator and unsuscribe', async () => {
        const validatorID = 1;

        // Check suscribeValidator
        await expect(dappnodeSmoothingPool.suscribeValidator(validatorID))
            .to.be.revertedWith('DappnodeSmoothingPool::suscribeValidator: msg.value does not equal suscription collateral');

        await expect(dappnodeSmoothingPool.suscribeValidator(validatorID, { value: suscriptionCollateral.add(1) }))
            .to.be.revertedWith('DappnodeSmoothingPool::suscribeValidator: msg.value does not equal suscription collateral');

        const initialSmoothingPoolEther = await ethers.provider.getBalance(dappnodeSmoothingPool.address);

        await expect(dappnodeSmoothingPool.suscribeValidator(validatorID, { value: suscriptionCollateral }))
            .to.emit(dappnodeSmoothingPool, 'SuscribeValidator')
            .withArgs(suscriptionCollateral, validatorID);

        expect(await ethers.provider.getBalance(dappnodeSmoothingPool.address))
            .to.be.equal(initialSmoothingPoolEther.add(suscriptionCollateral))


        await expect(dappnodeSmoothingPool.unsuscribeValidator(validatorID))
            .to.emit(dappnodeSmoothingPool, 'UnsuscribeValidator')
            .withArgs(deployer.address, validatorID);
    });


    it('should check oracle methods', async () => {
        // Check update updateRewardsRoot root
        expect(await dappnodeSmoothingPool.rewardsRoot()).to.be.equal(ethers.constants.HashZero);

        const valuesRewards = [
            [deployer.address, ethers.utils.parseEther('1')],
            [validator2.address, ethers.utils.parseEther('1')],
        ];
        const leafsRewards = valuesRewards.map((rewardLeaf) => ethers.utils.solidityKeccak256(['address', 'uint256'], rewardLeaf));
        const rewardsMerkleTree = new MerkleTree(leafsRewards, ethers.utils.keccak256, { sortPairs: true, duplicateOdd: true });

        await expect(dappnodeSmoothingPool.connect(deployer).updateRewardsRoot(rewardsMerkleTree.getHexRoot()))
            .to.be.revertedWith('DappnodeSmoothingPool::onlyOracle: only oracle');

        await expect(dappnodeSmoothingPool.connect(oracle).updateRewardsRoot(rewardsMerkleTree.getHexRoot()))
            .to.emit(dappnodeSmoothingPool, 'UpdateRewardsRoot')
            .withArgs(rewardsMerkleTree.getHexRoot());
        expect(await dappnodeSmoothingPool.rewardsRoot()).to.be.equal(rewardsMerkleTree.getHexRoot());

        // Check update oracle 
        expect(await dappnodeSmoothingPool.oracle()).to.be.equal(oracle.address);

        await expect(dappnodeSmoothingPool.connect(deployer).updateOracle(deployer.address))
            .to.be.revertedWith('DappnodeSmoothingPool::onlyOracle: only oracle');

        await expect(dappnodeSmoothingPool.connect(oracle).updateOracle(deployer.address))
            .to.emit(dappnodeSmoothingPool, 'UpdateOracle')
            .withArgs(deployer.address);
        expect(await dappnodeSmoothingPool.oracle()).to.be.equal(deployer.address);
    });

    it('should check owner methods', async () => {
        // Check update oracle 
        expect(await dappnodeSmoothingPool.owner()).to.be.equal(deployer.address);
        expect(await dappnodeSmoothingPool.suscriptionCollateral()).to.be.equal(suscriptionCollateral);

        const newCollateral = suscriptionCollateral.mul(2);
        await expect(dappnodeSmoothingPool.connect(oracle).updateCollateral(newCollateral))
            .to.be.revertedWith('Ownable: caller is not the owner');

        await expect(dappnodeSmoothingPool.connect(deployer).updateCollateral(newCollateral))
            .to.emit(dappnodeSmoothingPool, 'UpdateSuscriptionCollateral')
            .withArgs(newCollateral);
        expect(await dappnodeSmoothingPool.suscriptionCollateral()).to.be.equal(newCollateral);
    });

    it('Should claimRewards and unbann method', async () => {
        const availableBalanceValidator1 = ethers.utils.parseEther('10');
        const availableBalanceValidator2 = ethers.utils.parseEther('1');

        const valuesRewards = [
            [validator1.address, availableBalanceValidator1],
            [validator2.address, availableBalanceValidator2],
        ];
        const leafsRewards = valuesRewards.map((rewardLeaf) => ethers.utils.solidityKeccak256(['address', 'uint256'], rewardLeaf));
        const rewardsMerkleTree = new MerkleTree(leafsRewards, ethers.utils.keccak256, { sortPairs: true, duplicateOdd: true });

        const merkleProofValidator2 = rewardsMerkleTree.getHexProof(leafsRewards[1]);
        const merkleProofValidator1 = rewardsMerkleTree.getHexProof(leafsRewards[0]);

        // Update rewards root
        await expect(dappnodeSmoothingPool.connect(oracle).updateRewardsRoot(rewardsMerkleTree.getHexRoot()))
            .to.emit(dappnodeSmoothingPool, 'UpdateRewardsRoot')
            .withArgs(rewardsMerkleTree.getHexRoot());

        expect(await dappnodeSmoothingPool.rewardsRoot()).to.be.equal(rewardsMerkleTree.getHexRoot());

        // Check claimRewards
        await expect(dappnodeSmoothingPool.claimRewards(validator1.address, availableBalanceValidator1, merkleProofValidator2))
            .to.be.revertedWith('DappnodeSmoothingPool::claimRewards Invalid merkle proof');

        await expect(dappnodeSmoothingPool.claimRewards(validator1.address, availableBalanceValidator1, merkleProofValidator1))
            .to.be.revertedWith('DappnodeSmoothingPool::claimRewards: Eth transfer failed');

        // Send ether
        await expect(deployer.sendTransaction({
            to: dappnodeSmoothingPool.address,
            value: ethers.utils.parseEther('100'),
        })).to.emit(dappnodeSmoothingPool, 'EtherReceived')
            .withArgs(deployer.address, ethers.utils.parseEther('100'));

        // Claim rewards
        const balancePoolRecipient = await ethers.provider.getBalance(validator1.address);
        await expect(dappnodeSmoothingPool.connect(deployer).claimRewards(
            validator1.address,
            availableBalanceValidator1,
            merkleProofValidator1,
        ))
            .to.emit(dappnodeSmoothingPool, 'ClaimRewards')
            .withArgs(validator1.address, validator1.address, availableBalanceValidator1);

        const balancePoolRecipientAfter = await ethers.provider.getBalance(validator1.address);
        expect(balancePoolRecipient.add(availableBalanceValidator1)).to.be.equal(balancePoolRecipientAfter)


        // Validator 2 delegate rewards
        expect(await dappnodeSmoothingPool.rewardRecipient(validator2.address)).to.be.equal(ethers.constants.AddressZero);

        await expect(dappnodeSmoothingPool.connect(validator2).setRewardRecipient(
            rewardRecipientValidator2.address
        ))
            .to.emit(dappnodeSmoothingPool, 'SetRewardRecipient')
            .withArgs(validator2.address, rewardRecipientValidator2.address);
        expect(await dappnodeSmoothingPool.rewardRecipient(validator2.address)).to.be.equal(rewardRecipientValidator2.address);

        // Claim rewards
        const balancePoolRecipient2 = await ethers.provider.getBalance(rewardRecipientValidator2.address);
        await expect(dappnodeSmoothingPool.connect(deployer).claimRewards(
            validator2.address,
            availableBalanceValidator2,
            merkleProofValidator2,
        ))
            .to.emit(dappnodeSmoothingPool, 'ClaimRewards')
            .withArgs(validator2.address, rewardRecipientValidator2.address, availableBalanceValidator2);


        const balancePoolRecipientAfter2 = await ethers.provider.getBalance(rewardRecipientValidator2.address);
        expect(balancePoolRecipient2.add(availableBalanceValidator2)).to.be.equal(balancePoolRecipientAfter2)


        // Try claim again and no rewards are sent
        await expect(dappnodeSmoothingPool.connect(deployer).claimRewards(
            validator2.address,
            availableBalanceValidator2,
            merkleProofValidator2,
        ))
            .to.emit(dappnodeSmoothingPool, 'ClaimRewards')
            .withArgs(validator2.address, rewardRecipientValidator2.address, 0);

    });

    it('Should verify all proofs', async () => {
        const valuesRewards = [
            // depositAddress, poolRecipient, availableBalance, unbanBalance
            ['0x1000000000000000000000000000000000000000', '10000'],
            ['0x2000000000000000000000000000000000000000', '20000'],
            ['0x3000000000000000000000000000000000000000', '30000'],
            ['0x4000000000000000000000000000000000000000', '40000'],
            ['0x5000000000000000000000000000000000000000', '50000'],
            ['0x6000000000000000000000000000000000000000', '60000'],
        ];
        const leafsRewards = valuesRewards.map((rewardLeaf) => ethers.utils.solidityKeccak256(['address', 'uint256'], rewardLeaf));
        const rewardsMerkleTree = new MerkleTree(leafsRewards, ethers.utils.keccak256, { sortPairs: true, duplicateOdd: true });

        // Update rewards root
        await expect(dappnodeSmoothingPool.connect(oracle).updateRewardsRoot(rewardsMerkleTree.getHexRoot()))
            .to.emit(dappnodeSmoothingPool, 'UpdateRewardsRoot')
            .withArgs(rewardsMerkleTree.getHexRoot());
        expect(await dappnodeSmoothingPool.rewardsRoot()).to.be.equal(rewardsMerkleTree.getHexRoot());

        for (let valIndex = 0; valIndex < valuesRewards.length; valIndex++) {
            // Check claimRewards
            let proof = rewardsMerkleTree.getHexProof(leafsRewards[valIndex]);

            // Lib does not work properly with duplicateOdd TT computing the proofs
            // I only will fix it for this case, to avoid fixing the js lib
            if (valIndex == 5 || valIndex == 4) {
                const layers = rewardsMerkleTree.getHexLayers();
                // The second layer in this case is odd for the 4 and 5 leafs, so add necessary hash
                proof = [proof[0], layers[1][2], proof[1]]
            }
            await expect(dappnodeSmoothingPool.claimRewards(
                valuesRewards[valIndex][0],
                valuesRewards[valIndex][1],
                proof))
                .to.be.revertedWith('DappnodeSmoothingPool::claimRewards: Eth transfer failed');
        }
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
 *     [validator1.address, 1],
 *     [addressValidator2.address, 2]
 * ];
 * suscriptionMerkleTree = StandardMerkleTree.of(valuesSuscription, ["address", "uint32"]);
 */
