# Loan Cost Calculator

A Next.js application for understanding the real cost of informal loans and short-term app loans. Enter repayment details manually, speak an offer, or upload a screenshot. The application converts the offer into a dated repayment schedule and calculates the effective annualised cost using deterministic TypeScript finance functions.

> **Important:** This is an educational calculator, not financial, legal, or lending advice. AI extraction can misread an offer. Always compare the extracted values with the original agreement before relying on a result. An RBI registry name match is not proof that a particular app, agent, or loan offer is authorised.

## What it does

- Manual entry of the amount received, upfront fees, and each repayment amount/date.
- Voice transcription through the configured Prisma speech provider.
- Screenshot extraction of lender/app names, principal, disbursed amount, fees, repayment amount, and tenure through a configured vision model.
- Structured interpretation of loan descriptions through the configured Evon-compatible tool-calling endpoint.
- Deterministic calculation of total repayment, total cost, holding-period rate, and effective annual rate.
- Optional late-payment penalty and rollover-fee illustrations when those terms are explicitly present in an offer.
- Comparison illustrations for selected bank, SHG, and gold-loan benchmark rates.
- Optional Hindi, Tamil, and Bengali spoken explanations through the configured Timbre TTS provider.
- RBI NBFC registry import and lender-name lookup, with separate exact, possible, not-found, and unable-to-check outcomes.

## How the calculation works

Money is represented internally as integer paise to avoid floating-point rounding drift. The calculator builds dated borrower cash flows:

- Day 0: money actually received by the borrower (positive).
- Each repayment date: the amount paid by the borrower (negative).
- The effective annual rate is the annualised rate that makes the present value of those cash flows approximately zero.

For recurring schedules, the finance library supports interest-only, equal payments, bullet repayment, daily collection, flat-rate, and reducing-balance schedules. The rate is calculated from the actual payment dates/period fractions rather than from a single total-payback row.

The effective annual rate can be very large for short-tenure loans. A null result means the supplied cash flows do not provide a solvable positive/negative cash-flow pattern for the numerical solver.

## Technology

| Area | Technology |
|---|---|
| Web application | Next.js App Router, React, TypeScript |
| Styling | Tailwind CSS |
| Finance engine | Pure TypeScript modules |
| AI interpretation | Configurable Evon-compatible chat-completions API |
| Speech-to-text | Vachana Prisma adapter |
| Text-to-speech | Vachana Timbre adapter |
| Screenshot extraction | OpenAI-compatible vision API |
| Registry storage | Supabase PostgreSQL |
| Registry import | `xlsx` |
| Tests | Vitest |
| Linting | ESLint |

## Architecture

```text
Browser
  ├── Manual loan details ──────────────────────────────┐
  ├── Audio upload → /api/check → Prisma transcription ─┤
  └── Image upload → /api/check → Vision extraction ───┤
                                                        ↓
                                               Evon tool call
                                                        ↓
                                           Validated loan terms
                                                        ↓
                                           TypeScript finance engine
                                                        ↓
                                   Summary + full dated payment schedule
                                                        ↓
                                         Browser renders editable rows

Browser → /api/speak → Timbre TTS → audio response

Lender name → Supabase NBFC registry → match classification
```

The finance engine is the source of truth for numerical calculations. AI services only transcribe or extract/structure the offer; they do not calculate the displayed effective rate.

## Requirements

- Node.js 22 or newer (recommended).
- npm.
- A Supabase project for registry lookups and the import/purge scripts.
- API credentials and endpoint details for the AI/speech providers used by the features you enable.

## Local setup (Windows PowerShell)

1. Extract the repository and open PowerShell in its root directory.
2. Install dependencies:

   ```powershell
   npm ci
   ```

3. Create your local environment file:

   ```powershell
   Copy-Item .env.example .env.local
   ```

4. Fill in only the credentials and endpoint URLs supplied by your provider accounts. Do not commit `.env.local`.
5. Apply the SQL migrations in `supabase/migrations/` to your Supabase project, in numeric order.
6. Start the development server:

   ```powershell
   npm run dev
   ```

7. Open [http://localhost:3000](http://localhost:3000).

Manual calculation can be explored without AI credentials. Voice, screenshot, TTS, and RBI lookup features require their respective services to be configured.

## Environment variables

| Variable | Purpose | Required for |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Registry lookup/import |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public Supabase anon key | Browser Supabase client, if used |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only Supabase service-role key | Registry lookup/import and purge |
| `EVON_API_BASE_URL` | Base URL for the configured chat-completions provider | Voice/text interpretation |
| `EVON_API_KEY` | Provider credential | Voice/text interpretation |
| `PRISMA_API_BASE_URL` | Prisma transcription endpoint | Audio transcription |
| `PRISMA_API_KEY` | Prisma credential | Audio transcription |
| `VISION_API_BASE_URL` | OpenAI-compatible vision API base URL | Screenshot extraction |
| `VISION_API_KEY` | Vision API credential | Screenshot extraction |
| `VISION_MODEL` | Vision model name (defaults to `gpt-4o-mini`) | Screenshot extraction |
| `TIMBRE_API_BASE_URL` | Timbre TTS endpoint | Spoken explanation |
| `TIMBRE_API_KEY` | Timbre credential | Spoken explanation |
| `TIMBRE_MODEL` | TTS model (defaults to `timbre-v2.5`) | Spoken explanation |

The Vachana and Evon adapters contain provider-specific request formats. Confirm endpoint paths, authentication headers, model names, payload fields, and response formats against the current documentation for the credentials you use. A successful HTTP response alone does not prove that the provider returned semantically correct transcription or audio.

**Never expose `SUPABASE_SERVICE_ROLE_KEY` or provider API keys in browser code, `NEXT_PUBLIC_` variables, screenshots, issue reports, or committed files.** If a real key was ever included in an uploaded archive, repository, or public commit, revoke/rotate it with the provider and update your local deployment secrets.

## Supabase setup and registry import

1. Create a Supabase project.
2. Run `supabase/migrations/001_init.sql`.
3. For databases that already ran an earlier version of the schema, run `002_registry_metadata_and_rls.sql` as an upgrade.
4. Add the project URL and service-role key to `.env.local`.
5. Place the RBI registered and cancelled NBFC workbooks in `data/nbfc/`. File names should begin with `rbi-registered-` and `rbi-cancelled-`, and should include an `YYYY-MM-DD` date if the workbook does not contain an as-on date.
6. Import the registry:

   ```powershell
   npm run db:import
   ```

The import records the source filename and import timestamp. Keep the workbook date with any published lookup result: registry information is only as current as the source files imported into your database. The workbooks committed in this repository are a historical snapshot dated 2026-09-30; refresh them from an official RBI publication before using the registry for current checks.

### RLS and access

Row-level security is enabled on all three tables. Anonymous/authenticated clients can read the NBFC registry and comparison-rate reference table. No client policy is created for `loan_checks`; borrower analysis rows are intended to be accessible only through trusted server-side operations using the service-role key. Never put that key in a client component.

## Privacy and retention

- Screenshot bytes are processed in memory and are not intentionally written to disk by the screenshot extraction code.
- The API currently returns analysis to the browser; it does not need to persist a borrower record to calculate the result.
- The `loan_checks` table includes an `expires_at` field for any records written by future/server-side workflows. The purge script deletes expired rows.
- A GitHub Actions workflow is included at `.github/workflows/purge-expired.yml`. To enable it, add repository secrets named `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. It runs daily and can also be triggered manually.
- The API's built-in rate limiter is process-local and is only a basic abuse-control layer. Serverless deployments need a shared rate limiter or platform firewall for reliable cross-instance enforcement.

Do not store screenshots, audio, transcripts, or other personal information longer than required. Review your hosting provider's request logs, provider retention policies, and Supabase backups separately; this application code cannot guarantee deletion from third-party logs or backups.

## Commands

```bash
npm run dev       # Development server
npm run build     # Production build
npm run start     # Start production server
npm run lint      # ESLint
npm test          # Vitest suite
npm run test:watch
npm run db:import # Import local RBI NBFC workbooks
npm run db:purge  # Delete expired loan_checks records
```

The database scripts read `.env.local` using Node's `--env-file` option. Use Node.js 22+.

## Tests and quality checks

The Vitest suite covers the finance engine and selected loan-term conversion/validation cases. Run `npm test` before submitting changes. Run `npm run lint` and `npm run build` as separate checks.

AI provider behaviour cannot be fully verified by unit tests alone. Test each configured provider with non-sensitive sample audio/images and compare extracted fields with the original offer. In particular, verify multilingual transcription and tool-call compatibility using your own provider account and current provider documentation.

## Known limitations

- AI extraction may omit or misinterpret a fee, lender name, repayment date, or tenure. Confirm all values manually.
- A lender name match is a registry-name comparison, not legal due diligence. A possible match is not a verified identity; an app brand and the regulated legal lender may differ.
- The RBI workbook snapshot in this repository is not live data.
- The in-process rate limiter is not shared across multiple serverless instances.
- Provider endpoints and model availability can change. The integrations must be checked against current provider documentation and account access.
- The app does not authenticate individual borrowers or provide a lender recommendation.

## Project structure

```text
app/
  api/check/          # Audio, image, and text analysis endpoint
  api/speak/          # TTS endpoint
  page.tsx            # Application page
components/
  calculator.tsx      # Calculator and interactive UI
lib/
  finance/            # Deterministic schedules, cash flows, rates, tests
  lenders/            # RBI NBFC registry matching
  llm/                # Model tool calls and finance bridge
  speech/             # Speech-to-text and text-to-speech adapters
  vision/             # Screenshot extraction
  security/           # API rate limiting
scripts/
  import-nbfc.ts      # RBI workbook import
  delete-expired.ts   # Expired-record purge
supabase/migrations/  # Database schema and RLS
```

## Disclaimer

This project is provided for education and personal understanding. It does not verify the legality of a loan, determine whether a lender is licensed for a specific activity, or replace advice from a qualified financial or legal professional.
#   l o a n - c o s t - c a l c u l a t o r  
 