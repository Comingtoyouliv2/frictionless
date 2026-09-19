export type UserId = string;
export type AssetId = string;

export interface SwapLeg {
  fromUserId: UserId;
  toUserId: UserId;
  assetId: AssetId;
  amount: bigint;
}

export interface DirectSwapRequest {
  swapId: string;
  legA: SwapLeg;
  legB: SwapLeg;
}

export interface DirectSwapResult {
  swapId: string;
  status: "COMMITTED";
}

export interface DirectSwapTransaction {
  hasProcessedSwap(swapId: string): Promise<boolean>;
  getAvailableCredit(userId: UserId, assetId: AssetId): Promise<bigint>;
  debitCredit(userId: UserId, assetId: AssetId, amount: bigint): Promise<void>;
  creditUser(userId: UserId, assetId: AssetId, amount: bigint): Promise<void>;
  recordProcessedSwap(swapId: string): Promise<void>;
}

export interface DirectSwapStore {
  transaction<T>(operation: (transaction: DirectSwapTransaction) => Promise<T>): Promise<T>;
}

export class DirectSwapError extends Error {}

/**
 * Atomically exchanges two provider-authorized credit legs in one store.
 *
 * A cross-provider implementation must map this primitive to the later
 * reserve/accept/commit protocol; this function intentionally has no network
 * or central-ledger dependency.
 */
export async function directSwap(
  store: DirectSwapStore,
  request: DirectSwapRequest,
): Promise<DirectSwapResult> {
  validateRequest(request);

  return store.transaction(async (transaction) => {
    if (await transaction.hasProcessedSwap(request.swapId)) {
      throw new DirectSwapError("Swap " + request.swapId + " was already processed");
    }

    await ensureSufficientCredit(transaction, request.legA);
    await ensureSufficientCredit(transaction, request.legB);

    await transaction.debitCredit(
      request.legA.fromUserId,
      request.legA.assetId,
      request.legA.amount,
    );
    await transaction.creditUser(
      request.legA.toUserId,
      request.legA.assetId,
      request.legA.amount,
    );

    await transaction.debitCredit(
      request.legB.fromUserId,
      request.legB.assetId,
      request.legB.amount,
    );
    await transaction.creditUser(
      request.legB.toUserId,
      request.legB.assetId,
      request.legB.amount,
    );

    await transaction.recordProcessedSwap(request.swapId);

    return {
      swapId: request.swapId,
      status: "COMMITTED",
    };
  });
}

async function ensureSufficientCredit(
  transaction: DirectSwapTransaction,
  leg: SwapLeg,
): Promise<void> {
  const availableCredit = await transaction.getAvailableCredit(
    leg.fromUserId,
    leg.assetId,
  );

  if (availableCredit < leg.amount) {
    throw new DirectSwapError(
      "User " + leg.fromUserId + " has insufficient " + leg.assetId + " credit",
    );
  }
}

function validateRequest(request: DirectSwapRequest): void {
  if (request.swapId.trim().length === 0) {
    throw new DirectSwapError("swapId is required");
  }

  validateLeg(request.legA);
  validateLeg(request.legB);

  if (
    request.legA.fromUserId !== request.legB.toUserId ||
    request.legA.toUserId !== request.legB.fromUserId
  ) {
    throw new DirectSwapError("Swap legs must have reciprocal counterparties");
  }
}

function validateLeg(leg: SwapLeg): void {
  if (
    leg.fromUserId.trim().length === 0 ||
    leg.toUserId.trim().length === 0 ||
    leg.assetId.trim().length === 0
  ) {
    throw new DirectSwapError("Swap leg identifiers are required");
  }

  if (leg.fromUserId === leg.toUserId) {
    throw new DirectSwapError("A swap leg cannot transfer credit to the same user");
  }

  if (leg.amount <= 0n) {
    throw new DirectSwapError("Swap amounts must be positive");
  }
}
