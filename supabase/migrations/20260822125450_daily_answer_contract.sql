-- Apply only after the daily and submit Edge Functions from Phase 3e are live.
alter table public.daily_answers
  drop column if exists salt,
  drop column if exists answer_hash;
