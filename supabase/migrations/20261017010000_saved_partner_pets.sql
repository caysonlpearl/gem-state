-- Members can save RescueGroups pets with the same partner-save table jobs
-- and local businesses use (a snapshot of the card).
alter table public.saved_partner_jobs drop constraint if exists saved_partner_jobs_listing_id_check;
alter table public.saved_partner_jobs add constraint saved_partner_jobs_listing_id_check
  check (listing_id ~ '^(adzuna-[0-9]{1,20}|fsq-[0-9a-f]{24}|rescuegroups-[0-9]{1,20})$');
