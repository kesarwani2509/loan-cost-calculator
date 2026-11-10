-- Safe upgrade for projects that already ran the original migration.
alter table if exists nbfc_registry add column if not exists source_file text;
alter table if exists nbfc_registry add column if not exists imported_at timestamptz not null default now();
alter table if exists nbfc_registry enable row level security;
alter table if exists loan_checks enable row level security;
alter table if exists comparison_rates enable row level security;

drop policy if exists "Public may read NBFC registry" on nbfc_registry;
create policy "Public may read NBFC registry" on nbfc_registry
  for select to anon, authenticated using (true);
drop policy if exists "Public may read comparison rates" on comparison_rates;
create policy "Public may read comparison rates" on comparison_rates
  for select to anon, authenticated using (true);
