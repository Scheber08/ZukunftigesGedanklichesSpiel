/**
 * Einsteiger-Guide – Startinhalte (Entwurf). Texte in Markdown.
 * Zeiten und Fristen folgen dem Regelwerk v1 (Abmeldefrist 24 h, Protestfrist Standard 48 h,
 * Steward-Entscheidung innerhalb von 72 h nach Fristende).
 */

export interface GuideStep {
  title_de: string;
  title_en: string;
  body_de: string;
  body_en: string;
}

export const REQUIREMENTS: Array<{ key: string; title_de: string; title_en: string; body_de: string; body_en: string }> = [
  {
    key: 'game',
    title_de: 'Spiel & Zusatzinhalte',
    title_en: 'Game & additional content',
    body_de: `Du brauchst EA SPORTS F1® 25 auf PC (Steam oder EA App), PlayStation oder Xbox – immer mit dem aktuellen Patch. Ob zusätzlich ein Season Pack nötig ist, klären wir mit einem Lobby-Test und geben es vor Saisonstart bekannt. Bitte kauf nichts auf Verdacht.`,
    body_en: `You need EA SPORTS F1® 25 on PC (Steam or EA app), PlayStation or Xbox – always on the latest patch. Whether a Season Pack is needed as well will be confirmed after a lobby test and announced before the season starts. Please do not buy anything just in case.`,
  },
  {
    key: 'crossplay',
    title_de: 'Crossplay',
    title_en: 'Crossplay',
    body_de: `PC, PlayStation und Xbox fahren zusammen in einer Lobby. Aktiviere Crossplay in den Spieleinstellungen und prüfe die Online- und Datenschutzeinstellungen deiner Plattform. Auf Konsolen brauchst du das Online-Abo deiner Plattform.`,
    body_en: `PC, PlayStation and Xbox race together in one lobby. Enable crossplay in the game settings and check your platform's online and privacy settings. On consoles, you need your platform's online subscription.`,
  },
  {
    key: 'ea_id',
    title_de: 'EA-Konto (EA-ID)',
    title_en: 'EA account (EA ID)',
    body_de: `Über deine EA-ID findet dich der Host plattformübergreifend und kann dich in die Lobby einladen. Du findest sie in deinem EA-Konto oder im Spiel in der Freundesliste. Die Angabe im Anmeldeformular ist freiwillig, erleichtert uns aber die Einladung.`,
    body_en: `Your EA ID lets the host find you across platforms and invite you to the lobby. You can find it in your EA account or in the game's friends list. Entering it in the sign-up form is optional, but it makes inviting you much easier.`,
  },
  {
    key: 'discord',
    title_de: 'Discord',
    title_en: 'Discord',
    body_de: `Auf unserem Discord-Server läuft die ganze Kommunikation: Ankündigungen, Abmeldungen, Check-in am Renntag und Rückfragen der Stewards. Du brauchst also ein Discord-Konto und solltest dort erreichbar sein.`,
    body_en: `All communication happens on our Discord server: announcements, sign-offs, race-day check-in and questions from the stewards. So you need a Discord account and should be reachable there.`,
  },
  {
    key: 'age',
    title_de: 'Mindestalter 16',
    title_en: 'Minimum age 16',
    body_de: `Mitfahren kannst du ab 16 Jahren. Du bestätigst das bei der Anmeldung mit einem Häkchen – dein Geburtsdatum fragen wir nicht ab.`,
    body_en: `You can race with us from the age of 16. You confirm this with a tick box when signing up – we do not ask for your date of birth.`,
  },
  {
    key: 'input',
    title_de: 'Lenkrad oder Controller',
    title_en: 'Wheel or controller',
    body_de: `Beides ist erlaubt und wird gleich behandelt. Wichtig ist nur, dass du dein Auto sauber und berechenbar bewegst. Makros oder Skripte, die Eingaben automatisieren, sind verboten.`,
    body_en: `Both are allowed and treated equally. What matters is that you drive cleanly and predictably. Macros or scripts that automate inputs are prohibited.`,
  },
];

export const RACEDAY_TIMELINE: Array<{
  time_de: string;
  time_en: string;
  title_de: string;
  title_en: string;
  body_de: string;
  body_en: string;
}> = [
  {
    time_de: 'T−24 h',
    time_en: 'T−24 h',
    title_de: 'Abmeldefrist & Aufstellung',
    title_en: 'Sign-off deadline & line-up',
    body_de: `Bis jetzt meldest du dich im Discord ab, falls du nicht kannst. Reservefahrer tragen sich bis dahin als verfügbar ein. Danach veröffentlichen wir die Startaufstellung mit allen Nachrückern auf der Website.`,
    body_en: `By now, sign off on Discord if you cannot make it. Reserve drivers mark themselves as available by this time. We then publish the line-up, including all stand-ins, on the website.`,
  },
  {
    time_de: 'T−30 min',
    time_en: 'T−30 min',
    title_de: 'Check-in & Briefing',
    title_en: 'Check-in & briefing',
    body_de: `Komm in den Voice-Kanal auf Discord. Die Rennleitung prüft, wer da ist, und gibt kurze Hinweise zu Strecke, Einstellungen und Besonderheiten. Starte jetzt auch deine Aufnahme-Software.`,
    body_en: `Join the voice channel on Discord. Race control checks who is there and gives a short briefing on the track, settings and anything special. Now is also the time to start your recording software.`,
  },
  {
    time_de: 'T−15 min',
    time_en: 'T−15 min',
    title_de: 'Lobby öffnet',
    title_en: 'Lobby opens',
    body_de: `Die Rennleitung verschickt die Einladungen. Tritt bei, prüfe Team, Startnummer und Fahrhilfen und lade dein Setup. Stimmt etwas nicht, sag sofort Bescheid.`,
    body_en: `Race control sends out the invitations. Join, check your team, race number and assists, and load your setup. If something is wrong, speak up straight away.`,
  },
  {
    time_de: 'T',
    time_en: 'T',
    title_de: 'Start Qualifying',
    title_en: 'Qualifying starts',
    body_de: `Das Qualifying beginnt zur Startzeit im Kalender. Auf Aufwärm- und Einrollrunden hat, wer eine schnelle Runde fährt, immer Vorrang.`,
    body_en: `Qualifying begins at the start time shown in the calendar. On out-laps and in-laps, drivers on a fast lap always have priority.`,
  },
  {
    time_de: 'Nach dem Qualifying',
    time_en: 'After qualifying',
    title_de: 'Rennen',
    title_en: 'Race',
    body_de: `Formationsrunde (falls eingestellt), Start, Rennen. Renndistanz und Format stehen in den Lobby-Einstellungen der Saison. An Sprint-Wochenenden gibt es zusätzlich einen Sprint.`,
    body_en: `Formation lap (if enabled), start, race. Race distance and format are set out in the season's lobby settings. On sprint weekends there is also a sprint.`,
  },
  {
    time_de: 'Rennende',
    time_en: 'Race end',
    title_de: 'Clips sichern',
    title_en: 'Save your clips',
    body_de: `Speichere deine Aufnahme. Willst du einen Vorfall melden, schneide einen kurzen Clip und lade ihn hoch (z. B. YouTube „nicht gelistet", Medal oder Streamable).`,
    body_en: `Save your recording. If you want to report an incident, cut a short clip and upload it (e.g. YouTube "unlisted", Medal or Streamable).`,
  },
  {
    time_de: 'Rennende + ca. 2 h',
    time_en: 'Race end + approx. 2 h',
    title_de: 'Vorläufiges Ergebnis',
    title_en: 'Provisional result',
    body_de: `Das vorläufige Ergebnis erscheint auf der Website – mit den Strafen, die das Spiel verhängt hat. Ab jetzt läuft die Protestfrist.`,
    body_en: `The provisional result appears on the website – including the penalties imposed by the game. The protest window opens now.`,
  },
  {
    time_de: 'Ergebnis + 48 h',
    time_en: 'Result + 48 h',
    title_de: 'Protestfrist endet',
    title_en: 'Protest window closes',
    body_de: `Bis dahin kannst du Vorfälle über das Formular auf /stewards/melden melden (Standardfrist, kann je Saison abweichen). Danach nimmt das Formular keine Meldungen mehr an.`,
    body_en: `Until then, you can report incidents via the form at /en/stewards/report (default window, may differ per season). After that, the form no longer accepts reports.`,
  },
  {
    time_de: 'Fristende + 72 h',
    time_en: 'Window closes + 72 h',
    title_de: 'Stewards entscheiden – Ergebnis wird final',
    title_en: 'Stewards decide – result becomes final',
    body_de: `Die Stewards veröffentlichen ihre Entscheidungen mit Begründung. Strafen werden automatisch eingerechnet, und das Ergebnis wird final.`,
    body_en: `The stewards publish their decisions with reasoning. Penalties are applied automatically and the result becomes final.`,
  },
];

export const LOBBY_JOIN_STEPS_DE: string[] = [
  'Spiel aktualisieren: Installiere den neuesten Patch (und, falls für die Saison vorgeschrieben, das Season Pack) und starte das Spiel neu.',
  'Crossplay aktivieren: In den Spieleinstellungen Crossplay einschalten und die Online- und Datenschutzeinstellungen deiner Plattform prüfen.',
  'EA-Freundschaft: Füge den Host über seine EA-ID als Freund hinzu oder nimm seine Freundschaftsanfrage an. Die EA-ID des Hosts steht im Discord.',
  'Check-in: Sei 30 Minuten vor dem Start im Voice-Kanal auf Discord.',
  'Einladung annehmen: Sobald die Rennleitung die Lobby öffnet, nimmst du die Einladung im Spiel an (Benachrichtigung oder Freundesliste).',
  'Kontrolle: Prüfe Team, Startnummer und Fahrhilfen anhand der Lobby-Einstellungen und lade dein Setup.',
  'Bereit melden: Setz dich im Spiel auf „Bereit" und warte, bis die Rennleitung die Session startet.',
  'Klappt etwas nicht? Starte das Spiel neu, prüfe deinen NAT-Typ und gib der Rennleitung im Discord Bescheid.',
];

export const LOBBY_JOIN_STEPS_EN: string[] = [
  'Update the game: install the latest patch (and the Season Pack, if required for the season) and restart the game.',
  "Enable crossplay: switch crossplay on in the game settings and check your platform's online and privacy settings.",
  "EA friendship: add the host as a friend using their EA ID, or accept their friend request. The host's EA ID is posted on Discord.",
  'Check in: be in the Discord voice channel 30 minutes before the start.',
  'Accept the invitation: as soon as race control opens the lobby, accept the invitation in the game (notification or friends list).',
  'Check: verify your team, race number and assists against the lobby settings, and load your setup.',
  'Ready up: set yourself to "Ready" in the game and wait for race control to start the session.',
  'Something not working? Restart the game, check your NAT type and let race control know on Discord.',
];

export const SETUP_TIPS: GuideStep[] = [
  {
    title_de: 'Setup-Freiheit nutzen – aber einfach anfangen',
    title_en: 'Use your setup freedom – but start simple',
    body_de: `Du darfst dein Setup frei anpassen, sofern die Lobby-Einstellungen nichts anderes vorgeben. Für den Einstieg reicht ein Standard-Setup mit etwas mehr Abtrieb. Ändere immer nur eine Sache auf einmal, dann merkst du, was sie bewirkt.`,
    body_en: `You may adjust your setup freely unless the lobby settings say otherwise. To start with, a default setup with a little more downforce is enough. Change only one thing at a time so you can tell what it does.`,
  },
  {
    title_de: 'Reifen schonen',
    title_en: 'Look after your tyres',
    body_de: `Sanft einlenken, weich aufs Gas und keine Dauer-Rutscher: So halten deine Reifen länger. Achte auf die Reifentemperaturen – zu heiße Reifen bauen schnell ab. Im Rennen zählt Konstanz mehr als eine einzelne schnelle Runde.`,
    body_en: `Smooth steering, gentle throttle and no constant sliding: that keeps your tyres alive for longer. Watch your tyre temperatures – overheated tyres wear quickly. In a race, consistency counts for more than a single fast lap.`,
  },
  {
    title_de: 'Kraftstoff planen',
    title_en: 'Plan your fuel',
    body_de: `Schau dir vor dem Rennen die Kraftstoffanzeige an und wähle eine Menge mit etwas Reserve. Wird es im Rennen knapp, sparst du Kraftstoff, indem du vor den Bremspunkten etwas früher vom Gas gehst („Lift and Coast").`,
    body_en: `Check the fuel read-out before the race and choose an amount with a little margin. If it gets tight during the race, save fuel by lifting off slightly earlier before braking points ("lift and coast").`,
  },
  {
    title_de: 'Fahrhilfen laut Lobby',
    title_en: 'Assists as per the lobby',
    body_de: `Welche Fahrhilfen erlaubt sind, steht auf der Seite mit den Lobby-Einstellungen. Hilfen wie ABS oder Traktionskontrolle machen dich berechenbarer – gerade am Anfang ist das für dich und alle anderen gut.`,
    body_en: `Which assists are allowed is listed on the lobby settings page. Assists such as ABS or traction control make you more predictable – especially at the start, that is good for you and everyone else.`,
  },
  {
    title_de: 'Controller richtig einstellen',
    title_en: 'Set up your controller properly',
    body_de: `Eine etwas größere Totzone und eine geringere Lenkempfindlichkeit machen die Lenkung ruhiger. Leg wichtige Funktionen wie DRS, Overtake-Taste und ERS-Modus auf gut erreichbare Tasten, damit du sie im Rennen schnell findest.`,
    body_en: `A slightly larger deadzone and lower steering sensitivity make the steering calmer. Map important functions such as DRS, the overtake button and ERS mode to easy-to-reach buttons so you can find them quickly during a race.`,
  },
  {
    title_de: 'Netzwerk: LAN-Kabel statt WLAN',
    title_en: 'Network: LAN cable instead of Wi-Fi',
    body_de: `Eine Kabelverbindung ist fast immer stabiler als WLAN und verringert Lags. Beende während des Rennens Downloads, Updates und Streams auf anderen Geräten in deinem Netz.`,
    body_en: `A wired connection is almost always more stable than Wi-Fi and reduces lag. During the race, stop downloads, updates and streams on other devices on your network.`,
  },
];

export const LAG_DISCONNECT: GuideStep[] = [
  {
    title_de: 'Vorbeugen',
    title_en: 'Prevention',
    body_de: `Nutze ein LAN-Kabel, beende Downloads und Streams in deinem Netz und starte Spiel und Router vor dem Renntag einmal neu. Prüfe im Spiel deinen NAT-Typ – „offen" oder „moderat" ist am besten.`,
    body_en: `Use a LAN cable, stop downloads and streams on your network, and restart the game and router once before race day. Check your NAT type in the game – "open" or "moderate" is best.`,
  },
  {
    title_de: 'Wenn du Lag bemerkst',
    title_en: 'If you notice lag',
    body_de: `Springen oder ruckeln andere Autos, halte großzügig Abstand und verzichte auf enge Manöver. Laggst du selbst stark, sag der Rennleitung Bescheid. Sie kann dich bitten, in die Box zu fahren, damit niemand gefährdet wird.`,
    body_en: `If other cars are jumping or stuttering, give them plenty of room and avoid tight moves. If you are lagging badly yourself, tell race control. They may ask you to pit so that nobody is put at risk.`,
  },
  {
    title_de: 'Disconnect im Qualifying',
    title_en: 'Disconnect in qualifying',
    body_de: `Lässt das Spiel einen Wiedereinstieg zu, kehr zurück und fahr weiter. Deine bisherigen Zeiten zählen, soweit das Spiel sie übernimmt. Ohne gültige Zeit startest du vom Ende des Feldes.`,
    body_en: `If the game lets you rejoin, return and carry on. Your times so far count as far as the game keeps them. Without a valid time, you start from the back of the grid.`,
  },
  {
    title_de: 'Disconnect im Rennen',
    title_en: 'Disconnect in the race',
    body_de: `Keine Panik. Ein einzelner Disconnect führt nicht zu einem Neustart, du wirst in der Regel als ausgeschieden (DNF) gewertet. Lässt das Spiel einen Wiedereinstieg zu, darfst du zurück – fahr dann besonders vorsichtig. Sag der Rennleitung im Discord kurz Bescheid.`,
    body_en: `Don't panic. A single disconnect does not lead to a restart; you are normally classified as retired (DNF). If the game lets you rejoin, you may return – drive with extra care. Let race control know briefly on Discord.`,
  },
  {
    title_de: 'Lobby-Absturz oder viele Disconnects',
    title_en: 'Lobby crash or many disconnects',
    body_de: `Bleib im Voice-Kanal und warte auf die Anweisungen der Rennleitung. Ob neu gestartet oder gewertet wird, hängt davon ab, wie weit das Rennen schon war (Regelwerk §5.5).`,
    body_en: `Stay in the voice channel and wait for instructions from race control. Whether the race is restarted or classified depends on how far it had progressed (rulebook §5.5).`,
  },
  {
    title_de: 'Nach dem Rennen',
    title_en: 'After the race',
    body_de: `Hast du wiederholt Verbindungsprobleme, sprich die Liga-Leitung an. Wir können einen Verbindungstest außerhalb eines Renntags vereinbaren.`,
    body_en: `If you keep having connection problems, speak to league management. We can arrange a connection test outside race day.`,
  },
];
