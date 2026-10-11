-- The five vehicles seeded on 2026-09-14 by the founder's test account (all
-- using the "GEM STATE MVP TEST PHOTO" placeholder image) and the
-- 2026-10-05 QA dealer listing were showing on the live site as if they
-- were real inventory. Public queries already exclude is_demo listings, so
-- flagging them hides them everywhere without deleting anything; flip the
-- flag back to restore any of them.
UPDATE public.asks
SET is_demo = true
WHERE id IN (
  '85a4d906-1bf9-47b1-bb1d-2ddd2404e88b', -- 2015 Ram 1500 Big Horn 4WD
  'c16bfd62-01dc-4772-a293-c3704b190eb6', -- 2022 Hyundai Tucson SEL AWD
  '6eeaa0a9-67cb-4171-9b9b-893b2f3d081e', -- 2019 Toyota Tacoma TRD Off-Road 4x4
  '82e0ba32-cc38-4992-a7f8-e3a52fa86ee2', -- 2020 Jeep Wrangler Sport 4WD
  'd865086f-29ea-4c30-9ada-bc065cc2cacd', -- 2017 Chevrolet Silverado 1500 LT 4WD
  '1bca966c-c2d7-4bdf-b165-e1948b92f7d7'  -- BLUEBIRD-QA-dealer-lifecycle-20261005
);
