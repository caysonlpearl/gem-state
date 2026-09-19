-- 1. Lock down leftover restore/backup tables (raw SQL incl. user account data).
--    RLS on with no policies = deny-by-default for anon and authenticated.
ALTER TABLE public._restore_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._restore_errors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public._restore_chunks FROM anon, authenticated;
REVOKE ALL ON TABLE public._restore_errors FROM anon, authenticated;

-- 2. Lock down SECURITY DEFINER function execution
DO $mig$
DECLARE
  f record;
  anon_allowed text[] := ARRAY['public_shopper_profile'];
  service_only text[] := ARRAY[
    'finalize_stripe_order_payment','finalize_stripe_offer_authorization','finalize_dispute_stripe_refund',
    'finalize_sourcing_balance_payment','finalize_sourcing_refund','finalize_sourcing_tip',
    'complete_captured_stripe_offer','complete_exact_ask_order','release_expired_reservations',
    'release_stripe_checkout_order','release_sourcing_checkout_order','release_authorized_offer_capture_reservation',
    'reserve_exact_ask_for_stripe','reserve_sourcing_order_for_stripe','reserve_authorized_offer_for_capture',
    'begin_listing_offer_checkout','prepare_stripe_listing_offer','fail_listing_offer_checkout',
    'begin_sourcing_tip_checkout','begin_sourcing_balance_checkout','prepare_sourcing_balance_checkout',
    'claim_sourcing_tip_payment','capture_price_snapshots','expire_shopper_availability',
    'expire_sourcing_balance_checkout','claim_review_emails','consume_review_worker_token',
    'dispatch_review_email_worker','record_provider_shipment','record_duplicate_sourcing_balance_refund',
    'record_sourcing_balance_checkout','record_classified_listing_view','record_classified_listing_impressions',
    'compute_order_totals','sourcing_options','sourcing_request_media','sourcing_option_shipment_context',
    'notify_member','enforce_rate_limit','start_sourcing_purchase','shopper_confirm_purchase'
  ];
BEGIN
  FOR f IN
    SELECT p.oid,
           p.proname,
           p.prorettype = 'trigger'::regtype AS is_trigger,
           format('public.%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid)) AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f.sig);

    IF f.is_trigger OR f.proname = ANY(service_only) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', f.sig);
    ELSE
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
    END IF;

    IF f.proname = ANY(anon_allowed) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon', f.sig);
    END IF;

    IF NOT f.is_trigger THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.sig);
    END IF;
  END LOOP;
END
$mig$;

-- 3. Explicit, owner-scoped policies on storage.objects (previously zero policies)
CREATE POLICY "Owners read their own storage objects"
ON storage.objects FOR SELECT TO authenticated
USING (owner = auth.uid());

CREATE POLICY "Owners update their own storage objects"
ON storage.objects FOR UPDATE TO authenticated
USING (owner = auth.uid())
WITH CHECK (owner = auth.uid());

CREATE POLICY "Owners delete their own storage objects"
ON storage.objects FOR DELETE TO authenticated
USING (owner = auth.uid());
