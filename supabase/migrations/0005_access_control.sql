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
-- allows, and some privileges, such as TRUNCATE, are not filterable by a policy at all. The
-- ambient default privileges leave authenticated holding TRUNCATE, REFERENCES and TRIGGER on
-- these tables, so the revoke has to run before the grant restates exactly the four verbs the
-- app needs, or it would strip the grant made below rather than the ambient leftovers.
REVOKE ALL ON TABLE members, work_dates, assignments, settings FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
   ON TABLE members, work_dates, assignments, settings
   TO authenticated;

-- The reminder cron authenticates as service_role. BYPASSRLS exempts it from every policy above,
-- but not from the privilege layer, so it still needs an explicit read grant, matching its
-- read-only use of these tables.
GRANT SELECT ON TABLE members, work_dates, assignments TO service_role;

-- Creates a registration claim for every new auth account in the same transaction, so every
-- account has exactly one. The address comes from the auth row, not from user input.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.registrations (auth_id, email, first_name, last_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(TRIM(NEW.raw_user_meta_data ->> 'first_name'), ''),
    COALESCE(TRIM(NEW.raw_user_meta_data ->> 'last_name'), '')
  )
  -- A repeat signUp for an existing unconfirmed address returns the same auth user. An
  -- unhandled unique violation in an AFTER INSERT trigger would fail the signup itself.
  ON CONFLICT (auth_id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_auth_user() FROM PUBLIC;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- registrations. No INSERT policy for any role: the trigger is the only writer.
DROP POLICY IF EXISTS "Anyone can submit a registration" ON registrations;
DROP POLICY IF EXISTS "Authenticated can read registrations" ON registrations;
DROP POLICY IF EXISTS "Authenticated can delete registrations" ON registrations;
DROP POLICY IF EXISTS "Admins read registrations" ON registrations;
DROP POLICY IF EXISTS "Admins delete registrations" ON registrations;

CREATE POLICY "Admins read registrations" ON registrations
  FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Admins delete registrations" ON registrations
  FOR DELETE TO authenticated USING (public.is_admin());

REVOKE ALL ON TABLE registrations FROM anon, authenticated;
GRANT SELECT, DELETE ON TABLE registrations TO authenticated;

-- The member read model. RLS is row-level, and "my colleagues' names" is a column-level
-- requirement: a row policy permitting a colleague's members row would serve select=* with the
-- email in it. A view projects columns, so the email is absent rather than filtered.
--
-- Owned by postgres and deliberately left at the default security_invoker = false, so the
-- owner's privileges reach work_dates, assignments and members, all of which are admin-only.
-- The WHERE clause below is therefore the security boundary. Setting security_invoker = true
-- would re-apply RLS and return nothing at all.
CREATE OR REPLACE VIEW public.my_shift_roster AS
SELECT wd.id         AS workdate_id,
       wd.date       AS date,
       wd.name       AS event_name,
       wd.start_time AS start_time,
       m.id          AS member_id,
       m.name        AS member_name
  FROM assignments a
  JOIN work_dates wd ON wd.id = a.workdate_id
  JOIN members    m  ON m.id  = a.member_id
 WHERE a.status = 'Published'
   AND a.workdate_id IN (
       SELECT mine.workdate_id
         FROM assignments mine
         JOIN members me ON me.id = mine.member_id
        WHERE me.auth_id = auth.uid()
          AND me.is_approved
          AND mine.status = 'Published'
   );

REVOKE ALL ON TABLE public.my_shift_roster FROM anon, authenticated;
GRANT SELECT ON TABLE public.my_shift_roster TO authenticated;
