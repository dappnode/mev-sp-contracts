// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.15;

import "@openzeppelin/contracts-upgradeable/utils/cryptography/MerkleProofUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

/**
 * Contract responsible to manage the suscriptions and rewards of the dappnode smoothing pool
 */
contract DappnodeSmoothingPool is Initializable, OwnableUpgradeable {
    // Suscription collateral
    uint256 public suscriptionCollateral;

    // Rewards merkle root, aggregate together all the validatorIDs with the same deposit address
    // Leaf:keccak256(abi.encodePacked(withdrawalAddress, availableBalance)
    bytes32 public rewardsRoot;

    // withdrawalAddress --> claimedBalance
    mapping(address => uint256) public claimedBalance;

    // Allow a deposit address to delegate his rewards to another address
    // withdrawalAddress --> rewardAddress
    mapping(address => address) public rewardRecipient;

    // Oracle address, will be responsible to upgrade the rewardsRoot
    // TODO will be update to a quorum N/M
    address public oracle;

    /**
     * @dev Emitted when the contract receives ether
     */
    event EtherReceived(address sender, uint256 donationAmount);

    /**
     * @dev Emitted when a new users subscribes
     */
    event SubscribeValidator(
        address sender,
        uint256 suscriptionCollateral,
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
     * @dev Emitted when the suscription collateral is udpated
     */
    event UpdateSuscriptionCollateral(uint256 newSuscriptionCollateral);

    /**
     * @dev Emitted when the rewards root is updated
     */
    event UpdateRewardsRoot(bytes32 newRewardsRoot);

    /**
     * @dev Emitted when the rewards root is updated
     */
    event UpdateOracle(address newOracle);

    /**
     * @param _oracle Oracle address
     * @param _suscriptionCollateral Suscription collateral
     */
    function initialize(
        address _oracle,
        uint256 _suscriptionCollateral
    ) public initializer {
        oracle = _oracle;
        suscriptionCollateral = _suscriptionCollateral;
        __Ownable_init();
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
        // nullifeir suscription

        // Check collateral
        require(
            msg.value == suscriptionCollateral,
            "DappnodeSmoothingPool::subscribeValidator: msg.value does not equal suscription collateral"
        );

        emit SubscribeValidator(msg.sender, suscriptionCollateral, validatorID);
    }

    /**
     * @notice Claim available rewards
     * All the rewards that has the same deposit address and pool recipient are aggregated in the same leaf
     * @param withdrawalAddress Deposit address
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
     * @notice Allow a deposit address to set a reward recipient
     * @param rewardAddress Reward recipient
     */
    function setRewardRecipient(address rewardAddress) public {
        rewardRecipient[msg.sender] = rewardAddress;
        emit SetRewardRecipient(msg.sender, rewardAddress);
    }

    /**
     * @notice Unsubscribe a validator ID from smoothing pool
     * This call will only take effect in the oracle
     * if the msg.sender is the deposit address of that validator
     * @param validatorID Validator ID
     */
    function unsubscribeValidator(uint64 validatorID) public {
        emit UnsubscribeValidator(msg.sender, validatorID);
    }

    /**
     * @notice Update the collateral needed to subscribe a validator
     * Only the owner/governance can call this function
     * @param newSuscriptionCollateral new suscription collateral
     */
    function updateCollateral(
        uint256 newSuscriptionCollateral
    ) public onlyOwner {
        suscriptionCollateral = newSuscriptionCollateral;
        emit UpdateSuscriptionCollateral(newSuscriptionCollateral);
    }

    ////////////////////
    // Oracle functions
    ///////////////////

    /**
     * @notice Update rewards root
     * @param newRewardsRoot New rewards root
     */
    function updateRewardsRoot(bytes32 newRewardsRoot) public onlyOracle {
        rewardsRoot = newRewardsRoot;
        emit UpdateRewardsRoot(newRewardsRoot);
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
