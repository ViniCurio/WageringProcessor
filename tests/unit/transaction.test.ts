import { describe, expect, test } from "bun:test";
import { Money } from "../../src/domain/money";
import {
  WagerTransaction,
  WagerTransactionKind,
  WagerTransactionStatus,
} from "../../src/domain/wager-transaction";
import { InvalidTransactionStateError } from "../../src/domain/errors";
const create = (
  kind: WagerTransactionKind,
  referenceExternalTransactionId?: string,
) =>
  WagerTransaction.create({
    providerId: "p",
    externalTransactionId: "e",
    idempotencyKey: "k",
    payloadHash: "h",
    walletId: "w",
    playerId: "u",
    roundId: "r",
    gameId: "g",
    kind,
    money: Money.from({ amount: "1.00", currency: "BRL" }),
    referenceExternalTransactionId,
  });
describe("WagerTransaction", () => {
  test("requires references for refund and rollback", () =>
    expect(() => create(WagerTransactionKind.Refund)).toThrow());
  test("terminal states cannot transition", () => {
    const tx = create(WagerTransactionKind.Bet);
    tx.markProcessed(undefined, new Date());
    expect(tx.status).toBe(WagerTransactionStatus.Processed);
    expect(() => tx.reject("INVALID_PAYLOAD" as never)).toThrow(
      InvalidTransactionStateError,
    );
  });
});
