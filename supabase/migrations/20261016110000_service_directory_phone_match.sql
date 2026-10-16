-- Match businesses from a search by phone number, whatever its formatting.
alter table public.service_directory
  add column if not exists phone_digits text
  generated always as (right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10)) stored;
create index if not exists service_directory_phone_digits_idx
  on public.service_directory (phone_digits) where not hidden;

-- Most-reviewed businesses first within a search.
create index if not exists service_directory_review_count_idx
  on public.service_directory (((enrichment->>'reviewCount')::int) desc nulls last) where not hidden;
