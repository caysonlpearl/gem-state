BEGIN;

-- Browser preparation is only for a reviewed processing failure. Every URL
-- reservation consumes the same fixed source-byte allowance, even if its
-- acknowledgement or browser download is lost. Copy attempts are unchanged.
ALTER TABLE public.photo_migration_items
  ADD COLUMN IF NOT EXISTS preview_reservations integer NOT NULL DEFAULT 0
  CHECK (preview_reservations BETWEEN 0 AND 2);

CREATE OR REPLACE FUNCTION public.reserve_photo_migration_preview(
  _run uuid, _actor uuid, _digest text, _max_groups integer,
  _max_bytes bigint, _expires timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.photo_migration_runs; item public.photo_migration_items;
BEGIN
  PERFORM public.require_photo_migration_admin(_actor);
  PERFORM pg_advisory_xact_lock(hashtext('bluebird_photo_migration_runner'));
  SELECT * INTO r FROM public.photo_migration_runs WHERE id=_run FOR UPDATE;
  IF NOT FOUND OR r.inventory_sha256 IS DISTINCT FROM _digest
    OR coalesce(_expires,'-infinity') <= now()
    OR _max_groups IS NULL OR _max_groups NOT BETWEEN 1 AND r.total_groups
    OR _max_bytes IS NULL OR _max_bytes NOT BETWEEN 1 AND 5000000000
  THEN RAISE EXCEPTION 'Migration permit is invalid or expired'; END IF;
  IF EXISTS (SELECT 1 FROM public.photo_migration_items
    WHERE status='running' AND lease_until>now())
  THEN RAISE EXCEPTION 'A photo copy is still running'; END IF;
  SELECT * INTO item FROM public.photo_migration_items
    WHERE run_id=_run AND status='failed' ORDER BY ordinal LIMIT 1 FOR UPDATE;
  IF NOT FOUND OR item.ordinal >= _max_groups OR item.last_failure IS DISTINCT FROM 'processing'
    OR item.attempts >= 3 OR item.preview_reservations >= 2
  THEN RAISE EXCEPTION 'No processing failure is eligible for preview preparation'; END IF;
  IF r.source_bytes_reserved + item.source_bytes > _max_bytes
  THEN RAISE EXCEPTION 'Approved source download budget reached'; END IF;
  UPDATE public.photo_migration_runs
    SET source_bytes_reserved=source_bytes_reserved+item.source_bytes WHERE id=_run;
  UPDATE public.photo_migration_items
    SET preview_reservations=preview_reservations+1
    WHERE run_id=_run AND ordinal=item.ordinal;
  RETURN jsonb_build_object('ordinal',item.ordinal,'entries',item.entries,
    'sourceBytes',item.source_bytes);
END $$;
REVOKE ALL ON FUNCTION public.reserve_photo_migration_preview(uuid,uuid,text,integer,bigint,timestamptz)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_photo_migration_preview(uuid,uuid,text,integer,bigint,timestamptz)
  TO service_role;

COMMIT;
