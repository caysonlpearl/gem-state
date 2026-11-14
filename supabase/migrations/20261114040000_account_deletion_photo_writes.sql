-- Stop durable member-photo writes after a deletion request. No objects are erased.
BEGIN;

CREATE FUNCTION public.assert_member_photo_writer(_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF _user IS NULL THEN RAISE EXCEPTION 'Photo account is unavailable'; END IF;
 -- Match the exclusive request/job insert lock below. Volatile statements after
 -- the wait read the committed deletion state, not the caller's earlier snapshot.
 PERFORM pg_advisory_xact_lock_shared(hashtextextended('bluebird-account-photo:'||_user::text,0));
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=_user AND deleted_at IS NULL
      AND (banned_until IS NULL OR banned_until<=clock_timestamp()))
 OR EXISTS(SELECT 1 FROM public.mobile_account_deletions WHERE user_id=_user)
 OR EXISTS(SELECT 1 FROM public.account_deletion_jobs WHERE user_id=_user AND status<>'completed')
 THEN RAISE EXCEPTION 'Photo account is unavailable'; END IF;
END $$;

CREATE FUNCTION public.assert_member_photo_path(_path text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE prefix text:=split_part(_path,'/',1);
BEGIN
 -- Legacy paths without a member UUID need separate ownership inventory. This
 -- guard never infers their owner or authorizes erasing them.
 IF prefix ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 THEN PERFORM public.assert_member_photo_writer(prefix::uuid); END IF;
END $$;

CREATE FUNCTION public.lock_member_photo_deletion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.user_id IS NOT NULL THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('bluebird-account-photo:'||NEW.user_id::text,0));
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER lock_member_photo_deletion BEFORE INSERT ON public.mobile_account_deletions
 FOR EACH ROW EXECUTE FUNCTION public.lock_member_photo_deletion();
CREATE TRIGGER lock_member_photo_deletion BEFORE INSERT ON public.account_deletion_jobs
 FOR EACH ROW EXECUTE FUNCTION public.lock_member_photo_deletion();

CREATE FUNCTION public.guard_member_photo_journal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE entry jsonb;
BEGIN
 IF TG_TABLE_NAME='photo_storage_reservations' THEN
  -- A null actor is the existing migration budget, not proof of member ownership.
  IF NEW.user_id IS NOT NULL THEN PERFORM public.assert_member_photo_writer(NEW.user_id); END IF;
 ELSIF TG_TABLE_NAME='photo_upload_tickets' THEN
  IF TG_OP='UPDATE' THEN
   PERFORM public.assert_member_photo_writer(OLD.user_id);
   PERFORM public.assert_member_photo_path(OLD.path);
  END IF;
  PERFORM public.assert_member_photo_writer(NEW.user_id);
  PERFORM public.assert_member_photo_path(NEW.path);
 ELSIF TG_TABLE_NAME='photo_object_receipts' THEN
  IF TG_OP='UPDATE' THEN PERFORM public.assert_member_photo_path(OLD.path); END IF;
  PERFORM public.assert_member_photo_path(NEW.path);
 ELSIF TG_TABLE_NAME='photo_migration_items' THEN
  -- Failure/terminal bookkeeping can settle an old lease without reviving bytes.
  IF TG_OP='INSERT' OR NEW.status='running' OR NEW.entries IS DISTINCT FROM OLD.entries THEN
   FOR entry IN SELECT value FROM jsonb_array_elements(NEW.entries) LOOP
    PERFORM public.assert_member_photo_path(entry->>'path');
   END LOOP;
  END IF;
 ELSIF TG_TABLE_NAME='seller_claim_transfers' THEN
  PERFORM public.assert_member_photo_writer(NEW.claimant_id);
  IF TG_OP='UPDATE' THEN PERFORM public.assert_member_photo_writer(OLD.claimant_id); END IF;
  FOR entry IN SELECT value FROM jsonb_array_elements(NEW.manifest) LOOP
   PERFORM public.assert_member_photo_path(entry->>'old');
   PERFORM public.assert_member_photo_path(entry->>'new');
  END LOOP;
 ELSE RAISE EXCEPTION 'Unsupported photo journal';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_member_photo_journal BEFORE INSERT ON public.photo_storage_reservations
 FOR EACH ROW EXECUTE FUNCTION public.guard_member_photo_journal();
CREATE TRIGGER guard_member_photo_journal BEFORE INSERT OR UPDATE ON public.photo_upload_tickets
 FOR EACH ROW EXECUTE FUNCTION public.guard_member_photo_journal();
CREATE TRIGGER guard_member_photo_journal BEFORE INSERT OR UPDATE ON public.photo_object_receipts
 FOR EACH ROW EXECUTE FUNCTION public.guard_member_photo_journal();
CREATE TRIGGER guard_member_photo_journal BEFORE INSERT OR UPDATE ON public.photo_migration_items
 FOR EACH ROW EXECUTE FUNCTION public.guard_member_photo_journal();
CREATE TRIGGER guard_member_photo_journal BEFORE INSERT OR UPDATE ON public.seller_claim_transfers
 FOR EACH ROW EXECUTE FUNCTION public.guard_member_photo_journal();

CREATE FUNCTION public.guard_member_photo_reference()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 -- Preserve unrelated edits and removal of an existing shared reference. New
 -- references require a live writer; they cannot revive a deleting member's key.
 IF TG_OP='INSERT' OR NEW.storage_path IS DISTINCT FROM OLD.storage_path THEN
  PERFORM public.assert_member_photo_path(NEW.storage_path);
 END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE relation text; BEGIN
 FOREACH relation IN ARRAY ARRAY['listing_media','ask_media','product_images',
   'product_models','product_suggestion_media','request_media','order_evidence'] LOOP
  EXECUTE format('CREATE TRIGGER guard_member_photo_reference BEFORE INSERT OR UPDATE OF storage_path ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_member_photo_reference()',relation);
 END LOOP;
END $$;

CREATE FUNCTION public.guard_member_import_photos()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE path text;
BEGIN
 FOR path IN SELECT DISTINCT p FROM unnest(NEW.public_paths) p LOOP
  IF TG_OP='INSERT' OR NOT coalesce(path=ANY(OLD.public_paths),false)
  THEN PERFORM public.assert_member_photo_path(path); END IF;
 END LOOP;
 FOR path IN SELECT DISTINCT p FROM unnest(NEW.evidence_paths) p LOOP
  IF TG_OP='INSERT' OR NOT coalesce(path=ANY(OLD.evidence_paths),false)
  THEN PERFORM public.assert_member_photo_path(path); END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_member_import_photos BEFORE INSERT OR UPDATE OF public_paths,evidence_paths
 ON public.fb_marketplace_import_items FOR EACH ROW EXECUTE FUNCTION public.guard_member_import_photos();

REVOKE ALL ON FUNCTION public.assert_member_photo_writer(uuid),public.assert_member_photo_path(text),
 public.lock_member_photo_deletion(),public.guard_member_photo_journal(),
 public.guard_member_photo_reference(),public.guard_member_import_photos()
 FROM PUBLIC,anon,authenticated,service_role;

SELECT public.protect_account_access_boundaries();
DO $$ BEGIN
 IF public.account_access_coverage() IS DISTINCT FROM jsonb_build_object(
   'unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
 THEN RAISE EXCEPTION 'Account access boundary coverage is incomplete'; END IF;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
