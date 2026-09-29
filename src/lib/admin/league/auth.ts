/**
 * Reine Helfer für den Staff-Login (Plan §5): sichere Weiterleitungsziele und Fehlermeldungen.
 */

/**
 * Nur relative Pfade innerhalb von /admin sind als Ziel nach dem Login erlaubt
 * (Schutz vor Open Redirects wie `//evil.example` oder `/admin@evil`).
 */
export function safeNext(value: string | null | undefined, fallback = '/admin'): string {
  if (!value) return fallback;
  const raw = value.trim();
  let decoded: string;
  try {
    // kodierte Angriffe (%2F%2F…, %5C) ebenfalls erkennen
    decoded = decodeURIComponent(raw);
  } catch {
    return fallback;
  }
  for (const v of [raw, decoded]) {
    if (v.includes('\\') || v.startsWith('//')) return fallback;
    if (!/^\/admin(?:[/?#]|$)/.test(v)) return fallback;
    // Login-/Auth-Seiten selbst nicht als Ziel (sonst Schleife)
    if (/^\/admin\/(?:login|auth)(?:[/?#]|$)/.test(v)) return fallback;
  }
  // Steuerzeichen (z. B. Zeilenumbrüche für Header-Injection) ablehnen
  if ([...decoded].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) return fallback;
  try {
    const url = new URL(raw, 'https://liga.invalid');
    if (url.origin !== 'https://liga.invalid') return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}

/** Fehlercodes für /admin/login?error=… */
export const LOGIN_ERRORS: Record<string, string> = {
  no_role:
    'Dein Discord-Konto hat keine Liga-Rolle. Der Zugang richtet sich nach deinen Rollen auf dem Liga-Discord – wende dich an die Ligaleitung.',
  oauth: 'Die Anmeldung bei Discord konnte nicht gestartet werden. Bitte versuche es erneut.',
  callback: 'Die Anmeldung konnte nicht abgeschlossen werden (Code ungültig oder abgelaufen). Bitte melde dich erneut an.',
  denied: 'Du hast die Anmeldung bei Discord abgebrochen.',
  roles: 'Deine Discord-Rollen konnten gerade nicht geprüft werden. Bitte versuche es in ein paar Minuten erneut.',
  demo_only: 'Der Demo-Login ist nur im Demo-Modus verfügbar.',
  session: 'Deine Sitzung ist abgelaufen oder deine Rolle hat sich geändert. Bitte melde dich erneut an.',
};

export function loginErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  return LOGIN_ERRORS[code] ?? 'Die Anmeldung ist fehlgeschlagen. Bitte versuche es erneut.';
}
