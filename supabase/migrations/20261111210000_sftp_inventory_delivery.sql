-- One received SFTP file is one atomic snapshot, even after a worker restart.
CREATE UNIQUE INDEX IF NOT EXISTS dealer_inventory_sftp_delivery
  ON public.dealer_inventory_sync_runs(source_id,source_checksum)
  WHERE source_checksum LIKE 'sftp-v1:%' AND mode='apply';

CREATE OR REPLACE FUNCTION public.apply_sftp_inventory_delivery(
  _source_id uuid, _delivery_id text, _filename text,
  _received_at timestamptz, _records jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE source public.dealer_inventory_sources%ROWTYPE;
  prior public.dealer_inventory_sync_runs%ROWTYPE;
  run_id uuid; summary jsonb; row_count integer;
BEGIN
  IF _delivery_id IS NULL OR _delivery_id !~ '^[0-9a-f]{64}$'
    OR _filename IS NULL OR length(_filename)>200
    OR _filename !~ '^[A-Za-z0-9_.-]+\.csv$'
    OR _received_at IS NULL OR _received_at<now()-interval '72 hours'
    OR _received_at>now()+interval '5 minutes' THEN
    RAISE EXCEPTION 'Invalid or expired SFTP delivery';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(_source_id::text));
  SELECT * INTO source FROM public.dealer_inventory_sources WHERE id=_source_id FOR UPDATE;
  IF NOT FOUND OR source.source_type<>'sftp' OR source.file_format<>'csv' THEN
    RAISE EXCEPTION 'Configured SFTP CSV source required';
  END IF;
  IF source.status='paused' THEN
    RETURN jsonb_build_object('status','skipped','reason','source_paused');
  END IF;
  SELECT * INTO prior FROM public.dealer_inventory_sync_runs
    WHERE source_id=_source_id AND source_checksum='sftp-v1:'||_delivery_id AND mode='apply';
  IF FOUND THEN
    IF prior.status<>'completed' THEN RAISE EXCEPTION 'SFTP delivery has an incomplete run'; END IF;
    RETURN jsonb_build_object('status','skipped','reason','already_imported','runId',prior.id);
  END IF;
  IF jsonb_typeof(_records) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Inventory snapshot must be an array';
  END IF;
  row_count:=jsonb_array_length(_records);
  IF row_count<source.minimum_row_count THEN
    RAISE EXCEPTION 'Inventory snapshot is below the configured minimum';
  END IF;
  INSERT INTO public.dealer_inventory_sync_runs(source_id,mode,status,source_filename,
    source_checksum,received_row_count,valid_row_count)
    VALUES(_source_id,'apply','running',_filename,'sftp-v1:'||_delivery_id,row_count,row_count)
    RETURNING id INTO run_id;
  summary:=public.reconcile_dealer_inventory_records(_source_id,run_id,_records);
  UPDATE public.dealer_inventory_records SET last_seen_at=_received_at
    WHERE source_id=_source_id AND last_seen_run_id=run_id;
  UPDATE public.dealer_inventory_sync_runs SET status='completed',finished_at=now(),
    created_count=coalesce((summary->>'createdCount')::integer,0),
    updated_count=coalesce((summary->>'updatedCount')::integer,0),
    unchanged_count=coalesce((summary->>'unchangedCount')::integer,0),
    stale_count=coalesce((summary->>'staleCount')::integer,0)
    WHERE id=run_id;
  PERFORM public.touch_dealer_inventory_source(_source_id,true,NULL);
  RETURN summary||jsonb_build_object('status','completed','runId',run_id,'validRowCount',row_count);
END $$;
REVOKE ALL ON FUNCTION public.apply_sftp_inventory_delivery(uuid,text,text,timestamptz,jsonb)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_sftp_inventory_delivery(uuid,text,text,timestamptz,jsonb)
  TO service_role;
