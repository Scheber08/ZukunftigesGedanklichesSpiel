/**
 * Text-Normalisierung für Gamertags, Slugs und Formulareingaben.
 */

// Zero-Width-Zeichen, BOM, Bidi-Steuerzeichen und weiche Trennzeichen
const codeRange = (from: number, to: number = from) => String.fromCharCode(from) + (to > from ? '-' + String.fromCharCode(to) : '');
const INVISIBLE_RE = new RegExp(
  '[' +
    [
      codeRange(0xad), // weiches Trennzeichen
      codeRange(0x180e), // mongolischer Vokaltrenner
      codeRange(0x200b, 0x200f), // Zero-Width-Space/-Joiner, LRM/RLM
      codeRange(0x202a, 0x202e), // Bidi-Einbettungen
      codeRange(0x2060, 0x2064), // Word Joiner, unsichtbare Operatoren
      codeRange(0x2066, 0x206f), // Bidi-Isolate u. a.
      codeRange(0xfeff), // BOM
    ].join('') +
    ']',
  'g',
);
// sonstige Steuerzeichen (ohne Tab/Zeilenumbruch)
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

/** Trim, Unicode NFKC, keine unsichtbaren Zeichen, Leerraum zusammengefasst (Plan §4.9). */
export function normalizeGamertag(input: string): string {
  return input.normalize('NFKC').replace(INVISIBLE_RE, '').replace(CONTROL_RE, '').replace(/\s+/g, ' ').trim();
}

/** Für Duplikat-Vergleiche: normalisiert und case-insensitiv. */
export function gamertagKey(input: string): string {
  return normalizeGamertag(input).toLocaleLowerCase('en');
}

/** Normalisiert Freitext aus Formularen (Zeilenumbrüche bleiben). */
export function normalizeText(input: string): string {
  return input
    .normalize('NFKC')
    .replace(INVISIBLE_RE, '')
    .replace(CONTROL_RE, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

const TRANSLIT: Record<string, string> = {
  ä: 'ae',
  ö: 'oe',
  ü: 'ue',
  ß: 'ss',
  æ: 'ae',
  ø: 'o',
  å: 'a',
  œ: 'oe',
  ð: 'd',
  þ: 'th',
  ł: 'l',
};

/** "Max Müller_99" → "max-mueller-99" */
export function slugify(input: string): string {
  const lower = normalizeGamertag(input).toLowerCase();
  const translit = lower.replace(/[äöüßæøåœðþł]/g, (c) => TRANSLIT[c] ?? c);
  const slug = translit
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return slug || 'fahrer';
}

/** Eindeutigen Slug erzeugen, falls schon vergeben: "name", "name-2", "name-3", … */
export function uniqueSlug(base: string, taken: Iterable<string>): string {
  const set = new Set(taken);
  if (!set.has(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}-${i}`;
    if (!set.has(candidate)) return candidate;
  }
}

/** Nur http(s)-URLs zulassen (für Clip-, VOD- und Social-Links). */
export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

/** Plattformen, deren Clip-Links im Vorfall-Formular akzeptiert werden (Plan §4.6). */
export const CLIP_HOSTS = [
  'youtube.com',
  'youtu.be',
  'twitch.tv',
  'medal.tv',
  'streamable.com',
  'xbox.com',
  'gamerdvr.com',
  'xboxclips.co',
  'playstation.com',
  'sharefactory.playstation.com',
] as const;

export function isAllowedClipUrl(value: string): boolean {
  if (!isHttpUrl(value)) return false;
  const host = new URL(value).hostname.toLowerCase().replace(/^www\./, '');
  return CLIP_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}
