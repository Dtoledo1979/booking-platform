-- ============================================================
-- Client-facing list of "my appointments".
--
-- Plain RLS can't express it: a user who is also staff would see their
-- salon's appointments too, and clients can't read location_clients to
-- filter on their own records. This returns only appointments where the
-- caller is the client, with display fields joined in (location name
-- even if the location is no longer public, service names, professional).
-- ============================================================
create function public.my_appointments()
returns table (
  appointment_id uuid,
  status public.appointment_status,
  starts_at timestamptz,
  ends_at timestamptz,
  services text,
  service_id uuid,
  staff_name text,
  price_cents int,
  currency text,
  location_name text,
  location_slug text,
  location_timezone text,
  location_is_public boolean,
  free_until timestamptz,
  cancelled_by public.cancelled_by,
  fee_cents int,
  fee_status public.fee_status
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    a.id,
    a.status,
    min(s.starts_at),
    max(s.ends_at),
    string_agg(s.service_name, ', ' order by s.starts_at),
    min(s.service_id::text)::uuid,
    min(st.display_name),
    sum(s.price_cents)::int,
    l.currency,
    l.name,
    l.slug,
    l.timezone,
    l.status = 'active',
    min(s.starts_at) - make_interval(hours => p.free_cancellation_hours),
    a.cancelled_by,
    (select sum(f.amount_cents)::int from public.booking_fees f
      where f.appointment_id = a.id and f.status in ('pending', 'failed', 'succeeded')),
    (select f.status from public.booking_fees f
      where f.appointment_id = a.id order by f.created_at desc limit 1)
  from public.appointments a
  join public.location_clients lc on lc.id = a.location_client_id
  join public.locations l on l.id = a.location_id
  join public.cancellation_policies p on p.id = a.cancellation_policy_id
  join public.appointment_services s on s.appointment_id = a.id
  join public.staff st on st.id = s.staff_id
  where lc.user_id = (select auth.uid())
    and a.status <> 'pending'
  group by a.id, a.status, a.cancelled_by, l.currency, l.name, l.slug, l.timezone, l.status, p.free_cancellation_hours
  order by min(s.starts_at) desc;
$$;

grant execute on function public.my_appointments() to authenticated;
