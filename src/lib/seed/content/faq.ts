/**
 * FAQ – Startinhalte (Entwurf). Antworten in Markdown.
 * Deutsche Antworten verlinken deutsche Pfade, englische Antworten englische Pfade.
 */

export type FaqCategory = 'general' | 'requirements' | 'raceday' | 'technical' | 'stewards';

export interface FaqSeed {
  category: FaqCategory;
  question_de: string;
  question_en: string;
  answer_de: string;
  answer_en: string;
}

export const FAQ_ITEMS: FaqSeed[] = [
  // ---------------------------------------------------------------------------
  // general
  // ---------------------------------------------------------------------------
  {
    category: 'general',
    question_de: 'Was ist [LIGANAME]?',
    question_en: 'What is [LIGANAME]?',
    answer_de: `[LIGANAME] ist eine Online-Liga für EA SPORTS F1® 25 mit Crossplay zwischen PC, PlayStation und Xbox. Wir fahren mit einem Starterfeld aus 11 Teams und 22 Stammplätzen. Dazu kommt ein Reservepool für alle, die einspringen möchten.

Wir sind eine inoffizielle Fan-Liga und ein Hobbyprojekt. Mit Formula One Group, FIA, Electronic Arts oder Codemasters haben wir nichts zu tun.`,
    answer_en: `[LIGANAME] is an online league for EA SPORTS F1® 25 with crossplay between PC, PlayStation and Xbox. We race with a grid of 11 teams and 22 regular seats, plus a reserve pool for everyone who wants to step in.

We are an unofficial fan league and a hobby project. We are not affiliated with Formula One Group, the FIA, Electronic Arts or Codemasters.`,
  },
  {
    category: 'general',
    question_de: 'Was kostet die Teilnahme?',
    question_en: 'How much does it cost to take part?',
    answer_de: `Nichts. Die Teilnahme ist kostenlos. Du brauchst nur das Spiel – und je nach Saison eventuell zusätzliche Inhalte wie ein Season Pack (siehe „Brauche ich das Season Pack?"). Auf Konsolen brauchst du außerdem das Online-Abo deiner Plattform.`,
    answer_en: `Nothing. Taking part is free. You only need the game – and, depending on the season, possibly additional content such as a Season Pack (see "Do I need the Season Pack?"). On consoles you also need your platform's online subscription.`,
  },
  {
    category: 'general',
    question_de: 'Wie melde ich mich an?',
    question_en: 'How do I sign up?',
    answer_de: `Füll das Formular auf [/mitfahren](/mitfahren) aus. Ein Konto auf der Website brauchst du nicht. Danach meldet sich die Liga-Leitung über Discord bei dir – tritt also am besten gleich unserem Discord-Server bei.

Die Liga-Leitung entscheidet, ob du einen Stammplatz oder einen Platz im Reservepool bekommst. Einen Anspruch auf einen bestimmten Platz oder ein bestimmtes Team gibt es nicht.`,
    answer_en: `Fill in the form at [/en/join](/en/join). You do not need an account on the website. League management will then contact you via Discord – so it is best to join our Discord server straight away.

League management decides whether you get a regular seat or a place in the reserve pool. There is no entitlement to a particular seat or team.`,
  },
  {
    category: 'general',
    question_de: 'Wann finden die Rennen statt?',
    question_en: 'When are the races?',
    answer_de: `Alle Termine mit Datum und Uhrzeit stehen im [Kalender](/kalender). Der Kalender auf der Website ist verbindlich – Discord nutzen wir nur für Ankündigungen und Erinnerungen. Über den Kalender kannst du die Termine auch in deine eigene Kalender-App übernehmen.`,
    answer_en: `All dates and start times are in the [calendar](/en/calendar). The calendar on the website is binding – we only use Discord for announcements and reminders. You can also add the dates to your own calendar app from the calendar page.`,
  },
  {
    category: 'general',
    question_de: 'Was ist über mich öffentlich sichtbar?',
    question_en: 'What information about me is public?',
    answer_de: `Öffentlich sind nur dein Gamertag, deine Startnummer, deine Plattform und – wenn du willst – eine Flagge. Dazu kommen deine Ergebnisse und Steward-Entscheidungen, an denen du beteiligt warst.

Deinen Discord-Namen, deine EA-ID und andere Angaben aus dem Anmeldeformular sieht nur die Liga-Leitung. Mehr dazu steht in der [Datenschutzerklärung](/datenschutz) und in den [Teilnahmebedingungen](/teilnahmebedingungen).`,
    answer_en: `Only your gamertag, race number, platform and – if you like – a flag are public. In addition, your results and any steward decisions you were involved in are public.

Your Discord name, EA ID and other details from the sign-up form are only visible to league management. You can find more in the [privacy policy](/en/privacy) and the [terms of participation](/en/terms).`,
  },
  {
    category: 'general',
    question_de: 'Kann ich im Team mithelfen, ohne zu fahren?',
    question_en: 'Can I help out without racing?',
    answer_de: `Sehr gern! Wir suchen immer Unterstützung, zum Beispiel als Steward, für Grafiken, Social Media oder Übersetzungen ins Englische. Schreib der Liga-Leitung auf Discord oder nutze das [Kontaktformular](/kontakt).`,
    answer_en: `Absolutely! We are always looking for help, for example as a steward, with graphics, social media or translations into English. Message league management on Discord or use the [contact form](/en/contact).`,
  },

  // ---------------------------------------------------------------------------
  // requirements
  // ---------------------------------------------------------------------------
  {
    category: 'requirements',
    question_de: 'Was brauche ich, um mitzufahren?',
    question_en: 'What do I need to race with you?',
    answer_de: `- EA SPORTS F1® 25 auf PC (Steam oder EA App), PlayStation oder Xbox – immer mit dem aktuellen Patch
- ein EA-Konto (EA-ID) und aktiviertes Crossplay
- ein Discord-Konto
- ein Mindestalter von 16 Jahren
- ein Lenkrad oder einen Controller
- eine stabile Internetverbindung, am besten per LAN-Kabel

Alle Details stehen im [Regelwerk, §2.1](/liga/regelwerk#p2-1).`,
    answer_en: `- EA SPORTS F1® 25 on PC (Steam or EA app), PlayStation or Xbox – always on the latest patch
- an EA account (EA ID) with crossplay enabled
- a Discord account
- a minimum age of 16
- a wheel or a controller
- a stable internet connection, ideally via LAN cable

All the details are in the [rulebook, §2.1](/en/league/rules#p2-1).`,
  },
  {
    category: 'requirements',
    question_de: 'Brauche ich das Season Pack?',
    question_en: 'Do I need the Season Pack?',
    answer_de: `Das steht noch nicht fest. Unser Starterfeld bildet die 11 Teams der Saison 2026 ab. Ob dafür zusätzliche Inhalte wie ein Season Pack nötig sind, klären wir mit einem Lobby-Test. Das Ergebnis geben wir vor Saisonstart verbindlich auf der Website bekannt. Bitte kauf nichts auf Verdacht.`,
    answer_en: `That has not been decided yet. Our grid represents the 11 teams of the 2026 season. Whether this requires additional content such as a Season Pack will be confirmed after a lobby test. We will publish the binding answer on the website before the season starts. Please do not buy anything just in case.`,
  },
  {
    category: 'requirements',
    question_de: 'Lenkrad oder Controller – was ist erlaubt?',
    question_en: 'Wheel or controller – which is allowed?',
    answer_de: `Beides. Du kannst mit Lenkrad oder Controller fahren, es gibt keine Nachteile in der Wertung. Verboten sind nur Makros, Skripte oder Hardware, die Eingaben automatisieren ([§10.3](/liga/regelwerk#p10-3)).`,
    answer_en: `Both. You can race with a wheel or a controller; neither is treated differently in the standings. Only macros, scripts or hardware that automate inputs are prohibited ([§10.3](/en/league/rules#p10-3)).`,
  },
  {
    category: 'requirements',
    question_de: 'Wie alt muss ich sein?',
    question_en: 'How old do I have to be?',
    answer_de: `Mindestens 16 Jahre. Bei der Anmeldung bestätigst du das mit einem Häkchen. Dein Geburtsdatum fragen wir nicht ab.`,
    answer_en: `At least 16. You confirm this with a tick box when you sign up. We do not ask for your date of birth.`,
  },
  {
    category: 'requirements',
    question_de: 'Welche Plattformen können mitfahren?',
    question_en: 'Which platforms can take part?',
    answer_de: `PC (Steam oder EA App), PlayStation und Xbox – alle zusammen in einer Lobby. Dafür muss Crossplay im Spiel aktiviert sein. Auf Konsolen brauchst du das Online-Abo deiner Plattform. Unterschiede zwischen den Plattformen, etwa bei der Bildrate, sind kein Grund für einen Protest.`,
    answer_en: `PC (Steam or EA app), PlayStation and Xbox – all together in one lobby. Crossplay must be enabled in the game for this. On consoles, you need your platform's online subscription. Differences between platforms, such as frame rate, are no grounds for a protest.`,
  },

  // ---------------------------------------------------------------------------
  // raceday
  // ---------------------------------------------------------------------------
  {
    category: 'raceday',
    question_de: 'Wie melde ich mich für ein Rennen ab?',
    question_en: 'How do I sign off from a race?',
    answer_de: `Schreib im Abmelde-Kanal auf unserem Discord – **bis spätestens 24 Stunden vor Rennbeginn**. Einen Grund musst du nicht nennen. Eine spätere Abmeldung gilt als verspätet, ist aber immer besser als gar keine. Wer ohne Abmeldung fehlt, fehlt unentschuldigt ([§2.5](/liga/regelwerk#p2-5) und [§2.6](/liga/regelwerk#p2-6)).`,
    answer_en: `Post in the sign-off channel on our Discord – **no later than 24 hours before the race starts**. You do not have to give a reason. A later sign-off counts as late, but it is always better than none. Missing a race without signing off counts as an unexcused absence ([§2.5](/en/league/rules#p2-5) and [§2.6](/en/league/rules#p2-6)).`,
  },
  {
    category: 'raceday',
    question_de: 'Wie funktioniert der Reservepool?',
    question_en: 'How does the reserve pool work?',
    answer_de: `Der Reservepool hat eine feste Reihenfolge, die du auf der Website siehst. Meldet sich ein Stammfahrer ab, rückt der erste verfügbare Reservefahrer der Liste nach und fährt für dessen Team. Als Reservefahrer trägst du dich für jedes Rennen im Discord als verfügbar ein – bis zur selben Frist wie bei Abmeldungen ([§2.4](/liga/regelwerk#p2-4)).`,
    answer_en: `The reserve pool has a fixed order, which you can see on the website. If a regular driver signs off, the first available reserve driver on the list moves up and races for that team. As a reserve driver, you mark yourself as available for each race on Discord – by the same deadline as for sign-offs ([§2.4](/en/league/rules#p2-4)).`,
  },
  {
    category: 'raceday',
    question_de: 'Wie läuft ein Renntag ab?',
    question_en: 'What happens on race day?',
    answer_de: `Kurz gesagt: Check-in im Discord-Voice-Kanal, Lobby-Einladung annehmen, Qualifying, Rennen. Einige Stunden nach dem Rennen erscheint das vorläufige Ergebnis. Danach läuft die Protestfrist, anschließend entscheiden die Stewards und das Ergebnis wird final.

Die genauen Einstellungen und das Format stehen auf der Seite [Lobby-Einstellungen](/liga/lobby).`,
    answer_en: `In short: check in on the Discord voice channel, accept the lobby invite, qualifying, race. A few hours after the race, the provisional result is published. Then the protest window runs, after which the stewards decide and the result becomes final.

The exact settings and format are on the [lobby settings](/en/league/lobby) page.`,
  },
  {
    category: 'raceday',
    question_de: 'Wie werden die Punkte berechnet?',
    question_en: 'How are points calculated?',
    answer_de: `Das Punkteschema legt die Liga-Leitung für jede Saison fest und zeigt es auf der Website an. Jeder Fahrer bekommt seine eigenen Punkte. Ob Punkte von Reservefahrern auch für die Teamwertung zählen, ist ebenfalls pro Saison festgelegt.

Bei Punktgleichheit entscheidet der Countback: erst mehr Siege, dann mehr zweite Plätze und so weiter in den Hauptrennen, danach die Sprint-Platzierungen. Ist dann noch alles gleich, teilen sich die Fahrer den Platz ([§1.6](/liga/regelwerk#p1-6)).`,
    answer_en: `League management sets the points scheme for each season and shows it on the website. Every driver scores their own points. Whether reserve drivers' points also count for the teams' standings is also set per season.

If drivers are level on points, countback decides: first more wins, then more second places and so on in main races, then sprint placings. If everything is still equal, the drivers share the position ([§1.6](/en/league/rules#p1-6)).`,
  },
  {
    category: 'raceday',
    question_de: 'Wie wähle oder wechsle ich meine Startnummer?',
    question_en: 'How do I choose or change my race number?',
    answer_de: `Deine Wunschnummer (2 bis 99) gibst du bei der Anmeldung an. Die 1 kann für den Champion reserviert sein. Du behältst deine Nummer, solange du aktiv bist. Wechseln kannst du jederzeit, wenn die neue Nummer frei ist und die Liga-Leitung zustimmt – der Wechsel gilt ab dem nächsten Rennen. Alte Ergebnisse zeigen weiter die Nummer, mit der du damals gefahren bist ([§2.7](/liga/regelwerk#p2-7)).`,
    answer_en: `You state your preferred number (2 to 99) when you sign up. Number 1 may be reserved for the champion. You keep your number as long as you are active. You can change it at any time if the new number is free and league management approves – the change applies from the next race. Past results keep showing the number you raced with at the time ([§2.7](/en/league/rules#p2-7)).`,
  },

  // ---------------------------------------------------------------------------
  // technical
  // ---------------------------------------------------------------------------
  {
    category: 'technical',
    question_de: 'Was passiert bei einem Disconnect oder Lag?',
    question_en: 'What happens if I disconnect or lag?',
    answer_de: `Einzelne Disconnects führen nicht zu einem Neustart. Wer im Rennen rausfliegt, wird in der Regel als ausgeschieden (DNF) gewertet. Lässt das Spiel einen Wiedereinstieg zu, darfst du ihn nutzen. Einen Neustart gibt es nur bei einem Lobby-Absturz, einem Disconnect des Hosts oder wenn viele Fahrer gleichzeitig betroffen sind.

Laggst du stark, halte Abstand und sag der Rennleitung Bescheid. Details: [§5.3](/liga/regelwerk#p5-3) und [§5.5](/liga/regelwerk#p5-5).`,
    answer_en: `Individual disconnects do not lead to a restart. A driver who drops out during the race is normally classified as retired (DNF). If the game allows you to rejoin, you may do so. There is only a restart if the lobby crashes, the host disconnects or many drivers are affected at once.

If you are lagging badly, keep your distance and let race control know. Details: [§5.3](/en/league/rules#p5-3) and [§5.5](/en/league/rules#p5-5).`,
  },
  {
    category: 'technical',
    question_de: 'Wie komme ich in die Lobby? Was muss ich für Crossplay einstellen?',
    question_en: 'How do I get into the lobby? What do I need to set for crossplay?',
    answer_de: `Aktiviere Crossplay in den Spieleinstellungen und prüfe die Online- und Datenschutzeinstellungen deiner Plattform, damit Einladungen ankommen. Füg den Host über seine EA-ID als Freund hinzu. Am Renntag lädt dich die Rennleitung in die Lobby ein – du nimmst die Einladung im Spiel an.

Eine Schritt-für-Schritt-Anleitung findest du auf der Seite [Lobby-Einstellungen](/liga/lobby).`,
    answer_en: `Enable crossplay in the game settings and check your platform's online and privacy settings so that invitations get through. Add the host as a friend using their EA ID. On race day, race control will invite you to the lobby – you accept the invitation in the game.

You will find step-by-step instructions on the [lobby settings](/en/league/lobby) page.`,
  },
  {
    category: 'technical',
    question_de: 'Darf ich meine Rennen streamen oder aufnehmen?',
    question_en: 'Can I stream or record my races?',
    answer_de: `Ja, gern! Wir empfehlen sogar, jedes Rennen aufzunehmen. Ohne Clip kannst du keinen Vorfall melden. Bewahre deine Aufnahme mindestens bis zum Ende der Protestfrist auf.

Wenn du streamst, achte darauf, keine privaten Daten anderer zu zeigen. Voice-Chats aus dem Discord darfst du nur aufnehmen oder übertragen, wenn alle zugestimmt haben.`,
    answer_en: `Yes, please! We even recommend recording every race. Without a clip, you cannot report an incident. Keep your recording at least until the protest window has closed.

If you stream, make sure you do not show other people's private data. You may only record or broadcast Discord voice chats if everyone has agreed.`,
  },
  {
    category: 'technical',
    question_de: 'Gibt es Setup-Vorgaben oder Tipps?',
    question_en: 'Are there setup rules or tips?',
    answer_de: `Beim Setup hast du freie Hand, sofern die Lobby-Einstellungen nichts anderes vorgeben. Setups zu teilen ist erlaubt. Für den Einstieg reicht oft ein Standard-Setup mit etwas mehr Abtrieb – Konstanz bringt im Rennen mehr als eine einzelne schnelle Runde.

Weitere Tipps zu Reifen, Kraftstoff und Controller-Einstellungen findest du im Einsteiger-Guide auf unserer Website.`,
    answer_en: `You have a free hand with your setup unless the lobby settings say otherwise. Sharing setups is allowed. To get started, a default setup with a little more downforce is often enough – consistency pays off more in a race than a single fast lap.

You will find more tips on tyres, fuel and controller settings in the beginner's guide on our website.`,
  },

  // ---------------------------------------------------------------------------
  // stewards
  // ---------------------------------------------------------------------------
  {
    category: 'stewards',
    question_de: 'Wie melde ich einen Vorfall?',
    question_en: 'How do I report an incident?',
    answer_de: `Nur über das Formular auf [/stewards/melden](/stewards/melden). Ein **Clip-Link ist Pflicht** – erlaubt sind YouTube, Twitch, Medal, Streamable sowie Freigabe-Links von Xbox und PlayStation. Gib außerdem einen Zeitstempel, die Runde, die Kurve und die beteiligten Fahrer an. Meldungen per Discord-Nachricht zählen nicht ([§7.1](/liga/regelwerk#p7-1) und [§7.3](/liga/regelwerk#p7-3)).`,
    answer_en: `Only via the form at [/en/stewards/report](/en/stewards/report). A **clip link is mandatory** – YouTube, Twitch, Medal, Streamable and Xbox or PlayStation share links are accepted. Also include a timestamp, the lap, the corner and the drivers involved. Reports sent as Discord messages do not count ([§7.1](/en/league/rules#p7-1) and [§7.3](/en/league/rules#p7-3)).`,
  },
  {
    category: 'stewards',
    question_de: 'Bis wann kann ich einen Vorfall melden?',
    question_en: 'What is the deadline for reporting an incident?',
    answer_de: `Die Protestfrist beträgt standardmäßig **48 Stunden nach Veröffentlichung des vorläufigen Ergebnisses**. Die genaue Frist kann je Saison abweichen und steht bei jeder Runde auf der Website. Danach nimmt das Formular keine Meldungen mehr an. Nur in begründeten Ausnahmefällen geht eine Meldung dann noch über die Liga-Leitung ([§7.2](/liga/regelwerk#p7-2)).`,
    answer_en: `The protest window is **48 hours after the provisional result is published** by default. The exact window may differ per season and is shown for each round on the website. After that, the form no longer accepts reports. Only in justified exceptional cases can a report still be submitted through league management ([§7.2](/en/league/rules#p7-2)).`,
  },
  {
    category: 'stewards',
    question_de: 'Wo sehe ich die Entscheidungen der Stewards?',
    question_en: 'Where can I see the stewards’ decisions?',
    answer_de: `Alle Entscheidungen sind öffentlich auf der [Stewards-Seite](/stewards) – mit Referenznummer (z. B. **S1-R03-02** = Saison 1, Runde 3, Entscheidung 2), Clip und Begründung. Die Stewards entscheiden in der Regel innerhalb von 72 Stunden nach Ende der Protestfrist. Ein Steward, der selbst beteiligt ist, darf nicht mitentscheiden ([§7.5](/liga/regelwerk#p7-5), [§7.7](/liga/regelwerk#p7-7)).`,
    answer_en: `All decisions are public on the [stewards page](/en/stewards) – with a reference number (e.g. **S1-R03-02** = season 1, round 3, decision 2), clip and reasoning. As a rule, the stewards decide within 72 hours after the protest window closes. A steward who was involved cannot take part in the decision ([§7.5](/en/league/rules#p7-5), [§7.7](/en/league/rules#p7-7)).`,
  },
  {
    category: 'stewards',
    question_de: 'Kann ich gegen eine Entscheidung Einspruch einlegen?',
    question_en: 'Can I appeal against a decision?',
    answer_de: `Ja, einmal – innerhalb von 24 Stunden nach Veröffentlichung, per Nachricht an die Liga-Leitung auf Discord. Zulässig ist ein Einspruch nur bei neuen Beweisen oder einem klaren Verfahrensfehler. Eine andere Meinung zur Bewertung reicht nicht ([§7.8](/liga/regelwerk#p7-8)).`,
    answer_en: `Yes, once – within 24 hours of publication, by messaging league management on Discord. An appeal is only admissible if there is new evidence or a clear procedural error. A different opinion on the assessment is not enough ([§7.8](/en/league/rules#p7-8)).`,
  },
];
