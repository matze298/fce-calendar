-- ==========================================
-- Access control: admin predicate, per-table policies, explicit grants,
-- the registration claim trigger, and the member read model.
-- ==========================================

-- A policy on members that selects from members raises
-- "infinite recursion detected in policy for relation members". SECURITY DEFINER runs as the
-- owner, so the read inside this function is not subject to RLS and nothing recurses.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.members
     WHERE auth_id = auth.uid()
       AND is_admin
       AND is_approved
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- members. Two permissive SELECT policies are OR'd by Postgres, which is what gives an admin
-- every row and a member exactly one. Kept separate so each can be read and tested on its own.
DROP POLICY IF EXISTS "Anyone can view members" ON members;
DROP POLICY IF EXISTS "Admins can do everything on members" ON members;
DROP POLICY IF EXISTS "Members read their own row" ON members;
DROP POLICY IF EXISTS "Admins read all members" ON members;
DROP POLICY IF EXISTS "Admins insert members" ON members;
DROP POLICY IF EXISTS "Admins update members" ON members;
DROP POLICY IF EXISTS "Admins delete members" ON members;

CREATE POLICY "Members read their own row" ON members
  FOR SELECT TO authenticated USING (auth_id = auth.uid());
CREATE POLICY "Admins read all members" ON members
  FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Admins insert members" ON members
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "Admins update members" ON members
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins delete members" ON members
  FOR DELETE TO authenticated USING (public.is_admin());

-- work_dates
DROP POLICY IF EXISTS "Anyone can view work_dates" ON work_dates;
DROP POLICY IF EXISTS "Admins can do everything on work_dates" ON work_dates;
DROP POLICY IF EXISTS "Admins manage work_dates" ON work_dates;

CREATE POLICY "Admins manage work_dates" ON work_dates
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- assignments
DROP POLICY IF EXISTS "Anyone can view assignments" ON assignments;
DROP POLICY IF EXISTS "Anyone can insert assignments" ON assignments;
DROP POLICY IF EXISTS "Anyone can delete assignments" ON assignments;
DROP POLICY IF EXISTS "Admins can do everything on assignments" ON assignments;
DROP POLICY IF EXISTS "Admins manage assignments" ON assignments;

CREATE POLICY "Admins manage assignments" ON assignments
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- settings. No INSERT or DELETE: the table carries CHECK (id = 1) and the settings page only
-- ever updates the single seeded row.
DROP POLICY IF EXISTS "Anyone can view settings" ON settings;
DROP POLICY IF EXISTS "Admins can do everything on settings" ON settings;
DROP POLICY IF EXISTS "Admins read settings" ON settings;
DROP POLICY IF EXISTS "Admins update settings" ON settings;

CREATE POLICY "Admins read settings" ON settings
  FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Admins update settings" ON settings
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Privileges are a separate layer from policies: a policy can only permit what a grant already
-- allows. Ambient default privileges give authenticated no SELECT on these tables, so the grant
-- is stated here rather than inherited, and the model behaves identically everywhere.
GRANT SELECT, INSERT, UPDATE, DELETE
   ON TABLE members, work_dates, assignments, settings
   TO authenticated;
REVOKE ALL ON TABLE members, work_dates, assignments, settings FROM anon;
