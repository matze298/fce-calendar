BEGIN;
SELECT plan(3);

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

SELECT * FROM finish();
ROLLBACK;
