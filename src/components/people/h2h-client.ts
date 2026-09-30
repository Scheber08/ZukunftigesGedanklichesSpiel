/**
 * Fahrer-Vergleich im Browser (/fahrer/vergleich, Plan Phase 2 „Head-to-Head“).
 * Liest die kompakten Daten aus <script type="application/json" id="h2h-data">, rechnet mit
 * src/lib/domain/h2h.ts und baut das Ergebnis per DOM (nur textContent, kein innerHTML).
 * Die Auswahl steht in der URL (?a=<slug>&b=<slug>&s=<saison>) – der Link ist teilbar.
 */
import { compareDrivers, decodeResults, type DuelCell, type H2hComparison, type H2hDotd, type H2hMetric, type SessionDuel } from '~/lib/domain/h2h';
import type { H2hPayload } from '~/lib/people/compare';

type Child = Node | string | null | undefined | false;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number | boolean | undefined> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') el.className = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c != null && c !== false) el.append(c);
  return el;
}

function fill(template: string, params: Record<string, string | number>): string {
  let out = template;
  for (const [k, v] of Object.entries(params)) out = out.replaceAll(`{${k}}`, String(v));
  return out;
}

interface State {
  a: string;
  b: string;
  s: string;
}

interface DriverInfo {
  id: number;
  slug: string;
  name: string;
  href: string;
  teamId: number;
  number: number;
}

export function initCompare(): void {
  const root = document.querySelector<HTMLElement>('[data-h2h]');
  const dataEl = document.getElementById('h2h-data');
  const form = root?.querySelector<HTMLFormElement>('[data-h2h-form]');
  const output = root?.querySelector<HTMLElement>('[data-h2h-output]');
  const status = root?.querySelector<HTMLElement>('[data-h2h-status]');
  if (!root || !dataEl || !form || !output) return;

  let payload: H2hPayload;
  try {
    payload = JSON.parse(dataEl.textContent ?? '') as H2hPayload;
  } catch {
    return;
  }
  if (payload?.v !== 1) return;

  const lang = document.documentElement.lang === 'en' ? 'en' : 'de';
  const numberFormat = new Intl.NumberFormat(lang === 'de' ? 'de-DE' : 'en-GB');
  const decimalFormat = new Intl.NumberFormat(lang === 'de' ? 'de-DE' : 'en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const text = payload.text;
  const tx = (key: string, params: Record<string, string | number> = {}) => fill(text[key] ?? key, params);

  const drivers = new Map<string, DriverInfo>();
  const driverById = new Map<number, DriverInfo>();
  for (const [id, slug, name, href, teamId, number] of payload.drivers) {
    const d = { id, slug, name, href, teamId, number };
    drivers.set(slug, d);
    driverById.set(id, d);
  }
  const teams = new Map(payload.teams.map(([id, name, color]) => [id, { name, color }]));
  const seasons = new Map(payload.seasons.map((s) => [s.slug, s]));
  const seasonById = new Map(payload.seasons.map((s) => [s.id, s.label]));
  const seasonOfRound = new Map(payload.rounds.map(([id, seasonId]) => [id, seasonId]));
  const roundInfo = new Map(payload.rounds.map(([id, , label, href]) => [id, { label, href }]));
  const roundOrder = new Map(payload.rounds.map(([id], i) => [id, i]));
  const results = decodeResults(payload.results, seasonOfRound);
  const dotd: H2hDotd[] = payload.dotd
    .map(([roundId, driverId]) => ({ roundId, driverId, seasonId: seasonOfRound.get(roundId) ?? -1 }))
    .filter((d) => d.seasonId >= 0);
  const showDotd = dotd.length > 0;

  const selA = form.querySelector<HTMLSelectElement>('[name="a"]');
  const selB = form.querySelector<HTMLSelectElement>('[name="b"]');
  const selS = form.querySelector<HTMLSelectElement>('[name="s"]');
  const swap = form.querySelector<HTMLButtonElement>('[data-h2h-swap]');
  if (!selA || !selB || !selS) return;

  // ------------------------------------------------------------------ Zustand ↔ URL

  const valid = (st: State): State => ({
    a: drivers.has(st.a) ? st.a : '',
    b: drivers.has(st.b) ? st.b : '',
    s: seasons.has(st.s) ? st.s : '',
  });

  const fromUrl = (): State => {
    const p = new URLSearchParams(window.location.search);
    return valid({ a: p.get('a') ?? '', b: p.get('b') ?? '', s: p.get('s') ?? '' });
  };

  /** Zweiter Fahrer fehlt: Teamkollege, sonst der Erste der Wertung. */
  const suggest = (a: string): string => {
    const d = drivers.get(a);
    if (!d) return '';
    const mate = d.teamId ? payload.drivers.find(([id, , , , teamId]) => teamId === d.teamId && id !== d.id) : undefined;
    if (mate) return mate[1];
    const fallback = [payload.defaults.a, payload.defaults.b].find((slug) => slug && slug !== a);
    return fallback ?? '';
  };

  const toQuery = (st: State): string => {
    const p = new URLSearchParams();
    if (st.a) p.set('a', st.a);
    if (st.b) p.set('b', st.b);
    if (st.s) p.set('s', st.s);
    const q = p.toString();
    return q ? `?${q}` : '';
  };

  const writeUrl = (st: State, push: boolean) => {
    const target = `${window.location.pathname}${toQuery(st)}${window.location.hash}`;
    if (target === `${window.location.pathname}${window.location.search}${window.location.hash}`) return;
    if (push) window.history.pushState(null, '', target);
    else window.history.replaceState(null, '', target);
  };

  const syncForm = (st: State) => {
    selA.value = st.a;
    selB.value = st.b;
    selS.value = st.s;
  };

  /** Sprachumschalter behält die Auswahl (Slugs sind in beiden Sprachen gleich). */
  const syncLangLinks = (st: State) => {
    document.querySelectorAll<HTMLAnchorElement>('a[data-lang-switch]').forEach((link) => {
      const base = link.getAttribute('href')?.split('?')[0];
      if (base) link.setAttribute('href', `${base}${toQuery(st)}`);
    });
  };

  // ------------------------------------------------------------------ Darstellung

  const cellText = (c: DuelCell | null): string =>
    c == null ? '–' : c.position != null ? tx('pos', { n: c.position }) : tx(`st_${c.status}`);

  const metricText = (m: H2hMetric, value: number | null): string => {
    if (value == null) return '–';
    if (m.key === 'avgFinish') return decimalFormat.format(value);
    if (m.key === 'bestFinish') return tx('pos', { n: value });
    return numberFormat.format(value);
  };

  const driverCard = (d: DriverInfo, rounds: number, side: 'a' | 'b') => {
    const team = teams.get(d.teamId);
    const card = h(
      'div',
      { class: `h2h-card card side-${side}` },
      h('span', { class: 'h2h-stripe', 'aria-hidden': 'true' }),
      h(
        'div',
        { class: 'min-w-0' },
        h('p', { class: 'micro' }, tx(side === 'a' ? 'driverA' : 'driverB')),
        h('p', { class: 'h2h-name' }, h('a', { href: d.href, class: 'gamertag' }, d.name)),
        team ? h('p', { class: 'text-sm text-muted' }, team.name) : null,
        rounds === 0 ? h('p', { class: 'mt-1 text-xs text-warning' }, tx('notInScope', { name: d.name })) : null,
      ),
      d.number ? h('span', { class: 'h2h-number tabular' }, h('span', { class: 'sr-only' }, `${tx('number')} `), String(d.number)) : null,
    );
    if (team) card.style.setProperty('--team-color', team.color);
    return card;
  };

  const duelBar = (label: string, x: number, y: number, a: DriverInfo, b: DriverInfo, detail: string) => {
    const bar = h('span', { class: 'h2h-bar-a' });
    bar.style.width = `${x + y === 0 ? 50 : Math.round((x / (x + y)) * 100)}%`;
    return h(
      'div',
      { class: 'h2h-duel' },
      h('dt', { class: 'micro text-center' }, label),
      h(
        'dd',
        { class: 'h2h-duel-values' },
        // Sichtbare Zahlen nur fürs Auge, Screenreader lesen den Satz darunter
        h('span', { class: `h2h-v tabular${x > y ? ' lead' : ''}`, 'aria-hidden': 'true' }, String(x)),
        h('span', { class: 'h2h-bar', 'aria-hidden': 'true' }, bar, h('span', { class: 'h2h-bar-b' })),
        h('span', { class: `h2h-v tabular text-right${y > x ? ' lead' : ''}`, 'aria-hidden': 'true' }, String(y)),
        h('span', { class: 'sr-only' }, tx('score', { a: a.name, x, b: b.name, y })),
      ),
      detail ? h('dd', { class: 'text-center text-xs text-muted' }, detail) : null,
    );
  };

  const sessionCells = (d: SessionDuel, a: DriverInfo, b: DriverInfo): HTMLTableCellElement[] => {
    if (d.a && d.b && d.winner === 'none') {
      return [
        h(
          'td',
          { colspan: 2, class: 'h2h-noduel' },
          h('span', { class: 'font-semibold' }, tx('noDuel')),
          h('span', { class: 'text-danger', 'aria-hidden': 'true' }, ` (${cellText(d.a)} · ${cellText(d.b)})`),
          h('span', { class: 'sr-only' }, `: ${a.name} ${cellText(d.a)}, ${b.name} ${cellText(d.b)}`),
        ),
      ];
    }
    const one = (c: DuelCell | null, win: boolean) =>
      h(
        'td',
        { class: ['num', win ? 'h2h-win' : '', c && c.position == null ? 'text-danger' : '', c == null ? 'muted' : ''].filter(Boolean).join(' ') },
        cellText(c),
        win ? h('span', { class: 'sr-only' }, ` (${tx('ahead')})`) : null,
      );
    return [one(d.a, d.winner === 'a'), one(d.b, d.winner === 'b')];
  };

  const leaderText = (d: SessionDuel, a: DriverInfo, b: DriverInfo): string => {
    if (!d.a || !d.b) return '–';
    if (d.winner === 'a') return a.name;
    if (d.winner === 'b') return b.name;
    if (d.winner === 'tie') return tx('tie');
    return tx('noDuel');
  };

  const renderComparison = (a: DriverInfo, b: DriverInfo, st: State, cmp: H2hComparison): Node => {
    const scope = st.s ? (seasons.get(st.s)?.label ?? '') : tx('scopeAll');
    const section = h('section', { 'aria-labelledby': 'h2h-result-title' });
    section.append(
      h('h2', { id: 'h2h-result-title', class: 'section-title uppercase' }, tx('heading', { a: a.name, b: b.name })),
      h('p', { class: 'mt-2 text-sm text-muted' }, scope),
      h('div', { class: 'h2h-cards mt-5' }, driverCard(a, cmp.a.rounds, 'a'), h('span', { class: 'micro h2h-vs', 'aria-hidden': 'true' }, tx('versus')), driverCard(b, cmp.b.rounds, 'b')),
    );

    // Direkte Duelle
    const details = (t: H2hComparison['race']) =>
      [tx('sharedCount', { n: t.shared }), t.none > 0 ? tx('noDuels', { n: t.none }) : ''].filter(Boolean).join(' · ');
    section.append(
      h('h3', { class: 'h2h-sub' }, tx('duelTitle')),
      h(
        'dl',
        { class: 'h2h-duels card' },
        duelBar(tx('raceDuel'), cmp.race.winsA, cmp.race.winsB, a, b, details(cmp.race)),
        duelBar(tx('qualiDuel'), cmp.quali.winsA, cmp.quali.winsB, a, b, details(cmp.quali)),
      ),
    );

    // Kennzahlen
    const metrics = cmp.metrics.filter((m) => showDotd || m.key !== 'dotd');
    const statRows = metrics.map((m) => {
      const cell = (value: number | null, better: boolean) =>
        h(
          'td',
          { class: `num${better ? ' h2h-better' : ''}` },
          metricText(m, value),
          better ? h('span', { class: 'sr-only' }, ` (${tx('better')})`) : null,
        );
      return h(
        'tr',
        {},
        h('th', { scope: 'row', class: 'sticky-col font-normal' }, tx(`m_${m.key}`)),
        cell(m.a, m.better === 'a'),
        cell(m.b, m.better === 'b'),
      );
    });
    section.append(
      h('h3', { class: 'h2h-sub' }, tx('statsTitle')),
      h(
        'div',
        { class: 'table-wrap' },
        h(
          'table',
          { class: 'timing-table h2h-stats' },
          h('caption', { class: 'sr-only' }, tx('statsCaption', { a: a.name, b: b.name, scope })),
          h(
            'thead',
            {},
            h(
              'tr',
              {},
              h('th', { scope: 'col', class: 'sticky-col' }, tx('metric')),
              h('th', { scope: 'col', class: 'num' }, a.name),
              h('th', { scope: 'col', class: 'num' }, b.name),
            ),
          ),
          h('tbody', {}, ...statRows),
        ),
      ),
    );

    // Gemeinsame Rennen
    section.append(h('h3', { class: 'h2h-sub' }, tx('sharedTitle')));
    if (cmp.rounds.length === 0) {
      section.append(h('p', { class: 'card p-5 text-sm text-muted' }, tx('noShared', { a: a.name, b: b.name })));
    } else {
      const rows = cmp.rounds.map((r) => {
        const info = roundInfo.get(r.roundId);
        return h(
          'tr',
          {},
          h(
            'th',
            { scope: 'row', class: 'sticky-col font-normal' },
            info ? h('a', { href: info.href }, info.label) : String(r.roundId),
            !st.s ? h('span', { class: 'ml-2 text-xs text-muted' }, seasonById.get(r.seasonId) ?? '') : null,
            r.teammates ? h('span', { class: 'badge badge-muted ml-2' }, tx('teammates')) : null,
          ),
          ...sessionCells(r.quali, a, b),
          ...sessionCells(r.race, a, b),
          h('td', { class: r.race.winner === 'none' ? 'muted' : '' }, leaderText(r.race, a, b)),
        );
      });
      section.append(
        h(
          'div',
          { class: 'table-wrap' },
          h(
            'table',
            { class: 'timing-table' },
            h('caption', { class: 'sr-only' }, tx('sharedCaption', { a: a.name, b: b.name, scope })),
            // Spaltengruppen, damit die Kopfzellen „Qualifying“/„Rennen“ (scope=colgroup) greifen
            h('colgroup', { span: 1 }),
            h('colgroup', { span: 2 }),
            h('colgroup', { span: 2 }),
            h('colgroup', { span: 1 }),
            h(
              'thead',
              {},
              h(
                'tr',
                {},
                h('th', { scope: 'col', class: 'sticky-col', rowspan: 2 }, tx('round')),
                h('th', { scope: 'colgroup', colspan: 2, class: 'text-center' }, tx('quali')),
                h('th', { scope: 'colgroup', colspan: 2, class: 'text-center' }, tx('race')),
                h('th', { scope: 'col', rowspan: 2 }, tx('leader')),
              ),
              h(
                'tr',
                {},
                h('th', { scope: 'col', class: 'num' }, a.name),
                h('th', { scope: 'col', class: 'num' }, b.name),
                h('th', { scope: 'col', class: 'num' }, a.name),
                h('th', { scope: 'col', class: 'num' }, b.name),
              ),
            ),
            h('tbody', {}, ...rows),
          ),
        ),
      );
    }
    return section;
  };

  const render = (st: State, announce: boolean) => {
    const a = drivers.get(st.a);
    const b = drivers.get(st.b);
    output.replaceChildren();
    if (!a || !b) {
      output.append(h('p', { class: 'card p-5 text-sm text-muted' }, a || b ? tx('pickSecond') : tx('pick')));
      return;
    }
    if (a.id === b.id) {
      output.append(h('p', { class: 'alert alert-warning text-sm' }, tx('same')));
      return;
    }
    const season = st.s ? seasons.get(st.s) : undefined;
    const cmp = compareDrivers(results, a.id, b.id, { seasonId: season?.id ?? null, dotd, roundOrder });
    output.append(renderComparison(a, b, st, cmp));
    if (announce && status) status.textContent = tx('updated', { a: a.name, b: b.name });
  };

  const apply = (st: State, opts: { push: boolean; announce: boolean }) => {
    syncForm(st);
    writeUrl(st, opts.push);
    syncLangLinks(st);
    render(st, opts.announce);
  };

  const fromForm = (): State => valid({ a: selA.value, b: selB.value, s: selS.value });

  // ------------------------------------------------------------------ Start

  let initial = fromUrl();
  const hasParams = new URLSearchParams(window.location.search).toString() !== '';
  if (!initial.a && !initial.b && !hasParams) {
    initial = valid({ a: payload.defaults.a ?? '', b: payload.defaults.b ?? '', s: '' });
    syncForm(initial);
    render(initial, false);
  } else {
    if (initial.a && !initial.b) initial = { ...initial, b: suggest(initial.a) };
    else if (!initial.a && initial.b) initial = { ...initial, a: suggest(initial.b) };
    apply(initial, { push: false, announce: false });
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    apply(fromForm(), { push: true, announce: true });
  });
  for (const sel of [selA, selB, selS]) {
    sel.addEventListener('change', () => apply(fromForm(), { push: false, announce: true }));
  }
  if (swap) {
    swap.hidden = false;
    swap.addEventListener('click', () => {
      const st = fromForm();
      apply({ ...st, a: st.b, b: st.a }, { push: false, announce: true });
    });
  }
  window.addEventListener('popstate', () => apply(fromUrl(), { push: false, announce: true }));
}
