/**
 * Eingaben nach einem fehlgeschlagenen Absenden wieder ins Formular füllen.
 * Astro liest den Body für die Action aus einer Kopie – das Original ist noch lesbar.
 */
export type Posted = FormData | null;

export async function postedForm(request: Request): Promise<Posted> {
  if (request.method !== 'POST') return null;
  try {
    return await request.clone().formData();
  } catch {
    return null;
  }
}

/** Einzelner Wert als String (leer → null). */
export function posted(form: Posted, name: string): string | null {
  const v = form?.get(name);
  return typeof v === 'string' && v !== '' ? v : null;
}

/** Mehrfachwerte (Checkbox-Gruppen). */
export function postedAll(form: Posted, name: string): string[] {
  return (form?.getAll(name) ?? []).filter((v): v is string => typeof v === 'string' && v !== '');
}

/** Checkbox angehakt? */
export function postedChecked(form: Posted, name: string): boolean {
  return form?.has(name) ?? false;
}

/** Positive Ganzzahl aus einem Query- oder Formularwert. */
export function positiveInt(value: string | null | undefined): number | null {
  if (!value || !/^\d{1,9}$/.test(value)) return null;
  const n = Number(value);
  return n > 0 ? n : null;
}
