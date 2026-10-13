-- Include not-yet-published import photos in the same retryable claim journal.
DO $$
DECLARE definition text; needle text;
BEGIN
 SELECT pg_get_functiondef('public.prepare_seller_claim(text,uuid)'::regprocedure) INTO definition;
 needle:=' ) a WHERE split_part(path,''/'',1)<>_claimant::text;';
 IF position(needle in definition)=0 THEN RAISE EXCEPTION 'Claim asset query changed'; END IF;
 definition:=replace(definition,needle,
 ' UNION SELECT ''ask-evidence'',asset FROM public.fb_marketplace_import_items i CROSS JOIN LATERAL unnest(i.evidence_paths) asset WHERE i.source_profile_url=s.source_profile_url AND i.status<>''discarded''
 UNION SELECT ''listing-media'',asset FROM public.fb_marketplace_import_items i CROSS JOIN LATERAL unnest(i.public_paths) asset WHERE i.source_profile_url=s.source_profile_url AND i.status<>''discarded''
 ) a WHERE split_part(path,''/'',1)<>_claimant::text;');
 EXECUTE definition;
 SELECT pg_get_functiondef('public.finish_seller_claim(uuid,uuid,boolean,boolean)'::regprocedure) INTO definition;
 needle:=' UPDATE public.fb_marketplace_import_items SET seller_id=_claimant WHERE source_profile_url=s.source_profile_url;';
 IF position(needle in definition)=0 THEN RAISE EXCEPTION 'Claim import ownership update changed'; END IF;
 definition:=replace(definition,needle,
 ' UPDATE public.fb_marketplace_import_items i SET seller_id=_claimant,
 evidence_paths=ARRAY(SELECT coalesce((SELECT x->>''new'' FROM jsonb_array_elements(j.manifest) x WHERE x->>''bucket''=''ask-evidence'' AND x->>''old''=asset LIMIT 1),asset) FROM unnest(i.evidence_paths) WITH ORDINALITY a(asset,position) ORDER BY position),
 public_paths=ARRAY(SELECT coalesce((SELECT x->>''new'' FROM jsonb_array_elements(j.manifest) x WHERE x->>''bucket''=''listing-media'' AND x->>''old''=asset LIMIT 1),asset) FROM unnest(i.public_paths) WITH ORDINALITY a(asset,position) ORDER BY position)
 WHERE i.source_profile_url=s.source_profile_url;');
 EXECUTE definition;
END $$;
NOTIFY pgrst,'reload schema';
