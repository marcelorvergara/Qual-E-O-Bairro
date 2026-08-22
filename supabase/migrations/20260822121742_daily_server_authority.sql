-- Expand first: deployed functions may continue to use the old daily_answers
-- columns until the contract migration is applied after their deployment.
create table if not exists public.daily_guesses (
  id bigint generated always as identity primary key,
  puzzle_date date not null references public.daily_answers (puzzle_date) on delete cascade,
  device_id text not null,
  cod text not null,
  created_at timestamptz not null default now(),
  unique (puzzle_date, device_id, cod)
);

create index if not exists daily_guesses_progress_idx
  on public.daily_guesses (puzzle_date, device_id, id);

create table if not exists public.daily_hints (
  id bigint generated always as identity primary key,
  puzzle_date date not null references public.daily_answers (puzzle_date) on delete cascade,
  device_id text not null,
  tier smallint not null check (tier between 1 and 3),
  created_at timestamptz not null default now(),
  unique (puzzle_date, device_id, tier)
);

create index if not exists daily_hints_progress_idx
  on public.daily_hints (puzzle_date, device_id, tier);

alter table public.daily_results
  drop constraint if exists daily_results_puzzle_date_fkey;
alter table public.daily_results
  add constraint daily_results_puzzle_date_fkey
  foreign key (puzzle_date) references public.daily_answers (puzzle_date) on delete cascade;

alter table public.daily_action_counts
  drop constraint if exists daily_action_counts_puzzle_date_fkey;
alter table public.daily_action_counts
  add constraint daily_action_counts_puzzle_date_fkey
  foreign key (puzzle_date) references public.daily_answers (puzzle_date) on delete cascade;

alter table public.daily_action_counts
  drop constraint if exists daily_action_counts_action_check;
alter table public.daily_action_counts
  add constraint daily_action_counts_action_check
  check (action in ('guess', 'hint', 'leaderboard', 'nickname', 'explainer', 'submit'));

alter table public.daily_guesses enable row level security;
alter table public.daily_hints enable row level security;
revoke all privileges on table public.daily_guesses, public.daily_hints
  from public, anon, authenticated;
grant select on table public.daily_guesses, public.daily_hints to service_role;
revoke all privileges on sequence public.daily_guesses_id_seq, public.daily_hints_id_seq
  from public, anon, authenticated;

create or replace function public.record_daily_guess(
  requested_date date,
  requested_device text,
  requested_cod text,
  expected_answer text,
  action_limit integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  consumed integer;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(requested_date::text || ':' || requested_device, 0)
  );

  if exists (
    select 1 from daily_results
    where puzzle_date = requested_date and device_id = requested_device
  ) or exists (
    select 1 from daily_guesses
    where puzzle_date = requested_date
      and device_id = requested_device
      and cod = expected_answer
  ) then
    return jsonb_build_object('status', 'game_complete');
  end if;

  if exists (
    select 1 from daily_guesses
    where puzzle_date = requested_date
      and device_id = requested_device
      and cod = requested_cod
  ) then
    return jsonb_build_object('status', 'duplicate_guess');
  end if;

  insert into daily_action_counts (puzzle_date, device_id, action, action_count)
  values (requested_date, requested_device, 'guess', 1)
  on conflict (puzzle_date, device_id, action) do update
    set action_count = daily_action_counts.action_count + 1
    where daily_action_counts.action_count < action_limit
  returning action_count into consumed;
  if consumed is null then return jsonb_build_object('status', 'rate_limited'); end if;

  insert into daily_guesses (puzzle_date, device_id, cod)
  values (requested_date, requested_device, requested_cod);
  return jsonb_build_object('status', 'accepted');
end;
$$;

create or replace function public.record_daily_hint(
  requested_date date,
  requested_device text,
  requested_tier smallint,
  expected_answer text,
  action_limit integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  consumed integer;
  next_tier smallint;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(requested_date::text || ':' || requested_device, 0)
  );

  if exists (
    select 1 from daily_results
    where puzzle_date = requested_date and device_id = requested_device
  ) or exists (
    select 1 from daily_guesses
    where puzzle_date = requested_date
      and device_id = requested_device
      and cod = expected_answer
  ) then
    return jsonb_build_object('status', 'game_complete');
  end if;

  select coalesce(max(tier), 0)::smallint + 1 into next_tier
  from daily_hints
  where puzzle_date = requested_date and device_id = requested_device;
  if requested_tier <> next_tier or requested_tier > 3 then
    return jsonb_build_object('status', 'invalid_hint_tier');
  end if;

  insert into daily_action_counts (puzzle_date, device_id, action, action_count)
  values (requested_date, requested_device, 'hint', 1)
  on conflict (puzzle_date, device_id, action) do update
    set action_count = daily_action_counts.action_count + 1
    where daily_action_counts.action_count < action_limit
  returning action_count into consumed;
  if consumed is null then return jsonb_build_object('status', 'rate_limited'); end if;

  insert into daily_hints (puzzle_date, device_id, tier)
  values (requested_date, requested_device, requested_tier);
  return jsonb_build_object('status', 'accepted');
end;
$$;

create or replace function public.complete_daily_result(
  requested_date date,
  requested_device text,
  expected_answer text,
  requested_nickname text,
  action_limit integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  consumed integer;
  guess_count integer;
  hint_count integer;
  first_guess_at timestamptz;
  final_guess_at timestamptz;
  final_cod text;
  guess_codes text[];
begin
  perform pg_advisory_xact_lock(
    hashtextextended(requested_date::text || ':' || requested_device, 0)
  );

  if exists (
    select 1 from daily_results
    where puzzle_date = requested_date and device_id = requested_device
  ) then
    return jsonb_build_object('status', 'already_submitted');
  end if;

  select
    count(*)::integer,
    min(created_at),
    max(created_at),
    array_agg(cod order by id)
  into guess_count, first_guess_at, final_guess_at, guess_codes
  from daily_guesses
  where puzzle_date = requested_date and device_id = requested_device;
  select cod into final_cod
  from daily_guesses
  where puzzle_date = requested_date and device_id = requested_device
  order by id desc
  limit 1;

  if guess_count = 0 or final_cod <> expected_answer then
    return jsonb_build_object('status', 'incomplete_game');
  end if;
  if exists (
    select 1 from daily_guesses
    where puzzle_date = requested_date
      and device_id = requested_device
      and cod = expected_answer
      and id <> (
        select max(id) from daily_guesses
        where puzzle_date = requested_date and device_id = requested_device
      )
  ) then
    return jsonb_build_object('status', 'impossible_sequence');
  end if;

  insert into daily_action_counts (puzzle_date, device_id, action, action_count)
  values (requested_date, requested_device, 'submit', 1)
  on conflict (puzzle_date, device_id, action) do update
    set action_count = daily_action_counts.action_count + 1
    where daily_action_counts.action_count < action_limit
  returning action_count into consumed;
  if consumed is null then return jsonb_build_object('status', 'rate_limited'); end if;

  select count(*)::integer into hint_count
  from daily_hints
  where puzzle_date = requested_date and device_id = requested_device;
  insert into daily_results (
    puzzle_date, device_id, nickname, guesses, hints, score,
    elapsed_seconds, guess_codes
  ) values (
    requested_date, requested_device, requested_nickname, guess_count,
    hint_count, guess_count + hint_count,
    greatest(1, floor(extract(epoch from final_guess_at - first_guess_at))::integer),
    guess_codes
  );
  return jsonb_build_object(
    'status', 'accepted',
    'score', guess_count + hint_count,
    'elapsed_seconds', greatest(1, floor(extract(epoch from final_guess_at - first_guess_at))::integer)
  );
end;
$$;

revoke all on function public.record_daily_guess(date, text, text, text, integer)
  from public, anon, authenticated;
revoke all on function public.record_daily_hint(date, text, smallint, text, integer)
  from public, anon, authenticated;
revoke all on function public.complete_daily_result(date, text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.record_daily_guess(date, text, text, text, integer),
  public.record_daily_hint(date, text, smallint, text, integer),
  public.complete_daily_result(date, text, text, text, integer)
  to service_role;
