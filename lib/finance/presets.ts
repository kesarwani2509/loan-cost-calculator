import { bullet, dailyCollection, equalPayments, interestOnly } from "./schedule";
import type { LoanTerms } from "./types";

export type Preset = {
  id: string;
  label: string;
  note?: string;
  terms: LoanTerms;
};

const rupee = (amount: number) => Math.round(amount * 100);

export const presets: Preset[] = [
  {
    id: "sekda-year",
    label: "Do rupaye sekda, 1 year",
    note: "The quote is 24% flat for a year (₹2 per ₹100 each month). The yearly rate below is the effective cost of paying that interest every month.",
    terms: {
      principalPaise: rupee(10_000),
      receivedPaise: rupee(10_000),
      feesPaise: 0,
      payments: interestOnly({
        principalPaise: rupee(10_000),
        interestPaise: rupee(200),
        periods: 12,
        period: "month",
      }),
    },
  },
  {
    id: "bullet-year",
    label: "₹12,400 at the end of the year",
    terms: {
      principalPaise: rupee(10_000),
      receivedPaise: rupee(10_000),
      feesPaise: 0,
      payments: bullet(rupee(12_400), 365, 1),
    },
  },
  {
    id: "upfront",
    label: "Interest cut upfront",
    note: "₹2,400 is taken off before the money is handed over, so you receive ₹7,600 and still repay ₹10,000.",
    terms: {
      principalPaise: rupee(10_000),
      receivedPaise: rupee(7_600),
      feesPaise: rupee(2_400),
      payments: bullet(rupee(10_000), 365, 1),
    },
  },
  {
    id: "app-14",
    label: "14-day app loan",
    note: "The huge yearly percent is the 14-day cost, compounded across a year. The holding-period line is the cost of these 14 days alone.",
    terms: {
      principalPaise: rupee(5_000),
      receivedPaise: rupee(3_800),
      feesPaise: rupee(1_200),
      payments: bullet(rupee(5_500), 14, 14 / 365),
    },
  },
  {
    id: "tamil-weekly",
    label: "Tamil weekly, 10 weeks",
    terms: {
      principalPaise: rupee(10_000),
      receivedPaise: rupee(10_000),
      feesPaise: 0,
      payments: equalPayments({ amountPaise: rupee(1_200), periods: 10, period: "week" }),
    },
  },
  {
    id: "bengali-monthly",
    label: "Bengali monthly, 6 months",
    terms: {
      principalPaise: rupee(10_000),
      receivedPaise: rupee(10_000),
      feesPaise: 0,
      payments: interestOnly({
        principalPaise: rupee(10_000),
        interestPaise: rupee(500),
        periods: 6,
        period: "month",
      }),
    },
  },
  {
    id: "daily-50",
    label: "₹50 a day, 100 days",
    terms: {
      principalPaise: rupee(4_000),
      receivedPaise: rupee(4_000),
      feesPaise: 0,
      payments: dailyCollection(rupee(50), 100),
    },
  },
];
