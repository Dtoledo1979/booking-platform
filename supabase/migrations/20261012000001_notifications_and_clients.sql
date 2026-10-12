-- ============================================================
-- Notifications outbox + client record summaries.
--
-- Every appointment change enqueues the messages it implies, from a
-- trigger, so no screen can forget to notify. A dispatcher (service_role)
-- claims due rows, sends them through the email/SMS providers and records
-- the result. Moving or cancelling an appointment skips its pending
-- reminders and schedules new ones. See docs/07-notificaciones.md.
-- ============================================================

create type public.notification_kind as enum (
  'booking_confirmed',      -- client: booking made (online or by staff)
  'booking_changed',        -- client: time, date or professional changed
  'booking_cancelled',      -- client: cancelled (by them, as a receipt, or by the business)
  'reminder_free_window',   -- client: shortly before free cancellation ends
  'reminder_upcoming',      -- client: a couple of hours before
  'business_new_booking',   -- business: a client booked online
  'business_cancelled'      -- business: a client cancelled
);
create type public.notification_channel as enum ('email', 'sms');
create type public.notification_status as enum ('queued', 'sending', 'sent', 'failed', 'skipped');

alter table public.locations
  add column email_notifications boolean not null default true,
  add column sms_notifications boolean not null default true;
grant select (email_notifications, sms_notifications) on public.locations to anon, authenticated;
grant update (email_notifications, sms_notifications) on public.locations to authenticated;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  appointment_id uuid references public.appointments (id) on delete cascade,
  kind public.notification_kind not null,
  channel public.notification_channel not null,
  -- Idempotency: the same event never produces the same message twice.
  dedupe_key text not null unique,
  scheduled_for timestamptz not null default now(),
  status public.notification_status not null default 'queued',
  attempts int not null default 0,
  claimed_at timestamptz,
  recipient text, -- filled in at send time, from current contact details
  provider_message_id text,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_due_idx on public.notifications (scheduled_for) where status in ('queued', 'sending');
create index notifications_location_idx on public.notifications (location_id, created_at desc);
create index notifications_appointment_idx on public.notifications (appointment_id);

alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
create policy "managers read" on public.notifications
  for select to authenticated using (private.has_location_role(location_id, '{manager}'));
grant select on public.notifications to authenticated;

-- ------------------------------------------------------------
-- Enqueueing
-- ------------------------------------------------------------
create function private.enqueue_notification(
  p_location uuid,
  p_appointment uuid,
  p_kind public.notification_kind,
  p_channel public.notification_channel,
  p_at timestamptz,
  p_dedupe text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (location_id, appointment_id, kind, channel, scheduled_for, dedupe_key)
  values (p_location, p_appointment, p_kind, p_channel, p_at, p_dedupe)
  on conflict (dedupe_key) do nothing;
$$;

-- Brings an appointment's queued messages in line with its current state.
-- p_event: 'created' (first service line inserted), 'moved' (time/staff
-- changed) or 'status' (status changed).
create function private.sync_appointment_notifications(p_appointment uuid, p_event text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appt public.appointments%rowtype;
  v_loc public.locations%rowtype;
  v_free_hours int;
  v_start timestamptz;
  v_epoch text;
  v_channels public.notification_channel[];
  v_channel public.notification_channel;
  v_at timestamptz;
begin
  select * into v_appt from public.appointments where id = p_appointment;
  if not found then return; end if;
  select * into v_loc from public.locations where id = v_appt.location_id;
  select min(starts_at) into v_start from public.appointment_services where appointment_id = p_appointment;
  if v_start is null then return; end if; -- service lines not inserted yet
  select free_cancellation_hours into v_free_hours from public.cancellation_policies where id = v_appt.cancellation_policy_id;

  v_epoch := extract(epoch from v_start)::bigint::text;
  v_channels := array_remove(array[
    case when v_loc.email_notifications then 'email'::public.notification_channel end,
    case when v_loc.sms_notifications then 'sms'::public.notification_channel end
  ], null);

  -- Whatever happens, reminders for any other start time are obsolete.
  update public.notifications
  set status = 'skipped', last_error = 'appointment changed'
  where appointment_id = p_appointment
    and status = 'queued'
    and kind in ('reminder_free_window', 'reminder_upcoming')
    and (v_appt.status <> 'confirmed' or dedupe_key not like '%:' || v_epoch);

  if v_appt.status = 'confirmed' then
    foreach v_channel in array v_channels loop
      if p_event = 'moved' then
        perform private.enqueue_notification(v_loc.id, p_appointment, 'booking_changed', v_channel, now(),
          format('booking_changed:%s:%s:%s', p_appointment, v_channel, v_epoch));
      else
        perform private.enqueue_notification(v_loc.id, p_appointment, 'booking_confirmed', v_channel, now(),
          format('booking_confirmed:%s:%s', p_appointment, v_channel));
      end if;

      -- Nudge before free cancellation ends (docs/03): 6 h before the window closes.
      v_at := v_start - make_interval(hours => coalesce(v_free_hours, 24) + 6);
      if v_at > now() + interval '5 minutes' then
        perform private.enqueue_notification(v_loc.id, p_appointment, 'reminder_free_window', v_channel, v_at,
          format('reminder_free_window:%s:%s:%s', p_appointment, v_channel, v_epoch));
      end if;
    end loop;

    v_at := v_start - interval '2 hours';
    if 'sms' = any (v_channels) and v_at > now() + interval '5 minutes' then
      perform private.enqueue_notification(v_loc.id, p_appointment, 'reminder_upcoming', 'sms', v_at,
        format('reminder_upcoming:%s:sms:%s', p_appointment, v_epoch));
    end if;

    if v_appt.source = 'online' and p_event <> 'moved' and v_loc.email_notifications then
      perform private.enqueue_notification(v_loc.id, p_appointment, 'business_new_booking', 'email', now(),
        format('business_new_booking:%s', p_appointment));
    end if;

  elsif v_appt.status = 'cancelled' and v_appt.cancelled_by <> 'system' then
    -- Expired card holds (cancelled_by = system) were never confirmed: no messages.
    foreach v_channel in array v_channels loop
      perform private.enqueue_notification(v_loc.id, p_appointment, 'booking_cancelled', v_channel, now(),
        format('booking_cancelled:%s:%s', p_appointment, v_channel));
    end loop;
    if v_appt.cancelled_by = 'client' and v_loc.email_notifications then
      perform private.enqueue_notification(v_loc.id, p_appointment, 'business_cancelled', 'email', now(),
        format('business_cancelled:%s', p_appointment));
    end if;
  end if;
end;
$$;

create function private.on_appointment_services_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.sync_appointment_notifications(new.appointment_id, 'created');
  elsif new.starts_at is distinct from old.starts_at or new.staff_id is distinct from old.staff_id then
    perform private.sync_appointment_notifications(new.appointment_id, 'moved');
  end if;
  return null;
end;
$$;

create trigger appointment_services_notify
  after insert or update of starts_at, staff_id on public.appointment_services
  for each row execute function private.on_appointment_services_change();

create function private.on_appointment_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    perform private.sync_appointment_notifications(new.id, 'status');
  end if;
  return null;
end;
$$;

create trigger appointments_notify
  after update of status on public.appointments
  for each row execute function private.on_appointment_status_change();

-- ------------------------------------------------------------
-- Dispatching (service_role only)
-- ------------------------------------------------------------

-- Claims due messages for sending. SKIP LOCKED lets several dispatcher
-- runs overlap safely; rows stuck in 'sending' for 15 minutes (a crashed
-- run) are picked up again.
create function public.claim_notifications(p_limit int default 50)
returns setof public.notifications
language sql
security definer
set search_path = ''
as $$
  update public.notifications n
  set status = 'sending', claimed_at = now(), attempts = n.attempts + 1
  where n.id in (
    select id from public.notifications
    where scheduled_for <= now()
      and (status = 'queued' or (status = 'sending' and claimed_at < now() - interval '15 minutes'))
    order by scheduled_for
    limit greatest(1, least(p_limit, 200))
    for update skip locked
  )
  returning n.*;
$$;

-- Records the outcome. Failures retry up to 3 attempts, backing off.
create function public.complete_notification(
  p_id uuid,
  p_status public.notification_status,
  p_recipient text default null,
  p_provider_message_id text default null,
  p_error text default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications
  set status = case
        when p_status = 'failed' and attempts < 3 then 'queued'::public.notification_status
        else p_status
      end,
      scheduled_for = case
        when p_status = 'failed' and attempts < 3 then now() + make_interval(mins => 10 * attempts)
        else scheduled_for
      end,
      recipient = coalesce(p_recipient, recipient),
      provider_message_id = coalesce(p_provider_message_id, provider_message_id),
      last_error = p_error,
      sent_at = case when p_status = 'sent' then now() else sent_at end
  where id = p_id and status = 'sending';
$$;

revoke execute on function public.claim_notifications(int), public.complete_notification(uuid, public.notification_status, text, text, text)
  from public, anon, authenticated;
grant execute on function public.claim_notifications(int), public.complete_notification(uuid, public.notification_status, text, text, text)
  to service_role;

-- ------------------------------------------------------------
-- Client records: one row per client with visit statistics.
-- security invoker: the caller's RLS decides what they can see.
-- ------------------------------------------------------------
create function public.location_client_summaries(
  p_location_id uuid,
  p_search text default null,
  p_limit int default 200
)
returns table (
  id uuid,
  first_name text,
  last_name text,
  phone text,
  email text,
  is_blocked boolean,
  has_account boolean,
  visits int,
  no_shows int,
  late_cancellations int,
  last_visit timestamptz,
  next_visit timestamptz,
  fees_due_cents int,
  created_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  with stats as (
    select a.location_client_id,
           count(*) filter (where a.status = 'completed') as visits,
           count(*) filter (where a.status = 'no_show') as no_shows,
           max(s.starts_at) filter (where a.status = 'completed') as last_visit,
           min(s.starts_at) filter (where a.status = 'confirmed' and s.starts_at > now()) as next_visit
    from public.appointments a
    join public.appointment_services s on s.appointment_id = a.id
    where a.location_id = p_location_id
    group by a.location_client_id
  ),
  fees as (
    select location_client_id,
           count(*) filter (where kind = 'late_cancel') as late_cancellations,
           coalesce(sum(amount_cents) filter (where status in ('pending', 'failed')), 0) as due
    from public.booking_fees
    where location_id = p_location_id
    group by location_client_id
  )
  select c.id, c.first_name, c.last_name, c.phone, c.email, c.is_blocked, c.user_id is not null,
         coalesce(st.visits, 0)::int, coalesce(st.no_shows, 0)::int, coalesce(f.late_cancellations, 0)::int,
         st.last_visit, st.next_visit, coalesce(f.due, 0)::int, c.created_at
  from public.location_clients c
  left join stats st on st.location_client_id = c.id
  left join fees f on f.location_client_id = c.id
  where c.location_id = p_location_id
    -- Plain substring match (no LIKE wildcards from user input).
    and (nullif(trim(p_search), '') is null
         or strpos(lower(concat_ws(' ', c.first_name, c.last_name, c.email, c.phone)), lower(trim(p_search))) > 0
         or strpos(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), regexp_replace(p_search, '\D', '', 'g')) > 0
            and regexp_replace(p_search, '\D', '', 'g') <> '')
  order by st.next_visit nulls last, st.last_visit desc nulls last, c.first_name
  limit greatest(1, least(p_limit, 1000));
$$;

grant execute on function public.location_client_summaries(uuid, text, int) to authenticated;
