# Frictionless Roadmap

## Product direction

Frictionless is an open-source direct-swap protocol for provider-authorized usage credits.

Providers retain their own credit balances, payment records, locks, and swap history. Frictionless does not operate a central credit ledger. An optional relay acts only as a signed-message verifier and commit notary.

## Development path

1. **Direct Swap** — Providers exchange signed messages directly and retain all credit state in their own databases.
2. **Verification Layer** — An optional, lightweight relay verifies signed reservations and produces commit or abort decisions without custodying credits or operating a central ledger.

## Phase 0 — Repository foundation

Status: in progress

- Establish the monorepo workspace.
- Document the direct-swap architecture.
- Define protocol, SDK, demo, and relay boundaries.
- Remove the Solidity and central-ledger prototypes from the core path.

Exit criterion: a new contributor can understand the architecture and run workspace commands locally.

## Phase 1 — Protocol specification

- Define canonical schemas for SwapOffer, SwapAccept, ReserveReceipt, CommitDecision, CommitReceipt, SwapAbort, and SwapStatus.
- Define provider identity, signing-key rotation, nonce, expiry, and idempotency rules.
- Define the state machine: OFFERED -> RESERVED -> COMMITTED or ABORTED.
- Define recovery behavior for network failures and expired reservations.

Exit criterion: two independent implementations can exchange valid messages and reject invalid or replayed messages.

## Phase 2 — Provider SDK

- Implement message creation and signature verification.
- Define the provider storage adapter:
  - reserveCredit
  - commitSwap
  - releaseSwap
  - getSwapStatus
- Add provider endpoint helpers and retry-safe request handling.
- Add a provider metadata document for public keys and swap endpoints.

Exit criterion: a provider can connect its own database without Frictionless storing user credit balances.

## Phase 3 — Verification Layer

- Implement a small relay that verifies signed reserve receipts.
- Persist only swap metadata: receipt hashes, status, expiry, and commit or abort decisions.
- Sign a CommitDecision only after valid reservations from both providers are present.
- Support self-hosting and an in-memory mode for local development.

Exit criterion: the relay cannot create, alter, or custody provider credits, and providers can independently verify every commit decision.

## Phase 4 — Direct swap demonstration

- Create two mock providers with separate local databases.
- Create a QR or link-based one-to-one swap flow.
- Demonstrate credit 10 from Provider A exchanged for credit 5 from Provider B.
- Add end-to-end tests for success, replay, expiry, remote failure, and recovery.

Exit criterion: a complete swap succeeds without a Frictionless-hosted credit ledger or blockchain.

## Phase 5 — Provider pilot

- Integrate with one real AI service provider.
- Validate provider-side credit issuance, use, lock, commit, and recovery.
- Collect feedback on user experience, provider integration cost, and dispute handling.

Exit criterion: one external provider can complete a real direct swap safely in a controlled pilot.

## Deferred

- Public order book and price discovery.
- Central hosted ledger.
- Stablecoin settlement.
- On-chain settlement or tokenized credits.
- Multi-provider validator quorum.
