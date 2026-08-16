create or replace function public.daily_leaderboard(p_date date, p_device text)
returns table (
  "position" bigint,
  nickname text,
  score integer,
  elapsed_seconds integer,
  is_self boolean
)
language sql
security definer
set search_path = public
as $$
  with ranked as (
    select
      daily_results.nickname,
      daily_results.score,
      daily_results.elapsed_seconds,
      daily_results.device_id,
      rank() over (
        order by daily_results.score, daily_results.elapsed_seconds
      ) as "position"
    from daily_results
    where puzzle_date = p_date
  )
  select
    "position",
    nickname,
    score,
    elapsed_seconds,
    device_id = p_device
  from ranked
  where "position" <= 50 or device_id = p_device
  order by "position", elapsed_seconds;
$$;

revoke all on function public.daily_leaderboard(date, text)
  from public, anon, authenticated;
grant execute on function public.daily_leaderboard(date, text)
  to service_role;
grant update on table public.daily_results to service_role;

alter table public.daily_action_counts
  drop constraint daily_action_counts_action_check;
alter table public.daily_action_counts
  add constraint daily_action_counts_action_check
  check (action in ('guess', 'hint', 'leaderboard', 'nickname'));

create or replace function public.consume_daily_action(
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
  first_action_today boolean;
begin
  select not exists (
    select 1
    from daily_action_counts
    where puzzle_date = requested_date
      and device_id = requested_device
  ) into first_action_today;

  insert into daily_action_counts (puzzle_date, device_id, action, action_count)
  values (requested_date, requested_device, requested_action, 1)
  on conflict (puzzle_date, device_id, action) do update
    set action_count = daily_action_counts.action_count + 1
    where daily_action_counts.action_count < action_limit
  returning action_count into consumed;

  if first_action_today then
    delete from daily_action_counts
    where created_at < now() - interval '7 days';
  end if;

  return consumed is not null and consumed <= action_limit;
end;
$$;

revoke all on function public.consume_daily_action(date, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.consume_daily_action(date, text, text, integer)
  to service_role;
