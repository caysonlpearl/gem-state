-- Scope member checks to actual member relationships. Catalog/order UUID folders
-- are not evidence that a file belongs to an Auth account. No objects are erased.
BEGIN;

CREATE OR REPLACE FUNCTION public.assert_member_photo_writer(_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 -- The post-lock permission read needs a fresh committed snapshot. A caller
 -- retaining an older transaction snapshot must not authorize a late write.
 IF current_setting('transaction_isolation')<>'read committed' OR _user IS NULL
 THEN RAISE EXCEPTION 'Photo account is unavailable'; END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended('bluebird-account-photo:'||_user::text,0));
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=_user AND deleted_at IS NULL
      AND (banned_until IS NULL OR banned_until<=clock_timestamp()))
 OR EXISTS(SELECT 1 FROM public.mobile_account_deletions WHERE user_id=_user)
 OR EXISTS(SELECT 1 FROM public.account_deletion_jobs WHERE user_id=_user AND status<>'completed')
 THEN RAISE EXCEPTION 'Photo account is unavailable'; END IF;
END $$;

CREATE FUNCTION public.assert_known_member_photo_reference(_path text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE prefix text:=split_part(_path,'/',1); actor uuid;
BEGIN
 IF prefix ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
  actor:=prefix::uuid;
  IF EXISTS(SELECT 1 FROM auth.users WHERE id=actor)
     OR EXISTS(SELECT 1 FROM public.mobile_account_deletions WHERE user_id=actor)
     OR EXISTS(SELECT 1 FROM public.account_deletion_jobs WHERE user_id=actor AND status<>'completed')
  THEN PERFORM public.assert_member_photo_writer(actor); END IF;
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.guard_member_photo_reference()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;
BEGIN
 IF TG_TABLE_NAME IN ('listing_media','ask_media') THEN
  IF TG_OP='INSERT' OR NEW.storage_path IS DISTINCT FROM OLD.storage_path THEN
   PERFORM public.assert_member_photo_path(NEW.storage_path);
  END IF;
 ELSIF TG_TABLE_NAME='request_media' THEN
  IF TG_OP='INSERT' OR NEW.storage_path IS DISTINCT FROM OLD.storage_path
     OR NEW.request_id IS DISTINCT FROM OLD.request_id THEN
   SELECT buyer_id INTO actor FROM public.sourcing_requests WHERE id=NEW.request_id FOR SHARE;
   PERFORM public.assert_member_photo_writer(actor);
   PERFORM public.assert_known_member_photo_reference(NEW.storage_path);
   IF TG_OP='UPDATE' AND NEW.request_id IS DISTINCT FROM OLD.request_id THEN
    SELECT buyer_id INTO actor FROM public.sourcing_requests WHERE id=OLD.request_id FOR SHARE;
    PERFORM public.assert_member_photo_writer(actor);
   END IF;
  END IF;
 ELSIF TG_TABLE_NAME='product_suggestion_media' THEN
  IF TG_OP='INSERT' OR NEW.storage_path IS DISTINCT FROM OLD.storage_path
     OR NEW.suggestion_id IS DISTINCT FROM OLD.suggestion_id THEN
   SELECT submitted_by INTO actor FROM public.product_suggestions WHERE id=NEW.suggestion_id FOR SHARE;
   PERFORM public.assert_member_photo_writer(actor);
   PERFORM public.assert_known_member_photo_reference(NEW.storage_path);
   IF TG_OP='UPDATE' AND NEW.suggestion_id IS DISTINCT FROM OLD.suggestion_id THEN
    SELECT submitted_by INTO actor FROM public.product_suggestions WHERE id=OLD.suggestion_id FOR SHARE;
    PERFORM public.assert_member_photo_writer(actor);
   END IF;
  END IF;
 ELSIF TG_TABLE_NAME='order_evidence' THEN
  IF TG_OP='INSERT' OR NEW.storage_path IS DISTINCT FROM OLD.storage_path
     OR NEW.order_id IS DISTINCT FROM OLD.order_id
     OR NEW.uploaded_by IS DISTINCT FROM OLD.uploaded_by THEN
   PERFORM public.assert_member_photo_writer(NEW.uploaded_by);
   PERFORM public.assert_known_member_photo_reference(NEW.storage_path);
   IF TG_OP='UPDATE' AND NEW.uploaded_by IS DISTINCT FROM OLD.uploaded_by THEN
    PERFORM public.assert_member_photo_writer(OLD.uploaded_by);
   END IF;
  END IF;
 ELSE RAISE EXCEPTION 'Unsupported member photo reference';
 END IF;
 RETURN NEW;
END $$;

-- Catalog paths use a product namespace and may point at shared public assets.
-- Their inventory needs product/business ownership; a UUID prefix is not an actor.
DROP TRIGGER guard_member_photo_reference ON public.product_images;
DROP TRIGGER guard_member_photo_reference ON public.product_models;

DROP TRIGGER guard_member_photo_reference ON public.request_media;
CREATE TRIGGER guard_member_photo_reference BEFORE INSERT OR UPDATE OF storage_path,request_id
 ON public.request_media FOR EACH ROW EXECUTE FUNCTION public.guard_member_photo_reference();
DROP TRIGGER guard_member_photo_reference ON public.product_suggestion_media;
CREATE TRIGGER guard_member_photo_reference BEFORE INSERT OR UPDATE OF storage_path,suggestion_id
 ON public.product_suggestion_media FOR EACH ROW EXECUTE FUNCTION public.guard_member_photo_reference();
DROP TRIGGER guard_member_photo_reference ON public.order_evidence;
CREATE TRIGGER guard_member_photo_reference BEFORE INSERT OR UPDATE OF storage_path,order_id,uploaded_by
 ON public.order_evidence FOR EACH ROW EXECUTE FUNCTION public.guard_member_photo_reference();

REVOKE ALL ON FUNCTION public.assert_member_photo_writer(uuid),
 public.guard_member_photo_reference(),public.assert_known_member_photo_reference(text)
 FROM PUBLIC,anon,authenticated,service_role;
SELECT public.protect_account_access_boundaries();
DO $$ BEGIN
 IF public.account_access_coverage() IS DISTINCT FROM jsonb_build_object(
   'unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
 THEN RAISE EXCEPTION 'Account access boundary coverage is incomplete'; END IF;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
