BEGIN;
SELECT plan(50);

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

-- GIVEN an approved member who holds no assignment of their own at all. Every other approved-member
-- assertion above runs under someone who also has a Published assignment, so passing there could
-- equally be explained by a narrower, own-dates-only predicate. This is the one caller who can only
-- see anything if the gate is genuinely club wide.
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000006', 'pgtap.ohnedienst@example.com',
   '{"first_name":"Ohne","last_name":"Dienst"}'::jsonb);

INSERT INTO members (id, auth_id, name, email, is_admin, is_approved) VALUES
  ('eeeeeeee-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000006',
   'Ohne Dienst', 'pgtap.ohnedienst@example.com', false, true);

-- WHEN that member reads the published schedule
SELECT set_config('request.jwt.claims',
                  json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000006',
                                    'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

-- THEN they see the published plan anyway, since it does not depend on their own assignments
SELECT ok((SELECT count(*) FROM published_schedule) > 0,
          'a member with no assignments of their own still sees the published schedule');
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

-- GIVEN one calendar date that needs staffing in two Bereiche
INSERT INTO work_dates (id, date, bereich, name, start_time, required_people) VALUES
  ('ffffffff-0000-0000-0000-000000000001', '2099-03-01', 'Sportheim-Bewirtung', 'Heimspiel', '15:30', 2),
  ('ffffffff-0000-0000-0000-000000000002', '2099-03-01', 'Sportplatz-Ordner',   'Heimspiel', '14:00', 3);

-- THEN both rows exist, which UNIQUE(date) alone would have refused
SELECT is((SELECT count(*) FROM work_dates WHERE date = '2099-03-01'), 2::bigint,
          'one date carries staffing for two Bereiche');

-- THEN a second row for the same date AND the same Bereich is still refused
SELECT throws_ok(
  $$INSERT INTO work_dates (date, bereich) VALUES ('2099-03-01', 'Sportheim-Bewirtung')$$,
  '23505', NULL, 'the same date and Bereich cannot be entered twice');

-- WHEN an upsert names the real unique constraint, (date, bereich), as its conflict target
-- THEN it succeeds, updating the existing row rather than raising
SELECT lives_ok(
  $$INSERT INTO work_dates (date, bereich, required_people) VALUES ('2099-03-01', 'Sportheim-Bewirtung', 5)
      ON CONFLICT (date, bereich) DO UPDATE SET required_people = excluded.required_people$$,
  'an upsert targeting (date, bereich) succeeds');

-- WHEN an upsert names only the old (date) column as its conflict target, the way the admin UI
-- did before this migration
-- THEN Postgres refuses it outright, because UNIQUE (date) no longer exists and a conflict target
-- must match an existing unique constraint exactly rather than a subset of one
SELECT throws_ok(
  $$INSERT INTO work_dates (date, bereich) VALUES ('2099-03-01', 'Sportheim-Bewirtung')
      ON CONFLICT (date) DO UPDATE SET required_people = excluded.required_people$$,
  '42P10', NULL, 'an upsert targeting only (date) is refused');

-- THEN every date that existed before this migration is a Sportheim-Bewirtung date, which is what
-- the column default backfilled and what is historically true
SELECT is((SELECT count(*) FROM work_dates WHERE date < '2099-01-01' AND bereich <> 'Sportheim-Bewirtung'),
          0::bigint,
          'pre-existing dates all belong to Sportheim-Bewirtung');

-- THEN the member read model carries the Bereich, so a consumer can group by it
SELECT has_column('public', 'published_schedule', 'bereich',
                  'the schedule exposes the Bereich');

-- GIVEN a brand new member, created the way the admin UI creates one
INSERT INTO members (id, name, email, is_approved) VALUES
  ('eeeeeeee-0000-0000-0000-000000000006', 'Neu Bereich', 'pgtap.neubereich@example.com', true);

-- THEN they are available for exactly Sportheim-Bewirtung and nothing else
SELECT set_eq(
  $$SELECT bereich::text FROM member_bereiche
     WHERE member_id = 'eeeeeeee-0000-0000-0000-000000000006'$$,
  ARRAY['Sportheim-Bewirtung'],
  'a new member defaults to Sportheim-Bewirtung only');

-- WHEN an admin adds a second Bereich to that member by hand, alongside their default one
INSERT INTO member_bereiche (member_id, bereich)
  VALUES ('eeeeeeee-0000-0000-0000-000000000006', 'Fruehschoppen');
-- THEN both rows are present, so the member now holds two Bereiche
SELECT is((SELECT count(*) FROM member_bereiche
            WHERE member_id = 'eeeeeeee-0000-0000-0000-000000000006'),
          2::bigint,
          'an admin can add a second Bereich to a member');

-- GIVEN a brand new member and their default Bereich row, inserted together in a single
-- data-modifying CTE
-- WHEN that statement runs. Both explicit inserts complete before the row-level AFTER trigger
-- fires, since AFTER ROW triggers are queued to statement end, so the trigger's own default-row
-- insert for the same member_id and Bereich collides with the one the CTE already made
-- THEN the statement still succeeds, because ON CONFLICT DO NOTHING in grant_default_bereich()
-- absorbs that collision rather than raising
SELECT lives_ok(
  $$WITH new_member AS (
      INSERT INTO members (id, name, email, is_approved)
      VALUES ('eeeeeeee-0000-0000-0000-000000000008', 'Schon Da', 'pgtap.schonda@example.com', true)
      RETURNING id
    ), new_bereich AS (
      INSERT INTO member_bereiche (member_id, bereich)
      SELECT id, 'Sportheim-Bewirtung' FROM new_member
      RETURNING member_id
    )
    SELECT * FROM new_bereich$$,
  'inserting a member and their default Bereich row in one statement does not fail');

-- THEN every member that existed before this migration was backfilled
SELECT is(
  (SELECT count(*) FROM members m
    WHERE NOT EXISTS (SELECT 1 FROM member_bereiche mb
                       WHERE mb.member_id = m.id
                         AND mb.bereich = 'Sportheim-Bewirtung')),
  0::bigint,
  'every member is available for Sportheim-Bewirtung');

-- GIVEN a member with no Bereich row at all, the state every one of the club's real members was
-- in before this migration ran, since the trigger did not exist yet to give them one
INSERT INTO members (id, name, email, is_approved) VALUES
  ('eeeeeeee-0000-0000-0000-000000000007', 'Vor Migration', 'pgtap.vormigration@example.com', true);
DELETE FROM member_bereiche WHERE member_id = 'eeeeeeee-0000-0000-0000-000000000007';

-- WHEN a statement matching the migration's backfill runs, re-inserting the default Bereich for
-- every member, including the ones who already have it. This is a deliberate copy of that
-- statement's text, not an execution of the migration's own copy: db reset always applies the
-- migration before the seed, so no member here is ever observably without a Bereich row at any
-- point this suite can see, which makes the migration's actual backfill statement itself
-- untestable from within this file. What is covered below is the statement's logic in isolation,
-- that it restores a missing row and tolerates every already-populated member without raising.
INSERT INTO member_bereiche (member_id, bereich)
SELECT id, 'Sportheim-Bewirtung' FROM members
ON CONFLICT DO NOTHING;

-- THEN the member who had no row has it again, which is what gives the club's pre-existing
-- members a Bereich on the real database
SELECT is((SELECT count(*) FROM member_bereiche
            WHERE member_id = 'eeeeeeee-0000-0000-0000-000000000007'),
          1::bigint,
          'the backfill gives an existing member without a Bereich the default one');

-- GIVEN an approved non-admin member
SELECT set_config('request.jwt.claims',
                  json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000002',
                                    'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

-- THEN they read their own availability, which PR 2's checkboxes need
SELECT ok((SELECT count(*) FROM member_bereiche) >= 1,
          'a member reads their own Bereich availability');

-- THEN they read nobody else's
SELECT is(
  (SELECT count(*) FROM member_bereiche
    WHERE member_id <> (SELECT id FROM members WHERE auth_id = 'aaaaaaaa-0000-0000-0000-000000000002')),
  0::bigint,
  'a member reads no other member''s availability');

RESET ROLE;

-- GIVEN an unauthenticated visitor
SET LOCAL ROLE anon;
-- THEN the table refuses outright, because anon holds no grant
SELECT throws_ok('SELECT count(*) FROM member_bereiche', '42501', NULL,
                 'anon is refused on member_bereiche');
RESET ROLE;

-- GIVEN a member assigned to the Sportheim shift on a date that also needs marshals
INSERT INTO work_dates (id, date, bereich, required_people) VALUES
  ('ffffffff-0000-0000-0000-000000000003', '2099-03-08', 'Sportplatz-Ordner', 1);

INSERT INTO assignments (member_id, workdate_id, status)
SELECT m.id, 'ffffffff-0000-0000-0000-000000000001', 'Published'
  FROM members m WHERE m.email = 'pgtap.member@example.com';

-- THEN they cannot also be given the marshal duty on that same date
SELECT throws_ok(
  $$INSERT INTO assignments (member_id, workdate_id, status)
    SELECT m.id, 'ffffffff-0000-0000-0000-000000000002', 'Draft'
      FROM members m WHERE m.email = 'pgtap.member@example.com'$$,
  '23505', NULL, 'a member cannot hold two Bereiche on one date');

-- THEN a different member can take that marshal duty, so the rule is about the person and not
-- about the date being full
SELECT lives_ok(
  $$INSERT INTO assignments (member_id, workdate_id, status)
    VALUES ('eeeeeeee-0000-0000-0000-000000000001',
            'ffffffff-0000-0000-0000-000000000002', 'Draft')$$,
  'another member can take the same date in a different Bereich');

-- THEN the same member is free on a different date, so the rule is not blocking everything
SELECT lives_ok(
  $$INSERT INTO assignments (member_id, workdate_id, status)
    SELECT m.id, 'ffffffff-0000-0000-0000-000000000003', 'Draft'
      FROM members m WHERE m.email = 'pgtap.member@example.com'$$,
  'the same member takes a duty on a different date');

SELECT * FROM finish();
ROLLBACK;
