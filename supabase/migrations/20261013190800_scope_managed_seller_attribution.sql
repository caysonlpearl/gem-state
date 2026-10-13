-- A legacy real account can own unrelated listings. Do not relabel its whole
-- storefront merely because an imported Facebook profile has a pending claim.
CREATE OR REPLACE FUNCTION public.managed_seller_public_status(_user uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('managed',EXISTS(
 SELECT 1 FROM public.managed_import_sellers m JOIN auth.users u ON u.id=m.owner_user_id
 WHERE m.owner_user_id=_user AND m.claimed_at IS NULL AND u.raw_app_meta_data->>'managed_import'='true'));
$$;
CREATE FUNCTION public.managed_seller_public_status(_user uuid,_listing uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('managed',EXISTS(
 SELECT 1 FROM public.managed_import_sellers m JOIN public.fb_marketplace_import_items i ON i.source_profile_url=m.source_profile_url
 WHERE m.owner_user_id=_user AND m.claimed_at IS NULL AND i.listing_id=_listing AND i.seller_id=_user));
$$;
REVOKE ALL ON FUNCTION public.managed_seller_public_status(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.managed_seller_public_status(uuid,uuid) TO anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
