-- ==========================================
-- The member read model: the whole published plan, with the names on each date.
-- ==========================================

DROP VIEW IF EXISTS public.my_shift_roster;

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
CREATE OR REPLACE VIEW public.published_schedule
WITH (security_barrier = true) AS
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
   AND EXISTS (
       SELECT 1 FROM members me
        WHERE me.auth_id = auth.uid()
          AND me.is_approved
   );

REVOKE ALL ON TABLE public.published_schedule FROM anon, authenticated;
GRANT SELECT ON TABLE public.published_schedule TO authenticated;

-- Without this, PostgREST keeps answering PGRST205 for the dropped and created views above until
-- it reloads its schema cache on its own. NOTIFY inside a transaction is delivered at commit, so
-- this fires only once the view changes above are actually in effect.
NOTIFY pgrst, 'reload schema';
