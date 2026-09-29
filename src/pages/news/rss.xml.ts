/** RSS-Feed der News (DE), statisch beim Build erzeugt. */
import type { APIRoute } from 'astro';
import { newsFeedResponse } from '~/lib/content/feed';

export const GET: APIRoute = ({ site, url }) => newsFeedResponse('de', site, url);
