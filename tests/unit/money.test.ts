import { describe, expect, test } from "bun:test";
import { Money } from "../../src/domain/money";
import { CurrencyMismatchError } from "../../src/domain/errors";
describe("Money", () => {
  test("preserves fixed scale and exact arithmetic", () => {
    expect(
      Money.from({ amount: "0.10", currency: "BRL" })
        .add(Money.from({ amount: "0.20", currency: "BRL" }))
        .toString(),
    ).toBe("0.30");
  });
  test.each(["", "1", "1.0", "1.001", "1.005", "-1.00", "1e2", "NaN", "Infinity"])(
    "rejects invalid input instead of rounding it: %s",
    (amount) => expect(() => Money.from({ amount, currency: "BRL" })).toThrow(),
  );
  test("rejects mixed currencies", () =>
    expect(() => Money.zero("BRL").add(Money.zero("USD"))).toThrow(
      CurrencyMismatchError,
    ));
  test("is immutable", () => {
    const original = Money.from({ amount: "10.00", currency: "BRL" });
    original.subtract(Money.from({ amount: "1.00", currency: "BRL" }));
    expect(original.toString()).toBe("10.00");
  });
});
