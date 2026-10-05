-- Tests for 20261006000001_team_invites.sql. Rolls back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(19);

-- Acting as a user includes their email claim: accept_invite checks it.
create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  reset role;
  if p_user is null then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    set local role anon;
  else
    perform set_config('request.jwt.claims',
      json_build_object('sub', p_user, 'role', 'authenticated',
                        'email', (select email from auth.users where id = p_user))::text, true);
    set local role authenticated;
  end if;
end $$;
grant execute on function pg_temp.act_as(uuid) to anon, authenticated;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@test.local',     '{"first_name":"Olivia"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'manager@test.local',   '{"first_name":"Mia"}'),
  ('00000000-0000-0000-0000-0000000000b2', 'pro@test.local',       '{"first_name":"Pablo"}'),
  ('00000000-0000-0000-0000-0000000000b3', 'reception@test.local', '{"first_name":"Rita"}'),
  ('00000000-0000-0000-0000-0000000000b4', 'stranger@test.local',  '{"first_name":"Sam"}');

create temp table t (name text primary key, value text);
grant select, insert, update on t to anon, authenticated;
create function pg_temp.v(p text) returns text language sql as $$ select value from t where name = p $$;
grant execute on function pg_temp.v(text) to anon, authenticated;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
insert into t select 'loc', create_organization('Olivia Ltd', 'Olivia Nails', 'olivia-nails-team')::text;
insert into staff (id, location_id, display_name)
  values ('00000000-0000-0000-0000-0000000000e1', pg_temp.v('loc')::uuid, 'Pablo');

-- ------------------------------------------------------------
-- Owner invites a manager
-- ------------------------------------------------------------
insert into t select 'mgr_token', create_invite(pg_temp.v('loc')::uuid, 'Manager@Test.local ', 'manager');
select is(length(pg_temp.v('mgr_token')), 48, 'an invite returns a random 48-character token');
select throws_ok(
  $$ select invite_token_hash from memberships $$,
  '42501', null,
  'the token hash is not readable through the API'
);

reset role;
select is(
  (select count(*) from memberships where invite_token_hash = pg_temp.v('mgr_token')),
  0::bigint,
  'only a hash of the token is stored'
);

select pg_temp.act_as(null);
select is(
  (select format('%s|%s|%s', location_name, role, invited_email) from get_invite(pg_temp.v('mgr_token'))),
  'Olivia Nails|manager|manager@test.local',
  'anyone holding the link can see who it is for (email normalised)'
);
select is((select count(*) from get_invite('not-a-real-token')), 0::bigint, 'a wrong token reveals nothing');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000b4');
select throws_ok(
  $$ select accept_invite(pg_temp.v('mgr_token')) $$,
  'P0001', 'invite_email_mismatch',
  'only the invited email can accept'
);

select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select is(accept_invite(pg_temp.v('mgr_token'))::text, pg_temp.v('loc'), 'the manager accepts and joins the location');

-- ------------------------------------------------------------
-- Manager permissions
-- ------------------------------------------------------------
select throws_ok(
  $$ select create_invite(pg_temp.v('loc')::uuid, 'another@test.local', 'manager') $$,
  '42501', null,
  'a manager cannot invite another manager'
);
select throws_ok(
  $$ select create_invite(pg_temp.v('loc')::uuid, 'pro@test.local', 'professional') $$,
  'P0001', 'staff_required',
  'a professional invite must be tied to a staff profile'
);
insert into t select 'pro_token',
  create_invite(pg_temp.v('loc')::uuid, 'pro@test.local', 'professional', '00000000-0000-0000-0000-0000000000e1');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000b2');
select lives_ok($$ select accept_invite(pg_temp.v('pro_token')) $$, 'the professional accepts');
select is(
  (select user_id from staff where id = '00000000-0000-0000-0000-0000000000e1'),
  '00000000-0000-0000-0000-0000000000b2'::uuid,
  'accepting links the login to the staff profile'
);
select throws_ok(
  $$ select accept_invite(pg_temp.v('pro_token')) $$,
  'P0001', 'invite_not_found',
  'an invite link works only once'
);
select throws_ok(
  $$ select create_invite(pg_temp.v('loc')::uuid, 'x@test.local', 'reception') $$,
  '42501', null,
  'professionals cannot invite anyone'
);
select is((select count(*) from location_members(pg_temp.v('loc')::uuid)), 0::bigint, 'professionals cannot list the team');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select is(
  (select array_agg(format('%s:%s', role, status) order by role) from location_members(pg_temp.v('loc')::uuid)),
  array['owner:active', 'manager:active', 'professional:active'],
  'managers see the whole team with roles and status'
);

-- ------------------------------------------------------------
-- Expiry and removal
-- ------------------------------------------------------------
insert into t select 'rec_token', create_invite(pg_temp.v('loc')::uuid, 'reception@test.local', 'reception');
reset role;
update memberships set invite_expires_at = now() - interval '1 minute' where invited_email = 'reception@test.local';
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b3');
select throws_ok(
  $$ select accept_invite(pg_temp.v('rec_token')) $$,
  'P0001', 'invite_expired',
  'expired links are refused'
);

select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select remove_member((select membership_id from location_members(pg_temp.v('loc')::uuid) where role = 'professional'));
reset role;
select is(
  (select user_id from staff where id = '00000000-0000-0000-0000-0000000000e1'),
  null::uuid,
  'removing a professional keeps their profile but unlinks the login'
);
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select throws_ok(
  $$ select remove_member((select membership_id from location_members(pg_temp.v('loc')::uuid) where role = 'owner')) $$,
  '42501', null,
  'nobody can remove the owner'
);

select is(is_slug_available('invite'), false, '/invite is reserved');

select * from finish();
rollback;
