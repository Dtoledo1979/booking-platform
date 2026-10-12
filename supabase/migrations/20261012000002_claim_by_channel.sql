-- The dispatcher only claims channels whose provider is configured, so
-- e.g. SMS stays queued (without burning attempts) until Twilio is set up.
drop function public.claim_notifications(int);

create function public.claim_notifications(
  p_limit int default 50,
  p_channels public.notification_channel[] default array['email', 'sms']::public.notification_channel[]
)
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
      and channel = any (p_channels)
      and (status = 'queued' or (status = 'sending' and claimed_at < now() - interval '15 minutes'))
    order by scheduled_for
    limit greatest(1, least(p_limit, 200))
    for update skip locked
  )
  returning n.*;
$$;

revoke execute on function public.claim_notifications(int, public.notification_channel[]) from public, anon, authenticated;
grant execute on function public.claim_notifications(int, public.notification_channel[]) to service_role;
