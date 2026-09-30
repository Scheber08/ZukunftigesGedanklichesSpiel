# Architektur & Konventionen

Kurzüberblick für alle, die am Code arbeiten. Der fachliche Plan steht in [`PLAN.md`](PLAN.md) (Entscheidungen, Seiten, Datenmodell).

## Stack

- **Astro 7** (statisch vorgerendert + Cloudflare Worker für dynamische Routen), **Svelte 5** für Islands, **Tailwind CSS 4** mit Design-Tokens in `src/styles/global.css`.
- **Supabase** (Postgres + Auth + Storage), Migrationen in `supabase/migrations`.
- **Demo-Modus:** Ohne `SUPABASE_URL` (lokal) oder mit `DEMO_MODE=true` läuft alles gegen einen In-Memory-Store mit Beispieldaten (`src/lib/seed/demo.ts`). Admin-Login im Demo-Modus mit wählbarer Rolle.

## Verzeichnisse

| Pfad | Inhalt |
|---|---|
| `src/lib/domain/` | Reine Fachlogik ohne I/O (Punkte, Wertung, Statistik, Grid-Prüfung, Nummern, ICS, Zeitzonen, Strafpunkte-Konto, Head-to-Head). **Immer mit Unit-Tests** in `tests/unit/`. |
| `src/lib/db/` | Zeilentypen (`types.ts`), Store-Schnittstelle, Supabase- und Memory-Store. |
| `src/lib/league/league.ts` | `League`: alle öffentlichen Daten + berechnete Sichten (Wertungen, Profile, Hall of Fame, Inhalte). |
| `src/lib/server/` | Nur serverseitig: Env, Store-Zugriff, Loader, Auth, Discord, Spam-Schutz, Rebuild, Audit, Cron. |
| `src/i18n/` | Routen mit übersetzten Slugs (`routes.ts`, `url()`, `alternates()`), Wörterbücher `locales/<de|en>/<bereich>.json`. |
| `src/views/` | Seiten-Implementierungen, die eine `lang`-Prop bekommen. |
| `src/pages/` | Dünne Routen-Dateien: DE ohne Präfix, EN unter `src/pages/en/`. Sie rendern nur die View. |
| `src/components/ui/` | Basis-Komponenten (Badge, Flag, DriverLink, TeamName, PageHeader, SectionTitle, Markdown, LocalTime, Legend, ShareButton, EmptyState, TranslationNotice). |
| `src/components/sport/` | ResultsTable, DriverStandingsTable, TeamStandingsTable, MatrixTable, PointsChart, Countdown (Svelte). |
| `src/lib/import/` | Telemetrie-/CSV-Import (Plan Phase 2): CSV-Parser, Zuordnung über die Startnummer, Stapel; `service.ts` nur serverseitig. |
| `tools/telemetry/` | Companion-Programm für den Lobby-PC (Node ≥ 22, ohne Abhängigkeiten): liest die UDP-Pakete des Spiels und lädt das Ergebnis nach `/api/import` hoch. Siehe [`TELEMETRIE.md`](TELEMETRIE.md). |
| `src/lib/graphics/` | Social-Grafiken: reine Layout-, Motiv- und Datenlogik; `draw.ts` zeichnet im Admin-Browser (Canvas). |
| `src/lib/tracks/` | Streckenseiten und Rekorde. |
| `src/lib/server/live-data.ts` | Schlanke Live-Daten für OBS-Overlays und den Discord-Bot (gezielte Abfragen statt `loadLeague()`). Siehe [`OVERLAYS.md`](OVERLAYS.md). |
| `src/lib/discord-bot/` | Discord-Bot über den Interactions-Endpunkt `/api/discord/interactions` (Ed25519-Signatur, Slash-Befehle). Siehe [`DISCORD-BOT.md`](DISCORD-BOT.md). |
| `src/actions/` | Astro Actions: `public.ts` (Formulare), `admin/*.ts` (Admin, unter `actions.admin.*`). |
| `src/layouts/` | `BaseLayout.astro` (öffentlich), `AdminLayout.astro` (Admin). |

## Muster

### Öffentliche Seite (statisch)

```astro
---
// src/pages/kalender.astro
import CalendarView from '~/views/CalendarView.astro';
---
<CalendarView lang="de" />
```

Die View lädt die Daten mit `const league = await loadLeague();` (einmal pro Build gecacht), rendert `<BaseLayout lang={lang} title=… description=… alternates={alternates('calendar')}>` und nutzt `useT(lang)` für UI-Texte. Dynamische Routen exportieren `getStaticPaths()` in der Seiten-Datei (z. B. über eine Hilfsfunktion aus der View-Datei oder `src/lib/…`).

### Dynamische Seite (Worker)

Formulare, Admin, APIs: `export const prerender = false;` in der Seiten-Datei. Im Worker **nie** `loadLeague()` für einzelne Werte benutzen (zu teuer), sondern gezielt `getServiceStore().select(…)`/`getPublicStore()` bzw. `loadPublicSettings()`.

### Texte & Sprachen

- UI-Texte nur über `t('schlüssel')`. Neue Schlüssel in **beiden** Sprachen im eigenen Bereichs-JSON anlegen (Typcheck meldet fehlende Schlüssel).
- DB-Inhalte zweisprachig: `localized(row, 'title', lang)` bzw. `loc(...)`; fehlt EN, wird DE gezeigt und `<TranslationNotice>` eingeblendet.
- Datum/Zeit mit `src/lib/domain/time.ts` (Liga-Zeit Europe/Berlin), `<LocalTime>` ergänzt die Besucher-Zeit.
- Renn-Bezeichnungen immer `roundLabel()` („R5 · Suzuka“), keine offiziellen Event-Titel.

### Design

- Tokens: `bg-bg`, `bg-surface-1`, `bg-surface-2`, `border-border`, `text-fg`, `text-muted`, `text-green`, `text-teal`, `text-danger`, `text-warning`; Plan-Aliase `--c-*`, Verlauf `--g-accent`.
- Komponenten-Klassen: `container-page`, `section`, `page-header`, `section-title`, `display`, `micro`, `btn btn-primary|btn-secondary|btn-ghost|btn-danger (btn-sm, btn-icon)`, `card card-hover`, `badge badge-*`, `table-wrap` + `timing-table` (`pos`, `num`, `sticky-col`, `gamertag`, `muted`), `tabs`/`tab`, `segmented`, `accordion`, `field`/`label`/`input`/`select`/`textarea`/`checkbox`/`field-hint`/`field-error`, `alert alert-success|warning|danger`, `prose`, `hp-field` (Honeypot).
- Teamfarben nur als 4-px-Streifen (`team-stripe` mit `style={teamStyle(team)}`), keine Teamlogos, keine Konsolen-Logos.
- Farbe nie alleiniger Informationsträger (Pole „P“, schnellste Runde mit Stoppuhr-Icon, DNF als Text).
- Genau eine `<h1>` pro Seite. Tabellen mit `<caption>` (ggf. `sr-only`) und `th scope`.
- Mobile first ab 320 px, Touch-Ziele ≥ 44 px.

### Sicherheit

- CSP ist aktiv: **keine `is:inline`-Skripte mit Inline-Code**, keine Inline-Event-Handler (`onclick=`). Client-Code in `<script>`-Blöcken (werden gebündelt) oder Svelte-Islands. Einzige Ausnahme: das Zeitzonen-Skript im `<head>` (`src/lib/tz-inline.mjs`, gegen Layout-Verschiebung), dessen SHA-256-Hash `astro.config.mjs` automatisch in die CSP schreibt. Externe Skripte nur Turnstile und (nach Einwilligung) GA.
- Einstellungen nur mit Patch-Semantik schreiben: `applySettingPatch()` aus `src/lib/admin/league/settings-patch.ts` überschreibt nur übermittelte Unterschlüssel und lässt `updated_at` bei unveränderten Werten stehen.
- Fahrer- und Team-Slugs werden gegen `src/lib/admin/league/slugs.ts` geprüft: Feste Unterseiten (z. B. `/fahrer/vergleich`) sind reserviert. Neue feste Unterseiten unter `/fahrer` bzw. `/teams` in `ROUTES` eintragen, dann sind sie automatisch reserviert.
- Weiterleitungen: Beim Umbenennen von Fahrer-, Team-, Saison- oder News-Slugs `recordSlugChange()` aufrufen; alte URLs leiten per 301 um (Worker, `src/worker.ts`).
- Öffentliche Daten: `getPublicStore()` liest `drivers`, `decisions` und `incidents` über die Views `drivers_public`, `decisions_public`, `incidents_public` (nur öffentliche Spalten/Zeilen).
- Secrets nur serverseitig (`src/lib/server/env.ts`). Schreibzugriffe nur über Actions/Endpunkte mit Rollenprüfung (`staffFrom(context, 'admin')`).
- Öffentliche Formulare: `guardPublicForm()` (Honeypot, Zeitfalle, Turnstile, Rate-Limit).
- Markdown aus der DB nur über `renderMarkdown()` / `<Markdown>` (kein rohes HTML).
- In Quelltexten keine `\u`-Escapes für unsichtbare Zeichen verwenden, sondern `String.fromCharCode(...)`.

### Tests

- Fachlogik: Vitest (`npm test`).
- Seiten: Playwright + axe (`npm run test:e2e`) gegen den Demo-Modus.
