/**
 * Kleine, reine Parse- und Prüfhelfer für Admin-Formulare (ohne I/O, getestet).
 */
import { isHttpUrl, normalizeText } from '~/lib/domain/text';

/** Leere/Leerraum-Strings → null, sonst normalisierter Text. */
export function textOrNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const t = normalizeText(value);
  return t === '' ? null : t;
}

/**
 * Kommagetrennte Punkteliste („25, 18, 15“) → Zahlen. Erlaubt Komma, Semikolon,
 * Leerzeichen und Zeilenumbrüche als Trenner. Liefert Fehlertext statt zu werfen.
 */
export function parseIntList(
  input: string | null | undefined,
  opts: { min?: number; max?: number; maxLength?: number; allowEmpty?: boolean } = {},
): { values: number[]; error: string | null } {
  const { min = 0, max = 1000, maxLength = 40, allowEmpty = true } = opts;
  const raw = (input ?? '').trim();
  if (raw === '') return allowEmpty ? { values: [], error: null } : { values: [], error: 'Bitte mindestens einen Wert eintragen.' };
  const parts = raw.split(/[\s,;]+/).filter((p) => p !== '');
  const values: number[] = [];
  for (const p of parts) {
    if (!/^-?\d+$/.test(p)) return { values: [], error: `„${p}“ ist keine ganze Zahl.` };
    const n = Number(p);
    if (n < min || n > max) return { values: [], error: `Werte müssen zwischen ${min} und ${max} liegen („${p}“).` };
    values.push(n);
  }
  if (values.length > maxLength) return { values: [], error: `Höchstens ${maxLength} Werte.` };
  return { values, error: null };
}

/** true, wenn die Liste nicht aufsteigend ist (Punkte sollten mit dem Platz fallen). */
export function isNonIncreasing(values: readonly number[]): boolean {
  return values.every((v, i) => i === 0 || v <= values[i - 1]!);
}

/** Hex-Farbe normalisieren: „#abc“, „abc“, „#AABBCC“ → „#AABBCC“; ungültig → null. */
export function normalizeHex(input: string | null | undefined): string | null {
  if (!input) return null;
  let v = input.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(v)) v = v.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(v)) return null;
  return `#${v.toUpperCase()}`;
}

/** Optionale http(s)-URL: leer → null, ungültig → Fehler. */
export function optionalUrl(value: string | null | undefined): { value: string | null; error: string | null } {
  const v = (value ?? '').trim();
  if (v === '') return { value: null, error: null };
  if (!isHttpUrl(v)) return { value: null, error: 'Bitte eine vollständige Adresse mit https:// eintragen.' };
  return { value: v, error: null };
}

/** Datum „YYYY-MM-DD“ prüfen (inkl. Kalendergültigkeit). */
export function isIsoDate(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Uhrzeit „HH:mm“ prüfen. */
export function isTime(value: string | null | undefined): value is string {
  return !!value && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/** Zeilen einer Textarea (leere Zeilen entfernt). */
export function lines(value: string | null | undefined): string[] {
  return (value ?? '')
    .split(/\r?\n/)
    .map((l) => normalizeText(l))
    .filter((l) => l !== '');
}

/** Discord-Rollen-/Nutzer-IDs (Snowflakes), komma- oder zeilengetrennt. */
export function parseSnowflakes(value: string | null | undefined): { ids: string[]; invalid: string[] } {
  const parts = (value ?? '').split(/[\s,;]+/).filter((p) => p !== '');
  const ids: string[] = [];
  const invalid: string[] = [];
  for (const p of parts) {
    if (/^\d{15,21}$/.test(p)) {
      if (!ids.includes(p)) ids.push(p);
    } else invalid.push(p);
  }
  return { ids, invalid };
}

/** Google-Analytics-4-Messungs-ID, z. B. „G-AB12CD34EF“. */
export function isGaMeasurementId(value: string): boolean {
  return /^G-[A-Z0-9]{4,16}$/.test(value);
}

/** Discord-Webhook-URL (discord.com/discordapp.com, auch ptb/canary). */
export function isDiscordWebhookUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    const okHost = /^(?:(?:ptb|canary)\.)?discord(?:app)?\.com$/.test(host);
    return okHost && /^\/api\/(?:v\d+\/)?webhooks\/\d+\/[\w-]+\/?$/.test(url.pathname);
  } catch {
    return false;
  }
}

/** Geheimnis maskiert anzeigen: Anfang und die letzten 4 Zeichen. */
export function maskSecret(value: string | null | undefined): string {
  if (!value) return '';
  if (value.length <= 12) return '••••';
  const idx = value.indexOf('/webhooks/');
  const head = idx >= 0 ? value.slice(0, idx + '/webhooks/'.length) : value.slice(0, 8);
  return `${head}…${value.slice(-4)}`;
}

/** Twitch-Kanal aus Name oder URL („https://twitch.tv/xyz“ → „xyz“); ungültig → null. */
export function parseTwitchChannel(value: string | null | undefined): { channel: string | null; error: string | null } {
  const v = (value ?? '').trim();
  if (v === '') return { channel: null, error: null };
  let name = v;
  const m = /^(?:https?:\/\/)?(?:www\.|m\.)?twitch\.tv\/([^/?#]+)/i.exec(v);
  if (m) name = m[1]!;
  if (!/^[a-zA-Z0-9_]{3,25}$/.test(name)) return { channel: null, error: 'Kanalname: 3–25 Zeichen, nur Buchstaben, Ziffern und _.' };
  return { channel: name.toLowerCase(), error: null };
}

/** Postfix-Zähler für eindeutige Namen: „F1 aktuell“ → „F1 aktuell (2)“. */
export function uniqueName(base: string, taken: Iterable<string>): string {
  const set = new Set([...taken].map((t) => t.toLowerCase()));
  if (!set.has(base.toLowerCase())) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base} (${i})`;
    if (!set.has(candidate.toLowerCase())) return candidate;
  }
}

/** Seitenweise Ausschnitt (1-basiert). */
export function paginate<T>(list: readonly T[], page: number, perPage: number): { items: T[]; page: number; pages: number; total: number } {
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const p = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  return { items: list.slice((p - 1) * perPage, p * perPage), page: p, pages, total };
}
