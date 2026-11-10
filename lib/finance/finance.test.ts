import { describe, expect, it } from "vitest";
import { oneMissedInstalment, rollover } from "./penalty";
import { bullet, equalPayments, flatRate, interestOnly, reducingBalance } from "./schedule";
import { summarise } from "./summarise";
import { periodRateFromAnnual } from "./irr";
import type { LoanTerms } from "./types";

const rupee = (amount: number) => Math.round(amount * 100);

function expectRate(actual: number | null, expected: number) {
  expect(actual).not.toBeNull();
  const tolerance = Math.abs(expected) > 5 ? Math.abs(expected) * 0.001 : 0.001;
  expect(Math.abs((actual as number) - expected)).toBeLessThanOrEqual(tolerance);
}

function loan(partial: Omit<LoanTerms, "feesPaise"> & { feesPaise?: number }): LoanTerms {
  return { feesPaise: 0, ...partial };
}

describe("loan cash flows", () => {
  it("prices do rupaye sekda as monthly interest plus principal at the end", () => {
    const payments = interestOnly({
      principalPaise: rupee(10_000),
      interestPaise: rupee(200),
      periods: 12,
      period: "month",
    });
    const summary = summarise(
      loan({
        principalPaise: rupee(10_000),
        receivedPaise: rupee(10_000),
        payments,
      }),
    );

    expect(summary.totalRepayPaise).toBe(rupee(12_400));
    expect(summary.totalCostPaise).toBe(rupee(2_400));
    expect(payments[0].amountPaise).toBe(rupee(200));
    expect(payments[11].amountPaise).toBe(rupee(10_200));
    expectRate(summary.effectiveAnnualRate, (1.02 ** 12) - 1);
  });

  it("prices a single repayment of ₹12,400 after one year at 24%", () => {
    const summary = summarise(
      loan({
        principalPaise: rupee(10_000),
        receivedPaise: rupee(10_000),
        payments: bullet(rupee(12_400), 365, 1),
      }),
    );

    expect(summary.totalRepayPaise).toBe(rupee(12_400));
    expectRate(summary.effectiveAnnualRate, 0.24);
  });

  it("prices interest deducted upfront on the amount actually received", () => {
    const summary = summarise(
      loan({
        principalPaise: rupee(10_000),
        receivedPaise: rupee(7_600),
        feesPaise: rupee(2_400),
        payments: bullet(rupee(10_000), 365, 1),
      }),
    );

    expect(summary.totalRepayPaise).toBe(rupee(10_000));
    expect(summary.totalCostPaise).toBe(rupee(2_400));
    expectRate(summary.effectiveAnnualRate, 10_000 / 7_600 - 1);
  });

  it("annualises a 14-day app loan from the disbursed amount", () => {
    const summary = summarise(
      loan({
        principalPaise: rupee(5_000),
        receivedPaise: rupee(3_800),
        feesPaise: rupee(1_200),
        payments: bullet(rupee(5_500), 14, 14 / 365),
      }),
    );

    expect(summary.totalCostPaise).toBe(rupee(1_700));
    expect(summary.holdingPeriodRate).toBeCloseTo(1_700 / 3_800, 10);
    expectRate(summary.effectiveAnnualRate, (5_500 / 3_800) ** (365 / 14) - 1);
  });

  it("prices ten weekly payments of ₹1,200", () => {
    const payments = equalPayments({
      amountPaise: rupee(1_200),
      periods: 10,
      period: "week",
    });
    const summary = summarise(
      loan({
        principalPaise: rupee(10_000),
        receivedPaise: rupee(10_000),
        payments,
      }),
    );

    expect(summary.totalRepayPaise).toBe(rupee(12_000));
    expect(payments).toHaveLength(10);
    expectRate(summary.effectiveAnnualRate, 4.864111552489514);
    expect(periodRateFromAnnual(summary.effectiveAnnualRate as number, 52)).toBeCloseTo(
      0.03460154,
      5,
    );
  });

  it("prices six months of ₹500 interest with principal at the end", () => {
    const payments = interestOnly({
      principalPaise: rupee(10_000),
      interestPaise: rupee(500),
      periods: 6,
      period: "month",
    });
    const summary = summarise(
      loan({
        principalPaise: rupee(10_000),
        receivedPaise: rupee(10_000),
        payments,
      }),
    );

    expect(summary.totalRepayPaise).toBe(rupee(13_000));
    expect(payments[5].amountPaise).toBe(rupee(10_500));
    expectRate(periodRateFromAnnual(summary.effectiveAnnualRate as number, 12), 0.05);
    expectRate(summary.effectiveAnnualRate, 1.05 ** 12 - 1);
  });

  it("prices ₹50 collected every day for 100 days", () => {
    const summary = summarise(
      loan({
        principalPaise: rupee(4_000),
        receivedPaise: rupee(4_000),
        payments: Array.from({ length: 100 }, (_, index) => ({
          amountPaise: rupee(50),
          dueInDays: index + 1,
          tYears: (index + 1) / 365,
        })),
      }),
    );

    expect(summary.totalRepayPaise).toBe(rupee(5_000));
    expect(summary.totalCostPaise).toBe(rupee(1_000));
    expectRate(summary.effectiveAnnualRate, 4.345287575459426);
  });

  it("shows a flat-rate EMI costs more than the same nominal reducing-balance rate", () => {
    const flat = flatRate({
      principalPaise: rupee(12_000),
      annualRate: 0.1,
      periods: 12,
      period: "month",
    });
    const reducing = reducingBalance({
      principalPaise: rupee(12_000),
      nominalAnnualRate: 0.1,
      periods: 12,
      period: "month",
    });
    const summary = summarise(
      loan({
        principalPaise: rupee(12_000),
        receivedPaise: rupee(12_000),
        payments: flat.payments,
        flat: { annualRate: 0.1, periods: 12, period: "month" },
      }),
    );

    expect(flat.totalRepayPaise).toBe(rupee(13_200));
    expect(flat.payments.every((payment) => payment.amountPaise === rupee(1_100))).toBe(true);
    expect(reducing.payments[0].amountPaise).toBeGreaterThan(rupee(1_054));
    expect(reducing.payments[0].amountPaise).toBeLessThan(rupee(1_056));
    expect(reducing.totalRepayPaise).toBeGreaterThan(rupee(12_659));
    expect(reducing.totalRepayPaise).toBeLessThan(rupee(12_661));
    expect(summary.flatVsReducing?.flat.totalRepayPaise).toBeGreaterThan(
      summary.flatVsReducing?.reducing.totalRepayPaise ?? 0,
    );
    expect(summary.flatVsReducing?.flat.effectiveAnnualRate ?? 0).toBeGreaterThan(0.1);
  });

  it("charges 2% of one missed ₹1,100 instalment", () => {
    const exposure = oneMissedInstalment({
      kind: "percent_of_instalment",
      percent: 0.02,
      instalmentPaise: rupee(1_100),
    });
    const perDay = oneMissedInstalment({ kind: "per_day", amountPaise: rupee(40) });

    expect(exposure.amountPaise).toBe(rupee(22));
    expect(exposure.label).toBe("once");
    expect(perDay).toEqual({ amountPaise: rupee(40), label: "per_day" });
  });

  it("prices a 7-day rollover of ₹10,000 for a ₹600 fee", () => {
    const extension = rollover(rupee(10_000), rupee(600), 7);

    expect(extension).not.toBeNull();
    expect(extension?.feePaise).toBe(rupee(600));
    expectRate(extension?.effectiveAnnualRate ?? null, ((10_000 + 600) / 10_000) ** (365 / 7) - 1);
  });
});
