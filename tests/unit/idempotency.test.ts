import { describe, expect, test } from "bun:test";
import { canonicalHash } from "../../src/application/canonical-hash";
import type {
  PersistencePort,
  PersistenceTransaction,
} from "../../src/application/persistence.port";
import { WageringService } from "../../src/application/wagering.service";
import { IdempotencyConflictError } from "../../src/domain/errors";
import { Money } from "../../src/domain/money";
import {
  WagerTransaction,
  WagerTransactionKind,
  WagerTransactionStatus,
} from "../../src/domain/wager-transaction";
import type { MetricsService } from "../../src/observability";

describe("persistent idempotency", () => {
  test("same idempotency key with a divergent payload is a conflict", async () => {
    const originalPayload = {
      providerId: "provider",
      externalTransactionId: "transaction",
      playerId: "player",
      walletId: "wallet",
      roundId: "round",
      gameId: "game",
      kind: WagerTransactionKind.Bet,
      money: { amount: "10.00", currency: "BRL" },
      referenceExternalTransactionId: undefined,
    };
    const transaction = WagerTransaction.rehydrate({
      id: "transaction-id",
      ...originalPayload,
      idempotencyKey: "same-key",
      payloadHash: canonicalHash(originalPayload),
      money: Money.from(originalPayload.money),
      createdAt: new Date(),
      status: WagerTransactionStatus.Processed,
      processedAt: new Date(),
    });
    const store = {
      findTransactionByIdempotencyKey: async () => ({
        transaction,
        resultingBalance: Money.from({ amount: "90.00", currency: "BRL" }),
        pendingAttempts: 0,
      }),
    } as unknown as PersistenceTransaction;
    const persistence = {
      transactional: <T>(work: (transaction: PersistenceTransaction) => Promise<T>) =>
        work(store),
    } as PersistencePort;
    const metrics = {
      processingLatency: { startTimer: () => () => undefined },
    } as unknown as MetricsService;
    const service = new WageringService(persistence, metrics);

    await expect(
      service.execute({
        ...originalPayload,
        idempotencyKey: "same-key",
        money: { amount: "11.00", currency: "BRL" },
        correlationId: "correlation",
      }),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
  });
});
