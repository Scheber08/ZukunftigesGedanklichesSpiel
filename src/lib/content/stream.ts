/**
 * Twitch-Stream (Plan §8.2): Kanalname prüfen und die Player-URL bauen.
 * Wird serverseitig (Seite) und im Browser (2-Klick-Skript) genutzt – ohne Abhängigkeiten.
 */

/** Twitch-Benutzernamen: 3–25 Zeichen aus Buchstaben, Ziffern und Unterstrich. */
const CHANNEL_RE = /^[A-Za-z0-9_]{3,25}$/;

/**
 * Kanal aus der Einstellung lesen. Erlaubt ist der reine Name oder eine Kanal-URL
 * (https://www.twitch.tv/name). Alles andere ergibt null (= kein Stream).
 */
export function normalizeTwitchChannel(value: string | null | undefined): string | null {
  if (!value) return null;
  let candidate = value.trim();
  const urlMatch = /^(?:https?:\/\/)?(?:www\.|m\.)?twitch\.tv\/([^/?#\s]+)\/?(?:[?#].*)?$/i.exec(candidate);
  if (urlMatch) candidate = urlMatch[1]!;
  candidate = candidate.replace(/^@/, '');
  return CHANNEL_RE.test(candidate) ? candidate.toLowerCase() : null;
}

/** Öffentliche Kanalseite auf Twitch. */
export function twitchChannelUrl(channel: string): string {
  return `https://www.twitch.tv/${encodeURIComponent(channel)}`;
}

/**
 * Embed-URL des Players. `parent` muss der Hostname der einbettenden Seite sein
 * (Pflicht bei Twitch), im Browser also `location.hostname`.
 */
export function twitchPlayerUrl(channel: string, parent: string, opts: { autoplay?: boolean } = {}): string {
  const params = new URLSearchParams({ channel, parent, autoplay: opts.autoplay === false ? 'false' : 'true' });
  return `https://player.twitch.tv/?${params.toString()}`;
}
