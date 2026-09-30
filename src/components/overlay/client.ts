/**
 * Browser-Skript der OBS-Overlays: rendert die Daten aus #overlay-config und fragt danach
 * regelmäßig /api/overlay/<name>.json ab. Neu gezeichnet wird nur bei geänderten Daten
 * (kein Flackern, das Laufband läuft weiter). Bei Fehlern bleibt der letzte Stand stehen,
 * ein kleiner Punkt zeigt die Störung, die Abstände werden länger.
 * DOM nur über textContent/createElement (keine HTML-Strings aus Daten).
 */
import { countdownParts, nextPollDelay, pad2, tickerSeconds } from './params';
import type { LineupPayload, NextRacePayload, OverlayConfig, OverlayLine, OverlayPayload, ResultPayload, StandingsPayload, TickerPayload } from './types';

type Child = Node | string | null | undefined | false;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, ...children: Child[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const child of children) {
    if (child == null || child === false) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Stoppuhr-Symbol für die schnellste Runde (Farbe nie alleiniger Informationsträger). */
function stopwatch(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2.5');
  svg.setAttribute('aria-hidden', 'true');
  for (const [tag, attrs] of [
    ['circle', { cx: '12', cy: '14', r: '8' }],
    ['path', { d: 'M12 10v4l2 2M10 2h4' }],
  ] as const) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    svg.append(node);
  }
  return svg;
}

function stripe(color: string | null): HTMLElement {
  const s = el('span', 'ov-stripe');
  if (color && /^#[0-9a-f]{3,8}$/i.test(color)) s.style.setProperty('--team-color', color);
  return s;
}

export function startOverlay(): void {
  const root = document.getElementById('overlay-root');
  const cfgNode = document.getElementById('overlay-config');
  if (!root || !cfgNode) return;
  let cfg: OverlayConfig;
  try {
    cfg = JSON.parse(cfgNode.textContent ?? '') as OverlayConfig;
  } catch {
    return;
  }
  const L = cfg.labels;
  let data: OverlayPayload | null = cfg.initial;
  let signature = '';
  let failures = 0;
  let countdownTimer: number | undefined;

  const sig = (p: OverlayPayload | null) => (p ? JSON.stringify({ ...p, generatedAt: '' }) : '');

  function panel(...children: Child[]): HTMLElement {
    const p = el('section', 'ov-panel', ...children);
    if (failures > 0) p.append(el('span', 'ov-stale-dot'));
    if (failures > 0) p.title = L.stale;
    return p;
  }

  // ------------------------------------------------------------ Nächstes Rennen
  function renderNext(p: NextRacePayload): HTMLElement {
    const r = p.round;
    if (!r) return panel(el('div', 'ov-head', el('p', 'ov-eyebrow', L.nextRace)), el('p', 'ov-empty', L.noRace));
    const sub = [r.countryName, r.dateText, r.formatText].filter(Boolean).join(' · ');
    const counter = el('div', 'ov-countdown');
    const live = el('p', 'ov-live', el('span', 'ov-live-dot'), L.live);
    const units = [L.days, L.hours, L.minutes, L.seconds].map((label) => {
      const value = el('span', 'ov-unit-value', '––');
      counter.append(el('div', 'ov-unit', value, el('span', 'ov-unit-label', label)));
      return value;
    });
    const target = new Date(r.startUtc).getTime();
    const tick = () => {
      const parts = countdownParts(target, Date.now());
      counter.hidden = parts == null;
      live.hidden = parts != null;
      if (parts) {
        const values = [String(parts.days), pad2(parts.hours), pad2(parts.minutes), pad2(parts.seconds)];
        units.forEach((u, i) => {
          if (u.textContent !== values[i]) u.textContent = values[i]!;
        });
      }
    };
    tick();
    window.clearInterval(countdownTimer);
    countdownTimer = window.setInterval(tick, 1000);
    return panel(
      el('div', 'ov-head', el('p', 'ov-eyebrow', `${L.nextRace} · ${r.seasonName}`), el('p', 'ov-title', r.label), el('p', 'ov-sub', sub)),
      counter,
      live,
    );
  }

  // ------------------------------------------------------------ Aufstellung
  function renderLineup(p: LineupPayload): HTMLElement {
    const head = el('div', 'ov-head', el('p', 'ov-eyebrow', p.round ? `${L.lineup} · ${p.round.seasonName}` : L.lineup), p.round && el('p', 'ov-title', p.round.label));
    if (!p.published) return panel(head, el('p', 'ov-empty', L.lineupPending));
    const grid = el('div', 'ov-grid');
    for (const team of p.teams) {
      const block = el('div', 'ov-team', stripe(team.color), el('p', 'ov-team-name', team.name));
      for (const d of team.drivers) {
        const line = el(
          'p',
          'ov-driver',
          el('span', 'ov-num', d.number != null ? String(d.number) : '–'),
          el('span', 'ov-name', d.name),
          d.reserve && el('span', 'ov-mark ov-mark-reserve', L.reserveShort),
          d.replaces && el('span', 'ov-replaces', L.replaces.replace('{name}', d.replaces)),
        );
        block.append(line);
      }
      grid.append(block);
    }
    return panel(head, grid);
  }

  // ------------------------------------------------------------ Wertung / Ergebnis
  function row(line: OverlayLine, team: boolean): HTMLElement {
    const marks: Child[] = line.marks.map((m) =>
      m === 'pole'
        ? Object.assign(el('span', 'ov-mark ov-mark-pole', 'P'), { title: L.pole })
        : m === 'fastestLap'
          ? Object.assign(el('span', 'ov-mark ov-mark-fl', stopwatch()), { title: L.fastestLap })
          : el('span', 'ov-mark ov-mark-reserve', L.reserveShort),
    );
    const name = el('span', 'ov-name', line.name, ...marks);
    const value = el('span', 'ov-value', line.detail && el('span', 'ov-detail', line.detail), line.value);
    return team
      ? el('div', 'ov-row ov-team-row', el('span', 'ov-pos', line.pos), stripe(line.color), name, value)
      : el('div', 'ov-row', el('span', 'ov-pos', line.pos), stripe(line.color), el('span', 'ov-num', line.number != null ? String(line.number) : ''), name, value);
  }

  function renderStandings(p: StandingsPayload): HTMLElement {
    const title = p.art === 'teams' ? L.standingsTeams : L.standingsDrivers;
    const sub = [p.seasonName, p.afterRound != null ? L.afterRound.replace('{n}', String(p.afterRound)) : null].filter(Boolean).join(' · ');
    const head = el('div', 'ov-head', el('p', 'ov-eyebrow', sub), el('p', 'ov-title', title));
    if (p.rows.length === 0) return panel(head, el('p', 'ov-empty', L.noStandings));
    return panel(head, el('div', 'ov-rows', ...p.rows.map((r) => row(r, p.art === 'teams'))));
  }

  function renderResult(p: ResultPayload): HTMLElement {
    if (!p.round) return panel(el('div', 'ov-head', el('p', 'ov-eyebrow', L.result)), el('p', 'ov-empty', L.noResult));
    const provisional = p.round.status === 'provisional';
    const head = el(
      'div',
      'ov-head',
      el('p', 'ov-eyebrow', `${L.result} · ${p.round.seasonName}`),
      el('p', 'ov-title', p.round.label, provisional && p.statusText && el('span', 'ov-badge', p.statusText)),
    );
    if (p.rows.length === 0) return panel(head, el('p', 'ov-empty', L.noResult));
    return panel(head, el('div', 'ov-rows', ...p.rows.map((r) => row(r, false))));
  }

  // ------------------------------------------------------------ Laufband
  function renderTicker(p: TickerPayload): HTMLElement {
    const items = p.items.length > 0 ? p.items : [L.tickerEmpty];
    const track = el('div', 'ov-ticker-track');
    // Zwei Kopien hintereinander: Verschiebung um 50 % ergibt eine nahtlose Schleife
    for (let copy = 0; copy < 2; copy++) {
      for (const text of items) {
        const item = el('span', 'ov-ticker-item', el('span', 'ov-ticker-sep'), text);
        if (copy === 1) item.setAttribute('aria-hidden', 'true');
        track.append(item);
      }
    }
    track.style.setProperty('--ov-duration', `${tickerSeconds(items.join('   ').length)}s`);
    return panel(el('div', 'ov-ticker-label', L.brand), el('div', 'ov-ticker-viewport', track));
  }

  function render(): void {
    if (!root) return;
    window.clearInterval(countdownTimer);
    if (!data) {
      root.replaceChildren();
      return;
    }
    let node: HTMLElement;
    switch (data.kind) {
      case 'next':
        node = renderNext(data);
        break;
      case 'lineup':
        node = renderLineup(data);
        break;
      case 'standings':
        node = renderStandings(data);
        break;
      case 'result':
        node = renderResult(data);
        break;
      case 'ticker':
        node = renderTicker(data);
        break;
      default:
        return;
    }
    root.replaceChildren(node);
  }

  async function poll(): Promise<void> {
    const wasFailing = failures > 0;
    try {
      const res = await fetch(cfg.endpoint, { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(String(res.status));
      const next = (await res.json()) as OverlayPayload;
      failures = 0;
      const s = sig(next);
      if (s !== signature || wasFailing) {
        data = next;
        signature = s;
        render();
      }
    } catch {
      failures += 1;
      // Letzten Stand stehen lassen, nur den Störungspunkt zeigen
      if (!wasFailing) render();
    } finally {
      const jitter = Math.round(Math.random() * 2000);
      window.setTimeout(() => void poll(), nextPollDelay(failures, cfg.intervalMs) + jitter);
    }
  }

  signature = sig(data);
  render();
  if (!data) void poll();
  else window.setTimeout(() => void poll(), cfg.intervalMs);
}
