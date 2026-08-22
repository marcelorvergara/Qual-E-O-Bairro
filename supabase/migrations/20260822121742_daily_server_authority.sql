-- Daily answers are server-only values. A salt plus a hash is enumerable for
-- this small answer space, so neither belongs in a browser response.
alter table public.daily_answers
  drop column salt,
  drop column answer_hash;

create table public.daily_guesses (
  id bigint generated always as identity primary key,
  puzzle_date date not null references public.daily_answers (puzzle_date),
  device_id text not null,
  cod text not null,
  created_at timestamptz not null default now(),
  unique (puzzle_date, device_id, cod)
);

create index daily_guesses_progress_idx
  on public.daily_guesses (puzzle_date, device_id, id);

create table public.daily_hints (
  id bigint generated always as identity primary key,
  puzzle_date date not null references public.daily_answers (puzzle_date),
  device_id text not null,
  tier smallint not null check (tier between 1 and 3),
  created_at timestamptz not null default now(),
  unique (puzzle_date, device_id, tier)
);

create index daily_hints_progress_idx
  on public.daily_hints (puzzle_date, device_id, tier);

alter table public.daily_guesses enable row level security;
alter table public.daily_hints enable row level security;

revoke all privileges on table public.daily_guesses, public.daily_hints
  from anon, authenticated;
grant select, insert on table public.daily_guesses, public.daily_hints
  to service_role;

alter table public.daily_action_counts
  drop constraint daily_action_counts_action_check;
alter table public.daily_action_counts
  add constraint daily_action_counts_action_check
  check (action in ('guess', 'hint', 'leaderboard', 'nickname', 'explainer', 'submit'));
