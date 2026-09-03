import { MikroORM } from "@mikro-orm/postgresql";
import { Logger } from "@nestjs/common";
import { ReceiveMessageCommand } from "@aws-sdk/client-sqs";
import config from "../../mikro-orm.config";
import { canonicalHash } from "../../src/application/canonical-hash";
import type { SubmitTransactionCommand } from "../../src/application/contracts";
import { WageringService } from "../../src/application/wagering.service";
import { MikroOrmPersistenceAdapter } from "../../src/infrastructure/database/persistence.adapter";
import { SqsClientService } from "../../src/infrastructure/messaging/sqs.service";
import { MetricsService } from "../../src/observability";

interface Envelope {
  messageId: string;
  type: "WagerTransactionRequested";
  occurredAt: string;
  data: Omit<SubmitTransactionCommand, "correlationId" | "inbox">;
}

Logger.overrideLogger(false);
async function main() {
  const orm = await MikroORM.init(config);
  try {
    const sqs = new SqsClientService();
    const delivery = await sqs.client.send(new ReceiveMessageCommand({
    QueueUrl: sqs.wagerQueueUrl,
    WaitTimeSeconds: 2,
    MaxNumberOfMessages: 1,
  }));
    const message = delivery.Messages?.[0];
    if (!message?.Body || !message.ReceiptHandle)
      throw new Error("No SQS message received");
    const envelope = JSON.parse(message.Body) as Envelope;
    await new WageringService(
      new MikroOrmPersistenceAdapter(orm.em),
      new MetricsService(),
    ).execute({
    ...envelope.data,
    correlationId: envelope.messageId,
    inbox: {
      consumerName: "wager-processor",
      messageId: envelope.messageId,
      payloadHash: canonicalHash(envelope),
    },
    });
    process.stdout.write(message.ReceiptHandle);
  } finally {
    await orm.close();
  }
}

void main();
