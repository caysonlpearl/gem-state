-- Private reference keys/captions are obtained by the authenticated server
-- handler, which derives _caller from its validated session. Public callers
-- must not choose another member's identity for this service-only lookup.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $$DECLARE target oid:=to_regprocedure('public.sourcing_request_media(uuid,uuid)');BEGIN
 IF target IS NULL OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=target AND prosecdef
  AND md5(prosrc)='51dae1114f14e9e65ff69d4408a851f8'
  AND proconfig=ARRAY['search_path=public, pg_temp'])THEN RAISE EXCEPTION 'Review sourcing media function before restricting access';END IF;
END $$;
REVOKE ALL ON FUNCTION public.sourcing_request_media(uuid,uuid)FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sourcing_request_media(uuid,uuid)TO service_role;
DO $$BEGIN
 IF has_function_privilege('anon','public.sourcing_request_media(uuid,uuid)','EXECUTE')
 OR has_function_privilege('authenticated','public.sourcing_request_media(uuid,uuid)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.sourcing_request_media(uuid,uuid)','EXECUTE')THEN RAISE EXCEPTION 'Private sourcing media permissions require review';END IF;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
