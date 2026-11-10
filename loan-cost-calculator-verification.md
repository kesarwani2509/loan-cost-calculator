# Implementation notes

## Applied changes

- Preserved the complete AI-derived repayment schedule in the API response and calculator UI. The calculator now retains each instalment amount, due day, and exact period fraction; changing a due day resets the exact fraction so the edited date drives the calculation.
- Added a separate stated-principal field so the benchmark comparison is not forced to infer principal from cash received plus fees.
- Added server-side validation and bounds for AI-derived amounts, schedules, payment dates, rate inputs, penalties, and rollovers.
- Connected explicit late-payment penalty and rollover terms to the finance bridge and returned their calculated exposures in the UI.
- Changed the Evon system message to the system role and revised tool guidance so ordinary offers with lender names return loan terms in one call; the server performs the registry lookup.
- Added audio/image MIME and size checks, text limits, response sanitisation, and basic API rate limiting.
- Enabled Supabase RLS. Public read policies are limited to the registry/reference tables; `loan_checks` has no client policy. Added registry source-file/import timestamp fields and an upgrade migration.
- Changed lender lookup to distinguish exact verification, a single possible match, ambiguous possible matches, no match, and inability to check. Database errors are no longer reported as “not found.”
- Added a scheduled GitHub Actions purge workflow for expired `loan_checks` records.
- Removed the starter README and replaced it with project-specific setup, architecture, environment, privacy, limitations, and test documentation.
- Added `.env.example`, server-only Supabase client protection, importer typing/date handling, and bridge validation tests.
- Tightened the 15-case evaluation suite to a 0.1% relative effective-rate tolerance.

## Verification

- Finance core TypeScript check: passed.
- 15-case loan description/finance evaluation: 15/15 passed with the tightened 0.1% relative tolerance.
- Additional finance smoke checks: passed, including multi-instalment schedule preservation and a 14-day cash-flow example.
- Full `npm ci`, `npm test`, `npm run lint`, and `npm run build` could not be completed in this environment because the package registry dependency download was unavailable. Run them locally after `npm ci`.

## Remaining deployment tasks

- Confirm each speech, vision, and LLM request/response contract against the current documentation for the provider account in use. No provider credentials or live provider calls were available during this code review.
- Configure the GitHub repository secrets required by the purge workflow.
- Use a shared rate limiter/firewall in production; the included in-memory limiter is per process and does not coordinate serverless instances.
- Refresh the bundled RBI workbook snapshot from the latest official publication before relying on current registry results.
- Rotate any API keys or Supabase service-role keys that were ever included in an earlier uploaded archive or repository history.
