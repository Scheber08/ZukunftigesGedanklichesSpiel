/**
 * Fehlercodes aus Actions (Zod-Meldungen bzw. ActionError-Messages) → übersetzte Texte.
 * Unbekannte Codes (z. B. englische Standardmeldungen) werden zur allgemeinen Meldung.
 */
import { isUiKey, t, type Lang } from '~/i18n';

export type FieldErrors = Record<string, string>;

/** Übersetzter Text für einen Fehlercode. */
export function errorText(lang: Lang, code: string | null | undefined, fallback: 'required' | 'server' = 'server'): string {
  const key = `forms.error.${code ?? ''}`;
  return isUiKey(key) ? t(lang, key) : t(lang, `forms.error.${fallback}`);
}

/** Erste Meldung je Feld, übersetzt. */
export function translateFieldErrors(lang: Lang, fields: Record<string, string[] | undefined> | null | undefined): FieldErrors {
  const out: FieldErrors = {};
  for (const [name, messages] of Object.entries(fields ?? {})) {
    const first = messages?.find((m) => typeof m === 'string' && m !== '');
    if (first) out[name] = errorText(lang, first, 'required');
  }
  return out;
}

/** Fehlercode einer ActionError-Meldung (nur bekannte Codes, sonst „server“). */
export function formErrorCode(message: string | null | undefined): string {
  return message && isUiKey(`forms.error.${message}`) ? message : 'server';
}

/**
 * Serverseitige Prüfungen (Datenbank-Abgleich) melden sich als ActionError mit Code.
 * Diese Codes gehören zu einem Feld und werden dort angezeigt.
 */
const FIELD_OF_CODE: Record<string, string> = {
  number_taken: 'desired_number',
  duplicate_gamertag: 'gamertag',
  duplicate_discord: 'discord_username',
  reporter_invalid: 'reporter_driver_id',
  involved_invalid: 'involved_driver_ids',
  involved_required: 'involved_driver_ids',
  session_invalid: 'session_id',
  round_invalid: 'round_id',
};

export function fieldForCode(code: string): string | null {
  return FIELD_OF_CODE[code] ?? null;
}

/**
 * Ergebnis einer Action → Feldfehler und allgemeine Meldung für die Anzeige.
 * `inputFields` sind die Feldfehler eines ActionInputError (sonst null).
 */
export function collectErrors(
  lang: Lang,
  error: { message?: string; fields?: Record<string, string[] | undefined> } | null | undefined,
  isInput: boolean,
): { fields: FieldErrors; form: string | null } {
  if (!error) return { fields: {}, form: null };
  if (isInput) return { fields: translateFieldErrors(lang, error.fields), form: null };
  const code = formErrorCode(error.message);
  const field = fieldForCode(code);
  if (field) return { fields: { [field]: errorText(lang, code) }, form: null };
  return { fields: {}, form: errorText(lang, code) };
}
