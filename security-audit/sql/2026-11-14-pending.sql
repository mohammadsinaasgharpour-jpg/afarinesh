-- Pending database changes from the threat model of 2026-11-14 (threat-model/2026-11-14-quick-web).
-- Status per block below. Each block changes the live Supabase project and needs the owner's approval. Run in order.

-- T-001 / SEC-14: NOT APPLIED (owner deferred it). Only the site's server may store forms.
-- PRECONDITION: SUPABASE_SECRET_KEY is set in the Vercel project (Production) and the site has been
-- redeployed, and one test form went through. Revoking first would stop every form on the site.
revoke execute on function public.submit_form(text, uuid, jsonb) from anon;
revoke execute on function public.submit_form(text, uuid, jsonb) from authenticated;

-- SEC-15: NOT APPLIED, by decision (2026-11-14). The owner asked to revoke only if nothing uses it, and
-- the event trigger "ensure_rls" (ddl_command_end) calls it to switch row level security on for every
-- new table in public. It returns event_trigger, so it cannot be called through the API at all.
-- revoke execute on function public.rls_auto_enable() from anon, authenticated;

-- T-005 / SEC-16: APPLIED 2026-11-14 (migration schedule_purge_old_submissions); cron.job id 1, active.
-- The 12-month deletion promised on the privacy page, every night at 02:30 UTC.
create extension if not exists pg_cron;
select cron.schedule('purge-old-submissions', '30 2 * * *', $$select school.purge_old_submissions()$$);

-- Check afterwards:
--   select grantee, privilege_type from information_schema.routine_privileges
--     where routine_name in ('submit_form', 'rls_auto_enable');
--   select jobname, schedule, command from cron.job;
