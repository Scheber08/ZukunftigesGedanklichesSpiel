/**
 * Regelwerk v1 – Entwurf.
 *
 * Claude entwirft auf Basis bewährter Praxis im Online-Rennsport, die Liga-Leitung passt an.
 * Verbindlich ist die deutsche Fassung, Englisch ist eine Übersetzung (§1.3).
 * Format-Details (Qualifying-Länge, Renndistanz, Sprints) stehen bewusst NICHT hier,
 * sondern in den Lobby-Einstellungen der Saison (/liga/lobby).
 */

export interface RuleSectionSeed {
  number: string; // "§3" or "§3.2"
  anchor: string; // "p3" or "p3-2"  (lowercase, stable, used as URL anchor)
  title_de: string;
  title_en: string;
  body_de: string; // Markdown, may be '' for a chapter heading that only groups children
  body_en: string;
  children?: RuleSectionSeed[];
}

const PENALTY_TABLE_DE = `| Code | Vergehen | Regelstrafe | Hinweise |
| --- | --- | --- | --- |
| V-01 | Kollision verursacht – leicht | Verwarnung oder 3 s | Kontakt ohne nennenswerte Folgen für den Gegner |
| V-02 | Kollision verursacht – mit Folgen | 5 s | Gegner dreht sich, verliert Positionen oder deutlich Zeit |
| V-03 | Kollision verursacht – schwer | 10 s oder Positionsstrafe | Gegner scheidet aus oder mehrere Autos sind betroffen; in groben Fällen DSQ |
| V-04 | Unsicheres Wiedereinfahren auf die Strecke | 5 s | Mit Kollision bis 10 s |
| V-05 | Mehrfacher Linienwechsel beim Verteidigen | Verwarnung, im Wiederholungsfall 3 s | Aufwärmen der Reifen hinter dem Safety Car ist ausgenommen |
| V-06 | Linienwechsel in der Bremszone | 5 s | Mit Kollision mindestens 10 s |
| V-07 | Keinen Platz gelassen oder Gegner neben die Strecke gedrängt | 5 s | Gilt für Angreifer und Verteidiger |
| V-08 | Unkontrolliertes Überholmanöver (Dive-Bomb) | 5 s | Mit Kollision nach V-02 oder V-03 |
| V-09 | Vorteil durch Überschreiten der Track Limits | 3 s bis Positionsstrafe | Keine Strafe, wenn die Position sofort zurückgegeben wurde; Spielstrafen gelten zusätzlich |
| V-10 | Ignorieren blauer Flaggen | Verwarnung, im Wiederholungsfall 5 s | Eine Spielstrafe wird angerechnet |
| V-11 | Behinderung im Qualifying | Verwarnung bis Grid-Strafe 3 Plätze | Gilt für das nächste Rennen; in schweren Fällen bis 5 Plätze |
| V-12 | Überholen unter Safety Car oder VSC | 5 s | Keine Strafe, wenn die Position sofort zurückgegeben wurde |
| V-13 | Verstoß beim Restart | 5 s | Z. B. Überholen vor der Linie oder unberechenbares Tempo als Führender |
| V-14 | Brake-Test | 10 s | Mit Kollision DSQ möglich |
| V-15 | Durch einen Vorfall gewonnene Position nicht zurückgegeben | Positionsstrafe | Anzahl der zu Unrecht gewonnenen Plätze |
| V-16 | Ausnutzen von Ghosting oder Spielfehlern | Positionsstrafe bis DSQ | Siehe §5.4 und §10.4 |
| V-17 | Unerlaubte Fahrhilfen, Mods oder Hilfsmittel | DSQ | Zusätzlich Rennsperre oder Ausschluss möglich |
| V-18 | Überfahren der Linie an Boxeneinfahrt oder Boxenausfahrt | 5 s | Nur wenn das Spiel nicht selbst bestraft hat |
| V-19 | Gefährliches Fahren | 5 s bis DSQ | Z. B. gegen die Fahrtrichtung fahren oder auf der Ideallinie stehen bleiben |
| V-20 | Absichtliches Rammen | DSQ und Rennsperre | Ausschluss aus der Liga möglich |
| V-21 | Unsportliches Verhalten im Text- oder Voice-Chat | Verwarnung bis Rennsperre | Beleidigung oder Diskriminierung: Rennsperre bis Ausschluss (§9) |
| V-22 | Absichtliches Verlassen der Lobby oder Stören des Ablaufs | Verwarnung bis Rennsperre | Z. B. Rage-Quit, um einer Wertung auszuweichen |
| V-23 | Verspätete Abmeldung | Verwarnung | Maßnahme der Liga-Leitung; wiederholt wie V-24 |
| V-24 | Unentschuldigtes Fehlen | 1. Mal Verwarnung, danach Versetzung in den Reservepool bis Ausschluss | Maßnahme der Liga-Leitung (§2.6) |
| V-25 | Falsche Angaben oder manipulierte Beweise in einer Meldung | Rennsperre | Ausschluss aus der Liga möglich |`;

const PENALTY_TABLE_EN = `| Code | Offence | Standard penalty | Notes |
| --- | --- | --- | --- |
| V-01 | Causing a collision – minor | Warning or 3 s | Contact without significant consequences for the other driver |
| V-02 | Causing a collision – with consequences | 5 s | Other driver spins, loses positions or loses significant time |
| V-03 | Causing a collision – serious | 10 s or position penalty | Other driver retires or several cars are affected; DSQ in gross cases |
| V-04 | Unsafe rejoin | 5 s | Up to 10 s if it causes a collision |
| V-05 | Changing direction more than once when defending | Warning, 3 s if repeated | Warming tyres behind the safety car is exempt |
| V-06 | Moving in the braking zone | 5 s | At least 10 s if it causes a collision |
| V-07 | Not leaving space or forcing a driver off track | 5 s | Applies to attacker and defender alike |
| V-08 | Uncontrolled overtaking move (dive-bomb) | 5 s | If it causes a collision, as V-02 or V-03 |
| V-09 | Gaining an advantage by exceeding track limits | 3 s up to position penalty | No penalty if the position was given back immediately; game penalties apply in addition |
| V-10 | Ignoring blue flags | Warning, 5 s if repeated | Any game penalty is taken into account |
| V-11 | Impeding in qualifying | Warning up to 3-place grid penalty | Applies to the next race; up to 5 places in serious cases |
| V-12 | Overtaking under the safety car or VSC | 5 s | No penalty if the position was given back immediately |
| V-13 | Restart infringement | 5 s | E.g. overtaking before the line or erratic pace as the leader |
| V-14 | Brake-testing | 10 s | DSQ possible if it causes a collision |
| V-15 | Not giving back a position gained in an incident | Position penalty | Number of places gained unfairly |
| V-16 | Exploiting ghosting or game bugs | Position penalty up to DSQ | See §5.4 and §10.4 |
| V-17 | Prohibited assists, mods or aids | DSQ | Race ban or exclusion possible in addition |
| V-18 | Crossing the pit entry or pit exit line | 5 s | Only if the game has not already penalised it |
| V-19 | Dangerous driving | 5 s up to DSQ | E.g. driving the wrong way or stopping on the racing line |
| V-20 | Deliberate ramming | DSQ and race ban | Exclusion from the league possible |
| V-21 | Unsporting behaviour in text or voice chat | Warning up to race ban | Insults or discrimination: race ban up to exclusion (§9) |
| V-22 | Deliberately leaving the lobby or disrupting proceedings | Warning up to race ban | E.g. rage-quitting to avoid being classified |
| V-23 | Late sign-off | Warning | Measure by league management; if repeated, as V-24 |
| V-24 | Unexcused absence | Warning the first time, then move to the reserve pool up to exclusion | Measure by league management (§2.6) |
| V-25 | False statements or manipulated evidence in a report | Race ban | Exclusion from the league possible |`;

export const RULES_V1: {
  version: string; // '1.0'
  effective_from: string; // '2026-11-01'
  changelog_de: string;
  changelog_en: string;
  sections: RuleSectionSeed[];
} = {
  version: '1.0',
  effective_from: '2026-11-01',
  changelog_de:
    'Erste Fassung des Regelwerks. Entwurf auf Basis bewährter Praxis im Online-Rennsport – die Liga-Leitung prüft und ergänzt ihn vor dem Saisonstart.',
  changelog_en:
    'First version of the rulebook. Draft based on established practice in online racing – league management will review and complete it before the season starts.',
  sections: [
    // ---------------------------------------------------------------------------
    // §1 Grundlagen
    // ---------------------------------------------------------------------------
    {
      number: '§1',
      anchor: 'p1',
      title_de: 'Grundlagen',
      title_en: 'Fundamentals',
      body_de: '',
      body_en: '',
      children: [
        {
          number: '§1.1',
          anchor: 'p1-1',
          title_de: 'Geltungsbereich & Rollen',
          title_en: 'Scope & roles',
          body_de: `Dieses Regelwerk gilt für alle Fahrer und alle Staff-Mitglieder von [LIGANAME] ([KÜRZEL]), einer Online-Liga für EA SPORTS F1® 25 mit Crossplay zwischen PC, PlayStation und Xbox. Es gilt für alle Sessions eines Renntags, vom Betreten bis zum Verlassen der Lobby. [§9](#p9) gilt zusätzlich auf unserem Discord-Server.

Im Regelwerk kommen folgende Rollen vor:

- **Liga-Leitung:** die Admins. Sie organisiert die Saison, teilt die Teams zu, pflegt die Ergebnisse und entscheidet alles, was nicht ausdrücklich den Stewards zugewiesen ist.
- **Rennleitung:** eine Person, die die Liga-Leitung für den Renntag bestimmt. Sie hostet die Lobby, steuert den Ablauf und entscheidet über Neustarts ([§5.5](#p5-5)).
- **Stewards:** Sie bewerten Vorfälle und verhängen Strafen ([§7](#p7), [§8](#p8)).
- **Fahrer:** alle Stammfahrer und Reservefahrer.

Eine Person kann mehrere Rollen haben. Wer selbst fährt, entscheidet aber nie als Steward über einen Vorfall, an dem er beteiligt ist ([§7.5](#p7-5)).`,
          body_en: `This rulebook applies to all drivers and staff members of [LIGANAME] ([KÜRZEL]), an online league for EA SPORTS F1® 25 with crossplay between PC, PlayStation and Xbox. It applies to every session of a race day, from joining the lobby until leaving it. [§9](#p9) also applies on our Discord server.

The rulebook refers to the following roles:

- **League management:** the admins. They organise the season, assign the teams, maintain the results and decide everything that is not expressly assigned to the stewards.
- **Race control:** a person appointed by league management for the race day. They host the lobby, run the schedule and decide on restarts ([§5.5](#p5-5)).
- **Stewards:** they assess incidents and impose penalties ([§7](#p7), [§8](#p8)).
- **Drivers:** all regular and reserve drivers.

One person can hold several roles. However, anyone who also races never decides as a steward on an incident they were involved in ([§7.5](#p7-5)).`,
        },
        {
          number: '§1.2',
          anchor: 'p1-2',
          title_de: 'Verbindliche Quelle',
          title_en: 'Binding source',
          body_de: `Verbindlich sind die Angaben auf unserer Website. Dazu gehören das Regelwerk, der Kalender, die [Lobby-Einstellungen](/liga/lobby), Startaufstellungen, Ergebnisse, Tabellen und Steward-Entscheidungen.

Discord nutzen wir für die Kommunikation: Ankündigungen, Abmeldungen, Fragen und die Abstimmung am Renntag. Widerspricht eine Nachricht auf Discord der Website, gilt die Website.

Findest du einen Fehler auf der Website, sag der Liga-Leitung Bescheid. Offensichtliche Fehler korrigieren wir so schnell wie möglich.`,
          body_en: `The information on our website is binding. This includes the rulebook, the calendar, the [lobby settings](/en/league/lobby), starting grids, results, standings and steward decisions.

We use Discord for communication: announcements, sign-offs, questions and coordination on race day. If a message on Discord contradicts the website, the website prevails.

If you spot a mistake on the website, let league management know. We correct obvious errors as soon as possible.`,
        },
        {
          number: '§1.3',
          anchor: 'p1-3',
          title_de: 'Sprache',
          title_en: 'Language',
          body_de: `Das Regelwerk gibt es auf Deutsch und auf Englisch. Verbindlich ist die deutsche Fassung. Die englische Fassung ist eine Übersetzung. Weichen beide voneinander ab, gilt der deutsche Text.

Auf Discord, in der Lobby und in Meldungen an die Stewards kannst du Deutsch oder Englisch verwenden.`,
          body_en: `The rulebook is available in German and English. The German version is binding. The English version is a translation. Where the two differ, the German text applies.

You may use German or English on Discord, in the lobby and in reports to the stewards.`,
        },
        {
          number: '§1.4',
          anchor: 'p1-4',
          title_de: 'Änderungen & Versionierung',
          title_en: 'Amendments & versioning',
          body_de: `- Jede Fassung des Regelwerks hat eine Versionsnummer (z. B. 1.0, 1.1) und ein Datum, ab dem sie gilt.
- Alle Änderungen stehen im Änderungsprotokoll auf der Regelwerk-Seite. Wir kündigen sie zusätzlich auf Discord an.
- Während einer laufenden Saison ändern wir das Regelwerk nur, wenn es nötig ist – zum Beispiel nach einem Spiel-Update oder wenn eine Regel eine Lücke hat. Solche Änderungen gelten frühestens für das nächste Rennen, das nach der Veröffentlichung beginnt.
- Für jeden Vorfall gilt die Fassung, die am Renntag gültig war.
- Rein redaktionelle Korrekturen (Rechtschreibung, Formatierung, Links) ohne inhaltliche Änderung sind jederzeit möglich.

Mit deiner Anmeldung bestätigst du, dass du die gültige Fassung gelesen hast. Über spätere Änderungen informierst du dich selbst – die Ankündigungen auf Discord helfen dir dabei.`,
          body_en: `- Every version of the rulebook has a version number (e.g. 1.0, 1.1) and a date from which it applies.
- All changes are listed in the changelog on the rules page. We also announce them on Discord.
- During a running season we only change the rulebook when necessary – for example after a game update or when a rule has a gap. Such changes apply at the earliest to the next race that starts after publication.
- Each incident is judged under the version that was in force on the race day.
- Purely editorial corrections (spelling, formatting, links) that do not change the meaning can be made at any time.

By signing up, you confirm that you have read the version in force. It is up to you to keep track of later changes – the announcements on Discord will help you.`,
        },
        {
          number: '§1.5',
          anchor: 'p1-5',
          title_de: 'Fairness & Sportsgeist',
          title_en: 'Fairness & sportsmanship',
          body_de: `Wir fahren hart, aber fair. Jeder soll sein Rennen fahren können, ohne Angst vor rücksichtslosen Manövern zu haben.

- Respektiere deine Gegner – auf der Strecke und daneben.
- Ein sauberes Rennen ist wichtiger als eine einzelne Position.
- Im Zweifel gilt: Platz lassen, vom Gas gehen, Position zurückgeben.
- Nutze keine Spielfehler zu deinem Vorteil ([§10.4](#p10-4)).
- Regelt dieses Regelwerk eine Situation nicht ausdrücklich, entscheiden Stewards und Liga-Leitung nach dem Sinn der Regeln und nach dem Grundsatz der Fairness.`,
          body_en: `We race hard but fair. Everyone should be able to run their race without fear of reckless moves.

- Respect your opponents – on track and off it.
- A clean race matters more than a single position.
- When in doubt: leave space, lift off, give the position back.
- Do not use game bugs to your advantage ([§10.4](#p10-4)).
- Where this rulebook does not expressly cover a situation, the stewards and league management decide according to the spirit of the rules and the principle of fairness.`,
        },
        {
          number: '§1.6',
          anchor: 'p1-6',
          title_de: 'Wertung & Gleichstand',
          title_en: 'Scoring & ties',
          body_de: `**Punkte.** Das Punkteschema legt die Liga-Leitung für jede Saison fest – zum Beispiel, wie viele Punkte es in Hauptrennen und Sprints gibt und ob es Bonuspunkte gibt (etwa für die schnellste Runde). Das Schema steht in den Einstellungen der jeweiligen Saison und wird auf der Website angezeigt.

**Fahrerwertung.** Jeder Fahrer bekommt die Punkte, die er selbst erzielt – egal ob als Stamm- oder als Reservefahrer.

**Teamwertung.** Die Punkte der Stammfahrer zählen für ihr Team. Ob auch die Punkte eines Reservefahrers für das Team zählen, für das er eingesprungen ist, legt die Liga-Leitung für jede Saison fest.

**Gleichstand.** Haben zwei oder mehr Fahrer gleich viele Punkte, entscheidet der Countback:

1. mehr Siege in Hauptrennen,
2. danach mehr zweite Plätze in Hauptrennen, dann mehr dritte Plätze und so weiter,
3. danach die Platzierungen in Sprints nach demselben Prinzip.

Ist danach immer noch alles gleich, teilen sich die Fahrer den Platz in der Tabelle. Für die Teamwertung gilt dasselbe Verfahren mit allen Ergebnissen, die für das Team zählen.`,
          body_en: `**Points.** League management sets the points scheme for each season – for example how many points are awarded in main races and sprints, and whether there are bonus points (such as for the fastest lap). The scheme is part of the settings of each season and is shown on the website.

**Drivers' standings.** Every driver receives the points they score themselves – whether as a regular or as a reserve driver.

**Teams' standings.** Regular drivers' points count for their team. Whether a reserve driver's points also count for the team they stood in for is decided by league management for each season.

**Ties.** If two or more drivers have the same number of points, countback decides:

1. more wins in main races,
2. then more second places in main races, then more third places, and so on,
3. then sprint placings on the same principle.

If everything is still equal after that, the drivers share the position in the standings. The same procedure applies to the teams' standings, using all results that count for the team.`,
        },
        {
          number: '§1.7',
          anchor: 'p1-7',
          title_de: 'Ergebnisse: vorläufig, final, korrigiert',
          title_en: 'Results: provisional, final, corrected',
          body_de: `- **Vorläufig:** Kurz nach dem Rennen veröffentlichen wir das vorläufige Ergebnis. Es enthält bereits die Strafen, die das Spiel selbst verhängt hat. Mit der Veröffentlichung beginnt die Protestfrist ([§7.2](#p7-2)).
- **Final:** Ist die Protestfrist abgelaufen und sind alle Entscheidungen zu dieser Runde veröffentlicht, wird das Ergebnis final. Zeit-, Positions- und DSQ-Strafen der Stewards sind dann automatisch eingerechnet.
- **Korrigiert:** Stellt sich nach der Finalisierung ein Fehler heraus – etwa ein Übertragungsfehler oder ein erfolgreicher Einspruch nach [§7.8](#p7-8) –, korrigiert die Liga-Leitung das Ergebnis. Es wird dann als „korrigiert" markiert, und der Grund wird öffentlich angegeben.

Solange ein Ergebnis vorläufig ist, kann sich auch die Tabelle noch ändern.`,
          body_en: `- **Provisional:** shortly after the race we publish the provisional result. It already includes the penalties imposed by the game itself. Publication starts the protest window ([§7.2](#p7-2)).
- **Final:** once the protest window has closed and all decisions for the round have been published, the result becomes final. Time, position and DSQ penalties imposed by the stewards are then applied automatically.
- **Corrected:** if an error comes to light after the result is final – such as a transcription error or a successful appeal under [§7.8](#p7-8) – league management corrects the result. It is then marked as "corrected" and the reason is published.

As long as a result is provisional, the standings may still change.`,
        },
      ],
    },

    // ---------------------------------------------------------------------------
    // §2 Anmeldung & Abmeldung
    // ---------------------------------------------------------------------------
    {
      number: '§2',
      anchor: 'p2',
      title_de: 'Anmeldung & Abmeldung',
      title_en: 'Sign-up & absence',
      body_de: '',
      body_en: '',
      children: [
        {
          number: '§2.1',
          anchor: 'p2-1',
          title_de: 'Voraussetzungen',
          title_en: 'Requirements',
          body_de: `Um mitzufahren, brauchst du:

- EA SPORTS F1® 25 auf PC (Steam oder EA App), PlayStation oder Xbox, immer mit dem aktuellen Patch,
- zusätzliche Spielinhalte (z. B. ein Season Pack) nur, wenn die Liga-Leitung sie für die Saison vorschreibt ([§10.1](#p10-1)),
- auf Konsolen das Online-Abo deiner Plattform,
- ein EA-Konto (EA-ID) und aktiviertes Crossplay,
- ein Discord-Konto und die Mitgliedschaft auf unserem Discord-Server,
- ein Mindestalter von 16 Jahren,
- eine stabile Internetverbindung, am besten per LAN-Kabel,
- ein Lenkrad oder einen Controller – beides ist erlaubt.

Mit der Anmeldung bestätigst du, dass du mindestens 16 Jahre alt bist und dieses Regelwerk gelesen hast.`,
          body_en: `To race with us, you need:

- EA SPORTS F1® 25 on PC (Steam or EA app), PlayStation or Xbox, always on the latest patch,
- additional game content (e.g. a Season Pack) only if league management requires it for the season ([§10.1](#p10-1)),
- on consoles, your platform's online subscription,
- an EA account (EA ID) with crossplay enabled,
- a Discord account and membership of our Discord server,
- a minimum age of 16,
- a stable internet connection, ideally via LAN cable,
- a wheel or a controller – both are allowed.

By signing up, you confirm that you are at least 16 years old and have read this rulebook.`,
        },
        {
          number: '§2.2',
          anchor: 'p2-2',
          title_de: 'Anmeldeformular',
          title_en: 'Sign-up form',
          body_de: `- Du meldest dich über das Formular auf [/mitfahren](/mitfahren) an. Ein Konto auf der Website brauchst du dafür nicht.
- Wir fragen nur ab, was wir für die Liga brauchen, zum Beispiel Gamertag, Discord-Name, Plattform, Eingabegerät und Wunsch-Startnummer.
- Nach dem Absenden meldet sich die Liga-Leitung über Discord bei dir. Achte darauf, dass du auf unserem Server erreichbar bist.
- Pro Person ist nur eine Anmeldung erlaubt. Mehrere Konten, geteilte Konten oder das Fahren für eine andere Person sind verboten.
- Einen Anspruch auf einen Platz gibt es nicht. Die Liga-Leitung entscheidet, ob du aufgenommen wirst und ob du einen Stammplatz oder einen Platz im Reservepool bekommst.
- Mach bitte ehrliche Angaben. Falsche Angaben, zum Beispiel zum Alter, führen zum Ausschluss.`,
          body_en: `- You sign up using the form at [/en/join](/en/join). You do not need an account on the website.
- We only ask for what the league needs, for example gamertag, Discord name, platform, input device and preferred race number.
- After you submit the form, league management will contact you via Discord. Make sure you can be reached on our server.
- Only one sign-up per person is allowed. Multiple accounts, shared accounts or racing on behalf of someone else are prohibited.
- There is no entitlement to a place. League management decides whether you are accepted and whether you get a regular seat or a place in the reserve pool.
- Please provide honest information. False information, for example about your age, leads to exclusion.`,
        },
        {
          number: '§2.3',
          anchor: 'p2-3',
          title_de: 'Stammfahrer & Reservefahrer',
          title_en: 'Regular & reserve drivers',
          body_de: `- Das Starterfeld hat 22 Stammplätze: 11 Teams mit je 2 Fahrern.
- Die Liga-Leitung teilt die Stammfahrer den Teams zu. Wünsche nehmen wir gern auf, einen Anspruch auf ein bestimmtes Team gibt es aber nicht.
- Alle weiteren aufgenommenen Fahrer bilden den Reservepool.
- Fehlt ein Stammfahrer, übernimmt ein Reservefahrer für dieses Rennen sein Cockpit ([§2.4](#p2-4)). Er fährt dann für das Team des fehlenden Stammfahrers.
- Wird ein Stammplatz dauerhaft frei, vergibt die Liga-Leitung ihn neu. Dabei berücksichtigt sie vor allem den Reservepool, die Zuverlässigkeit und das Fahrverhalten.
- Teamwechsel während einer Saison sind nur mit Zustimmung der Liga-Leitung möglich.`,
          body_en: `- The grid has 22 regular seats: 11 teams with 2 drivers each.
- League management assigns regular drivers to teams. We are happy to take preferences into account, but there is no entitlement to a particular team.
- All other accepted drivers form the reserve pool.
- If a regular driver is absent, a reserve driver takes their seat for that race ([§2.4](#p2-4)). The reserve then races for the absent driver's team.
- If a regular seat becomes permanently vacant, league management reassigns it. It mainly considers the reserve pool, reliability and driving conduct.
- Changing teams during a season is only possible with the approval of league management.`,
        },
        {
          number: '§2.4',
          anchor: 'p2-4',
          title_de: 'Reihenfolge im Reservepool',
          title_en: 'Reserve pool order',
          body_de: `- Der Reservepool hat eine feste Reihenfolge, die auf der Website sichtbar ist. Neue Reservefahrer kommen ans Ende der Liste.
- Reservefahrer tragen sich für jedes Rennen im Discord als verfügbar ein – bis zur selben Frist wie bei der Abmeldung ([§2.5](#p2-5)).
- Ist ein Stammplatz frei, rückt der erste verfügbare Reservefahrer der Liste nach. Sind mehrere Plätze frei, rücken die nächsten verfügbaren Reservefahrer in derselben Reihenfolge nach.
- Die Startaufstellung mit allen Nachrückern veröffentlichen wir auf der Website, sobald die Frist abgelaufen ist.
- Meldet sich ein Stammfahrer verspätet ab, versuchen wir trotzdem, den Platz zu besetzen. Es gilt dieselbe Reihenfolge, soweit die Reservefahrer rechtzeitig erreichbar sind.
- Wer als Reservefahrer zusagt und dann nicht erscheint, wird wie ein unentschuldigt fehlender Fahrer behandelt ([§2.6](#p2-6)).
- Die Liga-Leitung kann die Reihenfolge in begründeten Fällen ändern, zum Beispiel wenn ein Reservefahrer mehrfach zugesagt hat und nicht erschienen ist.`,
          body_en: `- The reserve pool has a fixed order, which is shown on the website. New reserve drivers are added to the end of the list.
- Reserve drivers mark themselves as available for each race on Discord – by the same deadline as for sign-offs ([§2.5](#p2-5)).
- If a regular seat is free, the first available reserve driver on the list moves up. If several seats are free, the next available reserve drivers move up in the same order.
- We publish the starting grid, including all stand-ins, on the website as soon as the deadline has passed.
- If a regular driver signs off late, we still try to fill the seat. The same order applies, as far as the reserve drivers can be reached in time.
- A reserve driver who confirms and then does not turn up is treated like a driver with an unexcused absence ([§2.6](#p2-6)).
- League management may change the order for good reason, for example if a reserve driver has repeatedly confirmed and not turned up.`,
        },
        {
          number: '§2.5',
          anchor: 'p2-5',
          title_de: 'Abmeldung vom Rennen',
          title_en: 'Signing off from a race',
          body_de: `- Kannst du an einem Rennen nicht teilnehmen, melde dich im Abmelde-Kanal auf unserem Discord ab.
- **Frist:** bis spätestens 24 Stunden vor Rennbeginn. Maßgeblich ist die Startzeit im Kalender.
- Eine Abmeldung nach Ablauf der Frist gilt als verspätete Abmeldung. Sie ist trotzdem viel besser als gar keine – melde dich also auch kurzfristig noch ab.
- Einen Grund musst du nicht nennen.
- Ohne Abmeldung gehen wir davon aus, dass du am Start bist.
- Fehlt ein Stammfahrer auffällig oft – auch mit rechtzeitiger Abmeldung –, kann die Liga-Leitung nach einem Gespräch den Stammplatz an einen Reservefahrer vergeben.`,
          body_en: `- If you cannot take part in a race, sign off in the sign-off channel on our Discord.
- **Deadline:** no later than 24 hours before the race starts. The start time in the calendar is what counts.
- Signing off after the deadline counts as a late sign-off. It is still much better than no sign-off at all – so please sign off even at short notice.
- You do not have to give a reason.
- If you do not sign off, we assume you will be there.
- If a regular driver misses races unusually often – even with timely sign-offs – league management may, after talking to them, give the regular seat to a reserve driver.`,
        },
        {
          number: '§2.6',
          anchor: 'p2-6',
          title_de: 'Unentschuldigtes Fehlen',
          title_en: 'Unexcused absence',
          body_de: `- Unentschuldigt fehlt, wer nicht zum Rennen erscheint und sich nicht abgemeldet hat. Das gilt auch für Reservefahrer, die zugesagt haben.
- Mögliche Folgen (Maßnahmen der Liga-Leitung, siehe auch [§8.3](#p8-3), V-23 und V-24):
  - beim ersten Mal in einer Saison: Verwarnung,
  - beim zweiten Mal: Versetzung in den Reservepool beziehungsweise ans Ende der Reserveliste,
  - danach: Ausschluss aus der Liga.
- Wiederholte verspätete Abmeldungen können wie unentschuldigtes Fehlen behandelt werden.
- Echte Notfälle (z. B. Stromausfall, Krankheit, familiäre Gründe) berücksichtigen wir. Gib der Liga-Leitung einfach nachträglich kurz Bescheid.`,
          body_en: `- An absence is unexcused if you do not turn up for a race and have not signed off. This also applies to reserve drivers who have confirmed.
- Possible consequences (measures by league management, see also [§8.3](#p8-3), V-23 and V-24):
  - the first time in a season: a warning,
  - the second time: a move to the reserve pool or to the end of the reserve list,
  - after that: exclusion from the league.
- Repeated late sign-offs may be treated like unexcused absences.
- We take genuine emergencies into account (e.g. a power cut, illness, family matters). Just let league management know briefly afterwards.`,
        },
        {
          number: '§2.7',
          anchor: 'p2-7',
          title_de: 'Startnummern',
          title_en: 'Race numbers',
          body_de: `- Du wählst bei der Anmeldung eine Startnummer von 2 bis 99. Die Nummer 1 kann für den amtierenden Champion reserviert sein.
- Jede Nummer gibt es nur einmal. Ist deine Wunschnummer vergeben, stimmt die Liga-Leitung mit dir eine andere ab.
- Deine Nummer behältst du, solange du aktiv bist – auch über mehrere Saisons.
- Du kannst deine Nummer jederzeit wechseln, wenn die neue Nummer frei ist und die Liga-Leitung zustimmt. Der Wechsel gilt ab dem nächsten Rennen.
- Frühere Nummern bleiben in der Historie erhalten. Vergangene Ergebnisse zeigen die Nummer, mit der du damals gefahren bist.
- Die Nummern inaktiver Fahrer kann die Liga-Leitung wieder freigeben ([§2.8](#p2-8)).
- Stell deine Liga-Nummer auch im Spiel ein, soweit das Spiel das zulässt.`,
          body_en: `- When you sign up, you choose a race number from 2 to 99. Number 1 may be reserved for the reigning champion.
- Each number exists only once. If your preferred number is taken, league management will agree another one with you.
- You keep your number for as long as you are active – across several seasons, too.
- You can change your number at any time if the new number is free and league management approves. The change applies from the next race.
- Previous numbers are kept in the history. Past results show the number you raced with at the time.
- League management may release the numbers of inactive drivers ([§2.8](#p2-8)).
- Set your league number in the game as well, as far as the game allows.`,
        },
        {
          number: '§2.8',
          anchor: 'p2-8',
          title_de: 'Inaktivität & Austritt',
          title_en: 'Inactivity & leaving',
          body_de: `- Wer längere Zeit nicht fährt und auf Nachrichten der Liga-Leitung nicht reagiert, kann als inaktiv geführt werden. Wir melden uns vorher über Discord bei dir.
- Inaktive Fahrer verlieren ihren Stamm- oder Reserveplatz. Ihre Startnummer kann freigegeben werden.
- Du kannst die Liga jederzeit verlassen. Eine kurze Nachricht an die Liga-Leitung genügt.
- Deine bisherigen Ergebnisse bleiben erhalten, damit Tabellen und Statistiken stimmen. Auf Wunsch pseudonymisieren wir deinen Namen (z. B. „Ehemaliger Fahrer"). Details stehen in der [Datenschutzerklärung](/datenschutz).
- Du möchtest zurückkommen? Melde dich einfach erneut über [/mitfahren](/mitfahren) an. Deine alte Nummer bekommst du zurück, wenn sie noch frei ist.`,
          body_en: `- Anyone who does not race for a longer period and does not respond to messages from league management may be listed as inactive. We will contact you via Discord beforehand.
- Inactive drivers lose their regular or reserve place. Their race number may be released.
- You can leave the league at any time. A short message to league management is enough.
- Your past results are kept so that standings and statistics remain correct. On request, we pseudonymise your name (e.g. "Former driver"). Details are in the [privacy policy](/en/privacy).
- Want to come back? Simply sign up again at [/en/join](/en/join). You get your old number back if it is still free.`,
        },
      ],
    },

    // ---------------------------------------------------------------------------
    // §3 Fahrverhalten
    // ---------------------------------------------------------------------------
    {
      number: '§3',
      anchor: 'p3',
      title_de: 'Fahrverhalten',
      title_en: 'Driving conduct',
      body_de: '',
      body_en: '',
      children: [
        {
          number: '§3.1',
          anchor: 'p3-1',
          title_de: 'Grundsatz',
          title_en: 'General principle',
          body_de: `- Du bist für dein Auto verantwortlich. Fahre so, dass du es jederzeit unter Kontrolle hast.
- Vermeide Kontakt. Wer eine Kollision verursacht, muss mit einer Strafe rechnen – auch wenn es keine Absicht war.
- Nicht jede Berührung ist ein Vergehen. Trifft keinen der Beteiligten die überwiegende Schuld, werten die Stewards den Vorfall als Rennunfall ohne Strafe.
- Entscheidend ist dein Verhalten. Die Folgen eines Vorfalls fließen aber in die Höhe der Strafe ein.
- Online gibt es immer etwas Verzögerung (Latenz), besonders beim Crossplay. Halte deshalb etwas mehr Abstand, als offline nötig wäre, und rechne damit, dass andere Autos nicht exakt dort sind, wo du sie siehst.`,
          body_en: `- You are responsible for your car. Drive in a way that keeps it under control at all times.
- Avoid contact. Anyone who causes a collision must expect a penalty – even if it was not intentional.
- Not every touch is an offence. If none of the drivers involved is predominantly to blame, the stewards treat the incident as a racing incident without a penalty.
- Your behaviour is what counts. However, the consequences of an incident are reflected in the severity of the penalty.
- Online racing always involves some delay (latency), especially with crossplay. So leave a little more room than you would offline, and expect other cars not to be exactly where you see them.`,
        },
        {
          number: '§3.2',
          anchor: 'p3-2',
          title_de: 'Linienwechsel & Verteidigen',
          title_en: 'Changing line & defending',
          body_de: `- Zur Verteidigung darfst du auf einer Geraden einmal die Linie wechseln. Kehrst du danach zur Ideallinie zurück, um die nächste Kurve anzufahren, lass mindestens eine Autobreite Platz zum Streckenrand.
- Mehrfaches Hin- und Herfahren (Schlängeln) ist verboten. Ausnahme: das Aufwärmen der Reifen in der Formationsrunde oder hinter dem Safety Car, sofern du niemanden gefährdest.
- In der Bremszone darfst du deine Linie nicht mehr wechseln. Eine Bewegung als Reaktion auf den Angreifer im letzten Moment ist gefährlich und wird bestraft.
- Ist der Angreifer neben dir (Definition in [§3.3](#p3-3)), musst du ihm mindestens eine Autobreite Platz lassen.
- Einen Gegner neben die Strecke zu drängen ist verboten.
- Unnötiges Bremsen, um den Hintermann zu irritieren oder einen Auffahrunfall zu provozieren (Brake-Test), ist verboten.`,
          body_en: `- When defending, you may change line once on a straight. If you then move back to the racing line to approach the next corner, leave at least one car's width to the edge of the track.
- Weaving from side to side is prohibited. Exception: warming your tyres on the formation lap or behind the safety car, as long as you do not endanger anyone.
- You may not change line in the braking zone. A last-moment move in reaction to the attacker is dangerous and will be penalised.
- If the attacker is alongside you (as defined in [§3.3](#p3-3)), you must leave them at least one car's width.
- Forcing an opponent off the track is prohibited.
- Braking unnecessarily to unsettle the driver behind or to provoke a rear-end collision (brake-testing) is prohibited.`,
        },
        {
          number: '§3.3',
          anchor: 'p3-3',
          title_de: 'Kurvenrecht & Überholen',
          title_en: 'Cornering rights & overtaking',
          body_de: `- Der Angreifer ist dafür verantwortlich, dass sein Manöver sicher ist. Er muss sein Auto kontrollieren und die Kurve innerhalb der Track Limits schaffen können.
- **Kurvenrecht:** Liegt die Vorderachse des Angreifers beim Einlenken mindestens auf Höhe der Hinterachse des Verteidigers, gilt er als „neben" dem Verteidiger und hat Anspruch auf eine Autobreite Platz – innen wie außen. Liegt er weiter zurück, darf der Verteidiger seine Linie frei wählen, und der Angreifer muss zurückstecken.
- Auch der Angreifer muss Platz lassen: Wer innen überholt, darf den Verteidiger am Kurvenausgang nicht von der Strecke drücken.
- Ein Manöver aus zu großer Entfernung, bei dem der Angreifer die Kurve nur mit Kontakt oder neben der Strecke schaffen würde (Dive-Bomb), ist verboten.
- Überholen außerhalb der Strecke ist verboten. Eine so gewonnene Position musst du sofort zurückgeben ([§3.4](#p3-4)).
- Wechsle erst vor den Überholten, wenn du klar vorbei bist.`,
          body_en: `- The attacker is responsible for making the move safely. They must be in control of their car and able to make the corner within track limits.
- **Cornering rights:** if the attacker's front axle is at least level with the defender's rear axle at turn-in, the attacker counts as "alongside" and is entitled to one car's width of space – on the inside and on the outside. If the attacker is further back, the defender may choose their line freely and the attacker must back out.
- The attacker must leave space too: when overtaking on the inside, you may not push the defender off the track on corner exit.
- A move from too far back, where the attacker could only make the corner with contact or by leaving the track (dive-bomb), is prohibited.
- Overtaking off the track is prohibited. A position gained this way must be given back immediately ([§3.4](#p3-4)).
- Only move across in front of the car you have passed once you are clearly ahead.`,
        },
        {
          number: '§3.4',
          anchor: 'p3-4',
          title_de: 'Track Limits',
          title_en: 'Track limits',
          body_de: `- Die weißen Linien begrenzen die Strecke. Randsteine (Kerbs) gehören zur Strecke.
- Das Spiel überwacht die Track Limits und verhängt Warnungen und Strafen. Diese gelten.
- Die Stewards dürfen zusätzlich bestrafen, wenn sich jemand neben der Strecke einen Vorteil verschafft hat, den das Spiel nicht erkannt hat – zum Beispiel beim Überholen oder Verteidigen.
- Hast du neben der Strecke eine Position gewonnen, gib sie sofort und sicher zurück. Dann gibt es dafür in der Regel keine Strafe.
- Auch wer eine Position nur halten kann, weil er neben der Strecke fährt, verschafft sich einen unerlaubten Vorteil.
- Für einzelne Kurven kann die Liga-Leitung Sonderregeln festlegen. Sie stehen dann auf der Seite [Lobby-Einstellungen](/liga/lobby).`,
          body_en: `- The white lines mark the edges of the track. Kerbs are part of the track.
- The game monitors track limits and issues warnings and penalties. These apply.
- The stewards may also penalise a driver who gained an advantage off the track that the game did not detect – for example when overtaking or defending.
- If you gain a position off the track, give it back immediately and safely. As a rule, there is then no penalty.
- A driver who can only keep a position by driving off the track is also gaining an unfair advantage.
- League management may set special rules for individual corners. These are then listed on the [lobby settings](/en/league/lobby) page.`,
        },
        {
          number: '§3.5',
          anchor: 'p3-5',
          title_de: 'Wiedereinfahren auf die Strecke',
          title_en: 'Rejoining the track',
          body_de: `- Kommst du von der Strecke ab oder drehst dich, fahre erst zurück, wenn es sicher ist. Schau vorher auf Radar, Spiegel oder Rückblick.
- Fahre möglichst parallel zur Strecke zurück und nicht quer über die Ideallinie.
- Nach einem Dreher: Bleib auf der Bremse stehen, bis der Verkehr vorbei ist. Dreh dein Auto nicht mitten auf der Strecke und fahre nie gegen die Fahrtrichtung.
- Für ein sicheres Wiedereinfahren bist du allein verantwortlich. Fahrer auf der Strecke müssen dir keinen Platz machen, sollen einen Unfall aber vermeiden, wenn das gefahrlos möglich ist.
- Stellt dich das Spiel beim Zurückkehren kurzzeitig als Geist dar, darfst du das nicht ausnutzen ([§5.4](#p5-4)).`,
          body_en: `- If you go off or spin, only rejoin when it is safe. Check your radar, mirrors or look-back camera first.
- Rejoin as parallel to the track as possible and not straight across the racing line.
- After a spin: stay on the brakes until the traffic has passed. Do not turn your car around in the middle of the track and never drive the wrong way.
- You alone are responsible for rejoining safely. Drivers on the track do not have to make room for you, but should avoid an accident if they can do so safely.
- If the game briefly shows you as a ghost when you rejoin, you must not take advantage of it ([§5.4](#p5-4)).`,
        },
        {
          number: '§3.6',
          anchor: 'p3-6',
          title_de: 'Blaue Flaggen & Überrundungen',
          title_en: 'Blue flags & lapping',
          body_de: `- Zeigt dir das Spiel die blaue Flagge, lass das schnellere Auto zügig und sicher vorbei – in der Regel innerhalb der nächsten drei Kurven.
- Mach es vorhersehbar: Bleib auf deiner Linie, geh auf einer Geraden etwas vom Gas oder lass in einer Kurve deutlich Platz. Bremse nie plötzlich auf der Ideallinie.
- Der überrundende Fahrer muss geduldig sein und darf kein riskantes Manöver erzwingen. Für einen sauberen Vorbeigang sind beide verantwortlich.
- Zwischen Fahrern in derselben Runde gibt es keine blauen Flaggen. Dort wird ganz normal gekämpft.`,
          body_en: `- If the game shows you a blue flag, let the faster car past promptly and safely – as a rule within the next three corners.
- Make it predictable: stay on your line, lift slightly on a straight or leave clear space in a corner. Never brake suddenly on the racing line.
- The lapping driver must be patient and must not force a risky move. Both drivers are responsible for a clean pass.
- There are no blue flags between drivers on the same lap. They race each other as normal.`,
        },
        {
          number: '§3.7',
          anchor: 'p3-7',
          title_de: 'Unfälle & Zurückwarten',
          title_en: 'Incidents & waiting to give places back',
          body_de: `- Hast du einen Unfall verursacht und dadurch Positionen gewonnen, gib sie dem betroffenen Fahrer so bald wie sicher möglich zurück.
- Hast du einen Fahrer gedreht oder von der Strecke gedrängt, nimm Tempo raus und lass ihn wieder vorbei, sobald er zurück auf der Strecke ist. Warte dabei abseits der Ideallinie – nie hinter einer Kuppe oder mitten in einer Kurve.
- Ist der betroffene Fahrer ausgeschieden oder so weit zurückgefallen, dass Warten nicht mehr sinnvoll ist, fahr weiter. Die Stewards berücksichtigen den Vorfall.
- Freiwilliges Zurückgeben oder Warten wirkt strafmildernd. In klaren Fällen kann die Strafe ganz entfallen.
- An Unfallstellen: Tempo reduzieren, gelbe Flaggen beachten, Abstand halten.
- Ärger nach einem Unfall klärst du nicht im Chat, sondern mit einer Meldung an die Stewards ([§7](#p7)).`,
          body_en: `- If you caused an incident and gained positions as a result, give them back to the affected driver as soon as it is safe to do so.
- If you spun a driver or forced them off the track, slow down and let them back past once they have rejoined. Wait off the racing line – never behind a crest or in the middle of a corner.
- If the affected driver has retired or dropped so far back that waiting no longer makes sense, carry on. The stewards will take the incident into account.
- Voluntarily giving a place back or waiting counts as a mitigating factor. In clear cases, the penalty may be dropped entirely.
- At incident scenes: slow down, observe yellow flags, keep your distance.
- Do not settle disputes after an incident in the chat – file a report with the stewards instead ([§7](#p7)).`,
        },
        {
          number: '§3.8',
          anchor: 'p3-8',
          title_de: 'Boxengasse',
          title_en: 'Pit lane',
          body_de: `- Die durchgezogenen Linien an Boxeneinfahrt und Boxenausfahrt darfst du nicht überfahren.
- Fahre die Boxeneinfahrt vorhersehbar an. Zieh nicht plötzlich vor einem anderen Auto zur Einfahrt hinüber.
- Beim Verlassen der Box bleibst du bis zum Ende der Ausfahrtslinie auf deiner Seite. Fahrer auf der Strecke haben Vorrang, dürfen die Ausfahrt aber nicht absichtlich zustellen.
- Das Tempolimit in der Boxengasse regelt das Spiel. Strafen des Spiels gelten.
- Boxenstopps sind auch unter Safety Car und VSC erlaubt, solange die Boxengasse offen ist.`,
          body_en: `- You must not cross the solid lines at the pit entry and pit exit.
- Approach the pit entry predictably. Do not suddenly cut across in front of another car to reach the entry.
- When leaving the pits, stay on your side until the end of the pit exit line. Drivers on the track have priority but must not deliberately block the exit.
- The game controls the pit lane speed limit. Game penalties apply.
- Pit stops are also allowed under the safety car and VSC, as long as the pit lane is open.`,
        },
      ],
    },

    // ---------------------------------------------------------------------------
    // §4 Qualifying
    // ---------------------------------------------------------------------------
    {
      number: '§4',
      anchor: 'p4',
      title_de: 'Qualifying',
      title_en: 'Qualifying',
      body_de: '',
      body_en: '',
      children: [
        {
          number: '§4.1',
          anchor: 'p4-1',
          title_de: 'Format & Startaufstellung',
          title_en: 'Format & starting grid',
          body_de: `- Das Qualifying-Format (z. B. kurzes Qualifying oder Einzelrunde) steht in den Lobby-Einstellungen der jeweiligen Saison (Seite [/liga/lobby](/liga/lobby)). An Sprint-Wochenenden kann es abweichen.
- Die Startaufstellung ergibt sich aus dem Qualifying-Ergebnis des Spiels. Grid-Strafen aus dem vorherigen Rennen kommen hinzu.
- Kann das Spiel eine Grid-Strafe nicht direkt umsetzen, legt die Rennleitung vor dem Start fest und gibt bekannt, wie sie ersetzt wird – zum Beispiel durch eine gleichwertige Zeitstrafe auf das Rennergebnis.`,
          body_en: `- The qualifying format (e.g. short qualifying or one-shot) is set out in the lobby settings of each season (page [/en/league/lobby](/en/league/lobby)). It may differ on sprint weekends.
- The starting grid is based on the game's qualifying result. Grid penalties from the previous race are then applied.
- If the game cannot apply a grid penalty directly, race control decides before the start how it will be replaced – for example by an equivalent time penalty on the race result – and announces this.`,
        },
        {
          number: '§4.2',
          anchor: 'p4-2',
          title_de: 'Verhalten auf Aufwärm- und Einrollrunden',
          title_en: 'Conduct on out-laps and in-laps',
          body_de: `- Wer eine schnelle Runde fährt, hat Vorrang.
- Auf Aufwärm- und Einrollrunden achtest du ständig auf Radar und Spiegel. Mach frühzeitig und vorhersehbar Platz – möglichst abseits der Ideallinie und nicht mitten in einer Kurve.
- Fahre nicht langsam auf der Ideallinie und bleib nicht auf der Strecke stehen.
- Achte beim Verlassen der Boxengasse auf Autos, die sich auf einer schnellen Runde nähern.
- Plane deine schnelle Runde mit genug Abstand zum Vordermann. Das hilft dir und allen anderen.`,
          body_en: `- Drivers on a fast lap have priority.
- On out-laps and in-laps, keep a constant eye on your radar and mirrors. Make room early and predictably – ideally off the racing line and not in the middle of a corner.
- Do not drive slowly on the racing line and do not stop on the track.
- When leaving the pit lane, watch out for cars approaching on a fast lap.
- Plan your fast lap with enough gap to the car in front. That helps you and everyone else.`,
        },
        {
          number: '§4.3',
          anchor: 'p4-3',
          title_de: 'Behinderung',
          title_en: 'Impeding',
          body_de: `- Eine Behinderung liegt vor, wenn ein Fahrer auf einer schnellen Runde deinetwegen deutlich vom Gas gehen, ausweichen oder seine Runde abbrechen muss.
- Behinderungen bestrafen die Stewards nach [§8.3](#p8-3) (V-11). Kommt es zu einer Kollision, gelten zusätzlich V-01 bis V-03.
- Läufst du auf deiner schnellen Runde auf ein langsames Auto auf, das dir sichtbar und rechtzeitig Platz macht, liegt keine Behinderung vor.`,
          body_en: `- Impeding occurs when a driver on a fast lap has to lift significantly, take evasive action or abandon their lap because of you.
- The stewards penalise impeding under [§8.3](#p8-3) (V-11). If a collision occurs, V-01 to V-03 apply in addition.
- If you catch a slow car on your fast lap and it clearly makes room in good time, that is not impeding.`,
        },
        {
          number: '§4.4',
          anchor: 'p4-4',
          title_de: 'Probleme im Qualifying',
          title_en: 'Problems in qualifying',
          body_de: `- Verlierst du im Qualifying die Verbindung und lässt das Spiel einen Wiedereinstieg zu, darfst du zurückkehren und weiterfahren. Bereits gesetzte Zeiten zählen, soweit das Spiel sie übernimmt.
- Kannst du nicht zurückkehren oder hast du keine gültige Zeit, startest du vom Ende des Feldes. Betrifft das mehrere Fahrer, gilt die Reihenfolge, die das Spiel vergibt.
- Das Qualifying wird für einzelne Fahrer nicht wiederholt. Stürzt die Lobby ab oder sind viele Fahrer gleichzeitig betroffen, entscheidet die Rennleitung über einen Neustart.`,
          body_en: `- If you lose connection in qualifying and the game allows you to rejoin, you may return and carry on. Times already set count as far as the game keeps them.
- If you cannot return or have no valid time, you start from the back of the grid. If this affects several drivers, the order assigned by the game applies.
- Qualifying is not repeated for individual drivers. If the lobby crashes or many drivers are affected at the same time, race control decides whether to restart.`,
        },
      ],
    },

    // ---------------------------------------------------------------------------
    // §5 Rennen
    // ---------------------------------------------------------------------------
    {
      number: '§5',
      anchor: 'p5',
      title_de: 'Rennen',
      title_en: 'Race',
      body_de: '',
      body_en: '',
      children: [
        {
          number: '§5.1',
          anchor: 'p5-1',
          title_de: 'Start & Formationsrunde',
          title_en: 'Start & formation lap',
          body_de: `- Ist eine Formationsrunde eingestellt, gilt dort Überholverbot. Ausnahme: Ein Fahrer hat ein Problem und fällt zurück. Nimm dann deinen ursprünglichen Platz wieder ein, sobald es sicher möglich ist.
- Halte in der Formationsrunde ausreichend Abstand. Reifen und Bremsen aufwärmen ist erlaubt, solange du niemanden gefährdest.
- Einen Frühstart bestraft das Spiel. Diese Strafe gilt.
- In der ersten Runde ist das Feld eng. Bremse lieber etwas zu früh als zu spät. Die Stewards bewerten Vorfälle in der ersten Runde nach denselben Regeln wie sonst auch. Allgemeines Gedränge ohne klaren Verursacher ist meist ein Rennunfall.
- Prüfe vor dem Start deine Einstellungen (Fahrhilfen, Setup, Reifen). Ein falsch eingestelltes Auto ist kein Grund für einen Neustart.`,
          body_en: `- If a formation lap is enabled, overtaking is prohibited on it. Exception: a driver has a problem and drops back. In that case, return to your original position as soon as it is safe.
- Keep enough distance on the formation lap. Warming up tyres and brakes is allowed, as long as you do not endanger anyone.
- The game penalises jump starts. That penalty applies.
- The field is tightly packed on the first lap. Better to brake a little too early than too late. The stewards judge first-lap incidents by the same rules as any other. General jostling without a clear cause is usually a racing incident.
- Check your settings before the start (assists, setup, tyres). A car with the wrong settings is no reason for a restart.`,
        },
        {
          number: '§5.2',
          anchor: 'p5-2',
          title_de: 'Rennablauf',
          title_en: 'Race procedure',
          body_de: `- Renndistanz, Sprints, Reifenregeln und weitere Einstellungen stehen in den Lobby-Einstellungen der jeweiligen Saison (Seite [/liga/lobby](/liga/lobby)).
- Gewertet wird nach dem Ergebnis des Spiels, einschließlich der Strafen, die das Spiel verhängt hat. Danach folgen die Entscheidungen der Stewards ([§1.7](#p1-7)).
- Ist dein Auto zu stark beschädigt, fahre in die Box und beende das Rennen dort. Stell dein Auto nicht auf der Strecke ab.
- Den Text-Chat im Spiel nutzt du während des Rennens nur für kurze, wichtige Hinweise, zum Beispiel eine Entschuldigung oder ein technisches Problem.
- Fahre nach der Zieldurchfahrt ruhig weiter, bis das Spiel die Session beendet. Kein Bremsen auf der Ideallinie und keine Show-Einlagen neben anderen Autos.
- Nimm dein Rennen möglichst auf und bewahre die Aufnahme mindestens bis zum Ende der Protestfrist auf ([§7.3](#p7-3)).`,
          body_en: `- Race distance, sprints, tyre rules and other settings are set out in the lobby settings of each season (page [/en/league/lobby](/en/league/lobby)).
- Classification follows the game's result, including any penalties imposed by the game. The stewards' decisions are applied afterwards ([§1.7](#p1-7)).
- If your car is too badly damaged, drive into the pits and retire there. Do not park your car on the track.
- During the race, only use the in-game text chat for short, important messages, such as an apology or a technical problem.
- After crossing the finish line, keep driving calmly until the game ends the session. No braking on the racing line and no showing off next to other cars.
- Record your race if you can, and keep the recording at least until the protest window has closed ([§7.3](#p7-3)).`,
        },
        {
          number: '§5.3',
          anchor: 'p5-3',
          title_de: 'Disconnects & Lags',
          title_en: 'Disconnects & lag',
          body_de: `- Einzelne Disconnects führen nicht zu einem Neustart. Wer im Rennen die Verbindung verliert, wird in der Regel als ausgeschieden (DNF) gewertet.
- Lässt das Spiel einen Wiedereinstieg in das laufende Rennen zu, darfst du ihn nutzen. Fahre danach besonders vorsichtig und nimm Rücksicht auf Fahrer, die du überrundest oder die dich überrunden.
- Übernimmt das Spiel dein Auto nach einem Disconnect mit einer KI, zählt das Ergebnis der KI nicht. Du wirst als ausgeschieden (DNF) gewertet.
- Laggt ein Auto stark (es springt, ruckelt oder ist nicht berechenbar), halte großzügig Abstand. Laggst du selbst wiederholt stark, kann dich die Rennleitung auffordern, in die Box zu fahren und das Rennen zu beenden, um andere nicht zu gefährden.
- Kollisionen, die nur durch Lag entstehen, sind oft ein Rennunfall. Die Stewards berücksichtigen, was jeder Fahrer auf seinem Bildschirm sehen konnte. Clips aus beiden Perspektiven helfen dabei.
- Beuge vor: Nutze ein LAN-Kabel und beende Downloads und Streams auf anderen Geräten in deinem Netz. Hast du wiederholt Verbindungsprobleme, kann die Liga-Leitung einen Verbindungstest mit dir vereinbaren.`,
          body_en: `- Individual disconnects do not lead to a restart. A driver who loses connection during the race is normally classified as retired (DNF).
- If the game allows you to rejoin the race in progress, you may do so. Drive with extra care afterwards and be considerate of drivers you are lapping or who are lapping you.
- If the game hands your car to the AI after a disconnect, the AI's result does not count. You are classified as retired (DNF).
- If a car is lagging badly (jumping, stuttering or unpredictable), give it plenty of room. If you repeatedly lag badly yourself, race control may ask you to pit and retire so as not to endanger others.
- Collisions caused purely by lag are often racing incidents. The stewards consider what each driver could see on their own screen. Clips from both perspectives help with this.
- Prevention: use a LAN cable and stop downloads and streams on other devices on your network. If you keep having connection problems, league management may arrange a connection test with you.`,
        },
        {
          number: '§5.4',
          anchor: 'p5-4',
          title_de: 'Ghosting im Spiel',
          title_en: 'Ghosting in the game',
          body_de: `- In manchen Situationen stellt das Spiel Autos als „Geist" dar. Man kann dann durch sie hindurchfahren. Das passiert zum Beispiel beim Zurückkehren auf die Strecke oder nach einem Wiedereinstieg – je nach Spiel und Lobby-Einstellungen.
- Bist du selbst gegeistert: Fahre vorhersehbar, bleib möglichst abseits der Ideallinie und behindere niemanden.
- Überholst du ein gegeistertes Auto, obwohl du ohne Ghosting nicht hättest vorbeikommen können, gib die Position zurück, sobald es sicher möglich ist.
- Ghosting absichtlich herbeizuführen oder auszunutzen, um Positionen zu gewinnen, ist verboten ([§8.3](#p8-3), V-16).`,
          body_en: `- In some situations the game shows cars as "ghosts", meaning you can drive through them. This happens, for example, when rejoining the track or after rejoining a session – depending on the game and the lobby settings.
- If you are ghosted yourself: drive predictably, stay off the racing line where possible and do not get in anyone's way.
- If you pass a ghosted car where you could not have got past without ghosting, give the position back as soon as it is safe.
- Deliberately triggering or exploiting ghosting to gain positions is prohibited ([§8.3](#p8-3), V-16).`,
        },
        {
          number: '§5.5',
          anchor: 'p5-5',
          title_de: 'Rennabbruch & Neustart',
          title_en: 'Race suspension & restart',
          body_de: `- Zeigt das Spiel eine rote Flagge, folge den Anweisungen des Spiels.
- Über einen Neustart entscheidet die Rennleitung. Gründe dafür sind ein Absturz der Lobby, ein Disconnect des Hosts, ein gleichzeitiger Disconnect vieler Fahrer (Richtwert: mindestens ein Viertel des Feldes) oder ein schwerer Spielfehler, der viele Fahrer betrifft.
- Einzelne Disconnects, Unfälle oder Strafen sind kein Grund für einen Neustart.

Je nach Zeitpunkt des Abbruchs gilt:

1. **Vor Ende der ersten Runde:** Neustart über die volle Distanz mit der ursprünglichen Startaufstellung. Alle Fahrer der ursprünglichen Startaufstellung dürfen wieder teilnehmen. Spielstrafen aus dem abgebrochenen Versuch entfallen.
2. **Nach der ersten Runde, aber vor 75 % der Renndistanz:** Neustart über die verbleibende Distanz, so genau wie das Spiel es zulässt. Die Startaufstellung folgt der Reihenfolge am Ende der letzten vollständig gefahrenen Runde. Kann das Spiel diese Aufstellung nicht umsetzen, legt die Rennleitung vor dem Neustart fest, wie verfahren wird. Gewertet wird das Ergebnis des Neustarts. Fahrer, die vor dem Abbruch ausgeschieden waren, bleiben ausgeschieden.
3. **Ab 75 % der Renndistanz:** kein Neustart. Gewertet wird die Reihenfolge am Ende der letzten vollständig gefahrenen Runde, mit vollen Punkten.

In den Fällen 2 und 3 bleiben Spielstrafen aus dem abgebrochenen Teil bestehen. Vorfälle aus dem abgebrochenen Teil können die Stewards in allen drei Fällen untersuchen.

Lässt sich die Reihenfolge nicht zuverlässig feststellen (zum Beispiel, weil es keine Aufnahme gibt), entscheidet die Rennleitung gemeinsam mit der Liga-Leitung, ob gewertet, neu gestartet oder ein Ersatztermin angesetzt wird. Ist ein Neustart am selben Abend nicht möglich, legt die Liga-Leitung einen Ersatztermin fest oder wertet die Runde nicht.`,
          body_en: `- If the game shows a red flag, follow the game's instructions.
- Race control decides on a restart. Reasons include a lobby crash, the host disconnecting, many drivers disconnecting at once (guideline: at least a quarter of the field) or a serious game bug affecting many drivers.
- Individual disconnects, accidents or penalties are no reason for a restart.

Depending on when the race is stopped:

1. **Before the end of the first lap:** full-distance restart from the original starting grid. All drivers on the original grid may take part again. Game penalties from the aborted attempt are cancelled.
2. **After the first lap but before 75 % of the race distance:** restart over the remaining distance, as closely as the game allows. The grid follows the order at the end of the last fully completed lap. If the game cannot set up this grid, race control decides before the restart how to proceed. The result of the restarted race counts. Drivers who had retired before the stoppage remain retired.
3. **From 75 % of the race distance:** no restart. The order at the end of the last fully completed lap is classified, with full points.

In cases 2 and 3, game penalties from the stopped part remain in force. In all three cases, the stewards may investigate incidents from the stopped part.

If the order cannot be established reliably (for example because no recording exists), race control and league management decide together whether to classify the race, restart it or set a replacement date. If a restart is not possible on the same evening, league management sets a replacement date or does not score the round.`,
        },
      ],
    },

    // ---------------------------------------------------------------------------
    // §6 Safety Car & VSC
    // ---------------------------------------------------------------------------
    {
      number: '§6',
      anchor: 'p6',
      title_de: 'Safety Car & VSC',
      title_en: 'Safety car & VSC',
      body_de: '',
      body_en: '',
      children: [
        {
          number: '§6.1',
          anchor: 'p6-1',
          title_de: 'Allgemeines',
          title_en: 'General',
          body_de: `- Ob und wie häufig ein Safety Car (SC) oder ein virtuelles Safety Car (VSC) kommt, steht in den Lobby-Einstellungen der jeweiligen Saison (Seite [/liga/lobby](/liga/lobby)). Beide Phasen steuert das Spiel.
- Folge immer den Anweisungen des Spiels, zum Beispiel zur Delta-Zeit, zum Überholverbot oder zum Zurückgeben einer Position.
- Strafen, die das Spiel in SC- oder VSC-Phasen verhängt, gelten. Die Stewards können zusätzlich bestrafen.`,
          body_en: `- Whether and how often a safety car (SC) or virtual safety car (VSC) is deployed is set out in the lobby settings of each season (page [/en/league/lobby](/en/league/lobby)). The game controls both.
- Always follow the game's instructions, for example on the delta time, the overtaking ban or giving a position back.
- Penalties imposed by the game during SC or VSC periods apply. The stewards may impose additional penalties.`,
        },
        {
          number: '§6.2',
          anchor: 'p6-2',
          title_de: 'Verhalten unter Safety Car',
          title_en: 'Conduct under the safety car',
          body_de: `- Überholen ist verboten, sobald das Spiel die SC-Phase anzeigt. Ausnahmen: Das Spiel fordert dich auf, jemanden vorbeizulassen, oder ein Auto ist offensichtlich langsam oder steht.
- Halte die Delta-Zeit ein, die das Spiel vorgibt, und schließ zügig zum Feld auf.
- Fahre gleichmäßig. Kein hartes Bremsen und kein plötzliches Beschleunigen im Feld.
- Reifen aufwärmen mit leichtem Schlängeln ist erlaubt, solange du genug Abstand hast und niemanden gefährdest.
- Boxenstopps sind erlaubt, solange die Boxengasse offen ist.`,
          body_en: `- Overtaking is prohibited as soon as the game shows the SC period. Exceptions: the game tells you to let someone past, or a car is obviously slow or stopped.
- Keep to the delta time set by the game and close up to the field promptly.
- Drive smoothly. No hard braking and no sudden acceleration in the pack.
- Gentle weaving to warm your tyres is allowed, as long as you keep enough distance and do not endanger anyone.
- Pit stops are allowed as long as the pit lane is open.`,
        },
        {
          number: '§6.3',
          anchor: 'p6-3',
          title_de: 'Verhalten unter VSC',
          title_en: 'Conduct under the VSC',
          body_de: `- Während der gesamten VSC-Phase gilt Überholverbot.
- Halte die Delta-Zeit ein, die das Spiel vorgibt. Bremse nicht abrupt, auch wenn du vor dem Delta liegst.
- Überholen ist erst wieder erlaubt, wenn das Spiel die VSC-Phase beendet hat und die Strecke grün ist.`,
          body_en: `- Overtaking is prohibited throughout the VSC period.
- Keep to the delta time set by the game. Do not brake abruptly, even if you are ahead of the delta.
- Overtaking is only allowed again once the game has ended the VSC period and the track is green.`,
        },
        {
          number: '§6.4',
          anchor: 'p6-4',
          title_de: 'Restart',
          title_en: 'Restart',
          body_de: `- Kommt das Safety Car in die Box, bestimmt der Führende das Tempo. Er darf das Feld nicht durch wiederholtes Bremsen und Beschleunigen gefährden oder absichtlich Auffahrunfälle provozieren.
- Überholen ist erst nach der Linie erlaubt, die das Spiel dafür vorgibt (in der Regel die Start-Ziel-Linie).
- Halte beim Restart Abstand zum Vordermann und rechne mit Lag – beim Restart passieren besonders viele Auffahrunfälle.
- Verstöße beim Restart werden nach [§8.3](#p8-3) (V-13) bestraft.`,
          body_en: `- When the safety car comes in, the leader controls the pace. They must not endanger the field by repeatedly braking and accelerating or deliberately provoke rear-end collisions.
- Overtaking is only allowed after the line specified by the game (usually the start/finish line).
- Keep your distance to the car in front at the restart and expect lag – restarts are where many rear-end collisions happen.
- Restart infringements are penalised under [§8.3](#p8-3) (V-13).`,
        },
      ],
    },

    // ---------------------------------------------------------------------------
    // §7 Vorfälle & Proteste
    // ---------------------------------------------------------------------------
    {
      number: '§7',
      anchor: 'p7',
      title_de: 'Vorfälle & Proteste',
      title_en: 'Incidents & protests',
      body_de: '',
      body_en: '',
      children: [
        {
          number: '§7.1',
          anchor: 'p7-1',
          title_de: 'Meldung',
          title_en: 'Reporting',
          body_de: `- Vorfälle meldest du ausschließlich über das Formular auf [/stewards/melden](/stewards/melden). Nachrichten auf Discord, im Chat oder mündliche Hinweise zählen nicht als Meldung.
- Melden können alle Fahrer, die an der Session teilgenommen haben.
- Pro Vorfall eine Meldung. Gib an: Session, Runde (Lap), Kurve oder Streckenabschnitt, beteiligte Fahrer, eine kurze sachliche Beschreibung sowie Clip-Link und Zeitstempel ([§7.3](#p7-3)).
- Bleib sachlich. Beleidigungen in einer Meldung werden nach [§9](#p9) behandelt.
- Wer bewusst falsche Angaben macht oder Beweise manipuliert, wird bestraft ([§8.3](#p8-3), V-25).`,
          body_en: `- You report incidents only via the form at [/en/stewards/report](/en/stewards/report). Messages on Discord, in the chat or verbal remarks do not count as reports.
- Any driver who took part in the session may file a report.
- One report per incident. Include: session, lap, corner or section of track, drivers involved, a short factual description, plus a clip link and timestamp ([§7.3](#p7-3)).
- Keep it factual. Insults in a report are dealt with under [§9](#p9).
- Anyone who knowingly provides false information or manipulates evidence will be penalised ([§8.3](#p8-3), V-25).`,
        },
        {
          number: '§7.2',
          anchor: 'p7-2',
          title_de: 'Frist',
          title_en: 'Deadline',
          body_de: `- Die Protestfrist beginnt mit der Veröffentlichung des vorläufigen Ergebnisses und dauert standardmäßig 48 Stunden. Die Liga-Leitung kann für eine Saison eine andere Frist festlegen. Das genaue Fristende steht bei jeder Runde auf der Website.
- Nach Ablauf der Frist nimmt das Formular keine Meldungen mehr an. Dann geht eine Meldung nur noch über die Liga-Leitung, und nur in begründeten Ausnahmefällen – zum Beispiel, wenn eine technische Störung die Meldung verhindert hat. Die Liga-Leitung entscheidet, ob sie die Meldung an die Stewards weitergibt.
- Ist das Ergebnis final, werden keine neuen Meldungen mehr bearbeitet. Schwere Verstöße wie absichtliches Rammen oder Betrug kann die Liga-Leitung aber auch später noch ahnden.`,
          body_en: `- The protest window opens when the provisional result is published and lasts 48 hours by default. League management may set a different window for a season. The exact closing time is shown for each round on the website.
- Once the window has closed, the form no longer accepts reports. A report can then only be submitted through league management, and only in justified exceptional cases – for example if a technical fault prevented the report. League management decides whether to pass it on to the stewards.
- Once a result is final, no new reports are processed. However, league management may still take action on serious offences such as deliberate ramming or cheating at a later stage.`,
        },
        {
          number: '§7.3',
          anchor: 'p7-3',
          title_de: 'Beweise',
          title_en: 'Evidence',
          body_de: `- **Ein Clip ist Pflicht.** Ohne Clip-Link wird eine Meldung nicht bearbeitet.
- Erlaubt sind Links zu YouTube, Twitch, Medal und Streamable sowie Freigabe-Links von Xbox und PlayStation.
- Gib einen Zeitstempel an, an dem der Vorfall im Clip zu sehen ist (z. B. 01:23). Ideal sind etwa 10 Sekunden vor bis 10 Sekunden nach dem Vorfall.
- Der Clip muss ohne Anmeldung abrufbar sein (öffentlich oder „nicht gelistet") und bis zum Ende der Saison erreichbar bleiben.
- Du darfst den Clip auf den relevanten Ausschnitt kürzen. Veränderungen, die den Ablauf verfälschen, sind verboten.
- Mit der Meldung erlaubst du uns, den Clip in der öffentlichen Entscheidung zu verlinken oder einzubetten (siehe [Teilnahmebedingungen](/teilnahmebedingungen)).
- Die Stewards dürfen alle verfügbaren Materialien nutzen, zum Beispiel Clips anderer Fahrer, Stream-Aufzeichnungen oder Daten aus dem Spiel.`,
          body_en: `- **A clip is mandatory.** A report without a clip link will not be processed.
- Links to YouTube, Twitch, Medal and Streamable are accepted, as are Xbox and PlayStation share links.
- Include a timestamp showing where the incident appears in the clip (e.g. 01:23). Ideally, the clip covers about 10 seconds before to 10 seconds after the incident.
- The clip must be viewable without logging in (public or "unlisted") and remain available until the end of the season.
- You may trim the clip to the relevant part. Changes that distort what happened are prohibited.
- By submitting a report, you allow us to link to or embed the clip in the public decision (see [terms of participation](/en/terms)).
- The stewards may use all available material, for example clips from other drivers, stream recordings or data from the game.`,
        },
        {
          number: '§7.4',
          anchor: 'p7-4',
          title_de: 'Verfahren',
          title_en: 'Procedure',
          body_de: `- Die Stewards prüfen zuerst, ob eine Meldung vollständig und fristgerecht ist. Unvollständige oder verspätete Meldungen können sie ablehnen.
- Sie sichten das Material und können Beteiligte über Discord um eine kurze Stellungnahme oder weitere Clips bitten. Antworte bitte innerhalb von 24 Stunden. Ohne Antwort entscheiden die Stewards auf Grundlage des vorhandenen Materials.
- Die Stewards können auch ohne Meldung selbst ermitteln, zum Beispiel wenn ihnen im Stream ein Vorfall auffällt.
- Die Stewards entscheiden in der Regel innerhalb von 72 Stunden nach Ende der Protestfrist.
- Mögliche Entscheidungen: keine Maßnahme (z. B. Rennunfall), Verwarnung oder eine Strafe nach [§8](#p8).
- Zeit-, Positions- und DSQ-Strafen werden automatisch in das Ergebnis eingerechnet. Grid-Strafen gelten für das nächste Rennen, Rennsperren ebenfalls ab dem nächsten Rennen.
- Sind alle Entscheidungen einer Runde veröffentlicht und ist die Frist abgelaufen, wird das Ergebnis final ([§1.7](#p1-7)).`,
          body_en: `- The stewards first check whether a report is complete and on time. They may reject incomplete or late reports.
- They review the material and may ask the drivers involved, via Discord, for a short statement or further clips. Please reply within 24 hours. Without a reply, the stewards decide on the basis of the material available.
- The stewards may also open an investigation on their own initiative, for example if they notice an incident on the stream.
- As a rule, the stewards decide within 72 hours after the protest window closes.
- Possible outcomes: no action (e.g. racing incident), a warning or a penalty under [§8](#p8).
- Time, position and DSQ penalties are applied to the result automatically. Grid penalties apply to the next race, as do race bans.
- Once all decisions for a round have been published and the window has closed, the result becomes final ([§1.7](#p1-7)).`,
        },
        {
          number: '§7.5',
          anchor: 'p7-5',
          title_de: 'Befangenheit',
          title_en: 'Conflicts of interest',
          body_de: `- Ein Steward, der an einem Vorfall beteiligt ist, darf über diesen Vorfall weder entscheiden noch abstimmen. Die Website setzt das technisch durch.
- Auch bei anderen Interessenkonflikten – zum Beispiel wenn sein Teamkollege beteiligt ist – soll sich ein Steward enthalten.
- Gibt es nicht genug unbeteiligte Stewards, entscheidet ein unbeteiligtes Mitglied der Liga-Leitung.`,
          body_en: `- A steward involved in an incident may neither decide nor vote on it. The website enforces this technically.
- A steward should also step aside in the case of other conflicts of interest – for example if their teammate is involved.
- If there are not enough uninvolved stewards, an uninvolved member of league management decides.`,
        },
        {
          number: '§7.6',
          anchor: 'p7-6',
          title_de: 'Vier-Augen-Prinzip',
          title_en: 'Four-eyes principle',
          body_de: `- Die Liga-Leitung kann für eine Saison das Vier-Augen-Prinzip aktivieren. Dann braucht jede Entscheidung die Zustimmung eines zweiten, unbeteiligten Stewards, bevor sie veröffentlicht wird.
- Ob das Vier-Augen-Prinzip gilt, steht in den Einstellungen der jeweiligen Saison.
- Sind sich die beiden Stewards nicht einig, entscheidet ein dritter unbeteiligter Steward – oder, falls keiner verfügbar ist, ein unbeteiligtes Mitglied der Liga-Leitung.`,
          body_en: `- League management may activate the four-eyes principle for a season. Every decision then needs the approval of a second, uninvolved steward before it is published.
- Whether the four-eyes principle applies is shown in the settings of each season.
- If the two stewards disagree, a third uninvolved steward decides – or, if none is available, an uninvolved member of league management.`,
        },
        {
          number: '§7.7',
          anchor: 'p7-7',
          title_de: 'Veröffentlichung',
          title_en: 'Publication',
          body_de: `- Jede Entscheidung wird vollständig auf der Website veröffentlicht: Referenznummer, betroffene Fahrer (Gamertag), Session, Runde (Lap), Beschreibung, Clip, Entscheidung und Begründung.
- Die Referenznummer ist so aufgebaut: **S1-R03-02** steht für Saison 1, Runde 3, Entscheidung Nr. 2.
- Auch Entscheidungen ohne Strafe werden veröffentlicht.
- Private Kontaktdaten aus Meldungen, zum Beispiel deinen Discord-Namen für Rückfragen, veröffentlichen wir nicht.`,
          body_en: `- Every decision is published in full on the website: reference number, drivers concerned (gamertag), session, lap, description, clip, decision and reasoning.
- The reference number is structured like this: **S1-R03-02** stands for season 1, round 3, decision no. 2.
- Decisions without a penalty are published too.
- We do not publish private contact details from reports, such as your Discord name for follow-up questions.`,
        },
        {
          number: '§7.8',
          anchor: 'p7-8',
          title_de: 'Einspruch',
          title_en: 'Appeal',
          body_de: `- Gegen eine Entscheidung kannst du einmal Einspruch einlegen: innerhalb von 24 Stunden nach ihrer Veröffentlichung, per Nachricht an die Liga-Leitung auf Discord.
- Ein Einspruch ist nur zulässig bei neuen Beweisen, die bei der Entscheidung nicht bekannt waren, oder bei einem klaren Verfahrensfehler (z. B. falscher Fahrer bestraft, befangener Steward, falsch berechnete Frist). Eine andere Meinung zur Bewertung reicht nicht.
- Über den Einspruch entscheiden Stewards, die an der ursprünglichen Entscheidung nicht beteiligt waren, oder ein unbeteiligtes Mitglied der Liga-Leitung. Diese Entscheidung ist endgültig.
- Ein Einspruch hält die Finalisierung des Ergebnisses nicht auf. Wird er angenommen, wird das Ergebnis nachträglich korrigiert ([§1.7](#p1-7)).
- Gegen Strafen, die das Spiel verhängt hat, gibt es keinen Einspruch. Ausnahme: [§8.2](#p8-2).`,
          body_en: `- You may appeal against a decision once: within 24 hours of its publication, by messaging league management on Discord.
- An appeal is only admissible if there is new evidence that was not known when the decision was made, or a clear procedural error (e.g. the wrong driver was penalised, a steward had a conflict of interest, a deadline was miscalculated). A different opinion on the assessment is not enough.
- The appeal is decided by stewards who were not involved in the original decision, or by an uninvolved member of league management. This decision is final.
- An appeal does not delay the result becoming final. If the appeal is upheld, the result is corrected afterwards ([§1.7](#p1-7)).
- There is no appeal against penalties imposed by the game. Exception: [§8.2](#p8-2).`,
        },
      ],
    },

    // ---------------------------------------------------------------------------
    // §8 Strafenkatalog
    // ---------------------------------------------------------------------------
    {
      number: '§8',
      anchor: 'p8',
      title_de: 'Strafenkatalog',
      title_en: 'Penalty catalogue',
      body_de: '',
      body_en: '',
      children: [
        {
          number: '§8.1',
          anchor: 'p8-1',
          title_de: 'Strafarten',
          title_en: 'Types of penalty',
          body_de: `Die Stewards können folgende Entscheidungen treffen:

- **Keine Maßnahme:** kein Verstoß oder Rennunfall.
- **Verwarnung:** wird öffentlich dokumentiert. Wiederholte Verwarnungen wirken strafverschärfend.
- **Zeitstrafe:** Sekunden, die zu deiner Rennzeit addiert werden.
- **Positionsstrafe:** Du wirst im Ergebnis um die festgelegte Zahl von Plätzen nach hinten versetzt.
- **Grid-Strafe:** Du startest im nächsten Rennen um die festgelegte Zahl von Plätzen weiter hinten.
- **Disqualifikation (DSQ):** Du wirst aus der Wertung der Session genommen und bekommst dafür keine Punkte.
- **Rennsperre:** Du darfst am nächsten Rennen (oder an mehreren) nicht teilnehmen. Dein Cockpit übernimmt ein Reservefahrer.

Zusätzlich kann die Liga-Leitung bei schweren oder wiederholten Verstößen einen Fahrer aus der Liga ausschließen.`,
          body_en: `The stewards can make the following decisions:

- **No action:** no offence, or a racing incident.
- **Warning:** recorded publicly. Repeated warnings count as an aggravating factor.
- **Time penalty:** seconds added to your race time.
- **Position penalty:** you are moved back in the result by the specified number of places.
- **Grid penalty:** you start the next race the specified number of places further back.
- **Disqualification (DSQ):** you are removed from the classification of the session and receive no points for it.
- **Race ban:** you may not take part in the next race (or several races). A reserve driver takes your seat.

In addition, league management may exclude a driver from the league for serious or repeated offences.`,
        },
        {
          number: '§8.2',
          anchor: 'p8-2',
          title_de: 'Anwendung',
          title_en: 'Application',
          body_de: `- Die Regelstrafen im Katalog ([§8.3](#p8-3)) sind Richtwerte. Die Stewards können im Einzelfall davon abweichen.
- **Mildernd** wirken zum Beispiel: Position sofort zurückgegeben, geringe Folgen, nachweisbarer Lag.
- **Verschärfend** wirken zum Beispiel: Wiederholung, Absicht, schwere Folgen, mehrere betroffene Fahrer.
- Umfasst ein Vorfall mehrere Verstöße, können die Stewards die Strafen addieren.
- Strafen, die das Spiel verhängt hat, bleiben bestehen. Die Stewards können zusätzlich bestrafen und berücksichtigen dabei die Spielstrafe. Hat das Spiel offensichtlich den falschen Fahrer bestraft, können die Stewards die Spielstrafe des Betroffenen aufheben.
- Eine Strafe gilt für die Session, in der der Vorfall passiert ist. Vorfälle im Qualifying werden in der Regel mit einer Grid-Strafe für das nächste Rennen geahndet.
- Strafen gelten für Stamm- und Reservefahrer gleichermaßen.`,
          body_en: `- The standard penalties in the catalogue ([§8.3](#p8-3)) are guidelines. The stewards may deviate from them in individual cases.
- **Mitigating** factors include: position given back immediately, minor consequences, proven lag.
- **Aggravating** factors include: repetition, intent, serious consequences, several drivers affected.
- If an incident involves several offences, the stewards may add the penalties together.
- Penalties imposed by the game remain in force. The stewards may add further penalties and take the game penalty into account. If the game has obviously penalised the wrong driver, the stewards may lift that driver's game penalty.
- A penalty applies to the session in which the incident occurred. Qualifying incidents are normally penalised with a grid penalty for the next race.
- Penalties apply equally to regular and reserve drivers.`,
        },
        {
          number: '§8.3',
          anchor: 'p8-3',
          title_de: 'Katalog',
          title_en: 'Catalogue',
          body_de: `Die folgende Tabelle nennt die Regelstrafen. Die Codes (V-01, V-02 …) verwenden die Stewards in ihren Entscheidungen.

${PENALTY_TABLE_DE}`,
          body_en: `The table below lists the standard penalties. The stewards use the codes (V-01, V-02 …) in their decisions.

${PENALTY_TABLE_EN}`,
        },
        {
          number: '§8.4',
          anchor: 'p8-4',
          title_de: 'Strafpunkte',
          title_en: 'Penalty points',
          body_de: `Ein Strafpunkte- oder Lizenzsystem ist derzeit nicht aktiv. Die Liga-Leitung kann es später einführen. Es wird dann vorher in diesem Regelwerk beschrieben und rechtzeitig angekündigt.`,
          body_en: `A penalty points or licence system is not currently active. League management may introduce one later. It would then be described in this rulebook beforehand and announced in good time.`,
        },
      ],
    },

    // ---------------------------------------------------------------------------
    // §9 Discord-Verhalten
    // ---------------------------------------------------------------------------
    {
      number: '§9',
      anchor: 'p9',
      title_de: 'Discord-Verhalten',
      title_en: 'Conduct on Discord',
      body_de: '',
      body_en: '',
      children: [
        {
          number: '§9.1',
          anchor: 'p9-1',
          title_de: 'Umgangston',
          title_en: 'Tone',
          body_de: `- Behandle alle respektvoll – Fahrer, Stewards, Staff und Gäste.
- Verboten sind Beleidigungen, Drohungen, Belästigung, Diskriminierung (z. B. wegen Herkunft, Geschlecht, Religion, sexueller Orientierung oder Behinderung), Spam und anstößige Inhalte.
- Die Community-Richtlinien von Discord gelten zusätzlich.
- Du kannst Deutsch oder Englisch schreiben und sprechen.`,
          body_en: `- Treat everyone with respect – drivers, stewards, staff and guests.
- Insults, threats, harassment, discrimination (e.g. on grounds of origin, gender, religion, sexual orientation or disability), spam and offensive content are prohibited.
- Discord's Community Guidelines apply in addition.
- You may write and speak in German or English.`,
        },
        {
          number: '§9.2',
          anchor: 'p9-2',
          title_de: 'Kanäle & Kommunikation',
          title_en: 'Channels & communication',
          body_de: `- Nutze jeden Kanal für seinen Zweck – zum Beispiel Abmeldungen nur im Abmelde-Kanal.
- Lies die Ankündigungen. Wichtige Infos stehen dort und auf der Website.
- Am Renntag triffst du dich zum Check-in im Voice-Kanal. Während der Sessions sind dort nur kurze, wichtige Durchsagen erwünscht – kein Trash-Talk.
- Schreib niemandem ungefragt immer wieder Direktnachrichten, auch nicht den Stewards.`,
          body_en: `- Use each channel for its purpose – for example, sign-offs only in the sign-off channel.
- Read the announcements. Important information is posted there and on the website.
- On race day, you check in in the voice channel. During sessions, only short, important calls are welcome there – no trash talk.
- Do not repeatedly send unsolicited direct messages to anyone, including the stewards.`,
        },
        {
          number: '§9.3',
          anchor: 'p9-3',
          title_de: 'Umgang mit Vorfällen und Entscheidungen',
          title_en: 'Dealing with incidents and decisions',
          body_de: `- Nach einem Rennen kochen Emotionen manchmal hoch. Das ist normal – aber keine Beleidigungen und keine öffentlichen Anschuldigungen gegen Fahrer oder Stewards.
- Vorfälle meldest du über das Formular ([§7.1](#p7-1)), nicht im Chat.
- Kritik an Entscheidungen ist erlaubt, wenn sie sachlich ist. Für Einsprüche gilt [§7.8](#p7-8).
- Poste keine Clips, um andere Fahrer bloßzustellen.`,
          body_en: `- Emotions sometimes run high after a race. That is normal – but no insults and no public accusations against drivers or stewards.
- You report incidents via the form ([§7.1](#p7-1)), not in the chat.
- Criticism of decisions is allowed as long as it is factual. Appeals are covered by [§7.8](#p7-8).
- Do not post clips to shame other drivers.`,
        },
        {
          number: '§9.4',
          anchor: 'p9-4',
          title_de: 'Privatsphäre',
          title_en: 'Privacy',
          body_de: `- Teile keine privaten Informationen über andere (z. B. Klarnamen, Wohnort, Fotos) ohne deren Zustimmung.
- Nimm Voice-Chats nur auf, wenn alle Beteiligten zugestimmt haben.`,
          body_en: `- Do not share private information about others (e.g. real names, where they live, photos) without their consent.
- Only record voice chats if everyone involved has agreed.`,
        },
        {
          number: '§9.5',
          anchor: 'p9-5',
          title_de: 'Sanktionen',
          title_en: 'Sanctions',
          body_de: `- Verstöße gegen §9 ahndet die Liga-Leitung. Mögliche Maßnahmen: Hinweis, Verwarnung, zeitweises Stummschalten (Timeout), Rennsperre, Ausschluss aus der Liga.
- Schwere Verstöße wie Hassrede oder Drohungen können zum sofortigen Ausschluss führen.
- Verstöße im Text- oder Voice-Chat des Spiels können auch die Stewards bestrafen ([§8.3](#p8-3), V-21).`,
          body_en: `- League management deals with breaches of §9. Possible measures: a reminder, a warning, a temporary mute (timeout), a race ban, exclusion from the league.
- Serious breaches such as hate speech or threats may lead to immediate exclusion.
- Breaches in the game's text or voice chat may also be penalised by the stewards ([§8.3](#p8-3), V-21).`,
        },
      ],
    },

    // ---------------------------------------------------------------------------
    // §10 Sonderregeln der Spielversion
    // ---------------------------------------------------------------------------
    {
      number: '§10',
      anchor: 'p10',
      title_de: 'Sonderregeln der Spielversion',
      title_en: 'Game-version specific rules',
      body_de: '',
      body_en: '',
      children: [
        {
          number: '§10.1',
          anchor: 'p10-1',
          title_de: 'Spielversion & Season Pack',
          title_en: 'Game version & Season Pack',
          body_de: `- Wir fahren EA SPORTS F1® 25 mit dem jeweils aktuellen Patch. Installiere Updates vor dem Renntag.
- Unser Starterfeld bildet 11 Teams der Saison 2026 ab. Ob dafür zusätzliche Spielinhalte wie ein Season Pack nötig sind, klären wir mit einem Lobby-Test. Das Ergebnis geben wir vor Saisonstart verbindlich auf der Website bekannt.
- Bringt ein Patch während der Saison große Änderungen (z. B. am Fahrverhalten oder an der Lobby), kann die Liga-Leitung Einstellungen anpassen oder ein Rennen verschieben.`,
          body_en: `- We race EA SPORTS F1® 25 on the latest patch. Install updates before race day.
- Our grid represents 11 teams of the 2026 season. Whether this requires additional game content such as a Season Pack will be confirmed after a lobby test. We will publish the binding answer on the website before the season starts.
- If a patch during the season brings major changes (e.g. to handling or the lobby), league management may adjust settings or postpone a race.`,
        },
        {
          number: '§10.2',
          anchor: 'p10-2',
          title_de: 'Lobby-Einstellungen',
          title_en: 'Lobby settings',
          body_de: `- Alle Einstellungen – Lobby, Fahrhilfen, Wochenendformat, Wetter, Regeln & Flaggen, Simulation – stehen in den Lobby-Einstellungen der jeweiligen Saison (Seite [/liga/lobby](/liga/lobby)). Abweichungen für einzelne Runden stehen dort oder im Kalender.
- Die Rennleitung richtet die Lobby danach ein.
- Fällt dir vor dem Start eine falsche Einstellung auf, sag sofort der Rennleitung Bescheid. Hat das Rennen begonnen, wird es wegen einer falschen Einstellung nur dann abgebrochen oder annulliert, wenn die Liga-Leitung den Fehler als schwerwiegend einstuft.`,
          body_en: `- All settings – lobby, assists, weekend format, weather, rules & flags, simulation – are set out in the lobby settings of each season (page [/en/league/lobby](/en/league/lobby)). Deviations for individual rounds are listed there or in the calendar.
- Race control sets up the lobby accordingly.
- If you notice a wrong setting before the start, tell race control immediately. Once the race has started, it will only be stopped or annulled because of a wrong setting if league management considers the error serious.`,
        },
        {
          number: '§10.3',
          anchor: 'p10-3',
          title_de: 'Fahrhilfen, Setup & Eingabegeräte',
          title_en: 'Assists, setup & input devices',
          body_de: `- Fahrhilfen darfst du frei wählen, soweit die Lobby-Einstellungen sie erlauben. Was die Lobby einschränkt, darfst du auch nicht über Umwege nutzen.
- Beim Setup hast du freie Hand, sofern die Lobby-Einstellungen nichts anderes vorgeben. Setups zu teilen ist erlaubt.
- Lenkrad und Controller sind gleichermaßen erlaubt. Makros, Skripte oder Hardware, die Eingaben automatisieren, sind verboten.
- Kamera und Blickwinkel wählst du frei.`,
          body_en: `- You may choose your assists freely within what the lobby settings allow. Anything the lobby restricts may not be used through workarounds either.
- You have a free hand with your setup unless the lobby settings say otherwise. Sharing setups is allowed.
- Wheels and controllers are equally allowed. Macros, scripts or hardware that automate inputs are prohibited.
- You are free to choose your camera and viewing angle.`,
        },
        {
          number: '§10.4',
          anchor: 'p10-4',
          title_de: 'Bekannte Spielfehler',
          title_en: 'Known game bugs',
          body_de: `- Nutze keine Spielfehler (Glitches oder Exploits) zu deinem Vorteil. Beispiele: Abkürzungen, die das Spiel nicht bestraft, Fehler bei Strafen, Reifen, ERS oder Kraftstoff, oder absichtlich herbeigeführtes Ghosting.
- Bekannte Spielfehler und Sonderregeln dazu veröffentlicht die Liga-Leitung auf der Seite [Lobby-Einstellungen](/liga/lobby).
- Bist du von einem Spielfehler betroffen (z. B. eine offensichtlich falsche Strafe), sag nach dem Rennen der Rennleitung Bescheid oder nutze das Meldeformular.
- Trifft ein Spielfehler viele Fahrer, gilt [§5.5](#p5-5).`,
          body_en: `- Do not use game bugs (glitches or exploits) to your advantage. Examples: shortcuts the game does not penalise, bugs affecting penalties, tyres, ERS or fuel, or deliberately triggered ghosting.
- League management publishes known game bugs and any special rules for them on the [lobby settings](/en/league/lobby) page.
- If you are affected by a game bug (e.g. an obviously wrong penalty), tell race control after the race or use the report form.
- If a game bug affects many drivers, [§5.5](#p5-5) applies.`,
        },
        {
          number: '§10.5',
          anchor: 'p10-5',
          title_de: 'Unerlaubte Hilfsmittel',
          title_en: 'Prohibited aids',
          body_de: `- Verboten sind Mods, Cheats, Trainer, veränderte Spieldateien und jede Software, die in das Spiel eingreift.
- Erlaubt sind Programme, die nur die Telemetriedaten des Spiels auslesen (z. B. Overlays oder Rundenzeit-Apps), solange sie das Spiel nicht beeinflussen.
- Verstöße führen zur Disqualifikation, meist zusätzlich zu einer Rennsperre oder zum Ausschluss ([§8.3](#p8-3), V-17).`,
          body_en: `- Mods, cheats, trainers, modified game files and any software that interferes with the game are prohibited.
- Programs that only read the game's telemetry data (e.g. overlays or lap-time apps) are allowed, as long as they do not affect the game.
- Breaches lead to disqualification, usually together with a race ban or exclusion ([§8.3](#p8-3), V-17).`,
        },
        {
          number: '§10.6',
          anchor: 'p10-6',
          title_de: 'Crossplay & Plattformen',
          title_en: 'Crossplay & platforms',
          body_de: `- PC, PlayStation und Xbox fahren gleichberechtigt in einer Lobby.
- Aktiviere Crossplay in den Spieleinstellungen und prüfe die Online- und Datenschutzeinstellungen deiner Plattform, damit dich Einladungen erreichen.
- Nutze für die Sprachkommunikation Discord. Den Voice-Chat im Spiel kannst du ausschalten.
- Unterschiede zwischen den Plattformen (z. B. Bildrate oder Eingabeverzögerung) sind kein Grund für einen Protest.`,
          body_en: `- PC, PlayStation and Xbox race on equal terms in one lobby.
- Enable crossplay in the game settings and check your platform's online and privacy settings so that invitations reach you.
- Use Discord for voice communication. You can switch off the in-game voice chat.
- Differences between platforms (e.g. frame rate or input delay) are no grounds for a protest.`,
        },
      ],
    },
  ],
};
