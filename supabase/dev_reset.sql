-- ==========================================
-- DESTRUCTIVE. Drops every table and every row in it, with no backup.
-- Only for resetting a local or throwaway database. Never run this against
-- a database holding real member records.
-- ==========================================

DROP TABLE IF EXISTS assignments CASCADE;
DROP TABLE IF EXISTS work_dates CASCADE;
DROP TABLE IF EXISTS members CASCADE;
DROP TABLE IF EXISTS settings CASCADE;
DROP TABLE IF EXISTS registrations CASCADE;

DROP TYPE IF EXISTS seniority_type CASCADE;
DROP TYPE IF EXISTS availability_type CASCADE;
DROP TYPE IF EXISTS assignment_status CASCADE;
