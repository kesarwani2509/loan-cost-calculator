/**
 * Money is integer paise (1 rupee = 100 paise) so totals do not drift.
 * A payment's year-fraction is exact when we know the period: month k is
 * k/12, week k is k/52, day k is k/365. dueInDays is only the display date.
 */

export type PeriodUnit = "month" | "week" | "day";

export type Payment = {
  amountPaise: number;
  dueInDays: number;
  tYears?: number;
};

export type Penalty =
  | { kind: "flat"; amountPaise: number }
  | { kind: "percent_of_instalment"; percent: number; instalmentPaise: number }
  | { kind: "per_day"; amountPaise: number };

export type FlatQuote = {
  annualRate: number;
  periods: number;
  period: PeriodUnit;
};

export type RolloverQuote = {
  outstandingPaise: number;
  feePaise: number;
  days: number;
};

export type LoanTerms = {
  principalPaise: number;
  receivedPaise: number;
  feesPaise: number;
  payments: Payment[];
  penalty?: Penalty;
  flat?: FlatQuote;
  rollover?: RolloverQuote;
};

export type Cashflow = {
  tYears: number;
  amountPaise: number;
  dueInDays: number;
};

export type TimedCashflow = {
  tYears: number;
  amount: number;
};

export type PricedSchedule = {
  payments: Payment[];
  totalRepayPaise: number;
  effectiveAnnualRate: number | null;
};

export type PenaltyExposure = {
  amountPaise: number;
  label: "once" | "per_day";
};

export type LoanSummary = {
  totalRepayPaise: number;
  totalCostPaise: number;
  effectiveAnnualRate: number | null;
  holdingPeriodRate: number | null;
  holdingDays: number;
  cashflows: Cashflow[];
  penalty?: PenaltyExposure;
  rollover?: { feePaise: number; effectiveAnnualRate: number };
  flatVsReducing?: {
    nominalAnnualRate: number;
    flat: PricedSchedule;
    reducing: PricedSchedule;
  };
};
