import {
  WagerTransactionKind,
  WagerTransactionStatus,
} from "../domain/wager-transaction";
import { FailureCode } from "../domain/errors";
import { MoneyProps } from "../domain/money";

export interface SubmitTransactionCommand {
  providerId: string;
  externalTransactionId: string;
  idempotencyKey: string;
  playerId: string;
  walletId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  money: MoneyProps;
  referenceExternalTransactionId?: string;
  correlationId: string;
  inbox?: { consumerName: string; messageId: string; payloadHash: string };
}

export interface TransactionResult {
  transactionId: string;
  status: WagerTransactionStatus;
  balance: MoneyProps;
  idempotentReplay: boolean;
  failureCode?: FailureCode;
}
