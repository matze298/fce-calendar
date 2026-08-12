-- ==========================================
-- Bereiche: the three duty areas a work date can belong to, and who is available for each.
-- ==========================================

DO $$ BEGIN
  CREATE TYPE bereich_type AS ENUM ('Sportheim-Bewirtung', 'Fruehschoppen', 'Sportplatz-Ordner');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- The default is what carries existing rows over: every date entered so far is a Sportheim
-- date, so no UPDATE is needed.
ALTER TABLE work_dates
  ADD COLUMN IF NOT EXISTS bereich bereich_type NOT NULL DEFAULT 'Sportheim-Bewirtung';

-- A date-and-Bereich is the unit that gets staffed, so a calendar date may appear once per
-- Bereich. work_dates_date_key is the name Postgres generated for the original UNIQUE (date).
ALTER TABLE work_dates DROP CONSTRAINT IF EXISTS work_dates_date_key;
ALTER TABLE work_dates DROP CONSTRAINT IF EXISTS work_dates_date_bereich_key;
ALTER TABLE work_dates ADD CONSTRAINT work_dates_date_bereich_key UNIQUE (date, bereich);

-- The member read model: the whole published plan, with the names on each date.
--
-- Owned by postgres and left at the default security_invoker = false, so the owner's privileges
-- reach work_dates, assignments and members, all of which are admin only. The WHERE clause below
-- is therefore the security boundary. Setting security_invoker = true would return nothing at all.
--
-- A view rather than wider row policies, because RLS is row level while "the names on a date" is
-- column level: a policy permitting a colleague's members row would serve select=* with the email
-- in it. A view projects columns, so the email is absent rather than filtered.
--
-- security_barrier keeps the planner from evaluating a caller-supplied qual before this view's own
-- quals. Without it a qual pushed below the join and the Published filter can raise an error off a
-- row the view would have hidden, which is a side channel for names and dates on an unpublished
-- draft plan.
--
-- bereich is appended last: CREATE OR REPLACE VIEW can only append columns, never insert one.
CREATE OR REPLACE VIEW public.published_schedule
WITH (security_barrier = true) AS
SELECT wd.id         AS workdate_id,
       wd.date       AS date,
       wd.name       AS event_name,
       wd.start_time AS start_time,
       m.id          AS member_id,
       m.name        AS member_name,
       wd.bereich    AS bereich
  FROM assignments a
  JOIN work_dates wd ON wd.id = a.workdate_id
  JOIN members    m  ON m.id  = a.member_id
 WHERE a.status = 'Published'
   AND EXISTS (
       SELECT 1 FROM members me
        WHERE me.auth_id = auth.uid()
          AND me.is_approved
   );

REVOKE ALL ON TABLE public.published_schedule FROM anon, authenticated;
GRANT SELECT ON TABLE public.published_schedule TO authenticated;

-- Which Bereiche a member is available for. Every member defaults to Sportheim-Bewirtung, the
-- only duty area the club has run so far, and an admin adds or removes rows from there.
CREATE TABLE IF NOT EXISTS member_bereiche (
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  bereich   bereich_type NOT NULL,
  PRIMARY KEY (member_id, bereich)
);

ALTER TABLE member_bereiche ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read their own Bereiche" ON member_bereiche;
DROP POLICY IF EXISTS "Admins manage member_bereiche" ON member_bereiche;

CREATE POLICY "Members read their own Bereiche" ON member_bereiche
  FOR SELECT TO authenticated
  USING (member_id IN (SELECT id FROM members WHERE auth_id = auth.uid()));
CREATE POLICY "Admins manage member_bereiche" ON member_bereiche
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Privileges are a separate layer from policies: ambient default privileges give authenticated no
-- SELECT, so the grant is stated here rather than inherited.
REVOKE ALL ON TABLE member_bereiche FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE member_bereiche TO authenticated;

-- Every member is available for Sportheim-Bewirtung unless an admin says otherwise, and a join
-- table has no column default to express that.
CREATE OR REPLACE FUNCTION public.grant_default_bereich()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.member_bereiche (member_id, bereich)
  VALUES (NEW.id, 'Sportheim-Bewirtung')
  -- A failure inside an AFTER INSERT trigger fails the insert that fired it, so creating a member
  -- must not break because the row is already there.
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_member_created ON members;
CREATE TRIGGER on_member_created AFTER INSERT ON members
  FOR EACH ROW EXECUTE FUNCTION public.grant_default_bereich();

INSERT INTO member_bereiche (member_id, bereich)
SELECT id, 'Sportheim-Bewirtung' FROM members
ON CONFLICT DO NOTHING;

-- One duty per member per calendar date, whatever the Bereich. Two work_dates rows can share a
-- date, so a unique index cannot express this: the check has to join through work_dates.
CREATE OR REPLACE FUNCTION public.reject_double_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  target_date DATE;
BEGIN
  SELECT date INTO target_date FROM public.work_dates WHERE id = NEW.workdate_id;

  IF EXISTS (
    SELECT 1
      FROM public.assignments a
      JOIN public.work_dates wd ON wd.id = a.workdate_id
     WHERE a.member_id = NEW.member_id
       AND wd.date = target_date
  ) THEN
    -- unique_violation so callers already handling 23505 keep working, and so a test can assert a
    -- stable code rather than message text.
    RAISE EXCEPTION 'Mitglied % ist am % bereits eingeteilt', NEW.member_id, target_date
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_assignment_double_booking ON assignments;
CREATE TRIGGER on_assignment_double_booking BEFORE INSERT ON assignments
  FOR EACH ROW EXECUTE FUNCTION public.reject_double_booking();

-- Without this, PostgREST keeps answering PGRST205 for the new table and the changed view until it
-- reloads its schema cache on its own. NOTIFY inside a transaction is delivered at commit, so this
-- fires only once the changes above are in effect.
NOTIFY pgrst, 'reload schema';
