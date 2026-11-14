-- Private diagnostics before identity removal. This never authorizes a deletion,
-- changes an account, advances a phase or installs a worker/scheduler.
BEGIN;
CREATE FUNCTION public.account_deletion_auth_dependency_catalog()
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'schema',n.nspname,'table',r.relname,'constraint',c.conname,
  'column',a.attname,'definition',pg_get_constraintdef(c.oid,true),
  'validated',c.convalidated,'deferrable',c.condeferrable,'initially_deferred',c.condeferred,
  'delete_action',c.confdeltype,'relation_kind',r.relkind,
  'single_uuid_key',cardinality(c.conkey)=1 AND cardinality(c.confkey)=1
    AND c.confkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='auth.users'::regclass AND attname='id' AND NOT attisdropped)]::smallint[]
    AND a.atttypid='uuid'::regtype)
  ORDER BY n.nspname,r.relname,c.conname),'[]'::jsonb)
 FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid
 JOIN pg_namespace n ON n.oid=r.relnamespace
 LEFT JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1] AND NOT a.attisdropped
 WHERE c.contype='f' AND c.confrelid='auth.users'::regclass AND c.conparentid=0;
$$;

CREATE FUNCTION public.inspect_account_deletion_auth_dependencies(_id uuid,_user uuid,_lease uuid,_limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' SET statement_timeout='8s' AS $$
DECLARE job public.account_deletion_jobs; catalog jsonb; entry jsonb; found_rows integer;
 dependencies jsonb:='[]'::jsonb; action text;
BEGIN
 IF _id IS NULL OR _user IS NULL OR _lease IS NULL OR _limit IS NULL OR _limit NOT BETWEEN 1 AND 100
  OR current_setting('transaction_isolation')<>'read committed'
 THEN RAISE EXCEPTION 'Identity dependency inspection unavailable'; END IF;
 PERFORM 1 FROM public.account_deletion_controls WHERE id AND worker_enabled FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Identity dependency inspection unavailable'; END IF;
 SELECT * INTO job FROM public.account_deletion_jobs WHERE id=_id FOR UPDATE;
 IF NOT FOUND OR job.user_id IS DISTINCT FROM _user OR job.lease_token IS DISTINCT FROM _lease
  OR job.phase NOT IN ('records','identity') OR job.status<>'processing' OR job.lease_until<=clock_timestamp()
  OR NOT EXISTS(SELECT 1 FROM public.mobile_account_deletions WHERE user_id=_user)
  OR public.account_access_coverage() IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
 THEN RAISE EXCEPTION 'Identity dependency inspection unavailable'; END IF;
 -- Auth must still exist. Post-cascade empty tables must never look like a
 -- successful pre-deletion inspection. Hold its key through this transaction.
 PERFORM 1 FROM auth.users WHERE id=_user FOR KEY SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Identity dependency inspection unavailable'; END IF;
 catalog:=public.account_deletion_auth_dependency_catalog();
 IF jsonb_array_length(catalog)>256 THEN RAISE EXCEPTION 'Identity dependency schema requires review'; END IF;
 FOR entry IN SELECT value FROM jsonb_array_elements(catalog) LOOP
  IF entry->'single_uuid_key' IS DISTINCT FROM 'true'::jsonb OR entry->>'relation_kind' NOT IN ('r','p')
  THEN RAISE EXCEPTION 'Identity dependency schema requires review'; END IF;
  action:=CASE entry->>'delete_action' WHEN 'a' THEN 'no_action' WHEN 'r' THEN 'restrict'
    WHEN 'c' THEN 'cascade' WHEN 'n' THEN 'set_null' WHEN 'd' THEN 'set_default' END;
  IF action IS NULL THEN RAISE EXCEPTION 'Identity dependency schema requires review'; END IF;
  -- Quote all catalog identifiers. Fetch only a bounded count, never row values.
  -- Partitioned FKs cover their partitions. Ordinary inheritance does not
  -- inherit FK enforcement, so its unrelated child rows must not be counted.
  EXECUTE format('SELECT count(*)::integer FROM (SELECT 1 FROM %s%I.%I WHERE %I OPERATOR(pg_catalog.=) $1 LIMIT $2) q',
    CASE entry->>'relation_kind' WHEN 'p' THEN '' ELSE 'ONLY ' END,
    entry->>'schema',entry->>'table',entry->>'column') INTO found_rows USING _user,_limit+1;
  dependencies:=dependencies||jsonb_build_array(jsonb_build_object(
   'schema',entry->>'schema','table',entry->>'table','constraint',entry->>'constraint','column',entry->>'column',
   'on_delete',action,'validated',entry->'validated','deferrable',entry->'deferrable',
   'initially_deferred',entry->'initially_deferred','rows_at_least',found_rows,'capped',found_rows>_limit));
 END LOOP;
 IF catalog IS DISTINCT FROM public.account_deletion_auth_dependency_catalog() OR job.lease_until<=clock_timestamp()
 THEN RAISE EXCEPTION 'Identity dependency inspection unavailable'; END IF;
 RETURN jsonb_build_object('scope','direct_auth_foreign_keys','schema_fingerprint',md5(catalog::text),'relationships',dependencies);
END $$;
REVOKE ALL ON FUNCTION public.account_deletion_auth_dependency_catalog() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.inspect_account_deletion_auth_dependencies(uuid,uuid,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.inspect_account_deletion_auth_dependencies(uuid,uuid,uuid,integer) TO service_role;
COMMIT;
