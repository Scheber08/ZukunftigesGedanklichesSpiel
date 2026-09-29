/**
 * Zugriff auf die Datenquelle:
 * - `getPublicStore()`  – nur öffentliche Daten (anon key + RLS). Für den statischen Build.
 * - `getServiceStore()` – voller Zugriff (Service-Key). NUR nach Rollenprüfung bzw. in
 *                         Formular-Actions mit Spam-Schutz verwenden.
 * Im Demo-Modus liefern beide denselben In-Memory-Store.
 */

import { MemoryStore } from '../db/memory-store';
import type { Store } from '../db/store';
import { SupabaseStore } from '../db/supabase-store';
import { demoDataset } from '../seed/demo';
import { env, isDemoMode } from './env';

declare global {
  // Überlebt Hot-Reloads im Dev-Server
  var __ligaMemoryStore: MemoryStore | undefined;
}

export function getMemoryStore(): MemoryStore {
  globalThis.__ligaMemoryStore ??= new MemoryStore(demoDataset());
  return globalThis.__ligaMemoryStore;
}

let publicStore: SupabaseStore | undefined;
let serviceStore: SupabaseStore | undefined;

export function getPublicStore(): Store {
  if (isDemoMode()) return getMemoryStore();
  if (!env.supabaseAnonKey) throw new Error('SUPABASE_ANON_KEY fehlt');
  publicStore ??= new SupabaseStore(env.supabaseUrl!, env.supabaseAnonKey);
  return publicStore;
}

export function getServiceStore(): Store {
  if (isDemoMode()) return getMemoryStore();
  if (!env.supabaseServiceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY fehlt');
  serviceStore ??= new SupabaseStore(env.supabaseUrl!, env.supabaseServiceKey);
  return serviceStore;
}

/** Schreibversion des Demo-Stores (für Cache-Invalidierung), in Produktion konstant. */
export function storeVersion(): number {
  return isDemoMode() ? getMemoryStore().version : 0;
}
