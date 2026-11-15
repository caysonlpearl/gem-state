-- Candidates remain inactive until an active administrator reviews the evidence.
-- No new personal data or background collection; review metadata contains no identity.
BEGIN;
SET LOCAL search_path='';
SET LOCAL lock_timeout='5s';
DO $$ BEGIN
 IF to_regprocedure('public.assert_current_account_access()') IS NULL
 OR to_regprocedure('public.has_role(uuid,public.app_role)') IS NULL
 OR public.account_access_coverage() IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
 THEN RAISE EXCEPTION 'Review shopping ranking access prerequisites'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.shopping_controls'::regclass AND relrowsecurity)
 OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.shopping_model_evaluations'::regclass AND relrowsecurity)
 OR has_table_privilege('authenticated','public.shopping_controls','UPDATE')
 OR has_table_privilege('authenticated','public.shopping_model_evaluations','UPDATE')
 THEN RAISE EXCEPTION 'Review shopping ranking table permissions'; END IF;
END $$;

CREATE FUNCTION public.review_shopping_ranking(_week date,_expected_version text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $review$
DECLARE actor uuid:=auth.uid(); c public.shopping_controls; e public.shopping_model_evaluations;
 baseline_weights jsonb; next_version text; key text; weights jsonb; defaults jsonb:='{"visual":3,"budget":1,"location":0.5,"freshness":1,"engagement":0}';
BEGIN
 PERFORM public.assert_current_account_access();
 IF actor IS NULL OR public.has_role(actor,'admin') IS DISTINCT FROM true THEN
  RAISE EXCEPTION USING errcode='42501',message='Administrator access required'; END IF;
 -- Common lock order serializes reviewers and prevents applying a stale candidate.
 SELECT * INTO c FROM public.shopping_controls WHERE id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Ranking controls unavailable'; END IF;
 SELECT * INTO e FROM public.shopping_model_evaluations WHERE week=_week FOR UPDATE;
 IF NOT FOUND OR _expected_version IS NULL OR e.baseline->>'modelVersion' IS DISTINCT FROM _expected_version
 THEN RAISE EXCEPTION 'Ranking candidate unavailable; reload the report'; END IF;
 IF e.promoted THEN
  IF e.challenger->>'reviewedVersion'=c.model_version THEN
   RETURN jsonb_build_object('ok',true,'modelVersion',c.model_version,'alreadyApplied',true);
  END IF;
  RAISE EXCEPTION 'Ranking candidate is no longer current; reload the report';
 END IF;
 IF NOT c.learning OR c.model_version IS DISTINCT FROM _expected_version
 OR e.baseline->>'schema' IS DISTINCT FROM 'engagement-v1'
 OR e.challenger->>'schema' IS DISTINCT FROM 'engagement-v1'
 OR e.challenger->'eligible' IS DISTINCT FROM 'true'::jsonb
 OR e.outcomes<30
 THEN RAISE EXCEPTION 'Ranking candidate is not eligible; reload the report'; END IF;
 IF jsonb_typeof(e.baseline->'accuracy') IS DISTINCT FROM 'number'
 OR jsonb_typeof(e.challenger->'accuracy') IS DISTINCT FROM 'number'
 OR jsonb_typeof(e.challenger->'trainingPairs') IS DISTINCT FROM 'number'
 OR jsonb_typeof(e.challenger->'testPairs') IS DISTINCT FROM 'number'
 THEN RAISE EXCEPTION 'Ranking evidence requires review'; END IF;
 IF (e.challenger->>'trainingPairs')::numeric<200 OR (e.challenger->>'testPairs')::numeric<100
 OR (e.baseline->>'accuracy')::numeric NOT BETWEEN 0 AND 1
 OR (e.challenger->>'accuracy')::numeric NOT BETWEEN 0 AND 1
 OR (e.challenger->>'accuracy')::numeric < (e.baseline->>'accuracy')::numeric+0.03
 THEN RAISE EXCEPTION 'Ranking evidence is insufficient'; END IF;
 weights:=e.challenger->'weights'; baseline_weights:='{}'::jsonb;
 IF jsonb_typeof(weights) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Ranking weights require review'; END IF;
 FOR key IN SELECT jsonb_object_keys(defaults) LOOP
  IF jsonb_typeof(weights->key) IS DISTINCT FROM 'number' OR (weights->>key)::numeric NOT BETWEEN 0 AND 6
  THEN RAISE EXCEPTION 'Ranking weights require review'; END IF;
  baseline_weights:=baseline_weights||jsonb_build_object(key,coalesce(c.model->'weights'->key,defaults->key));
 END LOOP;
 IF (SELECT count(*) FROM jsonb_object_keys(weights))<>5 OR baseline_weights IS DISTINCT FROM e.baseline->'weights'
 THEN RAISE EXCEPTION 'Ranking baseline changed; reload the report'; END IF;
 next_version:='reviewed-'||_week::text||'-engagement-v1';
 UPDATE public.shopping_controls SET model_version=next_version,
  model=jsonb_set(model,'{weights}',weights,true),updated_at=now() WHERE id;
 UPDATE public.shopping_model_evaluations SET promoted=true,
  challenger=challenger||jsonb_build_object('reviewedAt',now(),'reviewedVersion',next_version) WHERE week=_week;
 RETURN jsonb_build_object('ok',true,'modelVersion',next_version,'alreadyApplied',false);
END $review$;
REVOKE ALL ON FUNCTION public.review_shopping_ranking(date,text) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.review_shopping_ranking(date,text) TO authenticated;

-- Service report can distinguish missing migration from an unavailable review.
CREATE FUNCTION public.shopping_ranking_review_ready() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT has_function_privilege('authenticated','public.review_shopping_ranking(date,text)','EXECUTE')
 AND NOT has_function_privilege('anon','public.review_shopping_ranking(date,text)','EXECUTE')
 AND public.account_access_coverage()=jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
$$;
REVOKE ALL ON FUNCTION public.shopping_ranking_review_ready() FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.shopping_ranking_review_ready() TO service_role;
SELECT public.protect_account_access_boundaries();
DO $$ BEGIN
 IF NOT public.shopping_ranking_review_ready() THEN RAISE EXCEPTION 'Ranking review access requires review'; END IF;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
