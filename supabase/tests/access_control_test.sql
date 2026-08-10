BEGIN;
SELECT plan(17);

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

RESET ROLE;

-- GIVEN an unauthenticated visitor
SET LOCAL ROLE anon;

-- THEN every locked table refuses outright, because anon holds no grant at all
SELECT throws_ok('SELECT count(*) FROM members',     '42501', NULL, 'anon is refused on members');
SELECT throws_ok('SELECT count(*) FROM assignments', '42501', NULL, 'anon is refused on assignments');
SELECT throws_ok('SELECT count(*) FROM work_dates',  '42501', NULL, 'anon is refused on work_dates');

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
