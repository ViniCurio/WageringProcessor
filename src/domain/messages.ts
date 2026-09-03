import type { IntegrationEvent } from "./integration-event";

export interface InboxMessageState {
  messageId: string;
  consumerName: string;
  payloadHash: string;
  receivedAt: Date;
  processedAt?: Date;
}

export class InboxMessage {
  private constructor(
    public readonly messageId: string,
    public readonly consumerName: string,
    public readonly payloadHash: string,
    public readonly receivedAt: Date,
    private _processedAt?: Date,
  ) {}

  static receive(props: {
    messageId: string;
    consumerName: string;
    payloadHash: string;
    receivedAt?: Date;
  }) {
    return new InboxMessage(
      props.messageId,
      props.consumerName,
      props.payloadHash,
      props.receivedAt ?? new Date(),
    );
  }

  static rehydrate(state: InboxMessageState) {
    return new InboxMessage(
      state.messageId,
      state.consumerName,
      state.payloadHash,
      state.receivedAt,
      state.processedAt,
    );
  }

  get processedAt() {
    return this._processedAt;
  }

  isProcessed() {
    return this._processedAt !== undefined;
  }

  markProcessed(at: Date) {
    if (!this._processedAt) this._processedAt = at;
  }
}

export interface OutboxMessageState {
  id: string;
  aggregateId: string;
  eventType: string;
  payload: Readonly<Record<string, unknown>>;
  occurredAt: Date;
  attempts: number;
  nextAttemptAt?: Date;
  publishedAt?: Date;
}

export class OutboxMessage {
  private constructor(
    public readonly id: string,
    public readonly aggregateId: string,
    public readonly eventType: string,
    public readonly payload: Readonly<Record<string, unknown>>,
    public readonly occurredAt: Date,
    private _attempts: number,
    private _nextAttemptAt?: Date,
    private _publishedAt?: Date,
  ) {}

  static enqueue(event: IntegrationEvent<unknown>) {
    const json: Record<string, unknown> = { ...event.toJSON() };
    return new OutboxMessage(
      event.eventId,
      event.aggregateId,
      event.eventType,
      Object.freeze(json),
      event.occurredAt,
      0,
    );
  }

  static rehydrate(s: OutboxMessageState) {
    return new OutboxMessage(
      s.id,
      s.aggregateId,
      s.eventType,
      Object.freeze(s.payload),
      s.occurredAt,
      s.attempts,
      s.nextAttemptAt,
      s.publishedAt,
    );
  }

  get attempts() {
    return this._attempts;
  }

  get nextAttemptAt() {
    return this._nextAttemptAt;
  }

  get publishedAt() {
    return this._publishedAt;
  }

  isPending() {
    return !this._publishedAt;
  }

  isDue(now: Date) {
    return (
      this.isPending() && (!this._nextAttemptAt || this._nextAttemptAt <= now)
    );
  }

  markPublished(at: Date) {
    this._publishedAt = at;
    this._nextAttemptAt = undefined;
  }

  scheduleRetry(now: Date) {
    this._attempts += 1;
    this._nextAttemptAt = new Date(
      now.getTime() + Math.min(60000, 1000 * 2 ** (this._attempts - 1)),
    );
  }
}
