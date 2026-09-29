-- =============================================================================
-- CI: Plausibilität der Demo-Daten (supabase/demo.sql) und Row Level Security.
-- Prüft als anon, was Besucher sehen dürfen (Plan §6: RLS standardmäßig „deny“),
-- und dass nur service_role an private Daten kommt.
-- =============================================================================

-- ------------------------------------------------------------------ Trigger & Daten
do $$
declare
  n integer;
begin
  select count(*) into n from public.seasons where status = 'active';
  if n <> 1 then raise exception 'seasons: % aktive Saisons statt 1', n; end if;

  select count(*) into n from public.drivers;
  if n < 22 then raise exception 'drivers: nur % Fahrer', n; end if;

  select count(*) into n from public.results;
  if n < 100 then raise exception 'results: nur % Ergebniszeilen', n; end if;

  -- Rundenzeit-Trigger: start_utc = Ortszeit in der Zeitzone der Runde
  select count(*) into n from public.rounds where start_utc <> (local_start at time zone timezone);
  if n <> 0 then raise exception 'rounds: % Runden mit falscher start_utc', n; end if;

  -- Protestfrist = vorläufig + Stunden laut Saison
  select count(*) into n
  from public.rounds r join public.seasons s on s.id = r.season_id
  where r.provisional_at is not null
    and r.protest_deadline <> r.provisional_at + make_interval(hours => s.protest_window_hours);
  if n <> 0 then raise exception 'rounds: % Runden mit falscher Protestfrist', n; end if;

  -- Jede aktive Startnummer nur einmal
  select count(*) into n from (
    select number from public.driver_numbers where valid_to is null group by number having count(*) > 1
  ) d;
  if n <> 0 then raise exception 'driver_numbers: % doppelt vergebene Nummern', n; end if;

  raise notice 'Demo-Daten OK';
end;
$$;

-- ------------------------------------------------------------------ Erwartungswerte (als Eigentümer)
create temp table expected as
select
  (select count(*) from public.decisions where status = 'published')                          as decisions_published,
  (select count(*) from public.decisions where status <> 'published')                         as decisions_hidden,
  (select count(*) from public.news where status = 'published' and (publish_at is null or publish_at <= now())) as news_visible,
  (select count(*) from public.news)                                                          as news_total,
  (select count(*) from public.settings where is_public)                                      as settings_public,
  (select count(*) from public.registrations)                                                 as registrations_total,
  (select count(*) from public.results res join public.sessions s on s.id = res.session_id
     join public.rounds r on r.id = s.round_id where r.status in ('provisional', 'final', 'corrected')) as results_visible;
grant select on expected to anon, service_role;

-- ------------------------------------------------------------------ Sicht als anon (Besucher, statischer Build)
set role anon;

do $$
declare
  e record;
  n integer;
begin
  select * into e from expected;

  -- private Tabellen: keine einzige Zeile
  select count(*) into n from public.registrations;      if n <> 0 then raise exception 'anon sieht % Anmeldungen', n; end if;
  select count(*) into n from public.driver_private;     if n <> 0 then raise exception 'anon sieht private Fahrerdaten'; end if;
  select count(*) into n from public.incidents;          if n <> 0 then raise exception 'anon sieht % Vorfallmeldungen', n; end if;
  select count(*) into n from public.contact_messages;   if n <> 0 then raise exception 'anon sieht Kontaktanfragen'; end if;
  select count(*) into n from public.staff_accounts;     if n <> 0 then raise exception 'anon sieht Staff-Konten'; end if;
  select count(*) into n from public.audit_log;          if n <> 0 then raise exception 'anon sieht das Audit-Log'; end if;
  select count(*) into n from public.round_absences;     if n <> 0 then raise exception 'anon sieht Abmeldungen'; end if;

  -- nur Veröffentlichtes
  select count(*) into n from public.decisions;
  if n <> e.decisions_published then raise exception 'anon sieht % Urteile, erwartet %', n, e.decisions_published; end if;
  if e.decisions_hidden = 0 then raise exception 'Demo-Daten ohne Urteils-Entwurf – RLS-Test wäre wertlos'; end if;

  select count(*) into n from public.news;
  if n <> e.news_visible then raise exception 'anon sieht % News, erwartet %', n, e.news_visible; end if;
  if e.news_total <= e.news_visible then raise exception 'Demo-Daten ohne News-Entwurf – RLS-Test wäre wertlos'; end if;

  select count(*) into n from public.settings;
  if n <> e.settings_public then raise exception 'anon sieht % Einstellungen, erwartet % öffentliche', n, e.settings_public; end if;
  select count(*) into n from public.settings where key in ('webhooks', 'discord_role_map', 'twitch_token', 'rebuild');
  if n <> 0 then raise exception 'anon sieht private Einstellungen'; end if;

  select count(*) into n from public.results;
  if n <> e.results_visible then raise exception 'anon sieht % Ergebnisse, erwartet %', n, e.results_visible; end if;

  select count(*) into n from public.round_entries re join public.rounds r on r.id = re.round_id where r.status = 'scheduled';
  if n <> 0 then raise exception 'anon sieht Aufstellungen geplanter Runden'; end if;

  -- Schreiben ist für anon immer verboten
  begin
    insert into public.teams (slug, name, short_name, color_hex) values ('anon-test', 'X', 'X', '#000000');
    raise exception 'anon darf in teams schreiben';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.seasons set name = 'gehackt';
    raise exception 'anon darf seasons ändern';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.run_retention();
    raise exception 'anon darf run_retention ausführen';
  exception when insufficient_privilege then null;
  end;

  raise notice 'RLS für anon OK';
end;
$$;

reset role;

-- ------------------------------------------------------------------ Sicht als service_role (Worker nach Rollenprüfung)
set role service_role;

do $$
declare
  e record;
  n integer;
  result jsonb;
begin
  select * into e from expected;
  select count(*) into n from public.registrations;
  if n <> e.registrations_total then raise exception 'service_role sieht % Anmeldungen, erwartet %', n, e.registrations_total; end if;
  select public.run_retention() into result;
  if result is null or not (result ? 'deleted_rate_events') then raise exception 'run_retention liefert kein Protokoll'; end if;
  raise notice 'service_role OK: %', result;
end;
$$;

reset role;
