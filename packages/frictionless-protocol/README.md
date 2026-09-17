# @frictionless/protocol

Defines the provider-to-provider messages for a direct swap:

- SwapOffer
- SwapAccept
- SwapCommit
- SwapAbort
- SwapStatus

The protocol does not own user balances, payment data, or a central database. Each provider keeps credit balances, locks, nonces, and swap history in its own system.

See [the protocol draft](../../docs/direct-swap-protocol.md).
