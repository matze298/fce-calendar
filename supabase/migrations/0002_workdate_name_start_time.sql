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
