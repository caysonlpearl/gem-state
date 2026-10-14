-- The monthly Idaho market report (/idaho/market-report/{yyyy-mm}) is built
-- from live listings. While a month is current, each build is saved here, so
-- once the month ends its page keeps the numbers as they stood at its end.
-- Written and read only by the server (service role); no public access.
CREATE TABLE IF NOT EXISTS public.market_report_snapshots (
  month text PRIMARY KEY CHECK (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  report jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.market_report_snapshots ENABLE ROW LEVEL SECURITY;
