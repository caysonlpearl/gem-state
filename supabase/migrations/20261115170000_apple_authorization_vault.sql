-- Encrypted, verified provider credentials only. No provider is enabled here.
-- Deliberately no Auth cascade: credentials must survive until revocation,
-- and independent Auth/completion guards refuse to discard them implicitly.
BEGIN;
SET LOCAL search_path='';
SET LOCAL lock_timeout='5s';
DO $$ BEGIN
  PERFORM 1 FROM public.account_deletion_controls WHERE id AND NOT worker_enabled FOR SHARE;
  IF NOT FOUND OR NOT public.account_deletion_ledger_actor_barrier_current()
    OR NOT public.account_deletion_private_barrier_current()
    OR public.account_access_coverage() IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
  THEN RAISE EXCEPTION 'Review disabled Apple vault prerequisites'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='auth.identities'::regclass AND relkind='r' AND NOT relispartition)
    OR EXISTS(SELECT 1 FROM pg_inherits WHERE inhparent='auth.identities'::regclass OR inhrelid='auth.identities'::regclass)
    OR EXISTS(SELECT 1 FROM (VALUES('id','uuid'::regtype),('user_id','uuid'::regtype),('provider','text'::regtype),('provider_id','text'::regtype))v(name,type)
      WHERE NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='auth.identities'::regclass AND attname=v.name AND atttypid=v.type AND NOT attisdropped))
  THEN RAISE EXCEPTION 'Review owning Auth identity metadata'; END IF;
  IF has_table_privilege('anon','auth.identities','INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER')
    OR has_table_privilege('authenticated','auth.identities','INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER')
    OR has_any_column_privilege('anon','auth.identities','INSERT,UPDATE')
    OR has_any_column_privilege('authenticated','auth.identities','INSERT,UPDATE')
  THEN RAISE EXCEPTION 'Auth identities must not be member-writable'; END IF;
END $$;

CREATE TABLE public.apple_authorization_vault (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  identity_id uuid NOT NULL,
  client_id text NOT NULL CHECK(client_id ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$'),
  subject_fingerprint text NOT NULL CHECK(subject_fingerprint ~ '^[a-f0-9]{64}$'),
  token_fingerprint text NOT NULL CHECK(token_fingerprint ~ '^[a-f0-9]{64}$'),
  store_fingerprint text NOT NULL CHECK(store_fingerprint ~ '^[a-f0-9]{64}$'),
  key_version text NOT NULL CHECK(key_version ~ '^[A-Za-z0-9_-]{1,32}$'),
  nonce bytea NOT NULL CHECK(octet_length(nonce)=12),
  ciphertext bytea NOT NULL CHECK(octet_length(ciphertext) BETWEEN 17 AND 65536),
  created_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,client_id,token_fingerprint)
);
CREATE INDEX apple_authorization_vault_owner ON public.apple_authorization_vault(user_id,identity_id);
ALTER TABLE public.apple_authorization_vault ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.apple_authorization_vault FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.guard_apple_authorization_vault_writer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.created_at IS DISTINCT FROM OLD.created_at)
  THEN RAISE EXCEPTION 'Apple credential ownership is immutable'; END IF;
  PERFORM public.assert_member_private_record_writer(NEW.user_id);
  RETURN NEW;
END $$;
CREATE TRIGGER guard_apple_authorization_vault_writer BEFORE INSERT OR UPDATE ON public.apple_authorization_vault
FOR EACH ROW EXECUTE FUNCTION public.guard_apple_authorization_vault_writer();

CREATE FUNCTION public.guard_apple_authorization_identity_removal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.apple_authorization_vault WHERE user_id=OLD.id)
  THEN RAISE EXCEPTION 'Apple authorizations require revocation before identity removal'; END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER guard_apple_authorization_identity_removal BEFORE DELETE ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.guard_apple_authorization_identity_removal();

CREATE FUNCTION public.guard_apple_authorization_completion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.status='completed' AND (NOT public.apple_authorization_vault_current()
    OR EXISTS(SELECT 1 FROM public.apple_authorization_vault WHERE user_id=OLD.user_id))
  THEN RAISE EXCEPTION 'Apple credential cleanup is incomplete'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_apple_authorization_completion AFTER UPDATE OF status,user_id ON public.account_deletion_jobs
FOR EACH ROW EXECUTE FUNCTION public.guard_apple_authorization_completion();

CREATE FUNCTION public.apple_authorization_capture_scope(_user uuid,_session uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
BEGIN
  IF _user IS NULL OR _session IS NULL OR current_setting('transaction_isolation')<>'read committed'
    OR NOT public.apple_authorization_vault_current()
    OR public.account_access_coverage() IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
  THEN RAISE EXCEPTION 'Apple credential storage unavailable'; END IF;
  PERFORM public.assert_member_private_record_writer(_user);
  IF public.account_session_state(_user,_session) IS DISTINCT FROM 'active'
  THEN RAISE EXCEPTION 'Apple credential storage unavailable'; END IF;
END $$;

CREATE FUNCTION public.apple_authorization_capture_cached(_user uuid,_session uuid,_client_id text,_fingerprint text,_key_version text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
DECLARE value jsonb;
BEGIN
  PERFORM public.apple_authorization_capture_scope(_user,_session);
  SELECT jsonb_build_object('userId',v.user_id,'identityId',v.identity_id,'clientId',v.client_id,
    'subjectFingerprint',v.subject_fingerprint,'tokenFingerprint',v.token_fingerprint,'storeFingerprint',v.store_fingerprint,
    'keyVersion',v.key_version,'nonceHex',encode(v.nonce,'hex'),'ciphertextHex',encode(v.ciphertext,'hex')) INTO value
  FROM public.apple_authorization_vault v WHERE v.user_id=_user AND v.client_id=_client_id AND v.token_fingerprint=_fingerprint AND v.key_version=_key_version
    AND v.verified_at>=clock_timestamp()-interval '24 hours' AND v.verified_at<=clock_timestamp()+interval '1 minute'
    AND EXISTS(SELECT 1 FROM auth.identities i WHERE i.id=v.identity_id AND i.user_id=_user AND i.provider='apple'
      AND encode(sha256(convert_to(i.provider_id,'UTF8')),'hex')=v.subject_fingerprint);
  RETURN value;
END $$;

CREATE FUNCTION public.store_verified_apple_authorization(_user uuid,_session uuid,_identity_id uuid,_client_id text,
  _subject_fingerprint text,_fingerprint text,_store_fingerprint text,_key_version text,_nonce_hex text,_ciphertext_hex text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
BEGIN
  IF _identity_id IS NULL OR _client_id IS NULL OR _client_id !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$'
    OR _subject_fingerprint IS NULL OR _subject_fingerprint !~ '^[a-f0-9]{64}$'
    OR _fingerprint IS NULL OR _fingerprint !~ '^[a-f0-9]{64}$'
    OR _store_fingerprint IS NULL OR _store_fingerprint !~ '^[a-f0-9]{64}$'
    OR _key_version IS NULL OR _key_version !~ '^[A-Za-z0-9_-]{1,32}$'
    OR _nonce_hex IS NULL OR _nonce_hex !~ '^[a-f0-9]{24}$'
    OR _ciphertext_hex IS NULL OR length(_ciphertext_hex) NOT BETWEEN 34 AND 131072
    OR length(_ciphertext_hex)%2<>0 OR _ciphertext_hex !~ '^[a-f0-9]+$'
  THEN RAISE EXCEPTION 'Apple credential storage unavailable'; END IF;
  PERFORM public.apple_authorization_capture_scope(_user,_session);
  -- RPC callers are trusted server code following signed-token verification.
  -- Recheck the real provider identity, never user_metadata or an email address.
  PERFORM 1 FROM auth.identities i WHERE i.id=_identity_id AND i.user_id=_user AND i.provider='apple'
    AND encode(sha256(convert_to(i.provider_id,'UTF8')),'hex')=_subject_fingerprint FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Apple identity ownership changed'; END IF;
  INSERT INTO public.apple_authorization_vault(user_id,identity_id,client_id,subject_fingerprint,token_fingerprint,store_fingerprint,key_version,nonce,ciphertext)
  VALUES(_user,_identity_id,_client_id,_subject_fingerprint,_fingerprint,_store_fingerprint,_key_version,decode(_nonce_hex,'hex'),decode(_ciphertext_hex,'hex'))
  ON CONFLICT(user_id,client_id,token_fingerprint) DO UPDATE SET identity_id=excluded.identity_id,
    subject_fingerprint=excluded.subject_fingerprint,store_fingerprint=excluded.store_fingerprint,key_version=excluded.key_version,
    nonce=excluded.nonce,ciphertext=excluded.ciphertext,verified_at=clock_timestamp();
  PERFORM public.apple_authorization_capture_scope(_user,_session);
  RETURN true;
END $$;

CREATE TABLE public.apple_authorization_vault_contract(id boolean PRIMARY KEY DEFAULT true CHECK(id),catalog jsonb NOT NULL,functions jsonb NOT NULL);
ALTER TABLE public.apple_authorization_vault_contract ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.apple_authorization_vault_contract FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.apple_authorization_vault_catalog()
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object(
    'auth_relation',(SELECT jsonb_build_array(relkind,relispartition,relrowsecurity,relforcerowsecurity,relacl::text,relowner::regrole::text)FROM pg_class WHERE oid='auth.identities'::regclass),
    'auth_columns',(SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attacl::text,pg_get_expr(d.adbin,d.adrelid))ORDER BY a.attnum)FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='auth.identities'::regclass AND a.attnum>0 AND NOT a.attisdropped),
    'auth_constraints',(SELECT jsonb_agg(jsonb_build_array(conname,pg_get_constraintdef(oid,true),convalidated)ORDER BY conname)FROM pg_constraint WHERE conrelid='auth.identities'::regclass),
    'auth_hooks',(SELECT jsonb_object_agg(tgname,jsonb_build_array(pg_get_triggerdef(oid,true),md5(pg_get_functiondef(tgfoid)),tgenabled))FROM pg_trigger WHERE tgrelid='auth.identities'::regclass AND NOT tgisinternal),
    'auth_policies',(SELECT coalesce(jsonb_agg(jsonb_build_array(polname,polcmd,polpermissive,polroles::text,pg_get_expr(polqual,polrelid),pg_get_expr(polwithcheck,polrelid))ORDER BY polname),'[]')FROM pg_policy WHERE polrelid='auth.identities'::regclass),
    'relation',(SELECT jsonb_build_array(relkind,relispartition,relrowsecurity,relforcerowsecurity,relacl::text,relowner::regrole::text)FROM pg_class WHERE oid='public.apple_authorization_vault'::regclass),
    'columns',(SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid))ORDER BY a.attnum)FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.apple_authorization_vault'::regclass AND a.attnum>0 AND NOT a.attisdropped),
    'constraints',(SELECT jsonb_agg(jsonb_build_array(conrelid::regclass::text,conname,pg_get_constraintdef(oid,true),convalidated)ORDER BY conrelid,conname)FROM pg_constraint WHERE conrelid='public.apple_authorization_vault'::regclass OR confrelid='public.apple_authorization_vault'::regclass),
    'hooks',(SELECT jsonb_object_agg(tgrelid::regclass::text||'.'||tgname,jsonb_build_array(pg_get_triggerdef(oid,true),md5(pg_get_functiondef(tgfoid)),tgenabled))FROM pg_trigger WHERE NOT tgisinternal AND ((tgrelid='public.apple_authorization_vault'::regclass)OR(tgrelid='auth.users'::regclass AND tgname='guard_apple_authorization_identity_removal')OR(tgrelid='public.account_deletion_jobs'::regclass AND tgname='guard_apple_authorization_completion'))),
    'indexes',(SELECT jsonb_agg(pg_get_indexdef(indexrelid)ORDER BY indexrelid)FROM pg_index WHERE indrelid='public.apple_authorization_vault'::regclass),
    'policies',(SELECT coalesce(jsonb_agg(jsonb_build_array(polname,polcmd,polpermissive,polroles::text,pg_get_expr(polqual,polrelid),pg_get_expr(polwithcheck,polrelid))ORDER BY polname),'[]')FROM pg_policy WHERE polrelid='public.apple_authorization_vault'::regclass),
    'rules',(SELECT count(*)FROM pg_rewrite WHERE ev_class='public.apple_authorization_vault'::regclass),
    'inheritance',(SELECT count(*)FROM pg_inherits WHERE inhparent='public.apple_authorization_vault'::regclass OR inhrelid='public.apple_authorization_vault'::regclass));
$$;
CREATE FUNCTION public.apple_authorization_vault_functions()
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_array(md5(pg_get_functiondef(p.oid)),p.prosecdef,p.proconfig,p.proacl::text,p.proowner::regrole::text))FROM pg_proc p
  WHERE p.oid IN(to_regprocedure('public.guard_apple_authorization_vault_writer()'),to_regprocedure('public.guard_apple_authorization_identity_removal()'),
    to_regprocedure('public.guard_apple_authorization_completion()'),to_regprocedure('public.apple_authorization_capture_scope(uuid,uuid)'),
    to_regprocedure('public.apple_authorization_capture_cached(uuid,uuid,text,text,text)'),
    to_regprocedure('public.store_verified_apple_authorization(uuid,uuid,uuid,text,text,text,text,text,text,text)'),
    to_regprocedure('public.apple_authorization_vault_catalog()'),to_regprocedure('public.apple_authorization_vault_functions()'),
    to_regprocedure('public.apple_authorization_vault_current()'),to_regprocedure('public.assert_member_private_record_writer(uuid)'));
$$;
CREATE FUNCTION public.apple_authorization_vault_current()
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM public.apple_authorization_vault_contract WHERE id AND catalog=public.apple_authorization_vault_catalog() AND functions=public.apple_authorization_vault_functions());
$$;
REVOKE ALL ON FUNCTION public.guard_apple_authorization_vault_writer(),public.guard_apple_authorization_identity_removal(),public.guard_apple_authorization_completion(),
  public.apple_authorization_capture_scope(uuid,uuid),public.apple_authorization_capture_cached(uuid,uuid,text,text,text),
  public.store_verified_apple_authorization(uuid,uuid,uuid,text,text,text,text,text,text,text),public.apple_authorization_vault_catalog(),public.apple_authorization_vault_functions(),public.apple_authorization_vault_current()
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.apple_authorization_capture_cached(uuid,uuid,text,text,text),public.store_verified_apple_authorization(uuid,uuid,uuid,text,text,text,text,text,text,text) TO service_role;
SELECT public.protect_account_access_boundaries();
DO $$ BEGIN
  IF (public.account_deletion_private_hooks()-'public.account_deletion_jobs.guard_apple_authorization_completion') IS DISTINCT FROM (SELECT hooks FROM public.account_deletion_private_contract WHERE id)
  THEN RAISE EXCEPTION 'Unreviewed Apple completion hook change'; END IF;
END $$;
UPDATE public.account_deletion_private_contract SET hooks=public.account_deletion_private_hooks()WHERE id;
INSERT INTO public.apple_authorization_vault_contract SELECT true,public.apple_authorization_vault_catalog(),public.apple_authorization_vault_functions();
DO $$ BEGIN
  IF NOT public.apple_authorization_vault_current() OR NOT public.account_deletion_private_barrier_current()
    OR NOT public.account_deletion_ledger_actor_barrier_current()
    OR public.account_access_coverage() IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
  THEN RAISE EXCEPTION 'Apple credential boundaries require review'; END IF;
END $$;
COMMIT;
