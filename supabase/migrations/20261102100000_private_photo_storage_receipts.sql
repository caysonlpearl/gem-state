-- Preparation only: no objects move and no application storage mode changes.
BEGIN;

CREATE TABLE IF NOT EXISTS public.photo_object_receipts (
  bucket text NOT NULL CHECK (bucket IN ('listing-media', 'ask-evidence')),
  path text NOT NULL CHECK (length(path) BETWEEN 1 AND 1024),
  r2_key text NOT NULL CHECK (r2_key ~ '^original/v1/[a-f0-9]{64}/[a-f0-9]{64}$'),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  byte_size bigint NOT NULL CHECK (byte_size BETWEEN 1 AND 52428800),
  content_type text NOT NULL CHECK (content_type ~ '^image/[a-zA-Z0-9.+-]+$'),
  thumbnail_key text CHECK (thumbnail_key ~ '^thumbnail/v1/[a-f0-9]{64}/[a-f0-9]{64}$'),
  thumbnail_sha256 text CHECK (thumbnail_sha256 ~ '^[a-f0-9]{64}$'),
  thumbnail_bytes bigint CHECK (thumbnail_bytes BETWEEN 1 AND 524288),
  thumbnail_content_type text,
  source_etag text,
  source_updated_at timestamptz,
  verified_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bucket, path),
  CHECK ((thumbnail_key IS NULL AND thumbnail_sha256 IS NULL AND thumbnail_bytes IS NULL AND thumbnail_content_type IS NULL)
    OR (thumbnail_key IS NOT NULL AND thumbnail_sha256 IS NOT NULL AND thumbnail_bytes IS NOT NULL AND thumbnail_content_type IS NOT NULL AND thumbnail_content_type ~ '^image/[a-zA-Z0-9.+-]+$')),
  CHECK (bucket <> 'listing-media' OR thumbnail_key IS NOT NULL)
);
ALTER TABLE public.photo_object_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.photo_object_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.photo_object_receipts TO service_role;

-- Conservative cumulative reservations include interrupted/uncommitted writes.
-- This is an application guard, not a Cloudflare account-level spending cap.
CREATE TABLE IF NOT EXISTS public.photo_storage_reservations (
  id text PRIMARY KEY CHECK (id ~ '^[a-f0-9]{64}$'),
  byte_size bigint NOT NULL CHECK (byte_size BETWEEN 1 AND 52953088),
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.photo_storage_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.photo_storage_reservations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.photo_storage_reservations TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_private_photo_bytes(_id text, _bytes bigint, _actor uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE existing bigint; existing_actor uuid; used_bytes bigint;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'Server access required'; END IF;
  IF _id !~ '^[a-f0-9]{64}$' OR _bytes NOT BETWEEN 1 AND 52953088 THEN RAISE EXCEPTION 'Invalid photo reservation'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('bluebird_private_photo_budget'));
  SELECT byte_size,user_id INTO existing,existing_actor FROM public.photo_storage_reservations WHERE id = _id;
  IF existing IS NOT NULL THEN
    IF existing <> _bytes OR existing_actor IS DISTINCT FROM _actor THEN RAISE EXCEPTION 'Photo reservation changed'; END IF;
    RETURN;
  END IF;
  SELECT coalesce(sum(byte_size), 0) INTO used_bytes FROM public.photo_storage_reservations;
  IF used_bytes + _bytes > 8000000000 THEN RAISE EXCEPTION 'Photo storage budget reached; review storage usage'; END IF;
  INSERT INTO public.photo_storage_reservations(id, byte_size, user_id) VALUES (_id, _bytes, _actor);
END $$;
REVOKE ALL ON FUNCTION public.reserve_private_photo_bytes(text,bigint,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_private_photo_bytes(text,bigint,uuid) TO service_role;

CREATE TABLE IF NOT EXISTS public.photo_upload_tickets (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  path text NOT NULL CHECK (length(path) BETWEEN 1 AND 1024),
  mode text NOT NULL CHECK (mode IN ('mirror','r2')),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '30 minutes',
  verified_at timestamptz,
  verification_attempts integer NOT NULL DEFAULT 0,
  verification_lease_until timestamptz,
  CHECK (split_part(path,'/',1)=user_id::text),
  CHECK (payload ?& ARRAY['bytes','sha256','thumbnail','contentType','evidence','key','thumbnailKey']),
  CHECK ((payload->'thumbnail') ?& ARRAY['bytes','sha256','contentType']),
  CHECK ((payload->>'bytes')::bigint BETWEEN 1 AND 52428800),
  CHECK ((payload->'thumbnail'->>'bytes')::bigint BETWEEN 1 AND 524288),
  CHECK (payload->>'sha256' ~ '^[a-f0-9]{64}$'),
  CHECK (payload->'thumbnail'->>'sha256' ~ '^[a-f0-9]{64}$')
);
ALTER TABLE public.photo_upload_tickets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.photo_upload_tickets FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.photo_upload_tickets TO service_role;
CREATE INDEX IF NOT EXISTS photo_storage_reservations_user_created ON public.photo_storage_reservations(user_id,created_at);

CREATE OR REPLACE FUNCTION public.begin_private_photo_upload(_ticket jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE actor uuid := (_ticket->>'user_id')::uuid; reservation jsonb;
  daily_bytes bigint; requested bigint; expected_bytes bigint; expected_count integer;
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role' THEN RAISE EXCEPTION 'Server access required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=actor AND coalesce(banned_until,'1970-01-01')<now()) THEN RAISE EXCEPTION 'Active account required'; END IF;
  IF jsonb_typeof(_ticket->'reservations') <> 'array' THEN RAISE EXCEPTION 'Invalid photo reservations'; END IF;
  expected_count := CASE WHEN (_ticket->'payload'->>'evidence')::boolean THEN 2 ELSE 1 END;
  expected_bytes := ((_ticket->'payload'->>'bytes')::bigint * expected_count) + (_ticket->'payload'->'thumbnail'->>'bytes')::bigint;
  SELECT sum((value->>'bytes')::bigint),count(DISTINCT value->>'id') INTO requested,expected_count
    FROM jsonb_array_elements(_ticket->'reservations');
  IF requested IS DISTINCT FROM expected_bytes OR expected_count <> jsonb_array_length(_ticket->'reservations')
     OR expected_count <> (CASE WHEN (_ticket->'payload'->>'evidence')::boolean THEN 2 ELSE 1 END)
  THEN RAISE EXCEPTION 'Photo reservations do not match the upload'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('bluebird_private_photo_budget'));
  IF (SELECT count(*) FROM public.photo_upload_tickets WHERE user_id=actor AND created_at>now()-interval '24 hours') >= 256
  THEN RAISE EXCEPTION 'Daily photo upload count reached'; END IF;
  SELECT coalesce(sum(byte_size),0) INTO daily_bytes FROM public.photo_storage_reservations
    WHERE user_id=actor AND created_at>now()-interval '24 hours';
  IF daily_bytes+requested>536870912 THEN RAISE EXCEPTION 'Daily photo upload allowance reached'; END IF;
  FOR reservation IN SELECT value FROM jsonb_array_elements(_ticket->'reservations') LOOP
    PERFORM public.reserve_private_photo_bytes(reservation->>'id',(reservation->>'bytes')::bigint,actor);
  END LOOP;
  INSERT INTO public.photo_upload_tickets(id,user_id,path,mode,payload)
    VALUES ((_ticket->>'id')::uuid,actor,_ticket->>'path',_ticket->>'mode',_ticket->'payload');
END $$;
REVOKE ALL ON FUNCTION public.begin_private_photo_upload(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_private_photo_upload(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.lease_private_photo_upload(_id uuid,_user uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE ticket public.photo_upload_tickets;
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role' THEN RAISE EXCEPTION 'Server access required'; END IF;
  SELECT * INTO ticket FROM public.photo_upload_tickets WHERE id=_id AND user_id=_user FOR UPDATE;
  IF NOT FOUND OR ticket.expires_at<=now() THEN RAISE EXCEPTION 'Photo upload expired'; END IF;
  IF ticket.verified_at IS NOT NULL THEN RETURN to_jsonb(ticket); END IF;
  IF ticket.verification_attempts>=6 OR ticket.verification_lease_until>now()
  THEN RAISE EXCEPTION 'Photo verification is busy or its retry allowance was reached'; END IF;
  UPDATE public.photo_upload_tickets SET verification_attempts=verification_attempts+1,
    verification_lease_until=now()+interval '90 seconds' WHERE id=_id RETURNING * INTO ticket;
  RETURN to_jsonb(ticket);
END $$;
REVOKE ALL ON FUNCTION public.lease_private_photo_upload(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.lease_private_photo_upload(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.record_private_photo(_receipt jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE changed integer;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'Server access required'; END IF;
  INSERT INTO public.photo_object_receipts(bucket,path,r2_key,sha256,byte_size,content_type,thumbnail_key,thumbnail_sha256,thumbnail_bytes,thumbnail_content_type,source_etag,source_updated_at)
  VALUES (_receipt->>'bucket',_receipt->>'path',_receipt->>'r2_key',_receipt->>'sha256',(_receipt->>'byte_size')::bigint,_receipt->>'content_type',_receipt->>'thumbnail_key',_receipt->>'thumbnail_sha256',(_receipt->>'thumbnail_bytes')::bigint,_receipt->>'thumbnail_content_type',_receipt->>'source_etag',(_receipt->>'source_updated_at')::timestamptz)
  ON CONFLICT(bucket,path) DO UPDATE SET
    verified_at=now(), thumbnail_key=EXCLUDED.thumbnail_key, thumbnail_sha256=EXCLUDED.thumbnail_sha256,
    thumbnail_bytes=EXCLUDED.thumbnail_bytes, thumbnail_content_type=EXCLUDED.thumbnail_content_type,
    source_etag=EXCLUDED.source_etag, source_updated_at=EXCLUDED.source_updated_at
  WHERE photo_object_receipts.sha256=EXCLUDED.sha256
    AND photo_object_receipts.byte_size=EXCLUDED.byte_size
    AND photo_object_receipts.content_type=EXCLUDED.content_type
    AND photo_object_receipts.r2_key=EXCLUDED.r2_key;
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 1 THEN RAISE EXCEPTION 'A different photo already uses this path'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.record_private_photo(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_private_photo(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.private_photo_exists(_bucket text, _path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id=_bucket AND name=_path)
    OR EXISTS(SELECT 1 FROM public.photo_object_receipts WHERE bucket=_bucket AND path=_path AND verified_at IS NOT NULL)
$$;
REVOKE ALL ON FUNCTION public.private_photo_exists(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.private_photo_exists(text,text) TO service_role;

-- Patch only the Storage existence predicate. Preserve every production token,
-- claimant, seller, row-lock and manifest check in the existing function.
DO $$
DECLARE definition text;
  old_guard text := 'IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id=m->>''bucket'' AND name=m->>''new'') THEN';
  new_guard text := 'IF NOT public.private_photo_exists(m->>''bucket'',m->>''new'') THEN';
BEGIN
  definition := pg_get_functiondef('public.finish_seller_claim(uuid,uuid,boolean,boolean)'::regprocedure);
  IF position(new_guard IN definition) > 0 THEN RETURN; END IF;
  IF position(old_guard IN definition) = 0 THEN RAISE EXCEPTION 'Review current seller-claim photo guard before applying migration'; END IF;
  EXECUTE replace(definition, old_guard, new_guard);
END $$;

COMMIT;
