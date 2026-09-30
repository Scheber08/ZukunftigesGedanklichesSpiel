/**
 * Alle Astro Actions. Öffentliche Formulare direkt, Admin-Aktionen unter `admin.*`
 * (die Middleware setzt dafür `locals.staff`, jede Action prüft die Rolle selbst).
 */
import { contentActions } from './admin/content';
import { extrasActions } from './admin/extras';
import { graphicsActions } from './admin/graphics';
import { importActions } from './admin/import';
import { leagueActions } from './admin/league';
import { racedayActions } from './admin/raceday';
import { publicActions } from './public';

export const server = {
  ...publicActions,
  admin: {
    ...leagueActions,
    ...racedayActions,
    ...contentActions,
    ...importActions,
    ...graphicsActions,
    ...extrasActions,
  },
};
