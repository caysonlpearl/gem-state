-- Read-only dependency audit before considering source-copy removal.
SELECT jsonb_build_object(
 'referencingForeignKeys',coalesce((SELECT jsonb_agg(jsonb_build_object(
   'table',conrelid::regclass::text,'name',conname,'definition',pg_get_constraintdef(oid)))
   FROM pg_constraint WHERE confrelid='storage.objects'::regclass),'[]'::jsonb),
 'customTriggers',coalesce((SELECT jsonb_agg(jsonb_build_object(
   'name',tgname,'definition',pg_get_triggerdef(oid),'function',tgfoid::regprocedure::text))
   FROM pg_trigger WHERE tgrelid='storage.objects'::regclass AND NOT tgisinternal),'[]'::jsonb)
) AS dependency_audit;
