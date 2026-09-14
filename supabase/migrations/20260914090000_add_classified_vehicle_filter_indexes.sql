CREATE INDEX IF NOT EXISTS classified_listing_details_vehicle_transmission_idx
  ON public.classified_listing_details (vehicle_transmission);

CREATE INDEX IF NOT EXISTS classified_listing_details_vehicle_exterior_color_idx
  ON public.classified_listing_details (vehicle_exterior_color);

CREATE INDEX IF NOT EXISTS classified_listing_details_vehicle_title_status_idx
  ON public.classified_listing_details (vehicle_title_status);
