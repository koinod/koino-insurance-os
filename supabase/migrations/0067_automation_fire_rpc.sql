-- 0067_automation_fire_rpc.sql
--
-- Resurrects the automation-rules dispatch layer. Every existing caller
-- (api/twilio-app.js, api/connector/calendly-webhook.js, api/cron/
-- appointment-reminders.js, api/connector/stripe-webhook.js) has been
-- calling sb.rpc("automation_fire", ...) for months — but the RPC never
-- existed. All 7 calls silently 404'd. .catch(() => {}) swallowed every
-- error. Zero automation rules have ever fired in prod.
--
-- This function is the canonical dispatcher. It:
--   1. Authorizes the caller (super_admin / agency member / service_role).
--   2. Selects active rules matching (agency_id, trigger_event).
--   3. Filters each rule against p_context via trigger_filter.
--   4. Inserts one automation_runs row per matched rule with status='scheduled'.
--      A separate worker (sms-flush / drip-runner) reads scheduled runs and
--      ships them. Channel-availability is the worker's job.
--
-- p_context shape (jsonb, all optional):
--   { lead_id, phone, email, source, status, ...arbitrary }

create or replace function public.automation_fire(
  p_agency_id uuid,
  p_trigger   text,
  p_rep_id    text default null,
  p_context   jsonb default '{}'::jsonb
)
returns int
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_rule       record;
  v_ctx        jsonb := coalesce(p_context, '{}'::jsonb);
  v_channel    text;
  v_recipient  text;
  v_body       text;
  v_run_count  int := 0;
  v_filter_ok  boolean;
  v_lead_uuid  uuid;
begin
  if current_user <> 'service_role'
     and not (public.is_super_admin() or p_agency_id = any (public.viewer_agency_ids())) then
    raise exception 'forbidden: not a member of agency %', p_agency_id;
  end if;

  begin
    v_lead_uuid := nullif(v_ctx->>'lead_id', '')::uuid;
  exception when others then
    v_lead_uuid := null;
  end;

  for v_rule in
    select id, channels, trigger_filter, template_id
      from public.automation_rules
     where agency_id     = p_agency_id
       and trigger_event = p_trigger
       and active        = true
  loop
    v_filter_ok := true;
    if v_rule.trigger_filter is not null and jsonb_typeof(v_rule.trigger_filter) = 'object' then
      select coalesce(bool_and(v_ctx->>k = v_rule.trigger_filter->>k), true)
        into v_filter_ok
        from jsonb_object_keys(v_rule.trigger_filter) k;
    end if;
    if not v_filter_ok then continue; end if;

    v_channel   := coalesce(v_rule.channels[1], 'sms');
    v_recipient := coalesce(v_ctx->>'phone', v_ctx->>'email');

    v_body := null;
    if v_rule.template_id is not null then
      begin
        select body into v_body from public.followup_templates where id = v_rule.template_id;
      exception when undefined_table then v_body := null; end;
    end if;

    insert into public.automation_runs (
      rule_id, agency_id, rep_id, lead_id, channel, recipient, body_snapshot,
      status, scheduled_for
    ) values (
      v_rule.id, p_agency_id, p_rep_id, v_lead_uuid,
      v_channel, v_recipient, v_body,
      'scheduled', now()
    );
    v_run_count := v_run_count + 1;
  end loop;

  return v_run_count;
end;
$$;

revoke all on function public.automation_fire(uuid, text, text, jsonb) from public, anon;
grant execute on function public.automation_fire(uuid, text, text, jsonb) to authenticated, service_role;
