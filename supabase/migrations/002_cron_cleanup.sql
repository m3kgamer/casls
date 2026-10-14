-- Server-side scheduled cleanup of expired food history (every 30 minutes).
-- Requires the pg_cron extension (Supabase: Database > Extensions > pg_cron, or the statement below).
create extension if not exists pg_cron with schema pg_catalog;

-- cron.schedule with an existing job name updates that job, so this is re-runnable.
select cron.schedule(
  'cleanup-expired-food-logs',
  '*/30 * * * *',
  $$select public.cleanup_expired_food_logs();$$
);

-- Inspect:  select * from cron.job;   select * from cron.job_run_details order by start_time desc limit 10;
-- Remove:   select cron.unschedule('cleanup-expired-food-logs');
