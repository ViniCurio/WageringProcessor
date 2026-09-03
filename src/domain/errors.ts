export enum FailureCode {
  InvalidPayload = "INVALID_PAYLOAD",
  InsufficientFunds = "INSUFFICIENT_FUNDS",
  CurrencyMismatch = "CURRENCY_MISMATCH",
  ReferenceNotFound = "REFERENCE_NOT_FOUND",
  InvalidReference = "INVALID_REFERENCE",
  ReferenceAlreadyReversed = "REFERENCE_ALREADY_REVERSED",
  AmountMismatch = "AMOUNT_MISMATCH",
  ReversalInsufficientFunds = "REVERSAL_INSUFFICIENT_FUNDS",
}

export class DomainError extends Error {}
export class InvalidTransactionStateError extends DomainError {}
export class InsufficientFundsError extends DomainError {}
export class CurrencyMismatchError extends DomainError {}
export class ConflictError extends DomainError {}
export class IdempotencyConflictError extends ConflictError {}
export class NotFoundError extends DomainError {}
export class InvalidRequestError extends DomainError {}
