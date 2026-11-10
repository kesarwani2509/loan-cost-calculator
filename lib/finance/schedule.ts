import type { Payment, PeriodUnit } from "./types";

export function yearsPerPeriod(period: PeriodUnit): number {
  if (period === "month") return 1 / 12;
  if (period === "week") return 1 / 52;
  return 1 / 365;
}

export function periodsPerYear(period: PeriodUnit): number {
  if (period === "month") return 12;
  if (period === "week") return 52;
  return 365;
}

/** Display day count. The rate uses the year-fraction, not this rounding. */
export function dueInDays(period: PeriodUnit, periodIndex: number): number {
  if (period === "month") return Math.round((periodIndex * 365) / 12);
  if (period === "week") return Math.round((periodIndex * 365) / 52);
  return periodIndex;
}

export function interestOnly(input: {
  principalPaise: number;
  interestPaise: number;
  periods: number;
  period: PeriodUnit;
}): Payment[] {
  return Array.from({ length: input.periods }, (_, index) => {
    const periodIndex = index + 1;
    const isLast = periodIndex === input.periods;
    return payment(
      input.interestPaise + (isLast ? input.principalPaise : 0),
      input.period,
      periodIndex,
    );
  });
}

export function equalPayments(input: {
  amountPaise: number;
  periods: number;
  period: PeriodUnit;
}): Payment[] {
  return Array.from({ length: input.periods }, (_, index) =>
    payment(input.amountPaise, input.period, index + 1),
  );
}

export function bullet(amountPaise: number, dueDays: number, tYears?: number): Payment[] {
  return [
    {
      amountPaise,
      dueInDays: dueDays,
      tYears: tYears ?? dueDays / 365,
    },
  ];
}

export function dailyCollection(amountPaise: number, days: number): Payment[] {
  return equalPayments({ amountPaise, periods: days, period: "day" });
}

/**
 * Flat rate: interest = principal × annual rate × years, spread evenly.
 * The last payment absorbs paise so the parts add up to the total.
 */
export function flatRate(input: {
  principalPaise: number;
  annualRate: number;
  periods: number;
  period: PeriodUnit;
}): { payments: Payment[]; totalRepayPaise: number; interestPaise: number } {
  const years = input.periods * yearsPerPeriod(input.period);
  const interestPaise = Math.round(input.principalPaise * input.annualRate * years);
  const totalRepayPaise = input.principalPaise + interestPaise;
  return {
    interestPaise,
    totalRepayPaise,
    payments: splitTotal(totalRepayPaise, input.periods, input.period),
  };
}

/**
 * Reducing balance: each period's interest is the nominal rate on the
 * amount still owed. EMI uses the standard annuity formula.
 */
export function reducingBalance(input: {
  principalPaise: number;
  nominalAnnualRate: number;
  periods: number;
  period: PeriodUnit;
}): { payments: Payment[]; totalRepayPaise: number } {
  const perPeriod = input.nominalAnnualRate / periodsPerYear(input.period);
  const exactEmi =
    perPeriod === 0
      ? input.principalPaise / input.periods
      : (input.principalPaise * perPeriod * Math.pow(1 + perPeriod, input.periods)) /
        (Math.pow(1 + perPeriod, input.periods) - 1);

  const regular = Math.round(exactEmi);
  const totalRepayPaise = Math.round(exactEmi * input.periods);
  const amounts = Array.from({ length: input.periods }, () => regular);
  amounts[input.periods - 1] = totalRepayPaise - regular * (input.periods - 1);

  return {
    totalRepayPaise,
    payments: amounts.map((amountPaise, index) => payment(amountPaise, input.period, index + 1)),
  };
}

function payment(amountPaise: number, period: PeriodUnit, periodIndex: number): Payment {
  return {
    amountPaise,
    dueInDays: dueInDays(period, periodIndex),
    tYears: yearsPerPeriod(period) * periodIndex,
  };
}

function splitTotal(totalPaise: number, periods: number, period: PeriodUnit): Payment[] {
  const regular = Math.round(totalPaise / periods);
  const amounts = Array.from({ length: periods }, () => regular);
  amounts[periods - 1] = totalPaise - regular * (periods - 1);
  return amounts.map((amountPaise, index) => payment(amountPaise, period, index + 1));
}
