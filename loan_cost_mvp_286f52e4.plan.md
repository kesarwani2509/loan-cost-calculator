Loan Cost Calculator MVP

Confirming this plan starts Phase 1 only. After you can run the page and the tests, we stop. Later phases are specified so the shape stays stable, and they do not start until you say the previous phase works.

Speech-to-text is a product named Prisma. It is not Prisma ORM. The database client will be Supabase. No Prisma, Evon, or Timbre URL, header, or parameter will be invented.

What I need from you before Phase 2

Paste the docs sections, not a link alone, for Prisma (speech-to-text), Evon (chat with tool calls), Timbre (speech), and the vision model that reads a screenshot:





Base URL and the exact path



Auth header name and format



Request body for a short clip, a chat turn with tools, a spoken reply, and an image



Response JSON, including how a tool call and an audio stream are returned



Audio format, image size limit, and languages

Until those are pasted, the app will not call those services.

Download the RBI NBFC list (used Saturday evening)





Open the official page: https://www.rbi.org.in/scripts/BS_NBFCList.aspx



In List of NBFCs and ARCs registered with the RBI, download the Excel file (the larger file, not the PDF). The page currently heads that row with 30 September 2026. Also read the “as on” date printed inside the sheet. That date is what we store.



Download List of NBFCs and ARCs whose CoR has been cancelled (Excel) as well, so a cancelled registration is not shown as active.



Save them as data/nbfc/rbi-registered-YYYY-MM-DD.xlsx and data/nbfc/rbi-cancelled-YYYY-MM-DD.xlsx. Do not rename columns. The importer will map name, regional office, classification, and CIN or registration number from whatever headers are in that file.



RBI file links often only work in a browser. If a direct link fails, use the click on that page.

A fuzzy match is stored and shown as possible match, never as verified. No match is not found. A name that is only “loan app” or too short to search is unclear.

Decisions





Integer paise in the finance module and the database, so rupee rounding does not drift. Display divides by 100.



The model does not do the final maths. Evon only fills a schedule. Newton’s method on the cash flows produces the rate.



Effective annual rate is the IRR as an annual effective rate: time is in years (month = k/12, week = k/52, day = k/365), NPV uses (1+r)^t, and r is the number we show. A 30-day grid would make “2% a month” not equal (1.02)^12 - 1. Week count is 52. Day count is 365.



Borrower sign: day 0 is the amount actually received (positive). Later payments are negative. Same rate as the lender’s yield.



Flat quote and effective rate are both shown when the user said flat. For “do rupaye sekda” for a year, the quote is 24% flat and the interest-only cash-flow rate is 26.8% effective, because ₹200 leaves every month. The demo line should say the quote is 24% flat and the effective yearly cost is about 27%, total payback ₹12,400. The sample sentence with 31% and ₹13,100 does not match this deal; spoken text will use the computed figures only.



Short app loans annualise to a very large effective rate. ₹3,800 received and ₹5,500 in 14 days is about 15,36,378% effective ((5500/3800)^(365/14) - 1), which is above the demo’s “300 percent”. The card also shows the plain holding-period cost: ₹1,700 in 14 days, 44.7% over those 14 days.



Phase 1 has no API keys and no database. A manual form plus preset buttons is how you test the maths before voice exists.

Folder structure

loan-cost-calculator/
  app/layout.tsx
  app/page.tsx
  app/globals.css
  lib/finance/types.ts
  lib/finance/irr.ts
  lib/finance/schedule.ts
  lib/finance/penalty.ts
  lib/finance/index.ts
  lib/finance/finance.test.ts
  data/nbfc/.gitkeep
  .env.example
  .gitignore
  package.json
  tsconfig.json
  vitest.config.ts
  next.config.ts

Later phases add, and do not change the finance function signatures:





lib/speech/prisma.ts, lib/llm/evon.ts, lib/llm/system-prompt.ts, lib/speech/timbre.ts, lib/vision/extract.ts



app/api/check/route.ts, app/api/speak/route.ts



lib/db/supabase.ts, lib/lenders/match.ts, supabase/migrations/001_init.sql, scripts/import-nbfc.ts



config/comparison-rates.json, scripts/eval-descriptions.ts, scripts/delete-expired.ts

Environment variables

Phase 1 reads none of these. They go in .env.example now and .env.local when you have them. Never commit .env.local.





NEXT_PUBLIC_SUPABASE_URL — Supabase project URL (Saturday evening)



NEXT_PUBLIC_SUPABASE_ANON_KEY — browser key, if the client reads anything public



SUPABASE_SERVICE_ROLE_KEY — server-only import, lookup, and delete



VISION_API_KEY — screenshot model (Sunday)



VISION_API_BASE_URL — only if the pasted docs use a base URL



PRISMA_API_KEY — speech-to-text



PRISMA_API_BASE_URL



EVON_API_KEY — tool-calling model



EVON_API_BASE_URL



TIMBRE_API_KEY — spoken explanation



TIMBRE_API_BASE_URL

Phase 1 — Saturday morning

Scaffold Next.js (App Router, TypeScript, Tailwind) and Vitest. Mobile-first page: large type, one column.

Finance API

LoanTerms: principalPaise, receivedPaise, feesPaise, payments[{amountPaise, dueInDays}], optional penalty, optional flat: { annualRate, periods, period }.

summarise(terms) returns total repayment, cost (totalRepay - received), effective annual rate, holding-period rate, cash flows, and optional flat-vs-reducing and penalty fields.

lib/finance/irr.ts





Newton on r in sum(amount / (1+r)^tYears) = 0.



Derivative: sum(-t * amount / (1+r)^(t+1)).



Start from (outflow/inflow)^(1/lastYear) - 1. If that is invalid, start at 0.1.



Stop at 80 steps, or when the step is under 1e-14, or NPV is under 1e-6 of the cash-flow scale.



Keep r > -0.999999. No sign change, zero received, or non-convergence returns null, and the page says the rate could not be computed.



Time: monthly payment k at k/12 years, weekly at k/52, daily at k/365, otherwise dueInDays/365.

lib/finance/schedule.ts





interestOnly: interest each period, principal added to the last payment.



equalPayments: same amount each period (Tamil weekly case).



bullet: one repayment.



flatRate: interest = principal × annual flat rate × years; EMI = (principal + interest) / n; last EMI adjusted so the paise sum matches.



reducingBalance: standard EMI at nominal annual rate / periods per year. Same last-paise adjustment.



dailyCollection: one amount every day for n days.

lib/finance/penalty.ts





One missed instalment: flat paise, or percent of that instalment.



If the stated penalty is per day, return one day’s amount and label it per day. Do not invent a 7-day horizon.



rollover: paying a fee to keep the outstanding for more days. Cost is the fee. Effective rate is ((outstanding + fee) / outstanding)^(365/days) - 1.

Ten tests (absolute error ≤ 0.001 on the decimal rate, which is 0.1 percentage point; for rates above 5.0, also allow 0.1% relative)





₹10,000, ₹200 each month, ₹10,200 on month 12. Effective rate 0.26824179. Total repay ₹12,400.



₹10,000 received, ₹12,400 at one year. Effective rate 0.24.



₹7,600 received (₹2,400 cut upfront), repay ₹10,000 at one year. Effective rate 0.31578947. Total repay ₹10,000. Cost ₹2,400.



₹3,800 received, ₹5,500 at 14 days. Effective rate 15363.78013. Cost ₹1,700.



₹10,000, ten weekly payments of ₹1,200. Weekly rate about 0.03460154, effective rate 4.86411. Total ₹12,000.



₹10,000, ₹500 a month for 6 months with principal on month 6. Monthly rate 0.05, effective rate 0.79585633. Total ₹13,000.



₹4,000 received, ₹50 a day for 100 days. Effective rate 4.34529. Total ₹5,000.



₹12,000 at 10% flat for 12 months versus reducing balance at 10% nominal. Flat EMI ₹1,100, flat total ₹13,200. Reducing EMI about ₹1,054.99, total about ₹12,659.89. Flat effective rate above 0.10. Flat total above reducing total.



Missed instalment of ₹1,100 with a 2% penalty. Exposure ₹22.



Rollover: ₹600 to extend ₹10,000 by 7 days. Effective rate 19.86989.

Page

app/page.tsx: inputs for received amount, fees, and payment rows (amount and due days), plus preset buttons for cases 1–7. Result shows total payback, cost in rupees, effective yearly percent, and the holding-period percent. One line already visible: “This is a calculator, not financial advice. It does not tell you whether to borrow.” No lender names, no apply button.

Run npm test and npm run dev. I will click a preset in the browser and confirm the ₹10,000 / do-rupaye-sekda preset shows ₹12,400 and about 26.8%.

Later phases (not built until you say so)

flowchart LR
  page[NextPage]
  api[ApiRoute]
  prisma[PrismaTranscript]
  vision[VisionText]
  evon[EvonTools]
  finance[FinanceModule]
  db[SupabaseNbfc]
  timbre[TimbreAudio]
  page --> api
  api --> prisma
  api --> vision
  prisma --> evon
  vision --> evon
  evon --> finance
  evon --> db
  finance --> page
  finance --> timbre

Saturday afternoon — speech and Evon. API route accepts a short recording. Prisma returns text. Evon may only call set_loan_terms, ask_clarification, and check_lender. check_lender is a stub until the evening. One clarification question, under 15 words, in the user’s language, only when tenure or the payment amount is missing. Glossary in the prompt: sekda/saikda = per hundred; mahina = month; hafta/vaaram/saptaho = week; roz/dinamum/roj = day; meter byaaj/meter vatti = daily compounding; pehle kaat liya = deducted before disbursement, so received is lower than principal. Eight few-shot tool calls: year of do rupaye sekda; interest cut upfront; 14-day app loan; Tamil weekly; Bengali monthly; ₹50 a day; missing tenure; screenshot text that has both an app name and an NBFC name. Tone: do not judge the borrower. Spoken reply uses the numbers the code returns: yearly rate, total payback, one comparison line, lender result. No word “IRR”.

Saturday evening — registry. Migration for nbfc_registry, loan_checks, comparison_rates as in your data model. pg_trgm index on name_normalised. Importer records the file date. Lookup order: exact normalised name, then similarity. Status from the cancelled workbook overrides active.

Sunday morning — screenshot, comparison, voice. Image is read in memory. Vision returns amount, disbursed amount, fees, repayment, tenure, lender name, app name. We check the NBFC name. If only the app name is present, say the lending company was not on the offer. Comparison card uses config/comparison-rates.json for bank_personal, shg, and gold_loan, each labelled as an example you set. Timbre speaks under 40 seconds in Hindi, Tamil, or Bengali.

Sunday afternoon — safety and eval. Full disclaimer. Not-found copy points to RBI registration and the RBI Sachet portal, with no lender recommendation. Threats, harassment, or calling contacts shows cyber crime helpline 1930 and a police-complaint line. Do not ask for name, phone, or Aadhaar. loan_checks deleted after 24 hours. Original screenshots are not stored; only extracted text is. A script runs at least 15 descriptions, with at least 13 matching the expected schedule, plus the IRR tests. Demo script uses the computed 24% flat / about 27% effective / ₹12,400 result, then the app screenshot above 300% with lender not found, then the example SHG card.