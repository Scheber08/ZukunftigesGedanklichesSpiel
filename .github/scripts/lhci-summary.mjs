// =============================================================================
// CI (Job „Lighthouse-Budget“): verletzte Budgets lesbar machen.
// Liest .lighthouseci/assertion-results.json (von `lhci autorun`) und schreibt
//   - eine Tabelle in die Job-Zusammenfassung ($GITHUB_STEP_SUMMARY) und
//   - je Verstoß eine Warnung (::warning) – sichtbar in der Übersicht des Laufs, ohne das Log zu öffnen.
// Ohne Ergebnisdatei (LHCI ist vorher abgebrochen) gibt es einen Hinweis.
// =============================================================================
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

const FILE = '.lighthouseci/assertion-results.json';
const summary = process.env.GITHUB_STEP_SUMMARY;
const write = (text) => (summary ? appendFileSync(summary, `${text}\n`) : console.log(text));
const clean = (s) => String(s ?? '').replace(/[\r\n|]+/g, ' ').trim();
const num = (v) => (typeof v === 'number' ? (Math.abs(v) >= 100 ? String(Math.round(v)) : Number(v.toFixed(3)).toString()) : clean(v));

write('### Lighthouse-Budget');
write('');

if (!existsSync(FILE)) {
  write(`Keine Ergebnisse (\`${FILE}\` fehlt) – LHCI ist vor den Prüfungen abgebrochen, siehe Log des Schritts „Lighthouse CI“.`);
  console.log(`::warning title=Lighthouse::${FILE} fehlt – LHCI ist vor den Prüfungen abgebrochen`);
  process.exit(0);
}

/** @type {Array<{ url?: string, auditId?: string, auditProperty?: string, name?: string, operator?: string, expected?: unknown, actual?: unknown, level?: string, passed?: boolean }>} */
const results = JSON.parse(readFileSync(FILE, 'utf8'));
const failed = results.filter((r) => r.passed === false);

if (failed.length === 0) {
  write('Alle Budgets eingehalten.');
  process.exit(0);
}

write('| Seite | Prüfung | Messwert | Grenze | Stufe |');
write('|---|---|---:|---:|---|');
for (const r of failed) {
  const page = r.url ? new URL(r.url).pathname : '–';
  const audit = [r.auditId, r.auditProperty].filter(Boolean).join(':') || r.name || '–';
  const limit = `${clean(r.operator)} ${num(r.expected)}`;
  write(`| ${clean(page)} | ${clean(audit)} | ${num(r.actual)} | ${limit} | ${clean(r.level)} |`);
  const level = r.level === 'error' ? 'warning' : 'notice';
  console.log(`::${level} title=Lighthouse ${clean(audit)}::${clean(page)}: ${num(r.actual)} (Grenze ${limit})`);
}
