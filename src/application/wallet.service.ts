import { Injectable } from "@nestjs/common";
import Decimal from "decimal.js";
import { PersistencePort, PersistenceTransaction } from "./persistence.port";
import { InvalidRequestError, NotFoundError } from "../domain/errors";
import {
  IntegrationEvent,
  WalletBalanceChanged,
  WagerTransactionProcessed,
} from "../domain/integration-event";
import { WalletLedgerEntry } from "../domain/ledger";
import { OutboxMessage } from "../domain/messages";
import { Money, MoneyProps } from "../domain/money";
import {
  LedgerDirection,
  WagerTransaction,
  WagerTransactionKind,
} from "../domain/wager-transaction";
import { Wallet } from "../domain/wallet";
import { MetricsService } from "../observability";

@Injectable()
export class WalletService {
  constructor(
    private readonly persistence: PersistencePort,
    private readonly metrics: MetricsService,
  ) {}

  async create(playerId: string, initial: MoneyProps) {
    const money = Money.from(initial);
    return this.persistence.transactional(async (store) => {
      const wallet = Wallet.open({ playerId, initialBalance: money });
      await store.addWallet(wallet);
      if (money.isPositive()) await this.createOpening(store, wallet, money);
      return this.walletView(wallet);
    });
  }

  async get(id: string) {
    const wallet = await this.persistence.findWallet(id);
    if (!wallet) throw new NotFoundError("Wallet not found");
    return this.walletView(wallet);
  }

  async ledger(id: string, cursor?: string, limit = 50) {
    await this.get(id);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new InvalidRequestError("Ledger limit must be between 1 and 100");
    const decoded = cursor ? this.decodeCursor(cursor) : undefined;
    const entries = await this.persistence.listLedger(
      id,
      decoded,
      limit,
    );
    const last = entries.at(-1);
    return {
      items: entries.map((entry) => ({
        id: entry.id,
        transactionId: entry.transactionId,
        direction: entry.direction,
        money: entry.money.toJSON(),
        balanceBefore: entry.balanceBefore.toJSON(),
        balanceAfter: entry.balanceAfter.toJSON(),
        createdAt: entry.createdAt,
      })),
      nextCursor: last
        ? Buffer.from(`${last.createdAt.toISOString()}|${last.id}`).toString(
            "base64url",
          )
        : undefined,
    };
  }

  private decodeCursor(cursor: string) {
    if (!/^[A-Za-z0-9_-]+$/.test(cursor))
      throw new InvalidRequestError("Invalid ledger cursor");
    const parts = Buffer.from(cursor, "base64url").toString().split("|");
    const createdAt = new Date(parts[0] ?? "");
    const id = parts[1] ?? "";
    if (
      parts.length !== 2 ||
      Number.isNaN(createdAt.getTime()) ||
      createdAt.toISOString() !== parts[0] ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        id,
      )
    )
      throw new InvalidRequestError("Invalid ledger cursor");
    return { createdAt, id };
  }

  async reconcile(id: string) {
    const wallet = await this.get(id);
    const entries = await this.persistence.listLedger(id);
    const calculated = entries
      .reduce(
        (balance, entry) =>
          entry.direction === LedgerDirection.Credit
            ? balance.plus(entry.money.toString())
            : balance.minus(entry.money.toString()),
        new Decimal(0),
      )
      .toFixed(2);
    const difference = new Decimal(wallet.balance.amount)
      .minus(calculated)
      .toFixed(2);
    const consistent = difference === "0.00";
    if (!consistent) {
      this.metrics.reconciliationDivergences.inc();
      process.stderr.write(
        `${JSON.stringify({
          level: "error",
          event: "wallet_reconciliation_divergence",
          walletId: id,
        })}\n`,
      );
    }
    return {
      walletId: id,
      storedBalance: wallet.balance,
      calculatedBalance: {
        amount: calculated,
        currency: wallet.balance.currency,
      },
      difference: { amount: difference, currency: wallet.balance.currency },
      consistent,
      checkedEntries: entries.length,
    };
  }

  private async createOpening(
    store: PersistenceTransaction,
    wallet: Wallet,
    money: Money,
  ): Promise<void> {
    const now = new Date();
    const opening = WagerTransaction.create({
      providerId: "internal",
      externalTransactionId: `opening:${wallet.id}`,
      idempotencyKey: `opening:${wallet.id}`,
      payloadHash: "0".repeat(64),
      walletId: wallet.id,
      playerId: wallet.playerId,
      roundId: "opening",
      gameId: "opening",
      kind: WagerTransactionKind.Opening,
      money,
      referenceExternalTransactionId: undefined,
    });
    opening.markProcessed(undefined, now);
    await store.addTransaction(opening);
    await store.saveTransaction({
      transaction: opening,
      resultingBalance: money,
      pendingAttempts: 0,
    });

    const entry = WalletLedgerEntry.create({
      walletId: wallet.id,
      transactionId: opening.id,
      direction: LedgerDirection.Credit,
      money,
      balanceBefore: Money.zero(money.currency),
      balanceAfter: money,
      createdAt: now,
    });
    store.addLedger(entry);
    this.enqueue(
      store,
      WalletBalanceChanged.create(
        wallet.id,
        {
          walletId: wallet.id,
          transactionId: opening.id,
          direction: LedgerDirection.Credit,
          money: money.toJSON(),
          balanceBefore: Money.zero(money.currency).toJSON(),
          balanceAfter: money.toJSON(),
          walletVersion: 1,
        },
        {
          correlationId: wallet.id,
          causationId: opening.id,
          occurredAt: now,
        },
      ),
    );
    this.enqueue(
      store,
      WagerTransactionProcessed.create(
        wallet.id,
        {
          transactionId: opening.id,
          status: opening.status,
        },
        {
          correlationId: wallet.id,
          causationId: opening.id,
          occurredAt: now,
        },
      ),
    );
  }

  private enqueue(
    store: PersistenceTransaction,
    event: IntegrationEvent<unknown>,
  ): void {
    store.enqueue(OutboxMessage.enqueue(event));
  }

  private walletView(wallet: Wallet) {
    return {
      id: wallet.id,
      playerId: wallet.playerId,
      balance: wallet.balance.toJSON(),
      version: wallet.version,
    };
  }
}
