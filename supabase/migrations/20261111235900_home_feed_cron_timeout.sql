-- A homes sweep can wait for two provider responses and cache writes. Keep
-- pg_net from abandoning it at the default short HTTP timeout. Reuse the
-- existing command so credentials, endpoint and schedule remain unchanged.
do $$
declare job_id bigint; job_command text;
begin
  if to_regclass('cron.job') is null then return; end if;
  select jobid, command into job_id, job_command
    from cron.job where jobname = 'service-ratings' and active;
  if job_command is null then return; end if;
  if job_command not like '%/api/internal/service-ratings%' then
    raise exception 'Unexpected homes scheduler endpoint; manual review required.';
  end if;
  if job_command ~ 'timeout_milliseconds' then
    job_command := regexp_replace(job_command,
      'timeout_milliseconds[[:space:]]*(:=|=>)[[:space:]]*[0-9]+',
      'timeout_milliseconds := 60000', 'g');
  elsif job_command ~ 'net[.]http_post[[:space:]]*[(]' and job_command ~ 'url[[:space:]]*(:=|=>)' then
    job_command := regexp_replace(job_command, 'net[.]http_post[[:space:]]*[(]',
      'net.http_post(timeout_milliseconds := 60000, ');
  else
    raise exception 'Homes scheduler requires manual HTTP timeout review.';
  end if;
  perform cron.alter_job(job_id, command := job_command);
end $$;
