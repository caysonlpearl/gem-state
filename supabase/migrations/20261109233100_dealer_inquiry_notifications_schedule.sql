-- Reuse the existing authenticated job; never copy its secret into source code.
do $$
declare job_command text;
begin
 select replace(command, '/api/internal/news-refresh', '/api/internal/dealer-inquiries')
 into job_command from cron.job where active and command like '%/api/internal/news-refresh%' order by jobid limit 1;
 if job_command is null then raise exception 'Existing authenticated Bluebird schedule required'; end if;
 perform cron.schedule('bluebird-dealer-inquiry-notifications', '*/15 * * * *', job_command);
end $$;
