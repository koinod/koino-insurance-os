-- 0102 — add lead_name to call_recordings so uploads, coaching, and training
-- surfaces can label recordings without relying on a join.

alter table public.call_recordings
  add column if not exists lead_name text;

update public.call_recordings cr
   set lead_name = p.lead_name
  from public.pipeline p
 where cr.lead_name is null
   and cr.lead_id = p.id
   and p.lead_name is not null;

create index if not exists call_recordings_lead_name_idx
  on public.call_recordings (lead_name);

