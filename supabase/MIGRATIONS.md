# Supabase migration workflow

This repository uses a shared Supabase project. Its remote migration ledger contains 23 older migrations owned by another application and absent from this repository. Consequently, `supabase db push` cannot reconcile this directory with the hosted project and must not be used. Do not repair, revert, or otherwise rewrite the remote ledger from this repository.

Every database change must use a new timestamped file in `supabase/migrations/`; never edit an applied migration. Make new migrations safe to re-run with patterns such as `create or replace function`, `drop constraint if exists` before `add constraint`, and `create index if not exists`.

After review, migrations are currently applied individually with:

```sh
supabase db query --linked --file supabase/migrations/<migration>.sql
```

This command executes the SQL but does not add the file to the remote migration ledger. Record the exact command and verification query in the PR description. Do not run `supabase db push` as a follow-up.

## Repository migration status

| Migration                               | Remote ledger | Hosted schema                       |
| --------------------------------------- | ------------- | ----------------------------------- |
| `202608150001_phase_3_daily.sql`        | Present       | Applied                             |
| `202608150002_harden_daily_access.sql`  | Present       | Applied                             |
| `202608160001_phase_3c_leaderboard.sql` | Absent        | Applied out of band with `db query` |
| `202608160002_phase_3d_explainer.sql`   | Absent        | Applied out of band with `db query` |

Update this table whenever a new migration is applied.

## Phase 3e deployment order

The daily hardening change is intentionally expand → deploy → contract. Apply the expansion migration first, deploy the `daily` and `submit` Edge Functions that use its transactional RPCs, then apply the contract migration that drops the legacy verifier columns:

```sh
supabase db query --linked --file supabase/migrations/20260822121742_daily_server_authority.sql
supabase functions deploy daily submit
supabase db query --linked --file supabase/migrations/20260822125450_daily_answer_contract.sql
```

Verify the expansion before deploying functions:

```sql
select to_regclass('public.daily_guesses'),
       to_regclass('public.daily_hints'),
       to_regprocedure('public.record_daily_guess(date,text,text,text,integer)'),
       has_sequence_privilege('anon', 'public.daily_guesses_id_seq', 'usage');
```

The first three values must be non-null and the sequence privilege must be false. After the contract migration, verify that `salt` and `answer_hash` are absent from `information_schema.columns` for `daily_answers`.
