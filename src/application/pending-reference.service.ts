import { Injectable } from "@nestjs/common";
import {
  FailureCode,
  InsufficientFundsError,
  NotFoundError,
} from "../domain/errors";
import {
  WagerTransactionProcessed,
  WagerTransactionRejected,
  WalletBalanceChanged,
} from "../domain/integration-event";
import { WalletLedgerEntry } from "../domain/ledger";
import { Money } from "../domain/money";
import { LedgerDirection } from "../domain/wager-transaction";
import { MetricsService } from "../observability";
import {
  PersistencePort,
  PersistenceTransaction,
  StoredTransaction,
} from "./persistence.port";
import { enqueueWagerEvent, wagerEventData } from "./wagering.helpers";

@Injectable()
export class PendingReferenceService {
  constructor(
    private readonly persistence: PersistencePort,
    private readonly metrics: MetricsService,
  ) {}

  async retry(transactionId: string): Promise<boolean> {
    return this.persistence.transactional(async (store) => {
      const state = await store.lockPendingTransaction(transactionId);
      if (!state) return true;

      const transaction = state.transaction;
      const storedReference = await store.findTransactionByExternalId(
        transaction.providerId,
        transaction.referenceExternalTransactionId!,
      );
      const reference = storedReference?.transaction;

      if (!reference) {
        state.pendingAttempts += 1;
        this.metrics.retries.inc({ subsystem: "pending_reference" });
        if (state.pendingAttempts >= 8) {
          await this.rejectTransaction(
            store,
            state,
            FailureCode.ReferenceNotFound,
          );
          return false;
        } else {
          state.nextAttemptAt = new Date(
            Date.now() + Math.min(300_000, 1_000 * 2 ** state.pendingAttempts),
          );
        }
        await store.saveTransaction(state);
        return false;
      }

      const wallet = await store.lockWallet(transaction.walletId);
      if (!wallet) throw new NotFoundError("Wallet not found");

      const failure = transaction.validateReference(reference);
      if (failure) {
        await this.rejectTransaction(
          store,
          state,
          failure,
          reference.id,
          wallet.balance,
        );
        return true;
      }

      const reversal = await store.findProcessedReversal(
        reference.id,
        transaction.kind,
      );
      if (transaction.requiresReference() && reversal) {
        await this.rejectTransaction(
          store,
          state,
          FailureCode.ReferenceAlreadyReversed,
          reference.id,
          wallet.balance,
        );
        return true;
      }

      const direction = transaction.ledgerDirectionFor(reference);
      try {
        const movement =
          direction === LedgerDirection.Credit
            ? wallet.credit(transaction.money)
            : wallet.debit(transaction.money);
        transaction.markProcessed(reference.id, new Date());
        state.resultingBalance = wallet.balance;
        state.nextAttemptAt = undefined;
        await store.saveTransaction(state);
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
              correlationId: transaction.id,
              causationId: transaction.id,
            },
          ),
        );
        enqueueWagerEvent(
          store,
          WagerTransactionProcessed.create(
            transaction.walletId,
            wagerEventData(transaction),
            {
              correlationId: transaction.id,
              causationId: transaction.id,
            },
          ),
        );
        this.metrics.transactions.inc({ status: transaction.status });
        return true;
      } catch (error) {
        if (error instanceof InsufficientFundsError) {
          await this.rejectTransaction(
            store,
            state,
            FailureCode.ReversalInsufficientFunds,
            reference.id,
            wallet.balance,
          );
          return true;
        }
        throw error;
      }
    });
  }

  private async rejectTransaction(
    store: PersistenceTransaction,
    state: StoredTransaction,
    failureCode: FailureCode,
    referenceTransactionId?: string,
    resultingBalance?: Money,
  ): Promise<void> {
    state.transaction.reject(failureCode, referenceTransactionId);
    state.resultingBalance = resultingBalance ?? state.resultingBalance;
    state.nextAttemptAt = undefined;
    await store.saveTransaction(state);
    enqueueWagerEvent(
      store,
      WagerTransactionRejected.create(
        state.transaction.walletId,
        wagerEventData(state.transaction),
        {
          correlationId: state.transaction.id,
          causationId: state.transaction.id,
        },
      ),
    );
    this.metrics.transactions.inc({ status: state.transaction.status });
  }
}
