const BACKSLASH = String.fromCharCode(92);
const UNSAFE_JSON_CHARS = new RegExp('[<>&' + String.fromCharCode(0x2028, 0x2029) + ']', 'g');

/**
 * JSON für <script type="application/ld+json">: `<`, `>`, `&` und Zeilentrenner als
 * Unicode-Escape ausgeben, damit kein </script> aus Inhalten ausbrechen kann.
 */
export function safeJson(data: unknown): string {
  return JSON.stringify(data).replace(
    UNSAFE_JSON_CHARS,
    (c) => BACKSLASH + 'u' + c.charCodeAt(0).toString(16).padStart(4, '0'),
  );
}

/** Minimaler HTML-Escape für Text in selbst gebauten Strings (z. B. RSS, E-Mail). */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
