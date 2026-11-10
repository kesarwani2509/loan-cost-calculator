import { describe, expect, it } from "vitest";
import { buildLoanTerms } from "./finance-bridge";
import { summarise } from "@/lib/finance";

const base = {
  principalRupees: 10000,
  receivedRupees: 9000,
  feesRupees: 1000,
  scheduleType: "bullet" as const,
  payments: [
    { amountRupees: 5000, dueInDays: 30 },
    { amountRupees: 6000, dueInDays: 60 },
  ],
};

describe("AI loan-term validation and schedule conversion", () => {
  it("preserves every explicit instalment and its due date", () => {
    const terms = buildLoanTerms(base);
    expect(terms.payments).toHaveLength(2);
    expect(terms.payments.map((p) => [p.amountPaise, p.dueInDays])).toEqual([
      [500000, 30], [600000, 60],
    ]);
    expect(terms.receivedPaise).toBe(900000);
    expect(terms.feesPaise).toBe(100000);
  });

  it("rejects negative and non-finite money values", () => {
    expect(() => buildLoanTerms({ ...base, receivedRupees: -1 })).toThrow();
    expect(() => buildLoanTerms({ ...base, feesRupees: Number.NaN })).toThrow();
  });

  it("rejects invalid payment dates and excessive schedule sizes", () => {
    expect(() => buildLoanTerms({ ...base, payments: [{ amountRupees: 100, dueInDays: 0 }] })).toThrow();
    expect(() => buildLoanTerms({ ...base, payments: Array.from({ length: 1201 }, (_, i) => ({ amountRupees: 1, dueInDays: i + 1 })) })).toThrow();
  });

  it("rejects impossible amount relationships", () => {
    expect(() => buildLoanTerms({ ...base, receivedRupees: 12000, feesRupees: 0 })).toThrow();
  });

  it("maps stated late fees and rollover quotes into the finance summary", () => {
    const terms = buildLoanTerms({
      ...base,
      penalty: { kind: "percent_of_instalment", percent: 0.02, instalmentRupees: 1100 },
      rollover: { outstandingRupees: 10000, feeRupees: 600, days: 7 },
    });
    const summary = summarise(terms);
    expect(summary.penalty?.amountPaise).toBe(2200);
    expect(summary.penalty?.label).toBe("once");
    expect(summary.rollover?.feePaise).toBe(60000);
    expect(summary.rollover?.effectiveAnnualRate).toBeCloseTo(((10600 / 10000) ** (365 / 7)) - 1, 8);
  });
});
