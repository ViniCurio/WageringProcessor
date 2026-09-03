import { Controller, Get, Injectable, LoggerService } from "@nestjs/common";
import { Counter, Gauge, Histogram, register } from "prom-client";

@Injectable()
export class JsonLogger implements LoggerService {
  log(message: unknown, context?: string) {
    this.write("info", message, context);
  }

  error(message: unknown, trace?: string, context?: string) {
    this.write("error", message, context, { trace });
  }

  warn(message: unknown, context?: string) {
    this.write("warn", message, context);
  }

  debug(message: unknown, context?: string) {
    this.write("debug", message, context);
  }

  verbose(message: unknown, context?: string) {
    this.write("trace", message, context);
  }

  private write(
    level: string,
    message: unknown,
    context?: string,
    extra: Record<string, unknown> = {},
  ) {
    const fields =
      message instanceof Error
        ? { message: message.message, name: message.name }
        : message !== null && typeof message === "object"
          ? Object.fromEntries(Object.entries(message))
          : { message };
    process.stdout.write(
      `${JSON.stringify({ ...fields, level, time: new Date().toISOString(), context, ...extra })}\n`,
    );
  }
}

@Injectable()
export class MetricsService {
  readonly transactions = new Counter({
    name: "wager_transactions_total",
    help: "Transactions by final or pending status",
    labelNames: ["status"],
  });

  readonly duplicates = new Counter({
    name: "wager_duplicates_total",
    help: "Idempotent duplicate requests detected",
  });

  readonly retries = new Counter({
    name: "wager_retries_total",
    help: "Retries by subsystem",
    labelNames: ["subsystem"],
  });

  readonly dlq = new Counter({
    name: "wager_dlq_messages_total",
    help: "Messages explicitly sent to the DLQ",
    labelNames: ["reason"],
  });

  readonly lockConflicts = new Counter({
    name: "wager_lock_conflicts_total",
    help: "Database lock/deadlock conflicts",
  });

  readonly outboxLag = new Gauge({
    name: "wager_outbox_lag_seconds",
    help: "Age of the oldest due outbox message",
  });

  readonly processingLatency = new Histogram({
    name: "wager_processing_duration_seconds",
    help: "Transaction processing latency",
    labelNames: ["source"],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  });

  readonly reconciliationDivergences = new Counter({
    name: "wager_reconciliation_divergences_total",
    help: "Wallet reconciliation divergences",
  });
}

@Controller("metrics")
export class MetricsController {
  @Get() async get() {
    return register.metrics();
  }
}
