-- submit_form() also reports how many forms of the same kind the database will still accept this hour,
-- so every Telegram notification can show the real remaining allowance ("Usage remaining").
-- Applied 2026-11-14 as migration form_usage_remaining, after the site code that reads both reply
-- formats (server/forms.mjs, createSupabaseStore) was deployed.
-- The return type changes (integer -> jsonb), so the function is dropped and recreated in one
-- transaction, with the same body, limits and grants as before.

-- remaining forms of one kind in the last hour; the single place the 120-per-hour number lives in SQL
create or replace function school.form_hourly_remaining(p_kind text)
returns integer
language sql
stable
security definer
set search_path to ''
as $$
  select greatest(0, 120 - count(*)::integer)
  from school.form_submissions
  where kind = p_kind and received_at > now() - interval '1 hour';
$$;
revoke all on function school.form_hourly_remaining(text) from public, anon, authenticated;

drop function public.submit_form(text, uuid, jsonb);
create function public.submit_form(p_kind text, p_id uuid, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  allowed text[];
  required text[];
  key_field text;
  key_limit integer;
  key_window interval;
  clean jsonb;
  k text;
  v_key text;
  v_count integer;
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object' or pg_column_size(p_data) > 8192 then
    raise exception 'invalid' using errcode = 'P0001';
  end if;

  if p_kind = 'inquiry' then
    allowed := array['parentName', 'phone', 'grade', 'message'];
    required := array['parentName', 'phone', 'grade'];
    key_field := 'phone'; key_limit := 2; key_window := interval '1 hour';
  elsif p_kind = 'preRegistration' then
    allowed := array['fullName', 'nationalId', 'birthDate', 'studentMobile', 'address', 'motherName', 'fatherName',
      'motherEducation', 'fatherEducation', 'motherJob', 'fatherJob', 'motherMobile', 'fatherMobile',
      'currentSchool', 'gpa', 'gpaDescriptive', 'discipline', 'grade', 'referral'];
    required := array['fullName', 'nationalId', 'birthDate', 'studentMobile', 'address', 'motherMobile', 'fatherMobile',
      'currentSchool', 'gpa', 'discipline', 'grade'];
    key_field := 'nationalId'; key_limit := 3; key_window := interval '24 hours';
  elsif p_kind = 'career' then
    allowed := array['fullName', 'field', 'degree', 'experience', 'phone'];
    required := array['fullName', 'field', 'degree', 'experience', 'phone'];
    key_field := 'phone'; key_limit := 1; key_window := interval '24 hours';
  else
    raise exception 'invalid' using errcode = 'P0001';
  end if;

  -- keep only known text fields of sane length
  clean := '{}'::jsonb;
  foreach k in array allowed loop
    if p_data ? k then
      if jsonb_typeof(p_data -> k) <> 'string' or length(p_data ->> k) > 300 then
        raise exception 'invalid' using errcode = 'P0001';
      end if;
      clean := clean || jsonb_build_object(k, p_data ->> k);
    end if;
  end loop;
  foreach k in array required loop
    if coalesce(clean ->> k, '') = '' then
      raise exception 'invalid' using errcode = 'P0001';
    end if;
  end loop;

  if p_kind = 'preRegistration' then
    if clean ->> 'nationalId' !~ '^[0-9]{10}$'
       or clean ->> 'studentMobile' !~ '^09[0-9]{9}$'
       or clean ->> 'motherMobile' !~ '^09[0-9]{9}$'
       or clean ->> 'fatherMobile' !~ '^09[0-9]{9}$'
       or clean ->> 'birthDate' !~ '^1[34][0-9]{2}/[0-9]{2}/[0-9]{2}$' then
      raise exception 'invalid' using errcode = 'P0001';
    end if;
  elsif clean ->> 'phone' !~ '^0[0-9]{10}$' then
    raise exception 'invalid' using errcode = 'P0001';
  end if;
  if clean ? 'grade' and clean ->> 'grade' not in ('7', '8', '9') then
    raise exception 'invalid' using errcode = 'P0001';
  end if;

  v_key := clean ->> key_field;
  -- one counter for every server instance: per person, then per form
  perform pg_advisory_xact_lock(hashtext(p_kind || ':' || v_key));
  select count(*) into v_count from school.form_submissions
    where kind = p_kind and dedupe_key = v_key and received_at > now() - key_window;
  if v_count >= key_limit then
    raise exception 'duplicate' using errcode = 'P0001';
  end if;
  if school.form_hourly_remaining(p_kind) <= 0 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  insert into school.form_submissions (id, kind, dedupe_key, repeat, data)
  values (p_id, p_kind, v_key, v_count + 1, clean);
  return jsonb_build_object('repeat', v_count + 1, 'remaining', school.form_hourly_remaining(p_kind), 'limit', 120);
end;
$function$;

-- same grants as before: the site's publishable key (anon) and the server key; nobody else
revoke all on function public.submit_form(text, uuid, jsonb) from public, authenticated;
grant execute on function public.submit_form(text, uuid, jsonb) to anon, service_role;
