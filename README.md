# [LIGANAME] – Website der Online-Liga für EA SPORTS F1® 25

Eine einzige Website für die ganze Liga: Infos, Regelwerk, Kalender mit Countdown, Ergebnisse,
Wertungen, Fahrer- und Teamprofile, Stewards-Register, News, Hall of Fame, Anmeldung – und ein
Admin-Bereich mit Discord-Login, in dem das Orga-Team alles pflegt (Grid-Builder, Ergebnis-Eingabe,
Steward-Werkzeug, News in Deutsch und Englisch).

> `[LIGANAME]` ist ein Platzhalter, bis der Name feststeht (kein „F1“ im Namen, siehe
> [Plan §9.1](docs/PLAN.md)). Er steht zentral in `src/config/site.ts`.

**Stand:** Phase 1 (MVP) in Arbeit · Stack: Astro 7 · Svelte 5 · Tailwind CSS 4 · Supabase · Cloudflare Workers

---

## Schnellstart (lokal, ohne Datenbank)

Du brauchst nur **Node.js 24** (mindestens 22.15) und **Git**. Eine Datenbank oder Zugangsdaten
brauchst du nicht: Ohne Konfiguration startet die Website im **Demo-Modus** mit erfundenen
Beispieldaten (zwei Saisons, 30 Fahrer, Ergebnisse, Urteile, News).

```bash
git clone https://github.com/Scheber08/ZukunftigesGedanklichesSpiel.git
cd ZukunftigesGedanklichesSpiel
npm install
npm run dev
```

Dann im Browser öffnen: **http://localhost:4321**

- Englische Seiten liegen unter http://localhost:4321/en
- **Admin-Bereich:** http://localhost:4321/admin/login → „Als Demo-Admin“ (oder Steward/Redaktion) wählen.
  Im Demo-Modus gehen alle Änderungen beim Neustart des Servers verloren – ideal zum Ausprobieren.
- Ein Hinweis unten rechts zeigt an, dass du Demo-Daten siehst.
- Im Dev-Server erscheinen Änderungen aus dem Admin sofort auf den öffentlichen Seiten. Im fertigen
  Build (Produktion, Vorschau, E2E-Tests) sind diese Seiten statisch und ändern sich erst mit dem
  nächsten Rebuild – genau wie später online.
- Astro 7 erlaubt **einen** Dev-Server pro Projekt. Läuft schon einer, einfach dessen Adresse nutzen
  (`npx astro dev status`) statt einen zweiten zu starten. Weitere Hinweise:
  [SETUP.md, Anhang A](docs/SETUP.md#anhang-a-lokale-entwicklung-mit-echter-datenbank).

Mit echter Datenbank arbeiten: `.env.example` nach `.env` kopieren und ausfüllen
(Anleitung in [docs/SETUP.md](docs/SETUP.md)).

## Befehle

| Befehl | Was passiert |
|---|---|
| `npm run dev` | Entwicklungsserver auf http://localhost:4321 (lädt Änderungen sofort neu) |
| `npm run build` | Produktions-Build nach `dist/` (ohne `SUPABASE_URL` nur mit `DEMO_MODE=true`) |
| `npm run preview` | Den Build lokal ansehen |
| `npm run check` | Typprüfung (`astro check`) |
| `npm run lint` | Typprüfung plus `svelte-check` |
| `npm test` | Unit-Tests (Vitest): Punkte, Wertung, Spam-Schutz, Markdown-Sicherheit, i18n … |
| `npm run test:e2e` | Browser-Tests (Playwright + axe): baut die Website im Demo-Modus und testet sie mit `astro preview` auf Port 4322 (läuft neben dem Dev-Server). `E2E_SKIP_BUILD=true` nutzt den vorhandenen Build |
| `npm run test:e2e:install` | Einmalig: Chromium für Playwright herunterladen |
| `npm run test:links` | nur den Link-Check: crawlt alle internen Links, Ressourcen und #Sprungziele über den Demo-Build und prüft nebenbei, dass keine privaten Daten (Anmeldungen, Kontaktanfragen, Entwürfe) öffentlich auftauchen (Teil von `test:e2e`) |
| `npm run db:seed:generate` | `supabase/seed.sql` aus `src/lib/seed/base.ts` neu erzeugen |
| `npm run db:seed:demo` | zusätzlich `supabase/demo.sql` (Demo-Liga für eine Test-Datenbank) |
| `npm run db:seed:check` | prüft, ob `seed.sql` aktuell ist (läuft in der CI) |
| `npm run deploy` | Build + `wrangler deploy` von Hand (normalerweise macht das GitHub Actions) |

## Projektstruktur

```
src/
  pages/          Routen: Deutsch ohne Präfix, Englisch unter pages/en/, Admin unter pages/admin/
  views/          Seiten-Implementierungen (bekommen die Sprache als Prop)
  components/     UI-Bausteine (ui/, sport/, layout/, admin/ …)
  layouts/        BaseLayout (öffentlich), AdminLayout
  lib/domain/     reine Fachlogik: Punkte, Wertung, Statistik, Grid-Prüfung, ICS, Zeitzonen
  lib/league/     League-Klasse: alle öffentlichen Daten + berechnete Sichten
  lib/server/     nur Server: Env, Datenbank, Auth, Discord, Spam-Schutz, Rebuild, Cron
  lib/seed/       Basisdaten (Teams, Strecken, Regelwerk, FAQ) und Demo-Daten
  i18n/           Routen mit übersetzten Slugs und Wörterbücher (de/en)
  actions/        Astro Actions für Formulare und Admin
supabase/
  migrations/     Datenbankschema, Row Level Security, Wartungsfunktionen
  seed.sql        Basisdaten (erzeugt), demo.sql (Demo-Liga, erzeugt), config.toml (Supabase CLI)
tests/
  unit/           Vitest      e2e/  Playwright + axe      mocks/  Test-Ersatz für astro:env
.github/          CI, Deploy, Backup, Dependabot
docs/             Plan, Architektur, Setup, Handbuch, Runbook, Betrieb
```

## Dokumentation

| Dokument | Für wen | Inhalt |
|---|---|---|
| [docs/PLAN.md](docs/PLAN.md) | alle | Der vollständige fachliche Plan: Entscheidungen, Seiten, Datenmodell, Roadmap |
| [docs/SETUP.md](docs/SETUP.md) | Liga-Leitung, Technik | Phase 0 Schritt für Schritt: Konten, Supabase, Discord, Cloudflare, GitHub, Launch-Checkliste |
| [docs/ADMIN-HANDBUCH.md](docs/ADMIN-HANDBUCH.md) | Admins, Stewards, Redaktion | Alle Admin-Module aus Nutzersicht |
| [docs/RENNTAG-RUNBOOK.md](docs/RENNTAG-RUNBOOK.md) | Admins, Stewards, Host | Ablauf eines Renntags mit Klickwegen und Notfallplan |
| [docs/BETRIEB.md](docs/BETRIEB.md) | Technik | Backups, Wiederherstellung, Monitoring, Rebuild, Freeze, Saisonwechsel |
| [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md) | Entwickler | Konventionen, Design-Klassen, Sicherheitsregeln |

## So kommt eine Änderung live

- **Inhalte** (Ergebnis, News, Urteil, Kalender, Aufstellung) werden im Admin-Bereich veröffentlicht.
  Die Website baut sich danach automatisch neu – nach **etwa 1–3 Minuten** ist alles online.
- **Code** wird über GitHub ausgerollt: Pull Request → automatische Prüfungen und eine
  Demo-Vorschau → Merge in `main` → Deploy. Am Renntag sind Code-Deploys gesperrt
  (Renntags-Freeze), Inhalte gehen weiterhin raus. Details: [docs/BETRIEB.md](docs/BETRIEB.md).

## Qualität

Jeder Push und jeder Pull Request durchläuft die CI (`.github/workflows/ci.yml`):
Typprüfung, Unit-Tests, Build, Link-Check, ein Test der Migrationen und der Zugriffsregeln
(Row Level Security, öffentliche Fahrer-Sicht `drivers_public`) gegen eine echte Postgres-Datenbank,
Browser-Tests des Produktions-Builds mit Barrierefreiheits-Prüfung (axe, WCAG 2.2 AA) und ein
Lighthouse-Budget (JS < 50 KB, Seite < 300 KB, LCP < 2 s, CLS < 0,05). Pull Requests bekommen
zusätzlich eine Demo-Vorschau auf Cloudflare (sobald der Cloudflare-Zugang als Secret hinterlegt ist).
Statische Leitplanken (`tests/unit/infra-guards.test.ts`) schlagen Alarm, wenn eine neue Admin-Action
die Rollenprüfung vergisst, ein öffentliches Formular ohne Spam-Schutz läuft, eine Admin-Seite
vorgerendert würde, ein Inline-Skript die CSP bricht oder Client-Code Server-Module importiert.

## Rechtliches

Inoffizielle Fan-Liga. Nicht verbunden mit Formula One Group, FIA, Electronic Arts oder Codemasters.
F1® ist eine Marke der Formula One Licensing B.V. Die Website verwendet keine F1-, Team- oder
Konsolen-Logos; Rennen heißen z. B. „R5 · Suzuka“. Schriften (Titillium Web, Inter) stehen unter der
SIL Open Font License und werden selbst ausgeliefert.
