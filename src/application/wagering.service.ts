import { Injectable, Logger } from "@nestjs/common";
import { canonicalHash } from "./canonical-hash";
import { SubmitTransactionCommand, TransactionResult } from "./contracts";
import {
  PersistencePort,
  PersistenceTransaction,
  StoredTransaction,
} from "./persistence.port";
import {
  FailureCode,
  IdempotencyConflictError,
  InsufficientFundsError,
  InvalidRequestError,
  NotFoundError,
} from "../domain/errors";
import {
  WagerTransactionPendingReference,
  WagerTransactionProcessed,
  WagerTransactionRejected,
  WalletBalanceChanged,
} from "../domain/integration-event";
import { WalletLedgerEntry } from "../domain/ledger";
import { InboxMessage } from "../domain/messages";
import { Money } from "../domain/money";
import {
  LedgerDirection,
  WagerTransaction,
  WagerTransactionKind,
} from "../domain/wager-transaction";
import { MetricsService } from "../observability";
import {
  enqueueWagerEvent,
  storedTransactionState,
  wagerEventData,
} from "./wagering.helpers";

@Injectable()
export class WageringService {
  private readonly logger = new Logger(WageringService.name);

  constructor(
    private readonly persistence: PersistencePort,
    private readonly metrics: MetricsService,
  ) {}

  async execute(command: SubmitTransactionCommand): Promise<TransactionResult> {
    if (
      (command.kind === WagerTransactionKind.Refund ||
        command.kind === WagerTransactionKind.Rollback) &&
      !command.referenceExternalTransactionId
    ) {
      throw new InvalidRequestError(
        "referenceExternalTransactionId is required for REFUND and ROLLBACK",
      );
    }
    const stop = this.metrics.processingLatency.startTimer({
      source: command.inbox ? "sqs" : "http",
    });
    const payloadHash = canonicalHash({
      providerId: command.providerId,
      externalTransactionId: command.externalTransactionId,
      playerId: command.playerId,
      walletId: command.walletId,
      roundId: command.roundId,
      gameId: command.gameId,
      kind: command.kind,
      money: command.money,
      referenceExternalTransactionId: command.referenceExternalTransactionId,
    });

    try {
      const result = await this.persistence.transactional(async (store) => {
        const replay = await store.findTransactionByIdempotencyKey(
          command.idempotencyKey,
        );
        if (replay) {
          if (command.inbox) {
            if (!replay.transaction.matchesPayload(payloadHash)) {
              throw new IdempotencyConflictError(
                "Idempotency key was used with another payload",
              );
            }
            await store.lockWallet(replay.transaction.walletId);
          }
          await this.recordReplayInbox(store, command);
          return this.replay(replay, payloadHash);
        }
        if (command.kind === WagerTransactionKind.Opening) {
          throw new InvalidRequestError("OPENING is internal");
        }
        if (command.inbox) {
          const prior = await store.findInbox(
            command.inbox.consumerName,
            command.inbox.messageId,
          );
          if (prior) {
            throw new IdempotencyConflictError(
              prior.payloadHash === command.inbox.payloadHash
                ? "Inbox message already processed with another idempotency key"
                : "Inbox message payload conflict",
            );
          }
        }

        const wallet = await store.lockWallet(command.walletId);
        if (!wallet) throw new NotFoundError("Wallet not found");

        const lockedReplay = await store.findTransactionByIdempotencyKey(
          command.idempotencyKey,
        );
        if (lockedReplay) {
          await this.recordReplayInbox(store, command);
          return this.replay(lockedReplay, payloadHash);
        }

        const transaction = WagerTransaction.create({
          ...command,
          payloadHash,
          money: Money.from(command.money),
        });
        await store.addTransaction(transaction);

        if (command.inbox) {
          const inbox = InboxMessage.receive(command.inbox);
          inbox.markProcessed(new Date());
          store.addInbox(inbox);
        }

        if (
          wallet.playerId !== transaction.playerId ||
          wallet.currency !== transaction.money.currency
        ) {
          transaction.reject(
            wallet.currency !== transaction.money.currency
              ? FailureCode.CurrencyMismatch
              : FailureCode.InvalidPayload,
          );
          return this.reject(
            store,
            transaction,
            wallet.balance,
            command.correlationId,
          );
        }

        if (
          transaction.kind !== WagerTransactionKind.Loss &&
          transaction.money.isZero()
        ) {
          transaction.reject(FailureCode.InvalidPayload);
          return this.reject(
            store,
            transaction,
            wallet.balance,
            command.correlationId,
          );
        }

        let reference: WagerTransaction | undefined;
        if (
          transaction.requiresReference() ||
          (transaction.kind === WagerTransactionKind.Win &&
            transaction.referenceExternalTransactionId)
        ) {
          const storedReference = await store.findTransactionByExternalId(
            transaction.providerId,
            transaction.referenceExternalTransactionId!,
          );
          reference = storedReference?.transaction;
          if (!reference) {
            transaction.markPendingReference();
            const state = storedTransactionState(
              transaction,
              wallet.balance,
              0,
              new Date(Date.now() + 1_000),
            );
            await store.saveTransaction(state);
            enqueueWagerEvent(
              store,
              WagerTransactionPendingReference.create(
                transaction.walletId,
                wagerEventData(transaction),
                {
                  correlationId: command.correlationId,
                  causationId: transaction.id,
                },
              ),
            );
            this.metrics.transactions.inc({ status: transaction.status });
            return this.result(state, false);
          }

          const failure = transaction.validateReference(reference);
          if (failure) {
            transaction.reject(failure, reference.id);
            return this.reject(
              store,
              transaction,
              wallet.balance,
              command.correlationId,
            );
          }

          if (transaction.requiresReference()) {
            const reversal = await store.findProcessedReversal(
              reference.id,
              transaction.kind,
            );
            if (reversal) {
              transaction.reject(
                FailureCode.ReferenceAlreadyReversed,
                reference.id,
              );
              return this.reject(
                store,
                transaction,
                wallet.balance,
                command.correlationId,
              );
            }
          }
        }

        let movement: { before: Money; after: Money } | undefined;
        let direction: LedgerDirection | undefined;
        try {
          if (transaction.affectsBalance()) {
            direction = transaction.ledgerDirectionFor(reference);
            movement =
              direction === LedgerDirection.Credit
                ? wallet.credit(transaction.money)
                : wallet.debit(transaction.money);
          }
        } catch (error) {
          if (error instanceof InsufficientFundsError) {
            transaction.reject(
              transaction.kind === WagerTransactionKind.Rollback
                ? FailureCode.ReversalInsufficientFunds
                : FailureCode.InsufficientFunds,
            );
            return this.reject(
              store,
              transaction,
              wallet.balance,
              command.correlationId,
            );
          }
          throw error;
        }

        transaction.markProcessed(reference?.id, new Date());
        const state = storedTransactionState(transaction, wallet.balance);
        await store.saveTransaction(state);

        if (movement && direction) {
          await store.saveWallet(wallet);
          const entry = WalletLedgerEntry.create({
            walletId: wallet.id,
            transactionId: transaction.id,
            direction,
            money: transaction.money,
            balanceBefore: movement.before,
            balanceAfter: movement.after,
          });
          store.addLedger(entry);
          enqueueWagerEvent(
            store,
            WalletBalanceChanged.create(
              transaction.walletId,
              {
                walletId: transaction.walletId,
                transactionId: transaction.id,
                direction,
                money: transaction.money.toJSON(),
                balanceBefore: movement.before.toJSON(),
                balanceAfter: movement.after.toJSON(),
                walletVersion: wallet.version,
              },
              {
                correlationId: command.correlationId,
                causationId: transaction.id,
              },
            ),
          );
        }

        enqueueWagerEvent(
          store,
          WagerTransactionProcessed.create(
            transaction.walletId,
            wagerEventData(transaction),
            {
              correlationId: command.correlationId,
              causationId: transaction.id,
            },
          ),
        );
        this.metrics.transactions.inc({ status: transaction.status });
        return this.result(state, false);
      });

      this.logger.log({
        event: "wager_transaction_handled",
        correlationId: command.correlationId,
        messageId: command.inbox?.messageId,
        transactionId: result.transactionId,
        walletId: command.walletId,
        providerId: command.providerId,
        status: result.status,
        idempotentReplay: result.idempotentReplay,
      });
      return result;
    } catch (error) {
      if (this.isLockConflict(error)) this.metrics.lockConflicts.inc();
      throw error;
    } finally {
      stop();
    }
  }

  private replay(
    state: StoredTransaction,
    payloadHash: string,
  ): TransactionResult {
    if (!state.transaction.matchesPayload(payloadHash)) {
      throw new IdempotencyConflictError(
        "Idempotency key was used with another payload",
      );
    }
    this.metrics.duplicates.inc();
    return this.result(state, true);
  }

  private async recordReplayInbox(
    store: PersistenceTransaction,
    command: SubmitTransactionCommand,
  ): Promise<void> {
    if (!command.inbox) return;
    const prior = await store.findInbox(
      command.inbox.consumerName,
      command.inbox.messageId,
    );
    if (prior) {
      if (prior.payloadHash !== command.inbox.payloadHash) {
        throw new IdempotencyConflictError("Inbox message payload conflict");
      }
      return;
    }
    const inbox = InboxMessage.receive(command.inbox);
    inbox.markProcessed(new Date());
    store.addInbox(inbox);
  }

  private async reject(
    store: PersistenceTransaction,
    transaction: WagerTransaction,
    balance: Money,
    correlationId: string,
  ): Promise<TransactionResult> {
    const state = storedTransactionState(transaction, balance);
    await store.saveTransaction(state);
    enqueueWagerEvent(
      store,
      WagerTransactionRejected.create(
        transaction.walletId,
        wagerEventData(transaction),
        {
          correlationId,
          causationId: transaction.id,
        },
      ),
    );
    this.metrics.transactions.inc({ status: transaction.status });
    return this.result(state, false);
  }

  private result(
    state: StoredTransaction,
    idempotentReplay: boolean,
  ): TransactionResult {
    return {
      transactionId: state.transaction.id,
      status: state.transaction.status,
      balance: (
        state.resultingBalance ?? Money.zero(state.transaction.money.currency)
      ).toJSON(),
      idempotentReplay,
      failureCode: state.transaction.failureCode,
    };
  }

  private isLockConflict(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;
    const code = "code" in error ? String(error.code) : "";
    return code === "40P01" || code === "55P03" || code === "40001";
  }
}
