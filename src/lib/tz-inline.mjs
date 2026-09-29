/**
 * Inline im <head> (render-blockierend, aber ohne eigene Anfrage), damit beim ersten Zeichnen
 * nichts springt (CLS, Plan §10):
 *  - data-js: JavaScript ist aktiv → Tab-Panels sind schon vor dem Skript im Tab-Modus
 *  - data-tz-diff: Besucher außerhalb der Liga-Zeitzone → Platz für „(deine Zeit: …)“ reserviert
 * Der Inhalt ist per SHA-256-Hash in der CSP freigegeben (astro.config.mjs) – jede Änderung am
 * Text ändert automatisch auch den Hash.
 */
export const TZ_SCRIPT =
  "(function(){var d=document.documentElement;d.setAttribute('data-js','');" +
  "try{var z=Intl.DateTimeFormat().resolvedOptions().timeZone;if(!z||z==='Europe/Berlin')return;" +
  "var n=new Date(),a=function(t){return new Date(n.toLocaleString('en-US',{timeZone:t})).getTime()};" +
  "if(a('Europe/Berlin')!==a(z))d.setAttribute('data-tz-diff','')}catch(e){}})();";
