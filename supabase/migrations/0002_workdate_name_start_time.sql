-- ==========================================
-- Optional name and start time for Veranstaltungen,
-- plus the configurable weekday-bucket start time defaults.
-- Idempotent, so it is safe to run against a populated database.
-- ==========================================

ALTER TABLE work_dates
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS start_time TIME;

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS default_start_time_mon_thu TIME NOT NULL DEFAULT '20:00',
  ADD COLUMN IF NOT EXISTS default_start_time_fri TIME NOT NULL DEFAULT '20:00',
  ADD COLUMN IF NOT EXISTS default_start_time_sat_sun TIME NOT NULL DEFAULT '15:30';

-- Dates created before the column existed carry no time, so give them the same
-- bucket defaults the seed in seed.sql applies. Touching only NULL rows keeps a
-- second run a no-op and never overwrites a time an admin has already set.
UPDATE work_dates
SET start_time = CASE
    WHEN EXTRACT(DOW FROM work_dates.date) IN (0, 6) THEN TIME '15:30' -- Sat, Sun start in the afternoon
    ELSE TIME '20:00'
  END
WHERE start_time IS NULL;
