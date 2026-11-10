import { effectiveAnnualRate } from "./irr";
import { oneMissedInstalment, rollover } from "./penalty";
import { flatRate, reducingBalance } from "./schedule";
import type { Cashflow, LoanSummary, LoanTerms, Payment, PricedSchedule } from "./types";

export function summarise(terms: LoanTerms): LoanSummary {
  const priced = pricePayments(terms.receivedPaise, terms.payments);
  const summary: LoanSummary = {
    totalRepayPaise: priced.totalRepayPaise,
    totalCostPaise: priced.totalRepayPaise - terms.receivedPaise,
    effectiveAnnualRate: priced.effectiveAnnualRate,
    holdingPeriodRate:
      terms.receivedPaise > 0 ? (priced.totalRepayPaise - terms.receivedPaise) / terms.receivedPaise : null,
    holdingDays: terms.payments.reduce((max, payment) => Math.max(max, payment.dueInDays), 0),
    cashflows: cashflows(terms.receivedPaise, terms.payments),
  };

  if (terms.penalty) {
    summary.penalty = oneMissedInstalment(terms.penalty);
  }
  if (terms.rollover) {
    summary.rollover = rollover(
      terms.rollover.outstandingPaise,
      terms.rollover.feePaise,
      terms.rollover.days,
    ) ?? undefined;
  }

  if (terms.flat) {
    const flat = flatRate({
      principalPaise: terms.principalPaise,
      annualRate: terms.flat.annualRate,
      periods: terms.flat.periods,
      period: terms.flat.period,
    });
    const reducing = reducingBalance({
      principalPaise: terms.principalPaise,
      nominalAnnualRate: terms.flat.annualRate,
      periods: terms.flat.periods,
      period: terms.flat.period,
    });
    summary.flatVsReducing = {
      nominalAnnualRate: terms.flat.annualRate,
      flat: pricePayments(terms.principalPaise, flat.payments),
      reducing: pricePayments(terms.principalPaise, reducing.payments),
    };
  }

  return summary;
}

function pricePayments(receivedPaise: number, payments: Payment[]): PricedSchedule {
  const totalRepayPaise = payments.reduce((sum, payment) => sum + payment.amountPaise, 0);
  return {
    payments,
    totalRepayPaise,
    effectiveAnnualRate: effectiveAnnualRate(
      cashflows(receivedPaise, payments).map((flow) => ({
        tYears: flow.tYears,
        amount: flow.amountPaise,
      })),
    ),
  };
}

function cashflows(receivedPaise: number, payments: Payment[]): Cashflow[] {
  return [
    { tYears: 0, amountPaise: receivedPaise, dueInDays: 0 },
    ...payments.map((payment) => ({
      tYears: payment.tYears ?? payment.dueInDays / 365,
      amountPaise: -payment.amountPaise,
      dueInDays: payment.dueInDays,
    })),
  ];
}
