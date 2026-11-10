/**
 * Convert the Evon set_loan_terms tool arguments into a LoanTerms object
 * and call summarise().
 *
 * This keeps the finance module's public API unchanged (plan requirement).
 */

import {
  bullet,
  dailyCollection,
  equalPayments,
  flatRate,
  interestOnly,
  reducingBalance,
  summarise,
} from "@/lib/finance";
import type { LoanSummary, LoanTerms, Payment } from "@/lib/finance";
import type { SetLoanTermsArgs } from "./evon";

const rupee = (amount: number) => Math.round(amount * 100);

function assertFiniteNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a finite, non-negative number.`);
  if (value > 100_000_000) throw new Error(`${name} cannot exceed ₹100,000,000.`);
}
function validateArgs(args: SetLoanTermsArgs): void {
  assertFiniteNonNegative("principalRupees", args.principalRupees);
  assertFiniteNonNegative("receivedRupees", args.receivedRupees);
  assertFiniteNonNegative("feesRupees", args.feesRupees);
  if (args.principalRupees <= 0 || args.receivedRupees <= 0) throw new Error("Loan principal and received amount must be greater than zero.");
  if (args.receivedRupees > args.principalRupees) throw new Error("Received amount cannot exceed the stated principal.");
  if (args.periods !== undefined && (!Number.isInteger(args.periods) || args.periods < 1 || args.periods > 1200)) throw new Error("Periods must be an integer between 1 and 1200.");
  if (args.periodUnit !== undefined && !["month", "week", "day"].includes(args.periodUnit)) throw new Error("Period unit must be month, week, or day.");
  if (args.amountRupees !== undefined && args.amountRupees <= 0) throw new Error("Payment amount must be greater than zero.");
  if (args.annualRate !== undefined && (!Number.isFinite(args.annualRate) || args.annualRate < 0 || args.annualRate > 10)) throw new Error("Annual rate must be between 0 and 10 (0% to 1000%).");
  if (args.interestRupees !== undefined) assertFiniteNonNegative("interestRupees", args.interestRupees);
  if (args.amountRupees !== undefined) assertFiniteNonNegative("amountRupees", args.amountRupees);
  if (args.penalty) {
    if (args.penalty.kind === "flat" || args.penalty.kind === "per_day") {
      assertFiniteNonNegative("penalty.amountRupees", args.penalty.amountRupees);
    } else if (args.penalty.kind === "percent_of_instalment") {
      if (!Number.isFinite(args.penalty.percent) || args.penalty.percent < 0 || args.penalty.percent > 10) throw new Error("Penalty percentage must be between 0 and 10.");
      assertFiniteNonNegative("penalty.instalmentRupees", args.penalty.instalmentRupees);
    } else {
      throw new Error("Unsupported penalty type.");
    }
  }
  if (args.rollover) {
    assertFiniteNonNegative("rollover.outstandingRupees", args.rollover.outstandingRupees);
    assertFiniteNonNegative("rollover.feeRupees", args.rollover.feeRupees);
    if (args.rollover.outstandingRupees <= 0 || !Number.isInteger(args.rollover.days) || args.rollover.days < 1 || args.rollover.days > 36500) throw new Error("Rollover requires a positive outstanding balance and 1 to 36500 days.");
  }
  if (args.payments) {
    if (!Array.isArray(args.payments) || args.payments.length < 1 || args.payments.length > 1200) throw new Error("Payment schedule must contain 1 to 1200 payments.");
    for (const [index, payment] of args.payments.entries()) {
      assertFiniteNonNegative(`payments[${index}].amountRupees`, payment.amountRupees);
      if (payment.amountRupees <= 0 || !Number.isInteger(payment.dueInDays) || payment.dueInDays < 1 || payment.dueInDays > 36500) throw new Error(`Payment ${index + 1} has an invalid amount or due day.`);
    }
  }
}

export function buildLoanTerms(args: SetLoanTermsArgs): LoanTerms {
  validateArgs(args);
  const principalPaise = rupee(args.principalRupees);
  const receivedPaise = rupee(args.receivedRupees);
  const feesPaise = rupee(args.feesRupees);

  let payments: Payment[] = [];

  switch (args.scheduleType) {
    case "interestOnly": {
      if (!args.periods || !args.periodUnit || args.interestRupees === undefined) {
        throw new Error("interestOnly requires interestRupees, periods, and periodUnit.");
      }
      payments = interestOnly({
        principalPaise,
        interestPaise: rupee(args.interestRupees),
        periods: args.periods,
        period: args.periodUnit,
      });
      break;
    }

    case "equalPayments": {
      if (!args.periods || !args.periodUnit || args.amountRupees === undefined) {
        throw new Error("equalPayments requires amountRupees, periods, and periodUnit.");
      }
      payments = equalPayments({
        amountPaise: rupee(args.amountRupees),
        periods: args.periods,
        period: args.periodUnit,
      });
      break;
    }

    case "dailyCollection": {
      if (!args.periods || args.amountRupees === undefined) {
        throw new Error("dailyCollection requires amountRupees and periods.");
      }
      payments = dailyCollection(rupee(args.amountRupees), args.periods);
      break;
    }

    case "bullet": {
      if (!args.payments?.length) {
        throw new Error("bullet scheduleType requires a payments array.");
      }
      payments = args.payments.map((p) =>
        bullet(rupee(p.amountRupees), p.dueInDays)[0],
      );
      break;
    }

    case "flatRate": {
      if (!args.periods || !args.periodUnit || args.annualRate === undefined) {
        throw new Error("flatRate requires annualRate, periods, and periodUnit.");
      }
      const flat = flatRate({
        principalPaise,
        annualRate: args.annualRate,
        periods: args.periods,
        period: args.periodUnit,
      });
      payments = flat.payments;
      break;
    }

    case "reducingBalance": {
      if (!args.periods || !args.periodUnit || args.annualRate === undefined) {
        throw new Error("reducingBalance requires annualRate, periods, and periodUnit.");
      }
      const reducing = reducingBalance({
        principalPaise,
        nominalAnnualRate: args.annualRate,
        periods: args.periods,
        period: args.periodUnit,
      });
      payments = reducing.payments;
      break;
    }

    default: {
      throw new Error(`Unknown scheduleType: ${String(args.scheduleType)}`);
    }
  }

  const terms: LoanTerms = {
    principalPaise,
    receivedPaise,
    feesPaise,
    payments,
  };
  if (args.penalty) {
    terms.penalty = args.penalty.kind === "percent_of_instalment"
      ? { kind: "percent_of_instalment", percent: args.penalty.percent, instalmentPaise: rupee(args.penalty.instalmentRupees) }
      : { kind: args.penalty.kind, amountPaise: rupee(args.penalty.amountRupees) };
  }
  if (args.rollover) {
    terms.rollover = {
      outstandingPaise: rupee(args.rollover.outstandingRupees),
      feePaise: rupee(args.rollover.feeRupees),
      days: args.rollover.days,
    };
  }

  // Attach flatVsReducing context when scheduleType is flatRate.
  if (args.scheduleType === "flatRate" && args.annualRate !== undefined && args.periods && args.periodUnit) {
    terms.flat = {
      annualRate: args.annualRate,
      periods: args.periods,
      period: args.periodUnit,
    };
  }

  return terms;
}

export function computeSummary(args: SetLoanTermsArgs): LoanSummary {
  return summarise(buildLoanTerms(args));
}

