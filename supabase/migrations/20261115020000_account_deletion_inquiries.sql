-- Source-only: compose with conversation, authored-listing, media and explicit
-- retention handling before enabling the deletion worker. No Auth authority.
BEGIN;
SET LOCAL search_path='';
SET LOCAL lock_timeout='5s';
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.account_deletion_controls WHERE id AND NOT worker_enabled)
 OR NOT public.account_deletion_conversation_barrier_current()
 OR NOT public.account_deletion_private_barrier_current()
 OR NOT public.account_deletion_profile_barrier_current()
 THEN RAISE EXCEPTION 'Review disabled inquiry-erasure prerequisites'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.listing_inquiries'::regclass AND relkind='r' AND NOT relispartition)
 OR EXISTS(SELECT 1 FROM pg_inherits WHERE inhparent='public.listing_inquiries'::regclass OR inhrelid='public.listing_inquiries'::regclass)
 OR EXISTS(SELECT 1 FROM pg_rewrite WHERE ev_class='public.listing_inquiries'::regclass)
 OR (SELECT jsonb_agg(jsonb_build_array(attname,atttypid::regtype::text,attnotnull,attgenerated) ORDER BY attnum) FROM pg_attribute WHERE attrelid='public.listing_inquiries'::regclass AND attnum>0 AND NOT attisdropped) IS DISTINCT FROM
 '[ ["id","uuid",true,""],["listing_id","uuid",true,""],["seller_id","uuid",true,""],["buyer_id","uuid",true,""],["buyer_name","text",true,""],["buyer_email","text",true,""],["message","text",true,""],["status","text",true,""],["created_at","timestamp with time zone",true,""] ]'::jsonb
 OR (SELECT count(*) FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND c.conkey=ARRAY[a.attnum]::smallint[] WHERE c.conrelid='public.listing_inquiries'::regclass AND c.contype='f' AND c.confdeltype='c' AND NOT c.condeferrable AND c.convalidated AND ((a.attname IN('buyer_id','seller_id') AND c.confrelid='auth.users'::regclass) OR (a.attname='listing_id' AND c.confrelid='public.asks'::regclass)))<>3
 OR (SELECT count(*) FROM pg_constraint WHERE (conrelid='public.listing_inquiries'::regclass OR confrelid='public.listing_inquiries'::regclass) AND contype<>'n')<>6
 OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND confrelid='public.listing_inquiries'::regclass AND conrelid='public.conversation_messages'::regclass AND conname='conversation_messages_source_inquiry_id_fkey' AND confdeltype='a' AND NOT condeferrable AND convalidated)<>1
 OR (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.listing_inquiries'::regclass AND NOT tgisinternal)<>1
 OR NOT EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid WHERE t.tgrelid='public.listing_inquiries'::regclass AND t.tgname='shopping_accepted_inquiry' AND t.tgtype=5 AND t.tgenabled='O' AND t.tgnargs=0 AND t.tgqual IS NULL AND t.tgattr::text='' AND md5(p.prosrc)='83d460037621c55167924f896c42eb2a')
 THEN RAISE EXCEPTION 'Review inquiry layout, hooks and child relationships'; END IF;
END $$;

-- A surviving buyer keeps their own inquiry when the seller or listing goes
-- away. Buyer deletion is explicit, after their copied conversation messages.
ALTER TABLE public.listing_inquiries ALTER COLUMN seller_id DROP NOT NULL,ALTER COLUMN listing_id DROP NOT NULL,
 DROP CONSTRAINT listing_inquiries_seller_id_fkey,DROP CONSTRAINT listing_inquiries_buyer_id_fkey,DROP CONSTRAINT listing_inquiries_listing_id_fkey,
 ADD CONSTRAINT listing_inquiries_seller_id_fkey FOREIGN KEY(seller_id) REFERENCES auth.users(id) ON DELETE SET NULL,
 ADD CONSTRAINT listing_inquiries_buyer_id_fkey FOREIGN KEY(buyer_id) REFERENCES auth.users(id) ON DELETE RESTRICT,
 ADD CONSTRAINT listing_inquiries_listing_id_fkey FOREIGN KEY(listing_id) REFERENCES public.asks(id) ON DELETE SET NULL,
 ADD CONSTRAINT listing_inquiries_retired CHECK((seller_id IS NOT NULL AND listing_id IS NOT NULL) OR status='closed');
CREATE INDEX account_deletion_inquiry_author ON public.listing_inquiries(buyer_id,id);
CREATE INDEX account_deletion_inquiry_seller ON public.listing_inquiries(seller_id,id);

CREATE FUNCTION public.account_deletion_inquiry_context(_user uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE context jsonb; BEGIN
 context:=nullif(current_setting('bluebird.inquiry_cleanup',true),'')::jsonb;
 RETURN context->>'user'=_user::text AND public.account_deletion_lease_current((context->>'id')::uuid,_user,(context->>'lease')::uuid,'records');
EXCEPTION WHEN OTHERS THEN RETURN false; END $$;

CREATE FUNCTION public.account_deletion_inquiry_claim(_listing uuid,_buyer uuid,_from uuid,_to uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE member uuid; BEGIN
 IF coalesce(auth.role(),'')<>'service_role' OR current_setting('parkvault.trusted_operation',true) IS DISTINCT FROM 'on'
 OR _listing IS NULL OR _buyer IS NULL OR _from IS NULL OR _to IS NULL OR _from=_to
 OR NOT EXISTS(
 SELECT 1 FROM public.fb_marketplace_import_items i
 JOIN public.managed_import_sellers s ON s.source_profile_url=i.source_profile_url
 JOIN public.seller_claim_tokens t ON t.managed_seller_id=s.id
 JOIN public.seller_claim_transfers j ON j.claim_token_id=t.id
 JOIN public.asks a ON a.id=i.listing_id JOIN auth.users u ON u.id=_to
 WHERE i.listing_id=_listing AND s.owner_user_id=_from AND s.claimed_at IS NULL
 AND (s.required_claimant_id IS NULL OR s.required_claimant_id=_to)
 AND j.claimant_id=_to AND j.status='preparing' AND j.lease_until>clock_timestamp()
 AND t.revoked_at IS NULL AND t.consumed_at IS NULL AND t.expires_at>clock_timestamp()
 AND a.seller_id=_to AND u.email_confirmed_at IS NOT NULL AND coalesce(u.banned_until,'1970-01-01')<clock_timestamp())
 THEN RETURN false; END IF;
 FOR member IN SELECT DISTINCT u FROM unnest(ARRAY[_buyer,_from,_to]) u ORDER BY u LOOP PERFORM public.assert_member_private_record_writer(member); END LOOP;
 RETURN true;
END $$;

CREATE FUNCTION public.guard_account_deletion_inquiry_writer() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$ DECLARE member uuid; BEGIN
 IF TG_OP='DELETE' THEN
  IF public.account_deletion_inquiry_context(OLD.buyer_id) THEN RETURN OLD; END IF;
  FOR member IN SELECT DISTINCT u FROM unnest(ARRAY[OLD.buyer_id,OLD.seller_id]) u WHERE u IS NOT NULL ORDER BY u LOOP PERFORM public.assert_member_private_record_writer(member); END LOOP;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.buyer_id IS DISTINCT FROM OLD.buyer_id
  OR NEW.buyer_name IS DISTINCT FROM OLD.buyer_name OR NEW.buyer_email IS DISTINCT FROM OLD.buyer_email
  OR NEW.message IS DISTINCT FROM OLD.message OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN RAISE EXCEPTION 'Inquiry authorship is immutable'; END IF;
  IF NEW.seller_id IS NULL AND OLD.seller_id IS NOT NULL AND NEW.listing_id IS NOT DISTINCT FROM OLD.listing_id
  AND NEW.status='closed' AND public.account_deletion_inquiry_context(OLD.seller_id) THEN RETURN NEW; END IF;
  -- SET NULL from a deleted Ask closes the inquiry, keeping the buyer's text.
  -- It is never permission to move an inquiry to a different listing.
  IF NEW.listing_id IS NULL AND OLD.listing_id IS NOT NULL AND NEW.seller_id IS NOT DISTINCT FROM OLD.seller_id
  AND NOT EXISTS(SELECT 1 FROM public.asks WHERE id=OLD.listing_id) THEN NEW.status:='closed'; RETURN NEW; END IF;
  IF NEW.listing_id IS DISTINCT FROM OLD.listing_id THEN RAISE EXCEPTION 'Inquiry listing is immutable'; END IF;
  IF NEW.seller_id IS DISTINCT FROM OLD.seller_id THEN
   IF public.account_deletion_inquiry_claim(OLD.listing_id,OLD.buyer_id,OLD.seller_id,NEW.seller_id) THEN RETURN NEW; END IF;
   RAISE EXCEPTION 'Inquiry seller is immutable';
  END IF;
 END IF;
 IF NEW.seller_id IS NULL OR NEW.listing_id IS NULL THEN RAISE EXCEPTION 'Inquiry is read-only'; END IF;
 FOR member IN SELECT DISTINCT u FROM unnest(ARRAY[NEW.buyer_id,NEW.seller_id]) u ORDER BY u LOOP PERFORM public.assert_member_private_record_writer(member); END LOOP;
 IF TG_OP='INSERT' AND (NEW.buyer_id=NEW.seller_id OR NOT EXISTS(SELECT 1 FROM public.asks WHERE id=NEW.listing_id AND seller_id=NEW.seller_id))
 THEN RAISE EXCEPTION 'Inquiry ownership is unavailable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_account_deletion_inquiry_writer BEFORE INSERT OR UPDATE OR DELETE ON public.listing_inquiries FOR EACH ROW EXECUTE FUNCTION public.guard_account_deletion_inquiry_writer();

CREATE FUNCTION public.account_deletion_inquiry_catalog() RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object(
 'relation',(SELECT jsonb_build_array(relkind,relispartition,relrowsecurity) FROM pg_class WHERE oid='public.listing_inquiries'::regclass),
 'columns',(SELECT jsonb_agg(jsonb_build_array(a.attname,a.atttypid::regtype::text,a.atttypmod,a.attnotnull,a.attgenerated,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.listing_inquiries'::regclass AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(conrelid::regclass::text,conname,pg_get_constraintdef(oid,true),convalidated,condeferrable,condeferred) ORDER BY conrelid,conname) FROM pg_constraint WHERE conrelid='public.listing_inquiries'::regclass OR confrelid='public.listing_inquiries'::regclass),
 'hooks',(SELECT jsonb_object_agg(tgname,jsonb_build_array(pg_get_triggerdef(oid,true),md5(pg_get_functiondef(tgfoid)),tgenabled)) FROM pg_trigger WHERE tgrelid='public.listing_inquiries'::regclass AND NOT tgisinternal),
 'indexes',(SELECT jsonb_agg(pg_get_indexdef(indexrelid) ORDER BY indexrelid) FROM pg_index WHERE indrelid='public.listing_inquiries'::regclass),
 'rules',(SELECT coalesce(jsonb_agg(pg_get_ruledef(oid,true) ORDER BY oid),'[]') FROM pg_rewrite WHERE ev_class='public.listing_inquiries'::regclass),
 'inheritance',(SELECT count(*) FROM pg_inherits WHERE inhparent='public.listing_inquiries'::regclass OR inhrelid='public.listing_inquiries'::regclass));
$$;
CREATE TABLE public.account_deletion_inquiry_contract(id boolean PRIMARY KEY DEFAULT true CHECK(id),catalog jsonb NOT NULL,functions jsonb NOT NULL);
ALTER TABLE public.account_deletion_inquiry_contract ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_deletion_inquiry_contract FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.account_deletion_inquiry_contract TO service_role;
CREATE FUNCTION public.account_deletion_inquiry_remaining(_user uuid) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$ SELECT EXISTS(SELECT 1 FROM public.listing_inquiries WHERE buyer_id=_user OR seller_id=_user); $$;
CREATE FUNCTION public.account_deletion_inquiry_scope(_id uuid,_user uuid,_lease uuid,_phase text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$ BEGIN
 PERFORM public.account_deletion_conversation_scope(_id,_user,_lease,_phase);
 LOCK TABLE public.listing_inquiries IN ROW EXCLUSIVE MODE;
 IF NOT public.account_deletion_inquiry_barrier_current() THEN RAISE EXCEPTION 'Inquiry erasure requires schema review'; END IF;
END $$;
CREATE FUNCTION public.purge_account_deletion_inquiries(_id uuid,_user uuid,_lease uuid,_limit integer DEFAULT 100) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
DECLARE changed integer:=0; ids uuid[]; selected text;
 previous_context text:=coalesce(current_setting('bluebird.inquiry_cleanup',true),'');
BEGIN
 IF _limit IS NULL OR _limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Inquiry erasure unavailable'; END IF;
 PERFORM public.account_deletion_inquiry_scope(_id,_user,_lease,'records');
 PERFORM set_config('bluebird.inquiry_cleanup',jsonb_build_object('id',_id,'user',_user,'lease',_lease)::text,true);
 SELECT array_agg(id) INTO ids FROM(SELECT id FROM public.listing_inquiries WHERE buyer_id=_user ORDER BY id LIMIT _limit FOR UPDATE) targets;
 IF ids IS NOT NULL THEN
  IF EXISTS(SELECT 1 FROM public.conversation_messages WHERE source_inquiry_id=ANY(ids))
  THEN RAISE EXCEPTION 'Complete authored conversation cleanup before inquiry erasure'; END IF;
  DELETE FROM public.listing_inquiries WHERE id=ANY(ids) AND buyer_id=_user;
  GET DIAGNOSTICS changed=ROW_COUNT; selected:='authored';
 ELSE
  SELECT array_agg(id) INTO ids FROM(SELECT id FROM public.listing_inquiries WHERE seller_id=_user ORDER BY id LIMIT _limit FOR UPDATE) targets;
  IF ids IS NOT NULL THEN
   UPDATE public.listing_inquiries SET seller_id=NULL,status='closed' WHERE id=ANY(ids) AND seller_id=_user;
   GET DIAGNOSTICS changed=ROW_COUNT; selected:='seller';
  END IF;
 END IF;
 PERFORM set_config('bluebird.inquiry_cleanup',previous_context,true);
 IF NOT public.account_deletion_lease_current(_id,_user,_lease,'records') OR NOT public.account_deletion_inquiry_barrier_current()
 OR public.account_access_coverage() IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
 THEN RAISE EXCEPTION 'Inquiry erasure unavailable'; END IF;
 RETURN jsonb_build_object('source',selected,'changed',changed,'pass_done',NOT public.account_deletion_inquiry_remaining(_user));
EXCEPTION WHEN OTHERS THEN PERFORM set_config('bluebird.inquiry_cleanup',previous_context,true); RAISE;
END $$;
CREATE FUNCTION public.verify_account_deletion_inquiries(_id uuid,_user uuid,_lease uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$ BEGIN
 PERFORM public.account_deletion_inquiry_scope(_id,_user,_lease,'verification');
 RETURN NOT public.account_deletion_inquiry_remaining(_user) AND public.account_deletion_lease_current(_id,_user,_lease,'verification');
END $$;
CREATE FUNCTION public.guard_account_deletion_inquiry_completion() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF NEW.status='completed' AND (NOT public.account_deletion_inquiry_barrier_current() OR public.account_deletion_inquiry_remaining(OLD.user_id))
 THEN RAISE EXCEPTION 'Inquiry erasure verification required'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_account_deletion_inquiry_completion AFTER UPDATE OF status,user_id ON public.account_deletion_jobs FOR EACH ROW EXECUTE FUNCTION public.guard_account_deletion_inquiry_completion();
CREATE FUNCTION public.account_deletion_inquiry_functions() RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_object_agg(p.oid::regprocedure::text,md5(pg_get_functiondef(p.oid))) FROM pg_proc p WHERE p.oid IN(
 'public.account_deletion_inquiry_context(uuid)'::regprocedure,'public.account_deletion_inquiry_claim(uuid,uuid,uuid,uuid)'::regprocedure,
 'public.guard_account_deletion_inquiry_writer()'::regprocedure,'public.account_deletion_inquiry_catalog()'::regprocedure,
 'public.account_deletion_inquiry_remaining(uuid)'::regprocedure,'public.account_deletion_inquiry_scope(uuid,uuid,uuid,text)'::regprocedure,
 'public.purge_account_deletion_inquiries(uuid,uuid,uuid,integer)'::regprocedure,'public.verify_account_deletion_inquiries(uuid,uuid,uuid)'::regprocedure,
 'public.guard_account_deletion_inquiry_completion()'::regprocedure,'public.account_deletion_inquiry_functions()'::regprocedure,to_regprocedure('public.account_deletion_inquiry_barrier_current()'));
$$;
CREATE FUNCTION public.account_deletion_inquiry_barrier_current() RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.account_deletion_inquiry_contract WHERE id AND catalog=public.account_deletion_inquiry_catalog() AND functions=public.account_deletion_inquiry_functions());
$$;
UPDATE public.account_deletion_private_contract SET hooks=public.account_deletion_private_hooks() WHERE id;
INSERT INTO public.account_deletion_inquiry_contract SELECT true,public.account_deletion_inquiry_catalog(),public.account_deletion_inquiry_functions();
REVOKE ALL ON FUNCTION public.account_deletion_inquiry_context(uuid),public.account_deletion_inquiry_claim(uuid,uuid,uuid,uuid),public.guard_account_deletion_inquiry_writer(),public.account_deletion_inquiry_catalog(),public.account_deletion_inquiry_remaining(uuid),public.account_deletion_inquiry_scope(uuid,uuid,uuid,text),public.purge_account_deletion_inquiries(uuid,uuid,uuid,integer),public.verify_account_deletion_inquiries(uuid,uuid,uuid),public.guard_account_deletion_inquiry_completion(),public.account_deletion_inquiry_functions(),public.account_deletion_inquiry_barrier_current() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.purge_account_deletion_inquiries(uuid,uuid,uuid,integer),public.verify_account_deletion_inquiries(uuid,uuid,uuid) TO service_role;
SELECT public.protect_account_access_boundaries();
DO $$ BEGIN
 IF NOT public.account_deletion_inquiry_barrier_current() OR NOT public.account_deletion_conversation_barrier_current()
 OR NOT public.account_deletion_private_barrier_current() OR NOT public.account_deletion_profile_barrier_current()
 THEN RAISE EXCEPTION 'Inquiry erasure boundaries require review'; END IF;
END $$;
COMMIT;
