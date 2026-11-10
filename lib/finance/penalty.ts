import type { Penalty, PenaltyExposure } from "./types";

/** Cost of missing one instalment. A per-day rule is quoted for a single day. */
export function oneMissedInstalment(penalty: Penalty): PenaltyExposure {
  if (penalty.kind === "flat") {
    return { amountPaise: penalty.amountPaise, label: "once" };
  }
  if (penalty.kind === "percent_of_instalment") {
    return {
      amountPaise: Math.round(penalty.instalmentPaise * penalty.percent),
      label: "once",
    };
  }
  return { amountPaise: penalty.amountPaise, label: "per_day" };
}

/**
 * Pay a fee today to keep the outstanding amount for more days.
 * The fee is the whole extra cost. The rate is
 * ((outstanding + fee) / outstanding) ^ (365 / days) - 1.
 */
export function rollover(
  outstandingPaise: number,
  feePaise: number,
  days: number,
): { feePaise: number; effectiveAnnualRate: number } | null {
  if (outstandingPaise <= 0 || feePaise < 0 || days <= 0) return null;
  const ratio = (outstandingPaise + feePaise) / outstandingPaise;
  return {
    feePaise,
    effectiveAnnualRate: Math.pow(ratio, 365 / days) - 1,
  };
}
