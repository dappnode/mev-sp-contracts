Contract responsible to manage the subscriptions and rewards of the dappnode smoothing pool


## Functions
### initialize
```solidity
  function initialize(
    address _governance,
    uint256 _subscriptionCollateral,
    uint256 _poolFee,
    address _poolFeeRecipient,
    uint64 _checkpointSlotSize
  ) external
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`_governance` | address | Governance address
|`_subscriptionCollateral` | uint256 | Subscription collateral
|`_poolFee` | uint256 | Pool Fee
|`_poolFeeRecipient` | address | Pool fee recipient
|`_checkpointSlotSize` | uint64 | Checkpoint slot size

### fallback
```solidity
  function fallback(
  ) external
```
Be able to receive ether donations and MEV rewards
Oracle will be able to differenciate between MEV rewards and donations and distribute rewards accordingly




### subscribeValidator
```solidity
  function subscribeValidator(
    uint64 validatorID
  ) external
```
Subscribe a validator ID to the smoothing pool


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`validatorID` | uint64 | Validator ID

### claimRewards
```solidity
  function claimRewards(
    address withdrawalAddress,
    uint256 accumulatedBalance,
    bytes32[] merkleProof
  ) external
```
Claim available rewards
All the rewards that has the same withdrawal address and pool recipient are aggregated in the same leaf


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`withdrawalAddress` | address | Withdrawal address
|`accumulatedBalance` | uint256 | Total available balance to claim
|`merkleProof` | bytes32[] | Merkle proof against rewardsRoot

### setRewardRecipient
```solidity
  function setRewardRecipient(
    address rewardAddress
  ) external
```
Allow a withdrawal address to set a reward recipient


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`rewardAddress` | address | Reward recipient

### unsubscribeValidator
```solidity
  function unsubscribeValidator(
    uint64 validatorID
  ) external
```
Unsubscribe a validator ID from smoothing pool
This call will only take effect in the oracle
if the msg.sender is the withdrawal address of that validator


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`validatorID` | uint64 | Validator ID

### submitReport
```solidity
  function submitReport(
    uint64 slotNumber,
    bytes32 proposedRewardsRoot
  ) external
```
Submit a report for a new rewards root
If the quorum is reached, consolidate the rewards root


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`slotNumber` | uint64 | Slot number
|`proposedRewardsRoot` | bytes32 | Proposed rewards root

### addOracleMember
```solidity
  function addOracleMember(
    address newOracleMember
  ) external
```
Add an oracle member
Only the governance can call this function


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newOracleMember` | address | Address of the new oracle member

### removeOracleMember
```solidity
  function removeOracleMember(
    address oracleMemberAddress,
    uint256 oracleMemberIndex
  ) external
```
Remove an oracle member
Only the governance can call this function


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`oracleMemberAddress` | address | Address of the removed oracle member
|`oracleMemberIndex` | uint256 | Index of the removed oracle member

### updateQuorum
```solidity
  function updateQuorum(
    uint64 newQuorum
  ) external
```
Update the quorum value
Only the governance can call this function


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newQuorum` | uint64 | new quorum

### transferGovernance
```solidity
  function transferGovernance(
    address newPendingGovernance
  ) external
```
Starts the governance transfer
This is a two step process, the pending governance must accepted to finalize the process
Only the governance can call this function


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newPendingGovernance` | address | new governance address

### acceptGovernance
```solidity
  function acceptGovernance(
  ) external
```
Allow the current pending governance to accept the governance



### initSmoothingPool
```solidity
  function initSmoothingPool(
    uint64 initialSmoothingPoolSlot
  ) external
```
Initialize smoothing pool
Only the owner can call this function


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`initialSmoothingPoolSlot` | uint64 | Initial smoothing pool slot

### updatePoolFee
```solidity
  function updatePoolFee(
    uint256 newPoolFee
  ) external
```
Update pool fee
Only the owner can call this function


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newPoolFee` | uint256 | new pool fee

### updatePoolFeeRecipient
```solidity
  function updatePoolFeeRecipient(
    address newPoolFeeRecipient
  ) external
```
Update the pool fee recipient
Only the owner can call this function


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newPoolFeeRecipient` | address | new pool fee recipient

### updateCheckpointSlotSize
```solidity
  function updateCheckpointSlotSize(
    uint64 newCheckpointSlotSize
  ) external
```
Update the checkpoint slot size
Only the owner can call this function


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newCheckpointSlotSize` | uint64 | new checkpoint slot size

### updateCollateral
```solidity
  function updateCollateral(
    uint256 newSubscriptionCollateral
  ) external
```
Update the collateral needed to subscribe a validator
Only the owner can call this function


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newSubscriptionCollateral` | uint256 | new subscription collateral

### getOracleMemberIndex
```solidity
  function getOracleMemberIndex(
    address oracleMember
  ) external returns (uint256)
```
Return oracle member index


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`oracleMember` | address | oracle member address

### getAllOracleMembers
```solidity
  function getAllOracleMembers(
  ) external returns (address[])
```
Return all the oracle members



### getOracleMembersCount
```solidity
  function getOracleMembersCount(
  ) external returns (uint256)
```
Return oracle members count



### getReportHash
```solidity
  function getReportHash(
    uint64 _slot,
    bytes32 _rewardsRoot
  ) public returns (bytes32)
```
Get the report hash given the rewards root and slot


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`_slot` | uint64 | Slot
|`_rewardsRoot` | bytes32 | Rewards root

## Events
### EtherReceived
```solidity
  event EtherReceived(
  )
```

Emitted when the contract receives ether

### SubscribeValidator
```solidity
  event SubscribeValidator(
  )
```

Emitted when a new users subscribes

### ClaimRewards
```solidity
  event ClaimRewards(
  )
```

Emitted when a user claim his rewards

### SetRewardRecipient
```solidity
  event SetRewardRecipient(
  )
```

Emitted when a validator address sets his rewards recipient

### UnsubscribeValidator
```solidity
  event UnsubscribeValidator(
  )
```

Emitted when a validator unsubscribes

### InitSmoothingPool
```solidity
  event InitSmoothingPool(
  )
```

Emitted when a hte smoothing pool is initialized

### UpdatePoolFee
```solidity
  event UpdatePoolFee(
  )
```

Emitted when the pool fee is updated

### UpdatePoolFeeRecipient
```solidity
  event UpdatePoolFeeRecipient(
  )
```

Emitted when the pool fee recipient is updated

### UpdateCheckpointSlotSize
```solidity
  event UpdateCheckpointSlotSize(
  )
```

Emitted when the checkpoint slot size is updated

### UpdateSubscriptionCollateral
```solidity
  event UpdateSubscriptionCollateral(
  )
```

Emitted when the subscription collateral is udpated

### SubmitReport
```solidity
  event SubmitReport(
  )
```

Emitted when a report is submitted

### ReportConsolidated
```solidity
  event ReportConsolidated(
  )
```

Emitted when a report is consolidated

### UpdateQuorum
```solidity
  event UpdateQuorum(
  )
```

Emitted when the quorum is updated

### AddOracleMember
```solidity
  event AddOracleMember(
  )
```

Emitted when a new oracle member is added

### RemoveOracleMember
```solidity
  event RemoveOracleMember(
  )
```

Emitted when a new oracle member is removed

### TransferGovernance
```solidity
  event TransferGovernance(
  )
```

Emitted when the governance starts the two-step transfer setting a new pending governance

### AcceptGovernance
```solidity
  event AcceptGovernance(
  )
```

Emitted when the pending governance accepts the governance

