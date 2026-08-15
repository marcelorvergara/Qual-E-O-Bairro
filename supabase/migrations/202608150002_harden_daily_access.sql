-- Edge Functions use service_role. Browser roles must never access backend tables directly,
-- even if a permissive RLS policy is accidentally added in a later phase.
revoke all privileges on table
  public.daily_answers,
  public.daily_results,
  public.bairro_explainers,
  public.daily_action_counts
from anon, authenticated;

alter table public.daily_action_counts
  add column created_at timestamptz not null default now();

create index daily_action_counts_created_at_idx
  on public.daily_action_counts (created_at);
