/**
 * Fachliche Fehler des Renntag-Bereichs. Die Actions übersetzen sie in `ActionError`
 * (gleiche Codes), die Server-Dienste bleiben so ohne Astro-Abhängigkeit testbar.
 */
export type RacedayErrorCode = 'BAD_REQUEST' | 'NOT_FOUND' | 'CONFLICT' | 'FORBIDDEN' | 'PRECONDITION_FAILED';

export class RacedayError extends Error {
  constructor(
    public readonly code: RacedayErrorCode,
    public readonly headline: string,
    /** Zusätzliche Angaben für die Oberfläche, z. B. Prüfmeldungen. */
    public readonly details: string[] = [],
  ) {
    super(details.length > 0 ? `${headline} ${details.join(' · ')}` : headline);
    this.name = 'RacedayError';
  }

  /** Meldung für die Oberfläche: erste Zeile Überschrift, danach je Zeile ein Detail. */
  get uiMessage(): string {
    return [this.headline, ...this.details].join('\n');
  }
}

export const notFound = (what: string) => new RacedayError('NOT_FOUND', `${what} nicht gefunden.`);

/** Fehlermeldung einer Action in Überschrift und Details zerlegen (Gegenstück zu `uiMessage`). */
export function splitErrorMessage(message: string | undefined | null): { headline: string; details: string[] } {
  const [headline = 'Es ist ein Fehler aufgetreten.', ...details] = (message ?? '').split('\n').filter((l) => l.trim() !== '');
  return { headline, details };
}
