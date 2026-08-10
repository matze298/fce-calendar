-- ==========================================
-- Registrations: a login claiming to belong to a member, awaiting an admin decision.
-- Kept out of the members table because members.email is UNIQUE, so a person registering
-- with the address the club already holds could not also have a pending member row.
-- Idempotent, so it is safe to run against a populated database.
-- ==========================================

CREATE TABLE IF NOT EXISTS registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id UUID UNIQUE NOT NULL,
  email TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE registrations ENABLE ROW LEVEL SECURITY;

-- INSERT includes anon because with email confirmation enabled signUp returns no session,
-- so the registering client is still anonymous. A claim grants nothing until it is resolved.
DROP POLICY IF EXISTS "Anyone can submit a registration" ON registrations;
CREATE POLICY "Anyone can submit a registration" ON registrations
  FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Deliberately not granted to anon, unlike the older tables, so the claim list is not public.
DROP POLICY IF EXISTS "Authenticated can read registrations" ON registrations;
CREATE POLICY "Authenticated can read registrations" ON registrations
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can delete registrations" ON registrations;
CREATE POLICY "Authenticated can delete registrations" ON registrations
  FOR DELETE TO authenticated USING (true);
