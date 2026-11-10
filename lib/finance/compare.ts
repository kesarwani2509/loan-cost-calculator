import rates from "@/config/comparison-rates.json";
import { reducingBalance } from "@/lib/finance/schedule";
import { formatPercent, formatRupees } from "@/lib/finance/format";

export type ComparisonItem = {
  key: string;
  label: string;
  nominalAnnualRate: number;
  rateDisplay: string;
  totalRepayPaise: number;
  totalRepayDisplay: string;
  totalCostPaise: number;
  totalCostDisplay: string;
  emiPaise: number;
  emiDisplay: string;
  note?: string;
};

/**
 * Calculates what the loan would cost under standard alternatives (e.g. Bank loan, SHG, Gold loan)
 * for the same principal amount and approximate tenure.
 */
export function getComparisons(principalPaise: number, tenureDays: number): ComparisonItem[] {
  // Approximate months (minimum 1 month for comparisons)
  const periods = Math.max(1, Math.round(tenureDays / 30.4167));

  return rates.map((r) => {
    const res = reducingBalance({
      principalPaise,
      nominalAnnualRate: r.nominalAnnualRate,
      periods,
      period: "month",
    });

    const totalCostPaise = Math.max(0, res.totalRepayPaise - principalPaise);
    const emiPaise = res.payments[0]?.amountPaise ?? 0;

    return {
      key: r.key,
      label: r.label,
      nominalAnnualRate: r.nominalAnnualRate,
      rateDisplay: formatPercent(r.nominalAnnualRate),
      totalRepayPaise: res.totalRepayPaise,
      totalRepayDisplay: formatRupees(res.totalRepayPaise),
      totalCostPaise,
      totalCostDisplay: formatRupees(totalCostPaise),
      emiPaise,
      emiDisplay: formatRupees(emiPaise),
      note: r.note,
    };
  });
}

