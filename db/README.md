# Frictionless database

The initial schema is in [001_initial_schema.sql](migrations/001_initial_schema.sql).

It models users, Base wallet addresses, service providers, credit assets, current user credit balances, append-only credit events, and direct two-party swap requests.

Apply it to an empty PostgreSQL database:

```bash
psql "$DATABASE_URL" -f db/migrations/001_initial_schema.sql
```

`credit_locked` is reserved during an in-progress swap. `credit_events` uses a per-user idempotency key to reject duplicate writes. A successful swap stores its Base transaction hash in `swap_requests`; failed and expired swaps remain in that same table through `status`.
