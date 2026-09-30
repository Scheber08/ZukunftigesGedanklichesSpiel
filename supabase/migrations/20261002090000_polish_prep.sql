-- =============================================================================
-- Vorbereitung Feinschliff nach dem Plan-Abgleich:
--   * seasons.raceday_deadlines: Renntag-Fristen je Saison (Plan §11.1), leer = Standardwerte
--   * news.og_image: eigenes Vorschaubild (1200×630) für Artikel ohne Titelbild (Plan §4.7)
--   * drivers.is_minor: 16–17-Jährige – öffentlich nur Gamertag (Plan §9.3). Die Spalte ist
--     nicht Teil der View drivers_public (explizite Spaltenliste) und damit nie öffentlich.
-- =============================================================================

-- { "lineup_hours_before": 24, "results_hours_after": 2, "decisions_hours_after_protest": 72 }
alter table public.seasons
  add column if not exists raceday_deadlines jsonb not null default '{}'::jsonb;

alter table public.news
  add column if not exists og_image text;

alter table public.drivers
  add column if not exists is_minor boolean not null default false;
