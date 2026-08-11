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
