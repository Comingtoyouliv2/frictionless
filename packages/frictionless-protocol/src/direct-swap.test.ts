import assert from "node:assert/strict";
import test from "node:test";

import {
  directSwap,
  DirectSwapError,
  InMemoryDirectSwapStore,
  type DirectSwapRequest,
} from "./index.js";

const userA = "user-a";
const userB = "user-b";
const assetA = "provider-a-generation-credit";
const assetB = "provider-b-render-credit";

function createStore(): InMemoryDirectSwapStore {
  return new InMemoryDirectSwapStore([
    { userId: userA, assetId: assetA, amount: 10n },
    { userId: userB, assetId: assetB, amount: 5n },
  ]);
}

function createSwap(swapId = "swap-1"): DirectSwapRequest {
  return {
    swapId,
    legA: {
      fromUserId: userA,
      toUserId: userB,
      assetId: assetA,
      amount: 4n,
    },
    legB: {
      fromUserId: userB,
      toUserId: userA,
      assetId: assetB,
      amount: 3n,
    },
  };
}

test("directSwap exchanges both credit legs atomically", async () => {
  const store = createStore();

  const result = await directSwap(store, createSwap());

  assert.deepEqual(result, { swapId: "swap-1", status: "COMMITTED" });
  assert.equal(store.getBalance(userA, assetA), 6n);
  assert.equal(store.getBalance(userB, assetA), 4n);
  assert.equal(store.getBalance(userB, assetB), 2n);
  assert.equal(store.getBalance(userA, assetB), 3n);
});

test("directSwap leaves both balances unchanged when a leg has insufficient credit", async () => {
  const store = createStore();
  const swap = createSwap();
  swap.legB.amount = 6n;

  await assert.rejects(
    directSwap(store, swap),
    (error: unknown) =>
      error instanceof DirectSwapError &&
      error.message.includes("insufficient"),
  );

  assert.equal(store.getBalance(userA, assetA), 10n);
  assert.equal(store.getBalance(userB, assetB), 5n);
});

test("directSwap rejects a duplicate swapId", async () => {
  const store = createStore();
  const swap = createSwap();

  await directSwap(store, swap);

  await assert.rejects(
    directSwap(store, swap),
    (error: unknown) =>
      error instanceof DirectSwapError &&
      error.message.includes("already processed"),
  );
});

test("directSwap allows only one concurrent spend of the same credit", async () => {
  const store = createStore();
  const firstSwap = createSwap("swap-1");
  const secondSwap = createSwap("swap-2");
  secondSwap.legA.amount = 7n;

  const results = await Promise.allSettled([
    directSwap(store, firstSwap),
    directSwap(store, secondSwap),
  ]);

  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal(store.getBalance(userA, assetA), 6n);
});
