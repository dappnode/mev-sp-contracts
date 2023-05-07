// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.15;

import "@openzeppelin/contracts-upgradeable/utils/cryptography/MerkleProofUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

/**
 * Contract responsible to manage the subscriptions and rewards of the dappnode smoothing pool
 */
contract DappnodeSmoothingPool is Initializable, OwnableUpgradeable {
    // Subscription collateral
    uint256 public subscriptionCollateral;

    // Rewards merkle root, aggregate together all the validatorIDs with the same withdrawal address
    // Leaf:keccak256(abi.encodePacked(withdrawalAddress, availableBalance)
    bytes32 public rewardsRoot;

    // withdrawalAddress --> claimedBalance
    mapping(address => uint256) public claimedBalance;

    // Allow a withdrawal address to delegate his rewards to another address
    // withdrawalAddress --> rewardAddress
    mapping(address => address) public rewardRecipient;

    // Oracle address, will be responsible to upgrade the rewardsRoot
    // TODO will be update to a quorum N/M
    address public oracle;

    // The above parameters are used to synch information on the oracle

    // Smoothing pool fee expressed in % with 2 decimals
    uint256 public poolFee;

    // Smoothing pool fee recipient
    address public poolFeeRecipient;

    // Indicates how many slots must be between checkpoints
    uint256 public checkpointSlotSize;

    // Indicates the deployment block number
    uint256 public deploymentBlockNumber;

    /**
     * @dev Emitted when the contract receives ether
     */
    event EtherReceived(address sender, uint256 donationAmount);

    /**
     * @dev Emitted when a new users subscribes
     */
    event SubscribeValidator(
        address sender,
        uint256 subscriptionCollateral,
        uint64 validatorID
    );

    /**
     * @dev Emitted when a user claim his rewards
     */
    event ClaimRewards(
        address withdrawalAddress,
        address rewardAddress,
        uint256 claimableBalance
    );

    /**
     * @dev Emitted when a new address subscribes
     */
    event SetRewardRecipient(address withdrawalAddress, address poolRecipient);

    /**
     * @dev Emitted when a validator unsubscribes
     */
    event UnsubscribeValidator(address sender, uint64 validatorID);

    /**
     * @dev Emitted when the pool fee is updated
     */
    event UpdatePoolFee(uint256 newPoolFee);

    /**
     * @dev Emitted when the pool fee recipient is updated
     */
    event UpdatePoolFeeRecipient(address newPoolFeeRecipient);

    /**
     * @dev Emitted when the checkpoint slot size is updated
     */
    event UpdateCheckpointSlotSize(uint256 newCheckpointSlotSize);

    /**
     * @dev Emitted when the subscription collateral is udpated
     */
    event UpdateSubscriptionCollateral(uint256 newSubscriptionCollateral);

    /**
     * @dev Emitted when the rewards root is updated
     */
    event UpdateRewardsRoot(uint256 slotNumber, bytes32 newRewardsRoot);

    /**
     * @dev Emitted when the rewards root is updated
     */
    event UpdateOracle(address newOracle);

    /**
     * @param _oracle Oracle address
     * @param _subscriptionCollateral Subscription collateral
     * @param _poolFee Pool Fee
     * @param _poolFeeRecipient Pool fee recipient
     * @param _checkpointSlotSize Checkpoint slot size
     */
    function initialize(
        address _oracle,
        uint256 _subscriptionCollateral,
        uint256 _poolFee,
        address _poolFeeRecipient,
        uint256 _checkpointSlotSize
    ) public initializer {
        oracle = _oracle;
        subscriptionCollateral = _subscriptionCollateral;

        poolFee = _poolFee;
        poolFeeRecipient = _poolFeeRecipient;
        checkpointSlotSize = _checkpointSlotSize;
        deploymentBlockNumber = block.number;

        __Ownable_init();

        emit UpdatePoolFee(_poolFee);
        emit UpdatePoolFeeRecipient(_poolFeeRecipient);
        emit UpdateCheckpointSlotSize(_checkpointSlotSize);
    }

    /**
     * @dev Oracle modifier
     */
    modifier onlyOracle() {
        require(
            oracle == msg.sender,
            "DappnodeSmoothingPool::onlyOracle: only oracle"
        );
        _;
    }

    /**
     * @notice Be able to receive ether donations and MEV rewards
     * Oracle will be able to differenciate between MEV rewards and donations and distribute rewards accordingly
     **/
    fallback() external payable {
        emit EtherReceived(msg.sender, msg.value);
    }

    /**
     * @notice Subscribe a validator ID to the smoothing pool
     * @param validatorID Validator ID
     */
    function subscribeValidator(uint64 validatorID) public payable {
        // nullifeir subscription

        // Check collateral
        require(
            msg.value == subscriptionCollateral,
            "DappnodeSmoothingPool::subscribeValidator: msg.value does not equal subscription collateral"
        );

        emit SubscribeValidator(
            msg.sender,
            subscriptionCollateral,
            validatorID
        );
    }

    /**
     * @notice Claim available rewards
     * All the rewards that has the same withdrawal address and pool recipient are aggregated in the same leaf
     * @param withdrawalAddress Withdrawal address
     * @param accumulatedBalance Total available balance to claim
     * @param merkleProof Merkle proof against rewardsRoot
     */
    function claimRewards(
        address withdrawalAddress,
        uint256 accumulatedBalance,
        bytes32[] memory merkleProof
    ) public {
        // Verify the merkle proof
        bytes32 node = keccak256(
            abi.encodePacked(withdrawalAddress, accumulatedBalance)
        );

        require(
            MerkleProofUpgradeable.verify(merkleProof, rewardsRoot, node),
            "DappnodeSmoothingPool::claimRewards Invalid merkle proof"
        );

        // Get claimable ether
        uint256 claimableBalance = accumulatedBalance -
            claimedBalance[withdrawalAddress];

        // Update claimed balance mapping
        claimedBalance[withdrawalAddress] = accumulatedBalance;

        // Load first the reward recipient for gas saving, to avoid load twice from storage
        address currentRewardRecipient = rewardRecipient[withdrawalAddress];
        address rewardAddress = currentRewardRecipient == address(0)
            ? withdrawalAddress
            : currentRewardRecipient;

        // Send ether
        (bool success, ) = rewardAddress.call{value: claimableBalance}(
            new bytes(0)
        );
        require(
            success,
            "DappnodeSmoothingPool::claimRewards: Eth transfer failed"
        );

        emit ClaimRewards(withdrawalAddress, rewardAddress, claimableBalance);
    }

    /**
     * @notice Allow a withdrawal address to set a reward recipient
     * @param rewardAddress Reward recipient
     */
    function setRewardRecipient(address rewardAddress) public {
        rewardRecipient[msg.sender] = rewardAddress;
        emit SetRewardRecipient(msg.sender, rewardAddress);
    }

    /**
     * @notice Unsubscribe a validator ID from smoothing pool
     * This call will only take effect in the oracle
     * if the msg.sender is the withdrawal address of that validator
     * @param validatorID Validator ID
     */
    function unsubscribeValidator(uint64 validatorID) public {
        emit UnsubscribeValidator(msg.sender, validatorID);
    }

    ////////////////////
    // Owner functions
    ///////////////////

    /**
     * @notice Update pool fee
     * Only the owner/governance can call this function
     * @param newPoolFee new pool fee
     */
    function updatePoolFee(uint256 newPoolFee) public onlyOwner {
        require(newPoolFee <= 10000, "Pool fee cannot be greater than 100%");
        poolFee = newPoolFee;
        emit UpdatePoolFee(newPoolFee);
    }

    /**
     * @notice Update the pool fee recipient
     * Only the owner/governance can call this function
     * @param newPoolFeeRecipient new pool fee recipient
     */
    function updatePoolFeeRecipient(
        address newPoolFeeRecipient
    ) public onlyOwner {
        poolFeeRecipient = newPoolFeeRecipient;
        emit UpdatePoolFeeRecipient(newPoolFeeRecipient);
    }

    /**
     * @notice Update the checkpoint slot size
     * Only the owner/governance can call this function
     * @param newCheckpointSlotSize new checkpoint slot size
     */
    function updateCheckpointSlotSize(
        uint256 newCheckpointSlotSize
    ) public onlyOwner {
        checkpointSlotSize = newCheckpointSlotSize;
        emit UpdateCheckpointSlotSize(newCheckpointSlotSize);
    }

    /**
     * @notice Update the collateral needed to subscribe a validator
     * Only the owner/governance can call this function
     * @param newSubscriptionCollateral new subscription collateral
     */
    function updateCollateral(
        uint256 newSubscriptionCollateral
    ) public onlyOwner {
        subscriptionCollateral = newSubscriptionCollateral;
        emit UpdateSubscriptionCollateral(newSubscriptionCollateral);
    }

    ////////////////////
    // Oracle functions
    ///////////////////

    /**
     * @notice Update rewards root for a slot number
     * @param slotNumber Slot number
     * @param newRewardsRoot New rewards root
     */
    function updateRewardsRoot(
        uint256 slotNumber,
        bytes32 newRewardsRoot
    ) public onlyOracle {
        rewardsRoot = newRewardsRoot;
        emit UpdateRewardsRoot(slotNumber, newRewardsRoot);
    }

    /**
     * @notice Update Oracle address
     * @param newOracle new oracle address
     */
    function updateOracle(address newOracle) public onlyOracle {
        oracle = newOracle;
        emit UpdateOracle(newOracle);
    }
}
