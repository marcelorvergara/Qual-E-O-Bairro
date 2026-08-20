-- Point-in-time snapshot of the production public schema.
-- NOT a migration and not replayable. The migration ledger in
-- supabase/migrations is misaligned with production; `supabase db push`
-- does not work on this project. This file exists so the schema can be
-- reconstructed by hand if the project is lost.
-- Generated: 2026-08-20, before the launch epoch reset.

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."consume_daily_action"("requested_date" "date", "requested_device" "text", "requested_action" "text", "action_limit" integer) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."consume_daily_action"("requested_date" "date", "requested_device" "text", "requested_action" "text", "action_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."daily_leaderboard"("p_date" "date", "p_device" "text") RETURNS TABLE("position" bigint, "nickname" "text", "score" integer, "elapsed_seconds" integer, "is_self" boolean)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."daily_leaderboard"("p_date" "date", "p_device" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.users (id, email)
  values (new.id, new.email);
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."start_llm_run"("p_ticket_id" "uuid", "p_node" "text", "p_provider" "text", "p_model" "text", "p_input" "jsonb", "p_actor_id" "uuid", "p_estimated_cost_usd" numeric, "p_confirm_over_budget" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_existing record;
  v_stale_cutoff timestamptz := now() - interval '10 minutes';
  v_max_cost numeric;
  v_accumulated numeric;
  v_reserved numeric;
  v_over_budget boolean;
  v_reason text;
  v_new_run_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext(p_ticket_id::text));

  select id, created_at into v_existing
  from agent_runs
  where ticket_id = p_ticket_id and status = 'running'
  order by created_at desc
  limit 1
  for update;

  if found then
    if v_existing.created_at < v_stale_cutoff then
      -- Abandoned: we genuinely don't know what the provider did with an
      -- invocation whose Edge Function never came back to resolve it.
      update agent_runs
      set status = 'failed',
          error = 'Abandoned run reaped by start_llm_run (exceeded staleness threshold).',
          accounting_status = 'unknown',
          cost_usd = null
      where id = v_existing.id;
    else
      return jsonb_build_object('status', 'already_running', 'agent_run_id', v_existing.id);
    end if;
  end if;

  select max_cost_per_ticket into v_max_cost from app_settings limit 1;

  select coalesce(sum(cost_usd), 0) into v_accumulated
  from agent_runs
  where ticket_id = p_ticket_id and accounting_status = 'priced';

  select coalesce(sum(estimated_cost_usd), 0) into v_reserved
  from agent_runs
  where ticket_id = p_ticket_id and status = 'running';

  if p_estimated_cost_usd is null then
    v_over_budget := true;
    v_reason := 'unknown_estimate';
  elsif v_max_cost is not null and (v_accumulated + v_reserved + p_estimated_cost_usd) > v_max_cost then
    v_over_budget := true;
    v_reason := 'over_budget';
  else
    v_over_budget := false;
  end if;

  if v_over_budget and not p_confirm_over_budget then
    return jsonb_build_object(
      'status', 'confirmation_required',
      'reason', v_reason,
      'accumulated_cost_usd', v_accumulated,
      'reserved_cost_usd', v_reserved,
      'budget_usd', v_max_cost,
      'estimated_cost_usd', p_estimated_cost_usd
    );
  end if;

  insert into agent_runs (ticket_id, node, provider, model, status, input, estimated_cost_usd)
  values (p_ticket_id, p_node, p_provider, p_model, 'running', p_input, p_estimated_cost_usd)
  returning id into v_new_run_id;

  -- Bound 1:1 to the run it authorizes, atomically in the same
  -- transaction -- there is no free-standing confirmation a client could
  -- replay against a later run (budget_confirmations_agent_run_id_idx
  -- also enforces this at the DB level).
  if v_over_budget then
    insert into budget_confirmations (
      ticket_id, agent_run_id, actor_id, node,
      estimated_cost_usd, accumulated_cost_usd, reserved_cost_usd, budget_usd
    ) values (
      p_ticket_id, v_new_run_id, p_actor_id, p_node,
      p_estimated_cost_usd, v_accumulated, v_reserved, v_max_cost
    );
  end if;

  return jsonb_build_object('status', 'started', 'agent_run_id', v_new_run_id);
end;
$$;


ALTER FUNCTION "public"."start_llm_run"("p_ticket_id" "uuid", "p_node" "text", "p_provider" "text", "p_model" "text", "p_input" "jsonb", "p_actor_id" "uuid", "p_estimated_cost_usd" numeric, "p_confirm_over_budget" boolean) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."agent_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ticket_id" "uuid" NOT NULL,
    "node" "text" NOT NULL,
    "provider" "text" NOT NULL,
    "model" "text",
    "status" "text" DEFAULT 'running'::"text" NOT NULL,
    "input" "jsonb",
    "output" "jsonb",
    "error" "text",
    "cost_usd" numeric(10,4),
    "tokens_in" integer,
    "tokens_out" integer,
    "confidence" numeric(3,2),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_model" "text",
    "accounting_status" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "estimated_cost_usd" numeric(10,4),
    CONSTRAINT "agent_runs_accounting_status_check" CHECK (("accounting_status" = ANY (ARRAY['priced'::"text", 'non_billable'::"text", 'unpriced'::"text", 'unknown'::"text", 'legacy_unknown'::"text"]))),
    CONSTRAINT "agent_runs_provider_check" CHECK (("provider" = ANY (ARRAY['anthropic'::"text", 'gemini'::"text", 'openai'::"text", 'github'::"text"]))),
    CONSTRAINT "agent_runs_status_check" CHECK (("status" = ANY (ARRAY['running'::"text", 'succeeded'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."agent_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_settings" (
    "id" boolean DEFAULT true NOT NULL,
    "allow_self_approval" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "max_cost_per_ticket" numeric(10,4),
    CONSTRAINT "app_settings_id_check" CHECK ("id")
);


ALTER TABLE "public"."app_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bairro_explainers" (
    "cod" "text" NOT NULL,
    "lang" "text" DEFAULT 'pt-BR'::"text" NOT NULL,
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."bairro_explainers" OWNER TO "postgres";


COMMENT ON TABLE "public"."bairro_explainers" IS 'RLS intentionally has no anon or authenticated policies. Access is mediated by service-role Edge Functions.';



CREATE TABLE IF NOT EXISTS "public"."budget_confirmations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ticket_id" "uuid" NOT NULL,
    "agent_run_id" "uuid" NOT NULL,
    "actor_id" "uuid" NOT NULL,
    "node" "text" NOT NULL,
    "estimated_cost_usd" numeric(10,4),
    "accumulated_cost_usd" numeric(10,4) NOT NULL,
    "reserved_cost_usd" numeric(10,4) DEFAULT 0 NOT NULL,
    "budget_usd" numeric(10,4),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."budget_confirmations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_action_counts" (
    "puzzle_date" "date" NOT NULL,
    "device_id" "text" NOT NULL,
    "action" "text" NOT NULL,
    "action_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "daily_action_counts_action_check" CHECK (("action" = ANY (ARRAY['guess'::"text", 'hint'::"text", 'leaderboard'::"text", 'nickname'::"text", 'explainer'::"text"])))
);


ALTER TABLE "public"."daily_action_counts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_answers" (
    "puzzle_date" "date" NOT NULL,
    "puzzle_number" integer NOT NULL,
    "cod" "text" NOT NULL,
    "salt" "text" NOT NULL,
    "answer_hash" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."daily_answers" OWNER TO "postgres";


COMMENT ON TABLE "public"."daily_answers" IS 'RLS intentionally has no anon or authenticated policies. Only service-role Edge Functions may access daily answers; do not add a permissive policy.';



CREATE TABLE IF NOT EXISTS "public"."daily_results" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "puzzle_date" "date" NOT NULL,
    "device_id" "text" NOT NULL,
    "nickname" "text",
    "guesses" integer NOT NULL,
    "hints" integer NOT NULL,
    "score" integer NOT NULL,
    "elapsed_seconds" integer NOT NULL,
    "guess_codes" "text"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."daily_results" OWNER TO "postgres";


COMMENT ON TABLE "public"."daily_results" IS 'RLS intentionally has no anon or authenticated policies. Access is mediated by service-role Edge Functions.';



CREATE TABLE IF NOT EXISTS "public"."deployment_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ticket_id" "uuid" NOT NULL,
    "environment" "text" NOT NULL,
    "status" "text" NOT NULL,
    "git_sha" "text",
    "pr_number" integer,
    "preview_url" "text",
    "deployed_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "deployment_events_environment_check" CHECK (("environment" = ANY (ARRAY['dev'::"text", 'hmg'::"text", 'prod'::"text"]))),
    CONSTRAINT "deployment_events_status_check" CHECK (("status" = ANY (ARRAY['success'::"text", 'failure'::"text"])))
);


ALTER TABLE "public"."deployment_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."escalation_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ticket_id" "uuid" NOT NULL,
    "event_kind" "text" NOT NULL,
    "reason" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "source_node" "text" NOT NULL,
    "source_type" "text" NOT NULL,
    "source_identifier" "uuid",
    "evidence" "jsonb",
    "actor_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "escalation_events_event_kind_check" CHECK (("event_kind" = ANY (ARRAY['escalated'::"text", 'resolved'::"text"]))),
    CONSTRAINT "escalation_events_reason_check" CHECK (("reason" <@ ARRAY['loop_budget_exhausted'::"text", 'planning_low_confidence'::"text", 'estimated_pr_too_large'::"text"])),
    CONSTRAINT "escalation_events_source_type_check" CHECK (("source_type" = ANY (ARRAY['automatic'::"text", 'manual'::"text"])))
);


ALTER TABLE "public"."escalation_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gate_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ticket_id" "uuid" NOT NULL,
    "actor_id" "uuid" NOT NULL,
    "gate" "text" NOT NULL,
    "decision" "text" NOT NULL,
    "question" "text" NOT NULL,
    "notes" "text",
    "self_approved" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "gate_events_decision_check" CHECK (("decision" = ANY (ARRAY['claim'::"text", 'assign'::"text", 'reject'::"text", 'approve'::"text", 'request_changes'::"text", 'block'::"text", 'rollback'::"text", 'escalate'::"text"]))),
    CONSTRAINT "gate_events_gate_check" CHECK (("gate" = ANY (ARRAY['developer_picks'::"text", 'plan_review'::"text", 'merge_decision'::"text", 'promote_to_prod'::"text"])))
);


ALTER TABLE "public"."gate_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hmg_validations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ticket_id" "uuid" NOT NULL,
    "actor_id" "uuid" NOT NULL,
    "head_sha" "text" NOT NULL,
    "preview_url" "text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."hmg_validations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ticket_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ticket_id" "uuid" NOT NULL,
    "actor_id" "uuid" NOT NULL,
    "note" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ticket_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tickets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ticket_number" integer NOT NULL,
    "ticket_key" "text" GENERATED ALWAYS AS (('FI-'::"text" || ("ticket_number")::"text")) STORED,
    "title" "text" NOT NULL,
    "description" "text",
    "type" "text",
    "priority" "text",
    "risk" "text",
    "status" "text" DEFAULT 'backlog'::"text" NOT NULL,
    "current_node" "text",
    "assignee_id" "uuid",
    "branch_name" "text",
    "pr_number" integer,
    "preview_url" "text",
    "estimated_pr_lines" integer,
    "loop_attempts" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "head_sha" "text",
    "production_sha" "text",
    CONSTRAINT "tickets_priority_check" CHECK (("priority" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text", 'critical'::"text"]))),
    CONSTRAINT "tickets_risk_check" CHECK (("risk" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text"]))),
    CONSTRAINT "tickets_status_check" CHECK (("status" = ANY (ARRAY['backlog'::"text", 'triage'::"text", 'discovery'::"text", 'planning'::"text", 'development'::"text", 'verification'::"text", 'review'::"text", 'hmg'::"text", 'production'::"text", 'done'::"text", 'escalated'::"text"]))),
    CONSTRAINT "tickets_type_check" CHECK (("type" = ANY (ARRAY['feature'::"text", 'hotfix'::"text", 'chore'::"text", 'bug'::"text"])))
);


ALTER TABLE "public"."tickets" OWNER TO "postgres";


ALTER TABLE "public"."tickets" ALTER COLUMN "ticket_number" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."tickets_ticket_number_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "display_name" "text",
    "role" "text" DEFAULT 'developer'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "users_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'developer'::"text", 'reviewer'::"text"])))
);


ALTER TABLE "public"."users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."verification_checks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ticket_id" "uuid" NOT NULL,
    "check_kind" "text" NOT NULL,
    "workflow_name" "text" NOT NULL,
    "run_id" bigint NOT NULL,
    "run_attempt" integer,
    "head_sha" "text" NOT NULL,
    "status" "text" NOT NULL,
    "conclusion" "text",
    "html_url" "text",
    "findings" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "verification_checks_check_kind_check" CHECK (("check_kind" = ANY (ARRAY['test'::"text", 'static_analysis'::"text"]))),
    CONSTRAINT "verification_checks_conclusion_check" CHECK (("conclusion" = ANY (ARRAY['success'::"text", 'failure'::"text", 'cancelled'::"text", 'skipped'::"text", 'timed_out'::"text", 'action_required'::"text", 'neutral'::"text", 'stale'::"text"]))),
    CONSTRAINT "verification_checks_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'in_progress'::"text", 'completed'::"text"])))
);


ALTER TABLE "public"."verification_checks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."webhook_deliveries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "delivery_id" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "action" "text",
    "repo" "text" NOT NULL,
    "branch" "text",
    "ticket_id" "uuid",
    "pr_number" integer,
    "pr_url" "text",
    "base_branch" "text",
    "head_sha" "text",
    "status" "text" DEFAULT 'processing'::"text" NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "webhook_deliveries_status_check" CHECK (("status" = ANY (ARRAY['processing'::"text", 'processed'::"text", 'ignored'::"text", 'error'::"text"])))
);


ALTER TABLE "public"."webhook_deliveries" OWNER TO "postgres";


ALTER TABLE ONLY "public"."agent_runs"
    ADD CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_settings"
    ADD CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bairro_explainers"
    ADD CONSTRAINT "bairro_explainers_pkey" PRIMARY KEY ("cod", "lang");



ALTER TABLE ONLY "public"."budget_confirmations"
    ADD CONSTRAINT "budget_confirmations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_action_counts"
    ADD CONSTRAINT "daily_action_counts_pkey" PRIMARY KEY ("puzzle_date", "device_id", "action");



ALTER TABLE ONLY "public"."daily_answers"
    ADD CONSTRAINT "daily_answers_pkey" PRIMARY KEY ("puzzle_date");



ALTER TABLE ONLY "public"."daily_answers"
    ADD CONSTRAINT "daily_answers_puzzle_number_key" UNIQUE ("puzzle_number");



ALTER TABLE ONLY "public"."daily_results"
    ADD CONSTRAINT "daily_results_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_results"
    ADD CONSTRAINT "daily_results_puzzle_date_device_id_key" UNIQUE ("puzzle_date", "device_id");



ALTER TABLE ONLY "public"."deployment_events"
    ADD CONSTRAINT "deployment_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."escalation_events"
    ADD CONSTRAINT "escalation_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gate_events"
    ADD CONSTRAINT "gate_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hmg_validations"
    ADD CONSTRAINT "hmg_validations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ticket_notes"
    ADD CONSTRAINT "ticket_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."verification_checks"
    ADD CONSTRAINT "verification_checks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."webhook_deliveries"
    ADD CONSTRAINT "webhook_deliveries_delivery_id_key" UNIQUE ("delivery_id");



ALTER TABLE ONLY "public"."webhook_deliveries"
    ADD CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id");



CREATE INDEX "agent_runs_ticket_id_idx" ON "public"."agent_runs" USING "btree" ("ticket_id");



CREATE UNIQUE INDEX "budget_confirmations_agent_run_id_idx" ON "public"."budget_confirmations" USING "btree" ("agent_run_id");



CREATE INDEX "budget_confirmations_ticket_id_idx" ON "public"."budget_confirmations" USING "btree" ("ticket_id");



CREATE INDEX "daily_action_counts_created_at_idx" ON "public"."daily_action_counts" USING "btree" ("created_at");



CREATE INDEX "daily_results_ranking_idx" ON "public"."daily_results" USING "btree" ("puzzle_date", "score", "elapsed_seconds");



CREATE INDEX "deployment_events_ticket_id_idx" ON "public"."deployment_events" USING "btree" ("ticket_id");



CREATE INDEX "escalation_events_ticket_id_idx" ON "public"."escalation_events" USING "btree" ("ticket_id");



CREATE INDEX "gate_events_actor_id_idx" ON "public"."gate_events" USING "btree" ("actor_id");



CREATE INDEX "gate_events_ticket_id_idx" ON "public"."gate_events" USING "btree" ("ticket_id");



CREATE INDEX "hmg_validations_actor_id_idx" ON "public"."hmg_validations" USING "btree" ("actor_id");



CREATE INDEX "hmg_validations_ticket_id_idx" ON "public"."hmg_validations" USING "btree" ("ticket_id");



CREATE INDEX "ticket_notes_actor_id_idx" ON "public"."ticket_notes" USING "btree" ("actor_id");



CREATE INDEX "ticket_notes_ticket_id_idx" ON "public"."ticket_notes" USING "btree" ("ticket_id");



CREATE INDEX "tickets_assignee_id_idx" ON "public"."tickets" USING "btree" ("assignee_id");



CREATE INDEX "tickets_current_node_idx" ON "public"."tickets" USING "btree" ("current_node");



CREATE INDEX "tickets_status_idx" ON "public"."tickets" USING "btree" ("status");



CREATE UNIQUE INDEX "tickets_ticket_key_idx" ON "public"."tickets" USING "btree" ("ticket_key");



CREATE INDEX "users_role_idx" ON "public"."users" USING "btree" ("role");



CREATE INDEX "verification_checks_ticket_id_idx" ON "public"."verification_checks" USING "btree" ("ticket_id");



CREATE UNIQUE INDEX "verification_checks_ticket_run_idx" ON "public"."verification_checks" USING "btree" ("ticket_id", "run_id");



CREATE INDEX "webhook_deliveries_ticket_id_idx" ON "public"."webhook_deliveries" USING "btree" ("ticket_id");



CREATE OR REPLACE TRIGGER "agent_runs_set_updated_at" BEFORE UPDATE ON "public"."agent_runs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "app_settings_set_updated_at" BEFORE UPDATE ON "public"."app_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "deployment_events_set_updated_at" BEFORE UPDATE ON "public"."deployment_events" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "gate_events_set_updated_at" BEFORE UPDATE ON "public"."gate_events" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "hmg_validations_set_updated_at" BEFORE UPDATE ON "public"."hmg_validations" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "ticket_notes_set_updated_at" BEFORE UPDATE ON "public"."ticket_notes" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "tickets_set_updated_at" BEFORE UPDATE ON "public"."tickets" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "users_set_updated_at" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "verification_checks_set_updated_at" BEFORE UPDATE ON "public"."verification_checks" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "webhook_deliveries_set_updated_at" BEFORE UPDATE ON "public"."webhook_deliveries" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."agent_runs"
    ADD CONSTRAINT "agent_runs_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id");



ALTER TABLE ONLY "public"."budget_confirmations"
    ADD CONSTRAINT "budget_confirmations_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."budget_confirmations"
    ADD CONSTRAINT "budget_confirmations_agent_run_id_fkey" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id");



ALTER TABLE ONLY "public"."budget_confirmations"
    ADD CONSTRAINT "budget_confirmations_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id");



ALTER TABLE ONLY "public"."daily_action_counts"
    ADD CONSTRAINT "daily_action_counts_puzzle_date_fkey" FOREIGN KEY ("puzzle_date") REFERENCES "public"."daily_answers"("puzzle_date");



ALTER TABLE ONLY "public"."daily_results"
    ADD CONSTRAINT "daily_results_puzzle_date_fkey" FOREIGN KEY ("puzzle_date") REFERENCES "public"."daily_answers"("puzzle_date");



ALTER TABLE ONLY "public"."deployment_events"
    ADD CONSTRAINT "deployment_events_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id");



ALTER TABLE ONLY "public"."escalation_events"
    ADD CONSTRAINT "escalation_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."escalation_events"
    ADD CONSTRAINT "escalation_events_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id");



ALTER TABLE ONLY "public"."gate_events"
    ADD CONSTRAINT "gate_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."gate_events"
    ADD CONSTRAINT "gate_events_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id");



ALTER TABLE ONLY "public"."hmg_validations"
    ADD CONSTRAINT "hmg_validations_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."hmg_validations"
    ADD CONSTRAINT "hmg_validations_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id");



ALTER TABLE ONLY "public"."ticket_notes"
    ADD CONSTRAINT "ticket_notes_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."ticket_notes"
    ADD CONSTRAINT "ticket_notes_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id");



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."verification_checks"
    ADD CONSTRAINT "verification_checks_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id");



ALTER TABLE ONLY "public"."webhook_deliveries"
    ADD CONSTRAINT "webhook_deliveries_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id");



ALTER TABLE "public"."agent_runs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agent_runs_select_authenticated" ON "public"."agent_runs" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."app_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "app_settings_select_authenticated" ON "public"."app_settings" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "app_settings_update_admin" ON "public"."app_settings" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = 'admin'::"text")))));



ALTER TABLE "public"."bairro_explainers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."budget_confirmations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "budget_confirmations_select_authenticated" ON "public"."budget_confirmations" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."daily_action_counts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_answers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_results" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."deployment_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "deployment_events_select_authenticated" ON "public"."deployment_events" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."escalation_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "escalation_events_insert_resolution" ON "public"."escalation_events" FOR INSERT TO "authenticated" WITH CHECK ((("event_kind" = 'resolved'::"text") AND ("actor_id" = "auth"."uid"()) AND ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = ANY (ARRAY['admin'::"text", 'reviewer'::"text"]))))) OR (( SELECT "app_settings"."allow_self_approval"
   FROM "public"."app_settings"
 LIMIT 1) AND (EXISTS ( SELECT 1
   FROM "public"."tickets" "t"
  WHERE (("t"."id" = "escalation_events"."ticket_id") AND ("t"."assignee_id" = "auth"."uid"()))))))));



CREATE POLICY "escalation_events_select_authenticated" ON "public"."escalation_events" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."gate_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "gate_events_insert" ON "public"."gate_events" FOR INSERT TO "authenticated" WITH CHECK ((("actor_id" = "auth"."uid"()) AND (("gate" = 'developer_picks'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = ANY (ARRAY['admin'::"text", 'reviewer'::"text"]))))) OR (( SELECT "app_settings"."allow_self_approval"
   FROM "public"."app_settings"
 LIMIT 1) AND (EXISTS ( SELECT 1
   FROM "public"."tickets" "t"
  WHERE (("t"."id" = "gate_events"."ticket_id") AND ("t"."assignee_id" = "auth"."uid"()))))))));



CREATE POLICY "gate_events_select_authenticated" ON "public"."gate_events" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."hmg_validations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "hmg_validations_insert" ON "public"."hmg_validations" FOR INSERT TO "authenticated" WITH CHECK (("actor_id" = "auth"."uid"()));



CREATE POLICY "hmg_validations_select_authenticated" ON "public"."hmg_validations" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."ticket_notes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ticket_notes_insert" ON "public"."ticket_notes" FOR INSERT TO "authenticated" WITH CHECK (("actor_id" = "auth"."uid"()));



CREATE POLICY "ticket_notes_select_authenticated" ON "public"."ticket_notes" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."tickets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tickets_insert_authenticated" ON "public"."tickets" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "tickets_select_authenticated" ON "public"."tickets" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "tickets_update_authenticated" ON "public"."tickets" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users_select_authenticated" ON "public"."users" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "users_update_self" ON "public"."users" FOR UPDATE TO "authenticated" USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));



ALTER TABLE "public"."verification_checks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "verification_checks_select_authenticated" ON "public"."verification_checks" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."webhook_deliveries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "webhook_deliveries_select_authenticated" ON "public"."webhook_deliveries" FOR SELECT TO "authenticated" USING (true);



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."consume_daily_action"("requested_date" "date", "requested_device" "text", "requested_action" "text", "action_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."consume_daily_action"("requested_date" "date", "requested_device" "text", "requested_action" "text", "action_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."daily_leaderboard"("p_date" "date", "p_device" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."daily_leaderboard"("p_date" "date", "p_device" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."start_llm_run"("p_ticket_id" "uuid", "p_node" "text", "p_provider" "text", "p_model" "text", "p_input" "jsonb", "p_actor_id" "uuid", "p_estimated_cost_usd" numeric, "p_confirm_over_budget" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."start_llm_run"("p_ticket_id" "uuid", "p_node" "text", "p_provider" "text", "p_model" "text", "p_input" "jsonb", "p_actor_id" "uuid", "p_estimated_cost_usd" numeric, "p_confirm_over_budget" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."start_llm_run"("p_ticket_id" "uuid", "p_node" "text", "p_provider" "text", "p_model" "text", "p_input" "jsonb", "p_actor_id" "uuid", "p_estimated_cost_usd" numeric, "p_confirm_over_budget" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."start_llm_run"("p_ticket_id" "uuid", "p_node" "text", "p_provider" "text", "p_model" "text", "p_input" "jsonb", "p_actor_id" "uuid", "p_estimated_cost_usd" numeric, "p_confirm_over_budget" boolean) TO "service_role";



GRANT ALL ON TABLE "public"."agent_runs" TO "anon";
GRANT ALL ON TABLE "public"."agent_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_runs" TO "service_role";



GRANT ALL ON TABLE "public"."app_settings" TO "anon";
GRANT ALL ON TABLE "public"."app_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."app_settings" TO "service_role";



GRANT ALL ON TABLE "public"."bairro_explainers" TO "service_role";



GRANT ALL ON TABLE "public"."budget_confirmations" TO "anon";
GRANT ALL ON TABLE "public"."budget_confirmations" TO "authenticated";
GRANT ALL ON TABLE "public"."budget_confirmations" TO "service_role";



GRANT ALL ON TABLE "public"."daily_action_counts" TO "service_role";



GRANT ALL ON TABLE "public"."daily_answers" TO "service_role";



GRANT ALL ON TABLE "public"."daily_results" TO "service_role";



GRANT ALL ON TABLE "public"."deployment_events" TO "anon";
GRANT ALL ON TABLE "public"."deployment_events" TO "authenticated";
GRANT ALL ON TABLE "public"."deployment_events" TO "service_role";



GRANT ALL ON TABLE "public"."escalation_events" TO "anon";
GRANT ALL ON TABLE "public"."escalation_events" TO "authenticated";
GRANT ALL ON TABLE "public"."escalation_events" TO "service_role";



GRANT ALL ON TABLE "public"."gate_events" TO "anon";
GRANT ALL ON TABLE "public"."gate_events" TO "authenticated";
GRANT ALL ON TABLE "public"."gate_events" TO "service_role";



GRANT ALL ON TABLE "public"."hmg_validations" TO "anon";
GRANT ALL ON TABLE "public"."hmg_validations" TO "authenticated";
GRANT ALL ON TABLE "public"."hmg_validations" TO "service_role";



GRANT ALL ON TABLE "public"."ticket_notes" TO "anon";
GRANT ALL ON TABLE "public"."ticket_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_notes" TO "service_role";



GRANT ALL ON TABLE "public"."tickets" TO "anon";
GRANT ALL ON TABLE "public"."tickets" TO "authenticated";
GRANT ALL ON TABLE "public"."tickets" TO "service_role";



GRANT ALL ON SEQUENCE "public"."tickets_ticket_number_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."tickets_ticket_number_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."tickets_ticket_number_seq" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT ALL ON TABLE "public"."verification_checks" TO "anon";
GRANT ALL ON TABLE "public"."verification_checks" TO "authenticated";
GRANT ALL ON TABLE "public"."verification_checks" TO "service_role";



GRANT ALL ON TABLE "public"."webhook_deliveries" TO "anon";
GRANT ALL ON TABLE "public"."webhook_deliveries" TO "authenticated";
GRANT ALL ON TABLE "public"."webhook_deliveries" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
