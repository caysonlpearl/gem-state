-- Reuse the existing authenticated server job without reading its credential
-- into application code, logs, or repository history.
do $$
declare job_command text;
begin
 if to_regclass('cron.job') is null then raise exception 'Authenticated database scheduler required'; end if;
 select replace(command,'/api/internal/service-ratings','/api/internal/shopping') into job_command
 from cron.job where active and command like '%/api/internal/service-ratings%' order by jobid limit 1;
 if job_command is null then raise exception 'Existing authenticated Bluebird schedule required'; end if;
 if job_command ~ 'timeout_milliseconds' then
  job_command=regexp_replace(job_command,'timeout_milliseconds[[:space:]]*(:=|=>)[[:space:]]*[0-9]+','timeout_milliseconds := 60000','g');
 elsif job_command ~ 'net[.]http_post[[:space:]]*[(]' then
  job_command=regexp_replace(job_command,'net[.]http_post[[:space:]]*[(]','net.http_post(timeout_milliseconds := 60000, ');
 else raise exception 'Unexpected scheduler transport'; end if;
 perform cron.schedule('bluebird-shopping','*/15 * * * *',job_command);
end $$;
