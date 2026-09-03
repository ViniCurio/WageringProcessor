import { Entity, Index, PrimaryKey, Property, Unique } from "@mikro-orm/core";

@Entity({ tableName: "wallets" })
@Unique({ properties: ["playerId", "currency"] })
export class WalletRecord {
  @PrimaryKey({ type: "uuid" }) id!: string;
  @Property({ fieldName: "player_id", type: "uuid" }) playerId!: string;
  @Property() currency!: string;
  @Property({ type: "decimal", precision: 20, scale: 2 }) balance!: string;
  @Property() version!: number;
  @Property({ fieldName: "created_at" }) createdAt!: Date;
  @Property({ fieldName: "updated_at" }) updatedAt!: Date;
}

@Entity({ tableName: "wager_transactions" })
@Unique({ properties: ["idempotencyKey"] })
@Unique({ properties: ["providerId", "externalTransactionId"] })
export class TransactionRecord {
  @PrimaryKey({ type: "uuid" }) id!: string;
  @Property({ fieldName: "provider_id" }) providerId!: string;
  @Property({ fieldName: "external_transaction_id" })
  externalTransactionId!: string;
  @Property({ fieldName: "idempotency_key" }) idempotencyKey!: string;
  @Property({ fieldName: "payload_hash" }) payloadHash!: string;
  @Property({ fieldName: "wallet_id", type: "uuid" }) walletId!: string;
  @Property({ fieldName: "player_id", type: "uuid" }) playerId!: string;
  @Property({ fieldName: "round_id" }) roundId!: string;
  @Property({ fieldName: "game_id" }) gameId!: string;
  @Property() kind!: string;
  @Property({ type: "decimal", precision: 20, scale: 2 }) amount!: string;
  @Property() currency!: string;
  @Property({ fieldName: "reference_external_transaction_id", nullable: true })
  referenceExternalTransactionId?: string;
  @Property({
    fieldName: "reference_transaction_id",
    type: "uuid",
    nullable: true,
  })
  referenceTransactionId?: string;
  @Property() status!: string;
  @Property({ fieldName: "failure_code", nullable: true }) failureCode?: string;
  @Property({
    fieldName: "resulting_balance",
    type: "decimal",
    precision: 20,
    scale: 2,
    nullable: true,
  })
  resultingBalance?: string;
  @Property({ fieldName: "pending_attempts", default: 0 }) pendingAttempts = 0;
  @Property({ fieldName: "next_attempt_at", nullable: true })
  nextAttemptAt?: Date;
  @Property({ fieldName: "created_at" }) createdAt!: Date;
  @Property({ fieldName: "processed_at", nullable: true }) processedAt?: Date;
}

@Entity({ tableName: "wallet_ledger_entries" })
@Unique({ properties: ["transactionId"] })
@Index({ properties: ["walletId", "createdAt", "id"] })
export class LedgerRecord {
  @PrimaryKey({ type: "uuid" }) id!: string;
  @Property({ fieldName: "wallet_id", type: "uuid" }) walletId!: string;
  @Property({ fieldName: "transaction_id", type: "uuid" })
  transactionId!: string;
  @Property() direction!: string;
  @Property({ type: "decimal", precision: 20, scale: 2 }) amount!: string;
  @Property() currency!: string;
  @Property({
    fieldName: "balance_before",
    type: "decimal",
    precision: 20,
    scale: 2,
  })
  balanceBefore!: string;
  @Property({
    fieldName: "balance_after",
    type: "decimal",
    precision: 20,
    scale: 2,
  })
  balanceAfter!: string;
  @Property({ fieldName: "created_at" }) createdAt!: Date;
}

@Entity({ tableName: "inbox_messages" })
@Unique({ properties: ["consumerName", "messageId"] })
export class InboxRecord {
  @PrimaryKey() id!: number;
  @Property({ fieldName: "consumer_name" }) consumerName!: string;
  @Property({ fieldName: "message_id" }) messageId!: string;
  @Property({ fieldName: "payload_hash" }) payloadHash!: string;
  @Property({ fieldName: "received_at" }) receivedAt!: Date;
  @Property({ fieldName: "processed_at", nullable: true }) processedAt?: Date;
}

@Entity({ tableName: "outbox_messages" })
@Index({ properties: ["publishedAt", "nextAttemptAt", "occurredAt"] })
export class OutboxRecord {
  @PrimaryKey({ type: "uuid" }) id!: string;
  @Property({ fieldName: "aggregate_id", type: "uuid" }) aggregateId!: string;
  @Property({ fieldName: "event_type" }) eventType!: string;
  @Property({ type: "json" }) payload!: Record<string, unknown>;
  @Property({ fieldName: "occurred_at" }) occurredAt!: Date;
  @Property({ default: 0 }) attempts = 0;
  @Property({ fieldName: "next_attempt_at", nullable: true })
  nextAttemptAt?: Date;
  @Property({ fieldName: "published_at", nullable: true }) publishedAt?: Date;
  @Property({ fieldName: "locked_by", nullable: true }) lockedBy?: string;
  @Property({ fieldName: "locked_until", nullable: true }) lockedUntil?: Date;
}

export const entities = [
  WalletRecord,
  TransactionRecord,
  LedgerRecord,
  InboxRecord,
  OutboxRecord,
];
