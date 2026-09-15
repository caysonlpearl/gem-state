-- Configure the shared marketplace test environment for the buyer MVP path.
-- Keep custom sourcing and shopper quote flows disabled until they are separately validated.
INSERT INTO public.market_settings (
  id,
  live_checkout_enabled,
  pilot_reservation_minutes,
  checkout_reservation_minutes,
  completion_inspection_hours,
  custom_sourcing_requests_enabled,
  shopper_quotes_enabled
)
VALUES (true, true, 2880, 30, 24, false, false)
ON CONFLICT (id) DO UPDATE SET
  live_checkout_enabled = EXCLUDED.live_checkout_enabled,
  pilot_reservation_minutes = EXCLUDED.pilot_reservation_minutes,
  checkout_reservation_minutes = EXCLUDED.checkout_reservation_minutes,
  completion_inspection_hours = EXCLUDED.completion_inspection_hours,
  custom_sourcing_requests_enabled = EXCLUDED.custom_sourcing_requests_enabled,
  shopper_quotes_enabled = EXCLUDED.shopper_quotes_enabled,
  updated_at = now();
