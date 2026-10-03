-- Tests for 20261003000003_appointments_and_fees.sql: availability,
-- booking, cancellation fees, reschedule, no-show, policy versions and
-- permissions. Runs inside a transaction and rolls back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(49);

-- ------------------------------------------------------------
-- Session helpers (same as 001)
-- ------------------------------------------------------------
create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  reset role;
  if p_user is null then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    set local role anon;
  else
    perform set_config('request.jwt.claims',
      json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
    set local role authenticated;
  end if;
end $$;
grant execute on function pg_temp.act_as(uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- Fixtures
--   owner   a1: solo owner, also the first professional
--   client  c1, c2
--   pro     d1: second professional, added later
-- ------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@test.local',   '{"first_name":"Olivia"}'),
  ('00000000-0000-0000-0000-0000000000c1', 'client1@test.local', '{"first_name":"Chloe"}'),
  ('00000000-0000-0000-0000-0000000000c2', 'client2@test.local', '{"first_name":"Carlos"}'),
  ('00000000-0000-0000-0000-0000000000d1', 'pro@test.local',     '{"first_name":"Pablo"}');

create temp table ctx (loc uuid, svc uuid, owner_staff uuid, pro_staff uuid, day date, today date);
create temp table appts (name text primary key, id uuid);
grant select, insert, update on ctx, appts to anon, authenticated;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
insert into ctx (loc) select create_organization('Olivia Ltd', 'Olivia Nails', 'olivia-nails');

reset role;
update ctx set
  svc = '00000000-0000-0000-0000-0000000000f1',
  owner_staff = (select id from staff where user_id = '00000000-0000-0000-0000-0000000000a1'),
  pro_staff = '00000000-0000-0000-0000-0000000000e1',
  today = (now() at time zone 'Pacific/Auckland')::date,
  day = (now() at time zone 'Pacific/Auckland')::date + 7;

-- Activation is server-side; zero notice so "within 24h" slots exist.
update locations set status = 'active', min_notice_minutes = 0 where id = (select loc from ctx);
insert into services (id, location_id, name, duration_minutes, price_cents)
  select svc, loc, 'Gel manicure', 60, 10000 from ctx;
insert into staff_services (staff_id, service_id, location_id)
  select owner_staff, svc, loc from ctx;
insert into staff_working_hours (staff_id, location_id, weekday, starts_at, ends_at)
  select owner_staff, loc, wd, '09:00', '17:00' from ctx, generate_series(0, 6) wd;

-- Shorthands used throughout.
create function pg_temp.loc() returns uuid language sql as $$ select loc from ctx $$;
create function pg_temp.svc() returns uuid language sql as $$ select svc from ctx $$;
create function pg_temp.owner_staff() returns uuid language sql as $$ select owner_staff from ctx $$;
create function pg_temp.pro_staff() returns uuid language sql as $$ select pro_staff from ctx $$;
create function pg_temp.day() returns date language sql as $$ select day from ctx $$;
create function pg_temp.today() returns date language sql as $$ select today from ctx $$;
-- A local wall-clock time on the test day, as timestamptz.
create function pg_temp.t(p time) returns timestamptz language sql as $$
  select ((select day from ctx) + p) at time zone 'Pacific/Auckland' $$;
create function pg_temp.appt(p_name text) returns uuid language sql as $$
  select id from appts where name = p_name $$;
-- Book as the current user and remember the appointment under a name.
create function pg_temp.book(p_name text, p_at timestamptz, p_staff uuid default null)
returns jsonb language plpgsql as $$
declare r jsonb;
begin
  r := book_appointment((select loc from ctx), (select svc from ctx), p_at, p_staff, true);
  insert into appts values (p_name, (r ->> 'appointment_id')::uuid);
  return r;
end $$;
grant execute on function
  pg_temp.loc(), pg_temp.svc(), pg_temp.owner_staff(), pg_temp.pro_staff(),
  pg_temp.day(), pg_temp.today(), pg_temp.t(time), pg_temp.appt(text),
  pg_temp.book(text, timestamptz, uuid)
to anon, authenticated;

-- ------------------------------------------------------------
-- Policy defaults
-- ------------------------------------------------------------
select is(
  (select format('%s|%s %s|%s %s', free_cancellation_hours, late_cancel_fee_type, late_cancel_fee_value,
                 no_show_fee_type, no_show_fee_value)
   from cancellation_policies where location_id = pg_temp.loc()),
  '24|percent 50|percent 100',
  'every location starts with policy v1: 24h free, 50% late, 100% no-show'
);

-- ------------------------------------------------------------
-- Availability
-- ------------------------------------------------------------
select pg_temp.act_as(null);
select is(
  (select count(*) from get_available_slots(pg_temp.loc(), pg_temp.svc(), pg_temp.day(), pg_temp.day())),
  29::bigint,
  'anon sees 29 starts for a 60 min service in a 09:00-17:00 day (every 15 min, last at 16:00)'
);
select is(
  (select min(slot_start) from get_available_slots(pg_temp.loc(), pg_temp.svc(), pg_temp.day(), pg_temp.day())),
  pg_temp.t('09:00'),
  'slots are generated in the location time zone'
);
select ok(
  not has_function_privilege('anon', 'public.book_appointment(uuid, uuid, timestamptz, uuid, boolean, text)', 'execute'),
  'anon cannot book'
);

-- ------------------------------------------------------------
-- Booking
-- ------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
select throws_ok(
  $$ select book_appointment(pg_temp.loc(), pg_temp.svc(), pg_temp.t('10:00'), null, false) $$,
  'P0001', 'policy_not_accepted',
  'booking requires accepting the cancellation policy'
);
select pg_temp.book('c1_10', pg_temp.t('10:00'));
select is(
  (select status::text from appointments where id = pg_temp.appt('c1_10')),
  'confirmed',
  'without Stripe connected the booking is confirmed immediately'
);
select ok(
  (select policy_accepted_at is not null from appointments where id = pg_temp.appt('c1_10')),
  'policy acceptance time is recorded'
);
select is(
  (select array_agg(to_char(slot_start at time zone 'Pacific/Auckland', 'HH24:MI') order by slot_start)
   from get_available_slots(pg_temp.loc(), pg_temp.svc(), pg_temp.day(), pg_temp.day())
   where slot_start in (pg_temp.t('09:00'), pg_temp.t('09:15'), pg_temp.t('10:00'), pg_temp.t('10:45'), pg_temp.t('11:00'))),
  array['09:00', '11:00'],
  'overlapping starts disappear (09:15, 10:00, 10:45); adjacent ones stay (09:00, 11:00)'
);

select pg_temp.act_as('00000000-0000-0000-0000-0000000000c2');
select throws_ok(
  $$ select pg_temp.book('c2_1030', pg_temp.t('10:30')) $$,
  'P0001', 'slot_unavailable',
  'an overlapping booking is rejected'
);
select is((select count(*) from appointments), 0::bigint, 'clients cannot see other clients'' appointments');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
select is((select count(*) from appointments), 1::bigint, 'clients see their own appointments');
select throws_ok(
  $$ update appointments set status = 'completed' $$,
  '42501', null,
  'clients cannot write appointments directly'
);
select is((select count(*) from location_clients), 0::bigint, 'clients cannot read the business CRM');

-- ------------------------------------------------------------
-- Cancellation: free outside the window, fee inside it
-- ------------------------------------------------------------
select is(
  (get_cancellation_quote(pg_temp.appt('c1_10')) ->> 'fee_cents')::int,
  0,
  'a week ahead, cancelling is free'
);
select is(
  (cancel_appointment(pg_temp.appt('c1_10')) ->> 'fee_cents')::int,
  0,
  'free cancellation creates no fee'
);
select is(
  (select bool_or(is_active) from appointment_services where appointment_id = pg_temp.appt('c1_10')),
  false,
  'cancelling releases the calendar hold'
);
select ok(
  exists (select 1 from get_available_slots(pg_temp.loc(), pg_temp.svc(), pg_temp.day(), pg_temp.day())
          where slot_start = pg_temp.t('10:00')),
  'the cancelled slot is bookable again'
);

select pg_temp.book('c1_late',
  (select min(slot_start) from get_available_slots(pg_temp.loc(), pg_temp.svc(), pg_temp.today(), pg_temp.today() + 1)));
select is(
  (get_cancellation_quote(pg_temp.appt('c1_late')) ->> 'fee_cents')::int,
  5000,
  'within 24h the quote shows the 50% late fee before cancelling'
);
select is(
  (cancel_appointment(pg_temp.appt('c1_late')) ->> 'fee_cents')::int,
  5000,
  'a late cancellation creates the fee'
);
select is(
  (select format('%s %s %s', kind, amount_cents, status) from booking_fees),
  'late_cancel 5000 pending',
  'the client can see their pending fee'
);

select pg_temp.act_as('00000000-0000-0000-0000-0000000000c2');
select is((select count(*) from booking_fees), 0::bigint, 'clients cannot see other clients'' fees');

-- ------------------------------------------------------------
-- Business cancellation
-- ------------------------------------------------------------
select pg_temp.book('c2_12', pg_temp.t('12:00'));
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok(
  $$ select cancel_appointment(pg_temp.appt('c2_12')) $$,
  'P0001', 'reason_required',
  'the business must give a reason to cancel'
);
select is(
  cancel_appointment(pg_temp.appt('c2_12'), 'Technician sick') ->> 'cancelled_by',
  'business',
  'a business cancellation is recorded as such (and never charges the client)'
);

-- ------------------------------------------------------------
-- Rescheduling
-- ------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
select pg_temp.book('c1_14', pg_temp.t('14:00'));
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c2');
select pg_temp.book('c2_13', pg_temp.t('13:00'));
select throws_ok(
  $$ select reschedule_appointment(pg_temp.appt('c2_13'), pg_temp.t('14:00')) $$,
  'P0001', 'slot_unavailable',
  'a client cannot reschedule into a taken slot'
);
select is(
  (reschedule_appointment(pg_temp.appt('c2_13'), pg_temp.t('15:00')) ->> 'starts_at')::timestamptz,
  pg_temp.t('15:00'),
  'a client can reschedule outside the paid window'
);
select is(
  (reschedule_appointment(pg_temp.appt('c2_13'), pg_temp.t('15:15')) ->> 'starts_at')::timestamptz,
  pg_temp.t('15:15'),
  'rescheduling can overlap the appointment''s own previous time'
);

-- ------------------------------------------------------------
-- Staff-created appointments
-- ------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
insert into appts select 'staff_10', create_staff_appointment(
  pg_temp.loc(),
  (select id from location_clients where user_id = '00000000-0000-0000-0000-0000000000c2'),
  pg_temp.svc(), pg_temp.owner_staff(), pg_temp.t('10:00'), 'Booked by phone');
select is(
  (select format('%s %s %s', status, source, policy_accepted_at is null)
   from appointments where id = pg_temp.appt('staff_10')),
  'confirmed staff t',
  'staff bookings are confirmed but carry no policy acceptance (no fees chargeable)'
);
select is(
  (select body from appointment_notes where appointment_id = pg_temp.appt('staff_10')),
  'Booked by phone',
  'internal notes are stored apart from the appointment'
);
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c2');
select is((select count(*) from appointment_notes), 0::bigint, 'clients never see internal notes');

-- ------------------------------------------------------------
-- No-show
-- ------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok(
  $$ select mark_no_show(pg_temp.appt('c2_13'), true) $$,
  'P0001', 'too_early_for_no_show',
  'a no-show cannot be marked before the start time plus grace'
);

-- A confirmed appointment that started two hours ago.
reset role;
insert into appts values ('past', gen_random_uuid());
insert into appointments (id, location_id, location_client_id, status, source, cancellation_policy_id, policy_accepted_at)
select pg_temp.appt('past'), pg_temp.loc(), lc.id, 'confirmed', 'online', p.id, now() - interval '3 days'
from location_clients lc, cancellation_policies p
where lc.user_id = '00000000-0000-0000-0000-0000000000c1' and p.location_id = pg_temp.loc() and p.version = 1;
insert into appointment_services (appointment_id, location_id, service_id, staff_id, starts_at, ends_at, hold_until, duration_minutes, price_cents, service_name)
select pg_temp.appt('past'), pg_temp.loc(), pg_temp.svc(), pg_temp.owner_staff(),
       now() - interval '2 hours', now() - interval '1 hour', now() - interval '1 hour', 60, 10000, 'Gel manicure';

-- Second professional, not assigned to that appointment.
insert into staff (id, location_id, user_id, display_name, sort_order)
  values (pg_temp.pro_staff(), pg_temp.loc(), '00000000-0000-0000-0000-0000000000d1', 'Pablo', 1);
insert into memberships (organization_id, user_id, role, location_id, accepted_at)
  select organization_id, '00000000-0000-0000-0000-0000000000d1', 'professional', id, now()
  from locations where id = pg_temp.loc();

select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select throws_ok(
  $$ select mark_no_show(pg_temp.appt('past'), true) $$,
  'P0001', 'appointment_not_found',
  'a professional cannot act on another professional''s appointment'
);

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select is(
  (mark_no_show(pg_temp.appt('past'), true) ->> 'fee_cents')::int,
  10000,
  'charging a no-show applies the 100% policy fee'
);

select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
select throws_ok(
  $$ select waive_fee((select id from booking_fees where kind = 'no_show')) $$,
  'P0001', 'fee_not_found',
  'clients cannot waive their own fees'
);

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select mark_appointment_completed(pg_temp.appt('past'));
select is(
  (select format('%s %s', a.status, f.status)
   from appointments a join booking_fees f on f.appointment_id = a.id and f.kind = 'no_show'
   where a.id = pg_temp.appt('past')),
  'completed waived',
  'reverting a mistaken no-show completes the visit and waives the fee'
);
select is(
  waive_fee((select id from booking_fees where kind = 'late_cancel')),
  'waived',
  'the business can waive a pending late-cancellation fee'
);

-- ------------------------------------------------------------
-- Policy versions
-- ------------------------------------------------------------
-- Publish in its own statement: a query can't see rows inserted by a
-- function it calls itself.
insert into appts select 'policy_v2', publish_cancellation_policy(pg_temp.loc(), 12, 'fixed', 2000, 'none', 0);
select is(
  (select version from cancellation_policies where id = pg_temp.appt('policy_v2')),
  2,
  'publishing a policy creates version 2'
);
select throws_ok(
  $$ select publish_cancellation_policy(pg_temp.loc(), 24, 'percent', 150, 'none', 0) $$,
  '23514', null,
  'a percent fee above 100 is rejected'
);

select pg_temp.act_as('00000000-0000-0000-0000-0000000000c2');
select pg_temp.book('c2_12b', pg_temp.t('12:00'));
select is(
  -- Looked up one by one: created_at is identical inside a transaction.
  array[
    (select p.version from appointments a join cancellation_policies p on p.id = a.cancellation_policy_id
     where a.id = pg_temp.appt('c2_13')),
    (select p.version from appointments a join cancellation_policies p on p.id = a.cancellation_policy_id
     where a.id = pg_temp.appt('c2_12b'))
  ],
  array[1, 2],
  'new bookings take the latest policy; existing ones keep the version the client accepted'
);

-- ------------------------------------------------------------
-- "No preference" assignment
-- ------------------------------------------------------------
reset role;
insert into staff_services (staff_id, service_id, location_id) values (pg_temp.pro_staff(), pg_temp.svc(), pg_temp.loc());
insert into staff_working_hours (staff_id, location_id, weekday, starts_at, ends_at)
  select pg_temp.pro_staff(), pg_temp.loc(), wd, '09:00', '17:00' from generate_series(0, 6) wd;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000c2');
select is(
  (pg_temp.book('c2_14', pg_temp.t('14:00')) ->> 'staff_id')::uuid,
  pg_temp.pro_staff(),
  'with no preference, a busy professional''s slot goes to a free one'
);
select is(
  (pg_temp.book('c2_09', pg_temp.t('09:00')) ->> 'staff_id')::uuid,
  pg_temp.pro_staff(),
  'least_busy assigns the professional with fewer booked minutes that day'
);

-- ------------------------------------------------------------
-- Card-entry hold
-- ------------------------------------------------------------
reset role;
update locations set stripe_charges_enabled = true where id = pg_temp.loc();

select pg_temp.act_as('00000000-0000-0000-0000-0000000000c2');
select is(
  pg_temp.book('c2_11_hold', pg_temp.t('11:00'), pg_temp.owner_staff()) ->> 'status',
  'pending',
  'with fees and Stripe enabled, a client without a saved card gets a 10 minute hold'
);
select ok(
  not has_function_privilege('authenticated', 'public.confirm_pending_appointment(uuid)', 'execute'),
  'only the payments webhook (service_role) can confirm a hold'
);

reset role;
update appointments set expires_at = now() - interval '1 minute' where id = pg_temp.appt('c2_11_hold');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
select lives_ok(
  $$ select pg_temp.book('c1_11', pg_temp.t('11:00'), pg_temp.owner_staff()) $$,
  'an expired hold frees the slot for the next client'
);
reset role;
select is(
  (select format('%s %s', status, cancelled_by) from appointments where id = pg_temp.appt('c2_11_hold')),
  'cancelled system',
  'the expired hold is cancelled by the system'
);

-- ------------------------------------------------------------
-- Integrity and calendar rules
-- ------------------------------------------------------------
select throws_ok(
  $$ insert into appointment_services (appointment_id, location_id, service_id, staff_id, starts_at, ends_at, hold_until, duration_minutes, price_cents, service_name)
     values (pg_temp.appt('c2_13'), pg_temp.loc(), pg_temp.svc(), pg_temp.owner_staff(),
             pg_temp.t('15:30'), pg_temp.t('16:30'), pg_temp.t('16:30'), 60, 10000, 'x') $$,
  '23P01', null,
  'the database itself rejects double booking a professional'
);
select throws_ok(
  $$ update appointments set status = 'confirmed' where id = pg_temp.appt('c1_10') $$,
  '23514', null,
  'a cancelled appointment cannot be revived'
);

insert into time_off (location_id, staff_id, starts_at, ends_at)
  values (pg_temp.loc(), pg_temp.pro_staff(), pg_temp.t('12:00'), pg_temp.t('13:00'));
select is(
  (select count(*) from get_available_slots(pg_temp.loc(), pg_temp.svc(), pg_temp.day(), pg_temp.day(), pg_temp.pro_staff())
   where slot_start > pg_temp.t('11:00') and slot_start < pg_temp.t('13:00')),
  0::bigint,
  'time off removes every slot that would overlap it'
);

update locations set min_notice_minutes = 1440 where id = pg_temp.loc();
select is(
  (select count(*) from get_available_slots(pg_temp.loc(), pg_temp.svc(), pg_temp.today(), pg_temp.today() + 1)
   where slot_start < now() + interval '24 hours'),
  0::bigint,
  'minimum notice hides slots that are too soon'
);

update locations set status = 'paused' where id = pg_temp.loc();
select is(
  (select count(*) from get_available_slots(pg_temp.loc(), pg_temp.svc(), pg_temp.day(), pg_temp.day())),
  0::bigint,
  'a paused location offers no availability'
);

select * from finish();
rollback;
