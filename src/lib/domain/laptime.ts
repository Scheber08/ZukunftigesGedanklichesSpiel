/**
 * Rundenzeiten, Renndauer und Abstände – Eingabe im Admin als `m:ss.SSS`,
 * Speicherung als Millisekunden.
 */

const pad = (n: number, len = 2) => String(n).padStart(len, '0');

/** 83456 → "1:23.456" (ab einer Stunde "1:02:03.456"). */
export function formatLapTime(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return '–';
  const total = Math.round(ms);
  const millis = total % 1000;
  const totalSeconds = Math.floor(total / 1000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}.${pad(millis, 3)}`;
  return `${minutes}:${pad(seconds)}.${pad(millis, 3)}`;
}

export const formatRaceTime = formatLapTime;

/**
 * Akzeptiert "1:23.456", "01:23.456", "83.456", "1:02:03.4", "1:23,456" (Komma).
 * Liefert Millisekunden oder null bei ungültiger Eingabe.
 */
export function parseLapTime(input: string | null | undefined): number | null {
  if (input == null) return null;
  const s = input.trim().replace(',', '.');
  if (s === '') return null;
  if (!s.includes(':')) {
    // reine Sekunden, z. B. "83.456"
    const secOnly = /^(\d+)(?:\.(\d{1,3}))?$/.exec(s);
    if (!secOnly) return null;
    const ms = Number(secOnly[1]) * 1000 + fraction(secOnly[2]);
    return ms > 0 ? ms : null;
  }
  const m = /^(?:(\d+):)?(?:(\d{1,2}):)?(\d{1,2})(?:\.(\d{1,3}))?$/.exec(s);
  if (!m) return null;
  const [, a, b, sec, frac] = m;
  let hours = 0;
  let minutes = 0;
  if (a !== undefined && b !== undefined) {
    hours = Number(a);
    minutes = Number(b);
  } else if (a !== undefined) {
    minutes = Number(a);
  }
  const seconds = Number(sec);
  if (seconds >= 60 || (hours > 0 && minutes >= 60)) return null;
  const ms = ((hours * 60 + minutes) * 60 + seconds) * 1000 + fraction(frac);
  return ms > 0 ? ms : null;
}

function fraction(frac: string | undefined): number {
  if (!frac) return 0;
  return Number(frac.padEnd(3, '0'));
}

/** Abstand in Sekunden mit Vorzeichen: 1234 → "+1.234" */
export function formatGapMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '';
  if (ms >= 60_000) return `+${formatLapTime(ms)}`;
  return `+${(ms / 1000).toFixed(3)}`;
}
