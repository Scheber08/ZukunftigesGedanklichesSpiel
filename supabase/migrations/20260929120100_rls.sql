-- =============================================================================
-- Row Level Security (Plan §6: RLS standardmäßig „deny“)
--
-- * RLS ist auf ALLEN Tabellen aktiv. Ohne Policy gibt es keinen Zugriff.
-- * anon/authenticated dürfen nur veröffentlichte, öffentliche Daten LESEN.
-- * Schreiben passiert ausschließlich serverseitig mit dem Service-Key
--   (service_role umgeht RLS) – nach der Rollenprüfung im Worker.
-- =============================================================================

do $$
declare
  t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t.tablename);
    execute format('alter table public.%I force row level security', t.tablename);
  end loop;
end;
$$;

-- Browser-Rollen dürfen nie schreiben, auch nicht bei einer versehentlich zu weiten Policy.
revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke insert, update, delete, truncate on tables from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Öffentlich lesbar: Stammdaten
-- -----------------------------------------------------------------------------

create policy "public read" on public.points_schemes   for select to anon, authenticated using (true);
create policy "public read" on public.seasons          for select to anon, authenticated using (true);
create policy "public read" on public.tracks           for select to anon, authenticated using (true);
create policy "public read" on public.rounds           for select to anon, authenticated using (true);
create policy "public read" on public.sessions         for select to anon, authenticated using (true);
create policy "public read" on public.teams            for select to anon, authenticated using (true);
create policy "public read" on public.season_teams     for select to anon, authenticated using (true);
create policy "public read" on public.drivers          for select to anon, authenticated using (true);
create policy "public read" on public.driver_numbers   for select to anon, authenticated using (true);
create policy "public read" on public.seats            for select to anon, authenticated using (true);
create policy "public read" on public.round_corrections for select to anon, authenticated using (true);
create policy "public read" on public.standings_snapshots for select to anon, authenticated using (true);
create policy "public read" on public.awards           for select to anon, authenticated using (true);
create policy "public read" on public.faq_items        for select to anon, authenticated using (true);
create policy "public read" on public.staff_members    for select to anon, authenticated using (true);

-- -----------------------------------------------------------------------------
-- Öffentlich lesbar: nur veröffentlichte Zeilen
-- -----------------------------------------------------------------------------

-- Aufstellung erst, wenn sie veröffentlicht wurde
create policy "public read published lineups" on public.round_entries
  for select to anon, authenticated
  using (exists (
    select 1 from public.rounds r
    where r.id = round_entries.round_id and r.status <> 'scheduled'
  ));

-- Ergebnisse erst ab „vorläufig“
create policy "public read published results" on public.results
  for select to anon, authenticated
  using (exists (
    select 1
    from public.sessions s
    join public.rounds r on r.id = s.round_id
    where s.id = results.session_id and r.status in ('provisional', 'final', 'corrected')
  ));

create policy "public read published decisions" on public.decisions
  for select to anon, authenticated
  using (status = 'published');

create policy "public read published news" on public.news
  for select to anon, authenticated
  using (status = 'published' and (publish_at is null or publish_at <= now()));

create policy "public read published rules" on public.rules_versions
  for select to anon, authenticated
  using (status in ('published', 'archived'));

create policy "public read published rule sections" on public.rules_sections
  for select to anon, authenticated
  using (exists (
    select 1 from public.rules_versions v
    where v.id = rules_sections.version_id and v.status in ('published', 'archived')
  ));

create policy "public read active positions" on public.open_positions
  for select to anon, authenticated
  using (active);

create policy "public read active partners" on public.partners
  for select to anon, authenticated
  using (active);

create policy "public read public settings" on public.settings
  for select to anon, authenticated
  using (is_public);

-- -----------------------------------------------------------------------------
-- Bewusst OHNE Policy (nur Service-Key):
--   driver_private, round_absences, incidents, registrations, contact_messages,
--   staff_accounts, audit_log, rate_limit_events, import_batches
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- Storage: öffentlicher Bucket für Titelbilder, Partnerlogos, Avatare.
-- Upload nur über signierte Upload-URLs, die der Server nach der Rollenprüfung ausstellt.
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 2097152, array['image/webp', 'image/png', 'image/jpeg', 'image/svg+xml'])
on conflict (id) do nothing;
