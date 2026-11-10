-- Run after 001_init.sql.

-- 1. Row level security: with no policies, the public anon key can touch nothing.
--    The server uses the service-role key, which bypasses RLS.
alter table nbfc_registry enable row level security;
alter table loan_checks   enable row level security;

-- 2. Cleanup.
alter table nbfc_registry drop constraint if exists nbfc_registry_name_normalised_unique;
drop table if exists comparison_rates;  -- rates live in config/comparison-rates.json

-- 3. loan_checks stores numbers only. No transcript, because speech can contain names or phone numbers.
alter table loan_checks drop column if exists transcript_text;
alter table loan_checks drop column if exists match_result;
alter table loan_checks drop column if exists summary_json;
alter table loan_checks
  add column if not exists session_id uuid not null default gen_random_uuid(),
  add column if not exists input_type text check (input_type in ('voice', 'screenshot', 'text')),
  add column if not exists language text,
  add column if not exists principal_paise bigint,
  add column if not exists received_paise bigint,
  add column if not exists fees_paise bigint,
  add column if not exists schedule jsonb,
  add column if not exists total_repay_paise bigint,
  add column if not exists effective_annual_rate numeric,
  add column if not exists lender_match text check (lender_match in ('found', 'possible_match', 'cancelled', 'not_found', 'unclear', 'unavailable'));

-- 4. Fuzzy lender lookup using the trigram index. Best match first; exact match beats similar.
create or replace function match_nbfc(q text, min_sim real default 0.45)
returns table (name_raw text, registration_number text, status text, sim real, is_exact boolean)
language sql stable as $$
  select r.name_raw, r.registration_number, r.status,
         similarity(r.name_normalised, q)::real,
         (r.name_normalised = q)
  from nbfc_registry r
  where r.name_normalised % q and similarity(r.name_normalised, q) >= min_sim
  order by (r.name_normalised = q) desc, similarity(r.name_normalised, q) desc
  limit 1;
$$;
revoke all on function match_nbfc(text, real) from public, anon, authenticated;
grant execute on function match_nbfc(text, real) to service_role;

alter table loan_checks rename column lender_name_raw to lender_name;
