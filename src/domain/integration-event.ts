import { randomUUID } from "node:crypto";
import type { MoneyProps } from "./money";
import type { LedgerDirection } from "./wager-transaction";

export interface EventContext {
  correlationId: string;
  causationId?: string;
  occurredAt?: Date;
}

export interface IntegrationEventProps<T> {
  eventId?: string;
  aggregateId: string;
  correlationId: string;
  causationId?: string;
  occurredAt?: Date;
  data: T;
}

export interface IntegrationEventEnvelope<T> {
  eventId: string;
  eventType: string;
  aggregateId: string;
  correlationId: string;
  causationId?: string;
  occurredAt: string;
  version: number;
  data: T;
}

export abstract class IntegrationEvent<T> {
  abstract readonly eventType: string;
  abstract readonly version: number;
  readonly eventId: string;
  readonly aggregateId: string;
  readonly correlationId: string;
  readonly causationId?: string;
  readonly occurredAt: Date;
  readonly data: Readonly<T>;
  private readonly serializableData: T;

  protected constructor(props: IntegrationEventProps<T>) {
    this.eventId = props.eventId ?? randomUUID();
    this.aggregateId = props.aggregateId;
    this.correlationId = props.correlationId;
    this.causationId = props.causationId;
    this.occurredAt = props.occurredAt ?? new Date();
    this.serializableData = props.data;
    this.data = Object.freeze(props.data);
  }

  toJSON(): IntegrationEventEnvelope<T> {
    return {
      eventId: this.eventId,
      eventType: this.eventType,
      aggregateId: this.aggregateId,
      correlationId: this.correlationId,
      causationId: this.causationId,
      occurredAt: this.occurredAt.toISOString(),
      version: this.version,
      data: this.serializableData,
    };
  }
}

export interface TransactionEventData {
  transactionId: string;
  status: string;
  failureCode?: string;
}

export class WagerTransactionProcessed extends IntegrationEvent<TransactionEventData> {
  readonly eventType = "WagerTransactionProcessed";
  readonly version = 1;

  static create(
    aggregateId: string,
    data: TransactionEventData,
    ctx: EventContext,
  ) {
    return new WagerTransactionProcessed({ aggregateId, data, ...ctx });
  }
}

export class WagerTransactionRejected extends IntegrationEvent<TransactionEventData> {
  readonly eventType = "WagerTransactionRejected";
  readonly version = 1;

  static create(
    aggregateId: string,
    data: TransactionEventData,
    ctx: EventContext,
  ) {
    return new WagerTransactionRejected({ aggregateId, data, ...ctx });
  }
}

export class WagerTransactionPendingReference extends IntegrationEvent<TransactionEventData> {
  readonly eventType = "WagerTransactionPendingReference";
  readonly version = 1;

  static create(
    aggregateId: string,
    data: TransactionEventData,
    ctx: EventContext,
  ) {
    return new WagerTransactionPendingReference({ aggregateId, data, ...ctx });
  }
}

export interface WalletBalanceChangedData {
  walletId: string;
  transactionId: string;
  direction: LedgerDirection;
  money: MoneyProps;
  balanceBefore: MoneyProps;
  balanceAfter: MoneyProps;
  walletVersion: number;
}

export class WalletBalanceChanged extends IntegrationEvent<WalletBalanceChangedData> {
  readonly eventType = "WalletBalanceChanged";
  readonly version = 1;

  static create(
    aggregateId: string,
    data: WalletBalanceChangedData,
    ctx: EventContext,
  ) {
    return new WalletBalanceChanged({ aggregateId, data, ...ctx });
  }
}
