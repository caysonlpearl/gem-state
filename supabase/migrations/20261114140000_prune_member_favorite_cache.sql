-- Member favorites are read from their actual bookmark tables. Retire only the
-- redundant analytics cache after deploying the authoritative reader; never
-- delete member bookmarks, guest favorites or browsing/outcome evidence.
BEGIN;
CREATE FUNCTION public.prune_member_favorite_cache(_limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
DECLARE removed integer;
BEGIN
 IF _limit IS NULL OR _limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid favorite cleanup batch'; END IF;
 -- This is an infrequent operator cleanup, not request-serving work. Hold a
 -- short schema/write lock while checking that deletion has no unreviewed
 -- children or hooks; concurrent SELECT FOR UPDATE rows may still be skipped.
 LOCK TABLE public.shopping_favorites IN SHARE ROW EXCLUSIVE MODE;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.shopping_favorites'::regclass AND relkind='r' AND NOT relispartition)
  OR EXISTS(SELECT 1 FROM pg_inherits WHERE inhparent='public.shopping_favorites'::regclass OR inhrelid='public.shopping_favorites'::regclass)
  OR EXISTS(SELECT 1 FROM pg_constraint WHERE contype='f' AND confrelid='public.shopping_favorites'::regclass)
  OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.shopping_favorites'::regclass AND NOT tgisinternal AND tgenabled<>'D' AND (tgtype::integer & 8)<>0)
  OR EXISTS(SELECT 1 FROM pg_rewrite WHERE ev_class='public.shopping_favorites'::regclass AND ev_type='4')
 THEN RAISE EXCEPTION 'Favorite cleanup schema requires review'; END IF;
 WITH candidates AS MATERIALIZED (
  SELECT subject,listing_id FROM ONLY public.shopping_favorites
  WHERE subject>='u:' AND subject<'u;'
   AND subject~'^u:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  ORDER BY subject,listing_id LIMIT _limit FOR UPDATE SKIP LOCKED
 ), erased AS (
  DELETE FROM ONLY public.shopping_favorites f USING candidates c
  WHERE f.subject=c.subject AND f.listing_id=c.listing_id RETURNING 1
 ) SELECT count(*)::integer INTO removed FROM erased;
 RETURN jsonb_build_object('deleted',removed,'remaining',EXISTS(
  SELECT 1 FROM public.shopping_favorites WHERE subject>='u:' AND subject<'u;'
  AND subject~'^u:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'));
END $$;
REVOKE ALL ON FUNCTION public.prune_member_favorite_cache(integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.prune_member_favorite_cache(integer) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
