/**
 * Formular-Helfer für die Admin-Seiten des Inhalte-Bereichs: eingereichte Werte nach
 * einem Fehler wieder anzeigen, Ortszeit-Eingaben (Europe/Berlin) umrechnen,
 * Rückmeldungen nach Redirects.
 */
import { utcToZonedLocal, zonedLocalToUtc } from '~/lib/domain/time';

/** FormData → einfache Wertetabelle (letzter Wert gewinnt, Dateien werden ignoriert). */
export function formValues(fd: FormData | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!fd) return out;
  for (const [key, value] of fd.entries()) {
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}

/**
 * Eingereichte Werte, wenn die Seite nach einer fehlgeschlagenen Action neu gerendert wird.
 * Astro liest den Body für die Action aus einer Kopie des Requests – das Original ist noch lesbar.
 */
export async function submittedValues(request: Request, failed: boolean): Promise<Record<string, string> | null> {
  if (!failed || request.method !== 'POST') return null;
  try {
    return formValues(await request.clone().formData());
  } catch {
    return null;
  }
}

/** Wert für ein Feld: eingereichter Wert (nach Fehler) vor gespeichertem Wert. */
export function pick(submitted: Record<string, string> | null, name: string, stored: string | number | null | undefined): string {
  if (submitted && name in submitted) return submitted[name] ?? '';
  return stored == null ? '' : String(stored);
}

/** Checkbox: eingereichter Zustand (fehlt = aus) vor gespeichertem Wert. */
export function pickChecked(submitted: Record<string, string> | null, name: string, stored: boolean): boolean {
  if (submitted) return name in submitted && submitted[name] !== 'false';
  return stored;
}

const LOCAL_INPUT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

/** `<input type="datetime-local">` (Liga-Zeit) → UTC-Date; leer/ungültig → null. */
export function localInputToDate(value: string | null | undefined): Date | null {
  if (!value || !LOCAL_INPUT_RE.test(value.trim())) return null;
  return zonedLocalToUtc(value.trim());
}

/** ISO-Zeitpunkt → Wert für `<input type="datetime-local">` in Liga-Zeit. */
export function dateToLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return utcToZonedLocal(d).slice(0, 16);
}

/** Leere Strings → null (für optionale Textspalten). */
export function orNull(value: string | null | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

/** Rückmeldung nach einem Redirect (?ok=schluessel). */
export function flashMessage(url: URL, messages: Record<string, string>): string | null {
  const key = url.searchParams.get('ok');
  return key ? (messages[key] ?? null) : null;
}

/** Feldfehler aus einem Action-Ergebnis (Zod-Eingabefehler). */
export function fieldErrors(error: unknown): Record<string, string[]> {
  const e = error as { type?: string; fields?: Record<string, string[] | undefined> } | undefined;
  if (!e || e.type !== 'AstroActionInputError' || !e.fields) return {};
  return Object.fromEntries(Object.entries(e.fields).filter(([, v]) => v && v.length > 0)) as Record<string, string[]>;
}
