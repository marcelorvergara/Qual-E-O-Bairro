-- Applied individually with `supabase db query`; see supabase/MIGRATIONS.md.
grant select, insert on table public.bairro_explainers to service_role;

alter table public.daily_action_counts
  drop constraint if exists daily_action_counts_action_check;
alter table public.daily_action_counts
  add constraint daily_action_counts_action_check
  check (action in ('guess', 'hint', 'leaderboard', 'nickname', 'explainer'));

-- The bairro_explainers primary key (cod, lang) already covers cache lookups.
