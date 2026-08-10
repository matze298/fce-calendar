-- ==========================================
-- Initial schema: custom types, tables, and Row Level Security enabled on each.
-- Policies live in 0005_access_control.sql. RLS with no policy denies everything, so a
-- database built from this file alone is closed rather than open.
-- ==========================================

-- 1. Custom Types
DO $$ BEGIN
  CREATE TYPE seniority_type AS ENUM ('Senior', 'Standard', 'Junior');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE availability_type AS ENUM ('Any', 'Weekends', 'Weekdays');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE assignment_status AS ENUM ('Draft', 'Published');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Members Table (GDPR: Minimal data)
CREATE TABLE IF NOT EXISTS members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id UUID UNIQUE, -- Link to auth.users
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  seniority_level seniority_type NOT NULL DEFAULT 'Standard',
  availability availability_type NOT NULL DEFAULT 'Any',
  historical_shifts INT NOT NULL DEFAULT 0,
  exempt BOOLEAN NOT NULL DEFAULT FALSE,
  is_approved BOOLEAN NOT NULL DEFAULT FALSE, -- Admin must approve
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,    -- Admin privileges
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. WorkDates Table
CREATE TABLE IF NOT EXISTS work_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL UNIQUE,
  name TEXT,
  start_time TIME,
  required_people INT NOT NULL DEFAULT 1,
  is_important_shift BOOLEAN NOT NULL DEFAULT FALSE,
  is_weekend BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Assignments Table (GDPR: Cascade delete for anonymization/erasure)
CREATE TABLE IF NOT EXISTS assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  workdate_id UUID NOT NULL REFERENCES work_dates(id) ON DELETE CASCADE,
  status assignment_status NOT NULL DEFAULT 'Draft',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(member_id, workdate_id)
);

-- 5. Settings Table (Scheduler configuration)
CREATE TABLE IF NOT EXISTS settings (
  id INT PRIMARY KEY DEFAULT 1,
  cooldown_days INT NOT NULL DEFAULT 21,
  default_start_time_mon_thu TIME NOT NULL DEFAULT '20:00',
  default_start_time_fri TIME NOT NULL DEFAULT '20:00',
  default_start_time_sat_sun TIME NOT NULL DEFAULT '15:30',
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT one_row_only CHECK (id = 1)
);

-- 6. Registrations Table (a login awaiting an admin decision)
CREATE TABLE IF NOT EXISTS registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id UUID UNIQUE NOT NULL,
  email TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Row Level Security (RLS) - GDPR Compliance
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_dates ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE registrations ENABLE ROW LEVEL SECURITY;
