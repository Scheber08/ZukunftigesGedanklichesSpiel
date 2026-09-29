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

/**
 * Am Ende von <body>, noch vor dem ersten Zeichnen: setzt „(deine Zeit: …)“ in die vorab
 * reservierten Hinweise hinter <time data-localtime> (LocalTime.astro) – ohne Layout-Sprung.
 * Ebenfalls per SHA-256-Hash in der CSP freigegeben.
 */
export const LOCALTIME_SCRIPT =
  "(function(){if(!document.documentElement.hasAttribute('data-tz-diff'))return;" +
  "var els=document.querySelectorAll('time[data-localtime]');" +
  "for(var i=0;i<els.length;i++){var el=els[i],h=el.nextElementSibling;" +
  "if(!h||!h.hasAttribute('data-localtime-hint'))continue;" +
  "var t=new Date(el.getAttribute('datetime'));if(isNaN(t.getTime()))continue;" +
  "var o=function(z){return new Date(t.toLocaleString('en-US',z?{timeZone:z}:{})).getTime()};" +
  "if(o('Europe/Berlin')===o()){h.style.display='none';continue}" +
  "var en=el.getAttribute('data-lang')==='en',f={hour:'2-digit',minute:'2-digit',timeZoneName:'short'};" +
  "if(el.getAttribute('data-localtime')!=='time'){f.weekday='short';f.day='2-digit';f.month='2-digit'}" +
  "h.textContent=(en?' (your time: ':' (deine Zeit: ')+new Intl.DateTimeFormat(en?'en-GB':'de-DE',f).format(t)+')';" +
  "h.removeAttribute('aria-hidden');h.className+=' is-set'}})();";
