-- 0048 live_transcript_segments — realtime transcript segments from Twilio MediaStream + Deepgram.
--
-- Populated by /api/twilio/media-stream (WebSocket relay to Deepgram) whenever
-- DEEPGRAM_API_KEY is set in Vercel env. Each row is one Deepgram utterance or
-- word-level segment. call_sid ties back to call_events; agency_id enables RLS.
--
-- Realtime: added to supabase_realtime publication so the InCall panel can
-- subscribe and render rolling transcript without polling.

set local search_path = public;

create table if not exists public.live_transcript_segments (
  id              bigserial primary key,
  call_sid        text not null,
  call_event_id   bigint references public.call_events(id) on delete cascade,
  agency_id       uuid references public.agencies(id) on delete cascade,
  speaker         text check (speaker in ('rep','lead','unknown')),
  text            text not null,
  is_final        boolean not null default false,
  ts_offset_ms    int,
  created_at      timestamptz not null default now()
);

create index if not exists live_transcript_call_idx
  on public.live_transcript_segments (call_sid, created_at);

create index if not exists live_transcript_agency_idx
  on public.live_transcript_segments (agency_id, created_at desc);

alter table public.live_transcript_segments enable row level security;

drop policy if exists "transcript_visible" on public.live_transcript_segments;
create policy "transcript_visible" on public.live_transcript_segments
  for select to authenticated
  using (public.is_super_admin() or agency_id = ANY (public.viewer_agency_ids()));

-- Service role writes (from media-stream webhook)
drop policy if exists "transcript_service_write" on public.live_transcript_segments;
create policy "transcript_service_write" on public.live_transcript_segments
  for insert to service_role with check (true);

do $$ begin
  perform 1 from pg_publication where pubname = 'supabase_realtime';
  if found then
    begin
      alter publication supabase_realtime add table public.live_transcript_segments;
    exception when duplicate_object then null;
    end;
  end if;
end $$;
