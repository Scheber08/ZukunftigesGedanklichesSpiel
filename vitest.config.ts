import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const src = fileURLToPath(new URL('./src', import.meta.url));
// Astros virtuelles Modul `astro:env/*` gibt es nur im Astro-Build – für Unit-Tests ersetzt
// durch einen Mock, der process.env liest und per setMockEnv() änderbar ist.
const astroEnvMock = fileURLToPath(new URL('./tests/mocks/astro-env.ts', import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^~\//, replacement: `${src}/` },
      { find: /^astro:env\/(server|client)$/, replacement: astroEnvMock },
    ],
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    // Server-Module (Spam-Schutz, Discord, Rebuild) werden gegen den Mock getestet;
    // der Demo-Modus ist der Standard, damit nie versehentlich Supabase angesprochen wird.
    env: { DEMO_MODE: 'true' },
    // Dateisystem-Scans (Leitplanken-Tests) brauchen unter Last mehr als die Standard-5-s
    testTimeout: 30_000,
    restoreMocks: true,
    unstubGlobals: true,
  },
});
