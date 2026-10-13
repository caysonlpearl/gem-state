-- Supabase's default privileges grant new functions to client roles. Explicitly
-- remove them in addition to PUBLIC; each body also checks the server role.
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('assert_import_operator','register_managed_import_seller','rotate_seller_claim','create_import_listing','apply_managed_import_item','prepare_seller_claim','finish_seller_claim','set_import_sync','reply_managed_import_conversation','keep_bluebird_import_version','flag_import_seller_edit') LOOP
 EXECUTE 'REVOKE ALL ON FUNCTION '||r.signature||' FROM PUBLIC, anon, authenticated';
 EXECUTE 'GRANT EXECUTE ON FUNCTION '||r.signature||' TO service_role';
 END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
