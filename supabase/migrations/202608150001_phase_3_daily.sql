create table public.daily_answers (
  puzzle_date date primary key,
  puzzle_number integer not null unique,
  cod text not null,
  salt text not null,
  answer_hash text not null,
  created_at timestamptz not null default now()
);

create table public.daily_results (
  id uuid primary key default gen_random_uuid(),
  puzzle_date date not null references public.daily_answers (puzzle_date),
  device_id text not null,
  nickname text,
  guesses integer not null,
  hints integer not null,
  score integer not null,
  elapsed_seconds integer not null,
  guess_codes text[] not null,
  created_at timestamptz not null default now(),
  unique (puzzle_date, device_id)
);

create index daily_results_ranking_idx
  on public.daily_results (puzzle_date, score, elapsed_seconds);

create table public.bairro_explainers (
  cod text not null,
  lang text not null default 'pt-BR',
  body text not null,
  created_at timestamptz not null default now(),
  primary key (cod, lang)
);

create table public.daily_action_counts (
  puzzle_date date not null references public.daily_answers (puzzle_date),
  device_id text not null,
  action text not null check (action in ('guess', 'hint')),
  action_count integer not null default 0,
  primary key (puzzle_date, device_id, action)
);

alter table public.daily_answers enable row level security;
alter table public.daily_results enable row level security;
alter table public.bairro_explainers enable row level security;
alter table public.daily_action_counts enable row level security;

grant select on public.daily_answers to service_role;
grant select on public.daily_answers to anon, authenticated;
grant select, insert on public.daily_results to service_role;
grant select, insert, update on public.bairro_explainers to service_role;
grant select, insert, update on public.daily_action_counts to service_role;

comment on table public.daily_answers is
  'RLS intentionally has no anon or authenticated policies. Only service-role Edge Functions may access daily answers; do not add a permissive policy.';
comment on table public.daily_results is
  'RLS intentionally has no anon or authenticated policies. Access is mediated by service-role Edge Functions.';
comment on table public.bairro_explainers is
  'RLS intentionally has no anon or authenticated policies. Access is mediated by service-role Edge Functions.';

create function public.consume_daily_action(
  requested_date date,
  requested_device text,
  requested_action text,
  action_limit integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  consumed integer;
begin
  insert into daily_action_counts (puzzle_date, device_id, action, action_count)
  values (requested_date, requested_device, requested_action, 1)
  on conflict (puzzle_date, device_id, action) do update
    set action_count = daily_action_counts.action_count + 1
    where daily_action_counts.action_count < action_limit
  returning action_count into consumed;

  return consumed is not null and consumed <= action_limit;
end;
$$;

revoke all on function public.consume_daily_action(date, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.consume_daily_action(date, text, text, integer)
  to service_role;
