/**
 * Admin-Kern (Liga): reine Logik für Saisons, Kalender, Teams/Cockpits, Fahrer,
 * Nummern, Anmeldungen und Dashboard. Für andere Admin-Module wichtig:
 * `isSeasonFrozen` (abgeschlossene Saisons sind eingefroren) und `seasonFrozenForRound`.
 */
export { isSeasonFrozen, FROZEN_MESSAGE } from './season';
export { seasonFrozenForRound, seasonFrozenById } from './guards';
