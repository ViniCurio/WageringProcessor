import { InboxMessage, OutboxMessage } from "../domain/messages";
import { Money } from "../domain/money";
import { WalletLedgerEntry } from "../domain/ledger";
import {
  WagerTransaction,
  WagerTransactionKind,
} from "../domain/wager-transaction";
import { Wallet } from "../domain/wallet";

export interface StoredTransaction {
  transaction: WagerTransaction;
  resultingBalance?: Money;
  pendingAttempts: number;
  nextAttemptAt?: Date;
}

export interface LedgerCursor {
  createdAt: Date;
  id: string;
}

export interface PersistenceTransaction {
  findTransactionByIdempotencyKey(key: string): Promise<StoredTransaction | undefined>;

  findTransactionByExternalId(providerId: string, externalTransactionId: string): Promise<StoredTransaction | undefined>;

  findProcessedReversal(referenceTransactionId: string, kind: WagerTransactionKind): Promise<StoredTransaction | undefined>;

  findInbox(consumerName: string, messageId: string): Promise<InboxMessage | undefined>;

  lockWallet(walletId: string): Promise<Wallet | undefined>;

  lockPendingTransaction(transactionId: string): Promise<StoredTransaction | undefined>;

  addWallet(wallet: Wallet): Promise<void>;

  saveWallet(wallet: Wallet): Promise<void>;

  addTransaction(transaction: WagerTransaction): Promise<void>;

  saveTransaction(state: StoredTransaction): Promise<void>;

  addInbox(message: InboxMessage): void;

  addLedger(entry: WalletLedgerEntry): void;

  enqueue(message: OutboxMessage): void;
}

export abstract class PersistencePort {
  abstract transactional<T>(work: (transaction: PersistenceTransaction) => Promise<T>): Promise<T>;

  abstract findWallet(walletId: string): Promise<Wallet | undefined>;

  abstract listLedger(
    walletId: string,
    cursor?: LedgerCursor,
    limit?: number,
  ): Promise<WalletLedgerEntry[]>;

  abstract findTransactionById(transactionId: string): Promise<StoredTransaction | undefined>;

  abstract findTransactionByExternalId(
    providerId: string,
    externalTransactionId: string,
  ): Promise<StoredTransaction | undefined>;
}
