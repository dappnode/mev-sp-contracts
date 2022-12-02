// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.15;

import "@openzeppelin/contracts-upgradeable/utils/cryptography/MerkleProofUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/**
 * Contract responsible to manage the suscriptions and distribute rewards
 */
contract DappnodeSmoothingPool is Initializable {
    // Wrapped Token information struct
    struct Suscription {
        address depositAddress;
        uint64 timestampStart;
        uint64 timestampEnd;
        address poolRecipient;
    }

    // Suscriptions merkle root, containing the necessary information to correlate a deposit address with a validatorID
    // Leaf: keccak256(abi.encodePacked(depositAddress, validatorID)
    bytes32 public suscriptionsRoot;

    // Mapping between a validator ID and their associate suscriptions
    mapping(uint32 => Suscription) public validatorToSuscription;

    // Rewards merkle root, aggregate together all the validatorIDs with the same deposit address and pool recipient
    // Leaf:keccak256(abi.encodePacked(depositAddress, poolRecipient, availableBalance, ubanBalance)
    bytes32 public rewardsRoot;

    // depositAddress --> claimedBalance
    mapping(address => uint256) public claimedBalance;

    // Oracle address, will be responsible to upgrade the suscriptionsRoot, rewardsRoot and to suscribe without providing smtProofs
    address public oracle;

    /**
     * @dev Emitted when a new users suscribes
     */
    event SuscribeValidator(
        uint32 validatorID,
        address depositAddress,
        address poolRecipient
    );

    /**
     * @dev Emitted when a new address suscribes
     */
    event SuscribeAddress(address depositAddress, address poolRecipient);

    /**
     * @dev Emitted when a user unsuscribes
     */
    event UnsuscribeValidator(uint32 validatorID);

    /**
     * @dev Emitted when a user claim his rewards
     */
    event ClaimRewards(
        address depositAddress,
        address poolRecipient,
        uint256 claimedRewards
    );

    /**
     * @dev Emitted when the rewards root is updated
     */
    event UpdateRewardsRoot(bytes32 newRewardsRoot);

    /**
     * @dev Emitted when the suscriptions root is updated
     */
    event UpdateSuscriptionsRoot(bytes32 newSuscriptionsRoot);

    /**
     * @dev Emitted when the contract receives ether without data
     */
    event Donation(uint256 donationAmount);

    /**
     * @param _suscriptionsRoot Suscriptions merkle root
     */
    function initialize(bytes32 _suscriptionsRoot, address _oracle)
        public
        initializer
    {
        suscriptionsRoot = _suscriptionsRoot;
        oracle = _oracle;
    }

    modifier onlyOracle() {
        require(
            oracle == msg.sender,
            "DappnodeSmoothingPool::onlyOracle: only oracle"
        );
        _;
    }

    /**
     * @notice Be able to receive ether donations, there will be splitted by the suscribed validators
     **/
    receive() external payable {
        emit Donation(msg.value);
    }

    /**
     * @notice Claim available rewards
     * All the rewards that has the same deposit address and pool recipeint are aggregated in the same leaf
     * @param depositAddress Deposit address
     * @param poolRecipient Pool recipient
     * @param availableBalance Total available balance to claim
     * @param ubanBalance Balance that the user should pay in order to be unbaned
     * @param merkleProof Merkle proof agains rewardsRoot
     */
    function claimRewards(
        address depositAddress,
        address poolRecipient,
        uint256 availableBalance,
        uint256 ubanBalance,
        bytes32[] memory merkleProof
    ) public {
        // Verify the merkle proof
        bytes32 node = keccak256(
            abi.encodePacked(
                depositAddress,
                poolRecipient,
                availableBalance,
                ubanBalance
            )
        );
        require(
            MerkleProofUpgradeable.verify(merkleProof, rewardsRoot, node),
            "DappnodeSmoothingPool::claimRewards Invalid proof."
        );

        // Get claimable ether
        uint256 totalClaimable = availableBalance -
            claimedBalance[depositAddress];

        (bool success, ) = poolRecipient.call{value: totalClaimable}(
            new bytes(0)
        );

        require(
            success,
            "DappnodeSmoothingPool::claimRewards: ETH_TRANSFER_FAILED"
        );

        // Update claimed balance mapping
        claimedBalance[depositAddress] += totalClaimable;

        emit ClaimRewards(depositAddress, poolRecipient, totalClaimable);
    }

    /**
     * @notice Suscribe to the smoothing pool
     * @param validatorID Validator ID
     * @param poolRecipient Pool recipient
     * @param merkleProof Merkle proof
     */
    function suscribeValidator(
        uint32 validatorID,
        address poolRecipient,
        bytes32[] calldata merkleProof
    ) public {
        // Verify the merkle proof.
        bytes32 node = keccak256(abi.encodePacked(validatorID, msg.sender));
        require(
            MerkleProofUpgradeable.verify(merkleProof, suscriptionsRoot, node),
            "DappnodeSmoothingPool::suscription Invalid proof."
        );

        // Create new suscription
        _newSuscription(validatorID, poolRecipient);
    }

    // TODO You can be banned and desuscribe?

    /**
     * @notice Unsuscribe to the smoothing pool
     * @param validatorID Validator ID
     */
    function unsuscribeValidator(uint32 validatorID) public {
        // Check if it's already suscribed
        Suscription storage validatorSuscription = validatorToSuscription[
            validatorID
        ];
        require(
            validatorSuscription.depositAddress == msg.sender,
            "DappnodeSmoothingPool::unsuscribeValidator validator has not been suscribed"
        );

        require(
            validatorSuscription.timestampEnd == 0,
            "DappnodeSmoothingPool::unsuscribeValidator validator already unsuscribed"
        );
        validatorSuscription.timestampEnd = uint64(block.timestamp);

        emit UnsuscribeValidator(validatorID);
    }

    // TODO can the timestamps be updated?
    /**
     * @notice Update suscription
     * @param validatorID Validator ID
     * @param poolRecipient Pool recipient
     */
    function updateSuscription(uint32 validatorID, address poolRecipient)
        public
    {
        // Check if it's already suscribed
        Suscription storage validatorSuscription = validatorToSuscription[
            validatorID
        ];
        require(
            validatorSuscription.depositAddress == msg.sender,
            "DappnodeSmoothingPool::updateSuscription deposit address must match msg.sender"
        );

        validatorSuscription.poolRecipient = poolRecipient;
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
     * @notice Update suscriptions root
     * @param newSuscriptionsRoot New suscriptions root
     */
    function updateSuscriptionsRoot(bytes32 newSuscriptionsRoot)
        public
        onlyOracle
    {
        suscriptionsRoot = newSuscriptionsRoot;
        emit UpdateSuscriptionsRoot(newSuscriptionsRoot);
    }

    /**
     * @notice Suscribe on behalf of the users
     * @param validatorID Validator ID array
     * @param depositAddress Deposit address array
     */
    function suscribeOracle(
        uint32[] memory validatorID,
        address[] memory depositAddress
    ) public onlyOracle {
        require(
            validatorID.length == depositAddress.length,
            "DappnodeSmoothingPool::suscribeOracle arrays must have smae length"
        );
        for (uint256 i = 0; i < validatorID.length; i++) {
            // Create new suscription if does not exist yet
            if (
                validatorToSuscription[validatorID[i]].depositAddress !=
                address(0)
            ) {
                _newSuscription(validatorID[i], depositAddress[i]);
            }
        }
    }

    ////////////////////
    // Internal functions
    ///////////////////

    // TODO also update suscription if timestamp end != 0?
    /**
     * @notice Internal function to suscribe a new validator
     * @param validatorID Validator ID
     * @param poolRecipient Pool recipient
     */
    function _newSuscription(uint32 validatorID, address poolRecipient)
        internal
    {
        // Check if it's already suscribed
        Suscription storage validatorSuscription = validatorToSuscription[
            validatorID
        ];
        require(
            validatorSuscription.depositAddress != address(0),
            "DappnodeSmoothingPool::_newSuscription validator already suscribed"
        );

        // Add suscription to mapping
        validatorToSuscription[validatorID] = Suscription({
            depositAddress: msg.sender,
            timestampStart: uint64(block.timestamp),
            timestampEnd: 0,
            poolRecipient: poolRecipient
        });

        emit SuscribeValidator(validatorID, msg.sender, poolRecipient);
    }
}
