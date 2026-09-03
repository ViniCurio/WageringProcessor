import { StoredTransaction } from "../../application/persistence.port";
import { FailureCode } from "../../domain/errors";
import { WalletLedgerEntry } from "../../domain/ledger";
import { InboxMessage, OutboxMessage } from "../../domain/messages";
import { Money } from "../../domain/money";
import {
  LedgerDirection,
  WagerTransaction,
  WagerTransactionKind,
  WagerTransactionStatus,
} from "../../domain/wager-transaction";
import { Wallet } from "../../domain/wallet";
import {
  InboxRecord,
  LedgerRecord,
  OutboxRecord,
  TransactionRecord,
  WalletRecord,
} from "./entities";

export const WalletMapper = {
  toDomain(record: WalletRecord): Wallet {
    return Wallet.rehydrate({
      id: record.id,
      playerId: record.playerId,
      currency: record.currency,
      balance: Money.from({
        amount: record.balance,
        currency: record.currency,
      }),
      version: record.version,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  },
  toPersistence(wallet: Wallet) {
    return {
      id: wallet.id,
      playerId: wallet.playerId,
      currency: wallet.currency,
      balance: wallet.balance.toString(),
      version: wallet.version,
      createdAt: wallet.createdAt,
      updatedAt: wallet.updatedAt,
    };
  },
  update(record: WalletRecord, wallet: Wallet): void {
    record.balance = wallet.balance.toString();
    record.version = wallet.version;
    record.updatedAt = wallet.updatedAt;
  },
};

export const TransactionMapper = {
  toDomain(record: TransactionRecord): WagerTransaction {
    return WagerTransaction.rehydrate({
      id: record.id,
      providerId: record.providerId,
      externalTransactionId: record.externalTransactionId,
      idempotencyKey: record.idempotencyKey,
      payloadHash: record.payloadHash,
      walletId: record.walletId,
      playerId: record.playerId,
      roundId: record.roundId,
      gameId: record.gameId,
      kind: record.kind as WagerTransactionKind,
      money: Money.from({ amount: record.amount, currency: record.currency }),
      referenceExternalTransactionId: record.referenceExternalTransactionId,
      createdAt: record.createdAt,
      status: record.status as WagerTransactionStatus,
      referenceTransactionId: record.referenceTransactionId,
      failureCode: record.failureCode as FailureCode | undefined,
      processedAt: record.processedAt,
    });
  },
  toStored(record: TransactionRecord): StoredTransaction {
    return {
      transaction: this.toDomain(record),
      resultingBalance: record.resultingBalance
        ? Money.from({
            amount: record.resultingBalance,
            currency: record.currency,
          })
        : undefined,
      pendingAttempts: record.pendingAttempts,
      nextAttemptAt: record.nextAttemptAt,
    };
  },
  toPersistence(transaction: WagerTransaction) {
    return {
      id: transaction.id,
      providerId: transaction.providerId,
      externalTransactionId: transaction.externalTransactionId,
      idempotencyKey: transaction.idempotencyKey,
      payloadHash: transaction.payloadHash,
      walletId: transaction.walletId,
      playerId: transaction.playerId,
      roundId: transaction.roundId,
      gameId: transaction.gameId,
      kind: transaction.kind,
      amount: transaction.money.toString(),
      currency: transaction.money.currency,
      referenceExternalTransactionId:
        transaction.referenceExternalTransactionId,
      status: transaction.status,
      createdAt: transaction.createdAt,
      pendingAttempts: 0,
    };
  },
  update(record: TransactionRecord, state: StoredTransaction): void {
    const transaction = state.transaction;
    record.status = transaction.status;
    record.referenceTransactionId = transaction.referenceTransactionId;
    record.failureCode = transaction.failureCode;
    record.processedAt = transaction.processedAt;
    record.resultingBalance = state.resultingBalance?.toString();
    record.pendingAttempts = state.pendingAttempts;
    record.nextAttemptAt = state.nextAttemptAt;
  },
};

export const InboxMapper = {
  toDomain(record: InboxRecord): InboxMessage {
    return InboxMessage.rehydrate({
      messageId: record.messageId,
      consumerName: record.consumerName,
      payloadHash: record.payloadHash,
      receivedAt: record.receivedAt,
      processedAt: record.processedAt,
    });
  },
  toPersistence(message: InboxMessage) {
    return {
      messageId: message.messageId,
      consumerName: message.consumerName,
      payloadHash: message.payloadHash,
      receivedAt: message.receivedAt,
      processedAt: message.processedAt,
    };
  },
};

export const OutboxMapper = {
  toDomain(record: OutboxRecord): OutboxMessage {
    return OutboxMessage.rehydrate({
      id: record.id,
      aggregateId: record.aggregateId,
      eventType: record.eventType,
      payload: record.payload,
      occurredAt: record.occurredAt,
      attempts: record.attempts,
      nextAttemptAt: record.nextAttemptAt,
      publishedAt: record.publishedAt,
    });
  },
  toPersistence(message: OutboxMessage) {
    return {
      id: message.id,
      aggregateId: message.aggregateId,
      eventType: message.eventType,
      payload: message.payload,
      occurredAt: message.occurredAt,
      attempts: message.attempts,
      nextAttemptAt: message.nextAttemptAt,
      publishedAt: message.publishedAt,
    };
  },
};

export const LedgerMapper = {
  toDomain(record: LedgerRecord): WalletLedgerEntry {
    return WalletLedgerEntry.rehydrate({
      id: record.id,
      walletId: record.walletId,
      transactionId: record.transactionId,
      direction: record.direction as LedgerDirection,
      money: Money.from({ amount: record.amount, currency: record.currency }),
      balanceBefore: Money.from({
        amount: record.balanceBefore,
        currency: record.currency,
      }),
      balanceAfter: Money.from({
        amount: record.balanceAfter,
        currency: record.currency,
      }),
      createdAt: record.createdAt,
    });
  },
  toPersistence(entry: WalletLedgerEntry) {
    return {
      id: entry.id,
      walletId: entry.walletId,
      transactionId: entry.transactionId,
      direction: entry.direction,
      amount: entry.money.toString(),
      currency: entry.money.currency,
      balanceBefore: entry.balanceBefore.toString(),
      balanceAfter: entry.balanceAfter.toString(),
      createdAt: entry.createdAt,
    };
  },
};
