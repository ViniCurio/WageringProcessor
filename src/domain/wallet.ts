import { randomUUID } from "node:crypto";
import { CurrencyMismatchError, InsufficientFundsError } from "./errors";
import { Money } from "./money";

export interface WalletState {
  id: string;
  playerId: string;
  currency: string;
  balance: Money;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export class Wallet {
  private constructor(
    public readonly id: string,
    public readonly playerId: string,
    public readonly currency: string,
    private _balance: Money,
    private _version: number,
    public readonly createdAt: Date,
    private _updatedAt: Date,
  ) {}

  static open(props: {
    id?: string;
    playerId: string;
    initialBalance: Money;
  }): Wallet {
    const now = new Date();
    return new Wallet(
      props.id ?? randomUUID(),
      props.playerId,
      props.initialBalance.currency,
      props.initialBalance,
      1,
      now,
      now,
    );
  }

  static rehydrate(s: WalletState): Wallet {
    return new Wallet(
      s.id,
      s.playerId,
      s.currency,
      s.balance,
      s.version,
      s.createdAt,
      s.updatedAt,
    );
  }

  get balance(): Money {
    return this._balance;
  }

  get version(): number {
    return this._version;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  debit(money: Money, at = new Date()): { before: Money; after: Money } {
    this.assertSameCurrency(money);
    if (this._balance.isLessThan(money))
      throw new InsufficientFundsError("Insufficient funds");
    return this.apply(this._balance.subtract(money), at);
  }

  credit(money: Money, at = new Date()): { before: Money; after: Money } {
    this.assertSameCurrency(money);
    return this.apply(this._balance.add(money), at);
  }

  private apply(next: Money, at: Date): { before: Money; after: Money } {
    const before = this._balance;
    if (!before.equals(next)) {
      this._balance = next;
      this._version += 1;
      this._updatedAt = at;
    }
    return { before, after: next };
  }

  private assertSameCurrency(money: Money): void {
    if (money.currency !== this.currency)
      throw new CurrencyMismatchError("Wallet currency mismatch");
  }
}
