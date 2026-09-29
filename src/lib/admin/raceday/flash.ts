/**
 * Erfolgsmeldungen nach Post/Redirect/Get im Steward-Werkzeug (`?ok=…&ref=…&effect=…`).
 */
export type FlashCode = 'status' | 'saved' | 'voted' | 'published' | 'pending' | 'discarded' | 'revoked' | 'opened';

const EFFECT: Record<string, string> = {
  recomputed: ' Ergebnis und Wertung wurden neu berechnet.',
  corrected: ' Das finale Ergebnis wurde korrigiert (öffentlicher Hinweis, Snapshots neu).',
};

export function flashQuery(code: FlashCode, extra: { ref?: string | null; effect?: string | null } = {}): string {
  const params = new URLSearchParams({ ok: code });
  if (extra.ref) params.set('ref', extra.ref);
  if (extra.effect && extra.effect !== 'none') params.set('effect', extra.effect);
  return `?${params.toString()}`;
}

/** Meldung aus der URL; unbekannte Codes ergeben null. Referenzen werden auf ein sicheres Format geprüft. */
export function flashText(search: URLSearchParams): string | null {
  const code = search.get('ok') as FlashCode | null;
  const rawRef = search.get('ref') ?? '';
  const ref = /^S\d{1,3}-R\d{2}-\d{2,3}$/.test(rawRef) ? rawRef : '';
  const effect = EFFECT[search.get('effect') ?? ''] ?? '';
  switch (code) {
    case 'status':
      return 'Status des Vorfalls gespeichert.';
    case 'saved':
      return `Entscheidung ${ref} als Entwurf gespeichert – deine Stimme zählt bereits.`.replace('  ', ' ');
    case 'voted':
      return 'Deine Zustimmung ist gespeichert.';
    case 'published':
      return `Urteil ${ref} veröffentlicht.${effect}`.replace('  ', ' ');
    case 'pending':
      return 'Vier-Augen-Prinzip: Deine Stimme ist gespeichert. Veröffentlichen kann erst ein zweiter Steward.';
    case 'discarded':
      return 'Entwurf verworfen.';
    case 'revoked':
      return `Urteil ${ref} zurückgenommen.${effect}`.replace('  ', ' ');
    case 'opened':
      return 'Untersuchung eröffnet. Du kannst jetzt eine Entscheidung anlegen.';
    default:
      return null;
  }
}
