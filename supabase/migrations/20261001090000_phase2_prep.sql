-- =============================================================================
-- Vorbereitung Phase 2 (Plan §12):
--   * results.entered_status: eingegebener Status vor Steward-Strafen – beim Zurücknehmen
--     einer DSQ wird genau dieser Status wiederhergestellt (vorher: immer „gewertet“)
--   * seasons.penalty_points_config: Strafpunkte-System je Saison (Schwellen, Verfall)
-- =============================================================================

alter table public.results
  add column if not exists entered_status text
  check (entered_status is null or entered_status in ('classified', 'dnf', 'dns', 'dsq', 'dnc'));

-- Bestand: bisheriger Status gilt als eingegeben – außer bei Zeilen, die ein veröffentlichtes
-- DSQ-Urteil auf 'dsq' gesetzt hat. Die bleiben leer; beim Zurücknehmen holt der Code den Status
-- von vor der DSQ aus dem Audit-Log (sonst „gewertet“).
update public.results r set entered_status = r.status
where r.entered_status is null
  and not (
    r.status = 'dsq'
    and exists (
      select 1
      from public.decisions d
      join public.sessions s on s.id = r.session_id
      where d.status = 'published'
        and d.verdict = 'dsq'
        and d.driver_id = r.driver_id
        and d.round_id = s.round_id
        and (d.session_id = r.session_id or (d.session_id is null and s.type = 'race'))
    )
  );

-- { "warning_threshold": 6, "ban_threshold": 10, "expiry_rounds": 6 } – leer = Standardwerte
alter table public.seasons
  add column if not exists penalty_points_config jsonb not null default '{}'::jsonb;
