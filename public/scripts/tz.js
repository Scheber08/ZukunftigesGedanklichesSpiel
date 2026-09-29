/*
 * Läuft blockierend im <head> (winzig, gecacht): markiert Besucher außerhalb der Liga-Zeitzone,
 * damit der Platz für den Hinweis „(deine Zeit: …)“ schon beim ersten Zeichnen reserviert ist
 * und nichts springt (CLS, Plan §10).
 */
(function () {
  try {
    var tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!tz || tz === 'Europe/Berlin') return;
    var now = new Date();
    var at = function (zone) {
      return new Date(now.toLocaleString('en-US', { timeZone: zone })).getTime();
    };
    if (at('Europe/Berlin') !== at(tz)) document.documentElement.setAttribute('data-tz-diff', '');
  } catch (e) {
    /* ohne Hinweis weiter */
  }
})();
