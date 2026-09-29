-- =============================================================================
-- Öffentliche Sichten und Härtung (Plan §6 Grundsätze, §4.6, §7.5)
--   * decisions_public: veröffentlichte Urteile ohne interne Felder (decided_by)
--   * incidents_public: Beteiligte eines Vorfalls – nur wenn dazu ein Urteil
--     veröffentlicht ist, ohne Kontakt, IP-Hash, Beschreibung und Clip
--   * Tabellen hinter Definer-Views: kein FORCE RLS (der View-Eigentümer muss lesen können,
--     anon/authenticated sind nie Eigentümer und bleiben durch RLS ausgesperrt)
--   * Storage-Bucket media nur noch für WebP (Uploads werden im Browser umgewandelt)
--   * news.discord_post: Wunsch „in Discord posten“ bei geplanten News merken
-- =============================================================================

alter table public.drivers no force row level security;
alter table public.decisions no force row level security;
alter table public.incidents no force row level security;

-- Urteile nur noch über die View öffentlich
drop policy if exists "public read published decisions" on public.decisions;

create view public.decisions_public
with (security_invoker = false, security_barrier = true)
as
select
  d.id,
  d.public_ref,
  d.incident_id,
  d.round_id,
  d.session_id,
  d.driver_id,
  d.verdict,
  d.time_seconds,
  d.positions,
  d.penalty_points,
  d.reasoning_de,
  d.reasoning_en,
  d.rule_ref,
  d.clip_url,
  '{}'::uuid[] as decided_by,          -- intern: wer entschieden hat, bleibt privat
  d.status,
  d.published_at,
  d.created_at,
  d.updated_at
from public.decisions d
where d.status = 'published';

revoke all on public.decisions_public from public;
grant select on public.decisions_public to anon, authenticated;

create view public.incidents_public
with (security_invoker = false, security_barrier = true)
as
select
  i.id,
  i.round_id,
  i.session_id,
  i.involved_driver_ids,
  i.lap,
  i.corner,
  i.source
from public.incidents i
where exists (
  select 1 from public.decisions d
  where d.incident_id = i.id and d.status = 'published'
);

revoke all on public.incidents_public from public;
grant select on public.incidents_public to anon, authenticated;

update storage.buckets set allowed_mime_types = array['image/webp'] where id = 'media';

alter table public.news add column if not exists discord_post boolean not null default false;
