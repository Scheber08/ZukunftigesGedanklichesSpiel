-- =============================================================================
-- Vorbereitung Phase 2 (Plan §12):
--   * results.entered_status: eingegebener Status vor Steward-Strafen – beim Zurücknehmen
--     einer DSQ wird genau dieser Status wiederhergestellt (vorher: immer „gewertet“)
--   * seasons.penalty_points_config: Strafpunkte-System je Saison (Schwellen, Verfall)
-- =============================================================================

alter table public.results
  add column if not exists entered_status text
  check (entered_status is null or entered_status in ('classified', 'dnf', 'dns', 'dsq', 'dnc'));

-- Bestand: bisheriger Status gilt als eingegeben
update public.results set entered_status = status where entered_status is null;

-- { "warning_threshold": 6, "ban_threshold": 10, "expiry_rounds": 6 } – leer = Standardwerte
alter table public.seasons
  add column if not exists penalty_points_config jsonb not null default '{}'::jsonb;
