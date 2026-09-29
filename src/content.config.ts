/**
 * Content Collections: statische Rechtstexte (Plan §9.2) als Markdown mit Frontmatter.
 * Dateien: src/content/legal/<de|en>/<slug>.md → IDs wie "de/impressum" oder "en/imprint".
 */
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const legal = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/legal' }),
  schema: z.object({
    title: z.string().min(1),
    description: z.string().min(1),
    /** Stand des Textes (YYYY-MM-DD) */
    updated: z.coerce.date(),
    /** Entwurf: Hinweis-Banner und noindex */
    draft: z.boolean().default(false),
  }),
});

export const collections = { legal };
