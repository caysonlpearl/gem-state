-- Repair the captured retention job without running it or changing its ACLs.
BEGIN;
SET LOCAL search_path='';
DO $$
DECLARE definition text; original_acl aclitem[];
BEGIN
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.retain_shopping_data()'::regprocedure)
    IS DISTINCT FROM '43b1989e90cd7acbc2b0f714c457d746'
 OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid='public.retain_shopping_data()'::regprocedure
   AND prosecdef AND proconfig=ARRAY['search_path=public, pg_temp'])
 OR has_function_privilege('anon','public.retain_shopping_data()','execute')
 OR has_function_privilege('authenticated','public.retain_shopping_data()','execute')
 OR NOT has_function_privilege('service_role','public.retain_shopping_data()','execute')
 OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.analytics_events'::regclass
   AND attname='occurred_at' AND atttypid='timestamptz'::regtype AND NOT attisdropped)
 OR EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.analytics_events'::regclass
   AND attname='created_at' AND NOT attisdropped)
 THEN RAISE EXCEPTION 'Review shopping retention definition and event date'; END IF;
 SELECT pg_get_functiondef(oid),proacl INTO definition,original_acl
 FROM pg_proc WHERE oid='public.retain_shopping_data()'::regprocedure;
 IF strpos(definition,'analytics_events where created_at<')=0
 OR strpos(definition,'order by created_at limit 1000')=0
 THEN RAISE EXCEPTION 'Review shopping retention date references'; END IF;
 definition:=replace(definition,'analytics_events where created_at<','analytics_events where occurred_at<');
 definition:=replace(definition,'order by created_at limit 1000','order by occurred_at,id limit 1000');
 EXECUTE definition;
 IF (SELECT proacl FROM pg_proc WHERE oid='public.retain_shopping_data()'::regprocedure)
    IS DISTINCT FROM original_acl
 THEN RAISE EXCEPTION 'Shopping retention permissions changed'; END IF;
END $$;
COMMIT;
