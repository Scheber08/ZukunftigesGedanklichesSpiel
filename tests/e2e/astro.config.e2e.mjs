// @ts-check
/**
 * Astro-Konfiguration für den E2E-Build (playwright.config.ts): identisch mit astro.config.mjs,
 * nur mit eigenem Vite-Cache. Ein Build optimiert die Abhängigkeiten mit anderen Einstellungen
 * als der Dev-Server – im gemeinsamen Cache (node_modules/.vite) würde er die vorgebündelten
 * Module eines laufenden `npm run dev` austauschen und diesen aus dem Tritt bringen.
 */
import base from '../../astro.config.mjs';

export default {
  ...base,
  vite: { ...base.vite, cacheDir: 'node_modules/.vite-e2e' },
};
