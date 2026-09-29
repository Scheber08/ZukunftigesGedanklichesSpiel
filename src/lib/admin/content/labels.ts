/**
 * Deutsche Beschriftungen für die Admin-Oberfläche des Inhalte-Bereichs (Admin ist nur Deutsch).
 */
import type { FaqCategory } from '~/lib/db/types';
import type { RegistrationState } from '~/lib/settings';

export const FAQ_CATEGORY_LABELS: Record<FaqCategory, string> = {
  general: 'Allgemein',
  requirements: 'Voraussetzungen',
  raceday: 'Renntag',
  technical: 'Technik',
  stewards: 'Stewards & Strafen',
};

export const REGISTRATION_STATE_LABELS: Record<RegistrationState, string> = {
  open: 'Offen – Anmeldungen willkommen',
  waitlist: 'Warteliste – Anmeldung möglich, aber kein Stammcockpit frei',
  closed: 'Geschlossen – keine Anmeldungen',
};
