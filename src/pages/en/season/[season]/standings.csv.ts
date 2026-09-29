/**
 * CSV-Export der Fahrerwertung einer Saison mit englischen Spaltenköpfen (statisch):
 * UTF-8 mit BOM, Semikolon-getrennt – wie die deutsche Datei unter /saison/[saison]/wertung.csv.
 */
import type { APIRoute, GetStaticPaths } from 'astro';
import { loadLeague } from '~/lib/server/league';
import { csvResponse } from '~/lib/standings/csv';
import { seasonStandingsPaths } from '~/lib/standings/page';

export const getStaticPaths = (async () => seasonStandingsPaths(await loadLeague())) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ params }) => csvResponse(await loadLeague(), params.season ?? '', 'en');
