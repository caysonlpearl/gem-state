-- Explicit native acceptance/alert state; existing website acceptance is not an
-- app opt-in. No historical account is enrolled and no delivery is activated.
BEGIN;
SET LOCAL search_path='';
SET LOCAL lock_timeout='5s';
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT * FROM (VALUES
  ('public.mobile_accept_terms(uuid,text,boolean)','b4a4e653eb83829b58f58890fcf42f68','58a351e2987f6fad9e8bb5b000d84c16'),
  ('public.register_shopping_signup()','01a056a233f5c4d9b383a94b0e43eecd','f21deb6c882a402de53ca30c499b89f7')
 ) expected(signature,old_hash,new_hash)
 LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure(f.signature) AND p.prosecdef
   AND md5(p.prosrc) IN(f.old_hash,f.new_hash) AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
   AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE') AND has_function_privilege('service_role',p.oid,'EXECUTE'))
  THEN RAISE EXCEPTION 'Review mobile consent function: %',f.signature; END IF;
 END LOOP;
 IF public.account_access_coverage() IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
 THEN RAISE EXCEPTION 'Review mobile consent access boundaries'; END IF;
END $$;
ALTER TABLE public.shopping_accounts
 ADD COLUMN IF NOT EXISTS mobile_terms_version text,
 ADD COLUMN IF NOT EXISTS mobile_terms_accepted_at timestamptz,
 ADD COLUMN IF NOT EXISTS mobile_shopping_alerts boolean NOT NULL DEFAULT false,
 ADD COLUMN IF NOT EXISTS mobile_alerts_updated_at timestamptz;
DO $$ BEGIN
 IF (SELECT count(*) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.shopping_accounts'::regclass
 AND NOT a.attisdropped AND ((a.attname='mobile_terms_version' AND a.atttypid='text'::regtype AND NOT a.attnotnull)
 OR(a.attname IN('mobile_terms_accepted_at','mobile_alerts_updated_at') AND a.atttypid='timestamptz'::regtype AND NOT a.attnotnull)
 OR(a.attname='mobile_shopping_alerts' AND a.atttypid='boolean'::regtype AND a.attnotnull AND pg_get_expr(d.adbin,d.adrelid)='false')))<>4
 THEN RAISE EXCEPTION 'Review mobile consent columns'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.register_shopping_signup() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $signup$
DECLARE channel text:=CASE WHEN new.raw_user_meta_data->>'shopping_signup_source'='mobile' THEN 'mobile' ELSE 'web' END;
 opted boolean:=coalesce(new.raw_user_meta_data->>'shopping_alerts'='true',false);
BEGIN
 IF new.raw_user_meta_data->>'shopping_terms_version'='2026-11-12' THEN
  INSERT INTO public.shopping_accounts(user_id,terms_version,terms_accepted_at,shopping_alerts,alerts_version,alerts_updated_at,
   mobile_terms_version,mobile_terms_accepted_at,mobile_shopping_alerts,mobile_alerts_updated_at)
  VALUES(new.id,'2026-11-12',now(),opted,'2026-11-12',now(),
   CASE WHEN channel='mobile' THEN '2026-11-12' END,CASE WHEN channel='mobile' THEN now() END,
   channel='mobile' AND opted,CASE WHEN channel='mobile' THEN now() END);
  INSERT INTO public.shopping_consents(user_id,subject,purpose,allowed,version,source) VALUES
   (new.id,'u:'||new.id::text,'terms',true,'2026-11-12',channel),
   (new.id,'u:'||new.id::text,'shopping_alerts',opted,'2026-11-12',channel);
 END IF;
 RETURN new;
END $signup$;

CREATE OR REPLACE FUNCTION public.mobile_accept_terms(_user uuid,_version text,_shopping_alerts boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $consent$
DECLARE onboarding boolean;
BEGIN
 IF _version IS DISTINCT FROM '2026-11-12' OR _shopping_alerts IS NULL THEN RAISE EXCEPTION 'Current terms and an explicit alert choice are required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('bluebird:mobile-consent:'||_user::text,0));
 SELECT NOT EXISTS(SELECT 1 FROM public.shopping_accounts WHERE user_id=_user AND mobile_terms_version=_version AND mobile_terms_accepted_at IS NOT NULL) INTO onboarding;
 INSERT INTO public.shopping_accounts(user_id,terms_version,terms_accepted_at,shopping_alerts,alerts_version,alerts_updated_at,
  mobile_terms_version,mobile_terms_accepted_at,mobile_shopping_alerts,mobile_alerts_updated_at)
 VALUES(_user,_version,now(),_shopping_alerts,_version,now(),_version,now(),_shopping_alerts,now())
 ON CONFLICT(user_id) DO UPDATE SET
  terms_version=excluded.terms_version,
  terms_accepted_at=CASE WHEN shopping_accounts.terms_version IS DISTINCT FROM excluded.terms_version THEN now() ELSE coalesce(shopping_accounts.terms_accepted_at,now()) END,
  shopping_alerts=excluded.shopping_alerts,alerts_version=excluded.alerts_version,alerts_updated_at=now(),updated_at=now(),
  mobile_terms_version=excluded.mobile_terms_version,
  mobile_terms_accepted_at=CASE WHEN shopping_accounts.mobile_terms_version IS DISTINCT FROM excluded.mobile_terms_version THEN now() ELSE coalesce(shopping_accounts.mobile_terms_accepted_at,now()) END,
  mobile_shopping_alerts=excluded.mobile_shopping_alerts,mobile_alerts_updated_at=now();
 IF _shopping_alerts THEN UPDATE public.shopping_accounts SET suppressed_at=NULL WHERE user_id=_user;
 ELSIF NOT onboarding THEN UPDATE public.shopping_accounts SET suppressed_at=now() WHERE user_id=_user; END IF;
 INSERT INTO public.shopping_consents(user_id,subject,purpose,allowed,version,source) VALUES
  (_user,'u:'||_user::text,'terms',true,_version,'mobile'),(_user,'u:'||_user::text,'shopping_alerts',_shopping_alerts,_version,'mobile');
 IF NOT _shopping_alerts THEN
  UPDATE public.shopping_queue SET status='suppressed',lease_until=NULL WHERE user_id=_user AND status IN('pending','processing') AND (NOT onboarding OR NOT requested);
  UPDATE public.mobile_push_outbox p SET status='suppressed',lease_until=NULL FROM public.notifications n
   WHERE p.notification_id=n.id AND p.user_id=_user AND n.kind<>'message' AND p.status IN('pending','processing');
 END IF;
END $consent$;

-- CREATE OR REPLACE retains owner and ACLs; these remain service-only.
SELECT public.protect_account_access_boundaries();
DO $$ BEGIN
 IF public.account_access_coverage() IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
 THEN RAISE EXCEPTION 'Mobile consent access boundaries require review'; END IF;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
