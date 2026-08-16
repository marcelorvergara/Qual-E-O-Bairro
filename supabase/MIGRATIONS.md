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

Update this table whenever a new migration is applied.
