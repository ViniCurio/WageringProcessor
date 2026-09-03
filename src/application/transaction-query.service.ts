import { Injectable } from "@nestjs/common";
import { PersistencePort, StoredTransaction } from "./persistence.port";
import { NotFoundError } from "../domain/errors";

export interface TransactionView {
  id: string;
  providerId: string;
  externalTransactionId: string;
  walletId: string;
  playerId: string;
  roundId: string;
  gameId: string;
  kind: string;
  money: { amount: string; currency: string };
  referenceExternalTransactionId?: string;
  status: string;
  failureCode?: string;
  balance?: { amount: string; currency: string };
  createdAt: Date;
  processedAt?: Date;
}

@Injectable()
export class TransactionQueryService {
  constructor(private readonly persistence: PersistencePort) {}

  async byId(id: string): Promise<TransactionView> {
    return this.map(await this.persistence.findTransactionById(id));
  }

  async byExternalId(
    providerId: string,
    externalTransactionId: string,
  ): Promise<TransactionView> {
    return this.map(
      await this.persistence.findTransactionByExternalId(
        providerId,
        externalTransactionId,
      ),
    );
  }

  private map(state: StoredTransaction | undefined): TransactionView {
    if (!state) throw new NotFoundError("Transaction not found");
    const transaction = state.transaction;
    return {
      id: transaction.id,
      providerId: transaction.providerId,
      externalTransactionId: transaction.externalTransactionId,
      walletId: transaction.walletId,
      playerId: transaction.playerId,
      roundId: transaction.roundId,
      gameId: transaction.gameId,
      kind: transaction.kind,
      money: transaction.money.toJSON(),
      referenceExternalTransactionId: transaction.referenceExternalTransactionId,
      status: transaction.status,
      failureCode: transaction.failureCode,
      balance: state.resultingBalance?.toJSON(),
      createdAt: transaction.createdAt,
      processedAt: transaction.processedAt,
    };
  }
}
