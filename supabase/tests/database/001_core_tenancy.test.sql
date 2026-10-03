-- RLS and integrity tests for 20261003000001_core_tenancy.sql.
-- Assertions are scoped to the fixtures created here, so they hold no
-- matter what other data exists in the dev project.
-- Runs inside a transaction and rolls back: safe against the dev project.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(25);

-- ------------------------------------------------------------
-- Fixtures: four users
-- ------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@test.local',    '{"first_name":"Olivia","last_name":"Owner"}'),
  ('00000000-0000-0000-0000-0000000000a2', 'manager@test.local',  '{"first_name":"Mia"}'),
  ('00000000-0000-0000-0000-0000000000a3', 'pro@test.local',      '{"first_name":"Pablo"}'),
  ('00000000-0000-0000-0000-0000000000a4', 'stranger@test.local', '{"first_name":"Sam"}');

select is(
  (select first_name from user_profiles where user_id = '00000000-0000-0000-0000-0000000000a1'),
  'Olivia',
  'signup trigger creates the user profile from metadata'
);

-- Switch the session to act as a given user (or anon when null).
create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  reset role; -- anon can't SET ROLE authenticated directly
  if p_user is null then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    set local role anon;
  else
    perform set_config('request.jwt.claims',
      json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
    set local role authenticated;
  end if;
end $$;

-- Run a write as the current role and report how many rows it touched
-- (RLS silently filters UPDATE/DELETE instead of raising).
create function pg_temp.affected(p_sql text) returns bigint language plpgsql as $f$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end $f$;

-- New functions get no PUBLIC execute (see migration 0002), so the test
-- roles need explicit grants on these helpers too.
grant execute on function pg_temp.act_as(uuid), pg_temp.affected(text) to anon, authenticated;

-- ------------------------------------------------------------
-- Onboarding
-- ------------------------------------------------------------
select ok(
  not has_function_privilege('anon', 'public.create_organization(text, text, text, text, boolean)', 'execute'),
  'anon has no EXECUTE on create_organization'
);

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
create temp table ids as
  select create_organization('Olivia Nails Ltd', 'Olivia Nails Ponsonby', 'olivia-nails') as location_id;
grant select on ids to anon, authenticated;

select is(
  (select status::text from locations where id = (select location_id from ids)),
  'draft',
  'a new location starts as draft'
);
select is(
  (select count(*) from staff where location_id = (select location_id from ids)
     and user_id = '00000000-0000-0000-0000-0000000000a1'),
  1::bigint,
  'solo owner is added as bookable staff'
);
select is(
  (select display_name from staff where location_id = (select location_id from ids)),
  'Olivia Owner',
  'staff display name comes from the owner profile'
);
select is(
  (select count(*) from memberships where role = 'owner'),
  1::bigint,
  'owner can read their own owner membership'
);

-- Owner cannot touch platform/billing-controlled columns.
select throws_ok(
  $$ update locations set status = 'active' where id = (select location_id from ids) $$,
  '42501', null,
  'owner cannot activate a location directly'
);
select throws_ok(
  $$ update locations set is_verified = true where id = (select location_id from ids) $$,
  '42501', null,
  'owner cannot self-verify'
);
select throws_ok(
  $$ update organizations set billing_status = 'active' $$,
  '42501', null,
  'owner cannot change billing status'
);
select throws_ok(
  $$ select stripe_account_id from locations $$,
  '42501', null,
  'stripe_account_id is not readable through the API'
);

-- Owner sets up the catalog.
select lives_ok(
  $$ insert into services (location_id, name, duration_minutes, price_cents)
     values ((select location_id from ids), 'Gel manicure', 45, 6500) $$,
  'owner can create services'
);

-- Validation
select throws_ok(
  $$ select create_organization('X', 'X', 'dashboard') $$,
  '23514', null,
  'reserved slugs are rejected'
);
select throws_ok(
  $$ select create_organization('X', 'X', 'x-salon', 'Mars/Olympus') $$,
  '22023', null,
  'invalid timezones are rejected'
);
select is(
  array[
    is_slug_available('olivia-nails'),   -- taken (draft, invisible under RLS)
    is_slug_available('styleguide'),     -- reserved route
    is_slug_available('Bad Slug'),       -- invalid format
    is_slug_available('free-salon')      -- available
  ],
  array[false, false, false, true],
  'is_slug_available covers taken, reserved, malformed and free slugs'
);

-- ------------------------------------------------------------
-- Draft locations are private
-- ------------------------------------------------------------
select pg_temp.act_as(null);
select is((select count(*) from locations where id = (select location_id from ids)), 0::bigint, 'anon cannot see draft locations');
select is((select count(*) from services where location_id = (select location_id from ids)), 0::bigint, 'anon cannot see services of draft locations');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a4');
select is((select count(*) from locations where id = (select location_id from ids)), 0::bigint, 'strangers cannot see draft locations');
select is(
  pg_temp.affected($$ update locations set name = 'Hacked' $$),
  0::bigint,
  'strangers cannot edit locations'
);
select is((select count(*) from memberships), 0::bigint, 'strangers cannot read other memberships');

-- ------------------------------------------------------------
-- Active locations are public (activation is server-side)
-- ------------------------------------------------------------
reset role;
update locations set status = 'active' where id = (select location_id from ids);

select pg_temp.act_as(null);
select is((select count(*) from locations where id = (select location_id from ids)), 1::bigint, 'anon sees active locations');
select is((select count(*) from services where location_id = (select location_id from ids)), 1::bigint, 'anon sees active services');
select throws_ok(
  $$ select user_id from staff $$,
  '42501', null,
  'anon cannot see which auth user a staff member is'
);

-- ------------------------------------------------------------
-- Location roles
-- ------------------------------------------------------------
reset role;
insert into staff (id, location_id, user_id, display_name) values
  ('00000000-0000-0000-0000-0000000000b3', (select location_id from ids),
   '00000000-0000-0000-0000-0000000000a3', 'Pablo');
insert into memberships (organization_id, user_id, role, location_id, accepted_at)
select l.organization_id, u.user_id, u.role::member_role, l.id, now()
from locations l
cross join (values
  ('00000000-0000-0000-0000-0000000000a2'::uuid, 'manager'),
  ('00000000-0000-0000-0000-0000000000a3'::uuid, 'professional')
) as u (user_id, role)
where l.id = (select location_id from ids);

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select lives_ok(
  $$ insert into time_off (location_id, staff_id, starts_at, ends_at)
     values ((select location_id from ids), '00000000-0000-0000-0000-0000000000b3',
             '2030-01-01 09:00+13', '2030-01-01 17:00+13') $$,
  'a professional can block their own time'
);
select throws_ok(
  $$ insert into time_off (location_id, staff_id, starts_at, ends_at)
     select (select location_id from ids), id, '2030-01-02 09:00+13', '2030-01-02 17:00+13'
     from staff where user_id = '00000000-0000-0000-0000-0000000000a1' $$,
  '42501', null,
  'a professional cannot block someone else''s time'
);

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select is(
  pg_temp.affected($$ update services set price_cents = 7000 $$),
  1::bigint,
  'a manager can edit services at their location'
);

select * from finish();
rollback;
