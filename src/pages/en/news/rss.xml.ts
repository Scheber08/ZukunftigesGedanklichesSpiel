/** RSS feed of the news (EN), statically generated at build time. */
import type { APIRoute } from 'astro';
import { newsFeedResponse } from '~/lib/content/feed';

export const GET: APIRoute = ({ site, url }) => newsFeedResponse('en', site, url);
