/**
 * Gezielte Store-Abfragen für die Admin-Seiten des Inhalte-Bereichs (kein loadLeague() im Worker).
 * Nur serverseitig verwenden.
 */
import type { Store } from '~/lib/db/store';
import type { RoundRow, SeasonRow, TrackRow } from '~/lib/db/types';
import { formatDate } from '~/lib/domain/time';
import { readPrivateSettings } from '~/lib/server/settings';
import { roundLabel, seasonLabel } from '~/lib/view';

export interface RoundOption {
  id: number;
  label: string;
}

export interface RoundGroup {
  label: string;
  rounds: RoundOption[];
}

/** Runden aller Saisons für die Auswahl „verknüpftes Rennen“ (neueste Saison zuerst). */
export async function loadRoundGroups(store: Store): Promise<RoundGroup[]> {
  const [seasons, rounds, tracks] = await Promise.all([store.select('seasons'), store.select('rounds'), store.select('tracks')]);
  return groupRounds(seasons, rounds, tracks);
}

export function groupRounds(seasons: SeasonRow[], rounds: RoundRow[], tracks: TrackRow[]): RoundGroup[] {
  const trackById = new Map(tracks.map((t) => [t.id, t]));
  return [...seasons]
    .sort((a, b) => b.number - a.number)
    .map((season) => ({
      label: seasonLabel(season, 'de'),
      rounds: rounds
        .filter((r) => r.season_id === season.id)
        .sort((a, b) => a.number - b.number)
        .map((r) => ({
          id: r.id,
          label: `${roundLabel(r, trackById.get(r.track_id), 'de')} (${formatDate(r.start_utc, 'de')}${r.status === 'cancelled' ? ', abgesagt' : ''})`,
        })),
    }))
    .filter((g) => g.rounds.length > 0);
}

/** Label einer Runde für Listen (z. B. „R3 · Sakhir“). */
export async function loadRoundLabels(store: Store): Promise<Map<number, string>> {
  const [rounds, tracks] = await Promise.all([store.select('rounds'), store.select('tracks')]);
  const trackById = new Map(tracks.map((t) => [t.id, t]));
  return new Map(rounds.map((r) => [r.id, roundLabel(r, trackById.get(r.track_id), 'de')]));
}

/** Ist ein Discord-Webhook für #news hinterlegt? */
export async function newsWebhookConfigured(store: Store): Promise<boolean> {
  try {
    const settings = await readPrivateSettings(store);
    return Boolean(settings.webhooks.news);
  } catch {
    return false;
  }
}
