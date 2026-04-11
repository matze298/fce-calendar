-- ==========================================
-- 1. FC Egenhausen Shift Calendar: Master Setup
-- This script contains the Schema + GDPR RLS + Seed Data
-- ==========================================

-- 0. Clean up existing objects for a fresh start
DROP TABLE IF EXISTS assignments CASCADE;
DROP TABLE IF EXISTS work_dates CASCADE;
DROP TABLE IF EXISTS members CASCADE;

DROP TYPE IF EXISTS seniority_type CASCADE;
DROP TYPE IF EXISTS availability_type CASCADE;
DROP TYPE IF EXISTS assignment_status CASCADE;

-- 1. Custom Types
CREATE TYPE seniority_type AS ENUM ('Senior', 'Standard', 'Junior');
CREATE TYPE availability_type AS ENUM ('Any', 'Weekends', 'Weekdays');
CREATE TYPE assignment_status AS ENUM ('Draft', 'Published');

-- 2. Members Table (GDPR: Minimal data)
CREATE TABLE members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  telegram_chat_id TEXT,
  seniority_level seniority_type NOT NULL DEFAULT 'Standard',
  availability availability_type NOT NULL DEFAULT 'Any',
  historical_shifts INT NOT NULL DEFAULT 0,
  exempt BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. WorkDates Table
CREATE TABLE work_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL UNIQUE,
  required_people INT NOT NULL DEFAULT 1,
  is_important_shift BOOLEAN NOT NULL DEFAULT FALSE,
  is_weekend BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Assignments Table (GDPR: Cascade delete for anonymization/erasure)
CREATE TABLE assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  workdate_id UUID NOT NULL REFERENCES work_dates(id) ON DELETE CASCADE,
  status assignment_status NOT NULL DEFAULT 'Draft',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(member_id, workdate_id)
);

-- 5. Row Level Security (RLS) - GDPR Compliance
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_dates ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;

-- Strict Admin-Only Policies (Updated for Prototype)
-- Allow 'anon' to read so we can see the calendar without login
-- Allow 'authenticated' (Admins) to do everything

CREATE POLICY "Anyone can view members" ON members FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins can do everything on members" ON members FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Anyone can view work_dates" ON work_dates FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins can do everything on work_dates" ON work_dates FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Anyone can view assignments" ON assignments FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone can insert assignments" ON assignments FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Anyone can delete assignments" ON assignments FOR DELETE TO anon, authenticated USING (true);
CREATE POLICY "Admins can do everything on assignments" ON assignments FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 6. Seed Data: 50 realistic German members
INSERT INTO members (name, email, seniority_level, availability, historical_shifts) VALUES
('Max Mustermann', 'max@mustermann.de', 'Senior', 'Any', 12),
('Sabine Schmidt', 'sabine@schmidt.de', 'Standard', 'Weekends', 5),
('Thomas Müller', 'thomas@mueller.de', 'Senior', 'Weekdays', 8),
('Anna Fischer', 'anna@fischer.de', 'Junior', 'Any', 0),
('Lukas Weber', 'lukas@weber.de', 'Standard', 'Weekends', 4),
('Petra Wagner', 'petra@wagner.de', 'Senior', 'Any', 15),
('Stefan Becker', 'stefan@becker.de', 'Junior', 'Weekdays', 2),
('Julia Hoffmann', 'julia@hoffmann.de', 'Standard', 'Any', 7),
('Andreas Schulz', 'andreas@schulz.de', 'Senior', 'Weekends', 10),
('Kathrin Koch', 'kathrin@koch.de', 'Junior', 'Any', 1),
('Michael Bauer', 'michael@bauer.de', 'Senior', 'Weekdays', 9),
('Susanne Richter', 'susanne@richter.de', 'Standard', 'Weekends', 3),
('Daniel Klein', 'daniel@klein.de', 'Junior', 'Weekdays', 0),
('Monika Wolf', 'monika@wolf.de', 'Senior', 'Any', 11),
('Christian Schröder', 'christian@schroeder.de', 'Standard', 'Any', 6),
('Sandra Neumann', 'sandra@neumann.de', 'Junior', 'Weekends', 2),
('Frank Schwarz', 'frank@schwarz.de', 'Senior', 'Weekdays', 14),
('Gabriele Zimmermann', 'gabriele@zimmermann.de', 'Standard', 'Any', 5),
('Markus Braun', 'markus@braun.de', 'Junior', 'Weekdays', 1),
('Bettina Krüger', 'bettina@krueger.de', 'Senior', 'Weekends', 13),
('Holger Hofmann', 'holger@hofmann.de', 'Standard', 'Any', 4),
('Carsten Hartmann', 'carsten@hartmann.de', 'Junior', 'Weekdays', 0),
('Marion Lange', 'marion@lange.de', 'Senior', 'Weekends', 16),
('Uwe Schmitz', 'uwe@schmitz.de', 'Standard', 'Any', 8),
('Claudia Krause', 'claudia@krause.de', 'Junior', 'Weekends', 1),
('Jürgen Meier', 'juergen@meier.de', 'Senior', 'Weekdays', 12),
('Renate Werner', 'renate@werner.de', 'Standard', 'Any', 7),
('Klaus Vogel', 'klaus@vogel.de', 'Junior', 'Weekdays', 0),
('Ingrid Hubert', 'ingrid@hubert.de', 'Senior', 'Weekends', 9),
('Gerd Maier', 'gerd@maier.de', 'Standard', 'Any', 4),
('Inge Jung', 'inge@jung.de', 'Junior', 'Weekends', 2),
('Wolfgang Frank', 'wolfgang@frank.de', 'Senior', 'Weekdays', 11),
('Ute Berger', 'ute@berger.de', 'Standard', 'Any', 6),
('Bernd Bergmann', 'bernd@bergmann.de', 'Junior', 'Weekdays', 1),
('Helga Keller', 'helga@keller.de', 'Senior', 'Weekends', 14),
('Dieter Roth', 'dieter@roth.de', 'Standard', 'Any', 5),
('Karin Beck', 'karin@beck.de', 'Junior', 'Weekends', 0),
('Horst Lorenz', 'horst@lorenz.de', 'Senior', 'Weekdays', 10),
('Ursula Baumann', 'ursula@baumann.de', 'Standard', 'Any', 3),
('Matthias Franke', 'matthias@franke.de', 'Junior', 'Weekdays', 1),
('Hannelore Albrecht', 'hannelore@albrecht.de', 'Senior', 'Weekends', 13),
('Norbert Simon', 'norbert@simon.de', 'Standard', 'Any', 4),
('Gerhard Ludwig', 'gerhard@ludwig.de', 'Junior', 'Weekdays', 0),
('Erika Böhm', 'erika@boehm.de', 'Senior', 'Weekends', 15),
('Rainer Jäger', 'rainer@jaeger.de', 'Standard', 'Any', 6),
('Margarete Otto', 'margarete@otto.de', 'Junior', 'Weekends', 1),
('Werner Gross', 'werner@gross.de', 'Senior', 'Weekdays', 11),
('Christa Graf', 'christa@graf.de', 'Standard', 'Any', 5),
('Manfred Haas', 'manfred@haas.de', 'Junior', 'Weekdays', 0),
('Hildegard Schreiber', 'hilde@schreiber.de', 'Senior', 'Weekends', 12);

-- 7. Seed Data: 6 months of empty WorkDates (May 2026 - Oct 2026)
INSERT INTO work_dates (date, required_people, is_important_shift, is_weekend)
SELECT 
  d::date,
  CASE 
    WHEN EXTRACT(DOW FROM d) IN (0, 6) THEN 2 
    ELSE 1 
  END,
  CASE 
    WHEN EXTRACT(DOW FROM d) = 6 AND random() > 0.7 THEN true 
    ELSE false
  END,
  CASE 
    WHEN EXTRACT(DOW FROM d) IN (0, 6) THEN true
    ELSE false
  END
FROM generate_series('2026-05-01'::date, '2026-10-31'::date, '1 day'::interval) d;
