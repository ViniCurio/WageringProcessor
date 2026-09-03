import { describe, expect, test } from "bun:test";
import { Wallet } from "../../src/domain/wallet";
import { Money } from "../../src/domain/money";
import { InsufficientFundsError } from "../../src/domain/errors";
describe("Wallet", () => {
  test("increments version only when balance changes", () => {
    const w = Wallet.open({
      playerId: "p",
      initialBalance: Money.from({ amount: "100.00", currency: "BRL" }),
    });
    w.debit(Money.from({ amount: "20.00", currency: "BRL" }));
    expect(w.balance.toString()).toBe("80.00");
    expect(w.version).toBe(2);
    w.credit(Money.zero("BRL"));
    expect(w.version).toBe(2);
  });
  test("never allows negative balance", () => {
    const w = Wallet.open({
      playerId: "p",
      initialBalance: Money.from({ amount: "10.00", currency: "BRL" }),
    });
    expect(() =>
      w.debit(Money.from({ amount: "10.01", currency: "BRL" })),
    ).toThrow(InsufficientFundsError);
  });
});
