import type { TimedCashflow } from "./types";

const MIN_RATE = -0.999999;

/**
 * Effective annual rate of the borrower's cash flows.
 *
 * Day 0 is money received (positive). Later payments are negative. That is
 * the same rate a lender would earn. Newton's method solves
 * sum(amount / (1 + r) ^ t) = 0. If it does not settle, bisection does.
 * Callers pass paise or rupees; only the ratio matters.
 */
export function effectiveAnnualRate(flows: TimedCashflow[]): number | null {
  if (!hasSignChange(flows)) return null;

  const scale = flows.reduce((sum, flow) => sum + Math.abs(flow.amount), 0);
  if (scale === 0) return null;
  const tolerance = 1e-6 * scale;

  if (Math.abs(npv(0, flows)) <= tolerance) return 0;

  const inflow = flows.reduce((sum, flow) => sum + (flow.amount > 0 ? flow.amount : 0), 0);
  const outflow = flows.reduce((sum, flow) => sum + (flow.amount < 0 ? -flow.amount : 0), 0);
  const lastYear = flows.reduce((max, flow) => Math.max(max, flow.tYears), 0);
  if (inflow <= 0 || outflow <= 0 || lastYear <= 0) return null;

  let guess = Math.pow(outflow / inflow, 1 / lastYear) - 1;
  if (!Number.isFinite(guess) || guess <= MIN_RATE) guess = 0.1;

  const newtonRate = newton(flows, guess, tolerance);
  if (newtonRate !== null) return newtonRate;
  return bisect(flows, tolerance);
}

export function npv(rate: number, flows: TimedCashflow[]): number {
  const base = 1 + rate;
  let total = 0;
  for (const flow of flows) {
    total += flow.amount / Math.pow(base, flow.tYears);
  }
  return total;
}

/** Convert an effective annual rate back into a per-period rate. */
export function periodRateFromAnnual(annualRate: number, periodsPerYear: number): number {
  return Math.pow(1 + annualRate, 1 / periodsPerYear) - 1;
}

function hasSignChange(flows: TimedCashflow[]): boolean {
  let positive = false;
  let negative = false;
  for (const flow of flows) {
    if (flow.amount > 0) positive = true;
    else if (flow.amount < 0) negative = true;
  }
  return positive && negative;
}

function derivative(rate: number, flows: TimedCashflow[]): number {
  const base = 1 + rate;
  let total = 0;
  for (const flow of flows) {
    if (flow.tYears === 0) continue;
    total += (-flow.tYears * flow.amount) / Math.pow(base, flow.tYears + 1);
  }
  return total;
}

function newton(flows: TimedCashflow[], guess: number, tolerance: number): number | null {
  let rate = Math.max(guess, MIN_RATE);

  for (let step = 0; step < 80; step += 1) {
    const value = npv(rate, flows);
    if (!Number.isFinite(value)) return null;
    if (Math.abs(value) <= tolerance) return rate;

    const slope = derivative(rate, flows);
    if (!Number.isFinite(slope) || Math.abs(slope) < 1e-18) return null;

    let next = rate - value / slope;
    if (!Number.isFinite(next) || next <= MIN_RATE) {
      next = (rate + MIN_RATE) / 2;
    }
    if (Math.abs(next - rate) < 1e-14) {
      return Math.abs(npv(next, flows)) <= tolerance ? next : null;
    }
    rate = next;
  }

  return Math.abs(npv(rate, flows)) <= tolerance ? rate : null;
}

function bisect(flows: TimedCashflow[], tolerance: number): number | null {
  let low = MIN_RATE;
  let high = 0.5;
  let highValue = npv(high, flows);

  for (let expand = 0; highValue < 0 && expand < 80; expand += 1) {
    high = high * 2 + 1;
    highValue = npv(high, flows);
  }
  if (!(highValue > 0)) return null;

  if (!(npv(low, flows) < 0)) return null;

  for (let step = 0; step < 200; step += 1) {
    const mid = (low + high) / 2;
    const value = npv(mid, flows);
    if (Math.abs(value) <= tolerance || high - low < 1e-14) return mid;
    if (value > 0) high = mid;
    else low = mid;
  }

  return (low + high) / 2;
}
