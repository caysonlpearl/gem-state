-- Reuse the existing server-to-server authentication without exposing or
-- duplicating its credential in repository code. Other schedules stay intact.
do $$
declare job_command text;
begin
  if to_regclass('cron.job') is null then
    raise exception 'The existing database scheduler must be available before installing the news job.';
  end if;
  select replace(command, '/api/internal/service-ratings', '/api/internal/news-refresh')
  into job_command from cron.job where active and command like '%/api/internal/service-ratings%' order by jobid limit 1;
  if job_command is null or job_command not like '%/api/internal/news-refresh%' then
    raise exception 'No existing authenticated internal job was found. Configure news-refresh with the deployment cron secret.';
  end if;
  if job_command ~ 'timeout_milliseconds' then
    job_command := regexp_replace(job_command, 'timeout_milliseconds[[:space:]]*(:=|=>)[[:space:]]*[0-9]+', 'timeout_milliseconds := 60000', 'g');
  elsif job_command ~ 'net[.]http_post[[:space:]]*[(]' and job_command ~ 'url[[:space:]]*(:=|=>)' then
    job_command := regexp_replace(job_command, 'net[.]http_post[[:space:]]*[(]', 'net.http_post(timeout_milliseconds := 60000, ');
  end if;
  -- Due checks are cheap. A DB lease enforces six hours between feed fetches.
  perform cron.schedule('bluebird-local-refresh', '*/15 * * * *', job_command);
end $$;
