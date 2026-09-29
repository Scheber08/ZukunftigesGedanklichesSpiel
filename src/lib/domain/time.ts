/**
 * Zeitzonen-Helfer ohne Abhängigkeiten.
 * Renntermine werden als Ortszeit in einer IANA-Zone gepflegt (Standard Europe/Berlin)
 * und für Countdown, ICS und Anzeige in UTC umgerechnet – inkl. Zeitumstellung.
 */

export const LEAGUE_TIMEZONE = 'Europe/Berlin';

const dtfCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = dtfCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    dtfCache.set(timeZone, f);
  }
  return f;
}

/** Offset der Zone zum Zeitpunkt `instant` in Millisekunden (Ortszeit − UTC). */
export function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = partsFormatter(timeZone).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  // Millisekunden fallen bei formatToParts weg
  return asUtc - (instant.getTime() - instant.getUTCMilliseconds());
}

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/;

/** Zerlegt "2026-11-05T20:00[:00]" in Komponenten. */
export function parseLocalDateTime(local: string): { y: number; mo: number; d: number; h: number; mi: number; s: number } {
  const m = LOCAL_RE.exec(local);
  if (!m) throw new Error(`Ungültige Ortszeit: ${local}`);
  return { y: +m[1]!, mo: +m[2]!, d: +m[3]!, h: +m[4]!, mi: +m[5]!, s: m[6] ? +m[6] : 0 };
}

/**
 * Wandelt eine Ortszeit in einer Zone in einen UTC-Zeitpunkt um.
 * Nicht existierende Zeiten (Sprung vorwärts, z. B. 02:30 am letzten Märzsonntag) werden
 * wie in Postgres mit dem Offset vor der Umstellung gerechnet, also nach vorne verschoben.
 * Doppelte Zeiten (Sprung rückwärts) ergeben die Winterzeit-Variante.
 */
export function zonedLocalToUtc(local: string, timeZone: string = LEAGUE_TIMEZONE): Date {
  const { y, mo, d, h, mi, s } = parseLocalDateTime(local);
  const naive = Date.UTC(y, mo - 1, d, h, mi, s);
  const offset1 = timeZoneOffsetMs(new Date(naive), timeZone);
  const utc = naive - offset1;
  const offset2 = timeZoneOffsetMs(new Date(utc), timeZone);
  if (offset2 === offset1) return new Date(utc);
  const candidate = naive - offset2;
  // nur übernehmen, wenn der Kandidat wirklich auf die gewünschte Ortszeit zurückführt
  if (candidate + timeZoneOffsetMs(new Date(candidate), timeZone) === naive) return new Date(candidate);
  return new Date(naive - Math.min(offset1, offset2));
}

/** UTC-Zeitpunkt → Ortszeit-String "YYYY-MM-DDTHH:mm:ss" in der Zone. */
export function utcToZonedLocal(instant: Date, timeZone: string = LEAGUE_TIMEZONE): string {
  const parts = partsFormatter(timeZone).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 3_600_000);
}

export type Lang = 'de' | 'en';

export const INTL_LOCALE: Record<Lang, string> = { de: 'de-DE', en: 'en-GB' };

export function formatDate(
  instant: Date | string,
  lang: Lang,
  options: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' },
  timeZone: string = LEAGUE_TIMEZONE,
): string {
  const d = typeof instant === 'string' ? new Date(instant) : instant;
  return new Intl.DateTimeFormat(INTL_LOCALE[lang], { timeZone, ...options }).format(d);
}

export function formatDateLong(instant: Date | string, lang: Lang, timeZone: string = LEAGUE_TIMEZONE): string {
  return formatDate(instant, lang, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }, timeZone);
}

export function formatTime(instant: Date | string, lang: Lang, timeZone: string = LEAGUE_TIMEZONE): string {
  return formatDate(instant, lang, { hour: '2-digit', minute: '2-digit' }, timeZone);
}

export function formatDateTime(instant: Date | string, lang: Lang, timeZone: string = LEAGUE_TIMEZONE): string {
  return formatDate(
    instant,
    lang,
    { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' },
    timeZone,
  );
}

/** Kurzname der Zone zum Zeitpunkt, z. B. "MEZ"/"MESZ" bzw. "CET"/"CEST". */
export function timeZoneName(instant: Date | string, lang: Lang, timeZone: string = LEAGUE_TIMEZONE): string {
  const d = typeof instant === 'string' ? new Date(instant) : instant;
  const parts = new Intl.DateTimeFormat(INTL_LOCALE[lang], { timeZone, timeZoneName: 'short' }).formatToParts(d);
  return parts.find((p) => p.type === 'timeZoneName')?.value ?? timeZone;
}
