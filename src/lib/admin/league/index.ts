/**
 * Admin-Kern (Liga): reine Logik für Saisons, Kalender, Teams/Cockpits, Fahrer,
 * Nummern, Anmeldungen und Dashboard. Für andere Admin-Module wichtig:
 * `isSeasonFrozen` (abgeschlossene Saisons sind eingefroren) und `seasonFrozenForRound`,
 * reservierte Slugs fester Unterseiten (`isReservedSlug`) sowie Einstellungen mit
 * Patch-Semantik (`applySettingPatch`: nur übermittelte Unterschlüssel ändern sich).
 */
export { isSeasonFrozen, FROZEN_MESSAGE } from './season';
export { seasonFrozenForRound, seasonFrozenById } from './guards';
export { isReservedSlug, RESERVED_DRIVER_SLUGS, RESERVED_TEAM_SLUGS } from './slugs';
export { applySettingPatch, mergeSettingPatch } from './settings-patch';
