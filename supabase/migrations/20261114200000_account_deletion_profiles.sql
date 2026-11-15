-- Owned personal profiles only. Financial references/assignments require their
-- own reviewed handling before these parents can be removed. No activation.
BEGIN;
SET LOCAL search_path='';
SET LOCAL lock_timeout='5s';
DO $$ DECLARE relation text; BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.account_deletion_controls WHERE id AND NOT worker_enabled)
 OR NOT public.account_deletion_private_barrier_current()
 OR to_regclass('public.account_deletion_media_observations') IS NULL
 OR public.account_access_coverage() IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
 THEN RAISE EXCEPTION 'Review disabled profile-erasure prerequisites'; END IF;
 FOREACH relation IN ARRAY ARRAY['profiles','seller_profiles','shopper_service_profiles','shopper_coverage','listing_upgrade_purchases'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=format('public.%I',relation)::regclass AND relkind='r' AND NOT relispartition)
  OR EXISTS(SELECT 1 FROM pg_inherits WHERE inhparent=format('public.%I',relation)::regclass OR inhrelid=format('public.%I',relation)::regclass)
  OR EXISTS(SELECT 1 FROM pg_rewrite WHERE ev_class=format('public.%I',relation)::regclass)
  THEN RAISE EXCEPTION 'Review profile table layout'; END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.listing_upgrade_purchases'::regclass AND attname='user_id' AND atttypid='uuid'::regtype AND attnotnull AND NOT attisdropped)
 OR NOT EXISTS(SELECT 1 FROM pg_constraint c WHERE c.conrelid='public.listing_upgrade_purchases'::regclass AND c.confrelid='auth.users'::regclass AND c.contype='f' AND c.convalidated AND NOT c.condeferrable AND c.confdeltype='c'
  AND c.conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=c.conrelid AND attname='user_id')]::smallint[]
  AND c.confkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=c.confrelid AND attname='id')]::smallint[])
 OR NOT EXISTS(SELECT 1 FROM pg_index i WHERE i.indrelid='public.listing_upgrade_purchases'::regclass AND i.indisvalid AND i.indisready AND i.indpred IS NULL AND i.indexprs IS NULL AND i.indkey[0]=(SELECT attnum FROM pg_attribute WHERE attrelid=i.indrelid AND attname='user_id'))
 OR (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.listing_upgrade_purchases'::regclass AND NOT tgisinternal)<>1
 OR NOT EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid WHERE t.tgrelid='public.listing_upgrade_purchases'::regclass AND t.tgname='listing_upgrade_purchases_touch' AND t.tgtype=19 AND t.tgenabled='O' AND t.tgnargs=0 AND t.tgqual IS NULL AND t.tgattr=''::int2vector AND NOT t.tgdeferrable AND t.tgfoid='public.set_updated_at()'::regprocedure AND NOT p.prosecdef AND md5(p.prosrc)='9b1889f56258bf9d6554213c05019c76')
 THEN RAISE EXCEPTION 'Review listing-upgrade financial prerequisites'; END IF;
 IF (SELECT count(*) FROM pg_trigger t WHERE NOT t.tgisinternal AND t.tgrelid IN('public.profiles'::regclass,'public.seller_profiles'::regclass,'public.shopper_service_profiles'::regclass,'public.shopper_coverage'::regclass))<>5
 OR (SELECT count(*) FROM (VALUES
 ('profiles','profiles_set_updated_at','set_updated_at','9b1889f56258bf9d6554213c05019c76',19),
 ('seller_profiles','seller_profiles_set_updated_at','set_updated_at','9b1889f56258bf9d6554213c05019c76',19),
 ('shopper_service_profiles','shopper_service_profiles_touch','set_updated_at','9b1889f56258bf9d6554213c05019c76',19),
 ('shopper_service_profiles','guard_shopper_service_profiles','guard_shopper_service_writes','a97361af2a46607081d871d9f06c8f22',31),
 ('shopper_coverage','guard_shopper_coverage','guard_shopper_service_writes','a97361af2a46607081d871d9f06c8f22',31)
 ) e(relation,name,fn,body,type) JOIN pg_trigger t ON t.tgrelid=to_regclass('public.'||e.relation) AND t.tgname=e.name
 JOIN pg_proc p ON p.oid=t.tgfoid WHERE p.oid=to_regprocedure('public.'||e.fn||'()') AND md5(p.prosrc)=e.body AND NOT p.prosecdef
 AND t.tgenabled='O' AND t.tgtype=e.type AND t.tgqual IS NULL AND t.tgattr::text='' AND t.tgnargs=0 AND NOT t.tgdeferrable)<>5
 THEN RAISE EXCEPTION 'Review existing profile hooks'; END IF;
 IF EXISTS(SELECT 1 FROM pg_constraint c WHERE c.contype='f' AND c.confrelid IN('public.profiles'::regclass,'public.seller_profiles'::regclass,'public.shopper_service_profiles'::regclass,'public.shopper_coverage'::regclass)
 AND NOT(c.confrelid='public.shopper_service_profiles'::regclass AND c.convalidated AND NOT c.condeferrable
 AND c.confkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=c.confrelid AND attname='id')]::smallint[]
 AND ((c.conrelid='public.shopper_coverage'::regclass AND c.confdeltype='c' AND c.conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=c.conrelid AND attname='profile_id')]::smallint[])
 OR(c.conrelid='public.sourcing_assignments'::regclass AND c.confdeltype='a' AND c.conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=c.conrelid AND attname='shopper_profile_id')]::smallint[]))))
 OR (SELECT count(*) FROM pg_constraint c WHERE c.contype='f' AND c.confrelid='public.shopper_service_profiles'::regclass AND c.conrelid IN('public.shopper_coverage'::regclass,'public.sourcing_assignments'::regclass))<>2
 THEN RAISE EXCEPTION 'Review profile child relationships'; END IF;
END $$;

CREATE FUNCTION public.account_deletion_profile_remaining(_user uuid)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=_user)
 OR EXISTS(SELECT 1 FROM public.seller_profiles WHERE user_id=_user)
 OR EXISTS(SELECT 1 FROM public.shopper_service_profiles WHERE shopper_id=_user)
 OR EXISTS(SELECT 1 FROM public.shopper_coverage c JOIN public.shopper_service_profiles p ON p.id=c.profile_id WHERE p.shopper_id=_user);
$$;
CREATE FUNCTION public.account_deletion_profile_financial_remaining(_user uuid)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.orders WHERE buyer_id=_user OR seller_id=_user)
 OR EXISTS(SELECT 1 FROM public.listing_upgrade_purchases WHERE user_id=_user)
 OR EXISTS(SELECT 1 FROM public.seller_profiles WHERE user_id=_user AND stripe_account_id IS NOT NULL)
 OR EXISTS(SELECT 1 FROM public.shopper_service_profiles WHERE shopper_id=_user AND stripe_account_id IS NOT NULL)
 OR EXISTS(SELECT 1 FROM public.sourcing_assignments a JOIN public.shopper_service_profiles p ON p.id=a.shopper_profile_id WHERE p.shopper_id=_user);
$$;

CREATE FUNCTION public.guard_account_deletion_profile_writer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
DECLARE member uuid; previous uuid;
BEGIN
 IF TG_TABLE_NAME='shopper_coverage' THEN
  IF TG_OP='UPDATE' AND NEW.profile_id IS DISTINCT FROM OLD.profile_id THEN RAISE EXCEPTION 'Profile owner is immutable'; END IF;
  SELECT shopper_id INTO member FROM public.shopper_service_profiles WHERE id=NEW.profile_id FOR KEY SHARE;
 ELSE
  member:=(to_jsonb(NEW)->>CASE TG_TABLE_NAME WHEN 'profiles' THEN 'id' WHEN 'seller_profiles' THEN 'user_id' ELSE 'shopper_id' END)::uuid;
  IF TG_OP='UPDATE' THEN
   previous:=(to_jsonb(OLD)->>CASE TG_TABLE_NAME WHEN 'profiles' THEN 'id' WHEN 'seller_profiles' THEN 'user_id' ELSE 'shopper_id' END)::uuid;
   IF member IS DISTINCT FROM previous THEN RAISE EXCEPTION 'Profile owner is immutable'; END IF;
   -- Existing financial reconciliation may settle flags after a request. It
   -- cannot create/change a payment account or restore any personal field.
   IF TG_TABLE_NAME IN ('seller_profiles','shopper_service_profiles')
    AND to_jsonb(NEW)-ARRAY['stripe_status_checked_at','stripe_details_submitted','stripe_charges_enabled','stripe_payouts_enabled','updated_at']
      =to_jsonb(OLD)-ARRAY['stripe_status_checked_at','stripe_details_submitted','stripe_charges_enabled','stripe_payouts_enabled','updated_at']
   THEN RETURN NEW; END IF;
  END IF;
 END IF;
 PERFORM public.assert_member_private_record_writer(member);
 RETURN NEW;
END $$;

DO $$ DECLARE relation text; BEGIN
 FOREACH relation IN ARRAY ARRAY['profiles','seller_profiles','shopper_service_profiles','shopper_coverage'] LOOP
  EXECUTE format('CREATE TRIGGER guard_account_deletion_profile_writer BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_account_deletion_profile_writer()',relation);
 END LOOP;
END $$;
CREATE INDEX IF NOT EXISTS account_deletion_profile_coverage ON public.shopper_coverage(profile_id);
CREATE INDEX IF NOT EXISTS account_deletion_profile_assignments ON public.sourcing_assignments(shopper_profile_id);

CREATE FUNCTION public.guard_account_deletion_new_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
DECLARE member uuid;
BEGIN
 -- Settling an existing order remains possible. New orders and participant
 -- changes cannot introduce a financial dependency for a pending/removed user.
 IF TG_OP='UPDATE' AND NEW.buyer_id IS NOT DISTINCT FROM OLD.buyer_id AND NEW.seller_id IS NOT DISTINCT FROM OLD.seller_id THEN RETURN NEW; END IF;
 FOR member IN SELECT DISTINCT u FROM unnest(CASE WHEN TG_OP='UPDATE'
  THEN ARRAY[OLD.buyer_id,OLD.seller_id,NEW.buyer_id,NEW.seller_id]
  ELSE ARRAY[NEW.buyer_id,NEW.seller_id] END) u WHERE u IS NOT NULL ORDER BY u LOOP
  PERFORM public.assert_member_private_record_writer(member);
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_account_deletion_new_order AFTER INSERT OR UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.guard_account_deletion_new_order();

CREATE FUNCTION public.guard_account_deletion_new_upgrade()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
DECLARE member uuid;
BEGIN
 -- A provider can settle an existing receipt after a deletion request. New
 -- receipts and owner changes must serialize with that account's request.
 IF TG_OP='UPDATE' AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id THEN RETURN NEW; END IF;
 FOR member IN SELECT DISTINCT u FROM unnest(CASE WHEN TG_OP='UPDATE'
  THEN ARRAY[OLD.user_id,NEW.user_id] ELSE ARRAY[NEW.user_id] END) u WHERE u IS NOT NULL ORDER BY u LOOP
  PERFORM public.assert_member_private_record_writer(member);
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_account_deletion_new_upgrade AFTER INSERT OR UPDATE ON public.listing_upgrade_purchases
FOR EACH ROW EXECUTE FUNCTION public.guard_account_deletion_new_upgrade();

CREATE FUNCTION public.account_deletion_profile_catalog()
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 WITH sources AS (SELECT unnest(ARRAY['public.profiles'::regclass,'public.seller_profiles'::regclass,'public.shopper_service_profiles'::regclass,'public.shopper_coverage'::regclass,'public.listing_upgrade_purchases'::regclass]) oid)
 SELECT jsonb_build_object(
 'relations',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'kind',c.relkind,'partition',c.relispartition) ORDER BY c.relname) FROM pg_class c WHERE c.oid IN(SELECT oid FROM sources)),
 'columns',(SELECT jsonb_agg(jsonb_build_array(a.attrelid::regclass::text,a.attname,a.atttypid::regtype::text,a.atttypmod,a.attnotnull,a.attgenerated) ORDER BY a.attrelid::regclass::text,a.attnum) FROM pg_attribute a WHERE a.attrelid IN(SELECT oid FROM sources) AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT coalesce(jsonb_agg(jsonb_build_array(c.conrelid::regclass::text,c.conname,pg_get_constraintdef(c.oid,true),c.convalidated,c.condeferrable,c.condeferred) ORDER BY c.conrelid::regclass::text,c.conname),'[]') FROM pg_constraint c WHERE c.conrelid IN(SELECT oid FROM sources) OR c.confrelid IN(SELECT oid FROM sources)),
 'indexes',(SELECT coalesce(jsonb_agg(pg_get_indexdef(indexrelid) ORDER BY indexrelid::regclass::text),'[]') FROM pg_index WHERE indrelid='public.listing_upgrade_purchases'::regclass),
 'hooks',(SELECT coalesce(jsonb_object_agg(t.tgrelid::regclass::text||'.'||t.tgname,jsonb_build_array(pg_get_triggerdef(t.oid,true),md5(pg_get_functiondef(t.tgfoid)),t.tgenabled)),'{}') FROM pg_trigger t WHERE NOT t.tgisinternal AND (t.tgrelid IN(SELECT oid FROM sources) OR(t.tgrelid='public.orders'::regclass AND t.tgname='guard_account_deletion_new_order'))),
 'rules',(SELECT coalesce(jsonb_agg(pg_get_ruledef(r.oid,true) ORDER BY r.oid),'[]') FROM pg_rewrite r WHERE r.ev_class IN(SELECT oid FROM sources)),
 'inheritance',(SELECT count(*) FROM pg_inherits WHERE inhparent IN(SELECT oid FROM sources) OR inhrelid IN(SELECT oid FROM sources)));
$$;
CREATE TABLE public.account_deletion_profile_contract(id boolean PRIMARY KEY DEFAULT true CHECK(id),catalog jsonb NOT NULL,functions jsonb NOT NULL);
ALTER TABLE public.account_deletion_profile_contract ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_deletion_profile_contract FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.account_deletion_profile_contract TO service_role;

CREATE FUNCTION public.account_deletion_profile_scope(_id uuid,_user uuid,_lease uuid,_phase text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
BEGIN
 PERFORM public.account_deletion_private_scope(_id,_user,_lease,_phase);
 LOCK TABLE public.orders,public.listing_upgrade_purchases,public.profiles,public.seller_profiles,public.shopper_coverage,public.shopper_service_profiles IN ROW EXCLUSIVE MODE;
 IF NOT public.account_deletion_profile_barrier_current() THEN RAISE EXCEPTION 'Profile erasure requires schema review'; END IF;
 -- Auth/profile FK writers cannot introduce a financial dependency between the
 -- prerequisite read and the bounded deletes. Pending-account guards stop
 -- non-FK profile writers before they can recreate erased rows.
 IF _phase='records' THEN
  PERFORM 1 FROM auth.users WHERE id=_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile identity is unavailable'; END IF;
 END IF;
 PERFORM 1 FROM public.shopper_service_profiles WHERE shopper_id=_user FOR UPDATE;
 -- The inventory ledger outlives profile rows. Never discard the only avatar
 -- reference, even if a privileged caller moved a job forward prematurely.
 IF EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=_user AND p.avatar_url IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM public.account_deletion_media_observations o JOIN public.account_deletion_inventory_runs r ON r.job_id=o.job_id
  WHERE o.job_id=_id AND o.source='profiles' AND o.record_key=p.id::text AND o.last_generation=r.generation
  AND o.snapshot->'reference'=public.account_deletion_media_reference('profile-avatars',p.avatar_url)))
 OR EXISTS(SELECT 1 FROM public.shopper_service_profiles p WHERE p.shopper_id=_user AND p.avatar_url IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM public.account_deletion_media_observations o JOIN public.account_deletion_inventory_runs r ON r.job_id=o.job_id
  WHERE o.job_id=_id AND o.source='shopper_service_profiles' AND o.record_key=p.id::text AND o.last_generation=r.generation
  AND o.snapshot->'reference'=public.account_deletion_media_reference('shopper-avatars',p.avatar_url)))
 THEN RAISE EXCEPTION 'Profile media inventory is incomplete'; END IF;
END $$;

CREATE FUNCTION public.purge_account_deletion_profiles(_id uuid,_user uuid,_lease uuid,_phase text,_limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
DECLARE source text; predicate text; deleted integer:=0; selected text;
 previous_trust text:=coalesce(current_setting('parkvault.trusted_operation',true),'off');
BEGIN
 IF _limit IS NULL OR _limit NOT BETWEEN 1 AND 100 OR _phase NOT IN('records','identity') THEN RAISE EXCEPTION 'Profile erasure unavailable'; END IF;
 PERFORM public.account_deletion_profile_scope(_id,_user,_lease,_phase);
 IF public.account_deletion_profile_financial_remaining(_user)
 THEN RAISE EXCEPTION 'Profile financial records require explicit handling'; END IF;
 PERFORM set_config('parkvault.trusted_operation','on',true);
 FOREACH source IN ARRAY ARRAY['profiles','shopper_coverage','seller_profiles','shopper_service_profiles'] LOOP
  predicate:=CASE source
   WHEN 'profiles' THEN 'r.id=$1'
   WHEN 'shopper_coverage' THEN 'EXISTS(SELECT 1 FROM public.shopper_service_profiles p WHERE p.id=r.profile_id AND p.shopper_id=$1)'
   WHEN 'seller_profiles' THEN 'r.user_id=$1 AND r.stripe_account_id IS NULL'
   ELSE 'r.shopper_id=$1 AND r.stripe_account_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.shopper_coverage c WHERE c.profile_id=r.id) AND NOT EXISTS(SELECT 1 FROM public.sourcing_assignments a WHERE a.shopper_profile_id=r.id)' END;
  EXECUTE format('WITH targets AS MATERIALIZED (SELECT r.tableoid,r.ctid FROM public.%I r WHERE %s ORDER BY r.tableoid,r.ctid LIMIT $2 FOR UPDATE), erased AS (DELETE FROM public.%I r USING targets t WHERE r.tableoid=t.tableoid AND r.ctid=t.ctid RETURNING 1) SELECT count(*)::integer FROM erased',source,predicate,source) INTO deleted USING _user,_limit;
  IF deleted>0 THEN selected:=source; EXIT; END IF;
 END LOOP;
 IF deleted=0 AND public.account_deletion_profile_remaining(_user)
 THEN RAISE EXCEPTION 'Profile financial records require explicit handling'; END IF;
 PERFORM set_config('parkvault.trusted_operation',previous_trust,true);
 IF NOT public.account_deletion_profile_barrier_current() OR NOT public.account_deletion_lease_current(_id,_user,_lease,_phase)
 OR public.account_access_coverage() IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
 THEN RAISE EXCEPTION 'Profile erasure unavailable'; END IF;
 RETURN jsonb_build_object('source',selected,'deleted',deleted,'pass_done',NOT public.account_deletion_profile_remaining(_user));
EXCEPTION WHEN OTHERS THEN
 PERFORM set_config('parkvault.trusted_operation',previous_trust,true);
 RAISE;
END $$;
CREATE FUNCTION public.verify_account_deletion_profiles(_id uuid,_user uuid,_lease uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
BEGIN
 PERFORM public.account_deletion_profile_scope(_id,_user,_lease,'verification');
 RETURN NOT public.account_deletion_profile_remaining(_user) AND public.account_deletion_lease_current(_id,_user,_lease,'verification');
END $$;
CREATE FUNCTION public.guard_account_deletion_profile_completion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.status='completed' AND OLD.user_id IS NOT NULL AND (NOT public.account_deletion_profile_barrier_current() OR public.account_deletion_profile_remaining(OLD.user_id))
 THEN RAISE EXCEPTION 'Account profiles remain'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_account_deletion_profile_completion AFTER UPDATE OF status,user_id ON public.account_deletion_jobs
FOR EACH ROW EXECUTE FUNCTION public.guard_account_deletion_profile_completion();

CREATE FUNCTION public.account_deletion_profile_barrier_current()
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.account_deletion_profile_contract c WHERE c.id
 AND c.catalog=public.account_deletion_profile_catalog()
 AND c.functions=(SELECT jsonb_object_agg(p.oid::regprocedure::text,md5(pg_get_functiondef(p.oid))) FROM pg_proc p WHERE p.oid IN (
 'public.account_deletion_profile_catalog()'::regprocedure,'public.account_deletion_profile_remaining(uuid)'::regprocedure,
 'public.account_deletion_profile_financial_remaining(uuid)'::regprocedure,
 'public.guard_account_deletion_new_order()'::regprocedure,'public.guard_account_deletion_new_upgrade()'::regprocedure,
 'public.guard_account_deletion_profile_writer()'::regprocedure,'public.guard_account_deletion_profile_completion()'::regprocedure,
 'public.account_deletion_profile_scope(uuid,uuid,uuid,text)'::regprocedure,
 'public.purge_account_deletion_profiles(uuid,uuid,uuid,text,integer)'::regprocedure,
 'public.verify_account_deletion_profiles(uuid,uuid,uuid)'::regprocedure)));
$$;

-- Adding the reviewed completion hook extends the existing private-records
-- contract only after its unchanged preflight above has succeeded.
UPDATE public.account_deletion_private_contract SET hooks=public.account_deletion_private_hooks() WHERE id;
INSERT INTO public.account_deletion_profile_contract
SELECT true,public.account_deletion_profile_catalog(),jsonb_object_agg(p.oid::regprocedure::text,md5(pg_get_functiondef(p.oid))) FROM pg_proc p WHERE p.oid IN (
 'public.account_deletion_profile_catalog()'::regprocedure,'public.account_deletion_profile_remaining(uuid)'::regprocedure,
 'public.account_deletion_profile_financial_remaining(uuid)'::regprocedure,
 'public.guard_account_deletion_new_order()'::regprocedure,'public.guard_account_deletion_new_upgrade()'::regprocedure,
 'public.guard_account_deletion_profile_writer()'::regprocedure,'public.guard_account_deletion_profile_completion()'::regprocedure,
 'public.account_deletion_profile_scope(uuid,uuid,uuid,text)'::regprocedure,
 'public.purge_account_deletion_profiles(uuid,uuid,uuid,text,integer)'::regprocedure,
 'public.verify_account_deletion_profiles(uuid,uuid,uuid)'::regprocedure);
REVOKE ALL ON FUNCTION public.account_deletion_profile_catalog(),public.account_deletion_profile_remaining(uuid),
 public.account_deletion_profile_financial_remaining(uuid),
 public.guard_account_deletion_new_order(),public.guard_account_deletion_new_upgrade(),
 public.guard_account_deletion_profile_writer(),public.guard_account_deletion_profile_completion(),public.account_deletion_profile_barrier_current(),
 public.account_deletion_profile_scope(uuid,uuid,uuid,text),public.purge_account_deletion_profiles(uuid,uuid,uuid,text,integer),public.verify_account_deletion_profiles(uuid,uuid,uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.purge_account_deletion_profiles(uuid,uuid,uuid,text,integer),public.verify_account_deletion_profiles(uuid,uuid,uuid) TO service_role;
SELECT public.protect_account_access_boundaries();
DO $$ BEGIN
 IF NOT public.account_deletion_profile_barrier_current() OR NOT public.account_deletion_private_barrier_current()
 OR public.account_access_coverage() IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
 THEN RAISE EXCEPTION 'Profile erasure boundaries require review'; END IF;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
