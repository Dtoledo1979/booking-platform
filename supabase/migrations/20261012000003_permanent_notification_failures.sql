-- Only transient provider errors (5xx, rate limits) should be retried; a
-- permanently rejected message (bad address, blocked number) fails at once.
drop function public.complete_notification(uuid, public.notification_status, text, text, text);

create function public.complete_notification(
  p_id uuid,
  p_status public.notification_status,
  p_recipient text default null,
  p_provider_message_id text default null,
  p_error text default null,
  p_retryable boolean default true
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications
  set status = case
        when p_status = 'failed' and p_retryable and attempts < 3 then 'queued'::public.notification_status
        else p_status
      end,
      scheduled_for = case
        when p_status = 'failed' and p_retryable and attempts < 3 then now() + make_interval(mins => 10 * attempts)
        else scheduled_for
      end,
      recipient = coalesce(p_recipient, recipient),
      provider_message_id = coalesce(p_provider_message_id, provider_message_id),
      last_error = p_error,
      sent_at = case when p_status = 'sent' then now() else sent_at end
  where id = p_id and status = 'sending';
$$;

revoke execute on function public.complete_notification(uuid, public.notification_status, text, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.complete_notification(uuid, public.notification_status, text, text, text, boolean)
  to service_role;
