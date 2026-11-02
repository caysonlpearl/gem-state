BEGIN;

-- Preparation already reserved one complete source GET. Reusing its checked
-- bytes must not reserve/download that original again or refund prior usage.
CREATE OR REPLACE FUNCTION public.acknowledge_photo_migration_prepared_source(
  _run uuid, _ordinal integer, _lease uuid, _actor uuid, _digest text,
  _max_groups integer, _max_bytes bigint, _expires timestamptz, _bytes bigint
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.photo_migration_runs; item public.photo_migration_items;
BEGIN
  PERFORM public.require_photo_migration_admin(_actor);
  SELECT * INTO r FROM public.photo_migration_runs WHERE id=_run FOR UPDATE;
  SELECT * INTO item FROM public.photo_migration_items
    WHERE run_id=_run AND ordinal=_ordinal FOR UPDATE;
  IF r.id IS NULL OR item.run_id IS NULL OR r.inventory_sha256 IS DISTINCT FROM _digest
    OR coalesce(_expires,'-infinity')<=now()
    OR _max_groups IS NULL OR _max_groups NOT BETWEEN 1 AND r.total_groups
    OR item.ordinal >= _max_groups
    OR _max_bytes IS NULL OR _max_bytes NOT BETWEEN 1 AND 5000000000
    OR r.source_bytes_reserved > _max_bytes OR r.source_bytes_reserved < item.source_bytes
    OR item.status<>'running' OR item.lease_token IS DISTINCT FROM _lease
    OR coalesce(item.lease_until,'-infinity')<=now() OR item.lease_source_reserved
    OR item.preview_reservations<1 OR _bytes IS NULL OR _bytes NOT BETWEEN 1 AND 5242880
    OR _bytes IS DISTINCT FROM item.source_bytes
  THEN RAISE EXCEPTION 'Prepared source reservation rejected'; END IF;
  UPDATE public.photo_migration_items SET lease_source_reserved=true
    WHERE run_id=_run AND ordinal=_ordinal;
END $$;
REVOKE ALL ON FUNCTION public.acknowledge_photo_migration_prepared_source(uuid,integer,uuid,uuid,text,integer,bigint,timestamptz,bigint)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.acknowledge_photo_migration_prepared_source(uuid,integer,uuid,uuid,text,integer,bigint,timestamptz,bigint)
  TO service_role;

COMMIT;
