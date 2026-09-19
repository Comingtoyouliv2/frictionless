import assert from "node:assert/strict";
import test from "node:test";

import * as protocol from "./index.js";

type SwapState = "REQUESTED" | "RESERVED" | "COMPLETED";

interface CreditBalance {
  availableAmount: bigint;
  reservedAmount: bigint;
}

interface SwapRecord {
  id: string;
  requesterUserId: string;
  counterpartyUserId: string;
  offeredAssetId: string;
  offeredAmount: bigint;
  requestedAssetId: string;
  requestedAmount: bigint;
  quotedRate: {
    numerator: bigint;
    denominator: bigint;
  };
  state: SwapState;
}

interface SwapService {
  userSwapRequest(input: {
    swapId: string;
    requesterUserId: string;
    counterpartyUserId: string;
    offeredAssetId: string;
    offeredAmount: bigint;
    requestedAssetId: string;
    requestedAmount: bigint;
    quotedRate: {
      numerator: bigint;
      denominator: bigint;
    };
  }): Promise<SwapRecord>;
  swapProceed(input: {
    swapId: string;
    actorUserId: string;
  }): Promise<SwapRecord>;
  swapCompleted(input: {
    swapId: string;
  }): Promise<SwapRecord>;
  getSwap(swapId: string): Promise<SwapRecord | null>;
  getCreditBalance(userId: string, assetId: string): Promise<CreditBalance>;
}

interface SwapServiceFactory {
  createInMemorySwapService(input: {
    credits: Array<{
      userId: string;
      assetId: string;
      availableAmount: bigint;
    }>;
  }): SwapService;
}

const userA = "user-a";
const userB = "user-b";
const providerAAsset = "provider-a:generation-credit";
const providerBAsset = "provider-b:render-credit";

function createService(): SwapService {
  const factory = (protocol as unknown as Partial<SwapServiceFactory>)
    .createInMemorySwapService;

  if (typeof factory !== "function") {
    assert.fail("Expected createInMemorySwapService to be exported by the protocol");
  }

  return factory({
    credits: [
      { userId: userA, assetId: providerAAsset, availableAmount: 10n },
      { userId: userB, assetId: providerBAsset, availableAmount: 5n },
    ],
  });
}

function requestInput(swapId = "swap-001") {
  return {
    swapId,
    requesterUserId: userA,
    counterpartyUserId: userB,
    offeredAssetId: providerAAsset,
    offeredAmount: 6n,
    requestedAssetId: providerBAsset,
    requestedAmount: 3n,
    quotedRate: { numerator: 1n, denominator: 2n },
  };
}

async function assertBalance(
  service: SwapService,
  userId: string,
  assetId: string,
  expected: CreditBalance,
): Promise<void> {
  assert.deepEqual(await service.getCreditBalance(userId, assetId), expected);
}

test("UserSwapRequest creates a REQUESTED swap without changing credit balances", async () => {
  const service = createService();

  const swap = await service.userSwapRequest(requestInput());

  assert.equal(swap.state, "REQUESTED");
  assert.deepEqual(swap.quotedRate, { numerator: 1n, denominator: 2n });
  await assertBalance(service, userA, providerAAsset, {
    availableAmount: 10n,
    reservedAmount: 0n,
  });
  await assertBalance(service, userB, providerBAsset, {
    availableAmount: 5n,
    reservedAmount: 0n,
  });
});

test("UserSwapRequest rejects a self-swap and non-positive credit amounts", async () => {
  const service = createService();

  await assert.rejects(
    service.userSwapRequest({ ...requestInput(), counterpartyUserId: userA }),
  );
  await assert.rejects(
    service.userSwapRequest({ ...requestInput("swap-002"), offeredAmount: 0n }),
  );
});

test("SwapProceed reserves both sides of a REQUESTED swap", async () => {
  const service = createService();
  await service.userSwapRequest(requestInput());

  const swap = await service.swapProceed({ swapId: "swap-001", actorUserId: userB });

  assert.equal(swap.state, "RESERVED");
  await assertBalance(service, userA, providerAAsset, {
    availableAmount: 4n,
    reservedAmount: 6n,
  });
  await assertBalance(service, userB, providerBAsset, {
    availableAmount: 2n,
    reservedAmount: 3n,
  });
});

test("SwapProceed rejects an unauthorised counterparty without reserving credit", async () => {
  const service = createService();
  await service.userSwapRequest(requestInput());

  await assert.rejects(
    service.swapProceed({ swapId: "swap-001", actorUserId: "user-c" }),
  );

  assert.equal((await service.getSwap("swap-001"))?.state, "REQUESTED");
  await assertBalance(service, userA, providerAAsset, {
    availableAmount: 10n,
    reservedAmount: 0n,
  });
});

test("SwapProceed keeps both balances unchanged when either side lacks credit", async () => {
  const service = createService();
  await service.userSwapRequest({ ...requestInput(), requestedAmount: 6n });

  await assert.rejects(
    service.swapProceed({ swapId: "swap-001", actorUserId: userB }),
  );

  assert.equal((await service.getSwap("swap-001"))?.state, "REQUESTED");
  await assertBalance(service, userA, providerAAsset, {
    availableAmount: 10n,
    reservedAmount: 0n,
  });
  await assertBalance(service, userB, providerBAsset, {
    availableAmount: 5n,
    reservedAmount: 0n,
  });
});

test("SwapProceed rejects a replayed proceed command without reserving credit twice", async () => {
  const service = createService();
  await service.userSwapRequest(requestInput());
  await service.swapProceed({ swapId: "swap-001", actorUserId: userB });

  await assert.rejects(
    service.swapProceed({ swapId: "swap-001", actorUserId: userB }),
  );

  assert.equal((await service.getSwap("swap-001"))?.state, "RESERVED");
  await assertBalance(service, userA, providerAAsset, {
    availableAmount: 4n,
    reservedAmount: 6n,
  });
  await assertBalance(service, userB, providerBAsset, {
    availableAmount: 2n,
    reservedAmount: 3n,
  });
});

test("SwapProceed allows only one concurrent duplicate command to reserve a swap", async () => {
  const service = createService();
  await service.userSwapRequest(requestInput());

  const results = await Promise.allSettled([
    service.swapProceed({ swapId: "swap-001", actorUserId: userB }),
    service.swapProceed({ swapId: "swap-001", actorUserId: userB }),
  ]);

  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal(
    results.filter((result) => result.status === "rejected").length,
    1,
  );
  assert.equal((await service.getSwap("swap-001"))?.state, "RESERVED");
  await assertBalance(service, userA, providerAAsset, {
    availableAmount: 4n,
    reservedAmount: 6n,
  });
  await assertBalance(service, userB, providerBAsset, {
    availableAmount: 2n,
    reservedAmount: 3n,
  });
});

test("SwapCompleted transfers both reserved credits and marks the swap COMPLETED", async () => {
  const service = createService();
  await service.userSwapRequest(requestInput());
  await service.swapProceed({ swapId: "swap-001", actorUserId: userB });

  const swap = await service.swapCompleted({ swapId: "swap-001" });

  assert.equal(swap.state, "COMPLETED");
  await assertBalance(service, userA, providerAAsset, {
    availableAmount: 4n,
    reservedAmount: 0n,
  });
  await assertBalance(service, userB, providerAAsset, {
    availableAmount: 6n,
    reservedAmount: 0n,
  });
  await assertBalance(service, userB, providerBAsset, {
    availableAmount: 2n,
    reservedAmount: 0n,
  });
  await assertBalance(service, userA, providerBAsset, {
    availableAmount: 3n,
    reservedAmount: 0n,
  });
});

test("SwapCompleted rejects a swap that has not been reserved", async () => {
  const service = createService();
  await service.userSwapRequest(requestInput());

  await assert.rejects(service.swapCompleted({ swapId: "swap-001" }));

  assert.equal((await service.getSwap("swap-001"))?.state, "REQUESTED");
});

test("SwapCompleted is idempotency-safe and cannot transfer credit twice", async () => {
  const service = createService();
  await service.userSwapRequest(requestInput());
  await service.swapProceed({ swapId: "swap-001", actorUserId: userB });
  await service.swapCompleted({ swapId: "swap-001" });

  await assert.rejects(service.swapCompleted({ swapId: "swap-001" }));

  await assertBalance(service, userB, providerAAsset, {
    availableAmount: 6n,
    reservedAmount: 0n,
  });
  await assertBalance(service, userA, providerBAsset, {
    availableAmount: 3n,
    reservedAmount: 0n,
  });
});
