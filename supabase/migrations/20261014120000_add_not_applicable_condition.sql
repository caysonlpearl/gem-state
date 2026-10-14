-- Animals, homes, jobs and services have no item condition. The listing form
-- and imports now save these as not_applicable, and listing pages hide it.
ALTER TYPE public.item_condition
  ADD VALUE IF NOT EXISTS 'not_applicable';
