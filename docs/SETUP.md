# Setup – Phase 0 Schritt für Schritt

Diese Anleitung bringt die Website von „läuft lokal im Demo-Modus“ zu „läuft öffentlich mit echter
Datenbank“. Sie ist für Nicht-Programmierer geschrieben: Jeder Schritt sagt, **wo** du klickst und
**was** du danach notierst. Plane zwei bis drei Abende ein. Die Reihenfolge ist wichtig, weil spätere
Schritte Werte aus früheren brauchen.

> **Grundregel für alle Zugangsdaten:** Alles, was in dieser Anleitung „notieren“ heißt, kommt in den
> **gemeinsamen Passwortmanager der Liga** – nie in Discord, nie in eine E-Mail, nie in Git.

**Übersicht**

1. [Vorbereitung: Name, Konten, Passwortmanager, 2FA](#1-vorbereitung)
2. [GitHub](#2-github)
3. [Supabase (Datenbank, Login, Dateien)](#3-supabase)
4. [Discord (Server, Rollen, Bot, Webhooks, Login)](#4-discord)
5. [Domain und Cloudflare (Worker, DNS, Turnstile, E-Mail, R2)](#5-domain-und-cloudflare)
6. [GitHub-Secrets und -Variablen](#6-github-secrets-und--variablen)
7. [Worker-Secrets](#7-worker-secrets)
8. [Erster Deploy und erster Login](#8-erster-deploy-und-erster-login)
9. [Einstellungen im Admin-Bereich](#9-einstellungen-im-admin-bereich)
10. [Google Analytics mit Datenschutz-Einstellungen](#10-google-analytics)
11. [Backups einrichten](#11-backups-einrichten)
12. [2FA für alle Konten](#12-2fa-für-alle-konten)
13. [Auftragsverarbeitungsverträge (AV-Verträge)](#13-auftragsverarbeitungsverträge)
14. [Prüfliste vor dem Launch](#14-prüfliste-vor-dem-launch)

Anhang: [Lokale Entwicklung mit echter Datenbank](#anhang-a-lokale-entwicklung-mit-echter-datenbank) ·
[Übersicht aller Variablen](#anhang-b-alle-variablen-auf-einen-blick)

---

## 1. Vorbereitung

### 1.1 Was vorher feststehen muss (blockiert den Start, Plan §12 Phase 0)

| Punkt | Warum | Wo es später eingetragen wird |
|---|---|---|
| **Liganame und Kürzel** – ohne „F1“, „Formel 1“, „Grand Prix“ | Markenrecht (Plan §9.1) | `src/config/site.ts` (`name`, `shortName`) |
| Marken-Check bei [DPMA](https://register.dpma.de) und [EUIPO](https://euipo.europa.eu/eSearch/) | Kein Ärger mit bestehenden Marken | – |
| Domain frei? Handles bei Instagram, TikTok, YouTube, Discord-Vanity frei? | Einheitlicher Auftritt | Admin → Einstellungen |
| **Person fürs Impressum** (volljährig, ladungsfähige Anschrift) | Pflicht nach § 5 DDG, blockiert den Launch | `src/content/legal/de/impressum.md` + `en/imprint.md` |
| Renntag, Uhrzeit, Rennformat, erstes Punkteschema, Protestfrist | Kalender, Lobby-Seite, Wertung | Admin → Saisons / Kalender |
| Test in einer echten Lobby: Braucht jeder das 2026 Season Pack? | Voraussetzungen, FAQ | Admin → Seiten-Inhalte (FAQ) |

### 1.2 Liga-E-Mail und Passwortmanager

1. Eine E-Mail-Adresse **der Liga** anlegen (nicht die private eines Mitglieds), z. B. bei einem
   Freemail-Anbieter. Sie wird später durch `kontakt@<domain>` ergänzt (Cloudflare Email Routing).
2. Einen **gemeinsamen Passwortmanager** einrichten (z. B. Bitwarden Organisation oder 1Password Families/Teams).
   Mindestens **zwei Personen** bekommen vollen Zugriff (Bus-Faktor, Plan §11.4).
3. Alle folgenden Konten mit der Liga-E-Mail anlegen und die Zugangsdaten sofort im Passwortmanager speichern.

### 1.3 2FA von Anfang an

Richte bei **jedem** Konto direkt nach dem Anlegen die Zwei-Faktor-Anmeldung ein (Authenticator-App
oder Hardware-Key, kein SMS, wenn es sich vermeiden lässt). Die Wiederherstellungscodes gehören in den
Passwortmanager. Details je Dienst: [Abschnitt 12](#12-2fa-für-alle-konten).

---

## 2. GitHub

1. **Organisation anlegen:** https://github.com/organizations/plan → „Free“. Name z. B. wie die Liga.
2. **Zweite Person als Owner** einladen (Organisation → People → Invite member → Rolle „Owner“).
3. **2FA erzwingen:** Organisation → Settings → Authentication security → „Require two-factor authentication“.
4. **Repository in die Organisation übertragen** (falls es noch privat bei einer Person liegt):
   Repository → Settings → General → ganz unten „Transfer ownership“.
5. **Branch-Schutz für `main`:** Repository → Settings → Rules → Rulesets → „New branch ruleset“:
   - Target: Default branch
   - „Require a pull request before merging“ (mindestens für größere Änderungen)
   - „Require status checks to pass“ → die CI-Jobs *Lint, Typecheck & Unit-Tests*, *Build (Demo) & Link-Check*,
     *Datenbank (Migrationen, Seeds, RLS)* und *E2E (Playwright + axe)* auswählen
     (sie erscheinen in der Liste, sobald die CI einmal gelaufen ist)
   - „Block force pushes“
6. **Actions erlauben:** Settings → Actions → General → „Allow all actions“ und bei
   *Workflow permissions* „Read repository contents“ (die Workflows fordern Schreibrechte selbst an, wo nötig).
7. **Umgebung „production“** anlegen: Settings → Environments → New environment → `production`.
   Optional „Required reviewers“, wenn jeder Code-Deploy freigegeben werden soll.
   (Inhalts-Rebuilds laufen ebenfalls über diese Umgebung – eine Freigabepflicht würde sie ausbremsen,
   deshalb für den Start **ohne** Reviewer.)

---

## 3. Supabase

### 3.1 Projekt anlegen

1. https://supabase.com → Konto mit der Liga-E-Mail → **Organisation** anlegen (Plan „Free“).
2. **New project**:
   - Name: z. B. `liga-web`
   - **Database password:** lang und zufällig erzeugen lassen → im Passwortmanager speichern
   - **Region: Central EU (Frankfurt)** – `eu-central-1` (Plan §7.1, Datenschutz)
3. Warten, bis das Projekt bereit ist (1–2 Minuten).

### 3.2 Datenbank-Schema einspielen (Migrationen)

**Weg A – ohne Programmierkenntnisse (SQL-Editor):**

1. Supabase → dein Projekt → **SQL Editor** → „New query“.
2. Nacheinander den **kompletten Inhalt** dieser Dateien einfügen und jeweils „Run“ klicken –
   **genau in dieser Reihenfolge** (sortiert nach Dateinamen):
   1. `supabase/migrations/20260929120000_init.sql`
   2. `supabase/migrations/20260929120100_rls.sql`
   3. `supabase/migrations/20260929120200_maintenance.sql`
   4. alle weiteren Dateien in `supabase/migrations/`, falls vorhanden, ebenfalls nach Namen sortiert
3. Danach **`supabase/seed.sql`** genauso ausführen. Das legt die 11 Teams, 25 Strecken, die
   Punkteschema-Vorlagen, das Regelwerk v1, die FAQ, offene Rollen und alle Einstellungen an.
   Die Datei darf mehrfach laufen – vorhandene Zeilen werden nie überschrieben.
4. Kontrolle: **Table Editor** → Tabelle `teams` zeigt 11 Zeilen.

**Weg B – mit der Supabase CLI** (für die Technik-Person):

```bash
npx supabase login
npx supabase link --project-ref <projekt-ref>     # steht in der Projekt-URL
npx supabase db push                               # alle Migrationen
psql "<Session-Pooler-URI>" -v ON_ERROR_STOP=1 -f supabase/seed.sql
```

> **Nicht** `supabase/demo.sql` in die Produktionsdatenbank spielen – das sind erfundene Fahrer
> für eine Test-Datenbank (siehe [BETRIEB.md](BETRIEB.md#test-datenbank-für-die-beta)).

### 3.3 Werte notieren

Supabase → Project Settings → **API** (bzw. „Data API“ und „API Keys“):

| Wert | Wofür | Geheim? |
|---|---|---|
| Project URL (`https://<ref>.supabase.co`) | `SUPABASE_URL` | nein |
| `anon` / publishable Key | `SUPABASE_ANON_KEY` | nein (darf nur lesen, was RLS erlaubt) |
| `service_role` / secret Key | `SUPABASE_SERVICE_ROLE_KEY` | **ja** – umgeht alle Zugriffsregeln |

Supabase → Project Settings → **Database** → „Connection string“ → **Session pooler** → URI kopieren
und das Passwort einsetzen → `SUPABASE_DB_URL` (für Backups). Wichtig: die *Session-Pooler*-Variante
nehmen – die direkte Verbindung ist nur per IPv6 erreichbar, GitHub Actions spricht nur IPv4.

### 3.4 Login-Einstellungen

Supabase → **Authentication**:

1. **Sign In / Providers → Email:** ausschalten (Staff meldet sich nur über Discord an).
2. **URL Configuration:**
   - Site URL: `https://<deine-domain>`
   - Redirect URLs: `https://<deine-domain>/admin/auth/callback**`
     (die zwei Sternchen erlauben den angehängten `?next=…`-Parameter)
3. Den **Discord-Provider** aktivierst du in [Schritt 4.4](#44-discord-login-über-supabase), sobald die
   Discord-Application existiert.

### 3.5 Storage

Der Bucket `media` (Titelbilder, Partnerlogos, Avatare) wird von der Migration angelegt.
Kontrolle: **Storage** → Bucket `media` ist vorhanden und „Public“.

### 3.6 Pausieren verhindern

Das Free-Tier pausiert Projekte nach 7 Tagen ohne Zugriff. Der Worker fragt jede Nacht die Datenbank ab
(Cron „17 3 * * *“, Keep-alive, Plan §11.4) – dafür muss nur der Worker laufen (Schritt 8).

---

## 4. Discord

### 4.1 Server-Struktur

Channels für die automatischen Meldungen der Website (Plan §8.1) – Namen sind Vorschläge:

| Channel | Sichtbar für | Inhalt |
|---|---|---|
| `#anmeldungen` | nur Admins | neue Anmeldungen (Gamertag, Plattform, Wunschnummer, Link) |
| `#aufstellung` | alle | veröffentlichte Startaufstellung |
| `#ergebnisse` | alle | Ergebnis vorläufig / final / korrigiert |
| `#stewards-intern` | nur Stewards | neue Vorfallmeldungen |
| `#urteile` | alle | veröffentlichte Steward-Entscheidungen |
| `#news` (optional) | alle | neue News |
| `#kontakt` (optional) | nur Admins | Kontaktformular |

Rollen anlegen: **Admin**, **Steward**, **Redaktion** (Server-Einstellungen → Rollen).
In den Server-Einstellungen → Moderation die **2FA-Pflicht für Moderation** einschalten.

### 4.2 IDs kopieren

1. Discord → Benutzereinstellungen → Erweitert → **Entwicklermodus** einschalten.
2. Rechtsklick auf den Server → „Server-ID kopieren“ → notieren als `DISCORD_GUILD_ID`.
3. Server-Einstellungen → Rollen → Rechtsklick auf *Admin*, *Steward*, *Redaktion* → „Rollen-ID kopieren“ → notieren.

### 4.3 Discord-Application und Bot

1. https://discord.com/developers/applications → **New Application** (Name wie die Liga).
2. **OAuth2** → Client ID und Client Secret („Reset Secret“) notieren.
   Unter *Redirects* eintragen: `https://<supabase-ref>.supabase.co/auth/v1/callback`
3. **Bot** → „Reset Token“ → Token notieren als `DISCORD_BOT_TOKEN`.
   - *Public Bot* ausschalten.
   - **Server Members Intent** einschalten (nötig, um die Rollen eines Mitglieds zu lesen).
4. Bot auf den Server holen: **OAuth2 → URL Generator** → Scope `bot`, **keine** Bot-Permissions
   ankreuzen → erzeugte URL öffnen → Liga-Server auswählen. Der Bot braucht keine Rechte; er liest
   nur beim Staff-Login, welche Rollen jemand hat.

### 4.4 Discord-Login über Supabase

Supabase → Authentication → Sign In / Providers → **Discord** → aktivieren →
Client ID und Client Secret aus 4.3 eintragen → Speichern.
Die Website fragt bei Discord nur den Scope `identify` ab (kein E-Mail-Zugriff).

### 4.5 Webhooks

Für jeden Channel aus 4.1: Channel-Einstellungen → Integrationen → **Webhooks** → „Neuer Webhook“ →
Name wie die Liga → „Webhook-URL kopieren“. Die URLs trägst du später im Admin-Bereich ein
([Schritt 9](#9-einstellungen-im-admin-bereich)). Webhook-URLs sind **geheim** – wer sie kennt, kann in
den Channel posten.

### 4.6 Einladungen je Quelle

Für die Statistik, woher neue Mitglieder kommen (Plan §8.1): je eine **dauerhafte** Einladung
(„Läuft nie ab“, „unbegrenzte Nutzung“) für *Website*, *Instagram*, *TikTok*, *YouTube* anlegen und notieren.

---

## 5. Domain und Cloudflare

### 5.1 Domain

1. `.de`-Domain bei **INWX** oder **netcup** registrieren (ca. 5–6 €/Jahr, Plan §7.1).
   **Automatische Verlängerung** einschalten, Zahlungsmittel der Liga hinterlegen.
2. Beim Registrar 2FA aktivieren und eine zweite Person berechtigen.

### 5.2 Cloudflare-Konto und DNS

1. https://dash.cloudflare.com → Konto mit der Liga-E-Mail, 2FA einrichten.
2. **Add a domain** → deine Domain → Plan **Free**.
3. Cloudflare zeigt zwei **Nameserver** – diese beim Registrar als Nameserver eintragen.
   Nach einigen Minuten bis Stunden meldet Cloudflare „Active“.
4. DNS → Settings → **DNSSEC** aktivieren und den DS-Eintrag beim Registrar hinterlegen.
5. SSL/TLS → Overview → Modus **Full (strict)**; Edge Certificates → **Always Use HTTPS** an.
6. Oben rechts unter dem Profil → **Account ID** notieren (`CLOUDFLARE_ACCOUNT_ID`).

### 5.3 API-Token für GitHub Actions

My Profile → API Tokens → **Create Token** → Vorlage **„Edit Cloudflare Workers“** →
bei *Account Resources* nur das Liga-Konto, bei *Zone Resources* nur die Liga-Domain →
Token notieren als `CLOUDFLARE_API_TOKEN`.

### 5.4 Turnstile (Spam-Schutz der Formulare)

Turnstile → **Add widget** → Name „Liga-Formulare“ → Hostnames: deine Domain (für Tests zusätzlich
`localhost`) → Widget Mode **Managed** → Site-Key (`PUBLIC_TURNSTILE_SITE_KEY`) und
Secret-Key (`TURNSTILE_SECRET_KEY`) notieren.

### 5.5 E-Mail-Weiterleitung

Email → **Email Routing** → aktivieren (Cloudflare legt die nötigen DNS-Einträge an) →
Zieladresse (Liga-E-Mail) bestätigen → Regel `kontakt@<domain>` → weiterleiten.
Die Adresse gehört ins Impressum und in `src/config/site.ts` (`contactEmail`).

### 5.6 R2-Bucket für Backups

1. **R2** → aktivieren (Free-Tier: 10 GB) → **Create bucket** → Name z. B. `liga-backups`,
   Standort *Europe (EU)* bzw. „Automatic“ mit EU-Hinweis.
2. Bucket → Settings → **Object lifecycle rules** → „Add rule“:
   - Name: `nightly-30-tage`, Prefix: `nightly/`
   - Aktion: **Delete objects after 30 days**
   (Snapshots unter `snapshots/` bleiben dauerhaft.)
3. R2 → **Manage API tokens** → „Create API token“ → Permission **Object Read & Write**,
   nur für diesen Bucket → *Access Key ID* und *Secret Access Key* notieren
   (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`), außerdem `R2_ACCOUNT_ID` (= Account ID) und `R2_BUCKET`.

### 5.7 Worker-Einstellungen (nach dem ersten Deploy, Schritt 8)

Workers & Pages → `liga-web` → Settings:

- **Domains & Routes** → „Add“ → *Custom domain* → `<deine-domain>` (und optional `www.<domain>`
  mit Weiterleitung auf die Hauptdomain über eine Redirect Rule).
- **workers.dev** und **Preview URLs** eingeschaltet lassen – darüber laufen die Demo-Vorschauen der
  Pull Requests (`https://pr-12-liga-web.<konto>.workers.dev`). Wer die Vorschauen nicht öffentlich
  haben will: Cloudflare Access (Zero Trust, kostenlos bis 50 Personen) davorschalten.
- **Observability** (Logs) ist in `wrangler.jsonc` bereits aktiviert.

---

## 6. GitHub-Secrets und -Variablen

Repository → Settings → **Secrets and variables → Actions**.
*Secrets* sind nach dem Speichern nicht mehr lesbar; *Variables* sind sichtbar (nur für Unkritisches).

### Secrets

| Name | Wert aus | Benutzt von |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | 5.3 | Deploy, PR-Vorschau |
| `CLOUDFLARE_ACCOUNT_ID` | 5.2 | Deploy, PR-Vorschau |
| `SUPABASE_URL` | 3.3 | Deploy (Build liest die Liga-Daten) |
| `SUPABASE_ANON_KEY` | 3.3 | Deploy |
| `SUPABASE_DB_URL` | 3.3 (Session pooler) | Backup |
| `BACKUP_AGE_PUBLIC_KEY` | 11.1 | Backup |
| `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | 5.6 | Backup |
| optional `SUPABASE_S3_ENDPOINT`, `SUPABASE_S3_REGION`, `SUPABASE_S3_ACCESS_KEY_ID`, `SUPABASE_S3_SECRET_ACCESS_KEY` | Supabase → Storage → S3 Connection | Backup der hochgeladenen Bilder |

### Variables

| Name | Beispiel | Bedeutung |
|---|---|---|
| `PUBLIC_SITE_URL` | `https://liga.de` | Basis-URL ohne `/` am Ende |
| `PUBLIC_TURNSTILE_SITE_KEY` | `0x4AAAA…` | Turnstile-Site-Key (5.4) |
| `DISCORD_GUILD_ID` | `123456789012345678` | Server-ID (4.2) |
| `SITE_NOINDEX` | `true` | `true` während der geschlossenen Beta, zum Launch auf `false` |
| `RACEDAY_WEEKDAY` | `4` | Renntags-Freeze: ISO-Wochentag(e), 1 = Montag … 7 = Sonntag, mehrere mit Komma (`4,7`) |
| `FREEZE_DATES` | `2026-12-19,2026-12-20` | zusätzliche Freeze-Tage (z. B. Sonderrennen), optional |

> `GITHUB_REPOSITORY` muss nicht gesetzt werden – GitHub Actions kennt es automatisch.

---

## 7. Worker-Secrets

Die geheimen Werte, die der Worker **zur Laufzeit** braucht, werden **einmalig** direkt bei Cloudflare
gespeichert – nicht in GitHub. Auf einem Rechner mit dem Repository:

```bash
npx wrangler login                                  # Browser öffnet sich, mit dem Liga-Konto anmelden
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY   # Wert aus 3.3 einfügen, Enter
npx wrangler secret put DISCORD_BOT_TOKEN           # 4.3
npx wrangler secret put TURNSTILE_SECRET_KEY        # 5.4
npx wrangler secret put IP_HASH_SALT                # siehe unten
npx wrangler secret put GITHUB_DISPATCH_TOKEN       # siehe unten
# erst wenn gestreamt wird (Plan §8.2):
npx wrangler secret put TWITCH_CLIENT_ID
npx wrangler secret put TWITCH_CLIENT_SECRET
npx wrangler secret list                            # Kontrolle: zeigt nur Namen
```

Alternativ im Dashboard: Workers & Pages → `liga-web` → Settings → Variables and Secrets → „Add“ → Typ *Secret*.

**IP_HASH_SALT erzeugen** (zufälliger Wert, bleibt danach unverändert):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**GITHUB_DISPATCH_TOKEN** (damit „Veröffentlichen“ im Admin einen Rebuild startet, Plan §7.2):
GitHub → Settings (persönlich oder als Organisation) → Developer settings → **Fine-grained tokens** →
„Generate new token“:

- Resource owner: die Liga-Organisation, *Only select repositories*: nur dieses Repository
- Repository permissions → **Contents: Read and write** (sonst nichts)
- Ablaufdatum: maximal erlaubt; **Erinnerung im Kalender** zwei Wochen vorher (läuft der Token ab,
  werden Inhalte nicht mehr automatisch veröffentlicht – der tägliche Rebuild fängt es nur teilweise auf).

Wird ein Secret geändert, gilt es sofort für neue Anfragen; ein neuer Deploy ist nicht nötig.

---

## 8. Erster Deploy und erster Login

1. **Erster Deploy:** GitHub → Actions → Workflow **Deploy** → „Run workflow“ (Branch `main`).
   Der Lauf baut die Seiten aus Supabase und legt den Worker `liga-web` an.
   Alternativ lokal: `.env` ausfüllen (`DEMO_MODE=false`) und `npm run deploy`.
2. Domain verbinden: [5.7](#57-worker-einstellungen-nach-dem-ersten-deploy-schritt-8).
3. **Rollen-Zuordnung für den allerersten Login setzen.** Der Admin-Bereich liest, welche Discord-Rolle
   welche App-Rolle bekommt – diese Zuordnung ist anfangs leer, also käme noch niemand hinein.
   Einmalig im Supabase **SQL Editor** ausführen (IDs aus 4.2 einsetzen):

   ```sql
   update public.settings
   set value = '{"admin": ["ROLLEN-ID-ADMIN"], "steward": ["ROLLEN-ID-STEWARD"], "redakteur": ["ROLLEN-ID-REDAKTION"]}'::jsonb
   where key = 'discord_role_map';
   ```

   Danach pflegt man die Zuordnung im Admin unter *Einstellungen*.
4. `https://<domain>/admin/login` → „Mit Discord anmelden“ → Discord fragt einmalig nach der
   Zustimmung → du landest im Dashboard. Siehst du „Kein Zugang“, fehlt dir die Discord-Rolle oder die
   Rollen-ID in der Zuordnung ist falsch.

---

## 9. Einstellungen im Admin-Bereich

Admin → **Einstellungen** (Details im [Admin-Handbuch](ADMIN-HANDBUCH.md#einstellungen)):

- Discord-Einladung für die Website (4.6) – erscheint auf der Startseite und in der Discord-Karte
- Webhook-URLs je Channel (4.5)
- Einladungen je Quelle (4.6)
- Social-Links (Instagram, TikTok, YouTube)
- Twitch-Kanal – **leer lassen**, bis gestreamt wird (dann ist die Live-Anzeige unsichtbar)
- GA-Mess-ID – erst nach [Schritt 10](#10-google-analytics)
- Rollen-Zuordnung Discord → Admin/Steward/Redaktion
- Anmeldestatus (offen / Warteliste / geschlossen, freie Cockpits und Reserveplätze)

Danach: Saison anlegen, Punkteschema wählen, Kalender eintragen, Teams und Fahrer pflegen
(siehe Admin-Handbuch).

---

## 10. Google Analytics

Die Website lädt Google Analytics **erst nach Einwilligung** im Cookie-Banner (Consent Mode v2 „Basic“:
vorher gibt es keinen einzigen Request an Google, Plan §8.3). Ohne eingetragene Mess-ID wird GA gar
nicht geladen.

1. https://analytics.google.com → Konto mit der Liga-E-Mail → **Konto anlegen**
   (Kontoname: Liga; bei den Datenfreigabe-Einstellungen **alle Häkchen entfernen**).
2. **Property** anlegen: Zeitzone *Deutschland*, Währung *Euro*.
3. **Datenstream** → *Web* → Domain eintragen → „Erweiterte Messung“: nur *Seitenaufrufe* und
   *Scrollen* aktiv lassen → **Mess-ID** (`G-XXXXXXXXXX`) notieren.
4. Verwaltung → Property → **Datenerhebung und -änderung → Datenaufbewahrung**: **2 Monate**.
5. Verwaltung → Property → **Datenerhebung**: *Google Signals* **aus**, *Erhebung detaillierter Standort-
   und Gerätedaten* **aus**.
6. Verwaltung → Konto → **Kontoeinstellungen** → *Zusatz zur Datenverarbeitung* (Data Processing
   Terms) **akzeptieren** und die Kontaktdaten des Verantwortlichen eintragen.
7. Verwaltung → Property → **Verknüpfungen mit Google Ads** o. Ä.: keine anlegen.
8. Mess-ID im Admin unter *Einstellungen* eintragen.
9. Test: Website im privaten Fenster öffnen → Banner „Ablehnen“ → in den Entwicklerwerkzeugen
   (Netzwerk) darf **kein** Request an `google-analytics.com`/`googletagmanager.com` auftauchen.
   Nach „Akzeptieren“ erscheinen sie.

GA4 kürzt IP-Adressen selbst; eine zusätzliche „IP-Anonymisierung“ gibt es in GA4 nicht mehr.

---

## 11. Backups einrichten

### 11.1 Schlüsselpaar für die Verschlüsselung

Backups werden mit [age](https://age-encryption.org) verschlüsselt, **bevor** sie GitHub verlassen.
GitHub kennt nur den öffentlichen Schlüssel; den privaten gibt es nur im Passwortmanager.

```bash
# age installieren: https://github.com/FiloSottile/age/releases (Windows: age.exe entpacken)
age-keygen -o liga-backup-key.txt
```

- Die Zeile `# public key: age1…` → GitHub-Secret `BACKUP_AGE_PUBLIC_KEY` (nur den Teil ab `age1`).
- Die **ganze Datei** `liga-backup-key.txt` (enthält `AGE-SECRET-KEY-…`) als sichere Notiz/Anhang in den
  Passwortmanager, zusätzlich **ausgedruckt** an einem sicheren Ort. Danach die Datei vom Rechner löschen.
  **Ohne diesen Schlüssel sind alle Backups wertlos.**

### 11.2 Erster Lauf

GitHub → Actions → **Backup** → „Run workflow“ (Feld leer lassen) → nach ca. 3 Minuten liegt in R2
unter `nightly/` eine Datei `liga-<datum>.tar.gz.age`. Ab jetzt läuft das jede Nacht.
**Direkt danach einmal die Wiederherstellung testen** ([BETRIEB.md](BETRIEB.md#wiederherstellung)).

---

## 12. 2FA für alle Konten

Plan §10: 2FA für **alle** Staff-Konten. Checkliste – jede Person mit Zugang hakt für sich ab:

| Dienst | Wo | Hinweis |
|---|---|---|
| Passwortmanager | Kontoeinstellungen | zuerst! |
| Liga-E-Mail | Sicherheitseinstellungen | Wiederherstellungs-Codes in den Passwortmanager |
| GitHub | Settings → Password and authentication | Organisation erzwingt 2FA (Schritt 2) |
| Supabase | Account → Security → Multi-Factor Authentication | Organisation → Settings: MFA für alle Mitglieder verlangen |
| Cloudflare | My Profile → Authentication | für alle Mitglieder des Kontos |
| Domain-Registrar | Kundenbereich → Sicherheit | |
| Discord | Benutzereinstellungen → Mein Account | Pflicht für alle mit Admin-, Steward- oder Redaktionsrolle; Server-Einstellung „2FA für Moderation“ |
| Google (Analytics) | myaccount.google.com → Sicherheit | |
| Twitch/YouTube/Instagram/TikTok | jeweils Sicherheitseinstellungen | sobald angelegt |

**Mindestens zwei Personen** haben Owner-/Admin-Zugang zu jedem Dienst (Bus-Faktor).

---

## 13. Auftragsverarbeitungsverträge

Plan §9.2. Keine Rechtsberatung – vor dem Launch fachkundig prüfen lassen. Die Nachweise
(PDF/Screenshot mit Datum) in einem Ordner „Datenschutz“ im Passwortmanager oder Liga-Drive ablegen.

| Anbieter | Was verarbeitet wird | Wie abschließen |
|---|---|---|
| **Supabase** | Datenbank (Anmeldungen, Vorfälle, Staff-Konten), Login, Dateien | Dashboard → Organisation → Settings → **Legal Documents** → „Data Processing Addendum (DPA)“ anfordern und digital unterschreiben |
| **Cloudflare** | Hosting, CDN, Turnstile, E-Mail-Weiterleitung, R2 | Das Cloudflare-DPA ist Bestandteil der Nutzungsbedingungen (Self-Serve Subscription Agreement). PDF unter cloudflare.com → Trust Hub → „Customer DPA“ herunterladen und ablegen |
| **Google Analytics** | Nutzungsstatistik (nur nach Einwilligung) | GA → Verwaltung → Kontoeinstellungen → *Zusatz zur Datenverarbeitung* akzeptieren ([Schritt 10](#10-google-analytics)) |
| **GitHub** | Quellcode, Backups verschlüsselt (keine Besucherdaten) | GitHub DPA gilt über die Nutzungsbedingungen; kein extra Schritt |
| **Discord** | Webhook-Nachrichten, Staff-Login | Discord handelt als eigener Verantwortlicher; in der Datenschutzerklärung nennen (US-Anbieter, DPF) – keine personenbezogenen Daten über das Nötige hinaus in Webhooks (ist so umgesetzt) |

Außerdem: Verzeichnis von Verarbeitungstätigkeiten (kurze Tabelle genügt) und die Datenschutzerklärung
(`src/content/legal/de/datenschutz.md`) auf diese Anbieter abstimmen.

---

## 14. Prüfliste vor dem Launch

**Inhalt und Recht**

- [ ] Liganame, Kürzel, Kontakt-E-Mail in `src/config/site.ts` – kein „F1“ im Namen
- [ ] Logo vektorisiert in `public/brand/`, Favicons und OG-Bild neu erzeugt (`node scripts/generate-brand-assets.mjs`)
- [ ] **Impressum** mit Name und ladungsfähiger Anschrift (DE + EN), „Verantwortlich nach § 18 Abs. 2 MStV“ für News
- [ ] Datenschutzerklärung und Teilnahmebedingungen geprüft (nennt Supabase, Cloudflare, Turnstile, Discord, GA, Twitch/YouTube 2-Klick)
- [ ] Disclaimer im Footer sichtbar
- [ ] Regelwerk v1 von der Liga-Leitung freigegeben, Lobby-Einstellungen der Saison gepflegt
- [ ] FAQ inkl. Season-Pack-Frage, Über uns (Orga-Team), offene Rollen, Partner (mit „Anzeige“)
- [ ] Englische Texte vorhanden oder bewusst mit Hinweis „Übersetzung folgt“

**Liga-Daten**

- [ ] Saison angelegt (Punkteschema, Protestfrist, Reservepunkte, Regelwerk-Version), Status „aktiv“
- [ ] Kalender mit allen Runden, Uhrzeiten in Berliner Zeit geprüft
- [ ] Teams der Saison, Farben geprüft; Anmeldestatus gesetzt

**Technik**

- [ ] Domain mit HTTPS erreichbar, `www` leitet weiter, DNSSEC aktiv
- [ ] Anmeldeformular, Vorfall-Formular und Kontaktformular einmal echt abgeschickt → Einträge im Admin, Meldung in Discord
- [ ] Staff-Login für jede Rolle getestet; jemand **ohne** Rolle kommt nicht hinein
- [ ] „Veröffentlichen“ im Admin löst nach ca. 1–3 Minuten einen Deploy aus (GitHub → Actions → Deploy)
- [ ] Backup gelaufen **und Wiederherstellung getestet** ([BETRIEB.md](BETRIEB.md#wiederherstellung))
- [ ] Uptime-Monitor eingerichtet ([BETRIEB.md](BETRIEB.md#monitoring))
- [ ] Cookie-Banner: ohne Zustimmung keine Google-Requests
- [ ] `RACEDAY_WEEKDAY` gesetzt
- [ ] Lighthouse-Werte der CI im grünen Bereich
- [ ] **`SITE_NOINDEX` auf `false`** stellen (erst zum öffentlichen Launch!) und einmal deployen
- [ ] Sitemap in der Google Search Console einreichen (optional)

**Organisation**

- [ ] 2FA bei allen Konten, zwei Owner je Dienst ([12](#12-2fa-für-alle-konten))
- [ ] AV-Verträge abgelegt ([13](#13-auftragsverarbeitungsverträge))
- [ ] age-Schlüssel im Passwortmanager und ausgedruckt
- [ ] Ablaufdatum des `GITHUB_DISPATCH_TOKEN` im Kalender
- [ ] Renntags-Runbook mit den Beteiligten durchgesprochen ([RENNTAG-RUNBOOK.md](RENNTAG-RUNBOOK.md))

---

## Anhang A: Lokale Entwicklung mit echter Datenbank

Für die meisten Arbeiten genügt der Demo-Modus (`npm run dev`). Wer Migrationen, RLS oder den
Discord-Login testen will:

1. Docker Desktop und die [Supabase CLI](https://supabase.com/docs/guides/local-development) installieren.
2. Discord-Application um die Redirect-URL `http://127.0.0.1:54321/auth/v1/callback` ergänzen und
   `SUPABASE_AUTH_DISCORD_CLIENT_ID` / `SUPABASE_AUTH_DISCORD_SECRET` als Umgebungsvariablen setzen.
3. `npx supabase start` – startet Postgres, Auth, Storage und Studio (http://127.0.0.1:54323),
   spielt Migrationen und `seed.sql` ein. Neu aufsetzen: `npx supabase db reset`.
4. `.env` aus `.env.example` anlegen: `DEMO_MODE=false`, `SUPABASE_URL=http://127.0.0.1:54321`,
   Schlüssel aus `npx supabase status`. Geheime Werte zusätzlich in `.dev.vars` (Vorlage `.dev.vars.example`).
5. `npm run dev`.

Demo-Liga in der lokalen Datenbank: `npm run db:seed:demo`, dann in `supabase/config.toml` bei
`[db.seed]` `"./demo.sql"` ergänzen und `npx supabase db reset`.

## Anhang B: Alle Variablen auf einen Blick

| Variable | Art | Wo gesetzt (Produktion) | Lokal |
|---|---|---|---|
| `PUBLIC_SITE_URL` | öffentlich | GitHub-Variable | `.env` |
| `PUBLIC_TURNSTILE_SITE_KEY` | öffentlich | GitHub-Variable | `.env` |
| `SUPABASE_URL` | öffentlich (Build) | GitHub-Secret | `.env` |
| `SUPABASE_ANON_KEY` | öffentlich (Build) | GitHub-Secret | `.env` |
| `DISCORD_GUILD_ID` | öffentlich (Build) | GitHub-Variable | `.env` |
| `SITE_NOINDEX` | öffentlich (Build) | GitHub-Variable | `.env` |
| `DEMO_MODE` | öffentlich (Build) | im Workflow fest `false` | `.env` (`true`) |
| `GITHUB_REPOSITORY` | öffentlich (Build) | automatisch in GitHub Actions | `.env` (nur zum Testen des Rebuilds) |
| `SUPABASE_SERVICE_ROLE_KEY` | **geheim** | Worker-Secret | `.dev.vars` |
| `DISCORD_BOT_TOKEN` | **geheim** | Worker-Secret | `.dev.vars` |
| `TURNSTILE_SECRET_KEY` | **geheim** | Worker-Secret | `.dev.vars` |
| `IP_HASH_SALT` | **geheim** | Worker-Secret | `.dev.vars` |
| `GITHUB_DISPATCH_TOKEN` | **geheim** | Worker-Secret | `.dev.vars` |
| `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` | **geheim** | Worker-Secret (später) | `.dev.vars` |

Das maßgebliche Schema steht in `astro.config.mjs` (`env.schema`). Ein Unit-Test
(`tests/unit/infra-config.test.ts`) prüft, dass `.env.example` und `.dev.vars.example` dazu passen.
