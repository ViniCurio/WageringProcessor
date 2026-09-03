import { describe, expect, test } from "bun:test";
import { FailureCode } from "../../src/domain/errors";
import { Money } from "../../src/domain/money";
import {
  LedgerDirection,
  WagerTransaction,
  WagerTransactionKind,
  WagerTransactionStatus,
} from "../../src/domain/wager-transaction";

const transaction = (
  kind: WagerTransactionKind,
  referenceExternalTransactionId?: string,
) =>
  WagerTransaction.create({
    providerId: "provider",
    externalTransactionId: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
    payloadHash: "hash",
    walletId: "wallet",
    playerId: "player",
    roundId: "round",
    gameId: "game",
    kind,
    money: Money.from({ amount: "10.00", currency: "BRL" }),
    referenceExternalTransactionId,
  });
describe("wager operation rules", () => {
  test("BET debits and WIN credits", () => {
    expect(transaction(WagerTransactionKind.Bet).ledgerDirectionFor()).toBe(
      LedgerDirection.Debit,
    );
    expect(transaction(WagerTransactionKind.Win).ledgerDirectionFor()).toBe(
      LedgerDirection.Credit,
    );
  });
  test("LOSS is processed without affecting balance", () => {
    const loss = transaction(WagerTransactionKind.Loss);
    expect(loss.affectsBalance()).toBeFalse();
    loss.markProcessed(undefined, new Date());
    expect(loss.status).toBe(WagerTransactionStatus.Processed);
  });
  test("REFUND requires reference and credits", () => {
    expect(() => transaction(WagerTransactionKind.Refund)).toThrow();
    expect(
      transaction(WagerTransactionKind.Refund, "bet").ledgerDirectionFor(),
    ).toBe(LedgerDirection.Credit);
  });
  test("ROLLBACK reverses the referenced ledger direction", () => {
    const rollback = transaction(WagerTransactionKind.Rollback, "reference");
    expect(
      rollback.ledgerDirectionFor(transaction(WagerTransactionKind.Bet)),
    ).toBe(LedgerDirection.Credit);
    expect(
      rollback.ledgerDirectionFor(transaction(WagerTransactionKind.Win)),
    ).toBe(LedgerDirection.Debit);
  });
  test("reference validation belongs to the transaction domain", () => {
    const reference = transaction(WagerTransactionKind.Bet);
    const refund = transaction(WagerTransactionKind.Refund, "bet");

    expect(refund.validateReference(reference)).toBe(
      FailureCode.InvalidReference,
    );

    reference.markProcessed(undefined, new Date());
    expect(refund.validateReference(reference)).toBeUndefined();
  });
  test("rejected transaction is terminal and carries stable failure code", () => {
    const bet = transaction(WagerTransactionKind.Bet);
    bet.reject(FailureCode.InsufficientFunds);
    expect(bet.status).toBe(WagerTransactionStatus.Rejected);
    expect(bet.failureCode).toBe(FailureCode.InsufficientFunds);
    expect(bet.isTerminal()).toBeTrue();
  });
});
