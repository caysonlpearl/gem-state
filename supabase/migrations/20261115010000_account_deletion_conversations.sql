-- Conversation cleanup preserves the other member's messages. Source only;
-- install only with the reviewed deletion/media/retention composition inactive.
BEGIN;
SET LOCAL search_path='';
SET LOCAL lock_timeout='5s';
DO $$ DECLARE relation text; BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.account_deletion_controls WHERE id AND NOT worker_enabled)
 OR NOT public.account_deletion_private_barrier_current() OR NOT public.account_deletion_profile_barrier_current()
 THEN RAISE EXCEPTION 'Review disabled conversation-erasure prerequisites'; END IF;
 FOREACH relation IN ARRAY ARRAY['conversations','conversation_messages','conversation_participants','conversation_reports','mobile_dealer_conversations'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=format('public.%I',relation)::regclass AND relkind='r' AND NOT relispartition)
  OR EXISTS(SELECT 1 FROM pg_inherits WHERE inhparent=format('public.%I',relation)::regclass OR inhrelid=format('public.%I',relation)::regclass)
  OR EXISTS(SELECT 1 FROM pg_rewrite WHERE ev_class=format('public.%I',relation)::regclass)
  THEN RAISE EXCEPTION 'Review conversation relation layout'; END IF;
 END LOOP;
 IF (SELECT count(*) FROM pg_trigger WHERE tgrelid IN('public.conversations'::regclass,'public.conversation_messages'::regclass,'public.conversation_participants'::regclass,'public.conversation_reports'::regclass,'public.mobile_dealer_conversations'::regclass) AND NOT tgisinternal)<>1
 OR NOT EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid WHERE t.tgrelid='public.conversations'::regclass AND t.tgname='shopping_conversation' AND t.tgtype=5 AND t.tgenabled='O' AND t.tgnargs=0 AND t.tgqual IS NULL AND t.tgattr::text='' AND md5(p.prosrc)='83d460037621c55167924f896c42eb2a')
 OR EXISTS(SELECT 1 FROM pg_constraint WHERE contype='f' AND confrelid IN('public.conversation_messages'::regclass,'public.conversation_participants'::regclass,'public.conversation_reports'::regclass,'public.mobile_dealer_conversations'::regclass))
 OR EXISTS(SELECT 1 FROM pg_constraint WHERE contype='f' AND confrelid='public.conversations'::regclass AND conrelid NOT IN('public.conversation_messages'::regclass,'public.conversation_participants'::regclass,'public.conversation_reports'::regclass,'public.mobile_dealer_conversations'::regclass))
 THEN RAISE EXCEPTION 'Review conversation hooks and child relationships'; END IF;
END $$;

-- A canonical category is enough to prove app eligibility after the listing
-- disappears. No deleted-member identity, title or private message is copied.
CREATE TABLE public.account_deletion_conversation_catalog_refs(
 conversation_id uuid PRIMARY KEY REFERENCES public.conversations(id) ON DELETE CASCADE,
 category_slug text NOT NULL CHECK(category_slug ~ '^[a-z0-9-]{1,80}$' AND category_slug<>'firearms'),
 catalog_version integer NOT NULL DEFAULT 1 CHECK(catalog_version=1)
);
ALTER TABLE public.account_deletion_conversation_catalog_refs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_deletion_conversation_catalog_refs FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.account_deletion_conversation_catalog_refs TO service_role;

ALTER TABLE public.conversations ALTER COLUMN buyer_id DROP NOT NULL,ALTER COLUMN seller_id DROP NOT NULL,
 DROP CONSTRAINT conversations_buyer_id_fkey,DROP CONSTRAINT conversations_seller_id_fkey,
 ADD CONSTRAINT conversations_buyer_id_fkey FOREIGN KEY(buyer_id) REFERENCES auth.users(id) ON DELETE SET NULL,
 ADD CONSTRAINT conversations_seller_id_fkey FOREIGN KEY(seller_id) REFERENCES auth.users(id) ON DELETE SET NULL,
 ADD CONSTRAINT conversation_retired_members CHECK((buyer_id IS NOT NULL OR seller_id IS NOT NULL) AND ((buyer_id IS NOT NULL AND seller_id IS NOT NULL) OR closed_at IS NOT NULL));
ALTER TABLE public.conversation_messages DROP CONSTRAINT conversation_messages_sender_id_fkey,
 ADD CONSTRAINT conversation_messages_sender_id_fkey FOREIGN KEY(sender_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE public.conversation_reports DROP CONSTRAINT conversation_reports_reporter_id_fkey,
 ADD CONSTRAINT conversation_reports_reporter_id_fkey FOREIGN KEY(reporter_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE public.mobile_dealer_conversations ALTER COLUMN buyer_id DROP NOT NULL,ALTER COLUMN seller_id DROP NOT NULL,
 DROP CONSTRAINT mobile_dealer_conversations_buyer_id_fkey,DROP CONSTRAINT mobile_dealer_conversations_seller_id_fkey,
 ADD CONSTRAINT mobile_dealer_conversations_buyer_id_fkey FOREIGN KEY(buyer_id) REFERENCES auth.users(id) ON DELETE SET NULL,
 ADD CONSTRAINT mobile_dealer_conversations_seller_id_fkey FOREIGN KEY(seller_id) REFERENCES auth.users(id) ON DELETE SET NULL,
 ADD CONSTRAINT mobile_dealer_conversation_retired_members CHECK(buyer_id IS NOT NULL OR seller_id IS NOT NULL);
CREATE INDEX account_deletion_message_author ON public.conversation_messages(sender_id,id);

CREATE FUNCTION public.account_deletion_conversation_context(_user uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE context jsonb; BEGIN
 context:=nullif(current_setting('bluebird.conversation_cleanup',true),'')::jsonb;
 RETURN context->>'user'=_user::text AND public.account_deletion_lease_current((context->>'id')::uuid,_user,(context->>'lease')::uuid,'records');
EXCEPTION WHEN OTHERS THEN RETURN false; END $$;

-- Imported-seller claims legitimately hand the seller's seat to the verified
-- claimant. The existing transaction flag alone is never authority: require
-- its live claim journal and the already-transferred listing as well.
CREATE FUNCTION public.account_deletion_conversation_claim(_conversation uuid,_from uuid,_to uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE member uuid; members uuid[]; BEGIN
 IF coalesce(auth.role(),'')<>'service_role' OR current_setting('parkvault.trusted_operation',true) IS DISTINCT FROM 'on'
 OR _from IS NULL OR _to IS NULL OR _from=_to THEN RETURN false; END IF;
 SELECT ARRAY[c.buyer_id,_from,_to] INTO members
 FROM public.conversations c
 JOIN public.fb_marketplace_import_items i ON i.listing_id=c.listing_id
 JOIN public.managed_import_sellers s ON s.source_profile_url=i.source_profile_url
 JOIN public.seller_claim_tokens t ON t.managed_seller_id=s.id
 JOIN public.seller_claim_transfers j ON j.claim_token_id=t.id
 JOIN public.asks a ON a.id=c.listing_id
 JOIN auth.users u ON u.id=_to
 WHERE c.id=_conversation AND c.seller_id=_from AND c.buyer_id IS NOT NULL
 AND s.owner_user_id=_from AND s.claimed_at IS NULL
 AND (s.required_claimant_id IS NULL OR s.required_claimant_id=_to)
 AND j.claimant_id=_to AND j.status='preparing' AND j.lease_until>clock_timestamp()
 AND t.revoked_at IS NULL AND t.consumed_at IS NULL AND t.expires_at>clock_timestamp()
 AND a.seller_id=_to AND u.email_confirmed_at IS NOT NULL AND coalesce(u.banned_until,'1970-01-01')<clock_timestamp()
 LIMIT 1;
 IF members IS NULL THEN RETURN false; END IF;
 FOR member IN SELECT DISTINCT u FROM unnest(members) u ORDER BY u LOOP PERFORM public.assert_member_private_record_writer(member); END LOOP;
 RETURN true;
END $$;

-- Bluebird operators may reply for an unclaimed imported seller. Preserve
-- that existing workflow without giving arbitrary third parties a seat.
CREATE FUNCTION public.account_deletion_managed_message_context(_conversation uuid,_seller uuid,_actor uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF _seller IS NULL OR NOT EXISTS(
  SELECT 1 FROM public.conversations c
  JOIN public.fb_marketplace_import_items i ON i.listing_id=c.listing_id
  JOIN public.managed_import_sellers s ON s.source_profile_url=i.source_profile_url AND s.id=_seller
  WHERE c.id=_conversation AND c.seller_id=s.owner_user_id AND s.claimed_at IS NULL AND c.closed_at IS NULL
  AND NOT EXISTS(SELECT 1 FROM public.conversation_participants p WHERE p.conversation_id=c.id AND p.blocked_at IS NOT NULL)
 ) THEN RETURN false; END IF;
 PERFORM public.assert_import_operator(_actor);
 RETURN true;
END $$;

CREATE FUNCTION public.guard_account_deletion_conversation_writer() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
DECLARE member uuid; parent public.conversations;
BEGIN
 IF TG_TABLE_NAME='conversations' THEN
  IF TG_OP='UPDATE' AND (
   (OLD.buyer_id IS NOT NULL AND public.account_deletion_conversation_context(OLD.buyer_id) AND NEW.buyer_id IS NULL AND NEW.seller_id IS NOT DISTINCT FROM OLD.seller_id)
   OR (OLD.seller_id IS NOT NULL AND public.account_deletion_conversation_context(OLD.seller_id) AND NEW.seller_id IS NULL AND NEW.buyer_id IS NOT DISTINCT FROM OLD.buyer_id))
   AND NEW.closed_at IS NOT NULL THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND (NEW.buyer_id IS DISTINCT FROM OLD.buyer_id OR NEW.seller_id IS DISTINCT FROM OLD.seller_id)
  THEN
   IF NEW.id=OLD.id AND NEW.listing_id IS NOT DISTINCT FROM OLD.listing_id AND NEW.dealer_id IS NOT DISTINCT FROM OLD.dealer_id
   AND NEW.buyer_id IS NOT DISTINCT FROM OLD.buyer_id AND public.account_deletion_conversation_claim(OLD.id,OLD.seller_id,NEW.seller_id)
   THEN RETURN NEW; END IF;
   RAISE EXCEPTION 'Conversation membership is immutable';
  END IF;
  IF NEW.buyer_id IS NULL OR NEW.seller_id IS NULL THEN
   IF TG_OP='INSERT' OR NEW.closed_at IS NULL THEN RAISE EXCEPTION 'Conversation is read-only'; END IF;
   RETURN NEW;
  END IF;
  FOR member IN SELECT DISTINCT u FROM unnest(ARRAY[NEW.buyer_id,NEW.seller_id]) u ORDER BY u LOOP
   PERFORM public.assert_member_private_record_writer(member);
  END LOOP;
  RETURN NEW;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF TG_TABLE_NAME='conversation_messages' THEN
   IF NEW.sender_id IS DISTINCT FROM OLD.sender_id OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
   OR NEW.managed_seller_id IS DISTINCT FROM OLD.managed_seller_id OR NEW.sender_label IS DISTINCT FROM OLD.sender_label THEN RAISE EXCEPTION 'Message ownership is immutable'; END IF;
  ELSIF TG_TABLE_NAME='conversation_participants' THEN
   IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id OR NEW.role IS DISTINCT FROM OLD.role THEN
    IF NEW.conversation_id=OLD.conversation_id AND OLD.role='seller' AND NEW.role='seller'
    AND public.account_deletion_conversation_claim(OLD.conversation_id,OLD.user_id,NEW.user_id) THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'Conversation membership is immutable';
   END IF;
  END IF;
 END IF;
 SELECT * INTO parent FROM public.conversations WHERE id=NEW.conversation_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Conversation is unavailable'; END IF;
 IF TG_TABLE_NAME='conversation_participants' THEN
  IF NEW.user_id IS DISTINCT FROM parent.buyer_id AND NEW.user_id IS DISTINCT FROM parent.seller_id THEN RAISE EXCEPTION 'Conversation membership is unavailable'; END IF;
  PERFORM public.assert_member_private_record_writer(NEW.user_id);
 ELSIF TG_TABLE_NAME='mobile_dealer_conversations' THEN
  IF NEW.buyer_id IS DISTINCT FROM parent.buyer_id OR NEW.seller_id IS DISTINCT FROM parent.seller_id
  OR (parent.dealer_id IS NOT NULL AND NEW.dealer_id IS DISTINCT FROM parent.dealer_id)
  OR (parent.dealer_id IS NULL AND (parent.listing_id IS NOT NULL OR parent.dealer_inventory_record_id IS NOT NULL))
  THEN RAISE EXCEPTION 'Conversation ownership requires review'; END IF;
  IF TG_OP='UPDATE' AND (NEW.conversation_id IS DISTINCT FROM OLD.conversation_id OR NEW.dealer_id IS DISTINCT FROM OLD.dealer_id)
  THEN RAISE EXCEPTION 'Conversation ownership is immutable'; END IF;
  IF TG_OP='UPDATE' AND ((OLD.buyer_id IS NOT NULL AND NEW.buyer_id IS NULL AND public.account_deletion_conversation_context(OLD.buyer_id)) OR (OLD.seller_id IS NOT NULL AND NEW.seller_id IS NULL AND public.account_deletion_conversation_context(OLD.seller_id))) THEN RETURN NEW; END IF;
  IF NEW.buyer_id IS NULL OR NEW.seller_id IS NULL THEN RAISE EXCEPTION 'Conversation is read-only'; END IF;
  FOR member IN SELECT DISTINCT u FROM unnest(ARRAY[NEW.buyer_id,NEW.seller_id]) u ORDER BY u LOOP PERFORM public.assert_member_private_record_writer(member); END LOOP;
 ELSE
  IF parent.buyer_id IS NULL OR parent.seller_id IS NULL
  THEN RAISE EXCEPTION 'Conversation is read-only'; END IF;
  IF NEW.sender_id IS DISTINCT FROM parent.buyer_id AND NEW.sender_id IS DISTINCT FROM parent.seller_id
  AND NOT public.account_deletion_managed_message_context(parent.id,NEW.managed_seller_id,NEW.sender_id) THEN RAISE EXCEPTION 'Conversation sender is unavailable'; END IF;
  FOR member IN SELECT DISTINCT u FROM unnest(ARRAY[parent.buyer_id,parent.seller_id,NEW.sender_id]) u ORDER BY u LOOP PERFORM public.assert_member_private_record_writer(member); END LOOP;
 END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE relation text; BEGIN
 FOREACH relation IN ARRAY ARRAY['conversations','conversation_messages','conversation_participants','mobile_dealer_conversations'] LOOP
  EXECUTE format('CREATE TRIGGER guard_account_deletion_conversation_writer BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_account_deletion_conversation_writer()',relation);
 END LOOP;
END $$;

CREATE FUNCTION public.account_deletion_conversation_catalog() RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 WITH sources AS(SELECT unnest(ARRAY['public.conversations'::regclass,'public.conversation_messages'::regclass,'public.conversation_participants'::regclass,'public.conversation_reports'::regclass,'public.mobile_dealer_conversations'::regclass,'public.account_deletion_conversation_catalog_refs'::regclass]) oid)
 SELECT jsonb_build_object(
 'relations',(SELECT jsonb_agg(jsonb_build_array(oid::regclass::text,relkind,relispartition) ORDER BY oid) FROM pg_class WHERE oid IN(SELECT oid FROM sources)),
 'columns',(SELECT jsonb_agg(jsonb_build_array(attrelid::regclass::text,attname,atttypid::regtype::text,atttypmod,attnotnull,attgenerated) ORDER BY attrelid,attnum) FROM pg_attribute WHERE attrelid IN(SELECT oid FROM sources) AND attnum>0 AND NOT attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(conrelid::regclass::text,conname,pg_get_constraintdef(oid,true),convalidated,condeferrable,condeferred) ORDER BY conrelid,conname) FROM pg_constraint WHERE conrelid IN(SELECT oid FROM sources) OR confrelid IN(SELECT oid FROM sources)),
 'hooks',(SELECT jsonb_object_agg(tgrelid::regclass::text||'.'||tgname,jsonb_build_array(pg_get_triggerdef(oid,true),md5(pg_get_functiondef(tgfoid)),tgenabled)) FROM pg_trigger WHERE tgrelid IN(SELECT oid FROM sources) AND NOT tgisinternal),
 'indexes',(SELECT jsonb_agg(pg_get_indexdef(indexrelid) ORDER BY indexrelid) FROM pg_index WHERE indrelid IN(SELECT oid FROM sources)),
 'rules',(SELECT coalesce(jsonb_agg(pg_get_ruledef(oid,true) ORDER BY oid),'[]') FROM pg_rewrite WHERE ev_class IN(SELECT oid FROM sources)),
 'inheritance',(SELECT count(*) FROM pg_inherits WHERE inhparent IN(SELECT oid FROM sources) OR inhrelid IN(SELECT oid FROM sources)));
$$;
CREATE TABLE public.account_deletion_conversation_contract(id boolean PRIMARY KEY DEFAULT true CHECK(id),catalog jsonb NOT NULL,functions jsonb NOT NULL);
ALTER TABLE public.account_deletion_conversation_contract ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_deletion_conversation_contract FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.account_deletion_conversation_contract TO service_role;

CREATE FUNCTION public.account_deletion_conversation_remaining(_user uuid) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.conversation_messages WHERE sender_id=_user)
 OR EXISTS(SELECT 1 FROM public.conversation_participants WHERE user_id=_user)
 OR EXISTS(SELECT 1 FROM public.conversations WHERE buyer_id=_user OR seller_id=_user)
 OR EXISTS(SELECT 1 FROM public.mobile_dealer_conversations WHERE buyer_id=_user OR seller_id=_user)
 OR EXISTS(SELECT 1 FROM public.conversation_reports WHERE reporter_id=_user OR assigned_to=_user OR resolved_by=_user);
$$;

CREATE FUNCTION public.account_deletion_conversation_scope(_id uuid,_user uuid,_lease uuid,_phase text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$ BEGIN
 PERFORM public.account_deletion_private_scope(_id,_user,_lease,_phase);
 LOCK TABLE public.conversations,public.conversation_messages,public.conversation_participants,public.conversation_reports,public.mobile_dealer_conversations,public.account_deletion_conversation_catalog_refs IN ROW EXCLUSIVE MODE;
 IF NOT public.account_deletion_conversation_barrier_current() THEN RAISE EXCEPTION 'Conversation erasure requires schema review'; END IF;
 IF _phase='records' THEN
  PERFORM 1 FROM auth.users WHERE id=_user FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conversation identity is unavailable'; END IF;
 END IF;
END $$;

CREATE FUNCTION public.purge_account_deletion_conversations(_id uuid,_user uuid,_lease uuid,_limit integer DEFAULT 100) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
DECLARE changed integer:=0; related integer; row public.conversations; selected text; ids uuid[]; category text;
 previous_context text:=coalesce(current_setting('bluebird.conversation_cleanup',true),'');
BEGIN
 IF _limit IS NULL OR _limit NOT BETWEEN 3 AND 100 THEN RAISE EXCEPTION 'Conversation erasure unavailable'; END IF;
 PERFORM public.account_deletion_conversation_scope(_id,_user,_lease,'records');
 IF EXISTS(SELECT 1 FROM public.conversation_reports r WHERE r.reporter_id=_user OR r.assigned_to=_user OR r.resolved_by=_user OR EXISTS(SELECT 1 FROM public.conversations c WHERE c.id=r.conversation_id AND (c.buyer_id=_user OR c.seller_id=_user)))
 THEN RAISE EXCEPTION 'Conversation retention requires explicit handling'; END IF;
 IF EXISTS(SELECT 1 FROM public.mobile_dealer_conversations d JOIN public.conversations c ON c.id=d.conversation_id WHERE (c.buyer_id=_user OR c.seller_id=_user OR d.buyer_id=_user OR d.seller_id=_user) AND (d.buyer_id IS DISTINCT FROM c.buyer_id OR d.seller_id IS DISTINCT FROM c.seller_id OR (c.dealer_id IS NOT NULL AND d.dealer_id IS DISTINCT FROM c.dealer_id) OR (c.dealer_id IS NULL AND (c.listing_id IS NOT NULL OR c.dealer_inventory_record_id IS NOT NULL))))
 THEN RAISE EXCEPTION 'Conversation ownership requires review'; END IF;
 IF EXISTS(SELECT 1 FROM public.conversation_messages m WHERE m.sender_id=_user AND m.attachment_path IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM public.account_deletion_media_observations o JOIN public.account_deletion_inventory_runs r ON r.job_id=o.job_id
  WHERE o.job_id=_id AND o.source='conversation_messages' AND o.record_key=m.id::text AND o.last_generation=r.generation AND o.snapshot->'reference'=public.account_deletion_media_reference('conversation-attachments',m.attachment_path)))
 THEN RAISE EXCEPTION 'Conversation media inventory is incomplete'; END IF;
 PERFORM set_config('bluebird.conversation_cleanup',jsonb_build_object('id',_id,'user',_user,'lease',_lease)::text,true);
 SELECT array_agg(id) INTO ids FROM(SELECT id FROM public.conversation_messages WHERE sender_id=_user ORDER BY id LIMIT _limit FOR UPDATE) targets;
 IF ids IS NOT NULL THEN
  PERFORM 1 FROM public.conversations WHERE id IN(SELECT conversation_id FROM public.conversation_messages WHERE id=ANY(ids)) ORDER BY id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.conversation_reports WHERE conversation_id IN(SELECT conversation_id FROM public.conversation_messages WHERE id=ANY(ids))) THEN RAISE EXCEPTION 'Conversation retention requires explicit handling'; END IF;
  DELETE FROM public.conversation_messages WHERE id=ANY(ids) AND sender_id=_user;
  GET DIAGNOSTICS changed=ROW_COUNT; selected:='messages';
 ELSE
  WITH targets AS MATERIALIZED(SELECT conversation_id,user_id FROM public.conversation_participants WHERE user_id=_user ORDER BY conversation_id LIMIT _limit FOR UPDATE)
  DELETE FROM public.conversation_participants p USING targets t WHERE p.conversation_id=t.conversation_id AND p.user_id=t.user_id;
  GET DIAGNOSTICS changed=ROW_COUNT; IF changed>0 THEN selected:='participants'; END IF;
 END IF;
 IF changed=0 THEN
  FOR row IN SELECT * FROM public.conversations WHERE buyer_id=_user OR seller_id=_user ORDER BY id LIMIT (_limit/3) FOR UPDATE LOOP
   IF EXISTS(SELECT 1 FROM public.conversation_reports WHERE conversation_id=row.id) THEN RAISE EXCEPTION 'Conversation retention requires explicit handling'; END IF;
   IF (row.buyer_id=_user AND row.seller_id IS NOT NULL) OR (row.seller_id=_user AND row.buyer_id IS NOT NULL) THEN
    -- Same v1 text exclusions as mobileListingAllowed, with ASCII word
    -- boundaries. Never turn a misplaced prohibited listing into app history.
    SELECT c.slug INTO category FROM public.asks a JOIN public.products p ON p.id=a.product_id JOIN public.categories c ON c.id=p.category_id
    WHERE a.id=row.listing_id AND c.slug<>'firearms' AND NOT a.is_demo AND NOT p.is_demo
    AND (coalesce(p.name,'')||' '||coalesce(p.description,'')) !~* '(^|[^A-Za-z0-9_])(firearms?|ammunition|ammo|rifles?|pistols?|revolvers?|shotguns?|glock|ar[ -]?15|ak[ -]?47|bump[ -]?stocks?|automatic[ -]?conversion|explosives?|silencers?)([^A-Za-z0-9_]|$)';
    IF category IS NOT NULL THEN
     INSERT INTO public.account_deletion_conversation_catalog_refs(conversation_id,category_slug) VALUES(row.id,category) ON CONFLICT(conversation_id) DO NOTHING;
     GET DIAGNOSTICS related=ROW_COUNT; changed:=changed+related;
    END IF;
    UPDATE public.conversations SET buyer_id=CASE WHEN buyer_id=_user THEN NULL ELSE buyer_id END,seller_id=CASE WHEN seller_id=_user THEN NULL ELSE seller_id END,dealer_context_title=CASE WHEN seller_id=_user THEN NULL ELSE dealer_context_title END,closed_at=coalesce(closed_at,now()) WHERE id=row.id;
    GET DIAGNOSTICS related=ROW_COUNT; changed:=changed+related;
    UPDATE public.mobile_dealer_conversations SET buyer_id=CASE WHEN buyer_id=_user THEN NULL ELSE buyer_id END,seller_id=CASE WHEN seller_id=_user THEN NULL ELSE seller_id END WHERE conversation_id=row.id;
    GET DIAGNOSTICS related=ROW_COUNT; changed:=changed+related;
   ELSE
    IF EXISTS(SELECT 1 FROM public.conversation_messages WHERE conversation_id=row.id) OR EXISTS(SELECT 1 FROM public.conversation_participants WHERE conversation_id=row.id)
    THEN RAISE EXCEPTION 'Conversation ownership requires review'; END IF;
    DELETE FROM public.mobile_dealer_conversations WHERE conversation_id=row.id;
    GET DIAGNOSTICS related=ROW_COUNT; changed:=changed+related;
    DELETE FROM public.account_deletion_conversation_catalog_refs WHERE conversation_id=row.id;
    GET DIAGNOSTICS related=ROW_COUNT; changed:=changed+related;
    DELETE FROM public.conversations WHERE id=row.id;
    GET DIAGNOSTICS related=ROW_COUNT; changed:=changed+related;
   END IF;
  END LOOP;
  IF changed>0 THEN selected:='conversations'; END IF;
 END IF;
 PERFORM set_config('bluebird.conversation_cleanup',previous_context,true);
 IF NOT public.account_deletion_conversation_barrier_current() OR NOT public.account_deletion_lease_current(_id,_user,_lease,'records') OR public.account_access_coverage() IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
 THEN RAISE EXCEPTION 'Conversation erasure unavailable'; END IF;
 IF changed=0 AND public.account_deletion_conversation_remaining(_user) THEN RAISE EXCEPTION 'Conversation retention requires explicit handling'; END IF;
 RETURN jsonb_build_object('source',selected,'changed',changed,'pass_done',NOT public.account_deletion_conversation_remaining(_user));
EXCEPTION WHEN OTHERS THEN PERFORM set_config('bluebird.conversation_cleanup',previous_context,true); RAISE;
END $$;

CREATE FUNCTION public.verify_account_deletion_conversations(_id uuid,_user uuid,_lease uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$ BEGIN
 PERFORM public.account_deletion_conversation_scope(_id,_user,_lease,'verification');
 RETURN NOT public.account_deletion_conversation_remaining(_user) AND public.account_deletion_lease_current(_id,_user,_lease,'verification');
END $$;
CREATE FUNCTION public.mobile_retired_conversation_contexts(_actor uuid,_ids uuid[])
RETURNS TABLE(conversation_id uuid,category_slug text,catalog_version integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT c.id,r.category_slug,r.catalog_version FROM public.account_deletion_conversation_catalog_refs r JOIN public.conversations c ON c.id=r.conversation_id
 WHERE coalesce(cardinality(_ids),0) BETWEEN 1 AND 100 AND c.id=ANY(_ids) AND _actor IN(c.buyer_id,c.seller_id)
 AND c.closed_at IS NOT NULL AND (c.buyer_id IS NULL OR c.seller_id IS NULL)
 AND EXISTS(SELECT 1 FROM auth.users WHERE id=_actor AND deleted_at IS NULL)
 AND NOT EXISTS(SELECT 1 FROM public.mobile_account_deletions WHERE user_id=_actor);
$$;
CREATE FUNCTION public.guard_account_deletion_conversation_completion() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF NEW.status='completed' AND OLD.user_id IS NOT NULL AND (NOT public.account_deletion_conversation_barrier_current() OR public.account_deletion_conversation_remaining(OLD.user_id)) THEN RAISE EXCEPTION 'Account conversations remain'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_account_deletion_conversation_completion AFTER UPDATE OF status,user_id ON public.account_deletion_jobs FOR EACH ROW EXECUTE FUNCTION public.guard_account_deletion_conversation_completion();

CREATE FUNCTION public.account_deletion_conversation_functions() RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_object_agg(p.oid::regprocedure::text,md5(pg_get_functiondef(p.oid))) FROM pg_proc p WHERE p.oid IN(
 'public.account_deletion_conversation_context(uuid)'::regprocedure,'public.guard_account_deletion_conversation_writer()'::regprocedure,
 'public.account_deletion_conversation_claim(uuid,uuid,uuid)'::regprocedure,'public.account_deletion_managed_message_context(uuid,uuid,uuid)'::regprocedure,
 'public.account_deletion_conversation_catalog()'::regprocedure,'public.account_deletion_conversation_remaining(uuid)'::regprocedure,
 'public.account_deletion_conversation_scope(uuid,uuid,uuid,text)'::regprocedure,'public.purge_account_deletion_conversations(uuid,uuid,uuid,integer)'::regprocedure,
 'public.verify_account_deletion_conversations(uuid,uuid,uuid)'::regprocedure,'public.guard_account_deletion_conversation_completion()'::regprocedure,
 'public.mobile_retired_conversation_contexts(uuid,uuid[])'::regprocedure,
 'public.account_deletion_conversation_functions()'::regprocedure,to_regprocedure('public.account_deletion_conversation_barrier_current()'));
$$;
CREATE FUNCTION public.account_deletion_conversation_barrier_current() RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.account_deletion_conversation_contract WHERE id AND catalog=public.account_deletion_conversation_catalog() AND functions=public.account_deletion_conversation_functions());
$$;
UPDATE public.account_deletion_private_contract SET hooks=public.account_deletion_private_hooks() WHERE id;
INSERT INTO public.account_deletion_conversation_contract SELECT true,public.account_deletion_conversation_catalog(),public.account_deletion_conversation_functions();
REVOKE ALL ON FUNCTION public.account_deletion_conversation_context(uuid),public.account_deletion_conversation_claim(uuid,uuid,uuid),public.account_deletion_managed_message_context(uuid,uuid,uuid),public.guard_account_deletion_conversation_writer(),public.account_deletion_conversation_catalog(),public.account_deletion_conversation_remaining(uuid),public.account_deletion_conversation_scope(uuid,uuid,uuid,text),public.purge_account_deletion_conversations(uuid,uuid,uuid,integer),public.verify_account_deletion_conversations(uuid,uuid,uuid),public.guard_account_deletion_conversation_completion(),public.account_deletion_conversation_functions(),public.account_deletion_conversation_barrier_current(),public.mobile_retired_conversation_contexts(uuid,uuid[]) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.purge_account_deletion_conversations(uuid,uuid,uuid,integer),public.verify_account_deletion_conversations(uuid,uuid,uuid),public.mobile_retired_conversation_contexts(uuid,uuid[]) TO service_role;
SELECT public.protect_account_access_boundaries();
DO $$ BEGIN
 IF NOT public.account_deletion_conversation_barrier_current() OR NOT public.account_deletion_private_barrier_current() OR NOT public.account_deletion_profile_barrier_current()
 THEN RAISE EXCEPTION 'Conversation erasure boundaries require review'; END IF;
END $$;
COMMIT;
