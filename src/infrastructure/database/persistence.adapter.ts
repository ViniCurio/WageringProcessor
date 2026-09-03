import { Injectable } from "@nestjs/common";
import { FilterQuery, LockMode } from "@mikro-orm/core";
import { EntityManager } from "@mikro-orm/postgresql";
import {
  LedgerCursor,
  PersistencePort,
  PersistenceTransaction,
  StoredTransaction,
} from "../../application/persistence.port";
import { ConflictError } from "../../domain/errors";
import { WalletLedgerEntry } from "../../domain/ledger";
import { InboxMessage, OutboxMessage } from "../../domain/messages";
import {
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
import {
  InboxMapper,
  LedgerMapper,
  OutboxMapper,
  TransactionMapper,
  WalletMapper,
} from "./mappers";

class MikroOrmPersistenceTransaction implements PersistenceTransaction {
  constructor(private readonly em: EntityManager) {}

  async findTransactionByIdempotencyKey(
    key: string,
  ): Promise<StoredTransaction | undefined> {
    const record = await this.em.findOne(TransactionRecord, {
      idempotencyKey: key,
    });
    return record ? TransactionMapper.toStored(record) : undefined;
  }

  async findTransactionByExternalId(
    providerId: string,
    externalTransactionId: string,
  ): Promise<StoredTransaction | undefined> {
    const record = await this.em.findOne(TransactionRecord, {
      providerId,
      externalTransactionId,
    });
    return record ? TransactionMapper.toStored(record) : undefined;
  }

  async findProcessedReversal(
    referenceTransactionId: string,
    kind: WagerTransactionKind,
  ): Promise<StoredTransaction | undefined> {
    const record = await this.em.findOne(TransactionRecord, {
      referenceTransactionId,
      kind,
      status: WagerTransactionStatus.Processed,
    });
    return record ? TransactionMapper.toStored(record) : undefined;
  }

  async findInbox(
    consumerName: string,
    messageId: string,
  ): Promise<InboxMessage | undefined> {
    const record = await this.em.findOne(InboxRecord, {
      consumerName,
      messageId,
    });
    return record ? InboxMapper.toDomain(record) : undefined;
  }

  async lockWallet(walletId: string): Promise<Wallet | undefined> {
    const record = await this.em.findOne(
      WalletRecord,
      { id: walletId },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    );
    return record ? WalletMapper.toDomain(record) : undefined;
  }

  async lockPendingTransaction(
    transactionId: string,
  ): Promise<StoredTransaction | undefined> {
    const record = await this.em.findOne(
      TransactionRecord,
      { id: transactionId, status: WagerTransactionStatus.PendingReference },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    );
    return record ? TransactionMapper.toStored(record) : undefined;
  }

  async addWallet(wallet: Wallet): Promise<void> {
    this.em.persist(
      this.em.create(WalletRecord, WalletMapper.toPersistence(wallet)),
    );
    await this.flushConflict("Wallet already exists for player and currency");
  }

  async saveWallet(wallet: Wallet): Promise<void> {
    const record = await this.em.findOneOrFail(WalletRecord, { id: wallet.id });
    WalletMapper.update(record, wallet);
  }

  async addTransaction(transaction: WagerTransaction): Promise<void> {
    this.em.persist(
      this.em.create(
        TransactionRecord,
        TransactionMapper.toPersistence(transaction),
      ),
    );
    await this.flushConflict("Transaction identity already exists");
  }

  async saveTransaction(state: StoredTransaction): Promise<void> {
    const record = await this.em.findOneOrFail(TransactionRecord, {
      id: state.transaction.id,
    });
    TransactionMapper.update(record, state);
  }

  addInbox(message: InboxMessage): void {
    this.em.persist(
      this.em.create(InboxRecord, InboxMapper.toPersistence(message)),
    );
  }

  addLedger(entry: WalletLedgerEntry): void {
    this.em.persist(
      this.em.create(LedgerRecord, LedgerMapper.toPersistence(entry)),
    );
  }

  enqueue(message: OutboxMessage): void {
    this.em.persist(
      this.em.create(OutboxRecord, OutboxMapper.toPersistence(message)),
    );
  }

  private async flushConflict(message: string): Promise<void> {
    try {
      await this.em.flush();
    } catch (error) {
      if (this.isUniqueViolation(error)) throw new ConflictError(message);
      throw error;
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;
    return "code" in error && String(error.code) === "23505";
  }
}

@Injectable()
export class MikroOrmPersistenceAdapter extends PersistencePort {
  constructor(private readonly em: EntityManager) {
    super();
  }

  transactional<T>(
    work: (transaction: PersistenceTransaction) => Promise<T>,
  ): Promise<T> {
    return this.em.transactional((em) =>
      work(new MikroOrmPersistenceTransaction(em)),
    );
  }

  async findWallet(walletId: string): Promise<Wallet | undefined> {
    const record = await this.em.fork().findOne(WalletRecord, { id: walletId });
    return record ? WalletMapper.toDomain(record) : undefined;
  }

  async listLedger(
    walletId: string,
    cursor?: LedgerCursor,
    limit?: number,
  ): Promise<WalletLedgerEntry[]> {
    const em = this.em.fork();
    const where: FilterQuery<LedgerRecord> = { walletId };
    if (cursor) {
      where.$or = [
        { createdAt: { $gt: cursor.createdAt } },
        { createdAt: cursor.createdAt, id: { $gt: cursor.id } },
      ];
    }
    const records = await em.find(LedgerRecord, where, {
      orderBy: { createdAt: "asc", id: "asc" },
      limit,
    });
    return records.map((record) => LedgerMapper.toDomain(record));
  }

  async findTransactionById(
    transactionId: string,
  ): Promise<StoredTransaction | undefined> {
    const record = await this.em
      .fork()
      .findOne(TransactionRecord, { id: transactionId });
    return record ? TransactionMapper.toStored(record) : undefined;
  }

  async findTransactionByExternalId(
    providerId: string,
    externalTransactionId: string,
  ): Promise<StoredTransaction | undefined> {
    const record = await this.em
      .fork()
      .findOne(TransactionRecord, { providerId, externalTransactionId });
    return record ? TransactionMapper.toStored(record) : undefined;
  }
}
