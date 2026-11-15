-- Source-only bounded account/consent cleanup. No worker activation or Auth erasure.
BEGIN;
SET LOCAL search_path='';
SET LOCAL TimeZone='UTC';
SET LOCAL lock_timeout='5s';
DO $$ DECLARE expected_columns jsonb:=$columns${"mobile_ad_consents":{"user_id":["uuid",true,null,""],"advertising":["boolean",true,"false",""],"att":["text",true,"'not_determined'::text",""],"platform":["text",true,null,""],"policy_version":["text",true,"'2026-11-12'::text",""],"updated_at":["timestamp with time zone",true,"now()",""]},"shopping_accounts":{"user_id":["uuid",true,null,""],"terms_version":["text",false,null,""],"terms_accepted_at":["timestamp with time zone",false,null,""],"shopping_alerts":["boolean",false,null,""],"suppressed_at":["timestamp with time zone",false,null,""],"alerts_version":["text",false,null,""],"alerts_updated_at":["timestamp with time zone",false,null,""],"unsubscribe_token":["uuid",true,"gen_random_uuid()",""],"history_after":["timestamp with time zone",true,"'1970-01-01 00:00:00+00'::timestamp with time zone",""],"updated_at":["timestamp with time zone",true,"now()",""],"delivery_blocked":["boolean",true,"false",""],"mobile_terms_version":["text",false,null,""],"mobile_terms_accepted_at":["timestamp with time zone",false,null,""],"mobile_shopping_alerts":["boolean",true,"false",""],"mobile_alerts_updated_at":["timestamp with time zone",false,null,""]},"shopping_consents":{"id":["uuid",true,"gen_random_uuid()",""],"user_id":["uuid",false,null,""],"subject":["text",true,null,""],"purpose":["text",true,null,""],"allowed":["boolean",true,null,""],"version":["text",true,null,""],"recorded_at":["timestamp with time zone",true,"now()",""],"source":["text",true,"'web'::text",""]}}$columns$::jsonb;
 expected_constraints jsonb:=$constraints${"mobile_ad_consents.mobile_ad_consents_att_check":"CHECK (att = ANY (ARRAY['authorized'::text, 'denied'::text, 'restricted'::text, 'not_determined'::text, 'not_applicable'::text]))","mobile_ad_consents.mobile_ad_consents_pkey":"PRIMARY KEY (user_id, platform)","mobile_ad_consents.mobile_ad_consents_platform_check":"CHECK (platform = ANY (ARRAY['ios'::text, 'android'::text]))","mobile_ad_consents.mobile_ad_consents_user_id_fkey":"FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE","shopping_accounts.shopping_accounts_pkey":"PRIMARY KEY (user_id)","shopping_accounts.shopping_accounts_unsubscribe_token_key":"UNIQUE (unsubscribe_token)","shopping_accounts.shopping_accounts_user_id_fkey":"FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE","shopping_consents.shopping_consents_pkey":"PRIMARY KEY (id)","shopping_consents.shopping_consents_purpose_check":"CHECK (purpose = ANY (ARRAY['terms'::text, 'shopping_alerts'::text, 'personalization'::text, 'advertising'::text]))","shopping_consents.shopping_consents_user_id_fkey":"FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE"}$constraints$::jsonb;
 expected_functions jsonb:=$functions${"register_shopping_signup()":["f21deb6c882a402de53ca30c499b89f7",true,["search_path=public, pg_temp"],"{postgres=X/postgres,service_role=X/postgres}"],"set_shopping_privacy(text,uuid,boolean,boolean,text)":["5ed87a8f8789810b83ce3ca8a46c4c1d",true,["search_path=public, pg_temp"],"{postgres=X/postgres,service_role=X/postgres}"],"set_shopping_account(uuid,boolean,boolean,text)":["450d439ca8ab44790060a9c991c5c274",true,["search_path=public, pg_temp"],"{postgres=X/postgres,service_role=X/postgres}"],"mobile_accept_terms(uuid,text,boolean)":["58a351e2987f6fad9e8bb5b000d84c16",true,["search_path=public, pg_temp"],"{postgres=X/postgres,service_role=X/postgres}"]}$functions$::jsonb;
 expected_policies jsonb:=$policies${"mobile_ad_consents.bluebird_account_session_boundary":["*",false,["authenticated"],"( SELECT account_current_session_active() AS account_current_session_active)","( SELECT account_current_session_active() AS account_current_session_active)"],"shopping_accounts.bluebird_account_session_boundary":["*",false,["authenticated"],"( SELECT account_current_session_active() AS account_current_session_active)","( SELECT account_current_session_active() AS account_current_session_active)"],"shopping_consents.bluebird_account_session_boundary":["*",false,["authenticated"],"( SELECT account_current_session_active() AS account_current_session_active)","( SELECT account_current_session_active() AS account_current_session_active)"]}$policies$::jsonb;
 expected_acls jsonb:=$acls${"mobile_ad_consents":"{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres}","shopping_accounts":"{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres}","shopping_consents":"{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres}"}$acls$::jsonb;
 actual jsonb;target text;sources text[]:=ARRAY['shopping_accounts','shopping_consents','mobile_ad_consents'];
BEGIN
 PERFORM 1 FROM public.account_deletion_controls WHERE id AND NOT worker_enabled FOR SHARE;
 IF NOT FOUND OR NOT public.account_deletion_private_barrier_current()OR NOT public.account_deletion_sourcing_barrier_current()OR NOT public.account_deletion_activity_barrier_current()OR NOT public.account_deletion_shopping_barrier_current()OR NOT public.account_deletion_listing_barrier_current()
 OR public.account_access_coverage()IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
 THEN RAISE EXCEPTION 'Review disabled consent prerequisites';END IF;
 FOREACH target IN ARRAY sources LOOP
  EXECUTE format('LOCK TABLE public.%I IN SHARE ROW EXCLUSIVE MODE',target);
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=format('public.%I',target)::regclass AND relkind='r'AND NOT relispartition AND relrowsecurity)
   OR EXISTS(SELECT 1 FROM pg_inherits WHERE inhparent=format('public.%I',target)::regclass OR inhrelid=format('public.%I',target)::regclass)
   OR EXISTS(SELECT 1 FROM pg_rewrite WHERE ev_class=format('public.%I',target)::regclass)
   OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=format('public.%I',target)::regclass AND NOT tgisinternal)
  THEN RAISE EXCEPTION 'Review consent layout and hooks';END IF;
 END LOOP;
 SELECT jsonb_object_agg(relname,cols)INTO actual FROM(SELECT c.relname,jsonb_object_agg(a.attname,jsonb_build_array(replace(format_type(a.atttypid,a.atttypmod),'public.',''),a.attnotnull,replace(pg_get_expr(d.adbin,d.adrelid),'public.',''),a.attgenerated))cols
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
 WHERE n.nspname='public'AND c.relname=ANY(sources)AND a.attnum>0 AND NOT a.attisdropped GROUP BY c.relname)r;
 IF actual IS DISTINCT FROM expected_columns THEN RAISE EXCEPTION 'Review consent columns';END IF;
 SELECT jsonb_object_agg(replace(conrelid::regclass::text,'public.','')||'.'||conname,replace(pg_get_constraintdef(oid,true),'public.',''))INTO actual FROM pg_constraint WHERE contype<>'n'AND(conrelid IN('public.shopping_accounts'::regclass,'public.shopping_consents'::regclass,'public.mobile_ad_consents'::regclass)OR confrelid IN('public.shopping_accounts'::regclass,'public.shopping_consents'::regclass,'public.mobile_ad_consents'::regclass));
 IF actual IS DISTINCT FROM expected_constraints THEN RAISE EXCEPTION 'Review consent relationships';END IF;

 SELECT jsonb_object_agg(c.relname,c.relacl::text)INTO actual FROM pg_class c WHERE c.oid IN('public.shopping_accounts'::regclass,'public.shopping_consents'::regclass,'public.mobile_ad_consents'::regclass);
 IF actual IS DISTINCT FROM expected_acls THEN RAISE EXCEPTION 'Review consent permissions';END IF;
 SELECT jsonb_object_agg(replace(p.polrelid::regclass::text,'public.','')||'.'||p.polname,jsonb_build_array(p.polcmd,p.polpermissive,
 (SELECT jsonb_agg(CASE WHEN role_oid=0 THEN 'PUBLIC'ELSE pg_get_userbyid(role_oid)END ORDER BY role_oid)FROM unnest(p.polroles)role_oid),replace(pg_get_expr(p.polqual,p.polrelid),'public.',''),replace(pg_get_expr(p.polwithcheck,p.polrelid),'public.','')))INTO actual FROM pg_policy p WHERE p.polrelid IN('public.shopping_accounts'::regclass,'public.shopping_consents'::regclass,'public.mobile_ad_consents'::regclass);
 IF actual IS DISTINCT FROM expected_policies THEN RAISE EXCEPTION 'Review consent policies';END IF;

 SELECT jsonb_object_agg(replace(p.oid::regprocedure::text,'public.',''),jsonb_build_array(md5(p.prosrc),p.prosecdef,p.proconfig,p.proacl::text))INTO actual FROM pg_proc p WHERE p.oid IN('public.register_shopping_signup()'::regprocedure,'public.set_shopping_privacy(text,uuid,boolean,boolean,text)'::regprocedure,'public.set_shopping_account(uuid,boolean,boolean,text)'::regprocedure,'public.mobile_accept_terms(uuid,text,boolean)'::regprocedure);
 IF actual IS DISTINCT FROM expected_functions THEN RAISE EXCEPTION 'Review consent callbacks';END IF;
END $$;



ALTER TABLE public.shopping_accounts DROP CONSTRAINT shopping_accounts_user_id_fkey,
 ADD CONSTRAINT shopping_accounts_user_id_fkey FOREIGN KEY(user_id)REFERENCES auth.users(id)ON DELETE RESTRICT;
ALTER TABLE public.shopping_consents DROP CONSTRAINT shopping_consents_user_id_fkey,
 ADD CONSTRAINT shopping_consents_user_id_fkey FOREIGN KEY(user_id)REFERENCES auth.users(id)ON DELETE RESTRICT;
ALTER TABLE public.mobile_ad_consents DROP CONSTRAINT mobile_ad_consents_user_id_fkey,
 ADD CONSTRAINT mobile_ad_consents_user_id_fkey FOREIGN KEY(user_id)REFERENCES auth.users(id)ON DELETE RESTRICT;
CREATE INDEX account_deletion_consents_owner ON public.shopping_consents(user_id,id);

CREATE FUNCTION public.guard_account_deletion_consent_writer()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''SET lock_timeout='1s'AS $$
DECLARE item jsonb:=to_jsonb(NEW);previous jsonb;member uuid;subject text:=item->>'subject';decline boolean:=false;
BEGIN
 member:=(item->>'user_id')::uuid;
 IF TG_OP='UPDATE'THEN previous:=to_jsonb(OLD);
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN RAISE EXCEPTION 'Consent ownership is immutable';END IF;
 END IF;
 IF TG_TABLE_NAME='shopping_consents'THEN
  IF subject LIKE 'u:%'THEN
   IF substring(subject FROM 3)!~*'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
   THEN RAISE EXCEPTION 'Consent ownership requires review';END IF;
   IF subject<>'u:'||(substring(subject FROM 3)::uuid)::text
    OR(member IS NOT NULL AND subject<>'u:'||member::text)THEN RAISE EXCEPTION 'Consent ownership requires review';END IF;
   member:=substring(subject FROM 3)::uuid;
  ELSIF member IS NOT NULL THEN RAISE EXCEPTION 'Consent ownership requires review';END IF;
  IF TG_OP='UPDATE'AND item IS DISTINCT FROM previous THEN RAISE EXCEPTION 'Consent evidence is append only';END IF;
  decline:=NOT NEW.allowed AND NEW.purpose IN('shopping_alerts','personalization','advertising');
 ELSIF TG_TABLE_NAME='mobile_ad_consents'THEN
  IF TG_OP='UPDATE'AND NEW.platform IS DISTINCT FROM OLD.platform THEN RAISE EXCEPTION 'Consent ownership is immutable';END IF;
  decline:=NOT NEW.advertising;
 ELSE
  IF TG_OP='INSERT'THEN
   decline:=NEW.terms_version IS NULL AND NEW.terms_accepted_at IS NULL AND NEW.mobile_terms_version IS NULL
    AND NEW.mobile_terms_accepted_at IS NULL AND NEW.shopping_alerts IS DISTINCT FROM true AND NOT NEW.mobile_shopping_alerts;
  ELSE
   -- Preserve actual unsubscribe, delivery-block and clear-history callbacks.
   -- None can replace terms evidence, rotate tokens, rewind history, re-enable
   -- an alert or remove an existing suppression while deletion is pending.
   decline:=(item-ARRAY['shopping_alerts','mobile_shopping_alerts','suppressed_at','delivery_blocked','history_after','updated_at','alerts_version','alerts_updated_at','mobile_alerts_updated_at'])
    IS NOT DISTINCT FROM(previous-ARRAY['shopping_alerts','mobile_shopping_alerts','suppressed_at','delivery_blocked','history_after','updated_at','alerts_version','alerts_updated_at','mobile_alerts_updated_at'])
    AND(NEW.shopping_alerts IS DISTINCT FROM true OR OLD.shopping_alerts IS true)
    AND(NOT NEW.mobile_shopping_alerts OR OLD.mobile_shopping_alerts)
    AND(NOT OLD.delivery_blocked OR NEW.delivery_blocked)
    AND(OLD.suppressed_at IS NULL OR NEW.suppressed_at IS NOT NULL)
    AND NEW.history_after>=OLD.history_after;
  END IF;
 END IF;
 IF auth.uid()IS NOT NULL AND auth.uid()IS DISTINCT FROM member THEN RAISE EXCEPTION 'Consent ownership requires review';END IF;
 IF member IS NULL THEN RETURN NEW;END IF;
 IF decline THEN
  -- A late decline holds the real identity until commit. RESTRICT relationships
  -- require another bounded pass if it arrives before identity removal.
  PERFORM 1 FROM auth.users WHERE id=member AND deleted_at IS NULL FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Consent account is unavailable';END IF;
 ELSE PERFORM public.assert_member_private_record_writer(member);END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER account_deletion_consent_writer BEFORE INSERT OR UPDATE ON public.shopping_accounts FOR EACH ROW EXECUTE FUNCTION public.guard_account_deletion_consent_writer();
CREATE TRIGGER account_deletion_consent_writer BEFORE INSERT OR UPDATE ON public.shopping_consents FOR EACH ROW EXECUTE FUNCTION public.guard_account_deletion_consent_writer();
CREATE TRIGGER account_deletion_consent_writer BEFORE INSERT OR UPDATE ON public.mobile_ad_consents FOR EACH ROW EXECUTE FUNCTION public.guard_account_deletion_consent_writer();

CREATE FUNCTION public.account_deletion_consent_retention_catalog()RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=''AS $$
 SELECT jsonb_build_object('columns',(SELECT jsonb_object_agg(relname,cols)FROM(
 SELECT c.relname,jsonb_object_agg(a.attname,jsonb_build_array(replace(format_type(a.atttypid,a.atttypmod),'public.',''),a.attnotnull))cols
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid
 WHERE n.nspname='public'AND a.attnum>0 AND NOT a.attisdropped AND jsonb_exists(coalesce(($owners${"admin_audit_log":["actor_id"],"checkout_shipping_quotes":["buyer_id"],"dealer_audit_events":["actor_user_id"],"editorial_audit_events":["actor_user_id"],"employer_claims":["reviewed_by","user_id"],"import_seller_audit":["actor_id"],"order_events":["actor_id"],"orders":["buyer_id","seller_id"],"seller_claim_tokens":["created_by"],"seller_claim_transfers":["claimant_id"],"service_directory_claims":["reviewed_by","user_id"],"sourcing_assignments":["buyer_id","shopper_id"],"sourcing_balance_checkouts":["buyer_id"],"sourcing_tips":["buyer_id","shopper_id"]}$owners$::jsonb)->c.relname,'[]'),a.attname)GROUP BY c.relname)r),
 'relationships',(SELECT jsonb_object_agg(replace(conrelid::regclass::text,'public.','')||'.'||conname,replace(pg_get_constraintdef(oid,true),'public.',''))FROM pg_constraint
 WHERE conrelid IN('public.admin_audit_log'::regclass,'public.checkout_shipping_quotes'::regclass,'public.dealer_audit_events'::regclass,'public.editorial_audit_events'::regclass,'public.employer_claims'::regclass,'public.import_seller_audit'::regclass,'public.order_events'::regclass,'public.orders'::regclass,'public.seller_claim_tokens'::regclass,'public.seller_claim_transfers'::regclass,'public.service_directory_claims'::regclass,'public.sourcing_assignments'::regclass,'public.sourcing_balance_checkouts'::regclass,'public.sourcing_tips'::regclass)AND confrelid='auth.users'::regclass), 'writer_hooks',(SELECT jsonb_object_agg(tgrelid::regclass::text, jsonb_build_array(pg_get_triggerdef(oid,true),tgenabled,md5(pg_get_functiondef(tgfoid))))FROM pg_trigger WHERE tgname='account_deletion_consent_retention_writer'));
$$;
DO $$BEGIN IF public.account_deletion_consent_retention_catalog()IS DISTINCT FROM $retention${"columns":{"admin_audit_log":{"actor_id":["uuid",false]},"checkout_shipping_quotes":{"buyer_id":["uuid",true]},"dealer_audit_events":{"actor_user_id":["uuid",false]},"editorial_audit_events":{"actor_user_id":["uuid",false]},"employer_claims":{"user_id":["uuid",true],"reviewed_by":["uuid",false]},"import_seller_audit":{"actor_id":["uuid",true]},"order_events":{"actor_id":["uuid",false]},"orders":{"buyer_id":["uuid",true],"seller_id":["uuid",false]},"seller_claim_tokens":{"created_by":["uuid",true]},"seller_claim_transfers":{"claimant_id":["uuid",true]},"service_directory_claims":{"user_id":["uuid",true],"reviewed_by":["uuid",false]},"sourcing_assignments":{"buyer_id":["uuid",true],"shopper_id":["uuid",true]},"sourcing_balance_checkouts":{"buyer_id":["uuid",true]},"sourcing_tips":{"buyer_id":["uuid",true],"shopper_id":["uuid",true]}},"writer_hooks":null,"relationships":{"admin_audit_log.admin_audit_log_actor_id_fkey":"FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL","checkout_shipping_quotes.checkout_shipping_quotes_buyer_id_fkey":"FOREIGN KEY (buyer_id) REFERENCES auth.users(id) ON DELETE RESTRICT","dealer_audit_events.dealer_audit_events_actor_user_id_fkey":"FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL","employer_claims.employer_claims_reviewed_by_fkey":"FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL","employer_claims.employer_claims_user_id_fkey":"FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE","import_seller_audit.import_seller_audit_actor_id_fkey":"FOREIGN KEY (actor_id) REFERENCES auth.users(id)","order_events.order_events_actor_id_fkey":"FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL","orders.orders_buyer_id_fkey":"FOREIGN KEY (buyer_id) REFERENCES auth.users(id) ON DELETE CASCADE","orders.orders_seller_id_fkey":"FOREIGN KEY (seller_id) REFERENCES auth.users(id) ON DELETE SET NULL","seller_claim_tokens.seller_claim_tokens_created_by_fkey":"FOREIGN KEY (created_by) REFERENCES auth.users(id)","seller_claim_transfers.seller_claim_transfers_claimant_id_fkey":"FOREIGN KEY (claimant_id) REFERENCES auth.users(id)","service_directory_claims.service_directory_claims_reviewed_by_fkey":"FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL","service_directory_claims.service_directory_claims_user_id_fkey":"FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE","sourcing_assignments.sourcing_assignments_buyer_id_fkey":"FOREIGN KEY (buyer_id) REFERENCES auth.users(id)","sourcing_assignments.sourcing_assignments_shopper_id_fkey":"FOREIGN KEY (shopper_id) REFERENCES auth.users(id)","sourcing_balance_checkouts.sourcing_balance_checkouts_buyer_id_fkey":"FOREIGN KEY (buyer_id) REFERENCES auth.users(id)","sourcing_tips.sourcing_tips_buyer_id_fkey":"FOREIGN KEY (buyer_id) REFERENCES auth.users(id)","sourcing_tips.sourcing_tips_shopper_id_fkey":"FOREIGN KEY (shopper_id) REFERENCES auth.users(id)"}}$retention$::jsonb
 THEN RAISE EXCEPTION 'Review consent retention dependencies';END IF;END $$;
CREATE FUNCTION public.account_deletion_consent_retention(_user uuid)RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=''AS $$
 SELECT EXISTS(SELECT 1 FROM public.admin_audit_log WHERE actor_id=_user)
 OR EXISTS(SELECT 1 FROM public.checkout_shipping_quotes WHERE buyer_id=_user)
 OR EXISTS(SELECT 1 FROM public.dealer_audit_events WHERE actor_user_id=_user)
 OR EXISTS(SELECT 1 FROM public.editorial_audit_events WHERE actor_user_id=_user)
 OR EXISTS(SELECT 1 FROM public.employer_claims WHERE reviewed_by=_user OR user_id=_user)
 OR EXISTS(SELECT 1 FROM public.import_seller_audit WHERE actor_id=_user)
 OR EXISTS(SELECT 1 FROM public.order_events WHERE actor_id=_user)
 OR EXISTS(SELECT 1 FROM public.orders WHERE buyer_id=_user OR seller_id=_user)
 OR EXISTS(SELECT 1 FROM public.seller_claim_tokens WHERE created_by=_user)
 OR EXISTS(SELECT 1 FROM public.seller_claim_transfers WHERE claimant_id=_user)
 OR EXISTS(SELECT 1 FROM public.service_directory_claims WHERE reviewed_by=_user OR user_id=_user)
 OR EXISTS(SELECT 1 FROM public.sourcing_assignments WHERE buyer_id=_user OR shopper_id=_user)
 OR EXISTS(SELECT 1 FROM public.sourcing_balance_checkouts WHERE buyer_id=_user)
 OR EXISTS(SELECT 1 FROM public.sourcing_tips WHERE buyer_id=_user OR shopper_id=_user);
$$;
-- Only genuine guest records use the existing anonymous 90-day expiry. A
-- historical account-subject row with a null FK must not lose its terms proof
-- through that maintenance path while its explicit erasure is still pending.
DO $$DECLARE definition text;BEGIN
 SELECT pg_get_functiondef('public.retain_shopping_data()'::regprocedure)INTO definition;
 IF strpos(definition,'delete from shopping_consents where user_id is null and recorded_at')=0 THEN RAISE EXCEPTION 'Review consent maintenance predicate';END IF;
 definition:=replace(definition,'delete from shopping_consents where user_id is null and recorded_at','delete from shopping_consents where user_id is null and subject like ''g:%'' and recorded_at');
 EXECUTE definition;
END $$;


CREATE FUNCTION public.guard_account_deletion_consent_retention_writer()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''SET lock_timeout='1s'AS $$
DECLARE column_name text;member uuid;subjects uuid[]:=ARRAY[]::uuid[];BEGIN
 IF current_setting('transaction_isolation')<>'read committed'THEN RAISE EXCEPTION 'Consent retention writer unavailable';END IF;
 FOREACH column_name IN ARRAY TG_ARGV LOOP
  IF TG_OP='INSERT'OR(to_jsonb(NEW)->column_name)IS DISTINCT FROM(to_jsonb(OLD)->column_name)THEN
   member:=(to_jsonb(NEW)->>column_name)::uuid;
   IF member IS NOT NULL THEN subjects:=array_append(subjects,member);END IF;
  END IF;
 END LOOP;
 FOR member IN SELECT DISTINCT m FROM unnest(subjects)m ORDER BY m LOOP
  PERFORM pg_advisory_xact_lock_shared(hashtextextended('bluebird-account-photo:'||member::text,0));
  PERFORM 1 FROM auth.users WHERE id=member AND deleted_at IS NULL FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Consent retention writer unavailable';END IF;
  IF(EXISTS(SELECT 1 FROM public.mobile_account_deletions WHERE user_id=member)
   OR EXISTS(SELECT 1 FROM public.account_deletion_jobs WHERE user_id=member AND status<>'completed'))
   AND NOT(EXISTS(SELECT 1 FROM public.shopping_accounts WHERE user_id=member AND(terms_version IS NOT NULL OR mobile_terms_version IS NOT NULL))
    OR EXISTS(SELECT 1 FROM public.shopping_consents WHERE(user_id=member OR subject='u:'||member::text)AND purpose='terms'))
   AND NOT public.account_deletion_consent_retention(member)
  THEN RAISE EXCEPTION 'Consent evidence has retired';END IF;
 END LOOP;
 -- Existing reservations can settle and ordinary fields can change without
 -- reassigning a member. A new retained reference can precede terms retirement,
 -- causing cleanup to hold. Once proof and reviewed retained references are
 -- gone, a late writer cannot restart that retired source graph.
 RETURN NEW;
END $$;
CREATE TRIGGER account_deletion_consent_retention_writer BEFORE INSERT OR UPDATE ON public.admin_audit_log FOR EACH ROW EXECUTE FUNCTION public.guard_account_deletion_consent_retention_writer('actor_id');
CREATE TRIGGER account_deletion_consent_retention_writer BEFORE INSERT OR UPDATE ON public.checkout_shipping_quotes FOR EACH ROW EXECUTE FUNCTION public.guard_account_deletion_consent_retention_writer('buyer_id');
CREATE TRIGGER account_deletion_consent_retention_writer BEFORE INSERT OR UPDATE ON public.dealer_audit_events FOR EACH ROW EXECUTE FUNCTION public.guard_account_deletion_consent_retention_writer('actor_user_id');
CREATE TRIGGER account_deletion_consent_retention_writer BEFORE INSERT OR UPDATE ON public.editorial_audit_events FOR EACH ROW EXECUTE FUNCTION public.guard_account_deletion_consent_retention_writer('actor_user_id');
CREATE TRIGGER account_deletion_consent_retention_writer BEFORE INSERT OR UPDATE ON public.employer_claims FOR EACH ROW EXECUTE FUNCTION public.guard_account_deletion_consent_retention_writer('reviewed_by','user_id');
CREATE TRIGGER account_deletion_consent_retention_writer BEFORE INSERT OR UPDATE ON public.import_seller_audit FOR EACH ROW EXECUTE FUNCTION public.guard_account_deletion_consent_retention_writer('actor_id');
CREATE TRIGGER account_deletion_consent_retention_writer BEFORE INSERT OR UPDATE ON public.order_events FOR EACH ROW EXECUTE FUNCTION public.guard_account_deletion_consent_retention_writer('actor_id');
CREATE TRIGGER account_deletion_consent_retention_writer BEFORE INSERT OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.guard_account_deletion_consent_retention_writer('buyer_id','seller_id');
CREATE TRIGGER account_deletion_consent_retention_writer BEFORE INSERT OR UPDATE ON public.seller_claim_tokens FOR EACH ROW EXECUTE FUNCTION public.guard_account_deletion_consent_retention_writer('created_by');
CREATE TRIGGER account_deletion_consent_retention_writer BEFORE INSERT OR UPDATE ON public.seller_claim_transfers FOR EACH ROW EXECUTE FUNCTION public.guard_account_deletion_consent_retention_writer('claimant_id');
CREATE TRIGGER account_deletion_consent_retention_writer BEFORE INSERT OR UPDATE ON public.service_directory_claims FOR EACH ROW EXECUTE FUNCTION public.guard_account_deletion_consent_retention_writer('reviewed_by','user_id');
CREATE TRIGGER account_deletion_consent_retention_writer BEFORE INSERT OR UPDATE ON public.sourcing_assignments FOR EACH ROW EXECUTE FUNCTION public.guard_account_deletion_consent_retention_writer('buyer_id','shopper_id');
CREATE TRIGGER account_deletion_consent_retention_writer BEFORE INSERT OR UPDATE ON public.sourcing_balance_checkouts FOR EACH ROW EXECUTE FUNCTION public.guard_account_deletion_consent_retention_writer('buyer_id');
CREATE TRIGGER account_deletion_consent_retention_writer BEFORE INSERT OR UPDATE ON public.sourcing_tips FOR EACH ROW EXECUTE FUNCTION public.guard_account_deletion_consent_retention_writer('buyer_id','shopper_id');

CREATE FUNCTION public.account_deletion_consent_remaining(_user uuid)RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=''AS $$
 SELECT EXISTS(SELECT 1 FROM public.shopping_accounts WHERE user_id=_user)
 OR EXISTS(SELECT 1 FROM public.shopping_consents WHERE user_id=_user OR subject='u:'||_user::text)
 OR EXISTS(SELECT 1 FROM public.mobile_ad_consents WHERE user_id=_user);
$$;
CREATE FUNCTION public.account_deletion_consent_scope(_id uuid,_user uuid,_lease uuid,_phase text)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=''SET lock_timeout='1s'AS $$BEGIN
 PERFORM public.account_deletion_activity_scope(_id,_user,_lease,_phase);
 LOCK TABLE public.shopping_accounts,public.shopping_consents,public.mobile_ad_consents IN ROW EXCLUSIVE MODE;
 IF NOT public.account_deletion_consent_barrier_current()THEN RAISE EXCEPTION 'Consent erasure requires schema review';END IF;
 IF _phase='records'AND public.account_deletion_activity_remaining(_user)THEN RAISE EXCEPTION 'Complete activity before consents';END IF;
 IF EXISTS(SELECT 1 FROM public.shopping_consents WHERE(user_id=_user OR subject='u:'||_user::text)
  AND(subject IS DISTINCT FROM 'u:'||_user::text OR(user_id IS NOT NULL AND user_id IS DISTINCT FROM _user)))
 THEN RAISE EXCEPTION 'Consent erasure ownership requires review';END IF;
END $$;
CREATE FUNCTION public.purge_account_deletion_consents(_id uuid,_user uuid,_lease uuid,_phase text,_limit integer DEFAULT 100)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''SET lock_timeout='1s'AS $$
DECLARE source text;deleted integer:=0;BEGIN
 IF _limit IS NULL OR _limit NOT BETWEEN 1 AND 100 OR _phase NOT IN('records','identity')THEN RAISE EXCEPTION 'Consent erasure unavailable';END IF;
 PERFORM public.account_deletion_consent_scope(_id,_user,_lease,_phase);
 -- Lock retained-source writers through the decision and physical removal.
 -- This component never changes financial, claim or audit records or assigns
 -- them a guessed retention period. Their explicit handling remains required.
 LOCK TABLE public.admin_audit_log,public.checkout_shipping_quotes,public.dealer_audit_events,public.editorial_audit_events,public.employer_claims,public.import_seller_audit,public.order_events,public.orders,public.seller_claim_tokens,public.seller_claim_transfers,public.service_directory_claims,public.sourcing_assignments,public.sourcing_balance_checkouts,public.sourcing_tips IN SHARE MODE;
 IF public.account_deletion_consent_retention(_user)AND(
  EXISTS(SELECT 1 FROM public.shopping_accounts WHERE user_id=_user AND(terms_version IS NOT NULL OR mobile_terms_version IS NOT NULL))
  OR EXISTS(SELECT 1 FROM public.shopping_consents WHERE(user_id=_user OR subject='u:'||_user::text)AND purpose='terms'))
 THEN RAISE EXCEPTION 'Consent evidence retention requires explicit handling';END IF;
 WITH targets AS(SELECT id FROM public.shopping_consents WHERE user_id=_user OR subject='u:'||_user::text ORDER BY id LIMIT _limit FOR UPDATE),
 erased AS(DELETE FROM public.shopping_consents c USING targets t WHERE c.id=t.id RETURNING 1)SELECT count(*)::integer INTO deleted FROM erased;
 IF deleted>0 THEN source:='shopping_consents';ELSE
  WITH targets AS(SELECT user_id,platform FROM public.mobile_ad_consents WHERE user_id=_user ORDER BY platform LIMIT _limit FOR UPDATE),
  erased AS(DELETE FROM public.mobile_ad_consents c USING targets t WHERE c.user_id=t.user_id AND c.platform=t.platform RETURNING 1)SELECT count(*)::integer INTO deleted FROM erased;
  IF deleted>0 THEN source:='mobile_ad_consents';ELSE
   DELETE FROM public.shopping_accounts WHERE user_id=_user;GET DIAGNOSTICS deleted=ROW_COUNT;
   IF deleted>0 THEN source:='shopping_accounts';END IF;
  END IF;
 END IF;
 IF NOT public.account_deletion_lease_current(_id,_user,_lease,_phase)OR NOT public.account_deletion_consent_barrier_current()
 OR public.account_access_coverage()IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
 THEN RAISE EXCEPTION 'Consent erasure unavailable';END IF;
 RETURN jsonb_build_object('source',source,'deleted',deleted,'pass_done',NOT public.account_deletion_consent_remaining(_user));
END $$;
CREATE FUNCTION public.verify_account_deletion_consents(_id uuid,_user uuid,_lease uuid)RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=''AS $$BEGIN
 PERFORM public.account_deletion_consent_scope(_id,_user,_lease,'verification');
 RETURN NOT public.account_deletion_consent_remaining(_user)AND public.account_deletion_lease_current(_id,_user,_lease,'verification');
END $$;
CREATE FUNCTION public.guard_account_deletion_consent_completion()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''AS $$BEGIN
 IF NEW.status='completed'AND(NOT public.account_deletion_consent_barrier_current()OR public.account_deletion_consent_remaining(OLD.user_id))
 THEN RAISE EXCEPTION 'Consent erasure verification required';END IF;RETURN NEW;
END $$;
CREATE TRIGGER guard_account_deletion_consent_completion AFTER UPDATE OF status,user_id ON public.account_deletion_jobs FOR EACH ROW EXECUTE FUNCTION public.guard_account_deletion_consent_completion();

CREATE FUNCTION public.account_deletion_consent_catalog()RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=''SET TimeZone='UTC'AS $$
 WITH sources AS(SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'AND c.relname=ANY(ARRAY['shopping_accounts','shopping_consents','mobile_ad_consents']))
 SELECT jsonb_build_object(
 'relations',(SELECT jsonb_agg(jsonb_build_array(oid::regclass::text,relkind,relispartition,relrowsecurity,relforcerowsecurity,relacl::text)ORDER BY oid)FROM pg_class WHERE oid IN(SELECT oid FROM sources)),
 'columns',(SELECT jsonb_agg(jsonb_build_array(a.attrelid::regclass::text,a.attname,a.atttypid::regtype::text,a.atttypmod,a.attnotnull,a.attgenerated,pg_get_expr(d.adbin,d.adrelid))ORDER BY a.attrelid,a.attnum)FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid IN(SELECT oid FROM sources)AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(conrelid::regclass::text,conname,pg_get_constraintdef(oid,true),convalidated,condeferrable,condeferred)ORDER BY conrelid,conname)FROM pg_constraint WHERE conrelid IN(SELECT oid FROM sources)OR confrelid IN(SELECT oid FROM sources)),
 'hooks',(SELECT jsonb_object_agg(tgrelid::regclass::text||'.'||tgname,jsonb_build_array(pg_get_triggerdef(oid,true),md5(pg_get_functiondef(tgfoid)),tgenabled))FROM pg_trigger WHERE tgrelid IN(SELECT oid FROM sources)AND NOT tgisinternal),
 'indexes',(SELECT jsonb_agg(pg_get_indexdef(indexrelid)ORDER BY indexrelid)FROM pg_index WHERE indrelid IN(SELECT oid FROM sources)),
 'policies',(SELECT jsonb_agg(jsonb_build_array(polrelid::regclass::text,polname,polcmd,polpermissive,polroles::text,pg_get_expr(polqual,polrelid),pg_get_expr(polwithcheck,polrelid))ORDER BY polrelid,polname)FROM pg_policy WHERE polrelid IN(SELECT oid FROM sources)),
 'rules',(SELECT coalesce(jsonb_agg(pg_get_ruledef(oid,true)ORDER BY oid),'[]')FROM pg_rewrite WHERE ev_class IN(SELECT oid FROM sources)),
 'inheritance',(SELECT count(*)FROM pg_inherits WHERE inhparent IN(SELECT oid FROM sources)OR inhrelid IN(SELECT oid FROM sources)));
$$;

CREATE TABLE public.account_deletion_consent_contract(id boolean PRIMARY KEY DEFAULT true CHECK(id),catalog jsonb NOT NULL,functions jsonb NOT NULL,retention jsonb NOT NULL);
ALTER TABLE public.account_deletion_consent_contract ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_deletion_consent_contract FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.account_deletion_consent_contract TO service_role;
CREATE FUNCTION public.account_deletion_consent_functions()RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=''AS $$
 SELECT jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_array(md5(pg_get_functiondef(p.oid)),p.prosecdef,p.proconfig,p.proacl::text))FROM pg_proc p WHERE p.oid IN('public.guard_account_deletion_consent_retention_writer()'::regprocedure,'public.guard_account_deletion_consent_writer()'::regprocedure,'public.account_deletion_consent_catalog()'::regprocedure,'public.account_deletion_consent_retention_catalog()'::regprocedure,'public.account_deletion_consent_retention(uuid)'::regprocedure,'public.account_deletion_consent_remaining(uuid)'::regprocedure,'public.account_deletion_consent_scope(uuid,uuid,uuid,text)'::regprocedure,'public.purge_account_deletion_consents(uuid,uuid,uuid,text,integer)'::regprocedure,'public.verify_account_deletion_consents(uuid,uuid,uuid)'::regprocedure,'public.guard_account_deletion_consent_completion()'::regprocedure,'public.account_deletion_consent_functions()'::regprocedure,to_regprocedure('public.account_deletion_consent_barrier_current()'),'public.assert_member_private_record_writer(uuid)'::regprocedure,'public.retain_shopping_data()'::regprocedure,'public.register_shopping_signup()'::regprocedure,'public.set_shopping_privacy(text,uuid,boolean,boolean,text)'::regprocedure,'public.set_shopping_account(uuid,boolean,boolean,text)'::regprocedure,'public.mobile_accept_terms(uuid,text,boolean)'::regprocedure);
$$;
CREATE FUNCTION public.account_deletion_consent_barrier_current()RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=''AS $$
 SELECT EXISTS(SELECT 1 FROM public.account_deletion_consent_contract WHERE id AND catalog=public.account_deletion_consent_catalog()
 AND functions=public.account_deletion_consent_functions()AND retention=public.account_deletion_consent_retention_catalog());
$$;
REVOKE ALL ON FUNCTION public.guard_account_deletion_consent_retention_writer(),public.guard_account_deletion_consent_writer(),public.account_deletion_consent_catalog(),public.account_deletion_consent_retention_catalog(),public.account_deletion_consent_retention(uuid),public.account_deletion_consent_remaining(uuid),public.account_deletion_consent_scope(uuid,uuid,uuid,text),public.purge_account_deletion_consents(uuid,uuid,uuid,text,integer),public.verify_account_deletion_consents(uuid,uuid,uuid),public.guard_account_deletion_consent_completion(),public.account_deletion_consent_functions(),public.account_deletion_consent_barrier_current()FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.purge_account_deletion_consents(uuid,uuid,uuid,text,integer),public.verify_account_deletion_consents(uuid,uuid,uuid)TO service_role;
SELECT public.protect_account_access_boundaries();
UPDATE public.account_deletion_private_contract SET hooks=public.account_deletion_private_hooks()WHERE id;
-- The preflight verified the old activity contract before the single reviewed
-- maintenance-predicate change. Refresh only that explicit function projection.
-- The new checkout-reference guard is the only reviewed listing-catalog change.
UPDATE public.account_deletion_listing_contract SET catalog=public.account_deletion_listing_catalog()WHERE id;
UPDATE public.account_deletion_activity_contract SET functions=public.account_deletion_activity_functions()WHERE id;
INSERT INTO public.account_deletion_consent_contract SELECT true,public.account_deletion_consent_catalog(),public.account_deletion_consent_functions(),public.account_deletion_consent_retention_catalog();
DO $$BEGIN IF NOT public.account_deletion_consent_barrier_current()OR NOT public.account_deletion_activity_barrier_current()OR NOT public.account_deletion_private_barrier_current()OR NOT public.account_deletion_shopping_barrier_current()
 OR public.account_access_coverage()IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)THEN RAISE EXCEPTION 'Consent boundaries require review';END IF;END $$;

COMMIT;
