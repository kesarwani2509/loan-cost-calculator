-- Initial schema. Run migrations in order using the Supabase SQL editor or CLI.
create extension if not exists pg_trgm;

create table if not exists nbfc_registry (
  id bigint generated always as identity primary key,
  name_raw text not null,
  name_normalised text not null unique,
  regional_office text,
  classification text,
  registration_number text,
  cin text,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  as_on_date date not null,
  source_file text,
  imported_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists idx_nbfc_name_trgm on nbfc_registry using gin (name_normalised gin_trgm_ops);
create index if not exists idx_nbfc_name_exact on nbfc_registry (name_normalised);

create table if not exists loan_checks (
  id bigint generated always as identity primary key,
  transcript_text text,
  lender_name_raw text,
  match_result jsonb,
  summary_json jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);
create index if not exists idx_loan_checks_expires on loan_checks (expires_at);

create table if not exists comparison_rates (
  id bigint generated always as identity primary key,
  product_key text not null unique,
  label text not null,
  annual_rate numeric(8,6) not null check (annual_rate >= 0),
  note text,
  updated_at timestamptz not null default now()
);

-- Never expose borrower analysis records to anon/authenticated clients.
alter table nbfc_registry enable row level security;
alter table loan_checks enable row level security;
alter table comparison_rates enable row level security;

drop policy if exists "Public may read NBFC registry" on nbfc_registry;
create policy "Public may read NBFC registry" on nbfc_registry
  for select to anon, authenticated using (true);
drop policy if exists "Public may read comparison rates" on comparison_rates;
create policy "Public may read comparison rates" on comparison_rates
  for select to anon, authenticated using (true);
-- No client policies are intentionally created for loan_checks.
-- Server operations use SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS.
