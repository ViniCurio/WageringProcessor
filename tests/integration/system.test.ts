import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  setDefaultTimeout,
  test,
} from "bun:test";
import { MikroORM } from "@mikro-orm/postgresql";
import { Logger } from "@nestjs/common";
import {
  ChangeMessageVisibilityCommand,
  CreateQueueCommand,
  DeleteQueueCommand,
  DeleteMessageCommand,
  PurgeQueueCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
} from "@aws-sdk/client-sqs";
import config from "../../mikro-orm.config";
import { WalletService } from "../../src/application/wallet.service";
import { PendingReferenceService } from "../../src/application/pending-reference.service";
import { WageringService } from "../../src/application/wagering.service";
import {
  WagerTransactionKind,
  WagerTransactionStatus,
} from "../../src/domain/wager-transaction";
import { FailureCode } from "../../src/domain/errors";
import { MetricsService } from "../../src/observability";
import { OutboxWorker, WagerConsumer } from "../../src/infrastructure/workers";
import { SqsClientService } from "../../src/infrastructure/messaging/sqs.service";
import { MikroOrmPersistenceAdapter } from "../../src/infrastructure/database/persistence.adapter";

process.env.WAGER_QUEUE_URL =
  "http://localhost:4566/000000000000/wager-transactions-test.fifo";
process.env.WAGER_DLQ_URL =
  "http://localhost:4566/000000000000/wager-transactions-test-dlq.fifo";
process.env.EVENT_QUEUE_URL =
  "http://localhost:4566/000000000000/wager-events-test.fifo";
const testConfig = {
  ...config,
  clientUrl: "postgresql://wager:wager@127.0.0.1:5432/wagering_test",
};
const metrics = new MetricsService();
setDefaultTimeout(30000);
Logger.overrideLogger(false);
const sqs = new SqsClientService();
let orms: MikroORM[] = [];
const services: WageringService[] = [];
const pendingServices: PendingReferenceService[] = [];
let wallets: WalletService;
type AppProcess = ReturnType<typeof Bun.spawn>;
const apps: Array<{ port: number; process: AppProcess }> = [];

async function startApp(port: number, enableWorkers = false) {
  const child = Bun.spawn([process.execPath, "src/main.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_URL: testConfig.clientUrl,
      ENABLE_WORKERS: String(enableWorkers),
    },
    stdout: "ignore",
    stderr: "ignore",
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/health/ready`)).ok)
        return child;
    } catch {}
    await Bun.sleep(100);
  }
  child.kill();
  throw new Error(`Application on port ${port} did not become ready`);
}

async function stopApp(child: AppProcess) {
  child.kill();
  await child.exited;
}

async function httpWager(port: number, command: ReturnType<typeof bet>) {
  const { idempotencyKey, correlationId, ...body } = command;
  return fetch(`http://127.0.0.1:${port}/wagering/transactions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": idempotencyKey,
      "x-correlation-id": correlationId,
    },
    body: JSON.stringify(body),
  });
}

async function httpWallet(port: number, amount = "100.00") {
  const response = await fetch(`http://127.0.0.1:${port}/wallets`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      playerId: crypto.randomUUID(),
      initialBalance: { amount, currency: "BRL" },
    }),
  });
  if (response.status !== 201)
    throw new Error(`Wallet creation failed with HTTP ${response.status}`);
  return response.json() as Promise<{ id: string; playerId: string }>;
}

async function receiveAndAckEvents(expected: number) {
  const bodies: string[] = [];
  for (let attempt = 0; attempt < expected; attempt++) {
    const result = await sqs.client.send(
      new ReceiveMessageCommand({
        QueueUrl: sqs.eventQueueUrl,
        WaitTimeSeconds: 5,
        MaxNumberOfMessages: 1,
      }),
    );
    const message = result.Messages?.[0];
    if (!message?.ReceiptHandle) break;
    bodies.push(message.Body ?? "");
    await sqs.client.send(
      new DeleteMessageCommand({
        QueueUrl: sqs.eventQueueUrl,
        ReceiptHandle: message.ReceiptHandle,
      }),
    );
  }
  return bodies;
}

async function ensureTestDatabase() {
  const admin = await MikroORM.init(config);
  const rows = await admin.em
    .getConnection()
    .execute<
      Array<{ exists: boolean }>
    >(`select exists(select 1 from pg_database where datname='wagering_test')`);
  if (!rows[0]?.exists)
    await admin.em.getConnection().execute("create database wagering_test");
  await admin.close();
}
async function ensureTestQueues() {
  for (const QueueName of [
    "wager-transactions-test.fifo",
    "wager-transactions-test-dlq.fifo",
    "wager-events-test.fifo",
  ])
    await sqs.client.send(
      new CreateQueueCommand({
        QueueName,
        Attributes: { FifoQueue: "true", ContentBasedDeduplication: "true" },
      }),
    );
}
async function newOrm() {
  const orm = await MikroORM.init(testConfig);
  orms.push(orm);
  return orm;
}
async function resetDatabase() {
  await orms[0]!.em
    .getConnection()
    .execute(
      "truncate table outbox_messages,inbox_messages,wallet_ledger_entries,wager_transactions,wallets restart identity cascade",
    );
}
async function purgeQueues() {
  for (const QueueUrl of [
    sqs.wagerQueueUrl,
    sqs.wagerDlqUrl,
    sqs.eventQueueUrl,
  ]) {
    try {
      await sqs.client.send(new PurgeQueueCommand({ QueueUrl }));
    } catch {}
  }
}
async function openWallet(amount = "100.00") {
  return wallets.create(crypto.randomUUID(), { amount, currency: "BRL" });
}

function bet(
  wallet: { id: string; playerId: string },
  suffix: string,
  amount = "10.00",
) {
  return {
    providerId: "provider-a",
    externalTransactionId: `bet-${suffix}`,
    idempotencyKey: `provider-a:bet-${suffix}`,
    playerId: wallet.playerId,
    walletId: wallet.id,
    roundId: `round-${suffix}`,
    gameId: "game",
    kind: WagerTransactionKind.Bet,
    money: { amount, currency: "BRL" },
    correlationId: `correlation-${suffix}`,
  };
}

describe.serial(
  "distributed guarantees with real PostgreSQL and LocalStack",
  () => {
    beforeAll(async () => {
      await ensureTestDatabase();
      await ensureTestQueues();
      const first = await newOrm();
      await first.getMigrator().up();
      wallets = new WalletService(
        new MikroOrmPersistenceAdapter(first.em),
        metrics,
      );
      const firstPersistence = new MikroOrmPersistenceAdapter(first.em);
      services.push(new WageringService(firstPersistence, metrics));
      pendingServices.push(new PendingReferenceService(firstPersistence, metrics));
      for (let index = 0; index < 2; index++) {
        const orm = await newOrm();
        const persistence = new MikroOrmPersistenceAdapter(orm.em);
        services.push(new WageringService(persistence, metrics));
        pendingServices.push(new PendingReferenceService(persistence, metrics));
      }
      await sqs.ready();
      for (const port of [3101, 3102, 3103])
        apps.push({ port, process: await startApp(port) });
    });
    beforeEach(async () => {
      await resetDatabase();
      await purgeQueues();
    });
    afterEach(async () => {
      const divergences = await orms[0]!.em
        .getConnection()
        .execute<
          Array<{ id: string }>
        >(`select w.id from wallets w left join wallet_ledger_entries l on l.wallet_id=w.id group by w.id,w.balance having w.balance<>coalesce(sum(case when l.direction='CREDIT' then l.amount else -l.amount end),0)`);
      expect(divergences).toHaveLength(0);
    });
    afterAll(async () => {
      for (const app of apps) await stopApp(app.process);
      for (const orm of orms) await orm.close();
    });

    test("migrations enforce non-negative balance and unique wallet", async () => {
      const player = crypto.randomUUID();
      await expect(
        orms[0]!.em
          .getConnection()
          .execute(
            `insert into wallets(id,player_id,currency,balance,version,created_at,updated_at) values (?,?, 'BRL',-1,1,now(),now())`,
            [crypto.randomUUID(), player],
          ),
      ).rejects.toThrow();
      await orms[0]!.em
        .getConnection()
        .execute(
          `insert into wallets(id,player_id,currency,balance,version,created_at,updated_at) values (?,?, 'BRL',0,1,now(),now())`,
          [crypto.randomUUID(), player],
        );
      await expect(
        orms[0]!.em
          .getConnection()
          .execute(
            `insert into wallets(id,player_id,currency,balance,version,created_at,updated_at) values (?,?, 'BRL',0,1,now(),now())`,
            [crypto.randomUUID(), player],
          ),
      ).rejects.toThrow();
    });

    test("a failed SQL transaction rolls back wallet, ledger, inbox and outbox together", async () => {
      const walletId = crypto.randomUUID(),
        playerId = crypto.randomUUID(),
        transactionId = crypto.randomUUID(),
        eventId = crypto.randomUUID();
      await expect(
        orms[0]!.em.getConnection().transactional(async (transaction) => {
          await transaction.raw(
            `insert into wallets(id,player_id,currency,balance,version,created_at,updated_at) values (?,?, 'BRL',100,1,now(),now())`,
            [walletId, playerId],
          );
          await transaction.raw(
            `insert into wager_transactions(id,provider_id,external_transaction_id,idempotency_key,payload_hash,wallet_id,player_id,round_id,game_id,kind,amount,currency,status,resulting_balance,created_at) values (?, 'provider','external','key',?, ?,?,'round','game','BET',10,'BRL','PROCESSED',90,now())`,
            [transactionId, "a".repeat(64), walletId, playerId],
          );
          await transaction.raw(
            `insert into inbox_messages(consumer_name,message_id,payload_hash,received_at,processed_at) values ('consumer','message',?,now(),now())`,
            ["b".repeat(64)],
          );
          await transaction.raw(
            `insert into outbox_messages(id,aggregate_id,event_type,payload,occurred_at) values (?,?,'event','{}',now())`,
            [eventId, walletId],
          );
          await transaction.raw(
            `insert into wallet_ledger_entries(id,wallet_id,transaction_id,direction,amount,currency,balance_before,balance_after,created_at) values (?,?,?,'DEBIT',10,'BRL',100,95,now())`,
            [crypto.randomUUID(), walletId, transactionId],
          );
        }),
      ).rejects.toThrow();
      const [counts] = await orms[0]!.em
        .getConnection()
        .execute<
          Array<{ wallet: string; inbox: string; outbox: string }>
        >(`select (select count(*) from wallets where id=?) wallet,(select count(*) from inbox_messages where message_id='message') inbox,(select count(*) from outbox_messages where id=?) outbox`, [walletId, eventId]);
      expect(
        Number(counts!.wallet) + Number(counts!.inbox) + Number(counts!.outbox),
      ).toBe(0);
    });

    test("ledger rows are structurally immutable", async () => {
      const wallet = await openWallet();
      await expect(
        orms[0]!.em
          .getConnection()
          .execute(
            "update wallet_ledger_entries set amount=1 where wallet_id=?",
            [wallet.id],
          ),
      ).rejects.toThrow("immutable");
    });

    test("50 HTTP duplicates across three application processes produce one debit", async () => {
      const wallet = await openWallet();
      const command = bet(wallet, crypto.randomUUID(), "25.00");
      const responses = await Promise.all(
        Array.from({ length: 50 }, (_, index) =>
          httpWager(apps[index % 3]!.port, command),
        ),
      );
      expect(responses.every((response) => response.status === 200)).toBeTrue();
      const results = await Promise.all(responses.map((response) => response.json())) as Array<{ idempotentReplay: boolean; transactionId: string }>;
      expect(results.filter((result) => !result.idempotentReplay)).toHaveLength(
        1,
      );
      expect(new Set(results.map((result) => result.transactionId)).size).toBe(
        1,
      );
      const [stored] = await orms[0]!.em
        .getConnection()
        .execute<
          Array<{ balance: string }>
        >("select balance from wallets where id=?", [wallet.id]);
      const [ledger] = await orms[0]!.em
        .getConnection()
        .execute<
          Array<{ count: string }>
        >(`select count(*) from wallet_ledger_entries where wallet_id=? and direction='DEBIT'`, [wallet.id]);
      expect(stored!.balance).toBe("75.00");
      expect(Number(ledger!.count)).toBe(1);
    });

    test("two simultaneous bets of 80 over 100 have one winner", async () => {
      const wallet = await openWallet();
      const [first, second] = await Promise.all([
        services[0]!.execute(bet(wallet, "race-a", "80.00")),
        services[1]!.execute(bet(wallet, "race-b", "80.00")),
      ]);
      expect([first.status, second.status].sort()).toEqual(
        [
          WagerTransactionStatus.Processed,
          WagerTransactionStatus.Rejected,
        ].sort(),
      );
      const [stored] = await orms[0]!.em
        .getConnection()
        .execute<
          Array<{ balance: string }>
        >("select balance from wallets where id=?", [wallet.id]);
      const [ledger] = await orms[0]!.em
        .getConnection()
        .execute<
          Array<{ count: string }>
        >(`select count(*) from wallet_ledger_entries where wallet_id=? and direction='DEBIT'`, [wallet.id]);
      expect(stored!.balance).toBe("20.00");
      expect(Number(ledger!.count)).toBe(1);
    });

    test("different wallets process concurrently without shared lock", async () => {
      const walletList = await Promise.all([
        openWallet(),
        openWallet(),
        openWallet(),
      ]);
      const results = await Promise.all(
        walletList.map((wallet, index) =>
          services[index]!.execute(bet(wallet, `parallel-${index}`, "10.00")),
        ),
      );
      expect(
        results.every(
          (result) => result.status === WagerTransactionStatus.Processed,
        ),
      ).toBeTrue();
      const balances = await orms[0]!.em
        .getConnection()
        .execute<
          Array<{ balance: string }>
        >("select balance from wallets order by id");
      expect(balances.every((row) => row.balance === "90.00")).toBeTrue();
    });

    test("wallet, ledger, inbox and outbox commit atomically and redelivery is harmless", async () => {
      const wallet = await openWallet();
      const base = bet(wallet, "inbox", "30.00");
      const command = {
        ...base,
        inbox: {
          consumerName: "test-consumer",
          messageId: "message-1",
          payloadHash: "a".repeat(64),
        },
      };
      const first = await services[0]!.execute(command);
      const replay = await services[1]!.execute(command);
      expect(first.idempotentReplay).toBeFalse();
      expect(replay.idempotentReplay).toBeTrue();
      const [counts] = await orms[0]!.em
        .getConnection()
        .execute<
          Array<{ ledger: string; inbox: string; outbox: string }>
        >(`select (select count(*) from wallet_ledger_entries where transaction_id=?) ledger,(select count(*) from inbox_messages where message_id='message-1') inbox,(select count(*) from outbox_messages where aggregate_id=?) outbox`, [first.transactionId, wallet.id]);
      expect(Number(counts!.ledger)).toBe(1);
      expect(Number(counts!.inbox)).toBe(1);
      expect(Number(counts!.outbox)).toBeGreaterThanOrEqual(3);
    });

    test("concurrent outbox publishers claim disjoint leases and recover expired lease", async () => {
      await openWallet();
      const publisherA = new OutboxWorker(orms[0]!.em, sqs, metrics);
      const publisherB = new OutboxWorker(orms[1]!.em, sqs, metrics);
      const [a, b] = await Promise.all([
        publisherA.claim(20),
        publisherB.claim(20),
      ]);
      expect(a.length + b.length).toBe(2);
      expect(
        a.some((left) => b.some((right) => left.id === right.id)),
      ).toBeFalse();
      await orms[0]!.em
        .getConnection()
        .execute(
          `update outbox_messages set locked_until=now()-interval '1 second'`,
        );
      const recovered = await new OutboxWorker(orms[2]!.em, sqs, metrics).claim(
        20,
      );
      expect(recovered).toHaveLength(2);
    });

    test("commit before publish survives restart and another publisher emits the event", async () => {
      const stopped = apps[2]!;
      const wallet = await httpWallet(stopped.port);
      await stopApp(stopped.process);
      const [beforeRestart] = await orms[0]!.em
        .getConnection()
        .execute<Array<{ count: string }>>(
          "select count(*) from outbox_messages where published_at is null",
        );
      expect(Number(beforeRestart!.count)).toBe(2);

      const replacement = await startApp(3199, true);
      try {
        expect(await receiveAndAckEvents(2)).toHaveLength(2);
        let pending: { count: string } | undefined;
        for (let attempt = 0; attempt < 20; attempt++) {
          [pending] = await orms[0]!.em
            .getConnection()
            .execute<Array<{ count: string }>>(
              "select count(*) from outbox_messages where published_at is null",
            );
          if (Number(pending!.count) === 0) break;
          await Bun.sleep(100);
        }
        expect(Number(pending!.count)).toBe(0);
      } finally {
        await stopApp(replacement);
      }
      stopped.process = await startApp(stopped.port);

      const [consistent] = await orms[0]!.em
        .getConnection()
        .execute<Array<{ balance: string; ledger_balance: string }>>(
          `select w.balance,coalesce(sum(case when l.direction='CREDIT' then l.amount else -l.amount end),0) ledger_balance from wallets w left join wallet_ledger_entries l on l.wallet_id=w.id where w.id=? group by w.id,w.balance`,
          [wallet.id],
        );
      expect(consistent!.balance).toBe(consistent!.ledger_balance);
    });

    test("refund delivered before its bet is reprocessed after the reference appears", async () => {
      const wallet = await openWallet();
      const referenceId = `late-${crypto.randomUUID()}`;
      const refund = {
        providerId: "provider-a",
        externalTransactionId: `refund-${referenceId}`,
        idempotencyKey: `provider-a:refund-${referenceId}`,
        playerId: wallet.playerId,
        walletId: wallet.id,
        roundId: "late-round",
        gameId: "game",
        kind: WagerTransactionKind.Refund,
        money: { amount: "20.00", currency: "BRL" },
        referenceExternalTransactionId: referenceId,
        correlationId: "late-refund",
      };
      const pending = await services[0]!.execute(refund);
      expect(pending.status).toBe(WagerTransactionStatus.PendingReference);
      await services[1]!.execute({
        ...bet(wallet, referenceId, "20.00"),
        externalTransactionId: referenceId,
        idempotencyKey: `provider-a:${referenceId}`,
        roundId: "late-round",
      });
      await pendingServices[2]!.retry(pending.transactionId);
      const [transaction] = await orms[0]!.em
        .getConnection()
        .execute<
          Array<{ status: string }>
        >("select status from wager_transactions where id=?", [pending.transactionId]);
      const [stored] = await orms[0]!.em
        .getConnection()
        .execute<
          Array<{ balance: string }>
        >("select balance from wallets where id=?", [wallet.id]);
      expect(transaction!.status).toBe(WagerTransactionStatus.Processed);
      expect(stored!.balance).toBe("100.00");
    });

    test("missing reference is rejected after eight audited attempts", async () => {
      const wallet = await openWallet();
      const pending = await services[0]!.execute({
        ...bet(wallet, "never-arrives", "10.00"),
        kind: WagerTransactionKind.Rollback,
        referenceExternalTransactionId: "absent",
      });
      for (let attempt = 0; attempt < 8; attempt++)
        await pendingServices[attempt % 3]!.retry(pending.transactionId);
      const [row] = await orms[0]!.em
        .getConnection()
        .execute<
          Array<{ status: string; failure_code: string }>
        >("select status,failure_code from wager_transactions where id=?", [pending.transactionId]);
      const [event] = await orms[0]!.em
        .getConnection()
        .execute<
          Array<{ count: string }>
        >(`select count(*) from outbox_messages where aggregate_id=? and event_type='WagerTransactionRejected'`, [wallet.id]);
      expect(row!.status).toBe(WagerTransactionStatus.Rejected);
      expect(row!.failure_code).toBe(FailureCode.ReferenceNotFound);
      expect(Number(event!.count)).toBe(1);
    });

    test("REFUND without its required reference is a permanent SQS contract error sent to DLQ", async () => {
      const invalidEnvelope = JSON.stringify({
        messageId: `msg-${crypto.randomUUID()}`,
        type: "WagerTransactionRequested",
        occurredAt: new Date().toISOString(),
        data: {
          ...bet(
            { id: crypto.randomUUID(), playerId: crypto.randomUUID() },
            "refund-without-reference",
          ),
          kind: WagerTransactionKind.Refund,
        },
      });
      const consumer = new WagerConsumer(sqs, services[0]!, metrics);
      await consumer.processMessage({
        Body: invalidEnvelope,
        MessageId: crypto.randomUUID(),
        Attributes: { ApproximateReceiveCount: "1" },
      });
      const dlq = await sqs.client.send(
        new ReceiveMessageCommand({
          QueueUrl: sqs.wagerDlqUrl,
          WaitTimeSeconds: 2,
          MaxNumberOfMessages: 1,
        }),
      );
      expect(dlq.Messages?.[0]?.Body).toBe(invalidEnvelope);
    });

    test("worker crash after commit before ack is recovered by real SQS redelivery", async () => {
      const createdQueue = await sqs.client.send(
        new CreateQueueCommand({
          QueueName: `wager-crash-${crypto.randomUUID()}.fifo`,
          Attributes: {
            FifoQueue: "true",
            ContentBasedDeduplication: "true",
          },
        }),
      );
      const crashQueueUrl = createdQueue.QueueUrl!;
      const priorQueueUrl = process.env.WAGER_QUEUE_URL;
      process.env.WAGER_QUEUE_URL = crashQueueUrl;
      const crashSqs = new SqsClientService();
      process.env.WAGER_QUEUE_URL = priorQueueUrl;
      const wallet = await openWallet();
      const data = bet(wallet, "sqs-redelivery", "15.00");
      const envelope = {
        messageId: `msg-${crypto.randomUUID()}`,
        type: "WagerTransactionRequested" as const,
        occurredAt: new Date().toISOString(),
        data,
      };
      const body = JSON.stringify(envelope);
      await sqs.client.send(
        new SendMessageCommand({
          QueueUrl: crashQueueUrl,
          MessageBody: body,
          MessageGroupId: wallet.id,
          MessageDeduplicationId: crypto.randomUUID(),
        }),
      );
      const crashedWorker = Bun.spawn(
        [process.execPath, "tests/fixtures/consume-without-ack.ts"],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            DATABASE_URL: testConfig.clientUrl,
            WAGER_QUEUE_URL: crashQueueUrl,
          },
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      const [receiptHandle, crashExit] = await Promise.all([
        new Response(crashedWorker.stdout).text(),
        crashedWorker.exited,
      ]);
      expect(crashExit).toBe(0);
      expect(receiptHandle.length).toBeGreaterThan(0);
      await sqs.client.send(
        new ChangeMessageVisibilityCommand({
          QueueUrl: crashQueueUrl,
          ReceiptHandle: receiptHandle,
          VisibilityTimeout: 0,
        }),
      );
      const redelivery = await sqs.client.send(
        new ReceiveMessageCommand({
          QueueUrl: crashQueueUrl,
          WaitTimeSeconds: 2,
          MaxNumberOfMessages: 1,
          MessageSystemAttributeNames: ["ApproximateReceiveCount"],
        }),
      );
      await new WagerConsumer(crashSqs, services[1]!, metrics).processMessage(
        redelivery.Messages![0]!,
      );
      const [counts] = await orms[0]!.em
        .getConnection()
        .execute<
          Array<{ ledger: string; inbox: string }>
        >(`select (select count(*) from wallet_ledger_entries where wallet_id=? and direction='DEBIT') ledger,(select count(*) from inbox_messages where message_id=?) inbox`, [wallet.id, envelope.messageId]);
      expect(Number(counts!.ledger)).toBe(1);
      expect(Number(counts!.inbox)).toBe(1);
      await sqs.client.send(new DeleteQueueCommand({ QueueUrl: crashQueueUrl }));
    });

    test("transient infrastructure error retries with backoff before going to DLQ at the limit", async () => {
      const createdQueue = await sqs.client.send(
        new CreateQueueCommand({
          QueueName: `wager-retry-${crypto.randomUUID()}.fifo`,
          Attributes: {
            FifoQueue: "true",
            ContentBasedDeduplication: "true",
          },
        }),
      );
      const retryQueueUrl = createdQueue.QueueUrl!;
      const priorQueueUrl = process.env.WAGER_QUEUE_URL;
      process.env.WAGER_QUEUE_URL = retryQueueUrl;
      const retrySqs = new SqsClientService();
      process.env.WAGER_QUEUE_URL = priorQueueUrl;
      const wallet = await openWallet();
      const unavailableOrm = await MikroORM.init(testConfig);
      await unavailableOrm.close();
      const unavailableService = new WageringService(
        new MikroOrmPersistenceAdapter(unavailableOrm.em),
        metrics,
      );
      const missing = { ...bet(wallet, "database-unavailable"), correlationId: undefined };
      const envelope = {
        messageId: `msg-${crypto.randomUUID()}`,
        type: "WagerTransactionRequested",
        occurredAt: new Date().toISOString(),
        data: missing,
      };
      await sqs.client.send(
        new SendMessageCommand({
          QueueUrl: retryQueueUrl,
          MessageBody: JSON.stringify(envelope),
          MessageGroupId: "missing",
          MessageDeduplicationId: crypto.randomUUID(),
        }),
      );
      const received = await sqs.client.send(
        new ReceiveMessageCommand({
          QueueUrl: retryQueueUrl,
          WaitTimeSeconds: 2,
          MaxNumberOfMessages: 1,
          MessageSystemAttributeNames: ["ApproximateReceiveCount"],
        }),
      );
      await new WagerConsumer(retrySqs, unavailableService, metrics).processMessage(
        received.Messages![0]!,
      );
      const beforeLimit = await sqs.client.send(
        new ReceiveMessageCommand({
          QueueUrl: sqs.wagerDlqUrl,
          WaitTimeSeconds: 1,
          MaxNumberOfMessages: 1,
        }),
      );
      expect(beforeLimit.Messages ?? []).toHaveLength(0);

      received.Messages![0]!.Attributes = { ApproximateReceiveCount: "5" };
      await new WagerConsumer(retrySqs, unavailableService, metrics).processMessage(
        received.Messages![0]!,
      );
      const dlq = await sqs.client.send(
        new ReceiveMessageCommand({
          QueueUrl: sqs.wagerDlqUrl,
          WaitTimeSeconds: 2,
          MaxNumberOfMessages: 1,
        }),
      );
      expect(dlq.Messages?.[0]?.Body).toContain(envelope.messageId);
      await sqs.client.send(new DeleteQueueCommand({ QueueUrl: retryQueueUrl }));
    });

    test("all migrations are reversible and can be applied again", async () => {
      await orms[0]!.getMigrator().down({ to: 0 });
      const [removed] = await orms[0]!.em
        .getConnection()
        .execute<
          Array<{ table_name: string | null }>
        >(`select to_regclass('public.wallets')::text table_name`);
      expect(removed!.table_name).toBeNull();
      await orms[0]!.getMigrator().up();
      const [restored] = await orms[0]!.em
        .getConnection()
        .execute<
          Array<{ table_name: string | null }>
        >(`select to_regclass('public.wallets')::text table_name`);
      expect(restored!.table_name).toBe("wallets");
    });

  },
);
