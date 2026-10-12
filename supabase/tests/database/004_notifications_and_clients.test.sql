-- Tests for 20261012000001_notifications_and_clients.sql. Rolls back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(18);

create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated',
                      'email', (select email from auth.users where id = p_user))::text, true);
  set local role authenticated;
end $$;
grant execute on function pg_temp.act_as(uuid) to authenticated;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@test.local',  '{"first_name":"Olivia"}'),
  ('00000000-0000-0000-0000-0000000000c1', 'client@test.local', '{"first_name":"Chloe","phone":"021 555 0101"}');

create temp table t (name text primary key, id uuid);
grant select, insert on t to authenticated;
create function pg_temp.id(p text) returns uuid language sql as $$ select id from t where name = p $$;
grant execute on function pg_temp.id(text) to authenticated;
-- Kinds queued for an appointment, as a sorted text array.
create function pg_temp.queued(p_appt uuid) returns text[] language sql as $$
  select coalesce(array_agg(format('%s/%s', kind, channel) order by kind, channel), '{}')
  from notifications where appointment_id = p_appt and status = 'queued' $$;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
insert into t select 'loc', create_organization('Olivia Ltd', 'Olivia Nails', 'olivia-nails-notify');

reset role;
insert into t values ('svc', gen_random_uuid());
insert into t select 'staff', id from staff where location_id = pg_temp.id('loc');
update locations set status = 'active', min_notice_minutes = 0 where id = pg_temp.id('loc');
insert into services (id, location_id, name, duration_minutes, price_cents) values (pg_temp.id('svc'), pg_temp.id('loc'), 'Cut', 60, 8000);
insert into staff_services (staff_id, service_id, location_id) values (pg_temp.id('staff'), pg_temp.id('svc'), pg_temp.id('loc'));
insert into staff_working_hours (staff_id, location_id, weekday, starts_at, ends_at)
  select pg_temp.id('staff'), pg_temp.id('loc'), wd, '09:00', '17:00' from generate_series(0, 6) wd;

-- A slot a week ahead, 10:00 local.
create function pg_temp.at(p_days int, p_time time) returns timestamptz language sql as $$
  select (((now() at time zone 'Pacific/Auckland')::date + p_days) + p_time) at time zone 'Pacific/Auckland' $$;
grant execute on function pg_temp.at(int, time) to authenticated;

-- ------------------------------------------------------------
-- Online booking
-- ------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
insert into t select 'appt', (book_appointment(pg_temp.id('loc'), pg_temp.id('svc'), pg_temp.at(7, '10:00'), null, true) ->> 'appointment_id')::uuid;
reset role;

select is(
  pg_temp.queued(pg_temp.id('appt')),
  array['booking_confirmed/email', 'booking_confirmed/sms', 'reminder_free_window/email',
        'reminder_free_window/sms', 'reminder_upcoming/sms', 'business_new_booking/email'],
  'an online booking queues confirmations, both reminders and the business notice'
);
select is(
  (select scheduled_for from notifications where appointment_id = pg_temp.id('appt') and kind = 'reminder_free_window' and channel = 'sms'),
  pg_temp.at(7, '10:00') - interval '30 hours',
  'the free-window reminder goes 6 h before the 24 h window closes'
);
select is(
  (select scheduled_for from notifications where appointment_id = pg_temp.id('appt') and kind = 'reminder_upcoming'),
  pg_temp.at(7, '10:00') - interval '2 hours',
  'the upcoming reminder goes 2 h before'
);

-- ------------------------------------------------------------
-- Moving
-- ------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
select reschedule_appointment(pg_temp.id('appt'), pg_temp.at(8, '11:00'));
reset role;

select is(
  (select count(*) from notifications where appointment_id = pg_temp.id('appt') and status = 'skipped'
     and kind in ('reminder_free_window', 'reminder_upcoming')),
  3::bigint,
  'moving skips the reminders for the old time'
);
select is(
  (select count(*) from notifications where appointment_id = pg_temp.id('appt') and status = 'queued'
     and kind in ('reminder_free_window', 'reminder_upcoming')
     and scheduled_for in (pg_temp.at(8, '11:00') - interval '30 hours', pg_temp.at(8, '11:00') - interval '2 hours')),
  3::bigint,
  'and schedules new ones relative to the new time'
);
select is(
  (select count(*) from notifications where appointment_id = pg_temp.id('appt') and kind = 'booking_changed'),
  2::bigint,
  'the client is told about the change by email and SMS'
);
select is(
  (select count(*) from notifications where appointment_id = pg_temp.id('appt') and kind = 'business_new_booking'),
  1::bigint,
  'a move does not re-announce the booking to the business'
);

-- ------------------------------------------------------------
-- Cancelling
-- ------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
select cancel_appointment(pg_temp.id('appt'));
reset role;

select is(
  (select count(*) from notifications where appointment_id = pg_temp.id('appt') and status = 'queued'
     and kind in ('reminder_free_window', 'reminder_upcoming')),
  0::bigint,
  'cancelling skips every pending reminder'
);
select is(
  (select array_agg(format('%s/%s', kind, channel) order by kind, channel) from notifications
   where appointment_id = pg_temp.id('appt') and kind in ('booking_cancelled', 'business_cancelled')),
  array['booking_cancelled/email', 'booking_cancelled/sms', 'business_cancelled/email'],
  'a client cancellation sends a receipt and tells the business'
);

-- ------------------------------------------------------------
-- Staff bookings, settings, holds
-- ------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
insert into t select 'staff_appt', create_staff_appointment(
  pg_temp.id('loc'), (select id from location_clients where user_id = '00000000-0000-0000-0000-0000000000c1'),
  pg_temp.id('svc'), pg_temp.id('staff'), pg_temp.at(9, '10:00'));
reset role;
select is(
  (select count(*) from notifications where appointment_id = pg_temp.id('staff_appt') and kind = 'business_new_booking'),
  0::bigint,
  'bookings made by the team do not notify the team'
);
select is(
  (select count(*) from notifications where appointment_id = pg_temp.id('staff_appt') and kind = 'booking_confirmed'),
  2::bigint,
  'the client still gets a confirmation'
);

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select cancel_appointment(pg_temp.id('staff_appt'), 'Closed for a training day');
reset role;
select is(
  (select count(*) from notifications where appointment_id = pg_temp.id('staff_appt') and kind = 'business_cancelled'),
  0::bigint,
  'a business cancellation notifies only the client'
);

update locations set sms_notifications = false where id = pg_temp.id('loc');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
insert into t select 'email_only', (book_appointment(pg_temp.id('loc'), pg_temp.id('svc'), pg_temp.at(10, '10:00'), null, true) ->> 'appointment_id')::uuid;
reset role;
select is(
  (select count(*) from notifications where appointment_id = pg_temp.id('email_only') and channel = 'sms'),
  0::bigint,
  'turning SMS off for a location stops SMS messages'
);

update locations set stripe_charges_enabled = true where id = pg_temp.id('loc');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
insert into t select 'hold', (book_appointment(pg_temp.id('loc'), pg_temp.id('svc'), pg_temp.at(11, '10:00'), null, true) ->> 'appointment_id')::uuid;
reset role;
select is(
  (select count(*) from notifications where appointment_id = pg_temp.id('hold')),
  0::bigint,
  'nothing is sent while a booking waits for a card'
);
update appointments set status = 'cancelled', cancelled_at = now(), cancelled_by = 'system', expires_at = null
  where id = pg_temp.id('hold');
select is(
  (select count(*) from notifications where appointment_id = pg_temp.id('hold')),
  0::bigint,
  'an expired hold sends nothing'
);

-- ------------------------------------------------------------
-- Dispatcher access
-- ------------------------------------------------------------
select ok(
  not has_function_privilege('authenticated', 'public.claim_notifications(int, public.notification_channel[])', 'execute'),
  'only the dispatcher (service_role) can claim messages'
);
set local role service_role;
select ok(
  (select bool_and(scheduled_for <= now() and channel = 'email') from claim_notifications(200, array['email']::notification_channel[])),
  'claiming returns only due messages of the requested channels'
);
reset role;

-- ------------------------------------------------------------
-- Client records
-- ------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select is(
  (select format('%s %s %s', first_name, has_account, next_visit is not null)
   from location_client_summaries(pg_temp.id('loc'), '0101')),
  'Chloe t t',
  'client search matches phone digits and shows the next visit'
);

select * from finish();
rollback;
