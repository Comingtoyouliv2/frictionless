-- Frictionless: minimal operational schema for usage-credit exchanges.
-- Apply this migration to an empty PostgreSQL database.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_wallets (
    user_wallet_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id),
    wallet_address TEXT NOT NULL,
    chain_id BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (chain_id, wallet_address)
);

CREATE TABLE service_providers (
    service_provider_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_provider_name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE credit_assets (
    asset_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_provider_id UUID NOT NULL REFERENCES service_providers(service_provider_id),
    asset_name TEXT NOT NULL,
    transferable BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (service_provider_id, asset_name)
);

CREATE TABLE user_credits (
    user_id UUID NOT NULL REFERENCES users(user_id),
    asset_id UUID NOT NULL REFERENCES credit_assets(asset_id),
    credit_left NUMERIC(30, 6) NOT NULL DEFAULT 0 CHECK (credit_left >= 0),
    credit_locked NUMERIC(30, 6) NOT NULL DEFAULT 0 CHECK (credit_locked >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, asset_id),
    CHECK (credit_locked <= credit_left)
);

CREATE TABLE credit_events (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id),
    asset_id UUID NOT NULL REFERENCES credit_assets(asset_id),
    event_type TEXT NOT NULL CHECK (event_type IN ('ISSUE', 'USE', 'LOCK', 'UNLOCK', 'SETTLE')),
    amount NUMERIC(30, 6) NOT NULL CHECK (amount > 0),
    reference_id UUID,
    idempotency_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, idempotency_key)
);

CREATE TABLE swap_requests (
    swap_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_a_id UUID NOT NULL REFERENCES users(user_id),
    user_b_id UUID NOT NULL REFERENCES users(user_id),
    asset_a_id UUID NOT NULL REFERENCES credit_assets(asset_id),
    amount_a NUMERIC(30, 6) NOT NULL CHECK (amount_a > 0),
    asset_b_id UUID NOT NULL REFERENCES credit_assets(asset_id),
    amount_b NUMERIC(30, 6) NOT NULL CHECK (amount_b > 0),
    status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED', 'EXPIRED')),
    base_tx_hash TEXT,
    failure_reason TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    settled_at TIMESTAMPTZ,
    CHECK (user_a_id <> user_b_id),
    CHECK (expires_at > created_at),
    CHECK (
        (status = 'SUCCESS' AND base_tx_hash IS NOT NULL AND settled_at IS NOT NULL)
        OR status <> 'SUCCESS'
    )
);

CREATE INDEX user_wallets_user_id_idx ON user_wallets (user_id);
CREATE INDEX credit_assets_service_provider_id_idx ON credit_assets (service_provider_id);
CREATE INDEX credit_events_user_id_created_at_idx ON credit_events (user_id, created_at DESC);
CREATE INDEX credit_events_reference_id_idx ON credit_events (reference_id);
CREATE INDEX swap_requests_status_expires_at_idx ON swap_requests (status, expires_at);
CREATE INDEX swap_requests_user_a_id_created_at_idx ON swap_requests (user_a_id, created_at DESC);
CREATE INDEX swap_requests_user_b_id_created_at_idx ON swap_requests (user_b_id, created_at DESC);
CREATE UNIQUE INDEX swap_requests_base_tx_hash_unique_idx
    ON swap_requests (base_tx_hash)
    WHERE base_tx_hash IS NOT NULL;
