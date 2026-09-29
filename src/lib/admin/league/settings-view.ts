/**
 * Anzeige-Helfer für die Einstellungsseite (Plan §5 „Einstellungen“, §7.2 Rebuild).
 * Reine Funktionen (getestet).
 */
import type { PrivateSettings } from '~/lib/settings';

/** Wie lange nach der letzten Änderung gewartet wird, bevor der Cron-Job baut (vgl. server/rebuild). */
export const REBUILD_DEBOUNCE_SECONDS = 60;

export type RebuildState = 'never' | 'done' | 'waiting' | 'queued';

export interface RebuildSummary {
  state: RebuildState;
  label: string;
  detail: string;
  requestedAt: string | null;
  dispatchedAt: string | null;
}

/**
 * Stand des gebündelten Neubaus:
 * - `waiting`: angefordert, der Cron-Job wartet noch auf Ruhe (Bündelung)
 * - `queued`: Wartezeit vorbei, der nächste Cron-Lauf (jede Minute) löst den Build aus
 * - `done`: letzter Build ausgelöst, seitdem keine Änderung
 */
export function rebuildSummary(rebuild: PrivateSettings['rebuild'], now: Date, debounceSeconds = REBUILD_DEBOUNCE_SECONDS): RebuildSummary {
  const requested = rebuild.requested_at ? new Date(rebuild.requested_at).getTime() : null;
  const dispatched = rebuild.dispatched_at ? new Date(rebuild.dispatched_at).getTime() : null;
  const base = { requestedAt: rebuild.requested_at, dispatchedAt: rebuild.dispatched_at };
  if (requested == null) {
    return { ...base, state: 'never', label: 'Noch kein Neubau', detail: 'Seit dem Start wurde kein Neubau angefordert.' };
  }
  if (dispatched != null && dispatched >= requested) {
    return { ...base, state: 'done', label: 'Aktuell', detail: 'Der letzte Neubau wurde ausgelöst, seitdem gab es keine öffentliche Änderung.' };
  }
  const waited = (now.getTime() - requested) / 1000;
  if (waited < debounceSeconds) {
    return {
      ...base,
      state: 'waiting',
      label: 'Angefordert',
      detail: `Änderungen werden gebündelt – der Neubau startet frühestens ${Math.max(1, Math.ceil(debounceSeconds - waited))} s nach der letzten Änderung.`,
    };
  }
  return {
    ...base,
    state: 'queued',
    label: 'Wartet auf den Cron-Job',
    detail:
      waited > 10 * 60
        ? 'Der Neubau hängt seit über 10 Minuten. Prüfe den Cron-Trigger und GITHUB_DISPATCH_TOKEN/GITHUB_REPOSITORY.'
        : 'Der nächste Cron-Lauf (jede Minute) löst den Build aus; das Deployment dauert danach etwa zwei Minuten.',
  };
}

/** Rollen-IDs für die Textarea (eine pro Zeile). */
export function idsToText(ids: readonly string[] | null | undefined): string {
  return (ids ?? []).join('\n');
}
