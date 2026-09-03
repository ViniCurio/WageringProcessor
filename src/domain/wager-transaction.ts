import { randomUUID } from "node:crypto";
import {
  FailureCode,
  InvalidTransactionStateError,
  DomainError,
} from "./errors";
import { Money } from "./money";

export enum WagerTransactionKind {
  Opening = "OPENING",
  Bet = "BET",
  Win = "WIN",
  Loss = "LOSS",
  Refund = "REFUND",
  Rollback = "ROLLBACK",
}

export enum WagerTransactionStatus {
  Pending = "PENDING",
  PendingReference = "PENDING_REFERENCE",
  Processed = "PROCESSED",
  Rejected = "REJECTED",
  Failed = "FAILED",
}

export enum LedgerDirection {
  Debit = "DEBIT",
  Credit = "CREDIT",
}

export interface WagerTransactionState {
  id: string;
  providerId: string;
  externalTransactionId: string;
  idempotencyKey: string;
  payloadHash: string;
  walletId: string;
  playerId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  money: Money;
  referenceExternalTransactionId?: string;
  createdAt: Date;
  status: WagerTransactionStatus;
  referenceTransactionId?: string;
  failureCode?: FailureCode;
  processedAt?: Date;
}

export class WagerTransaction {
  private constructor(
    public readonly id: string,
    public readonly providerId: string,
    public readonly externalTransactionId: string,
    public readonly idempotencyKey: string,
    public readonly payloadHash: string,
    public readonly walletId: string,
    public readonly playerId: string,
    public readonly roundId: string,
    public readonly gameId: string,
    public readonly kind: WagerTransactionKind,
    public readonly money: Money,
    public readonly referenceExternalTransactionId: string | undefined,
    public readonly createdAt: Date,
    private _status: WagerTransactionStatus,
    private _referenceTransactionId?: string,
    private _failureCode?: FailureCode,
    private _processedAt?: Date,
  ) {}

  static create(
    p: Omit<WagerTransactionState, "id" | "createdAt" | "status"> & {
      id?: string;
    },
  ): WagerTransaction {
    if (
      (p.kind === WagerTransactionKind.Refund ||
        p.kind === WagerTransactionKind.Rollback) &&
      !p.referenceExternalTransactionId
    )
      throw new DomainError("Reference is required");
    return new WagerTransaction(
      p.id ?? randomUUID(),
      p.providerId,
      p.externalTransactionId,
      p.idempotencyKey,
      p.payloadHash,
      p.walletId,
      p.playerId,
      p.roundId,
      p.gameId,
      p.kind,
      p.money,
      p.referenceExternalTransactionId,
      new Date(),
      WagerTransactionStatus.Pending,
    );
  }

  static rehydrate(s: WagerTransactionState): WagerTransaction {
    return new WagerTransaction(
      s.id,
      s.providerId,
      s.externalTransactionId,
      s.idempotencyKey,
      s.payloadHash,
      s.walletId,
      s.playerId,
      s.roundId,
      s.gameId,
      s.kind,
      s.money,
      s.referenceExternalTransactionId,
      s.createdAt,
      s.status,
      s.referenceTransactionId,
      s.failureCode,
      s.processedAt,
    );
  }

  get status() {
    return this._status;
  }

  get referenceTransactionId() {
    return this._referenceTransactionId;
  }

  get failureCode() {
    return this._failureCode;
  }

  get processedAt() {
    return this._processedAt;
  }

  markProcessed(ref: string | undefined, at: Date) {
    this.assertMutable();
    this._status = WagerTransactionStatus.Processed;
    this._referenceTransactionId = ref;
    this._processedAt = at;
  }

  markPendingReference() {
    this.assertMutable();
    this._status = WagerTransactionStatus.PendingReference;
  }

  reject(code: FailureCode, referenceTransactionId?: string) {
    this.assertMutable();
    this._status = WagerTransactionStatus.Rejected;
    this._failureCode = code;
    this._referenceTransactionId = referenceTransactionId;
    this._processedAt = new Date();
  }

  fail(code: FailureCode) {
    this.assertMutable();
    this._status = WagerTransactionStatus.Failed;
    this._failureCode = code;
    this._processedAt = new Date();
  }

  isTerminal() {
    return [
      WagerTransactionStatus.Processed,
      WagerTransactionStatus.Rejected,
      WagerTransactionStatus.Failed,
    ].includes(this._status);
  }

  affectsBalance() {
    return this.kind !== WagerTransactionKind.Loss;
  }

  requiresReference() {
    return (
      this.kind === WagerTransactionKind.Refund ||
      this.kind === WagerTransactionKind.Rollback
    );
  }

  matchesPayload(hash: string) {
    return this.payloadHash === hash;
  }

  validateReference(reference: WagerTransaction): FailureCode | undefined {
    if (
      reference.status !== WagerTransactionStatus.Processed ||
      reference.providerId !== this.providerId ||
      reference.playerId !== this.playerId ||
      reference.walletId !== this.walletId ||
      reference.money.currency !== this.money.currency ||
      reference.roundId !== this.roundId
    )
      return FailureCode.InvalidReference;

    if (
      (this.kind === WagerTransactionKind.Refund ||
        this.kind === WagerTransactionKind.Win) &&
      reference.kind !== WagerTransactionKind.Bet
    )
      return FailureCode.InvalidReference;

    if (
      this.kind === WagerTransactionKind.Rollback &&
      ![
        WagerTransactionKind.Bet,
        WagerTransactionKind.Win,
        WagerTransactionKind.Refund,
      ].includes(reference.kind)
    )
      return FailureCode.InvalidReference;

    if (
      (this.kind === WagerTransactionKind.Refund ||
        this.kind === WagerTransactionKind.Rollback) &&
      !reference.money.equals(this.money)
    )
      return FailureCode.AmountMismatch;

    return undefined;
  }

  ledgerDirectionFor(reference?: WagerTransaction): LedgerDirection {
    if (this.kind === WagerTransactionKind.Bet) return LedgerDirection.Debit;
    if (
      this.kind === WagerTransactionKind.Win ||
      this.kind === WagerTransactionKind.Refund ||
      this.kind === WagerTransactionKind.Opening
    )
      return LedgerDirection.Credit;
    if (this.kind === WagerTransactionKind.Rollback && reference)
      return reference.ledgerDirectionFor() === LedgerDirection.Credit
        ? LedgerDirection.Debit
        : LedgerDirection.Credit;
    throw new DomainError("Transaction has no ledger direction");
  }

  private assertMutable() {
    if (this.isTerminal())
      throw new InvalidTransactionStateError(
        "Terminal transaction cannot transition",
      );
  }
}
