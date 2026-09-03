import { Injectable } from "@nestjs/common";
import {
  SQSClient,
  GetQueueAttributesCommand,
  SendMessageCommand,
} from "@aws-sdk/client-sqs";

@Injectable()
export class SqsClientService {
  readonly wagerQueueUrl =
    process.env.WAGER_QUEUE_URL ??
    "http://localhost:4566/000000000000/wager-transactions.fifo";
  readonly wagerDlqUrl =
    process.env.WAGER_DLQ_URL ??
    "http://localhost:4566/000000000000/wager-transactions-dlq.fifo";
  readonly eventQueueUrl =
    process.env.EVENT_QUEUE_URL ??
    "http://localhost:4566/000000000000/wager-events.fifo";
  readonly client = new SQSClient({
    region: process.env.AWS_REGION ?? "us-east-1",
    endpoint: process.env.AWS_ENDPOINT ?? "http://127.0.0.1:4566",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "test",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "test",
    },
  });

  async ready() {
    await Promise.all([
      this.attributes(this.wagerQueueUrl),
      this.attributes(this.eventQueueUrl),
    ]);
  }

  async publish(payload: Record<string, unknown>, groupId: string) {
    await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.eventQueueUrl,
        MessageBody: JSON.stringify(payload),
        MessageGroupId: groupId,
        MessageDeduplicationId: String(payload.eventId),
      }),
    );
  }

  async sendToDlq(body: string, messageId: string) {
    await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.wagerDlqUrl,
        MessageBody: body,
        MessageGroupId: "permanent-failures",
        MessageDeduplicationId: `${messageId}:${Date.now()}`,
      }),
    );
  }

  private async attributes(queueUrl: string) {
    await this.client.send(
      new GetQueueAttributesCommand({
        QueueUrl: queueUrl,
        AttributeNames: ["QueueArn"],
      }),
    );
  }
}
