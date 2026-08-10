BEGIN;
SELECT plan(42);

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

-- THEN they read exactly one members row, their own
SELECT is((SELECT count(*) FROM members), 1::bigint, 'member reads exactly one members row');
SELECT is((SELECT email FROM members), 'pgtap.member@example.com', 'the row a member reads is their own');

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

-- THEN they read past their own row, and reach the configuration tables
SELECT ok((SELECT count(*) FROM members) > 1, 'admin reads more than their own row');
SELECT ok((SELECT count(*) FROM work_dates) > 0, 'admin reads work_dates');
SELECT ok((SELECT count(*) FROM settings) = 1, 'admin reads the settings row');

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

-- THEN every locked table refuses outright, because anon holds no grant at all
SELECT throws_ok('SELECT count(*) FROM members',     '42501', NULL, 'anon is refused on members');
SELECT throws_ok('SELECT count(*) FROM assignments', '42501', NULL, 'anon is refused on assignments');
SELECT throws_ok('SELECT count(*) FROM work_dates',  '42501', NULL, 'anon is refused on work_dates');

RESET ROLE;

-- GIVEN the reminder cron authenticated as service_role
SET LOCAL ROLE service_role;
-- WHEN it runs the join it uses to find who to email
-- THEN the query succeeds, because BYPASSRLS exempts service_role from every policy above but
-- not from the underlying table privilege, which is granted separately
SELECT lives_ok(
  $$SELECT a.id, m.email FROM assignments a JOIN members m ON m.id = a.member_id$$,
  'service_role can run the cron''s read join');
RESET ROLE;

-- GIVEN a new auth account carrying first and last name metadata
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001', 'pgtap.neu@example.com',
   '{"first_name":"Neu","last_name":"Mitglied"}'::jsonb);

-- THEN a claim exists, carrying the address from the auth row rather than a form field
SELECT is((SELECT email FROM registrations WHERE auth_id = 'bbbbbbbb-0000-0000-0000-000000000001'),
          'pgtap.neu@example.com', 'the claim carries the authoritative address');
SELECT is((SELECT first_name || ' ' || last_name FROM registrations
            WHERE auth_id = 'bbbbbbbb-0000-0000-0000-000000000001'),
          'Neu Mitglied', 'the claim carries the submitted names');

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

-- THEN exactly one claim remains for that auth_id, the original, not a second one
SELECT is((SELECT count(*) FROM registrations WHERE auth_id = 'bbbbbbbb-0000-0000-0000-000000000003'),
          1::bigint, 'the conflicting insert leaves exactly one claim');

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
-- THEN they can review claims
SELECT ok((SELECT count(*) FROM registrations) > 0, 'admin reads registrations');

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

-- GIVEN also an approved member holding nothing, and an auth account for them
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000004', 'pgtap.leer@example.com',
   '{"first_name":"Leer","last_name":"Ohne"}'::jsonb);

INSERT INTO members (id, auth_id, name, email, is_admin, is_approved) VALUES
  ('eeeeeeee-0000-0000-0000-000000000001', NULL, 'Kol Lege', 'pgtap.kollege@example.com', false, true),
  ('eeeeeeee-0000-0000-0000-000000000002', NULL, 'Ent Wurf', 'pgtap.entwurf@example.com', false, true),
  ('eeeeeeee-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000004',
   'Leer Ohne', 'pgtap.leer@example.com', false, true);

INSERT INTO assignments (member_id, workdate_id, status)
SELECT m.id, 'dddddddd-0000-0000-0000-000000000001', 'Published'
  FROM members m WHERE m.email = 'pgtap.member@example.com';

-- The unapproved member holds a published shift, so a zero roster result can only come from
-- the is_approved filter and not from an absence of assignments.
INSERT INTO assignments (member_id, workdate_id, status)
SELECT m.id, 'dddddddd-0000-0000-0000-000000000002', 'Published'
  FROM members m WHERE m.email = 'pgtap.unapproved@example.com';

INSERT INTO assignments (member_id, workdate_id, status) VALUES
  ('eeeeeeee-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', 'Published'),
  ('eeeeeeee-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000002', 'Published'),
  ('eeeeeeee-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000001', 'Draft');

-- GIVEN a fifth approved member whose only assignment on the shared date is a Draft, not a
-- Published one, distinct from Ent Wurf, who is never a JWT subject in this suite
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000005', 'pgtap.eigenerentwurf@example.com',
   '{"first_name":"Eigener","last_name":"Entwurf"}'::jsonb);

INSERT INTO members (id, auth_id, name, email, is_admin, is_approved) VALUES
  ('eeeeeeee-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000005',
   'Eigener Entwurf', 'pgtap.eigenerentwurf@example.com', false, true);

INSERT INTO assignments (member_id, workdate_id, status) VALUES
  ('eeeeeeee-0000-0000-0000-000000000004', 'dddddddd-0000-0000-0000-000000000001', 'Draft');

-- WHEN the member reads their roster
SELECT set_config('request.jwt.claims',
                  json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000002',
                                    'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

-- THEN they see themselves and the colleague on their own date, and nobody else
SELECT set_eq(
  'SELECT member_name FROM my_shift_roster',
  ARRAY['Mem Ber', 'Kol Lege'],
  'the roster lists the member and the colleague sharing their date');

-- THEN only their own date appears, so a colleague's unrelated shift stays private
SELECT is((SELECT count(DISTINCT workdate_id) FROM my_shift_roster), 1::bigint,
          'the roster covers only dates the member works');
SELECT set_eq('SELECT DISTINCT date::text FROM my_shift_roster', ARRAY['2099-01-10'],
              'the roster names the correct date');

-- THEN a drafted person is absent, so an unpublished plan cannot tell anyone they are working
SELECT is((SELECT count(*) FROM my_shift_roster WHERE member_name = 'Ent Wurf'), 0::bigint,
          'a drafted assignment does not appear on the roster');

RESET ROLE;

-- WHEN a member whose only assignment on that date is a Draft reads the roster
SELECT set_config('request.jwt.claims',
                  json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000005',
                                    'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
-- THEN it is empty, so a draft plan does not tell them they are working alongside a colleague
SELECT is((SELECT count(*) FROM my_shift_roster), 0::bigint,
          'a member whose own assignment is a draft sees an empty roster');
RESET ROLE;

-- WHEN an approved member holding no assignment at all reads the roster
SELECT set_config('request.jwt.claims',
                  json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000004',
                                    'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
-- THEN it is empty rather than showing the whole club
SELECT is((SELECT count(*) FROM my_shift_roster), 0::bigint,
          'an approved member with no shifts sees an empty roster');
RESET ROLE;

-- WHEN a member who has not been approved reads the roster, while holding a published shift
SELECT set_config('request.jwt.claims',
                  json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000003',
                                    'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
-- THEN it is empty, so a pending account learns nothing from a stray assignment
SELECT is((SELECT count(*) FROM my_shift_roster), 0::bigint,
          'an unapproved member sees an empty roster despite holding a shift');
RESET ROLE;

-- WHEN an authenticated caller's JWT carries no sub claim at all
SELECT set_config('request.jwt.claims', '{"role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
-- THEN the roster is empty, so a missing identity does not fall through to every row in the database
SELECT is((SELECT count(*) FROM my_shift_roster), 0::bigint,
          'an authenticated caller with no sub claim sees an empty roster');
RESET ROLE;

-- GIVEN an unauthenticated visitor
SET LOCAL ROLE anon;
-- THEN the view is refused, so the roster is not a way around the members table
SELECT throws_ok('SELECT count(*) FROM my_shift_roster', '42501', NULL,
                 'anon is refused on the roster');
RESET ROLE;

-- THEN no email address is reachable through the view, which is why it exists at all
SELECT hasnt_column('public', 'my_shift_roster', 'email',
                    'the roster exposes no email column');

SELECT * FROM finish();
ROLLBACK;
