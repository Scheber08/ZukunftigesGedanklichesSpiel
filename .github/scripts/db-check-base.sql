-- =============================================================================
-- CI: Plausibilitätsprüfung nach Migrationen + supabase/seed.sql
-- =============================================================================

do $$
declare
  n integer;
  new_id bigint;
begin
  select count(*) into n from public.teams;
  if n <> 11 then raise exception 'teams: % Zeilen statt 11', n; end if;

  select count(*) into n from public.tracks;
  if n < 24 then raise exception 'tracks: nur % Strecken', n; end if;

  select count(*) into n from public.points_schemes;
  if n < 1 then raise exception 'points_schemes: keine Vorlagen'; end if;

  select count(*) into n from public.rules_versions where status = 'published';
  if n <> 1 then raise exception 'rules_versions: % veröffentlichte Versionen statt 1', n; end if;

  select count(*) into n from public.rules_sections where parent_id is null;
  if n < 5 then raise exception 'rules_sections: nur % Kapitel', n; end if;

  select count(*) into n from public.faq_items;
  if n < 5 then raise exception 'faq_items: nur % Einträge', n; end if;

  select count(*) into n from public.settings where is_public;
  if n < 5 then raise exception 'settings: nur % öffentliche Schlüssel', n; end if;

  select count(*) into n from public.settings where not is_public;
  if n < 3 then raise exception 'settings: nur % private Schlüssel', n; end if;

  -- Keine Fahrer, Saisons oder Ergebnisse in den Basisdaten
  select count(*) into n from public.drivers;
  if n <> 0 then raise exception 'seed.sql enthält % Fahrer', n; end if;

  -- Identitäts-Sequenzen stehen hinter den Seed-IDs
  insert into public.teams (slug, name, short_name, color_hex)
  values ('ci-sequenz-test', 'CI', 'CI', '#000000')
  returning id into new_id;
  if new_id <= 11 then raise exception 'Sequenz von teams nicht gesetzt (neue id = %)', new_id; end if;
  delete from public.teams where id = new_id;

  insert into public.rules_sections (version_id, number, anchor, title_de)
  values (1, '§999', 'p999', 'CI')
  returning id into new_id;
  delete from public.rules_sections where id = new_id;

  raise notice 'Basisdaten OK';
end;
$$;
