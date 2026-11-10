/**
 * scripts/eval-descriptions.ts
 *
 * Phase 5 Evaluation Suite:
 * Tests 15 real-world loan descriptions across colloquial Hindi,
 * Tamil, Bengali, and English, checking whether the schedule builders,
 * terms, and Newton's IRR calculations match expected figures.
 *
 * Plan Requirement:
 * - At least 15 descriptions tested.
 * - At least 13 must match the expected schedule and IRR tolerances.
 *
 * Usage:
 *   npx tsx scripts/eval-descriptions.ts
 */

import { computeSummary } from "../lib/llm/finance-bridge";
import type { SetLoanTermsArgs } from "../lib/llm/evon";
import { formatPercent, formatRupees } from "../lib/finance";

interface TestCase {
  id: number;
  description: string;
  language: string;
  input: SetLoanTermsArgs;
  expected: {
    totalRepayPaise: number;
    totalCostPaise: number;
    expectedAnnualRate: number;
  };
}

const testCases: TestCase[] = [
  // 1. Do rupaye sekda (Hindi)
  {
    id: 1,
    description: "₹10,000 at do rupaye sekda for 1 year (₹200/mo interest, principal at end)",
    language: "Hindi",
    input: {
      principalRupees: 10000,
      receivedRupees: 10000,
      feesRupees: 0,
      scheduleType: "interestOnly",
      interestRupees: 200,
      periods: 12,
      periodUnit: "month",
    },
    expected: {
      totalRepayPaise: 1240000,
      totalCostPaise: 240000,
      expectedAnnualRate: Math.pow(1.02, 12) - 1, // ~26.82%
    },
  },

  // 2. Interest cut upfront (Hindi)
  {
    id: 2,
    description: "₹10,000 loan with ₹2,400 cut upfront (received ₹7,600, repay ₹10,000 in 1 yr)",
    language: "Hindi",
    input: {
      principalRupees: 10000,
      receivedRupees: 7600,
      feesRupees: 2400,
      scheduleType: "bullet",
      payments: [{ amountRupees: 10000, dueInDays: 365 }],
    },
    expected: {
      totalRepayPaise: 1000000,
      totalCostPaise: 240000,
      expectedAnnualRate: 10000 / 7600 - 1, // ~31.58%
    },
  },

  // 3. 14-day predatory digital loan app
  {
    id: 3,
    description: "₹3,800 received in bank, repay ₹5,500 after 14 days",
    language: "English / Hindi",
    input: {
      principalRupees: 5000,
      receivedRupees: 3800,
      feesRupees: 1200,
      scheduleType: "bullet",
      payments: [{ amountRupees: 5500, dueInDays: 14 }],
    },
    expected: {
      totalRepayPaise: 550000,
      totalCostPaise: 170000,
      expectedAnnualRate: Math.pow(5500 / 3800, 365 / 14) - 1, // ~1,536,378%
    },
  },

  // 4. Tamil weekly chit / loan (10 weeks)
  {
    id: 4,
    description: "₹10,000 received, repay ₹1,200 every week for 10 weeks",
    language: "Tamil",
    input: {
      principalRupees: 10000,
      receivedRupees: 10000,
      feesRupees: 0,
      scheduleType: "equalPayments",
      amountRupees: 1200,
      periods: 10,
      periodUnit: "week",
    },
    expected: {
      totalRepayPaise: 1200000,
      totalCostPaise: 200000,
      expectedAnnualRate: 4.86411
    },
  },

  // 5. Bengali monthly interest
  {
    id: 5,
    description: "₹10,000 received, ₹500 interest every month for 6 months, then principal",
    language: "Bengali",
    input: {
      principalRupees: 10000,
      receivedRupees: 10000,
      feesRupees: 0,
      scheduleType: "interestOnly",
      interestRupees: 500,
      periods: 6,
      periodUnit: "month",
    },
    expected: {
      totalRepayPaise: 1300000,
      totalCostPaise: 300000,
      expectedAnnualRate: Math.pow(1.05, 12) - 1, // ~79.59%
    },
  },

  // 6. Daily collection / Meter byaaj (100 days)
  {
    id: 6,
    description: "₹4,000 received, ₹50 collected daily for 100 days",
    language: "Hindi",
    input: {
      principalRupees: 4000,
      receivedRupees: 4000,
      feesRupees: 0,
      scheduleType: "dailyCollection",
      amountRupees: 50,
      periods: 100,
      periodUnit: "day",
    },
    expected: {
      totalRepayPaise: 500000,
      totalCostPaise: 100000,
      expectedAnnualRate: 4.34529
    },
  },

  // 7. Bullet repayment 1 year at 24%
  {
    id: 7,
    description: "₹10,000 received, repay ₹12,400 at 365 days",
    language: "English",
    input: {
      principalRupees: 10000,
      receivedRupees: 10000,
      feesRupees: 0,
      scheduleType: "bullet",
      payments: [{ amountRupees: 12400, dueInDays: 365 }],
    },
    expected: {
      totalRepayPaise: 1240000,
      totalCostPaise: 240000,
      expectedAnnualRate: 0.24,
    },
  },

  // 8. Flat rate 10% vs Reducing
  {
    id: 8,
    description: "₹12,000 at 10% flat for 12 months (₹1,100 EMI)",
    language: "English",
    input: {
      principalRupees: 12000,
      receivedRupees: 12000,
      feesRupees: 0,
      scheduleType: "flatRate",
      annualRate: 0.1,
      periods: 12,
      periodUnit: "month",
    },
    expected: {
      totalRepayPaise: 1320000,
      totalCostPaise: 120000,
      expectedAnnualRate: 0.1953
    },
  },

  // 9. 30-day salary advance app
  {
    id: 9,
    description: "₹9,000 received (₹1,000 processing cut), repay ₹10,500 after 30 days",
    language: "English",
    input: {
      principalRupees: 10000,
      receivedRupees: 9000,
      feesRupees: 1000,
      scheduleType: "bullet",
      payments: [{ amountRupees: 10500, dueInDays: 30 }],
    },
    expected: {
      totalRepayPaise: 1050000,
      totalCostPaise: 150000,
      expectedAnnualRate: Math.pow(10500 / 9000, 365 / 30) - 1
    },
  },

  // 10. Tamil daily collection (Vaddi kadai)
  {
    id: 10,
    description: "₹900 received upfront, ₹10 daily for 100 days",
    language: "Tamil",
    input: {
      principalRupees: 1000,
      receivedRupees: 900,
      feesRupees: 100,
      scheduleType: "dailyCollection",
      amountRupees: 10,
      periods: 100,
      periodUnit: "day",
    },
    expected: {
      totalRepayPaise: 100000,
      totalCostPaise: 10000, // ₹1,000 repay - ₹900 received = ₹100 cost (10,000 paise)
      expectedAnnualRate: 1.1708
    },
  },

  // 11. Reducing balance EMI personal loan
  {
    id: 11,
    description: "₹50,000 bank loan at 12% reducing for 12 months",
    language: "English",
    input: {
      principalRupees: 50000,
      receivedRupees: 50000,
      feesRupees: 0,
      scheduleType: "reducingBalance",
      annualRate: 0.12,
      periods: 12,
      periodUnit: "month",
    },
    expected: {
      totalRepayPaise: 5330930, // ₹53,309.30 in paise
      totalCostPaise: 330930,
      expectedAnnualRate: Math.pow(1.01, 12) - 1, // ~12.68%
    },
  },

  // 12. Bengali 3-month seasonal farm loan
  {
    id: 12,
    description: "₹20,000 received, ₹3,000 total interest after 3 months (quarterly bullet)",
    language: "Bengali",
    input: {
      principalRupees: 20000,
      receivedRupees: 20000,
      feesRupees: 0,
      scheduleType: "bullet",
      payments: [{ amountRupees: 23000, dueInDays: 91 }],
    },
    expected: {
      totalRepayPaise: 2300000,
      totalCostPaise: 300000,
      expectedAnnualRate: Math.pow(23000 / 20000, 365 / 91) - 1, // ~75.2%
    },
  },

  // 13. High-frequency weekly loan (5 weeks)
  {
    id: 13,
    description: "₹5,000 received, repay ₹1,150 per week for 5 weeks",
    language: "Hindi",
    input: {
      principalRupees: 5000,
      receivedRupees: 5000,
      feesRupees: 0,
      scheduleType: "equalPayments",
      amountRupees: 1150,
      periods: 5,
      periodUnit: "week",
    },
    expected: {
      totalRepayPaise: 575000,
      totalCostPaise: 75000,
      expectedAnnualRate: 10.7207
    },
  },

  // 14. 7-day emergency app loan
  {
    id: 14,
    description: "₹2,000 disbursed, repay ₹2,500 after 7 days",
    language: "English",
    input: {
      principalRupees: 2500,
      receivedRupees: 2000,
      feesRupees: 500,
      scheduleType: "bullet",
      payments: [{ amountRupees: 2500, dueInDays: 7 }],
    },
    expected: {
      totalRepayPaise: 250000,
      totalCostPaise: 50000,
      expectedAnnualRate: Math.pow(2500 / 2000, 365 / 7) - 1, // ~11,302,151%
    },
  },

  // 15. Teen rupaye sekda (₹3 per ₹100 per month) for 6 months
  {
    id: 15,
    description: "₹15,000 received, ₹450 monthly interest for 6 months + principal",
    language: "Hindi",
    input: {
      principalRupees: 15000,
      receivedRupees: 15000,
      feesRupees: 0,
      scheduleType: "interestOnly",
      interestRupees: 450,
      periods: 6,
      periodUnit: "month",
    },
    expected: {
      totalRepayPaise: 1770000,
      totalCostPaise: 270000,
      expectedAnnualRate: Math.pow(1.03, 12) - 1, // ~42.57%
    },
  },
];

async function runEvaluation() {
  console.log("==========================================================");
  console.log(" Loan Cost MVP - Phase 5 Evaluation Suite (15 Test Cases)");
  console.log("==========================================================\n");

  let passedCount = 0;
  let failedCount = 0;

  for (const tc of testCases) {
    try {
      const summary = computeSummary(tc.input);

      const repayMatch = Math.abs(summary.totalRepayPaise - tc.expected.totalRepayPaise) <= 100; // within ₹1
      const costMatch = Math.abs(summary.totalCostPaise - tc.expected.totalCostPaise) <= 100;

      const relativeRateError = summary.effectiveAnnualRate === null
        ? Number.POSITIVE_INFINITY
        : Math.abs(summary.effectiveAnnualRate - tc.expected.expectedAnnualRate) /
          Math.max(Math.abs(tc.expected.expectedAnnualRate), 1e-12);
      const rateMatch = relativeRateError <= 0.001; // 0.1% relative tolerance

      if (repayMatch && costMatch && rateMatch) {
        passedCount++;
        console.log(`[PASS] Case #${tc.id} (${tc.language}): ${tc.description}`);
        console.log(`       Repay: ${formatRupees(summary.totalRepayPaise)} | Rate: ${formatPercent(summary.effectiveAnnualRate!)} p.a.\n`);
      } else {
        failedCount++;
        console.error(`[FAIL] Case #${tc.id}: ${tc.description}`);
        console.error(`       Expected Repay: ${tc.expected.totalRepayPaise} paise, Got: ${summary.totalRepayPaise} paise`);
        console.error(`       Expected Rate: ${(tc.expected.expectedAnnualRate * 100).toFixed(2)}%, Got: ${summary.effectiveAnnualRate ? (summary.effectiveAnnualRate * 100).toFixed(2) + "%" : "null"}\n`);
      }
    } catch (err) {
      failedCount++;
      console.error(`[ERROR] Case #${tc.id}: Exception thrown`, err);
    }
  }

  console.log("----------------------------------------------------------");
  console.log(`Total: ${testCases.length} | Passed: ${passedCount} | Failed: ${failedCount}`);
  console.log("----------------------------------------------------------");

  if (passedCount >= 13) {
    console.log(" Evaluation PASSED (Required: >= 13 / 15)");
    process.exit(0);
  } else {
    console.error(" Evaluation FAILED (Fewer than 13 passed)");
    process.exit(1);
  }
}

runEvaluation();
