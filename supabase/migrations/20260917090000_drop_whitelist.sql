-- The whitelist sign-up was removed together with /cardano (#70). Remove its
-- table, the daily cleanup job and the retention rule that belonged to it.

select cron.unschedule(jobid)
from cron.job
where jobname = 'xportal-whitelist-pending-cleanup-daily';

drop function if exists public.run_whitelist_pending_cleanup();

delete from public.retention_policies
where record_type = 'whitelist_leads';

drop table if exists public.whitelist_leads;
