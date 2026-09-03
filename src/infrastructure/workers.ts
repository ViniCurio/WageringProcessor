import { randomUUID } from "node:crypto";
import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { EntityManager } from "@mikro-orm/postgresql";
import { RequestContext } from "@mikro-orm/core";
import {
  ChangeMessageVisibilityCommand,
  DeleteMessageCommand,
  ReceiveMessageCommand,
  type Message,
} from "@aws-sdk/client-sqs";
import { SubmitTransactionCommand } from "../application/contracts";
import { canonicalHash } from "../application/canonical-hash";
import { PendingReferenceService } from "../application/pending-reference.service";
import { WageringService } from "../application/wagering.service";
import { WagerTransactionKind } from "../domain/wager-transaction";
import { DomainError } from "../domain/errors";
import { MetricsService } from "../observability";
import { OutboxRecord, TransactionRecord } from "./database/entities";
import { SqsClientService } from "./messaging/sqs.service";

@Injectable()
export class OutboxWorker {
  private readonly logger = new Logger(OutboxWorker.name);
  private readonly workerId = randomUUID();
  private ticking = false;

  constructor(
    private readonly em: EntityManager,
    private readonly sqs: SqsClientService,
    private readonly metrics: MetricsService,
  ) {}

  @Interval(500) async tick() {
    if (process.env.ENABLE_WORKERS === "false" || this.ticking) return;
    this.ticking = true;
    try {
      await RequestContext.create(this.em, async () => {
        await this.updateLag();
        const rows = await this.claim(20);
        for (const row of rows) {
          try {
            await this.sqs.publish(row.payload, row.aggregateId);
            await this.em
              .getConnection()
              .execute(
                "update outbox_messages set published_at=now(),locked_by=null,locked_until=null where id=? and locked_by=?",
                [row.id, this.workerId],
              );
          } catch {
            this.metrics.retries.inc({ subsystem: "outbox" });
            this.logger.warn({ event: "outbox_retry", outboxId: row.id });
            await this.em
              .getConnection()
              .execute(
                `update outbox_messages set attempts=attempts+1,next_attempt_at=now()+least(interval '60 seconds',interval '1 second'*power(2,attempts)),locked_by=null,locked_until=null where id=? and locked_by=?`,
                [row.id, this.workerId],
              );
          }
        }
      });
    } finally {
      this.ticking = false;
    }
  }

  async claim(limit: number): Promise<OutboxRecord[]> {
    return this.em.transactional((em) =>
      em
        .getConnection()
        .execute<
          OutboxRecord[]
        >(`with candidates as (select id from outbox_messages where published_at is null and (next_attempt_at is null or next_attempt_at<=now()) and (locked_until is null or locked_until<now()) order by occurred_at for update skip locked limit ?) update outbox_messages o set locked_by=?,locked_until=now()+interval '30 seconds' from candidates c where o.id=c.id returning o.id,o.aggregate_id as "aggregateId",o.event_type as "eventType",o.payload,o.occurred_at as "occurredAt",o.attempts,o.next_attempt_at as "nextAttemptAt",o.published_at as "publishedAt",o.locked_by as "lockedBy",o.locked_until as "lockedUntil"`, [limit, this.workerId]),
    );
  }

  private async updateLag() {
    const result = await this.em
      .getConnection()
      .execute<
        Array<{ lag: string | null }>
      >(`select extract(epoch from now()-min(occurred_at))::text lag from outbox_messages where published_at is null`);
    this.metrics.outboxLag.set(Number(result[0]?.lag ?? 0));
  }
}

@Injectable()
export class PendingReferenceWorker {
  private ticking = false;

  constructor(
    private readonly em: EntityManager,
    private readonly useCase: PendingReferenceService,
  ) {}

  @Interval(1000) async tick() {
    if (process.env.ENABLE_WORKERS === "false" || this.ticking) return;
    this.ticking = true;
    try {
      await RequestContext.create(this.em, async () => {
        const rows = await this.em.find(
          TransactionRecord,
          { status: "PENDING_REFERENCE", nextAttemptAt: { $lte: new Date() } },
          { limit: 20, orderBy: { nextAttemptAt: "asc" } },
        );
        for (const row of rows) await this.useCase.retry(row.id);
      });
    } finally {
      this.ticking = false;
    }
  }
}

interface WagerEnvelope {
  messageId: string;
  type: "WagerTransactionRequested";
  occurredAt: string;
  data: Omit<SubmitTransactionCommand, "correlationId" | "inbox">;
}

@Injectable()
export class WagerConsumer implements OnModuleInit, OnApplicationShutdown {
  private running = false;
  private loop?: Promise<void>;
  private readonly logger = new Logger(WagerConsumer.name);

  constructor(
    private readonly sqs: SqsClientService,
    private readonly useCase: WageringService,
    private readonly metrics: MetricsService,
  ) {}

  onModuleInit() {
    if (process.env.ENABLE_WORKERS !== "false") {
      this.running = true;
      this.loop = this.poll();
    }
  }

  async onApplicationShutdown() {
    this.running = false;
    await this.loop;
  }

  async processMessage(message: Message) {
    const body = message.Body ?? "";
    const receiveCount = Number(
      message.Attributes?.ApproximateReceiveCount ?? 1,
    );
    try {
      const envelope = this.parse(body);
      await this.useCase.execute({
        ...envelope.data,
        correlationId: envelope.messageId,
        inbox: {
          consumerName: process.env.CONSUMER_NAME ?? "wager-processor",
          messageId: envelope.messageId,
          payloadHash: canonicalHash(envelope),
        },
      });
      await this.ack(message);
    } catch (error) {
      if (error instanceof DomainError) {
        await this.ack(message);
        return;
      }
      if (error instanceof PermanentMessageError || receiveCount >= 5) {
        await this.sqs.sendToDlq(
          body,
          message.MessageId ?? canonicalHash(body),
        );
        this.metrics.dlq.inc({
          reason:
            error instanceof PermanentMessageError
              ? "permanent"
              : "retries_exhausted",
        });
        await this.ack(message);
        return;
      }
      this.metrics.retries.inc({ subsystem: "sqs" });
      this.logger.warn({
        event: "sqs_retry",
        messageId: message.MessageId,
        receiveCount,
      });
      await this.sqs.client.send(
        new ChangeMessageVisibilityCommand({
          QueueUrl: this.sqs.wagerQueueUrl,
          ReceiptHandle: message.ReceiptHandle,
          VisibilityTimeout: Math.min(300, 2 ** receiveCount),
        }),
      );
    }
  }

  private async poll() {
    while (this.running) {
      try {
        const result = await this.sqs.client.send(
          new ReceiveMessageCommand({
            QueueUrl: this.sqs.wagerQueueUrl,
            WaitTimeSeconds: 10,
            MaxNumberOfMessages: 10,
            MessageSystemAttributeNames: ["ApproximateReceiveCount"],
          }),
        );
        for (const message of result.Messages ?? [])
          await this.processMessage(message);
      } catch {
        if (this.running) {
          this.metrics.retries.inc({ subsystem: "sqs_poll" });
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    }
  }

  private async ack(message: Message) {
    if (message.ReceiptHandle)
      await this.sqs.client.send(
        new DeleteMessageCommand({
          QueueUrl: this.sqs.wagerQueueUrl,
          ReceiptHandle: message.ReceiptHandle,
        }),
      );
  }

  private parse(body: string): WagerEnvelope {
    let value: unknown;
    try {
      value = JSON.parse(body);
    } catch {
      throw new PermanentMessageError("Invalid JSON");
    }
    if (!value || typeof value !== "object")
      throw new PermanentMessageError("Invalid envelope");
    const candidate = value as Record<string, unknown>;
    if (
      typeof candidate.messageId !== "string" ||
      candidate.type !== "WagerTransactionRequested" ||
      typeof candidate.occurredAt !== "string" ||
      !this.isIsoDate(candidate.occurredAt) ||
      !candidate.data ||
      typeof candidate.data !== "object"
    )
      throw new PermanentMessageError("Invalid envelope");
    const data = candidate.data as Record<string, unknown>;
    if (
      typeof data.providerId !== "string" ||
      typeof data.externalTransactionId !== "string" ||
      typeof data.idempotencyKey !== "string" ||
      typeof data.playerId !== "string" ||
      !this.isUuid(data.playerId) ||
      typeof data.walletId !== "string" ||
      !this.isUuid(data.walletId) ||
      typeof data.roundId !== "string" ||
      typeof data.gameId !== "string" ||
      !Object.values(WagerTransactionKind).includes(
        data.kind as WagerTransactionKind,
      ) ||
      data.kind === WagerTransactionKind.Opening ||
      !data.money ||
      typeof data.money !== "object" ||
      !this.isMoney(data.money) ||
      (data.referenceExternalTransactionId !== undefined &&
        typeof data.referenceExternalTransactionId !== "string") ||
      ((data.kind === WagerTransactionKind.Refund ||
        data.kind === WagerTransactionKind.Rollback) &&
        typeof data.referenceExternalTransactionId !== "string")
    )
      throw new PermanentMessageError("Invalid transaction data");
    return value as WagerEnvelope;
  }

  private isMoney(value: object): boolean {
    const money = value as Record<string, unknown>;
    return (
      typeof money.amount === "string" &&
      /^(0|[1-9]\d*)\.\d{2}$/.test(money.amount) &&
      typeof money.currency === "string" &&
      /^[A-Z]{3}$/.test(money.currency)
    );
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );
  }

  private isIsoDate(value: string): boolean {
    const date = new Date(value);
    return !Number.isNaN(date.getTime()) && date.toISOString() === value;
  }
}

class PermanentMessageError extends Error {}
