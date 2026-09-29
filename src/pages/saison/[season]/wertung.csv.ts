/**
 * CSV-Export der Fahrerwertung einer Saison (Route 'standingsCsv', statisch):
 * UTF-8 mit BOM, Semikolon-getrennt – öffnet sich direkt in Excel (DE).
 */
import type { APIRoute, GetStaticPaths } from 'astro';
import { useT } from '~/i18n';
import { loadLeague } from '~/lib/server/league';
import { csvFileName, driverStandingsCsv } from '~/lib/standings/csv';
import { seasonStandingsPaths } from '~/lib/standings/page';

export const getStaticPaths = (async () => seasonStandingsPaths(await loadLeague())) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ params }) => {
  const league = await loadLeague();
  const season = league.seasonBySlug(params.season ?? '');
  if (!season) return new Response('Not found', { status: 404 });
  const body = driverStandingsCsv(league, season.id, useT('de'));
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${csvFileName(season.slug)}"`,
    },
  });
};
