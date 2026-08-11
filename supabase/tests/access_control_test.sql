BEGIN;
SELECT plan(32);

-- GIVEN three auth accounts: an approved admin, an approved plain member, and an admin
-- whose account has not been approved.
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'pgtap.admin@example.com',     '{"first_name":"Ada","last_name":"Admin"}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'pgtap.member@example.com',    '{"first_name":"Mem","last_name":"Ber"}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'pgtap.unapproved@example.com', '{"first_name":"Uno","last_name":"Approved"}'::jsonb);

INSERT INTO members (auth_id, name, email, is_admin, is_approved) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Ada Admin',    'pgtap.admin@example.com',      true,  true),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Mem Ber',      'pgtap.member@example.com',     false, true),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'Uno Approved', 'pgtap.unapproved@example.com', true,  false);

-- WHEN is_admin() is evaluated for the approved admin
SELECT set_config('request.jwt.claims',
                  json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000001')::text, true);
-- THEN it is true
SELECT ok(public.is_admin(), 'is_admin is true for an approved admin');

-- WHEN is_admin() is evaluated for an admin who has not been approved
SELECT set_config('request.jwt.claims',
                  json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000003')::text, true);
-- THEN it is false, because the flag alone is not enough
SELECT ok(NOT public.is_admin(), 'is_admin is false when is_approved is false');

-- WHEN there is no authenticated user at all
SELECT set_config('request.jwt.claims', '{}', true);
-- THEN it is false rather than null, so a policy using it cannot evaluate to null
SELECT ok(NOT public.is_admin(), 'is_admin is false for an unauthenticated caller');

-- GIVEN an approved non-admin member
SELECT set_config('request.jwt.claims',
                  json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000002',
                                    'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

-- THEN the only row they read is their own
SELECT set_eq('SELECT email FROM members', ARRAY['pgtap.member@example.com'],
              'member reads exactly one members row, their own');

-- THEN the other tables are empty for them. They hold the DML grant, so RLS filters rather
-- than refusing, which is why these assert counts and not errors.
SELECT is((SELECT count(*) FROM work_dates), 0::bigint, 'member reads no work_dates');
SELECT is((SELECT count(*) FROM assignments), 0::bigint, 'member reads no assignments');
SELECT is((SELECT count(*) FROM settings), 0::bigint, 'member reads no settings');

-- WHEN a member tries to make themselves an administrator
-- THEN no row is affected, which is the whole point of this task
WITH u AS (
  UPDATE members SET is_admin = true
   WHERE auth_id = 'aaaaaaaa-0000-0000-0000-000000000002' RETURNING 1
)
SELECT is((SELECT count(*) FROM u), 0::bigint, 'member cannot grant themselves admin');

-- THEN a member cannot create a member either
SELECT throws_ok(
  $$INSERT INTO members (name, email) VALUES ('Sneaky', 'pgtap.sneaky@example.com')$$,
  '42501', NULL, 'member cannot insert a member');

-- THEN a member cannot truncate the table either, a privilege no policy can filter
SELECT throws_ok(
  $$TRUNCATE TABLE members$$,
  '42501', NULL, 'member cannot truncate members');

RESET ROLE;

-- GIVEN an approved admin
SELECT set_config('request.jwt.claims',
                  json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000001',
                                    'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

-- THEN they read past their own row
SELECT ok((SELECT count(*) FROM members) > 1, 'admin reads more than their own row');

-- THEN an admin can update another member
WITH u AS (
  UPDATE members SET historical_shifts = historical_shifts
   WHERE email = 'pgtap.member@example.com' RETURNING 1
)
SELECT is((SELECT count(*) FROM u), 1::bigint, 'admin can update another member');

-- THEN an admin can create a member, the action behind linking a registration claim
WITH i AS (
  INSERT INTO members (name, email, is_admin, is_approved)
  VALUES ('Neu Erstellt', 'pgtap.admininsert@example.com', false, true)
  RETURNING 1
)
SELECT is((SELECT count(*) FROM i), 1::bigint, 'admin can insert a member');

-- THEN an admin can delete a member, the action behind the erasure button
WITH d AS (
  DELETE FROM members WHERE email = 'pgtap.admininsert@example.com' RETURNING 1
)
SELECT is((SELECT count(*) FROM d), 1::bigint, 'admin can delete a member');

-- THEN an admin can create a work_date
WITH i AS (
  INSERT INTO work_dates (date) VALUES ('2099-06-01') RETURNING 1
)
SELECT is((SELECT count(*) FROM i), 1::bigint, 'admin can insert a work_date');

DELETE FROM work_dates WHERE date = '2099-06-01';

-- THEN an admin can update the settings row
WITH u AS (
  UPDATE settings SET default_start_time_mon_thu = default_start_time_mon_thu
   WHERE id = 1 RETURNING 1
)
SELECT is((SELECT count(*) FROM u), 1::bigint, 'admin can update settings');

RESET ROLE;

-- GIVEN an unauthenticated visitor
SET LOCAL ROLE anon;

-- THEN the locked tables refuse outright, because anon holds no grant at all. All are covered by
-- one revoke statement, so the table holding email addresses stands for the rest.
SELECT throws_ok('SELECT count(*) FROM members', '42501', NULL, 'anon is refused on members');

RESET ROLE;

-- GIVEN the reminder cron authenticated as service_role
SET LOCAL ROLE service_role;
-- WHEN it runs the join it uses to find who to email
-- THEN the query succeeds, because BYPASSRLS exempts service_role from every policy above but
-- not from the underlying table privilege, which is granted separately
-- All three tables the cron reaches are joined here. Leaving one out would let a future edit drop
-- its grant while this assertion still passed.
SELECT lives_ok(
  $$SELECT a.id, m.email, wd.date
      FROM assignments a
      JOIN members    m  ON m.id  = a.member_id
      JOIN work_dates wd ON wd.id = a.workdate_id$$,
  'service_role can run the cron''s read join');
RESET ROLE;

-- GIVEN a new auth account carrying first and last name metadata
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001', 'pgtap.neu@example.com',
   '{"first_name":"Neu","last_name":"Mitglied"}'::jsonb);

-- THEN a claim exists, carrying the address from the auth row rather than a form field, along
-- with the submitted names
SELECT is((SELECT email || '|' || first_name || ' ' || last_name FROM registrations
            WHERE auth_id = 'bbbbbbbb-0000-0000-0000-000000000001'),
          'pgtap.neu@example.com|Neu Mitglied', 'the claim carries the authoritative address and the submitted names');

-- WHEN an auth account is created with no metadata at all, as a dashboard invite does
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000002', 'pgtap.ohne@example.com', '{}'::jsonb);

-- THEN the insert succeeds with empty names rather than failing the account creation
SELECT is((SELECT first_name || '|' || last_name FROM registrations
            WHERE auth_id = 'bbbbbbbb-0000-0000-0000-000000000002'),
          '|', 'a missing name yields empty strings, not a failed signup');

-- GIVEN a registration claim that already exists for an auth_id, as happens when a repeat
-- signUp for the same unconfirmed address later fires the trigger a second time
INSERT INTO registrations (auth_id, email, first_name, last_name) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000003', 'pgtap.wiederholt@example.com', 'Wieder', 'Holt');

-- WHEN an auth.users row with that same id is inserted
-- THEN the trigger does not raise on the conflicting auth_id
SELECT lives_ok(
  $$INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
      ('bbbbbbbb-0000-0000-0000-000000000003', 'pgtap.wiederholt@example.com',
       '{"first_name":"Wieder","last_name":"Holt"}'::jsonb)$$,
  'a repeat auth.users insert for an existing claim does not raise');

-- GIVEN an approved non-admin member
SELECT set_config('request.jwt.claims',
                  json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000002',
                                    'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
-- THEN they cannot read other people's registration claims
SELECT is((SELECT count(*) FROM registrations), 0::bigint, 'member reads no registrations');
RESET ROLE;

-- GIVEN an approved admin
SELECT set_config('request.jwt.claims',
                  json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000001',
                                    'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

-- THEN an admin can delete a claim, the action that discards a rejected signup
WITH d AS (
  DELETE FROM registrations WHERE auth_id = 'bbbbbbbb-0000-0000-0000-000000000002' RETURNING 1
)
SELECT is((SELECT count(*) FROM d), 1::bigint, 'admin can delete a registration');

RESET ROLE;

-- GIVEN an unauthenticated visitor
SET LOCAL ROLE anon;
-- THEN they cannot forge or spam a claim, which was the last anon write in the schema
SELECT throws_ok(
  $$INSERT INTO registrations (auth_id, email, first_name, last_name)
    VALUES ('cccccccc-0000-0000-0000-000000000001', 'pgtap.forged@example.com', 'F', 'G')$$,
  '42501', NULL, 'anon cannot insert a registration');
RESET ROLE;

-- GIVEN two work dates, where the member and a colleague share the first, the colleague alone
-- holds the second, and a third person is only drafted onto the first
INSERT INTO work_dates (id, date, name, start_time) VALUES
  ('dddddddd-0000-0000-0000-000000000001', '2099-01-10', 'Heimspiel', '15:30'),
  ('dddddddd-0000-0000-0000-000000000002', '2099-01-17', 'Auswaertsspiel', '20:00');

INSERT INTO members (id, auth_id, name, email, is_admin, is_approved) VALUES
  ('eeeeeeee-0000-0000-0000-000000000001', NULL, 'Kol Lege', 'pgtap.kollege@example.com', false, true),
  ('eeeeeeee-0000-0000-0000-000000000002', NULL, 'Ent Wurf', 'pgtap.entwurf@example.com', false, true);

INSERT INTO assignments (member_id, workdate_id, status)
SELECT m.id, 'dddddddd-0000-0000-0000-000000000001', 'Published'
  FROM members m WHERE m.email = 'pgtap.member@example.com';

-- The unapproved member holds a published shift, so a zero schedule result can only come from
-- the is_approved filter and not from an absence of assignments.
INSERT INTO assignments (member_id, workdate_id, status)
SELECT m.id, 'dddddddd-0000-0000-0000-000000000002', 'Published'
  FROM members m WHERE m.email = 'pgtap.unapproved@example.com';

INSERT INTO assignments (member_id, workdate_id, status) VALUES
  ('eeeeeeee-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', 'Published'),
  ('eeeeeeee-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000002', 'Published'),
  ('eeeeeeee-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000001', 'Draft');

-- WHEN an approved member reads the published schedule
SELECT set_config('request.jwt.claims',
                  json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000002',
                                    'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

-- THEN they see a date they are not assigned to, which is the point of the widened read model.
-- Mem Ber holds nothing on 2099-01-17, so this row can only come from the plan being club wide.
SELECT is((SELECT count(*) FROM published_schedule
            WHERE date = '2099-01-17' AND member_name = 'Kol Lege'),
          1::bigint,
          'an approved member sees a published date they are not assigned to');

-- THEN every published person on the fixture dates is listed. Scoped to 2099 so a future seed
-- gaining assignments cannot change the expected set.
SELECT set_eq(
  $$SELECT DISTINCT member_name FROM published_schedule WHERE date >= '2099-01-01'$$,
  ARRAY['Mem Ber', 'Kol Lege', 'Uno Approved'],
  'the schedule lists every published person on the fixture dates');

-- THEN a drafted assignment is absent, so an unpublished plan cannot tell anyone they are working
SELECT is((SELECT count(*) FROM published_schedule WHERE member_name = 'Ent Wurf'), 0::bigint,
          'a drafted assignment does not appear on the schedule');

RESET ROLE;

-- WHEN a member who has not been approved reads the schedule, while holding a published shift
SELECT set_config('request.jwt.claims',
                  json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000003',
                                    'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
-- THEN it is empty, so a pending account learns nothing
SELECT is((SELECT count(*) FROM published_schedule), 0::bigint,
          'an unapproved member sees an empty schedule despite holding a shift');
RESET ROLE;

-- WHEN an authenticated caller with no members row at all reads the schedule. This is the state of
-- someone who has registered and whose claim an admin has not yet linked, which is the most common
-- real state for a new account.
SELECT set_config('request.jwt.claims',
                  json_build_object('sub', 'bbbbbbbb-0000-0000-0000-000000000001',
                                    'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
-- THEN it is empty rather than falling through to the whole plan
SELECT is((SELECT count(*) FROM published_schedule), 0::bigint,
          'an authenticated caller with no members row sees an empty schedule');
RESET ROLE;

-- WHEN an authenticated caller carries no sub claim
SELECT set_config('request.jwt.claims', json_build_object('role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
-- THEN it is empty. The 51 seeded members all have auth_id NULL, so a NULL-permissive comparison
-- here would expose the entire plan.
SELECT is((SELECT count(*) FROM published_schedule), 0::bigint,
          'an authenticated caller with no sub claim sees an empty schedule');
RESET ROLE;

-- GIVEN an unauthenticated visitor
SET LOCAL ROLE anon;
-- THEN the view is refused, so it is not a way around the members table
SELECT throws_ok('SELECT count(*) FROM published_schedule', '42501', NULL,
                 'anon is refused on the schedule');
RESET ROLE;

-- THEN no email address is reachable through the view, which is why it exists at all
SELECT hasnt_column('public', 'published_schedule', 'email',
                    'the schedule exposes no email column');

SELECT * FROM finish();
ROLLBACK;
