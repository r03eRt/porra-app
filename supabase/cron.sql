create extension if not exists pg_cron;
create extension if not exists pg_net;

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

select cron.unschedule(jobid)
from cron.job
where jobname in (
  'lock-expired-pools',
  'sync-as-rankings-every-5h',
  'sync-worldcup-results-every-2m',
  'sync-as-live-match-every-1m',
  'sync-football-live-every-2m'
);

select cron.schedule(
  'lock-expired-pools',
  '*/10 * * * *',
  $$ select public.lock_expired_pools(); $$
);

select cron.schedule(
  'sync-as-rankings-every-5h',
  '0 */5 * * *',
  $$
  select net.http_post(
    url := 'https://pcggsxjjpnjzyhpztkvd.supabase.co/functions/v1/sync-as-rankings',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'sync-worldcup-results-every-2m',
  '*/2 * * * *',
  $$
  select net.http_post(
    url := 'https://pcggsxjjpnjzyhpztkvd.supabase.co/functions/v1/sync-worldcup-results',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'sync-as-live-match-every-1m',
  '*/1 * * * *',
  $$
  select net.http_post(
    url := 'https://pcggsxjjpnjzyhpztkvd.supabase.co/functions/v1/sync-as-live-match',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'sync-football-live-every-2m',
  '*/2 * * * *',
  $$
  select net.http_post(
    url := 'https://pcggsxjjpnjzyhpztkvd.supabase.co/functions/v1/sync-football-live',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);
