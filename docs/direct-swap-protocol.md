# Direct Swap Protocol Draft

## Goal

Enable two service providers to exchange provider-authorized usage credits without Frictionless storing balances, payment data, or a central ledger.

## Provider responsibilities

Each provider must persist, in its own database:

- credit balance and eligibility;
- swap nonce and message idempotency state;
- reserved-credit state;
- commit, abort, and recovery records.

## Messages

### SwapOffer

Created by the initiating provider after reserving the offered credit. It includes a unique swapId, both asset descriptions, an expiry, the initiator endpoint, and the provider signature.

### SwapAccept

Created by the counterparty provider after it verifies the offer and reserves its own credit.

### SwapCommit

Created only after both signed reservations are valid. Providers use the signed commit message to make their own local ownership updates.

### SwapAbort

Releases a reservation when the offer expires or cannot be completed.

### SwapStatus

Allows either provider to recover after a network failure by querying the other provider with the swapId.

## State machine

~~~
OFFERED -> RESERVED -> COMMITTED
                  \
                   -> ABORTED
~~~

There is no central database and no chain-level atomicity. Providers must make every endpoint idempotent and retain state until the swap expires or reaches a terminal outcome.
