/**
 * Upload-Format des Telemetrie-Companions (`liga-telemetry/1`, tools/telemetry/collector.mjs)
 * und seine Prüfung mit zod. Unbekannte Felder werden verworfen – gespeichert wird nur,
 * was hier beschrieben ist (import_batches.raw).
 */
import { z } from 'astro/zod';
import { SESSION_TYPES } from '../db/types';

export const TELEMETRY_FORMAT = 'liga-telemetry/1';
/** Größenlimit des Uploads (Bytes) */
export const MAX_IMPORT_BYTES = 512 * 1024;

const int = (min: number, max: number) => z.number().int().min(min).max(max);

/** Steuerzeichen raus, Länge begrenzen (Namen kommen ungeprüft aus dem Spiel). */
function cleanName(value: string): string {
  let out = '';
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 32 && code !== 127) out += ch;
  }
  return out.trim().slice(0, 48);
}

export const telemetryResultSchema = z.object({
  carIndex: int(0, 39),
  position: int(0, 40),
  raceNumber: int(0, 255).nullable(),
  name: z.string().max(200).transform(cleanName).nullable(),
  teamId: int(0, 255).nullish(),
  aiControlled: z.boolean(),
  platform: int(0, 255).nullish(),
  resultStatus: int(0, 20),
  resultReason: int(0, 50).nullish(),
  gridPosition: int(0, 40).nullish(),
  numLaps: int(0, 255).nullish(),
  bestLapMs: int(0, 3_600_000).nullish(),
  totalRaceTimeMs: int(0, 86_400_000).nullish(),
  penaltiesS: int(0, 255).nullish(),
  numPenalties: int(0, 255).nullish(),
  numPitStops: int(0, 50).nullish(),
});

export const telemetryPayloadSchema = z.object({
  format: z.literal(TELEMETRY_FORMAT),
  companion: z.string().max(40).optional(),
  createdAt: z.string().max(40).optional(),
  game: z.object({
    packetFormat: int(2000, 2100),
    gameYear: int(0, 255).optional(),
    version: z.string().max(20).optional(),
  }),
  sessionUid: z.string().regex(/^\d{1,20}$/, 'sessionUid muss eine Zahl sein'),
  session: z
    .object({
      gameSessionType: int(0, 255),
      trackId: int(-1, 255),
      totalLaps: int(0, 255).nullish(),
      networkGame: int(0, 255).nullish(),
    })
    .nullable(),
  target: z
    .object({
      roundId: z.number().int().positive().optional(),
      sessionType: z.enum(SESSION_TYPES).optional(),
    })
    .optional(),
  warnings: z.array(z.string().max(300)).max(20).optional(),
  results: z.array(telemetryResultSchema).min(1, 'Das Endergebnis ist leer').max(40),
});

export type TelemetryPayload = z.infer<typeof telemetryPayloadSchema>;
export type TelemetryResult = z.infer<typeof telemetryResultSchema>;

/** Prüfmeldungen verständlich zusammenfassen (höchstens 8). */
export function describeZodIssues(error: z.ZodError): string[] {
  return error.issues.slice(0, 8).map((i) => `${i.path.join('.') || 'Daten'}: ${i.message}`);
}
