/**
 * iCalendar (RFC 5545) für das Kalender-Abo und den Download pro Rennen (Plan §4.3).
 * Zeiten werden mit TZID Europe/Berlin und passender VTIMEZONE ausgeliefert,
 * damit die Zeitumstellung in allen Kalender-Apps korrekt ist.
 */

import { LEAGUE_TIMEZONE, utcToZonedLocal, zonedLocalToUtc } from './time';

export interface IcsEvent {
  uid: string;
  /** Ortszeit "YYYY-MM-DDTHH:mm[:ss]" in `timezone`. */
  localStart: string;
  timezone?: string;
  durationMinutes: number;
  summary: string;
  description?: string;
  url?: string;
  location?: string;
  cancelled?: boolean;
  /** Änderungszähler, damit Kalender Aktualisierungen übernehmen. */
  sequence?: number;
  lastModified?: Date;
}

export interface IcsCalendar {
  name: string;
  description?: string;
  prodId?: string;
  events: IcsEvent[];
  now?: Date;
}

const VTIMEZONE_EUROPE_BERLIN = [
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Berlin',
  'X-LIC-LOCATION:Europe/Berlin',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

/** Text-Werte escapen (RFC 5545 §3.3.11). */
export function escapeIcsText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Zeilen auf 75 Oktette falten (UTF-8-sicher, keine Zeichen zerschneiden). */
export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const out: string[] = [];
  let current = '';
  let currentBytes = 0;
  let limit = 75;
  for (const ch of line) {
    const bytes = encoder.encode(ch).length;
    if (currentBytes + bytes > limit) {
      out.push(current);
      current = ch;
      currentBytes = bytes;
      limit = 74; // Folgezeilen beginnen mit einem Leerzeichen
    } else {
      current += ch;
      currentBytes += bytes;
    }
  }
  out.push(current);
  return out.join('\r\n ');
}

const compactLocal = (local: string) => local.replace(/[-:]/g, '').slice(0, 15);

function formatUtcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function localWithSeconds(local: string): string {
  return /T\d{2}:\d{2}$/.test(local) ? `${local}:00` : local.slice(0, 19);
}

export function buildIcs(calendar: IcsCalendar): string {
  const now = calendar.now ?? new Date();
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${calendar.prodId ?? '-//Liga//Rennkalender//DE'}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(calendar.name)}`,
    `X-WR-TIMEZONE:${LEAGUE_TIMEZONE}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'X-PUBLISHED-TTL:PT6H',
  ];
  if (calendar.description) lines.push(`X-WR-CALDESC:${escapeIcsText(calendar.description)}`);

  const needsBerlin = calendar.events.some((e) => (e.timezone ?? LEAGUE_TIMEZONE) === 'Europe/Berlin');
  if (needsBerlin) lines.push(...VTIMEZONE_EUROPE_BERLIN);

  for (const e of calendar.events) {
    const tz = e.timezone ?? LEAGUE_TIMEZONE;
    const start = localWithSeconds(e.localStart);
    const startUtc = zonedLocalToUtc(start, tz);
    const endUtc = new Date(startUtc.getTime() + e.durationMinutes * 60_000);
    const endLocal = utcToZonedLocal(endUtc, tz);
    const useTzid = tz === 'Europe/Berlin';

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${e.uid}`);
    lines.push(`DTSTAMP:${formatUtcStamp(now)}`);
    if (useTzid) {
      lines.push(`DTSTART;TZID=${tz}:${compactLocal(start)}`);
      lines.push(`DTEND;TZID=${tz}:${compactLocal(endLocal)}`);
    } else {
      lines.push(`DTSTART:${formatUtcStamp(startUtc)}`);
      lines.push(`DTEND:${formatUtcStamp(endUtc)}`);
    }
    lines.push(`SUMMARY:${escapeIcsText(e.summary)}`);
    if (e.description) lines.push(`DESCRIPTION:${escapeIcsText(e.description)}`);
    if (e.location) lines.push(`LOCATION:${escapeIcsText(e.location)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    if (e.sequence != null) lines.push(`SEQUENCE:${e.sequence}`);
    if (e.lastModified) lines.push(`LAST-MODIFIED:${formatUtcStamp(e.lastModified)}`);
    lines.push(`STATUS:${e.cancelled ? 'CANCELLED' : 'CONFIRMED'}`);
    lines.push('TRANSP:OPAQUE');
    if (!e.cancelled) {
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeIcsText(e.summary)}`, 'TRIGGER:-PT30M', 'END:VALARM');
    }
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}
