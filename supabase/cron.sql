create extension if not exists pg_cron;

create or replace function public.lock_expired_pools()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.pools
  set status = 'locked',
      updated_at = now()
  where status in ('draft', 'open')
    and lock_at is not null
    and lock_at <= now();
end;
$$;

select cron.schedule(
  'lock-expired-pools',
  '*/10 * * * *',
  $$ select public.lock_expired_pools(); $$
);
