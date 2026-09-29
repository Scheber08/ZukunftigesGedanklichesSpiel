/**
 * Anmeldungs-Eingang im Admin (Plan §5 „Anmeldungen“, §6.7 Aufbewahrung).
 * Reine Funktionen: Filter, Sortierung, Zähler, Löschfrist, erlaubte Status.
 */
import { REGISTRATION_STATUSES, type RegistrationRow, type RegistrationStatus } from '~/lib/db/types';
import { gamertagKey } from '~/lib/domain/text';

export interface RegistrationFilter {
  status: RegistrationStatus | null;
  q: string;
}

export function parseRegistrationFilter(params: URLSearchParams): RegistrationFilter {
  const s = params.get('status') ?? '';
  return {
    status: (REGISTRATION_STATUSES as readonly string[]).includes(s) ? (s as RegistrationStatus) : null,
    q: (params.get('q') ?? '').trim().slice(0, 100),
  };
}

/** Reihenfolge im Eingang: neu → kontaktiert → Warteliste → angenommen → abgelehnt. */
const STATUS_ORDER: Record<RegistrationStatus, number> = { new: 0, contacted: 1, waitlist: 2, accepted: 3, rejected: 4 };

type FilterRow = Pick<RegistrationRow, 'id' | 'gamertag' | 'discord_username' | 'ea_id' | 'status' | 'created_at' | 'desired_number'>;

/**
 * Filtern und sortieren: offene Status zuerst, innerhalb eines Status die ältesten
 * zuerst (wer am längsten wartet, kommt zuerst dran); bei gefiltertem Status ebenso.
 */
export function filterRegistrations<T extends FilterRow>(rows: readonly T[], filter: RegistrationFilter): T[] {
  const key = gamertagKey(filter.q);
  return rows
    .filter((r) => !filter.status || r.status === filter.status)
    .filter((r) => {
      if (!key) return true;
      return [r.gamertag, r.discord_username ?? '', r.ea_id ?? '', String(r.desired_number)].some((h) => gamertagKey(h).includes(key));
    })
    .sort((a, b) => {
      const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      if (byStatus !== 0) return byStatus;
      // abgeschlossene (angenommen/abgelehnt): neueste zuerst
      const closed = a.status === 'accepted' || a.status === 'rejected';
      return (closed ? -1 : 1) * a.created_at.localeCompare(b.created_at) || a.id - b.id;
    });
}

export function registrationCounts(rows: ReadonlyArray<Pick<RegistrationRow, 'status'>>): Record<RegistrationStatus, number> {
  const out = Object.fromEntries(REGISTRATION_STATUSES.map((s) => [s, 0])) as Record<RegistrationStatus, number>;
  for (const r of rows) out[r.status] += 1;
  return out;
}

/** Abgelehnte Anmeldungen werden nach 6 Monaten gelöscht (run_retention, Plan §6.7). */
export const REJECTED_RETENTION_MONTHS = 6;

/** Datum, ab dem eine abgelehnte Anmeldung automatisch gelöscht wird (sonst null). */
export function retentionDate(reg: Pick<RegistrationRow, 'status' | 'processed_at' | 'created_at'>): Date | null {
  if (reg.status !== 'rejected') return null;
  const base = new Date(reg.processed_at ?? reg.created_at);
  const d = new Date(base.getTime());
  d.setUTCMonth(d.getUTCMonth() + REJECTED_RETENTION_MONTHS);
  return d;
}

/**
 * Status, die sich im Formular wählen lassen. „Angenommen“ geht nur über
 * „Annehmen & Fahrer anlegen“ – außer die Anmeldung ist schon mit einem Fahrer verknüpft.
 */
export function selectableStatuses(reg: Pick<RegistrationRow, 'driver_id'>): RegistrationStatus[] {
  return REGISTRATION_STATUSES.filter((s) => s !== 'accepted' || reg.driver_id != null);
}
