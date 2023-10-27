/* eslint-disable no-await-in-loop */

const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');

// const { StandardMerkleTree } = require("merkletreejs");
const { MerkleTree } = require('merkletreejs');

describe('DappnodeSmoothingPool test', () => {
    let deployer;
    let governance;
    let validator1; let validator2; let
        rewardRecipientValidator2; let donator; let oracleMember1; let
        oracleMember2;

    let dappnodeSmoothingPool;

    const subscriptionCollateral = ethers.BigNumber.from(ethers.utils.parseEther('0.01'));
    const poolFee = 1000;
    const checkpointSlotSize = 7200;
    const quorum = 1;

    beforeEach('Deploy contract', async () => {
        // Load signers
        [deployer,
            governance,
            validator1,
            validator2,
            rewardRecipientValidator2,
            donator,
            oracleMember1,
            oracleMember2] = await ethers.getSigners();

        // Deploy dappnode smoothing pool
        const dappnodeSmoothingPoolFactory = await ethers.getContractFactory('DappnodeSmoothingPool');
        dappnodeSmoothingPool = await upgrades.deployProxy(
            dappnodeSmoothingPoolFactory,
            [
                governance.address,
                subscriptionCollateral,
                poolFee,
                deployer.address, // pool fee recipient
                checkpointSlotSize,
                quorum,
            ],
        );
        await dappnodeSmoothingPool.deployed();
    });

    it('should check the initialize', async () => {
        expect(await dappnodeSmoothingPool.owner()).to.be.equal(deployer.address);
        expect(await dappnodeSmoothingPool.governance()).to.be.equal(governance.address);
        expect(await dappnodeSmoothingPool.subscriptionCollateral()).to.be.equal(subscriptionCollateral);
        expect(await dappnodeSmoothingPool.poolFee()).to.be.equal(poolFee);
        expect(await dappnodeSmoothingPool.poolFeeRecipient()).to.be.equal(deployer.address);
        expect(await dappnodeSmoothingPool.checkpointSlotSize()).to.be.equal(checkpointSlotSize);
        expect(await dappnodeSmoothingPool.quorum()).to.be.equal(quorum);
        expect(await dappnodeSmoothingPool.deploymentBlockNumber()).to.be.equal(
            (await dappnodeSmoothingPool.deployTransaction.wait()).blockNumber,
        );
    });

    it('should check the initialize', async () => {
        const dappnodeSmoothingPoolFactory = await ethers.getContractFactory('DappnodeSmoothingPool');
        const smoothingTestContractInit = await dappnodeSmoothingPoolFactory.deploy();
        await smoothingTestContractInit.deployed();

        await expect(smoothingTestContractInit.initialize(
            governance.address,
            subscriptionCollateral,
            10001, // pool fee
            deployer.address, // pool fee recipient
            checkpointSlotSize,
            quorum,
        ))
            .to.be.revertedWith('DappnodeSmoothingPool::initialize: Pool fee cannot be greater than 100%');

        await expect(smoothingTestContractInit.initialize(
            governance.address,
            subscriptionCollateral,
            poolFee,
            deployer.address, // pool fee recipient
            checkpointSlotSize,
            0, // quorum
        ))
            .to.be.revertedWith('DappnodeSmoothingPool::initialize: Quorum cannot be 0');

        await expect(smoothingTestContractInit.initialize(
            governance.address,
            subscriptionCollateral,
            poolFee,
            deployer.address, // pool fee recipient
            checkpointSlotSize,
            quorum,
        )).to.emit(smoothingTestContractInit, 'UpdatePoolFee')
            .withArgs(poolFee)
            .to.emit(smoothingTestContractInit, 'UpdatePoolFeeRecipient')
            .withArgs(deployer.address)
            .to.emit(smoothingTestContractInit, 'UpdateCheckpointSlotSize')
            .withArgs(checkpointSlotSize)
            .to.emit(smoothingTestContractInit, 'UpdateQuorum')
            .withArgs(quorum);

        await expect(smoothingTestContractInit.initialize(
            governance.address,
            subscriptionCollateral,
            poolFee,
            deployer.address, // pool fee recipient
            checkpointSlotSize,
            quorum,
        )).to.be.revertedWith('Initializable: contract is already initialized');
    });

    it('should check the fallback function', async () => {
        const donationValue = ethers.utils.parseEther('1');
        await expect(donator.sendTransaction({
            to: dappnodeSmoothingPool.address,
            value: donationValue,
        })).to.emit(dappnodeSmoothingPool, 'EtherReceived').withArgs(donator.address, donationValue);

        await expect(donator.sendTransaction({
            to: dappnodeSmoothingPool.address,
            value: donationValue,
            data: '0x123123123132',
        })).to.emit(dappnodeSmoothingPool, 'EtherReceived').withArgs(donator.address, donationValue);
    });

    it('Should subscribe validator and unsubscribe', async () => {
        const validatorID = 1;

        // Check subscribeValidator
        await expect(dappnodeSmoothingPool.subscribeValidator(validatorID))
            .to.be.revertedWith('DappnodeSmoothingPool::subscribeValidator: msg.value does not equal subscription collateral');

        await expect(dappnodeSmoothingPool.subscribeValidator(validatorID, { value: subscriptionCollateral.add(1) }))
            .to.be.revertedWith('DappnodeSmoothingPool::subscribeValidator: msg.value does not equal subscription collateral');

        const initialSmoothingPoolEther = await ethers.provider.getBalance(dappnodeSmoothingPool.address);

        await expect(dappnodeSmoothingPool.subscribeValidator(validatorID, { value: subscriptionCollateral }))
            .to.emit(dappnodeSmoothingPool, 'SubscribeValidator')
            .withArgs(deployer.address, subscriptionCollateral, validatorID);

        expect(await ethers.provider.getBalance(dappnodeSmoothingPool.address))
            .to.be.equal(initialSmoothingPoolEther.add(subscriptionCollateral));

        await expect(dappnodeSmoothingPool.unsubscribeValidator(validatorID))
            .to.emit(dappnodeSmoothingPool, 'UnsubscribeValidator')
            .withArgs(deployer.address, validatorID);
    });

    it('Should subscribe multiple validators', async () => {
        const validatorID = 1;
        const validatorID2 = 10;
        const validatorID3 = 12;

        // Check subscribeValidator
        await expect(dappnodeSmoothingPool.subscribeValidators([validatorID, validatorID2, validatorID3]))
            .to.be.revertedWith('DappnodeSmoothingPool::subscribeValidator: msg.value does not equal subscription collateral');

        await expect(dappnodeSmoothingPool.subscribeValidators(
            [validatorID, validatorID2, validatorID3],
            { value: subscriptionCollateral.mul(2) },
        ))
            .to.be.revertedWith('DappnodeSmoothingPool::subscribeValidator: msg.value does not equal subscription collateral');

        const initialSmoothingPoolEther = await ethers.provider.getBalance(dappnodeSmoothingPool.address);

        await expect(dappnodeSmoothingPool.subscribeValidators(
            [validatorID, validatorID2, validatorID3],
            { value: subscriptionCollateral.mul(3) },
        ))
            .to.emit(dappnodeSmoothingPool, 'SubscribeValidator')
            .withArgs(deployer.address, subscriptionCollateral, validatorID)
            .to.emit(dappnodeSmoothingPool, 'SubscribeValidator')
            .withArgs(deployer.address, subscriptionCollateral, validatorID2)
            .to.emit(dappnodeSmoothingPool, 'SubscribeValidator')
            .withArgs(deployer.address, subscriptionCollateral, validatorID3);

        expect(await ethers.provider.getBalance(dappnodeSmoothingPool.address))
            .to.be.equal(initialSmoothingPoolEther.add(subscriptionCollateral.mul(3)));
    });

    it('should check governance methods', async () => {
        // Add oracle members
        expect(await dappnodeSmoothingPool.addressToVotedReportHash(oracleMember1.address)).to.be.equal(ethers.constants.HashZero);

        await expect(dappnodeSmoothingPool.connect(deployer).addOracleMember(oracleMember1.address))
            .to.be.revertedWith('DappnodeSmoothingPool::onlyGovernance: Only governance');

        await expect(dappnodeSmoothingPool.connect(governance).addOracleMember(oracleMember1.address))
            .to.emit(dappnodeSmoothingPool, 'AddOracleMember')
            .withArgs(oracleMember1.address);

        await expect(dappnodeSmoothingPool.connect(governance).addOracleMember(oracleMember2.address))
            .to.emit(dappnodeSmoothingPool, 'AddOracleMember')
            .withArgs(oracleMember2.address);

        expect(await dappnodeSmoothingPool.addressToVotedReportHash(oracleMember1.address))
            .to.be.equal(await dappnodeSmoothingPool.INITIAL_REPORT_HASH());

        expect(await dappnodeSmoothingPool.addressToVotedReportHash(oracleMember2.address))
            .to.be.equal(await dappnodeSmoothingPool.INITIAL_REPORT_HASH());

        const oracleMemberIndex1 = 0;
        expect(await dappnodeSmoothingPool.getOracleMemberIndex(oracleMember1.address))
            .to.be.equal(oracleMemberIndex1);
        expect(await dappnodeSmoothingPool.getOracleMemberIndex(oracleMember2.address))
            .to.be.equal(1);

        expect(await dappnodeSmoothingPool.getOracleMembersCount())
            .to.be.equal(2);

        expect(await dappnodeSmoothingPool.getAllOracleMembers())
            .to.deep.equal([oracleMember1.address, oracleMember2.address]);

        await expect(dappnodeSmoothingPool.connect(governance).addOracleMember(oracleMember1.address))
            .to.be.revertedWith('DappnodeSmoothingPool::addOracleMember: Already oracle member');

        // Remove Oracle member
        await expect(dappnodeSmoothingPool.connect(deployer).removeOracleMember(oracleMember1.address, oracleMemberIndex1))
            .to.be.revertedWith('DappnodeSmoothingPool::onlyGovernance: Only governance');

        await expect(dappnodeSmoothingPool.connect(governance).removeOracleMember(deployer.address, oracleMemberIndex1))
            .to.be.revertedWith('DappnodeSmoothingPool::removeOracleMember: Was not an oracle member');

        await expect(dappnodeSmoothingPool.connect(governance).removeOracleMember(oracleMember2.address, oracleMemberIndex1))
            .to.be.revertedWith('DappnodeSmoothingPool::removeOracleMember: Oracle member index does not match');

        await expect(dappnodeSmoothingPool.connect(governance).removeOracleMember(oracleMember1.address, oracleMemberIndex1))
            .to.emit(dappnodeSmoothingPool, 'RemoveOracleMember')
            .withArgs(oracleMember1.address);

        expect(await dappnodeSmoothingPool.addressToVotedReportHash(oracleMember1.address)).to.be.equal(ethers.constants.HashZero);

        await expect(dappnodeSmoothingPool.getOracleMemberIndex(oracleMember1.address))
            .to.be.revertedWith('DappnodeSmoothingPool::getOracleMemberIndex: Oracle member not found');

        expect(await dappnodeSmoothingPool.getOracleMemberIndex(oracleMember2.address))
            .to.be.equal(0); // change

        expect(await dappnodeSmoothingPool.getOracleMembersCount())
            .to.be.equal(1);

        expect(await dappnodeSmoothingPool.getAllOracleMembers())
            .to.deep.equal([oracleMember2.address]);

        // Update Quorum
        const newQuorum = 2;
        expect(await dappnodeSmoothingPool.quorum()).to.be.equal(quorum);
        await expect(dappnodeSmoothingPool.connect(deployer).updateQuorum(newQuorum))
            .to.be.revertedWith('DappnodeSmoothingPool::onlyGovernance: Only governance');

        await expect(dappnodeSmoothingPool.connect(governance).updateQuorum(0))
            .to.be.revertedWith('DappnodeSmoothingPool::updateQuorum: Quorum cannot be 0');

        await expect(dappnodeSmoothingPool.connect(governance).updateQuorum(newQuorum))
            .to.emit(dappnodeSmoothingPool, 'UpdateQuorum')
            .withArgs(newQuorum);
        expect(await dappnodeSmoothingPool.quorum()).to.be.equal(newQuorum);

        // Update Governance
        expect(await dappnodeSmoothingPool.governance()).to.be.equal(governance.address);
        await expect(dappnodeSmoothingPool.connect(deployer).transferGovernance(deployer.address))
            .to.be.revertedWith('DappnodeSmoothingPool::onlyGovernance: Only governance');

        expect(await dappnodeSmoothingPool.pendingGovernance()).to.be.equal(ethers.constants.AddressZero);
        await expect(dappnodeSmoothingPool.connect(governance).transferGovernance(deployer.address))
            .to.emit(dappnodeSmoothingPool, 'TransferGovernance')
            .withArgs(deployer.address);

        expect(await dappnodeSmoothingPool.governance()).to.be.equal(governance.address);
        expect(await dappnodeSmoothingPool.pendingGovernance()).to.be.equal(deployer.address);

        await expect(dappnodeSmoothingPool.connect(governance).acceptGovernance())
            .to.be.revertedWith('DappnodeSmoothingPool::acceptGovernance: Only pending governance');

        await expect(dappnodeSmoothingPool.connect(deployer).acceptGovernance())
            .to.emit(dappnodeSmoothingPool, 'AcceptGovernance')
            .withArgs(deployer.address);

        expect(await dappnodeSmoothingPool.governance()).to.be.equal(deployer.address);
    });

    it('should check owner methods', async () => {
        // init smoothing pol
        const initSlot = 1;
        expect(await dappnodeSmoothingPool.lastConsolidatedSlot()).to.be.equal(0);
        await expect(dappnodeSmoothingPool.connect(governance).initSmoothingPool(initSlot))
            .to.be.revertedWith('Ownable: caller is not the owner');

        await expect(dappnodeSmoothingPool.connect(deployer).initSmoothingPool(0))
            .to.be.revertedWith('DappnodeSmoothingPool::initSmoothingPool: Cannot initialize to slot 0');

        await expect(dappnodeSmoothingPool.connect(deployer).initSmoothingPool(initSlot))
            .to.emit(dappnodeSmoothingPool, 'InitSmoothingPool')
            .withArgs(initSlot);

        await expect(dappnodeSmoothingPool.connect(deployer).initSmoothingPool(2))
            .to.be.revertedWith('DappnodeSmoothingPool::initSmoothingPool: Smoothing pool already initialized');
        // Check update oracle
        expect(await dappnodeSmoothingPool.owner()).to.be.equal(deployer.address);
        expect(await dappnodeSmoothingPool.subscriptionCollateral()).to.be.equal(subscriptionCollateral);

        const newCollateral = subscriptionCollateral.mul(2);
        await expect(dappnodeSmoothingPool.connect(governance).updateCollateral(newCollateral))
            .to.be.revertedWith('Ownable: caller is not the owner');

        await expect(dappnodeSmoothingPool.connect(deployer).updateCollateral(newCollateral))
            .to.emit(dappnodeSmoothingPool, 'UpdateSubscriptionCollateral')
            .withArgs(newCollateral);
        expect(await dappnodeSmoothingPool.subscriptionCollateral()).to.be.equal(newCollateral);

        // Update fee
        const newPoolFee = poolFee * 2;
        await expect(dappnodeSmoothingPool.connect(governance).updatePoolFee(newPoolFee))
            .to.be.revertedWith('Ownable: caller is not the owner');

        await expect(dappnodeSmoothingPool.connect(deployer).updatePoolFee(10001))
            .to.be.revertedWith('Pool fee cannot be greater than 100%');

        await expect(dappnodeSmoothingPool.connect(deployer).updatePoolFee(newPoolFee))
            .to.emit(dappnodeSmoothingPool, 'UpdatePoolFee')
            .withArgs(newPoolFee);
        expect(await dappnodeSmoothingPool.poolFee()).to.be.equal(newPoolFee);

        // Update PoolFeeRecipient
        const poolFeeRecipient = donator.address;
        await expect(dappnodeSmoothingPool.connect(governance).updatePoolFeeRecipient(poolFeeRecipient))
            .to.be.revertedWith('Ownable: caller is not the owner');

        await expect(dappnodeSmoothingPool.connect(deployer).updatePoolFeeRecipient(poolFeeRecipient))
            .to.emit(dappnodeSmoothingPool, 'UpdatePoolFeeRecipient')
            .withArgs(poolFeeRecipient);
        expect(await dappnodeSmoothingPool.poolFeeRecipient()).to.be.equal(poolFeeRecipient);

        // Update Checkpoint slot size
        const newCheckpointSlotSize = checkpointSlotSize + 100;
        await expect(dappnodeSmoothingPool.connect(governance).updateCheckpointSlotSize(newCheckpointSlotSize))
            .to.be.revertedWith('Ownable: caller is not the owner');

        await expect(dappnodeSmoothingPool.connect(deployer).updateCheckpointSlotSize(newCheckpointSlotSize))
            .to.emit(dappnodeSmoothingPool, 'UpdateCheckpointSlotSize')
            .withArgs(newCheckpointSlotSize);
        expect(await dappnodeSmoothingPool.checkpointSlotSize()).to.be.equal(newCheckpointSlotSize);
    });

    it('should check oracle methods with quorum 1', async () => {
        // Check update updateRewardsRoot root
        expect(await dappnodeSmoothingPool.rewardsRoot()).to.be.equal(ethers.constants.HashZero);

        const valuesRewards = [
            [deployer.address, ethers.utils.parseEther('1')],
            [validator2.address, ethers.utils.parseEther('1')],
        ];
        const leafsRewards = valuesRewards.map((rewardLeaf) => ethers.utils.solidityKeccak256(['address', 'uint256'], rewardLeaf));
        const rewardsMerkleTree = new MerkleTree(leafsRewards, ethers.utils.keccak256, { sortPairs: true, duplicateOdd: true });

        const slotNumber = checkpointSlotSize * 2;

        // current quorum is 1
        await expect(dappnodeSmoothingPool.connect(governance).addOracleMember(oracleMember1.address))
            .to.emit(dappnodeSmoothingPool, 'AddOracleMember')
            .withArgs(oracleMember1.address);

        await expect(dappnodeSmoothingPool.connect(governance).submitReport(slotNumber, rewardsMerkleTree.getHexRoot()))
            .to.be.revertedWith('DappnodeSmoothingPool::submitReport: Smoothing pool not initialized');

        // Initialize smoothing pool
        await expect(dappnodeSmoothingPool.connect(deployer).initSmoothingPool(checkpointSlotSize))
            .to.emit(dappnodeSmoothingPool, 'InitSmoothingPool')
            .withArgs(checkpointSlotSize);

        await expect(dappnodeSmoothingPool.connect(governance).submitReport(slotNumber, rewardsMerkleTree.getHexRoot()))
            .to.be.revertedWith('DappnodeSmoothingPool::submitReport: Not a oracle member');

        await expect(dappnodeSmoothingPool.connect(oracleMember1).submitReport(0, rewardsMerkleTree.getHexRoot()))
            .to.be.revertedWith('DappnodeSmoothingPool::submitReport: Slot number invalid');

        await expect(dappnodeSmoothingPool.connect(oracleMember1).submitReport(slotNumber, rewardsMerkleTree.getHexRoot()))
            .to.emit(dappnodeSmoothingPool, 'SubmitReport')
            .withArgs(slotNumber, rewardsMerkleTree.getHexRoot(), oracleMember1.address)
            .to.emit(dappnodeSmoothingPool, 'ReportConsolidated')
            .withArgs(slotNumber, rewardsMerkleTree.getHexRoot());

        expect(await dappnodeSmoothingPool.rewardsRoot()).to.be.equal(rewardsMerkleTree.getHexRoot());
    });

    it('should check oracle methods with quorum 2', async () => {
        // Check update updateRewardsRoot root
        expect(await dappnodeSmoothingPool.rewardsRoot()).to.be.equal(ethers.constants.HashZero);

        const valuesRewards = [
            [deployer.address, ethers.utils.parseEther('1')],
            [validator2.address, ethers.utils.parseEther('1')],
        ];
        const leafsRewards = valuesRewards.map((rewardLeaf) => ethers.utils.solidityKeccak256(['address', 'uint256'], rewardLeaf));
        const rewardsMerkleTree = new MerkleTree(leafsRewards, ethers.utils.keccak256, { sortPairs: true, duplicateOdd: true });

        const slotNumber = checkpointSlotSize * 2;

        // Initialize smoothing pool
        await expect(dappnodeSmoothingPool.connect(deployer).initSmoothingPool(checkpointSlotSize))
            .to.emit(dappnodeSmoothingPool, 'InitSmoothingPool')
            .withArgs(checkpointSlotSize);

        // set quorum and oracle members:
        const newQuorum = 2;
        await expect(dappnodeSmoothingPool.connect(governance).updateQuorum(newQuorum))
            .to.emit(dappnodeSmoothingPool, 'UpdateQuorum')
            .withArgs(newQuorum);

        await expect(dappnodeSmoothingPool.connect(governance).addOracleMember(oracleMember1.address))
            .to.emit(dappnodeSmoothingPool, 'AddOracleMember')
            .withArgs(oracleMember1.address);

        await expect(dappnodeSmoothingPool.connect(governance).addOracleMember(oracleMember2.address))
            .to.emit(dappnodeSmoothingPool, 'AddOracleMember')
            .withArgs(oracleMember2.address);

        await expect(dappnodeSmoothingPool.connect(governance).submitReport(slotNumber, rewardsMerkleTree.getHexRoot()))
            .to.be.revertedWith('DappnodeSmoothingPool::submitReport: Not a oracle member');

        // Submit report with oracle 1
        const votedReportHash = await dappnodeSmoothingPool.getReportHash(slotNumber, rewardsMerkleTree.getHexRoot());

        expect(await dappnodeSmoothingPool.addressToVotedReportHash(oracleMember1.address))
            .to.be.equal(await dappnodeSmoothingPool.INITIAL_REPORT_HASH());

        await expect(dappnodeSmoothingPool.connect(oracleMember1).submitReport(slotNumber, rewardsMerkleTree.getHexRoot()))
            .to.emit(dappnodeSmoothingPool, 'SubmitReport')
            .withArgs(slotNumber, rewardsMerkleTree.getHexRoot(), oracleMember1.address);

        // Check voted slot:
        const currentVotes = 1;
        expect(await dappnodeSmoothingPool.addressToVotedReportHash(oracleMember1.address))
            .to.be.equal(votedReportHash);

        const currentVotedReport = await dappnodeSmoothingPool.reportHashToReport(votedReportHash);
        expect(currentVotedReport.slot).to.be.equal(slotNumber);
        expect(currentVotedReport.votes).to.be.equal(currentVotes);
        expect(await dappnodeSmoothingPool.rewardsRoot()).to.be.equal(ethers.constants.HashZero);

        // Vote second oracle
        await expect(dappnodeSmoothingPool.connect(oracleMember2).submitReport(slotNumber, rewardsMerkleTree.getHexRoot()))
            .to.emit(dappnodeSmoothingPool, 'SubmitReport')
            .withArgs(slotNumber, rewardsMerkleTree.getHexRoot(), oracleMember2.address)
            .to.emit(dappnodeSmoothingPool, 'ReportConsolidated')
            .withArgs(slotNumber, rewardsMerkleTree.getHexRoot());

        expect(await dappnodeSmoothingPool.rewardsRoot()).to.be.equal(rewardsMerkleTree.getHexRoot());

        let consolidatedReport = await dappnodeSmoothingPool.reportHashToReport(votedReportHash);
        expect(consolidatedReport.slot).to.be.equal(0);
        expect(consolidatedReport.votes).to.be.equal(0);

        // Check that following reports must follow checkpointSlotSize rules
        await expect(dappnodeSmoothingPool.connect(oracleMember2).submitReport(slotNumber, rewardsMerkleTree.getHexRoot()))
            .to.be.revertedWith('DappnodeSmoothingPool::submitReport: Slot number invalid');

        await expect(dappnodeSmoothingPool.connect(oracleMember2).submitReport(
            slotNumber + checkpointSlotSize,
            rewardsMerkleTree.getHexRoot(),
        ))
            .to.emit(dappnodeSmoothingPool, 'SubmitReport')
            .withArgs(slotNumber + checkpointSlotSize, rewardsMerkleTree.getHexRoot(), oracleMember2.address);

        const votedReportHash2 = await dappnodeSmoothingPool.getReportHash(slotNumber + checkpointSlotSize, rewardsMerkleTree.getHexRoot());
        expect(await dappnodeSmoothingPool.addressToVotedReportHash(oracleMember2.address)).to.be.equal(votedReportHash2);
        let currentVotedReport2 = await dappnodeSmoothingPool.reportHashToReport(votedReportHash2);
        expect(currentVotedReport2.slot).to.be.equal(slotNumber + checkpointSlotSize);
        expect(currentVotedReport2.votes).to.be.equal(1);

        /*
         * Check that a members can be removed
         * remove oracle 1
         */
        let oracleMemberIndex = await dappnodeSmoothingPool.getOracleMemberIndex(oracleMember1.address);
        await expect(dappnodeSmoothingPool.connect(governance).removeOracleMember(oracleMember1.address, oracleMemberIndex))
            .to.emit(dappnodeSmoothingPool, 'RemoveOracleMember')
            .withArgs(oracleMember1.address);
        expect(await dappnodeSmoothingPool.addressToVotedReportHash(oracleMember1.address)).to.be.equal(ethers.constants.HashZero);
        consolidatedReport = await dappnodeSmoothingPool.reportHashToReport(votedReportHash);
        expect(consolidatedReport.slot).to.be.equal(0);
        expect(consolidatedReport.votes).to.be.equal(0);

        // Remove oracle 2
        oracleMemberIndex = await dappnodeSmoothingPool.getOracleMemberIndex(oracleMember2.address);
        await expect(dappnodeSmoothingPool.connect(governance).removeOracleMember(oracleMember2.address, oracleMemberIndex))
            .to.emit(dappnodeSmoothingPool, 'RemoveOracleMember')
            .withArgs(oracleMember2.address);
        expect(await dappnodeSmoothingPool.addressToVotedReportHash(oracleMember2.address)).to.be.equal(ethers.constants.HashZero);
        currentVotedReport2 = await dappnodeSmoothingPool.reportHashToReport(votedReportHash2);
        expect(currentVotedReport2.slot).to.be.equal(slotNumber + checkpointSlotSize);
        expect(currentVotedReport2.votes).to.be.equal(0);
    });

    it('should check change report', async () => {
        // Check update updateRewardsRoot root
        expect(await dappnodeSmoothingPool.rewardsRoot()).to.be.equal(ethers.constants.HashZero);

        const valuesRewards = [
            [deployer.address, ethers.utils.parseEther('1')],
            [validator2.address, ethers.utils.parseEther('1')],
        ];
        const leafsRewards = valuesRewards.map((rewardLeaf) => ethers.utils.solidityKeccak256(['address', 'uint256'], rewardLeaf));
        const rewardsMerkleTree = new MerkleTree(leafsRewards, ethers.utils.keccak256, { sortPairs: true, duplicateOdd: true });

        const slotNumber = checkpointSlotSize * 2;

        // Initialize smoothing pool
        await expect(dappnodeSmoothingPool.connect(deployer).initSmoothingPool(checkpointSlotSize))
            .to.emit(dappnodeSmoothingPool, 'InitSmoothingPool')
            .withArgs(checkpointSlotSize);

        // set quorum and oracle members:
        const newQuorum = 2;
        await expect(dappnodeSmoothingPool.connect(governance).updateQuorum(newQuorum))
            .to.emit(dappnodeSmoothingPool, 'UpdateQuorum')
            .withArgs(newQuorum);

        await expect(dappnodeSmoothingPool.connect(governance).addOracleMember(oracleMember1.address))
            .to.emit(dappnodeSmoothingPool, 'AddOracleMember')
            .withArgs(oracleMember1.address);

        await expect(dappnodeSmoothingPool.connect(governance).addOracleMember(oracleMember2.address))
            .to.emit(dappnodeSmoothingPool, 'AddOracleMember')
            .withArgs(oracleMember2.address);

        await expect(dappnodeSmoothingPool.connect(governance).submitReport(slotNumber, rewardsMerkleTree.getHexRoot()))
            .to.be.revertedWith('DappnodeSmoothingPool::submitReport: Not a oracle member');

        // Submit report with oracle 1
        const votedReportHash = await dappnodeSmoothingPool.getReportHash(slotNumber, rewardsMerkleTree.getHexRoot());

        expect(await dappnodeSmoothingPool.addressToVotedReportHash(oracleMember1.address))
            .to.be.equal(await dappnodeSmoothingPool.INITIAL_REPORT_HASH());

        await expect(dappnodeSmoothingPool.connect(oracleMember1).submitReport(slotNumber, rewardsMerkleTree.getHexRoot()))
            .to.emit(dappnodeSmoothingPool, 'SubmitReport')
            .withArgs(slotNumber, rewardsMerkleTree.getHexRoot(), oracleMember1.address);

        // Check voted slot:
        const currentVotes = 1;
        expect(await dappnodeSmoothingPool.addressToVotedReportHash(oracleMember1.address))
            .to.be.equal(votedReportHash);

        let currentVotedReport = await dappnodeSmoothingPool.reportHashToReport(votedReportHash);
        expect(currentVotedReport.slot).to.be.equal(slotNumber);
        expect(currentVotedReport.votes).to.be.equal(currentVotes);
        expect(await dappnodeSmoothingPool.rewardsRoot()).to.be.equal(ethers.constants.HashZero);

        // Vote first oracle same option, nothing should change
        await expect(dappnodeSmoothingPool.connect(oracleMember1).submitReport(slotNumber, rewardsMerkleTree.getHexRoot()))
            .to.emit(dappnodeSmoothingPool, 'SubmitReport')
            .withArgs(slotNumber, rewardsMerkleTree.getHexRoot(), oracleMember1.address);

        expect(await dappnodeSmoothingPool.rewardsRoot()).to.be.equal(ethers.constants.HashZero);
        currentVotedReport = await dappnodeSmoothingPool.reportHashToReport(votedReportHash);
        expect(currentVotedReport.slot).to.be.equal(slotNumber);
        expect(currentVotedReport.votes).to.be.equal(currentVotes);

        // Change vote
        await expect(dappnodeSmoothingPool.connect(oracleMember1).submitReport(slotNumber, ethers.constants.HashZero))
            .to.emit(dappnodeSmoothingPool, 'SubmitReport')
            .withArgs(slotNumber, ethers.constants.HashZero, oracleMember1.address);

        expect(await dappnodeSmoothingPool.rewardsRoot()).to.be.equal(ethers.constants.HashZero);
        const newVotedReportHash = await dappnodeSmoothingPool.getReportHash(slotNumber, ethers.constants.HashZero);
        expect(await dappnodeSmoothingPool.addressToVotedReportHash(oracleMember1.address))
            .to.be.equal(newVotedReportHash);

        currentVotedReport = await dappnodeSmoothingPool.reportHashToReport(newVotedReportHash);
        expect(currentVotedReport.slot).to.be.equal(slotNumber);
        expect(currentVotedReport.votes).to.be.equal(currentVotes);

        const previousVotedReport = await dappnodeSmoothingPool.reportHashToReport(votedReportHash);
        expect(previousVotedReport.slot).to.be.equal(slotNumber);
        expect(previousVotedReport.votes).to.be.equal(0);

        // Oracle two also agrees
        await expect(dappnodeSmoothingPool.connect(oracleMember2).submitReport(slotNumber, ethers.constants.HashZero))
            .to.emit(dappnodeSmoothingPool, 'SubmitReport')
            .withArgs(slotNumber, ethers.constants.HashZero, oracleMember2.address)
            .to.emit(dappnodeSmoothingPool, 'ReportConsolidated')
            .withArgs(slotNumber, ethers.constants.HashZero);

        // Are 0 since consolidated
        currentVotedReport = await dappnodeSmoothingPool.reportHashToReport(newVotedReportHash);
        expect(currentVotedReport.slot).to.be.equal(0);
        expect(currentVotedReport.votes).to.be.equal(0);

        expect(await dappnodeSmoothingPool.addressToVotedReportHash(oracleMember1.address))
            .to.be.equal(newVotedReportHash);

        // Didn't change since it only vote once and consolidates the state
        expect(await dappnodeSmoothingPool.addressToVotedReportHash(oracleMember2.address))
            .to.be.equal(await dappnodeSmoothingPool.INITIAL_REPORT_HASH());

        // Just to cover all cases, vote with oracle 1
        await expect(dappnodeSmoothingPool.connect(oracleMember1).submitReport(slotNumber + checkpointSlotSize, ethers.constants.HashZero))
            .to.emit(dappnodeSmoothingPool, 'SubmitReport')
            .withArgs(slotNumber + checkpointSlotSize, ethers.constants.HashZero, oracleMember1.address);

        currentVotedReport = await dappnodeSmoothingPool.reportHashToReport(newVotedReportHash);
        expect(currentVotedReport.slot).to.be.equal(0);
        expect(currentVotedReport.votes).to.be.equal(0);
    });

    it('Should claimRewards', async () => {
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

        const slotNumber = checkpointSlotSize * 2;

        // Initialize smoothing pool
        await expect(dappnodeSmoothingPool.connect(deployer).initSmoothingPool(checkpointSlotSize))
            .to.emit(dappnodeSmoothingPool, 'InitSmoothingPool')
            .withArgs(checkpointSlotSize);

        // current quorum is 1
        await dappnodeSmoothingPool.connect(governance).addOracleMember(oracleMember1.address);
        await expect(dappnodeSmoothingPool.connect(oracleMember1).submitReport(slotNumber, rewardsMerkleTree.getHexRoot()))
            .to.emit(dappnodeSmoothingPool, 'ReportConsolidated')
            .withArgs(slotNumber, rewardsMerkleTree.getHexRoot());

        expect(await dappnodeSmoothingPool.rewardsRoot()).to.be.equal(rewardsMerkleTree.getHexRoot());

        // Check claimRewards
        await expect(dappnodeSmoothingPool.claimRewards(validator1.address, availableBalanceValidator1, merkleProofValidator2))
            .to.be.revertedWith('DappnodeSmoothingPool::claimRewards: Invalid merkle proof');

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
        expect(balancePoolRecipient.add(availableBalanceValidator1)).to.be.equal(balancePoolRecipientAfter);

        // Validator 2 delegate rewards
        expect(await dappnodeSmoothingPool.rewardRecipient(validator2.address)).to.be.equal(ethers.constants.AddressZero);

        await expect(dappnodeSmoothingPool.connect(validator2).setRewardRecipient(
            rewardRecipientValidator2.address,
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
        expect(balancePoolRecipient2.add(availableBalanceValidator2)).to.be.equal(balancePoolRecipientAfter2);

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
        const slotNumber = checkpointSlotSize * 2;

        // Initialize smoothing pool
        await expect(dappnodeSmoothingPool.connect(deployer).initSmoothingPool(checkpointSlotSize))
            .to.emit(dappnodeSmoothingPool, 'InitSmoothingPool')
            .withArgs(checkpointSlotSize);

        // current quorum is 1
        await dappnodeSmoothingPool.connect(governance).addOracleMember(oracleMember1.address);
        await expect(dappnodeSmoothingPool.connect(oracleMember1).submitReport(slotNumber, rewardsMerkleTree.getHexRoot()))
            .to.emit(dappnodeSmoothingPool, 'ReportConsolidated')
            .withArgs(slotNumber, rewardsMerkleTree.getHexRoot());

        expect(await dappnodeSmoothingPool.rewardsRoot()).to.be.equal(rewardsMerkleTree.getHexRoot());

        for (let valIndex = 0; valIndex < valuesRewards.length; valIndex++) {
            // Check claimRewards
            let proof = rewardsMerkleTree.getHexProof(leafsRewards[valIndex]);

            /*
             * Lib does not work properly with duplicateOdd TT computing the proofs
             * I only will fix it for this case, to avoid fixing the js lib
             */
            if (valIndex === 5 || valIndex === 4) {
                const layers = rewardsMerkleTree.getHexLayers();
                // The second layer in this case is odd for the 4 and 5 leafs, so add necessary hash
                proof = [proof[0], layers[1][2], proof[1]];
            }
            await expect(dappnodeSmoothingPool.claimRewards(
                valuesRewards[valIndex][0],
                valuesRewards[valIndex][1],
                proof,
            ))
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
 * const rewardsMerkleTree = StandardMerkleTree.of(valuessubscription, ["address", "address", "uint256", "uint256"]);
 * Load Merkle Trees OZ
 * valuessubscription = [
 *     [validator1.address, 1],
 *     [addressValidator2.address, 2]
 * ];
 * subscriptionMerkleTree = StandardMerkleTree.of(valuessubscription, ["address", "uint32"]);
 */
