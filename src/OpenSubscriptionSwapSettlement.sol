// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/// @notice Finalizes a swap only after both users and both registered issuers sign it.
/// @dev Credit balances and consumption remain in issuer databases. This contract records
///      one immutable settlement per approved swap and prevents replaying issuer attestations.
contract OpenSubscriptionSwapSettlement {
    bytes32 private constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant SWAP_TYPEHASH = keccak256(
        "Swap(bytes32 swapId,bytes32 legAHash,bytes32 legBHash,uint64 deadline)"
    );
    bytes32 private constant CREDIT_LEG_TYPEHASH = keccak256(
        "CreditLeg(address issuer,address owner,address recipient,bytes32 entitlementId,uint128 amount,uint64 stateVersion,uint64 nonce,uint64 attestationExpiry)"
    );
    bytes32 private constant ISSUER_ATTESTATION_TYPEHASH =
        keccak256("IssuerAttestation(bytes32 swapId,bytes32 legHash)");
    bytes32 private constant NAME_HASH = keccak256("OpenSubscriptionSwapSettlement");
    bytes32 private constant VERSION_HASH = keccak256("1");

    struct CreditLeg {
        address issuer;
        address owner;
        address recipient;
        bytes32 entitlementId;
        uint128 amount;
        uint64 stateVersion;
        uint64 nonce;
        uint64 attestationExpiry;
    }

    struct Swap {
        bytes32 swapId;
        CreditLeg legA;
        CreditLeg legB;
        uint64 deadline;
    }

    address public immutable admin;

    /// @notice Server signing address authorized by each registered app issuer.
    mapping(address issuer => address signer) public issuerSigners;
    mapping(bytes32 swapId => bool settled) public settledSwapIds;
    mapping(address issuer => mapping(uint64 nonce => bool used)) public usedAttestationNonces;

    event IssuerSignerSet(address indexed issuer, address indexed signer);
    event SwapSettled(
        bytes32 indexed swapId,
        bytes32 indexed entitlementA,
        bytes32 indexed entitlementB,
        address userA,
        address userB,
        uint128 amountA,
        uint128 amountB,
        uint64 settledAt
    );

    error OnlyAdmin();
    error InvalidAddress();
    error InvalidSwap();
    error SwapAlreadySettled();
    error SwapExpired();
    error AttestationExpired();
    error IssuerNotRegistered(address issuer);
    error AttestationAlreadyUsed(address issuer, uint64 nonce);
    error InvalidSignature();

    constructor(address admin_) {
        if (admin_ == address(0)) revert InvalidAddress();
        admin = admin_;
    }

    /// @notice Registers or rotates the signing address an app uses to attest a credit state.
    function setIssuerSigner(address issuer, address signer) external {
        if (msg.sender != admin) revert OnlyAdmin();
        if (issuer == address(0) || signer == address(0)) revert InvalidAddress();

        issuerSigners[issuer] = signer;
        emit IssuerSignerSet(issuer, signer);
    }

    /// @notice Finalizes a direct two-party credit swap.
    /// @param userASignature User A's EIP-712 signature over the complete swap.
    /// @param userBSignature User B's EIP-712 signature over the complete swap.
    /// @param issuerASignature App A's signature that leg A is locked and valid.
    /// @param issuerBSignature App B's signature that leg B is locked and valid.
    function settleSwap(
        Swap calldata swap,
        bytes calldata userASignature,
        bytes calldata userBSignature,
        bytes calldata issuerASignature,
        bytes calldata issuerBSignature
    ) external {
        if (settledSwapIds[swap.swapId]) revert SwapAlreadySettled();
        if (block.timestamp > swap.deadline) revert SwapExpired();
        if (block.timestamp > swap.legA.attestationExpiry || block.timestamp > swap.legB.attestationExpiry) {
            revert AttestationExpired();
        }
        if (!_isValidSwap(swap)) revert InvalidSwap();

        address issuerASigner = issuerSigners[swap.legA.issuer];
        address issuerBSigner = issuerSigners[swap.legB.issuer];
        if (issuerASigner == address(0)) revert IssuerNotRegistered(swap.legA.issuer);
        if (issuerBSigner == address(0)) revert IssuerNotRegistered(swap.legB.issuer);
        if (usedAttestationNonces[swap.legA.issuer][swap.legA.nonce]) {
            revert AttestationAlreadyUsed(swap.legA.issuer, swap.legA.nonce);
        }
        if (usedAttestationNonces[swap.legB.issuer][swap.legB.nonce]) {
            revert AttestationAlreadyUsed(swap.legB.issuer, swap.legB.nonce);
        }

        bytes32 legAHash = _hashCreditLeg(swap.legA);
        bytes32 legBHash = _hashCreditLeg(swap.legB);
        bytes32 swapDigest = _hashTypedData(_hashSwap(swap.swapId, legAHash, legBHash, swap.deadline));

        if (_recover(swapDigest, userASignature) != swap.legA.owner) revert InvalidSignature();
        if (_recover(swapDigest, userBSignature) != swap.legB.owner) revert InvalidSignature();

        bytes32 issuerADigest = _hashTypedData(_hashIssuerAttestation(swap.swapId, legAHash));
        bytes32 issuerBDigest = _hashTypedData(_hashIssuerAttestation(swap.swapId, legBHash));
        if (_recover(issuerADigest, issuerASignature) != issuerASigner) revert InvalidSignature();
        if (_recover(issuerBDigest, issuerBSignature) != issuerBSigner) revert InvalidSignature();

        settledSwapIds[swap.swapId] = true;
        usedAttestationNonces[swap.legA.issuer][swap.legA.nonce] = true;
        usedAttestationNonces[swap.legB.issuer][swap.legB.nonce] = true;

        emit SwapSettled(
            swap.swapId,
            swap.legA.entitlementId,
            swap.legB.entitlementId,
            swap.legA.owner,
            swap.legB.owner,
            swap.legA.amount,
            swap.legB.amount,
            uint64(block.timestamp)
        );
    }

    function _isValidSwap(Swap calldata swap) private pure returns (bool) {
        return swap.swapId != bytes32(0) &&
            swap.legA.issuer != address(0) &&
            swap.legB.issuer != address(0) &&
            swap.legA.owner != address(0) &&
            swap.legB.owner != address(0) &&
            swap.legA.recipient == swap.legB.owner &&
            swap.legB.recipient == swap.legA.owner &&
            swap.legA.owner != swap.legB.owner &&
            swap.legA.entitlementId != bytes32(0) &&
            swap.legB.entitlementId != bytes32(0) &&
            (swap.legA.issuer != swap.legB.issuer || swap.legA.entitlementId != swap.legB.entitlementId) &&
            (swap.legA.issuer != swap.legB.issuer || swap.legA.nonce != swap.legB.nonce) &&
            swap.legA.amount > 0 &&
            swap.legB.amount > 0;
    }

    function _hashCreditLeg(CreditLeg calldata leg) private pure returns (bytes32) {
        return keccak256(
            abi.encode(
                CREDIT_LEG_TYPEHASH,
                leg.issuer,
                leg.owner,
                leg.recipient,
                leg.entitlementId,
                leg.amount,
                leg.stateVersion,
                leg.nonce,
                leg.attestationExpiry
            )
        );
    }

    function _hashSwap(
        bytes32 swapId,
        bytes32 legAHash,
        bytes32 legBHash,
        uint64 deadline
    ) private pure returns (bytes32) {
        return keccak256(abi.encode(SWAP_TYPEHASH, swapId, legAHash, legBHash, deadline));
    }

    function _hashIssuerAttestation(bytes32 swapId, bytes32 legHash) private pure returns (bytes32) {
        return keccak256(abi.encode(ISSUER_ATTESTATION_TYPEHASH, swapId, legHash));
    }

    function _hashTypedData(bytes32 structHash) private view returns (bytes32) {
        return keccak256(abi.encodePacked("\\x19\\x01", _domainSeparator(), structHash));
    }

    function _domainSeparator() private view returns (bytes32) {
        return keccak256(
            abi.encode(EIP712_DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(this))
        );
    }

    function _recover(bytes32 digest, bytes calldata signature) private pure returns (address signer) {
        if (signature.length != 65) revert InvalidSignature();

        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }

        if (uint256(s) > 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0) {
            revert InvalidSignature();
        }
        if (v != 27 && v != 28) revert InvalidSignature();

        signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert InvalidSignature();
    }
}
