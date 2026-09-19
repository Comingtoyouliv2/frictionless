import type {
  AssetId,
  DirectSwapStore,
  DirectSwapTransaction,
  UserId,
} from "./direct-swap.js";

export interface InitialCredit {
  userId: UserId;
  assetId: AssetId;
  amount: bigint;
}

type BalanceMap = Map<string, bigint>;

/**
 * A serialized, transactional store for protocol tests and local demos.
 * Real providers replace this with an adapter for their own database.
 */
export class InMemoryDirectSwapStore implements DirectSwapStore {
  private balances: BalanceMap;
  private processedSwaps = new Set<string>();
  private transactionTail: Promise<void> = Promise.resolve();

  constructor(initialCredits: InitialCredit[] = []) {
    this.balances = new Map(
      initialCredits.map((credit) => [
        balanceKey(credit.userId, credit.assetId),
        credit.amount,
      ]),
    );
  }

  async transaction<T>(
    operation: (transaction: DirectSwapTransaction) => Promise<T>,
  ): Promise<T> {
    let release!: () => void;
    const previousTransaction = this.transactionTail;
    this.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previousTransaction;

    const workingBalances = new Map(this.balances);
    const workingProcessedSwaps = new Set(this.processedSwaps);
    const transaction = new InMemoryTransaction(
      workingBalances,
      workingProcessedSwaps,
    );

    try {
      const result = await operation(transaction);
      this.balances = workingBalances;
      this.processedSwaps = workingProcessedSwaps;
      return result;
    } finally {
      release();
    }
  }

  getBalance(userId: UserId, assetId: AssetId): bigint {
    return this.balances.get(balanceKey(userId, assetId)) ?? 0n;
  }
}

class InMemoryTransaction implements DirectSwapTransaction {
  constructor(
    private readonly balances: BalanceMap,
    private readonly processedSwaps: Set<string>,
  ) {}

  async hasProcessedSwap(swapId: string): Promise<boolean> {
    return this.processedSwaps.has(swapId);
  }

  async getAvailableCredit(userId: UserId, assetId: AssetId): Promise<bigint> {
    return this.balances.get(balanceKey(userId, assetId)) ?? 0n;
  }

  async debitCredit(
    userId: UserId,
    assetId: AssetId,
    amount: bigint,
  ): Promise<void> {
    const key = balanceKey(userId, assetId);
    this.balances.set(key, (this.balances.get(key) ?? 0n) - amount);
  }

  async creditUser(
    userId: UserId,
    assetId: AssetId,
    amount: bigint,
  ): Promise<void> {
    const key = balanceKey(userId, assetId);
    this.balances.set(key, (this.balances.get(key) ?? 0n) + amount);
  }

  async recordProcessedSwap(swapId: string): Promise<void> {
    this.processedSwaps.add(swapId);
  }
}

function balanceKey(userId: UserId, assetId: AssetId): string {
  return userId + ":" + assetId;
}
