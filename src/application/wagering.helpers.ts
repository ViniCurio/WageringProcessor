import { IntegrationEvent } from "../domain/integration-event";
import { OutboxMessage } from "../domain/messages";
import { Money } from "../domain/money";
import { WagerTransaction } from "../domain/wager-transaction";
import { PersistenceTransaction, StoredTransaction } from "./persistence.port";

export function storedTransactionState(
  transaction: WagerTransaction,
  resultingBalance?: Money,
  pendingAttempts = 0,
  nextAttemptAt?: Date,
): StoredTransaction {
  return { transaction, resultingBalance, pendingAttempts, nextAttemptAt };
}

export function enqueueWagerEvent(
  store: PersistenceTransaction,
  event: IntegrationEvent<unknown>,
): void {
  store.enqueue(OutboxMessage.enqueue(event));
}

export function wagerEventData(transaction: WagerTransaction) {
  return {
    transactionId: transaction.id,
    providerId: transaction.providerId,
    externalTransactionId: transaction.externalTransactionId,
    walletId: transaction.walletId,
    playerId: transaction.playerId,
    roundId: transaction.roundId,
    gameId: transaction.gameId,
    kind: transaction.kind,
    money: transaction.money.toJSON(),
    referenceExternalTransactionId:
      transaction.referenceExternalTransactionId,
    status: transaction.status,
    failureCode: transaction.failureCode,
  };
}
