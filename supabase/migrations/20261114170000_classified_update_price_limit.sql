-- Match the classified form/table's existing $10,000,000 ceiling. The legacy
-- inner update helper still rejects values above $50,000. No row is updated here.
BEGIN;
SET LOCAL search_path='';
SET LOCAL lock_timeout='1s';
SET LOCAL statement_timeout='8s';
DO $migration$
DECLARE
 target oid:=to_regprocedure('public.update_ask(uuid,integer,public.item_condition,text,numeric,numeric,numeric,numeric)');
 before_source text; before_definition text; before_metadata jsonb;
 after_source text; after_metadata jsonb; registered public.account_access_protected_functions;
 old_predicate constant text:='_price_cents > 5000000';
 new_predicate constant text:='_price_cents > 1000000000';
 old_md5 constant text:='83684e7310d76380e4cb5fb7ab7cc073';
 new_md5 constant text:='99040473f400ddee7d1184055b3b84cd';
BEGIN
 IF target IS NULL OR public.account_access_coverage() IS DISTINCT FROM
 jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
 THEN RAISE EXCEPTION 'Review classified price update prerequisites'; END IF;
 SELECT * INTO registered FROM public.account_access_protected_functions
 WHERE function_oid=target FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Review classified price update guard'; END IF;
 SELECT p.prosrc,pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc'
 INTO before_source,before_definition,before_metadata FROM pg_proc p WHERE p.oid=target;
 IF md5(before_source)=new_md5 AND registered.protected_body_md5=new_md5
 AND cardinality(string_to_array(registered.original_definition,new_predicate))=2
 AND strpos(registered.original_definition,old_predicate)=0 THEN RETURN; END IF;
 IF md5(before_source)<>old_md5 OR registered.protected_body_md5<>old_md5
 OR cardinality(string_to_array(before_source,old_predicate))<>2
 OR cardinality(string_to_array(registered.original_definition,old_predicate))<>2
 OR strpos(before_source,new_predicate)>0
 THEN RAISE EXCEPTION 'Review changed classified price helper'; END IF;
 -- Preserve the actual live signature, owner, privileges, access guard and
 -- function attributes. Replace only the reviewed numeric upper-bound clause.
 EXECUTE replace(before_definition,old_predicate,new_predicate);
 SELECT p.prosrc,to_jsonb(p)-'prosrc' INTO after_source,after_metadata
 FROM pg_proc p WHERE p.oid=target;
 IF md5(after_source)<>new_md5 OR after_metadata IS DISTINCT FROM before_metadata
 THEN RAISE EXCEPTION 'Classified price helper changed unexpectedly'; END IF;
 -- The reviewed body change must update the guard's original/active versions
 -- together. Neither guard removal nor accepting unrelated source is allowed.
 UPDATE public.account_access_protected_functions SET
 original_definition=replace(original_definition,old_predicate,new_predicate),
 protected_body_md5=new_md5,protected_at=now()
 WHERE function_oid=target AND protected_body_md5=old_md5;
 IF NOT FOUND OR public.account_access_coverage() IS DISTINCT FROM
 jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
 THEN RAISE EXCEPTION 'Classified price update access boundary requires review'; END IF;
END $migration$;
NOTIFY pgrst,'reload schema';
COMMIT;
