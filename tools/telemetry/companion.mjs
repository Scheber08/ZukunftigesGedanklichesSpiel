#!/usr/bin/env node
// @ts-check
/**
 * Liga-Telemetrie-Companion (Plan Phase 2 „Telemetrie-Import (UDP)“, §7.3).
 *
 * Läuft auf einem PC in der Lobby (Host oder Zuschauer), lauscht auf die UDP-Telemetrie von
 * EA SPORTS F1® 25 und lädt nach jeder Session das Endergebnis als ENTWURF auf die Website
 * (`POST <site>/api/import`). Vor dem Upload wird es als JSON im Ordner ./telemetrie-export
 * gesichert. Node.js ≥ 22, keine Abhängigkeiten.
 *
 * Anleitung, Spiel-Einstellungen und Feldtest: docs/TELEMETRIE.md
 */
import dgram from 'node:dgram';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { COMPANION_VERSION, createCollector, describePayload, exportFileName, PARTICIPANTS_WAIT_MS } from './collector.mjs';
import { sessionKind } from './f1-packets.mjs';
import { sampleSession } from './fixtures.mjs';
import { encodeRecording, parseRecording, recordingHeaderLine, recordingLine } from './recording.mjs';

/** @typedef {import('./collector.mjs').ExportPayload} ExportPayload */

const HELP = `Liga-Telemetrie-Companion ${COMPANION_VERSION} – F1 25-Endergebnisse als Entwurf auf die Website laden

Aufruf:
  node tools/telemetry/companion.mjs [Optionen]

Optionen:
  --url <adresse>      Website, z. B. https://liga.example (oder Umgebungsvariable LIGA_SITE_URL)
  --token <token>      Import-Token aus /admin/runden/<id>/import
                       (besser: Umgebungsvariable LIGA_IMPORT_TOKEN – taucht dann nicht in der Prozessliste auf)
  --port <n>           UDP-Port wie im Spiel eingestellt (Standard 20777)
  --bind <adresse>     Lausch-Adresse (Standard 0.0.0.0 = alle Netzwerkkarten)
  --out <ordner>       Ordner für die Sicherungen (Standard ./telemetrie-export)
  --round <id>         Runde fest vorgeben (sonst automatisch: Strecke + Termin ±36 h)
  --session <typ>      Session fest vorgeben: qualifying | sprint | race
                       (nötig z. B. bei Sprint-Runden, wenn Sprint und Rennen im Spiel gleich heißen)
  --dry-run            nichts hochladen, nur lokal sichern
  --record <datei>     rohe UDP-Pakete zusätzlich mitschneiden (für Feldtest/Fehlersuche)
  --replay <datei>     Mitschnitt abspielen statt auf UDP zu lauschen (Test ohne Spiel)
  --speed <faktor>     Abspieltempo bei --replay (1 = Echtzeit, Standard 0 = so schnell wie möglich)
  --upload <datei>     gesicherten Export (JSON) erneut hochladen, z. B. nach einem Netzwerkfehler
  --sample <datei>     Beispiel-Mitschnitt erzeugen (passt zur Demo-Runde 5 in Montreal)
  --verbose            mehr Ausgaben
  --help, --version

Beispiele:
  LIGA_IMPORT_TOKEN=… node tools/telemetry/companion.mjs --url https://liga.example
  node tools/telemetry/companion.mjs --dry-run --record feldtest.ndjson
  node tools/telemetry/companion.mjs --sample beispiel.ndjson
  node tools/telemetry/companion.mjs --replay beispiel.ndjson --url http://localhost:4321 --token …
  node tools/telemetry/companion.mjs --upload telemetrie-export/2026-10-01T20-45-12_rennen_montreal_6789.json --session sprint

Datenschutz: Übertragen werden nur Renndaten (Positionen, Zeiten, Startnummern, Namen im Spiel, Team, KI-Flag, Plattform).`;

/** @param {string} text */
function log(text) {
  const time = new Date().toLocaleTimeString('de-DE', { hour12: false });
  for (const line of text.split('\n')) console.log(`[${time}] ${line}`);
}

/** @param {string} text */
function fail(text) {
  console.error(`Fehler: ${text}`);
}

/**
 * @typedef {object} Options
 * @property {number} port
 * @property {string} bind
 * @property {string | null} url
 * @property {string | null} token
 * @property {string} out
 * @property {number | undefined} round
 * @property {'qualifying' | 'sprint' | 'race' | undefined} session
 * @property {boolean} dryRun
 * @property {string | undefined} record
 * @property {string | undefined} replay
 * @property {number} speed
 * @property {string | undefined} upload
 * @property {string | undefined} sample
 * @property {boolean} verbose
 */

/**
 * @param {string[]} argv
 * @returns {Options | 'help' | 'version'}
 */
export function parseOptions(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      port: { type: 'string' },
      bind: { type: 'string' },
      url: { type: 'string' },
      token: { type: 'string' },
      out: { type: 'string' },
      round: { type: 'string' },
      session: { type: 'string' },
      'dry-run': { type: 'boolean' },
      record: { type: 'string' },
      replay: { type: 'string' },
      speed: { type: 'string' },
      upload: { type: 'string' },
      sample: { type: 'string' },
      verbose: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
    strict: true,
    allowPositionals: false,
  });
  if (values.help) return 'help';
  if (values.version) return 'version';
  const port = values.port != null ? Number(values.port) : 20777;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('--port muss eine Zahl von 1 bis 65535 sein.');
  const round = values.round != null ? Number(values.round) : undefined;
  if (round !== undefined && (!Number.isInteger(round) || round < 1)) throw new Error('--round muss eine positive Zahl (Runden-ID aus dem Admin) sein.');
  const session = values.session;
  if (session !== undefined && session !== 'qualifying' && session !== 'sprint' && session !== 'race') {
    throw new Error('--session muss qualifying, sprint oder race sein.');
  }
  const speed = values.speed != null ? Number(values.speed) : 0;
  if (!Number.isFinite(speed) || speed < 0) throw new Error('--speed muss eine Zahl ≥ 0 sein.');
  const url = (values.url ?? process.env.LIGA_SITE_URL ?? '').trim() || null;
  if (url) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`--url ist keine gültige Adresse: ${url}`);
    }
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && local)) {
      throw new Error('--url muss mit https:// beginnen (http:// nur für localhost), damit das Token verschlüsselt übertragen wird.');
    }
  }
  return {
    port,
    bind: values.bind ?? '0.0.0.0',
    url,
    token: (values.token ?? process.env.LIGA_IMPORT_TOKEN ?? '').trim() || null,
    out: values.out ?? 'telemetrie-export',
    round,
    session,
    dryRun: values['dry-run'] ?? false,
    record: values.record,
    replay: values.replay,
    speed,
    upload: values.upload,
    sample: values.sample,
    verbose: values.verbose ?? false,
  };
}

/**
 * @typedef {{ ok: true, status: number, data: { batchId?: number, reviewUrl?: string, message?: string } }
 *   | { ok: false, status: number | null, message: string, details: string[] }} UploadResult
 */

const sleep = (/** @type {number} */ ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Export hochladen (bis zu 3 Versuche bei Netzwerk- und Serverfehlern).
 * @param {ExportPayload} payload
 * @param {{ url: string, token: string }} target
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<UploadResult>}
 */
export async function upload(payload, target, fetchImpl = fetch) {
  const endpoint = new URL('/api/import', target.url).href;
  /** @type {UploadResult} */
  let last = { ok: false, status: null, message: 'Keine Antwort', details: [] };
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${target.token}`,
          'user-agent': `liga-telemetry-companion/${COMPANION_VERSION}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20_000),
      });
      const text = await res.text();
      /** @type {any} */
      let data = null;
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
      if (res.status === 201 || res.status === 200) return { ok: true, status: res.status, data: data ?? {} };
      last = {
        ok: false,
        status: res.status,
        message: typeof data?.error === 'string' ? data.error : text.slice(0, 300) || res.statusText,
        details: Array.isArray(data?.details) ? data.details.map(String) : [],
      };
      if (res.status < 500 && res.status !== 429) return last;
    } catch (err) {
      last = { ok: false, status: null, message: err instanceof Error ? err.message : String(err), details: [] };
    }
    if (attempt < 3) await sleep(attempt * 2_000);
  }
  return last;
}

/**
 * @param {UploadResult} res
 * @param {string} file
 */
function reportUpload(res, file) {
  if (res.ok) {
    log(`Hochgeladen: Import-Stapel #${res.data.batchId ?? '?'} (Entwurf).`);
    if (res.data.reviewUrl) log(`Prüfen und übernehmen: ${res.data.reviewUrl}`);
    return;
  }
  const hint =
    res.status === 401
      ? ' – Token falsch oder widerrufen. Im Admin unter „Import“ ein neues Token erzeugen.'
      : res.status === 503
        ? ' – auf der Website ist noch kein Import-Token eingerichtet.'
        : res.status === 422
          ? ''
          : res.status == null
            ? ' – Website nicht erreichbar.'
            : '';
  fail(`Upload fehlgeschlagen (${res.status ?? 'Netzwerk'}): ${res.message}${hint}`);
  for (const d of res.details) console.error(`  · ${d}`);
  console.error(`  Die Sicherung liegt in ${file}. Erneut senden mit: --upload "${file}" (ggf. mit --round/--session)`);
}

/**
 * @param {Options} opts
 */
function targetOf(opts) {
  /** @type {ExportPayload['target']} */
  const target = {};
  if (opts.round !== undefined) target.roundId = opts.round;
  if (opts.session !== undefined) target.sessionType = opts.session;
  return target;
}

/**
 * @param {ExportPayload} payload
 * @param {Options} opts
 * @returns {Promise<void>}
 */
async function handleFinal(payload, opts) {
  log(describePayload(payload));
  await mkdir(opts.out, { recursive: true });
  const file = path.join(opts.out, exportFileName(payload));
  await writeFile(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  log(`Gesichert: ${file}`);
  const kind = payload.session ? sessionKind(payload.session.gameSessionType) : 'unknown';
  if (kind === 'practice' || kind === 'time_trial') {
    log('Training/Zeitfahren – wird nicht hochgeladen.');
    return;
  }
  if (opts.dryRun) {
    log('--dry-run: nicht hochgeladen.');
    return;
  }
  if (!opts.url || !opts.token) {
    log('Nicht hochgeladen: --url und Token (LIGA_IMPORT_TOKEN) fehlen.');
    return;
  }
  reportUpload(await upload(payload, { url: opts.url, token: opts.token }), file);
}

/**
 * @param {Options} opts
 */
async function runUpload(opts) {
  if (!opts.upload) return 1;
  if (!opts.url || !opts.token) {
    fail('Für --upload werden --url und ein Token (--token oder LIGA_IMPORT_TOKEN) gebraucht.');
    return 2;
  }
  /** @type {ExportPayload} */
  let payload;
  try {
    payload = JSON.parse(await readFile(opts.upload, 'utf8'));
  } catch (err) {
    fail(`Datei ${opts.upload} lässt sich nicht lesen: ${err instanceof Error ? err.message : err}`);
    return 1;
  }
  const target = targetOf(opts);
  if (Object.keys(target).length > 0) payload.target = { ...payload.target, ...target };
  log(describePayload(payload));
  const res = await upload(payload, { url: opts.url, token: opts.token });
  reportUpload(res, opts.upload);
  return res.ok ? 0 : 1;
}

/**
 * Ereignisse des Sammlers verarbeiten; Uploads laufen nacheinander.
 * @param {Options} opts
 */
function eventHandler(opts) {
  let chain = Promise.resolve();
  /** @param {import('./collector.mjs').CollectorEvent[]} events */
  const onEvents = (events) => {
    for (const e of events) {
      if (e.type === 'session') log(`Session erkannt: ${e.text}`);
      else if (e.type === 'error') fail(e.message);
      else {
        const payload = e.payload;
        chain = chain.then(() => handleFinal(payload, opts)).catch((err) => fail(err instanceof Error ? err.message : String(err)));
      }
    }
  };
  return { onEvents, done: () => chain };
}

/**
 * @param {Options} opts
 */
async function runReplay(opts) {
  if (!opts.replay) return 1;
  const { packets, skipped } = parseRecording(await readFile(opts.replay, 'utf8'));
  log(`Spiele ${packets.length} Pakete aus ${opts.replay} ab${skipped > 0 ? ` (${skipped} kaputte Zeilen übersprungen)` : ''} …`);
  const collector = createCollector({ target: targetOf(opts) });
  const { onEvents, done } = eventHandler(opts);
  const start = Date.now();
  let previous = 0;
  for (const p of packets) {
    if (opts.speed > 0 && p.t > previous) await sleep((p.t - previous) / opts.speed);
    previous = p.t;
    onEvents(collector.handle(p.buf, start + p.t));
  }
  onEvents(collector.tick(start + previous + PARTICIPANTS_WAIT_MS));
  await done();
  log('Mitschnitt fertig abgespielt.');
  return 0;
}

/**
 * @param {Options} opts
 */
async function runSample(opts) {
  if (!opts.sample) return 1;
  await writeFile(opts.sample, encodeRecording(sampleSession()), 'utf8');
  log(`Beispiel-Mitschnitt geschrieben: ${opts.sample} (Rennen in Montreal, 21 Fahrer + 1 KI-Auto, UDP-Format 2025)`);
  log(`Abspielen: node tools/telemetry/companion.mjs --replay ${opts.sample} --dry-run`);
  return 0;
}

/**
 * @param {Options} opts
 */
function runLive(opts) {
  return new Promise((resolve) => {
    const collector = createCollector({ target: targetOf(opts) });
    const { onEvents, done } = eventHandler(opts);
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    const recordStream = opts.record ? createWriteStream(opts.record, { flags: 'a' }) : null;
    const startedAt = Date.now();
    if (recordStream) recordStream.write(recordingHeaderLine(new Date(startedAt)));
    let packets = 0;
    let firstFormat = /** @type {number | null} */ (null);

    socket.on('message', (msg) => {
      const now = Date.now();
      packets++;
      const buf = new Uint8Array(msg.buffer, msg.byteOffset, msg.byteLength);
      if (recordStream) recordStream.write(recordingLine(buf, now - startedAt));
      if (firstFormat == null && buf.byteLength >= 2) {
        firstFormat = (buf[0] ?? 0) | ((buf[1] ?? 0) << 8);
        log(`Erste Pakete empfangen (UDP-Format ${firstFormat}).`);
      }
      onEvents(collector.handle(buf, now));
    });
    socket.on('error', (err) => {
      fail(`UDP-Socket: ${err.message}${/EADDRINUSE/.test(err.message) ? ' – der Port ist belegt (läuft ein anderes Telemetrie-Programm?).' : ''}`);
      socket.close();
    });
    socket.bind(opts.port, opts.bind, () => {
      log(`Lausche auf UDP ${opts.bind}:${opts.port} … (Strg+C beendet)`);
      if (opts.dryRun) log('--dry-run: Ergebnisse werden nur lokal gesichert.');
      else if (opts.url && opts.token) log(`Upload an ${new URL('/api/import', opts.url).href}`);
      else log('Kein Upload eingerichtet (--url/LIGA_IMPORT_TOKEN fehlen) – Ergebnisse werden nur lokal gesichert.');
      if (recordStream) log(`Mitschnitt: ${opts.record}`);
    });

    const ticker = setInterval(() => onEvents(collector.tick(Date.now())), 1_000);
    const silence = setTimeout(() => {
      if (packets === 0) {
        log('Seit 30 s keine Pakete. Prüfen: Telemetrie im Spiel an? IP-Adresse dieses PCs und Port richtig? Firewall erlaubt UDP?');
      }
    }, 30_000);
    let verboseTimer = opts.verbose ? setInterval(() => log(`${packets} Pakete empfangen`), 10_000) : null;

    let stopping = false;
    const stop = async () => {
      if (stopping) return;
      stopping = true;
      clearInterval(ticker);
      clearTimeout(silence);
      if (verboseTimer) clearInterval(verboseTimer);
      verboseTimer = null;
      if (collector.hasPending()) onEvents(collector.tick(Date.now() + PARTICIPANTS_WAIT_MS));
      try {
        socket.close();
      } catch {
        // schon geschlossen
      }
      await done();
      if (recordStream) await new Promise((r) => recordStream.end(r));
      log(`Beendet (${packets} Pakete).`);
      resolve(0);
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
    socket.on('close', () => void stop());
  });
}

/**
 * @param {string[]} argv
 * @returns {Promise<number>}
 */
export async function main(argv) {
  /** @type {Options | 'help' | 'version'} */
  let opts;
  try {
    opts = parseOptions(argv);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
    console.error('Hilfe: node tools/telemetry/companion.mjs --help');
    return 2;
  }
  if (opts === 'help') {
    console.log(HELP);
    return 0;
  }
  if (opts === 'version') {
    console.log(COMPANION_VERSION);
    return 0;
  }
  const [major] = process.versions.node.split('.').map(Number);
  if ((major ?? 0) < 22) {
    fail(`Node.js 22 oder neuer nötig (gefunden: ${process.versions.node}).`);
    return 1;
  }
  if (opts.sample) return runSample(opts);
  if (opts.upload) return runUpload(opts);
  if (opts.url && !opts.token && !opts.dryRun) {
    fail('Token fehlt: --token <token> oder Umgebungsvariable LIGA_IMPORT_TOKEN setzen (oder --dry-run).');
    return 2;
  }
  if (opts.replay) return runReplay(opts);
  return runLive(opts);
}

// Direkt aufgerufen (nicht beim Import in Tests)
const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invoked === import.meta.url) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (err) => {
      fail(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    },
  );
}
