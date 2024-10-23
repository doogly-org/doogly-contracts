// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.25;
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

interface IHypercertToken {
    function splitFraction(
        address account,
        uint256 tokenID,
        uint256[] memory _values
    ) external;

    function unitsOf(uint256 tokenId) external view returns (uint256);
}

interface IERC20 {
    function transfer(
        address _to,
        uint256 _value
    ) external returns (bool success);

    function balanceOf(address _owner) external view returns (uint256 balance);
}

contract HyperfundCrossChainReceiver is ReentrancyGuard {
    address public immutable hypercertContract;

    event CrossChainTransfer(
        address operator,
        address token,
        uint256 amount,
        address splitsAddress,
        uint256 hypercertFractionId,
        address fractionRecipient
    );

    constructor(address _hypercertContract) {
        hypercertContract = _hypercertContract;
    }

    function receiveCrossChain(
        address _token,
        uint256 _amount,
        address payable _splitsAddress,
        uint256 _hypercertFractionId,
        address _fractionRecipient
    ) external payable nonReentrant {
        require(_splitsAddress != address(0), "Invalid splits address");
        require(_fractionRecipient != address(0), "Invalid recipient address");
        require(
            IERC20(_token).balanceOf(address(this)) >= _amount,
            "Insufficient balance"
        );

        // Check available balance in fraction
        uint256 availableBalance = IHypercertToken(hypercertContract).unitsOf(
            _hypercertFractionId
        );

        // Check if amount is available in fraction
        require(_amount <= availableBalance, "Insufficient balance");

        // Build splits params array
        uint256[] memory updatedFractionBalances = new uint256[](2);
        updatedFractionBalances[0] = availableBalance - _amount;
        updatedFractionBalances[1] = _amount;

        // Transfer funds into split
        if (_token == address(0)) {
            require(msg.value == _amount, "Invalid amount");
            (bool sent, bytes memory data) = _splitsAddress.call{
                value: msg.value
            }("");
            require(sent, "Failed to send Ether");
        } else {
            require(
                IERC20(_token).transfer(
                    _splitsAddress,
                    _amount
                ),
                "Token transfer failed"
            );
        }

        // Split hypercert fraction to recipient
        IHypercertToken(hypercertContract).splitFraction(
            _fractionRecipient,
            _hypercertFractionId,
            updatedFractionBalances
        );

        // Celebrate
        emit CrossChainTransfer(
            msg.sender,
            _token,
            _amount,
            _splitsAddress,
            _hypercertFractionId,
            _fractionRecipient
        );
    }
}