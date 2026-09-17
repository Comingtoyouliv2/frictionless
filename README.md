# Frictionless

Frictionless is an open-source protocol and SDK for direct exchange of provider-authorized usage credits.

The core protocol does not store user balances, payment records, or a central credit ledger. Each service provider keeps its own credit state and integrates through the SDK.

## Direct swap architecture

~~~mermaid
flowchart LR
    UA[User A] --> PA[Provider A]
    UB[User B] --> PB[Provider B]

    PA <--> SDA[Frictionless Provider SDK]
    PB <--> SDB[Frictionless Provider SDK]

    SDA <--> P[Signed Direct-Swap Protocol]
    SDB <--> P

    PA <--> DBA[(Provider A Database)]
    PB <--> DBB[(Provider B Database)]
~~~

## Workspace

- [@frictionless/protocol](packages/frictionless-protocol): message schemas and direct-swap state rules.
- [@frictionless/provider-sdk](packages/provider-sdk): provider integration primitives.
- [direct-swap-demo](examples/direct-swap-demo): two-provider reference demonstration.
