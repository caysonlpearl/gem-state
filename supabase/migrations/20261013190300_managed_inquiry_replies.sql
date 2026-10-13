ALTER TABLE public.conversation_messages ADD COLUMN source_inquiry_id uuid UNIQUE REFERENCES public.listing_inquiries(id);
CREATE FUNCTION public.reply_managed_import_inquiry(_inquiry uuid,_actor uuid,_body text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE i public.listing_inquiries; s public.managed_import_sellers; c uuid; BEGIN
 PERFORM public.assert_import_operator(_actor);
 SELECT * INTO i FROM public.listing_inquiries WHERE id=_inquiry;
 SELECT m.* INTO s FROM public.managed_import_sellers m JOIN public.fb_marketplace_import_items f ON f.source_profile_url=m.source_profile_url WHERE f.listing_id=i.listing_id FOR UPDATE OF m;
 IF s.id IS NULL OR s.claimed_at IS NOT NULL OR s.owner_user_id<>i.seller_id THEN RAISE EXCEPTION 'This inbox is no longer admin managed'; END IF;
 INSERT INTO public.conversations(listing_id,buyer_id,seller_id) VALUES(i.listing_id,i.buyer_id,i.seller_id)
 ON CONFLICT(listing_id,buyer_id,seller_id) DO UPDATE SET last_message_at=public.conversations.last_message_at RETURNING id INTO c;
 INSERT INTO public.conversation_participants(conversation_id,user_id,role) VALUES(c,i.buyer_id,'buyer'),(c,i.seller_id,'seller') ON CONFLICT DO NOTHING;
 INSERT INTO public.conversation_messages(conversation_id,sender_id,body,created_at,source_inquiry_id) VALUES(c,i.buyer_id,i.message,i.created_at,i.id) ON CONFLICT(source_inquiry_id) DO NOTHING;
 PERFORM public.reply_managed_import_conversation(c,_actor,_body);
 UPDATE public.listing_inquiries SET status='closed' WHERE id=i.id;
 RETURN c;
END $$;
REVOKE ALL ON FUNCTION public.reply_managed_import_inquiry(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reply_managed_import_inquiry(uuid,uuid,text) TO service_role;
NOTIFY pgrst,'reload schema';
