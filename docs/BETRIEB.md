# Technischer Betrieb

Wie die Website im Alltag läuft, was automatisch passiert und was Menschen regelmäßig tun müssen
(Plan §11). Zielgruppe: die Technik-Verantwortlichen der Liga – mit Erklärungen, die auch ohne
tiefe Vorkenntnisse funktionieren.

**Inhalt**

- [Auf einen Blick](#auf-einen-blick): Was läuft automatisch, was ist Handarbeit?
- [Rebuild nach „Veröffentlichen“](#rebuild-nach-veröffentlichen)
- [Deploy und Renntags-Freeze](#deploy-und-renntags-freeze)
- [Backups](#backups) · [Wiederherstellung](#wiederherstellung) · [Wiederherstellungstest (vierteljährlich)](#wiederherstellungstest-vierteljährlich)
- [Keep-alive und Löschfristen](#keep-alive-und-löschfristen)
- [Monitoring](#monitoring)
- [Updates (Dependabot)](#updates-dependabot)
- [Aktualitäts-Check](#aktualitäts-check)
- [Accounts, Zugänge und Bus-Faktor](#accounts-zugänge-und-bus-faktor)
- [Saisonwechsel](#saisonwechsel)
- [Test-Datenbank für die Beta](#test-datenbank-für-die-beta)
- [Kosten und Free-Tier-Grenzen](#kosten-und-free-tier-grenzen)

---

## Auf einen Blick

| Was | Wann | Wie | Wer muss handeln? |
|---|---|---|---|
| Rebuild nach Veröffentlichen | ~60 s nach der letzten Änderung | Worker-Cron → GitHub `repository_dispatch` → `deploy.yml` | niemand |
| Frische der statischen Seiten | täglich 03:41 UTC | `deploy.yml` (schedule) | niemand |
| Code-Deploy | bei jedem Push auf `main` | `deploy.yml`, am Renntag gesperrt | Entwickler (Merge) |
| CI mit Tests, Link-Check, Lighthouse | jeder Push/PR | `ci.yml` | bei Fehlern: Entwickler |
| Backup der Datenbank | täglich 02:17 UTC | `backup.yml` → R2, 30 Tage | niemand; bei Fehlermail: Technik |
| Keep-alive Supabase, Löschfristen | täglich 03:17 UTC | Worker-Cron | niemand |
| Twitch-Status, geplante News | jede Minute | Worker-Cron | niemand |
| Discord-Mitgliederzahlen | alle 10 Minuten | Worker-Cron | niemand |
| **Wiederherstellungstest** | **vierteljährlich** | Handarbeit, siehe unten | **Technik** |
| **Aktualitäts-Check der Inhalte** | **vierteljährlich** | Handarbeit | **Redaktion** |
| Dependabot-Updates prüfen | wöchentlich (montags) | Pull Requests | Technik |
| Saison-Snapshot | zum Saisonende | `backup.yml` manuell mit Namen | Technik |

---

## Rebuild nach „Veröffentlichen“

Die öffentlichen Seiten sind **statisch vorgerendert** (Plan §7.2): Beim Build liest Astro alle Daten
aus Supabase und erzeugt fertiges HTML. Das ist schnell, kostenlos und übersteht jeden Ansturm.
Damit Änderungen aus dem Admin online gehen, wird neu gebaut:

```
Admin klickt „Veröffentlichen“
  → Worker setzt settings.rebuild.requested_at (requestRebuild)
  → Worker-Cron prüft jede Minute (processRebuildQueue):
       frühestens 60 s nach der LETZTEN Anforderung → GitHub repository_dispatch (type „publish“)
  → GitHub Actions: deploy.yml baut mit den aktuellen Daten und führt `wrangler deploy` aus
  → nach ca. 1–3 Minuten ist die Änderung online
```

- Mehrere Änderungen kurz hintereinander ergeben **einen** Build (Bündelung).
- Wartende Deploys werden zusammengefasst (Concurrency-Gruppe `deploy-production`): Es läuft nie mehr als
  ein Deploy gleichzeitig, von den wartenden bleibt nur der neueste.
- Der **tägliche Build** um 03:41 UTC hält Countdown-Startwerte, abgelaufene Protestfristen
  und Ähnliches frisch, auch wenn niemand etwas veröffentlicht.
- Dynamisch (ohne Rebuild) sind: Formulare, Admin, Nummern-Prüfung, Discord-Karte, Live-Status,
  `kalender.ics`.

**Wenn nichts passiert:**

1. GitHub → Actions → **Deploy**: Gibt es einen Lauf mit Auslöser `repository_dispatch`? Ist er rot → Log lesen.
2. Kein Lauf? Dann erreicht der Worker GitHub nicht:
   - `GITHUB_DISPATCH_TOKEN` abgelaufen oder ohne Recht *Contents: Read and write* → neu erstellen,
     `npx wrangler secret put GITHUB_DISPATCH_TOKEN`.
   - Worker-Logs ansehen (Cloudflare → Workers → `liga-web` → Logs oder `npx wrangler tail`):
     Meldung „GitHub-Dispatch fehlgeschlagen: 401/403/404“.
   - In Supabase (Table Editor → `settings`, Schlüssel `rebuild`) sieht man `requested_at` und
     `dispatched_at`.
3. Sofortmaßnahme: GitHub → Actions → Deploy → **Run workflow**.

---

## Deploy und Renntags-Freeze

`deploy.yml` hat vier Auslöser: Push auf `main` (Code), `repository_dispatch` (Inhalte),
täglicher Zeitplan und manueller Start.

**Renntags-Freeze** (Plan §7.6 – kein Code-Deploy am Renntag, Inhalte schon):

- GitHub-Variable **`RACEDAY_WEEKDAY`**: ISO-Wochentag(e) der Renntage, `1` = Montag … `7` = Sonntag,
  mehrere mit Komma (`4` = Donnerstag, `4,7` = Donnerstag und Sonntag).
- Optional **`FREEZE_DATES`**: zusätzliche Tage, z. B. `2026-12-19,2026-12-20` (Sonderrennen, Finale).
- Maßgeblich ist das Datum in **Europe/Berlin**.
- An diesen Tagen:
  - **Push auf `main`** → der Deploy-Lauf bricht mit „Renntags-Freeze“ ab (rot). Der Code geht mit dem
    nächsten Lauf an einem Nicht-Renntag automatisch live (spätestens beim täglichen Build).
  - **Inhalts-Rebuilds** laufen weiter, bauen aber den zuletzt ausgerollten Code-Stand – den Git-Tag
    **`production`**. So kommt kein neuer Code „durch die Hintertür“ mit einem Ergebnis live.
- **Notfall-Hotfix:** Actions → Deploy → „Run workflow“ → Häkchen „Renntags-Freeze ignorieren“.
- Der Tag `production` wird nach jedem erfolgreichen Deploy auf den ausgerollten Commit gesetzt.

**Zurückrollen:** Cloudflare → Workers → `liga-web` → Deployments → ältere Version → „Rollback“.
Das wirkt sofort, auch für statische Seiten. Danach den Fehler im Code beheben; der nächste Deploy
überschreibt den Rollback.

**Ohne Secrets** (frisches Repository, Fork) überspringt der Workflow den Deploy mit einem Hinweis.

---

## Backups

`backup.yml` sichert jede Nacht die komplette Supabase-Datenbank (Plan §11.4):

1. `supabase db dump` (intern `pg_dump` in passender Version) erzeugt drei Dateien:
   `roles.sql`, `schema.sql`, `data.sql` – das Format, das Supabase für Wiederherstellungen empfiehlt.
2. Optional werden die hochgeladenen Bilder aus dem Storage-Bucket `media` mitgesichert
   (wenn die `SUPABASE_S3_*`-Secrets gesetzt sind).
3. Alles wird als `tar.gz` gepackt und mit **age** für den öffentlichen Liga-Schlüssel verschlüsselt.
   Unverschlüsselte Daten verlassen den GitHub-Runner nie und werden sofort gelöscht.
4. Upload nach **Cloudflare R2**:
   - `nightly/liga-YYYY-MM-DD.tar.gz.age` – **30 Tage rollierend**. Die R2-Lifecycle-Regel
     (Prefix `nightly/`, löschen nach 30 Tagen, siehe [SETUP.md 5.6](SETUP.md#56-r2-bucket-für-backups))
     räumt auf; der Workflow löscht zur Sicherheit zusätzlich selbst alles Ältere.
   - `snapshots/<name>-YYYY-MM-DD.tar.gz.age` – **dauerhaft**, per Hand: Actions → Backup →
     „Run workflow“ → Name eingeben (nur `a-z`, `0-9`, `-`), z. B. `saison-1-ende`, `vor-regelwerk-2`.

**Wann einen Snapshot anlegen:** zum Saisonende (vor dem Einfrieren), vor großen Migrationen, vor
Massenänderungen (z. B. Nummern-Neuvergabe).

**Wenn das Backup fehlschlägt:** GitHub schickt eine Mail (Benachrichtigungen einschalten, siehe
[Monitoring](#monitoring)). Häufige Ursachen: Datenbank-Passwort geändert (`SUPABASE_DB_URL` anpassen),
direkte statt Session-Pooler-URI (IPv6-Problem), R2-Token abgelaufen oder ohne Schreibrecht.

---

## Wiederherstellung

Du brauchst: den **privaten age-Schlüssel** aus dem Passwortmanager, die Backup-Datei aus R2 und
[psql](https://www.postgresql.org/download/) (Teil der PostgreSQL-Client-Tools) bzw. die Supabase CLI.

**1. Backup holen und entschlüsseln**

```bash
# Datei im Cloudflare-Dashboard (R2 → Bucket → Objekt → Download) herunterladen, dann:
age --decrypt -i liga-backup-key.txt -o backup.tar.gz liga-2026-10-01.tar.gz.age
tar -xzf backup.tar.gz          # → backup/roles.sql, schema.sql, data.sql, MANIFEST.txt, (media/)
```

**2. In eine leere Datenbank einspielen** (ein **neues** Supabase-Projekt in Frankfurt oder – zum Testen –
eine lokale Instanz). Verbindungs-URI des Ziels: Session pooler, mit Passwort.

```bash
psql \
  --single-transaction \
  --variable ON_ERROR_STOP=1 \
  --file backup/roles.sql \
  --file backup/schema.sql \
  --command 'SET session_replication_role = replica' \
  --file backup/data.sql \
  --dbname "postgresql://postgres.<ref>:<passwort>@aws-0-eu-central-1.pooler.supabase.com:5432/postgres"
```

`session_replication_role = replica` schaltet Trigger während des Datenimports ab, damit z. B.
`updated_at` und berechnete Rundenzeiten exakt wie gesichert übernommen werden.

**3. Bilder zurückspielen** (falls gesichert):

```bash
aws s3 sync backup/media s3://media --endpoint-url "https://<ref>.supabase.co/storage/v1/s3"
```

**4. Umschalten** (nur bei echtem Ausfall, nicht beim Test):

- Discord-Provider und URL-Konfiguration im neuen Projekt wie in [SETUP.md 3.4/4.4](SETUP.md#34-login-einstellungen) einrichten.
- GitHub-Secrets `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_DB_URL` und das Worker-Secret
  `SUPABASE_SERVICE_ROLE_KEY` auf das neue Projekt ändern.
- Deploy starten (Actions → Deploy → Run workflow). Staff muss sich neu anmelden.

**Einzelne Daten zurückholen** (z. B. versehentlich gelöschte News): Backup wie oben in eine lokale
Instanz einspielen, die Zeilen dort heraussuchen und gezielt per SQL-Editor bzw. Admin zurückschreiben.
Nie ein komplettes Backup über die laufende Produktionsdatenbank spielen.

---

## Wiederherstellungstest (vierteljährlich)

Ein Backup, das nie zurückgespielt wurde, ist keins (Plan §11.4). **Einmal pro Quartal** (Termin im
Liga-Kalender, z. B. erste Woche im Januar/April/Juli/Oktober):

1. Neuestes Backup aus `nightly/` herunterladen und entschlüsseln (siehe oben) – prüft zugleich, dass
   der **Schlüssel im Passwortmanager** noch passt.
2. Leere Testumgebung starten:
   ```bash
   mkdir restore-test && cd restore-test
   npx supabase init         # leeres Projekt ohne Migrationen
   npx supabase start        # braucht Docker Desktop
   ```
3. Einspielen mit dem psql-Befehl oben und `--dbname "postgresql://postgres:postgres@127.0.0.1:54322/postgres"`.
4. Stichproben im Studio (http://127.0.0.1:54323) oder per SQL:
   ```sql
   select count(*) from public.seasons;
   select count(*) from public.results;
   select max(updated_at) from public.results;   -- passt zum Backup-Datum?
   select public_ref, status from public.decisions order by id desc limit 5;
   ```
5. Optional: die Website gegen die Testinstanz starten (`.env` mit `SUPABASE_URL=http://127.0.0.1:54321`,
   Keys aus `npx supabase status`, `DEMO_MODE=false`) und Wertung, Rennseite, Fahrerprofil ansehen.
6. Aufräumen: `npx supabase stop --no-backup`, Ordner und entschlüsselte Dateien löschen.
7. Ergebnis im Staff-Channel notieren: Datum, Backup-Datei, Dauer, Auffälligkeiten.

---

## Keep-alive und Löschfristen

Der Worker-Cron „17 3 * * *“ (täglich 03:17 UTC, `src/lib/server/cron.ts`) erledigt zwei Dinge:

- **Keep-alive:** eine kleine Abfrage an Supabase – das Free-Tier pausiert Projekte sonst nach
  7 Tagen ohne Aktivität. Zusätzlich greifen der tägliche Build und das Backup auf die Datenbank zu.
- **Löschfristen** (Plan §6.7, Funktion `run_retention()` in der Datenbank):
  - abgelehnte Anmeldungen: nach 6 Monaten gelöscht
  - IP-Hashes (Anmeldungen, Vorfälle, Kontakt) und Rate-Limit-Einträge: nach 30 Tagen gelöscht
  - Kontaktdaten aus Vorfallmeldungen: nach Saisonende gelöscht

Pausiert das Projekt trotzdem (Mail von Supabase): im Dashboard „Restore project“ – die Daten bleiben
erhalten. Dann prüfen, ob die Crons laufen (Cloudflare → Worker → Settings → Triggers).

---

## Monitoring

| Was | Womit | Einrichtung |
|---|---|---|
| **Erreichbarkeit** | kostenloser Uptime-Dienst (z. B. UptimeRobot oder Better Stack) | Zwei Checks alle 5 Minuten: `https://<domain>/` (statisch) und `https://<domain>/api/live` (Worker). Alarm per E-Mail und Discord-Webhook in einen Staff-Channel |
| **Fehler im Worker** | Cloudflare Workers Logs (Observability ist in `wrangler.jsonc` an) | Cloudflare → Workers → `liga-web` → Logs; live: `npx wrangler tail`. Cron-Fehler erscheinen als „Cron-Aufgabe … fehlgeschlagen“ |
| **Fehlgeschlagene Workflows** (Deploy, Backup, CI) | GitHub-Benachrichtigungen | Jede Person mit Verantwortung: GitHub → Settings → Notifications → Actions → „Only notify for failed workflows“ |
| **Datenbank** | Supabase → Reports / Usage | monatlich ansehen: Datenbankgröße, Egress, Auth-Nutzer |
| **Abhängigkeiten** | Dependabot | siehe unten |
| **Domain** | Registrar | Auto-Verlängerung an, Zahlungsmittel gültig, Erinnerung 30 Tage vor Ablauf |
| **Ablaufende Tokens** | Kalender | `GITHUB_DISPATCH_TOKEN` (fine-grained, läuft ab!), ggf. Cloudflare-API-Token, R2-Token |
| **Performance / Barrierefreiheit** | Lighthouse und axe in der CI | Job „Lighthouse-Budget“ (warnt nur) und E2E mit axe |

Status-Seiten der Dienste: https://www.cloudflarestatus.com · https://status.supabase.com ·
https://discordstatus.com · https://www.githubstatus.com

---

## Updates (Dependabot)

Dependabot (`.github/dependabot.yml`) öffnet **montags** Pull Requests für npm-Pakete und GitHub
Actions, gebündelt nach Bereichen (Astro, Svelte, Tailwind, Supabase, Cloudflare, Tests, sonstige
Minor/Patch-Updates).

- Jeder PR durchläuft die komplette CI und bekommt eine **Demo-Vorschau** (Link im PR).
- Grüne Patch/Minor-Updates: Vorschau kurz ansehen, mergen – **nicht am Renntag**.
- Major-Updates (z. B. Astro 7 → 8): Changelog lesen, lokal testen (`npm install`, `npm run dev`,
  `npm test`, `npm run test:e2e`), dann mergen.
- Sicherheitswarnungen (Dependabot alerts) haben Vorrang.

---

## Aktualitäts-Check

Plan §11.3: Jede Inhaltsseite zeigt „Stand: …“. **Einmal pro Quartal** geht die **Redaktion** alle Seiten
durch und aktualisiert, was veraltet ist – das verhindert die Widersprüche, die bei der Referenz-Liga
auffielen (Uhrzeiten, Feldgröße, Spielversion, alte Regeln).

Checkliste:

- [ ] Startseite: Claim, Anmeldestatus, Partner-Leiste
- [ ] `/mitfahren`: Voraussetzungen, Ablauf, Anmeldestatus
- [ ] `/liga/regelwerk`: gültige Version, Changelog vollständig, Links auf Paragrafen funktionieren
- [ ] `/liga/lobby`: Lobby-Einstellungen der aktuellen Saison
- [ ] `/liga/faq`: Voraussetzungen (Spielversion, Season Pack), Renntag-Ablauf
- [ ] `/liga/ueber-uns`: Orga-Team, offene Rollen noch offen?
- [ ] `/liga/partner`: Partner aktiv? Kennzeichnung „Anzeige“
- [ ] Impressum, Datenschutz, Teilnahmebedingungen: Anbieterliste und Kontaktdaten aktuell
- [ ] Englische Fassungen: fehlende Übersetzungen laut Dashboard nachgetragen
- [ ] Discord-Einladung und Social-Links funktionieren

---

## Accounts, Zugänge und Bus-Faktor

**Grundsatz** (Plan §11.4): Alle Konten gehören **der Liga**, nicht einer Person. Zugangsdaten liegen im
gemeinsamen Passwortmanager, **mindestens zwei Personen** haben jeweils Owner-/Admin-Rechte, 2FA ist
überall aktiv ([SETUP.md 12](SETUP.md#12-2fa-für-alle-konten)).

| Dienst | Konto / Rolle | Mindestens 2 Owner? |
|---|---|---|
| Passwortmanager | Organisation der Liga | ☐ |
| Liga-E-Mail | | ☐ |
| GitHub | Organisation (Owner) | ☐ |
| Cloudflare | Konto (Super Administrator) | ☐ |
| Supabase | Organisation (Owner) | ☐ |
| Domain-Registrar | Kundenkonto | ☐ |
| Discord | Server-Eigentümer + Admin-Rolle | ☐ |
| Google Analytics | Konto (Administrator) | ☐ |
| Social Media, Twitch, YouTube | | ☐ |

**Neue Person im Staff:** Discord-Rolle vergeben – das genügt für den Admin-Bereich. Nur Technik
bekommt zusätzlich GitHub/Cloudflare/Supabase.

**Person verlässt das Staff-Team:**

1. Discord-Rolle entfernen → spätestens nach 15 Minuten kein Admin-Zugang mehr.
2. Aus GitHub-Organisation, Cloudflare, Supabase, Passwortmanager entfernen (falls vorhanden).
3. Secrets rotieren, die die Person kannte: Supabase-Service-Key (Supabase → API → neu erzeugen, dann
   `wrangler secret put`), Discord-Bot-Token, Webhook-URLs (im Discord neu anlegen, im Admin eintragen),
   Datenbank-Passwort (dann `SUPABASE_DB_URL` anpassen).
4. Im Audit-Log kurz prüfen, ob zuletzt ungewöhnliche Änderungen passiert sind.

---

## Saisonwechsel

Plan §11.2. Die Checkliste steht auch im Admin; hier mit den technischen Schritten:

1. **Letzte Runde final** setzen, alle Urteile veröffentlicht.
2. **Snapshot-Backup**: Actions → Backup → Run workflow → Name `saison-<n>-ende`.
3. **Saison beenden:** Admin → Saisons → Status „abgeschlossen“. Champions (Fahrer, Team) landen in der
   Hall of Fame, die Saison ist **eingefroren** und im Archiv nur noch lesbar.
4. Umfrage unter den Fahrern, **Regelwerk überarbeiten** und als neue Version mit Changelog veröffentlichen.
5. **Neue Saison aus der alten klonen** (Punkteschema, Lobby, Teams, Einstellungen), neue
   Regelwerk-Version zuweisen, **Kalender** anlegen.
6. Rückmeldung der Stammfahrer (bleibt / pausiert / hört auf): Fahrerstatus setzen,
   **Nummern inaktiver Fahrer freigeben**, Cockpits der neuen Saison belegen, Reservepool ordnen.
7. Discord-Rollen und Grafiken aktualisieren, **Anmeldefenster öffnen** (Anmeldestatus).
8. Neue Saison auf **aktiv** setzen (es kann nur eine aktive geben).
9. `RACEDAY_WEEKDAY` prüfen, falls sich der Renntag ändert.
10. Aktualitäts-Check der Inhaltsseiten (siehe oben).

---

## Test-Datenbank für die Beta

Für die geschlossene Beta (Plan M7: `noindex`, Test-Saison mit 2 Test-Renntagen) gibt es zwei Wege:

**A – einfach:** Die Beta läuft bereits auf der Produktionsdatenbank mit `SITE_NOINDEX=true`.
Die Test-Saison wird im Admin angelegt und **vor dem Launch gelöscht** (löscht Runden, Ergebnisse,
Aufstellungen und Urteile der Saison mit). Test-Fahrer vorher pseudonymisieren oder löschen.

**B – getrennt:** Ein zweites Supabase-Projekt (das Free-Tier erlaubt zwei) als Staging:

```bash
npm run db:seed:demo -- --now=2026-11-01T12:00:00Z   # Demo-Termine relativ zu diesem Datum
```

Dann im SQL-Editor des Staging-Projekts nacheinander: alle Migrationen, `supabase/seed.sql`,
`supabase/demo.sql`. Die Demo-Liga (2 Saisons, 30 erfundene Fahrer, Ergebnisse, Urteile, News) ist
danach mit echter Datenbank, echtem Login und echten Discord-Webhooks (Test-Channels!) testbar.
`demo.sql` darf mehrfach laufen und aktualisiert dabei die Termine.
**`demo.sql` nie in die Produktionsdatenbank spielen.**

---

## Kosten und Free-Tier-Grenzen

Laufende Kosten: nur die Domain (ca. 5–6 €/Jahr). Alles andere läuft im Free-Tier (Stand der Planung;
Grenzen gelegentlich prüfen):

| Dienst | Relevante Grenze | Unser Bedarf |
|---|---|---|
| Cloudflare Workers | 100.000 Anfragen/Tag an den Worker, ca. 10 ms CPU je Anfrage | Statische Seiten zählen nicht; Worker nur für Formulare, Admin, APIs |
| Cloudflare R2 | 10 GB Speicher | 30 Nacht-Backups + Snapshots, wenige MB je Backup |
| Supabase | 500 MB Datenbank, 1 GB Storage, Pause nach 7 Tagen Inaktivität | wenige MB pro Saison; Keep-alive läuft |
| GitHub Actions | 2.000 Minuten/Monat (privates Repo), unbegrenzt bei öffentlichem Repo | ca. 3–5 Minuten je Deploy, CI ca. 10 Minuten je Push |
| Turnstile, Email Routing | kostenlos | – |

Wird eine Grenze knapp: zuerst die Ursache prüfen (z. B. Bot-Traffic auf Formularen, zu häufige Deploys),
dann über ein Upgrade entscheiden.
