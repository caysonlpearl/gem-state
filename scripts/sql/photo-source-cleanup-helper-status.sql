-- Read-only installation/ACL receipt. Verify the GemList project in the UI.
SELECT p.proname, p.prosecdef AS security_definer, p.provolatile AS volatility,
 p.proconfig AS function_settings,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
 has_function_privilege('service_role',p.oid,'EXECUTE') AS service_role_execute,
 md5(pg_get_functiondef(p.oid)) AS definition_md5
FROM pg_proc p
WHERE p.oid=to_regprocedure('public.photo_source_cleanup_targets(jsonb)');
