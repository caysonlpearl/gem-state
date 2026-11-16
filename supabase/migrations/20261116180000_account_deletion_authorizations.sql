-- Source only. Does not enable Apple, schedule a worker or erase a member.
BEGIN;
SET LOCAL search_path='';
SET LOCAL lock_timeout='5s';
DO $$ BEGIN
 PERFORM 1 FROM public.account_deletion_controls WHERE id AND NOT worker_enabled FOR SHARE;
 IF NOT FOUND OR NOT public.apple_authorization_vault_current() OR NOT public.account_deletion_private_barrier_current()
 OR public.account_access_coverage() IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
 THEN RAISE EXCEPTION 'Review disabled authorization prerequisites';END IF;
END $$;

CREATE TABLE public.account_deletion_authorization_state(
 job_id uuid PRIMARY KEY REFERENCES public.account_deletion_jobs(id) ON DELETE RESTRICT,
 ready boolean NOT NULL DEFAULT false,
 manual_apple_revocation boolean NOT NULL DEFAULT false,
 prepared_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 finalized_at timestamptz,
 CHECK(finalized_at IS NULL OR ready)
);
CREATE TABLE public.account_deletion_apple_receipts(
 job_id uuid NOT NULL REFERENCES public.account_deletion_jobs(id) ON DELETE RESTRICT,
 credential_id uuid NOT NULL,
 -- Temporary coverage evidence, removed after Auth deletion and before verification.
 identity_id uuid,
 revoked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(job_id,credential_id)
);
CREATE INDEX account_deletion_apple_receipt_identity ON public.account_deletion_apple_receipts(job_id,identity_id);
ALTER TABLE public.account_deletion_authorization_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_deletion_apple_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_deletion_authorization_state,public.account_deletion_apple_receipts FROM PUBLIC,anon,authenticated,service_role;

-- Auth-managed linking/metadata updates must not repopulate a withdrawing account.
-- No JWT/session is required for an active provider signup; Auth inserts its user first.
CREATE FUNCTION public.guard_account_deletion_auth_identity_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
BEGIN
 IF TG_OP='UPDATE' AND OLD.user_id IS DISTINCT FROM NEW.user_id THEN
  -- Use deterministic ordering for the two account locks in an explicit transfer.
  PERFORM public.assert_member_private_record_writer(least(OLD.user_id,NEW.user_id));
  PERFORM public.assert_member_private_record_writer(greatest(OLD.user_id,NEW.user_id));
 ELSE PERFORM public.assert_member_private_record_writer(NEW.user_id);END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_account_deletion_auth_identity_write BEFORE INSERT OR UPDATE ON auth.identities
FOR EACH ROW EXECUTE FUNCTION public.guard_account_deletion_auth_identity_write();

CREATE FUNCTION public.account_deletion_apple_envelope(_credential uuid)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('userId',v.user_id,'identityId',v.identity_id,'clientId',v.client_id,
  'subjectFingerprint',v.subject_fingerprint,'tokenFingerprint',v.token_fingerprint,'storeFingerprint',v.store_fingerprint,
  'keyVersion',v.key_version,'nonceHex',encode(v.nonce,'hex'),'ciphertextHex',encode(v.ciphertext,'hex'))
 FROM public.apple_authorization_vault v WHERE v.id=_credential;
$$;

CREATE FUNCTION public.account_deletion_authorization_scope(_id uuid,_user uuid,_lease uuid,_phase text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
DECLARE job public.account_deletion_jobs;
BEGIN
 IF _id IS NULL OR _user IS NULL OR _lease IS NULL OR _phase IS NULL OR _phase NOT IN('authorization','identity','verification')
 OR current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'Account authorization cleanup unavailable';END IF;
 PERFORM 1 FROM public.account_deletion_controls WHERE id AND worker_enabled FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Account authorization cleanup unavailable';END IF;
 SELECT * INTO job FROM public.account_deletion_jobs WHERE id=_id FOR UPDATE;
 IF NOT FOUND OR job.user_id IS DISTINCT FROM _user OR job.lease_token IS DISTINCT FROM _lease OR job.phase IS DISTINCT FROM _phase
 OR job.status<>'processing' OR job.lease_until<=clock_timestamp() THEN RAISE EXCEPTION 'Account authorization cleanup unavailable';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('bluebird-account-photo:'||_user::text,0));
 IF NOT public.account_deletion_authorization_current() OR NOT public.apple_authorization_vault_current()
 OR NOT public.account_deletion_private_barrier_current()
 OR NOT public.account_deletion_lease_current(_id,_user,_lease,_phase)
 OR public.account_access_coverage() IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
 OR (_phase IN('identity','verification')AND EXISTS(SELECT 1 FROM auth.users WHERE id=_user))
 THEN RAISE EXCEPTION 'Account authorization cleanup unavailable';END IF;
END $$;

CREATE FUNCTION public.prepare_account_deletion_authorization(_id uuid,_user uuid,_lease uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
DECLARE credential uuid;manual boolean;
BEGIN
 PERFORM public.account_deletion_authorization_scope(_id,_user,_lease,'authorization');
 INSERT INTO public.account_deletion_authorization_state(job_id)VALUES(_id)ON CONFLICT DO NOTHING;
 SELECT id INTO credential FROM public.apple_authorization_vault WHERE user_id=_user ORDER BY id LIMIT 1;
 IF credential IS NOT NULL THEN
  PERFORM public.account_deletion_authorization_scope(_id,_user,_lease,'authorization');
  IF EXISTS(SELECT 1 FROM public.account_deletion_authorization_state WHERE job_id=_id AND ready)
  THEN RAISE EXCEPTION 'Account authorizations changed after preparation';END IF;
  RETURN jsonb_build_object('done',false,'credential',jsonb_build_object('id',credential,'envelope',public.account_deletion_apple_envelope(credential)));
 END IF;
 SELECT EXISTS(SELECT 1 FROM auth.identities i WHERE i.user_id=_user AND i.provider='apple'
  AND NOT EXISTS(SELECT 1 FROM public.account_deletion_apple_receipts r WHERE r.job_id=_id AND r.identity_id=i.id))INTO manual;
 -- Missing historical credentials are a distinct manual-instructions case,
 -- never a claim of automatic revocation and never an indefinite erasure hold.
 UPDATE public.account_deletion_authorization_state SET ready=true,manual_apple_revocation=manual_apple_revocation OR manual WHERE job_id=_id;
 PERFORM public.account_deletion_authorization_scope(_id,_user,_lease,'authorization');
 RETURN jsonb_build_object('done',true,'credential',null);
END $$;

CREATE FUNCTION public.check_account_deletion_apple_authorization(_id uuid,_user uuid,_lease uuid,_credential uuid,_envelope jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
BEGIN
 PERFORM public.account_deletion_authorization_scope(_id,_user,_lease,'authorization');
 RETURN EXISTS(SELECT 1 FROM public.apple_authorization_vault v WHERE v.id=_credential AND v.user_id=_user
  AND public.account_deletion_apple_envelope(v.id)=_envelope)
 AND EXISTS(SELECT 1 FROM public.account_deletion_authorization_state WHERE job_id=_id AND NOT ready);
END $$;

CREATE FUNCTION public.acknowledge_account_deletion_apple_authorization(_id uuid,_user uuid,_lease uuid,_credential uuid,_envelope jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
DECLARE target public.apple_authorization_vault;
BEGIN
 PERFORM public.account_deletion_authorization_scope(_id,_user,_lease,'authorization');
 SELECT * INTO target FROM public.apple_authorization_vault WHERE id=_credential AND user_id=_user FOR UPDATE;
 IF NOT FOUND THEN
  RETURN EXISTS(SELECT 1 FROM public.account_deletion_apple_receipts WHERE job_id=_id AND credential_id=_credential);
 END IF;
 IF public.account_deletion_apple_envelope(target.id)IS DISTINCT FROM _envelope
 OR NOT EXISTS(SELECT 1 FROM public.account_deletion_authorization_state WHERE job_id=_id AND NOT ready)
 THEN RAISE EXCEPTION 'Account authorization acknowledgement unavailable';END IF;
 INSERT INTO public.account_deletion_apple_receipts(job_id,credential_id,identity_id)VALUES(_id,target.id,target.identity_id);
 DELETE FROM public.apple_authorization_vault WHERE id=target.id AND user_id=_user;
 PERFORM public.account_deletion_authorization_scope(_id,_user,_lease,'authorization');
 RETURN true;
END $$;

CREATE FUNCTION public.finalize_account_deletion_authorizations(_id uuid,_user uuid,_lease uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
DECLARE changed integer;
BEGIN
 PERFORM public.account_deletion_authorization_scope(_id,_user,_lease,'identity');
 IF EXISTS(SELECT 1 FROM public.apple_authorization_vault WHERE user_id=_user)
 OR NOT EXISTS(SELECT 1 FROM public.account_deletion_authorization_state WHERE job_id=_id AND ready)
 THEN RAISE EXCEPTION 'Account authorization cleanup incomplete';END IF;
 WITH targets AS(SELECT credential_id FROM public.account_deletion_apple_receipts WHERE job_id=_id AND identity_id IS NOT NULL ORDER BY credential_id LIMIT 100 FOR UPDATE),
 retired AS(UPDATE public.account_deletion_apple_receipts r SET identity_id=NULL FROM targets t WHERE r.job_id=_id AND r.credential_id=t.credential_id RETURNING 1)
 SELECT count(*)::integer INTO changed FROM retired;
 PERFORM public.account_deletion_authorization_scope(_id,_user,_lease,'identity');
 IF changed>0 THEN RETURN jsonb_build_object('done',false,'changed',changed);END IF;
 UPDATE public.account_deletion_authorization_state SET finalized_at=clock_timestamp()WHERE job_id=_id AND finalized_at IS NULL;
 GET DIAGNOSTICS changed=ROW_COUNT;
 PERFORM public.account_deletion_authorization_scope(_id,_user,_lease,'identity');
 RETURN jsonb_build_object('done',true,'changed',changed);
END $$;

CREATE FUNCTION public.verify_account_deletion_authorizations(_id uuid,_user uuid,_lease uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM public.account_deletion_authorization_scope(_id,_user,_lease,'verification');
 RETURN NOT EXISTS(SELECT 1 FROM public.apple_authorization_vault WHERE user_id=_user)
 AND EXISTS(SELECT 1 FROM public.account_deletion_authorization_state WHERE job_id=_id AND ready AND finalized_at IS NOT NULL)
 AND NOT EXISTS(SELECT 1 FROM public.account_deletion_apple_receipts WHERE job_id=_id AND identity_id IS NOT NULL)
 AND public.account_deletion_lease_current(_id,_user,_lease,'verification');
END $$;
CREATE FUNCTION public.guard_account_deletion_authorization_completion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.status='completed'AND(NOT public.account_deletion_authorization_current()OR NOT public.apple_authorization_vault_current()
 OR EXISTS(SELECT 1 FROM public.apple_authorization_vault WHERE user_id=OLD.user_id)
 OR NOT EXISTS(SELECT 1 FROM public.account_deletion_authorization_state WHERE job_id=OLD.id AND ready AND finalized_at IS NOT NULL)
 OR EXISTS(SELECT 1 FROM public.account_deletion_apple_receipts WHERE job_id=OLD.id AND identity_id IS NOT NULL))
 THEN RAISE EXCEPTION 'Account authorization cleanup incomplete';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_account_deletion_authorization_completion AFTER UPDATE OF status,user_id ON public.account_deletion_jobs
FOR EACH ROW EXECUTE FUNCTION public.guard_account_deletion_authorization_completion();

CREATE TABLE public.account_deletion_authorization_contract(id boolean PRIMARY KEY DEFAULT true CHECK(id),catalog jsonb NOT NULL,functions jsonb NOT NULL);
ALTER TABLE public.account_deletion_authorization_contract ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_deletion_authorization_contract FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.account_deletion_authorization_catalog()
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 WITH sources AS(SELECT unnest(ARRAY['public.account_deletion_authorization_state'::regclass,'public.account_deletion_apple_receipts'::regclass])oid)
 SELECT jsonb_build_object(
 'relations',(SELECT jsonb_agg(jsonb_build_array(oid::regclass::text,relkind,relispartition,relrowsecurity,relforcerowsecurity,relacl::text,relowner::regrole::text)ORDER BY oid)FROM pg_class WHERE oid IN(SELECT oid FROM sources)),
 'columns',(SELECT jsonb_agg(jsonb_build_array(a.attrelid::regclass::text,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attgenerated,a.attidentity,a.attacl::text,pg_get_expr(d.adbin,d.adrelid))ORDER BY a.attrelid,a.attnum)FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid IN(SELECT oid FROM sources)AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(conrelid::regclass::text,conname,pg_get_constraintdef(oid,true),convalidated,condeferrable,condeferred)ORDER BY conrelid,conname)FROM pg_constraint WHERE conrelid IN(SELECT oid FROM sources)OR confrelid IN(SELECT oid FROM sources)),
 'hooks',(SELECT jsonb_object_agg(tgrelid::regclass::text||'.'||tgname,jsonb_build_array(pg_get_triggerdef(oid,true),md5(pg_get_functiondef(tgfoid)),tgenabled))FROM pg_trigger WHERE NOT tgisinternal AND(tgrelid IN(SELECT oid FROM sources)OR(tgrelid='auth.identities'::regclass AND tgname='guard_account_deletion_auth_identity_write')OR(tgrelid='public.account_deletion_jobs'::regclass AND tgname='guard_account_deletion_authorization_completion'))),
 'indexes',(SELECT jsonb_agg(pg_get_indexdef(indexrelid)ORDER BY indexrelid)FROM pg_index WHERE indrelid IN(SELECT oid FROM sources)),
 'policies',(SELECT coalesce(jsonb_agg(jsonb_build_array(polrelid::regclass::text,polname,polcmd,polpermissive,polroles::text,pg_get_expr(polqual,polrelid),pg_get_expr(polwithcheck,polrelid))ORDER BY polrelid,polname),'[]')FROM pg_policy WHERE polrelid IN(SELECT oid FROM sources)),
 'rules',(SELECT count(*)FROM pg_rewrite WHERE ev_class IN(SELECT oid FROM sources)),
 'inheritance',(SELECT count(*)FROM pg_inherits WHERE inhparent IN(SELECT oid FROM sources)OR inhrelid IN(SELECT oid FROM sources)));
$$;
CREATE FUNCTION public.account_deletion_authorization_functions()
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_array(md5(pg_get_functiondef(p.oid)),p.prosecdef,p.proconfig,p.proacl::text,p.proowner::regrole::text))FROM pg_proc p
 WHERE p.oid IN(to_regprocedure('public.guard_account_deletion_auth_identity_write()'),to_regprocedure('public.account_deletion_apple_envelope(uuid)'),
 to_regprocedure('public.account_deletion_authorization_scope(uuid,uuid,uuid,text)'),to_regprocedure('public.prepare_account_deletion_authorization(uuid,uuid,uuid)'),
 to_regprocedure('public.check_account_deletion_apple_authorization(uuid,uuid,uuid,uuid,jsonb)'),to_regprocedure('public.acknowledge_account_deletion_apple_authorization(uuid,uuid,uuid,uuid,jsonb)'),
 to_regprocedure('public.finalize_account_deletion_authorizations(uuid,uuid,uuid)'),to_regprocedure('public.verify_account_deletion_authorizations(uuid,uuid,uuid)'),
 to_regprocedure('public.guard_account_deletion_authorization_completion()'),to_regprocedure('public.account_deletion_authorization_catalog()'),
 to_regprocedure('public.account_deletion_authorization_functions()'),to_regprocedure('public.account_deletion_authorization_current()'),
 to_regprocedure('public.account_deletion_lease_current(uuid,uuid,uuid,text)'));
$$;
CREATE FUNCTION public.account_deletion_authorization_current()
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.account_deletion_authorization_contract WHERE id AND catalog=public.account_deletion_authorization_catalog()AND functions=public.account_deletion_authorization_functions());
$$;
REVOKE ALL ON FUNCTION public.guard_account_deletion_auth_identity_write(),public.account_deletion_apple_envelope(uuid),public.account_deletion_authorization_scope(uuid,uuid,uuid,text),
 public.prepare_account_deletion_authorization(uuid,uuid,uuid),public.check_account_deletion_apple_authorization(uuid,uuid,uuid,uuid,jsonb),
 public.acknowledge_account_deletion_apple_authorization(uuid,uuid,uuid,uuid,jsonb),public.finalize_account_deletion_authorizations(uuid,uuid,uuid),
 public.verify_account_deletion_authorizations(uuid,uuid,uuid),public.guard_account_deletion_authorization_completion(),
 public.account_deletion_authorization_catalog(),public.account_deletion_authorization_functions(),public.account_deletion_authorization_current()
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.prepare_account_deletion_authorization(uuid,uuid,uuid),public.check_account_deletion_apple_authorization(uuid,uuid,uuid,uuid,jsonb),
 public.acknowledge_account_deletion_apple_authorization(uuid,uuid,uuid,uuid,jsonb),public.finalize_account_deletion_authorizations(uuid,uuid,uuid),public.verify_account_deletion_authorizations(uuid,uuid,uuid)TO service_role;
SELECT public.protect_account_access_boundaries();
DO $$ DECLARE old_catalog jsonb;new_catalog jsonb;expected jsonb;BEGIN
 SELECT catalog INTO old_catalog FROM public.apple_authorization_vault_contract WHERE id;
 new_catalog:=public.apple_authorization_vault_catalog();
 expected:=jsonb_set(old_catalog,'{auth_hooks}',coalesce(nullif(old_catalog->'auth_hooks','null'::jsonb),'{}'::jsonb)
  ||jsonb_build_object('guard_account_deletion_auth_identity_write',new_catalog->'auth_hooks'->'guard_account_deletion_auth_identity_write'));
 IF new_catalog IS DISTINCT FROM expected OR(public.account_deletion_private_hooks()-'public.account_deletion_jobs.guard_account_deletion_authorization_completion')IS DISTINCT FROM(SELECT hooks FROM public.account_deletion_private_contract WHERE id)
 THEN RAISE EXCEPTION 'Unreviewed authorization hook change';END IF;
END $$;
UPDATE public.apple_authorization_vault_contract SET catalog=public.apple_authorization_vault_catalog()WHERE id;
UPDATE public.account_deletion_private_contract SET hooks=public.account_deletion_private_hooks()WHERE id;
INSERT INTO public.account_deletion_authorization_contract SELECT true,public.account_deletion_authorization_catalog(),public.account_deletion_authorization_functions();
DO $$ BEGIN
 IF NOT public.account_deletion_authorization_current()OR NOT public.apple_authorization_vault_current()OR NOT public.account_deletion_private_barrier_current()
 OR NOT public.account_deletion_ledger_actor_barrier_current()
 OR public.account_access_coverage()IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
 THEN RAISE EXCEPTION 'Account authorization boundaries require review';END IF;
END $$;
COMMIT;
