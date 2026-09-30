/**
 * Seiten-Helfer für die Admin-Formulare (Post/Redirect/Get):
 * - Nach erfolgreicher Action leitet die Seite (303) auf eine saubere URL mit `?ok=<code>` um,
 *   ein Neuladen schickt das Formular also nicht erneut ab.
 * - Bei Fehlern rendert die Seite direkt, zeigt die Meldung, markiert Felder und
 *   füllt das abgeschickte Formular mit den eingegebenen Werten vor.
 */
import type { AstroGlobal } from 'astro';
import { isInputError } from 'astro:actions';
import { sameAction } from './forms';

export { sameAction };

/** Rückgabe aller Admin-Kern-Actions. */
export interface AdminActionData {
  /** Code für die Erfolgsmeldung (siehe FLASH_MESSAGES) */
  ok: string;
  /** Ziel nach dem Speichern (Standard: aktuelle Seite) */
  redirect?: string;
  /** Zahl/Parameter für die Meldung, z. B. Anzahl angelegter Runden */
  n?: number | string;
}

export interface ActionOutcome {
  /** Umleitungsziel nach Erfolg */
  redirect: string | null;
  /** Die Action, die gelaufen ist (zum Zuordnen des Formulars) */
  action: unknown;
  error: { message: string; fields: Record<string, string[]> } | null;
  /** Abgeschickte Formularwerte (nur bei Fehlern) */
  posted: FormData | null;
}

type AnyAction = Parameters<AstroGlobal['getActionResult']>[0];

export async function actionOutcome(Astro: AstroGlobal, list: readonly AnyAction[]): Promise<ActionOutcome> {
  for (const action of list) {
    const result = Astro.getActionResult(action);
    if (!result) continue;
    if (result.error) {
      const err = result.error;
      const input = isInputError(err);
      const fields: Record<string, string[]> = {};
      if (input) {
        for (const [k, v] of Object.entries(err.fields as Record<string, string[] | undefined>)) if (v?.length) fields[k] = v;
      }
      let posted: FormData | null = null;
      try {
        posted = await Astro.request.formData();
      } catch {
        posted = null;
      }
      const message = input
        ? Object.keys(fields).length > 0
          ? 'Bitte prüfe die markierten Felder.'
          : (err.issues?.[0]?.message ?? 'Bitte prüfe deine Eingaben.')
        : err.code === 'UNAUTHORIZED'
          ? 'Deine Sitzung ist abgelaufen – bitte melde dich erneut an.'
          : err.code === 'FORBIDDEN'
            ? 'Dafür fehlt dir die Berechtigung.'
            : err.message || 'Es ist ein Fehler aufgetreten.';
      return { redirect: null, action, error: { message, fields }, posted };
    }
    const data = (result.data ?? {}) as Partial<AdminActionData>;
    const target = new URL(data.redirect ?? Astro.url.pathname, Astro.url);
    target.searchParams.delete('_action');
    if (data.ok) target.searchParams.set('ok', data.ok);
    if (data.n != null) target.searchParams.set('n', String(data.n));
    return { redirect: target.pathname + target.search + target.hash, action, error: null, posted: null };
  }
  return { redirect: null, action: null, error: null, posted: null };
}

/**
 * Formularwerte: nach einem Fehler die abgeschickten Werte (nur für das betroffene
 * Formular), sonst die Werte aus der Datenbank.
 */
export function formValues(outcome: ActionOutcome, action: unknown, formKey?: string) {
  const own =
    sameAction(outcome.action, action) &&
    outcome.posted != null &&
    (formKey == null || outcome.posted.get('_form') === formKey);
  const posted = own ? outcome.posted : null;
  return {
    /** Wurde dieses Formular gerade mit Fehlern abgeschickt? */
    active: own,
    str(name: string, fallback: string | number | null | undefined = ''): string {
      if (posted) {
        const v = posted.get(name);
        return typeof v === 'string' ? v : '';
      }
      return fallback == null ? '' : String(fallback);
    },
    bool(name: string, fallback: boolean): boolean {
      return posted ? posted.has(name) : fallback;
    },
    err(name: string): string[] | undefined {
      return own ? outcome.error?.fields[name] : undefined;
    },
  };
}

/** Texte für `?ok=<code>` (Parameter `n` wird für {n} eingesetzt). */
export const FLASH_MESSAGES: Record<string, string> = {
  saved: 'Gespeichert.',
  created: 'Angelegt.',
  deleted: 'Gelöscht.',
  season_created: 'Saison angelegt.',
  season_cloned: 'Saison geklont: Punkteschema, Lobby, Einstellungen und Teams sind übernommen ({n} Cockpits).',
  season_finished: 'Saison abgeschlossen: Die Champions stehen in der Hall of Fame, die Saison ist jetzt eingefroren.',
  season_reopened: 'Saison wieder geöffnet – Änderungen sind wieder möglich. Schließe sie danach erneut ab.',
  season_activated: 'Saison ist jetzt aktiv.',
  lobby_saved: 'Lobby-Einstellungen gespeichert.',
  scheme_created: 'Punkteschema angelegt.',
  round_created: 'Runde angelegt (inkl. Sessions).',
  rounds_created: '{n} Runden angelegt (inkl. Sessions).',
  round_cancelled: 'Runde abgesagt.',
  round_restored: 'Absage zurückgenommen – die Runde ist wieder geplant.',
  sessions_kept: 'Gespeichert. Sessions mit Ergebnissen wurden nicht gelöscht – bitte im Renntag-Modul prüfen.',
  track_created: 'Strecke angelegt.',
  team_created: 'Team angelegt.',
  season_teams_saved: 'Teams der Saison gespeichert.',
  seat_saved: 'Cockpit gespeichert.',
  seat_moved: 'Cockpit gespeichert, das bisherige Cockpit des Fahrers wurde freigegeben.',
  seat_saved_retro:
    'Cockpit rückwirkend gespeichert ({n} gewertete Runde(n) betroffen). Prüfe im Renntag-Modul, ob Aufstellung und Konstrukteurspunkte dieser Runden noch stimmen.',
  seat_removed: 'Cockpit-Eintrag entfernt.',
  driver_created: 'Fahrer angelegt.',
  number_assigned: 'Startnummer vergeben.',
  number_changed: 'Nummernwechsel gespeichert – die neue Nummer gilt ab dem nächsten Rennen.',
  number_change_reverted: 'Vorgemerkter Nummernwechsel zurückgenommen.',
  number_released: 'Startnummer freigegeben.',
  pseudonymized: 'Fahrer pseudonymisiert, private Daten gelöscht.',
  reg_saved: 'Anmeldung gespeichert.',
  reg_accepted: 'Angenommen: Fahrer als Reserve angelegt, Wunschnummer {n} vergeben.',
  reg_accepted_nonumber: 'Angenommen: Fahrer als Reserve angelegt. Die Wunschnummer war nicht frei – bitte eine Nummer vergeben.',
  settings_saved: 'Einstellungen gespeichert.',
  settings_unchanged: 'Nichts geändert – leere Felder lassen gespeicherte Werte unverändert.',
  self_role_added: 'Selbstrolle hinzugefügt. Der Bot bietet sie nach dem nächsten Befehlsaufruf an.',
  self_role_updated: 'Bezeichnungen der Selbstrolle aktualisiert.',
  self_role_removed: 'Selbstrolle entfernt. Die Rolle selbst bleibt auf dem Discord-Server bestehen.',
  webhook_ok: 'Test-Nachricht gesendet – schau im Discord-Channel nach.',
  rebuild_requested: 'Neubau angefordert. Der Cron-Job startet ihn innerhalb von etwa zwei Minuten.',
  rebuild_demo: 'Im Demo-Modus ist kein Neubau nötig – der Dev-Server zeigt Änderungen sofort.',
  contact_done: 'Als erledigt markiert.',
  contact_open: 'Wieder geöffnet.',
};

export function flashMessage(url: URL): string | null {
  const code = url.searchParams.get('ok');
  if (!code) return null;
  const text = FLASH_MESSAGES[code];
  if (!text) return null;
  const n = url.searchParams.get('n') ?? '';
  // nur harmlose Parameter einsetzen (Zahlen/kurze Kennungen)
  return text.replace('{n}', /^[\w .-]{0,20}$/.test(n) ? n : '');
}

/**
 * ARIA-Attribute für ein Eingabefeld in `Field.astro`: verknüpft Hinweis (`<id>-hint`) und
 * Fehlertext (`<id>-error`) per aria-describedby und markiert Fehler mit aria-invalid.
 */
export function fieldAria(id: string, hint: boolean, errors?: string[] | null): Record<string, string> {
  const ids: string[] = [];
  if (hint) ids.push(`${id}-hint`);
  if (errors?.length) ids.push(`${id}-error`);
  const attrs: Record<string, string> = {};
  if (ids.length) attrs['aria-describedby'] = ids.join(' ');
  if (errors?.length) attrs['aria-invalid'] = 'true';
  return attrs;
}
