/**
 * Basisdaten für eine frische Datenbank (supabase/seed.sql) und den Demo-Modus:
 * 11 Teams (Grid 2026), Strecken aus dem Spiel, Punkteschema-Vorlagen, Regelwerk v1,
 * FAQ, offene Rollen und Einstellungen. KEINE Fahrer oder Ergebnisse – die stehen in demo.ts.
 */

import type { Dataset } from '../db/memory-store';
import type { RulesSectionRow, TeamRow, TrackRow } from '../db/types';
import { POINTS_TEMPLATES } from '../domain/points';
import { DEFAULT_PRIVATE_SETTINGS, DEFAULT_PUBLIC_SETTINGS, PUBLIC_SETTING_KEYS } from '../settings';
import { FAQ_ITEMS } from './content/faq';
import { OPEN_POSITIONS } from './content/positions';
import { RULES_V1, type RuleSectionSeed } from './content/rules';

type Seed<T> = Omit<T, 'created_at' | 'updated_at'>;

/**
 * Teams nur mit Name und Farbe (keine Logos, Plan §9.1). Die Farben sind Näherungswerte
 * und im Admin änderbar. `game_team_id` laut UDP-Spezifikation (Audi = ehem. Sauber).
 */
export const BASE_TEAMS: Seed<TeamRow>[] = [
  { id: 1, slug: 'mclaren', name: 'McLaren', short_name: 'MCL', color_hex: '#FF8000', text_color_hex: '#000000', game_team_id: 8, active: true },
  { id: 2, slug: 'ferrari', name: 'Ferrari', short_name: 'FER', color_hex: '#E8002D', text_color_hex: '#FFFFFF', game_team_id: 1, active: true },
  { id: 3, slug: 'red-bull-racing', name: 'Red Bull Racing', short_name: 'RBR', color_hex: '#3671C6', text_color_hex: '#FFFFFF', game_team_id: 2, active: true },
  { id: 4, slug: 'mercedes', name: 'Mercedes', short_name: 'MER', color_hex: '#27F4D2', text_color_hex: '#000000', game_team_id: 0, active: true },
  { id: 5, slug: 'aston-martin', name: 'Aston Martin', short_name: 'AMR', color_hex: '#229971', text_color_hex: '#FFFFFF', game_team_id: 4, active: true },
  { id: 6, slug: 'alpine', name: 'Alpine', short_name: 'ALP', color_hex: '#FF87BC', text_color_hex: '#000000', game_team_id: 5, active: true },
  { id: 7, slug: 'williams', name: 'Williams', short_name: 'WIL', color_hex: '#64C4FF', text_color_hex: '#000000', game_team_id: 3, active: true },
  { id: 8, slug: 'racing-bulls', name: 'Racing Bulls', short_name: 'RB', color_hex: '#6692FF', text_color_hex: '#000000', game_team_id: 6, active: true },
  { id: 9, slug: 'haas', name: 'Haas', short_name: 'HAA', color_hex: '#B6BABD', text_color_hex: '#000000', game_team_id: 7, active: true },
  { id: 10, slug: 'audi', name: 'Audi', short_name: 'AUD', color_hex: '#BB0A30', text_color_hex: '#FFFFFF', game_team_id: 9, active: true },
  { id: 11, slug: 'cadillac', name: 'Cadillac', short_name: 'CAD', color_hex: '#C9B37E', text_color_hex: '#000000', game_team_id: null, active: true },
];

/** Strecken nach Ort benannt (keine offiziellen Event-Titel, Plan §9.1). */
export const BASE_TRACKS: Seed<TrackRow>[] = [
  { id: 1, slug: 'melbourne', name_de: 'Melbourne', name_en: 'Melbourne', country_code: 'AU', game_track_id: 0, length_km: 5.278, laps_default: 58, map_url: null, map_credit: null },
  { id: 2, slug: 'shanghai', name_de: 'Shanghai', name_en: 'Shanghai', country_code: 'CN', game_track_id: 2, length_km: 5.451, laps_default: 56, map_url: null, map_credit: null },
  { id: 3, slug: 'suzuka', name_de: 'Suzuka', name_en: 'Suzuka', country_code: 'JP', game_track_id: 13, length_km: 5.807, laps_default: 53, map_url: null, map_credit: null },
  { id: 4, slug: 'sakhir', name_de: 'Sakhir', name_en: 'Sakhir', country_code: 'BH', game_track_id: 3, length_km: 5.412, laps_default: 57, map_url: null, map_credit: null },
  { id: 5, slug: 'jeddah', name_de: 'Dschidda', name_en: 'Jeddah', country_code: 'SA', game_track_id: 29, length_km: 6.174, laps_default: 50, map_url: null, map_credit: null },
  { id: 6, slug: 'miami', name_de: 'Miami', name_en: 'Miami', country_code: 'US', game_track_id: 30, length_km: 5.412, laps_default: 57, map_url: null, map_credit: null },
  { id: 7, slug: 'montreal', name_de: 'Montreal', name_en: 'Montreal', country_code: 'CA', game_track_id: 6, length_km: 4.361, laps_default: 70, map_url: null, map_credit: null },
  { id: 8, slug: 'monaco', name_de: 'Monaco', name_en: 'Monaco', country_code: 'MC', game_track_id: 5, length_km: 3.337, laps_default: 78, map_url: null, map_credit: null },
  { id: 9, slug: 'barcelona', name_de: 'Barcelona', name_en: 'Barcelona', country_code: 'ES', game_track_id: 4, length_km: 4.657, laps_default: 66, map_url: null, map_credit: null },
  { id: 10, slug: 'spielberg', name_de: 'Spielberg', name_en: 'Spielberg', country_code: 'AT', game_track_id: 17, length_km: 4.318, laps_default: 71, map_url: null, map_credit: null },
  { id: 11, slug: 'silverstone', name_de: 'Silverstone', name_en: 'Silverstone', country_code: 'GB', game_track_id: 7, length_km: 5.891, laps_default: 52, map_url: null, map_credit: null },
  { id: 12, slug: 'spa', name_de: 'Spa-Francorchamps', name_en: 'Spa-Francorchamps', country_code: 'BE', game_track_id: 10, length_km: 7.004, laps_default: 44, map_url: null, map_credit: null },
  { id: 13, slug: 'budapest', name_de: 'Budapest', name_en: 'Budapest', country_code: 'HU', game_track_id: 9, length_km: 4.381, laps_default: 70, map_url: null, map_credit: null },
  { id: 14, slug: 'zandvoort', name_de: 'Zandvoort', name_en: 'Zandvoort', country_code: 'NL', game_track_id: 26, length_km: 4.259, laps_default: 72, map_url: null, map_credit: null },
  { id: 15, slug: 'monza', name_de: 'Monza', name_en: 'Monza', country_code: 'IT', game_track_id: 11, length_km: 5.793, laps_default: 53, map_url: null, map_credit: null },
  { id: 16, slug: 'madrid', name_de: 'Madrid', name_en: 'Madrid', country_code: 'ES', game_track_id: null, length_km: 5.474, laps_default: 57, map_url: null, map_credit: null },
  { id: 17, slug: 'baku', name_de: 'Baku', name_en: 'Baku', country_code: 'AZ', game_track_id: 20, length_km: 6.003, laps_default: 51, map_url: null, map_credit: null },
  { id: 18, slug: 'singapore', name_de: 'Singapur', name_en: 'Singapore', country_code: 'SG', game_track_id: 12, length_km: 4.94, laps_default: 62, map_url: null, map_credit: null },
  { id: 19, slug: 'austin', name_de: 'Austin', name_en: 'Austin', country_code: 'US', game_track_id: 15, length_km: 5.513, laps_default: 56, map_url: null, map_credit: null },
  { id: 20, slug: 'mexico-city', name_de: 'Mexiko-Stadt', name_en: 'Mexico City', country_code: 'MX', game_track_id: 19, length_km: 4.304, laps_default: 71, map_url: null, map_credit: null },
  { id: 21, slug: 'sao-paulo', name_de: 'São Paulo', name_en: 'São Paulo', country_code: 'BR', game_track_id: 16, length_km: 4.309, laps_default: 71, map_url: null, map_credit: null },
  { id: 22, slug: 'las-vegas', name_de: 'Las Vegas', name_en: 'Las Vegas', country_code: 'US', game_track_id: 31, length_km: 6.201, laps_default: 50, map_url: null, map_credit: null },
  { id: 23, slug: 'lusail', name_de: 'Lusail', name_en: 'Lusail', country_code: 'QA', game_track_id: 32, length_km: 5.419, laps_default: 57, map_url: null, map_credit: null },
  { id: 24, slug: 'abu-dhabi', name_de: 'Abu Dhabi', name_en: 'Abu Dhabi', country_code: 'AE', game_track_id: 14, length_km: 5.281, laps_default: 58, map_url: null, map_credit: null },
  { id: 25, slug: 'imola', name_de: 'Imola', name_en: 'Imola', country_code: 'IT', game_track_id: 27, length_km: 4.909, laps_default: 63, map_url: null, map_credit: null },
];

export const BASE_POINTS_SCHEMES = Object.values(POINTS_TEMPLATES).map((t, i) => ({
  id: i + 1,
  name: t.name,
  race_points: [...t.race_points],
  sprint_points: [...t.sprint_points],
  fastest_lap_bonus: t.fastest_lap_bonus,
  fastest_lap_max_pos: t.fastest_lap_max_pos,
  pole_bonus: t.pole_bonus,
}));

/** Regelwerk-Baum → flache Zeilen mit parent_id und fortlaufender Sortierung. */
export function flattenRules(versionId: number, sections: RuleSectionSeed[], firstId = 1): Seed<RulesSectionRow>[] {
  const out: Seed<RulesSectionRow>[] = [];
  let id = firstId;
  let sort = 0;
  const walk = (list: RuleSectionSeed[], parentId: number | null) => {
    for (const s of list) {
      const myId = id++;
      out.push({
        id: myId,
        version_id: versionId,
        parent_id: parentId,
        number: s.number,
        anchor: s.anchor,
        title_de: s.title_de,
        title_en: s.title_en,
        body_de: s.body_de,
        body_en: s.body_en,
        sort: sort++,
      });
      if (s.children?.length) walk(s.children, myId);
    }
  };
  walk(sections, null);
  return out;
}

export function baseDataset(): Dataset {
  const publicSettings = PUBLIC_SETTING_KEYS.map((key) => ({ key, value: DEFAULT_PUBLIC_SETTINGS[key], is_public: true }));
  const privateSettings = Object.entries(DEFAULT_PRIVATE_SETTINGS).map(([key, value]) => ({ key, value, is_public: false }));

  return {
    teams: BASE_TEAMS,
    tracks: BASE_TRACKS,
    points_schemes: BASE_POINTS_SCHEMES,
    rules_versions: [
      {
        id: 1,
        version: RULES_V1.version,
        effective_from: RULES_V1.effective_from,
        changelog_de: RULES_V1.changelog_de,
        changelog_en: RULES_V1.changelog_en,
        status: 'published',
        // Veröffentlicht vor Inkrafttreten; gilt ab effective_from
        published_at: '2026-09-29T12:00:00Z',
      },
    ],
    rules_sections: flattenRules(1, RULES_V1.sections),
    faq_items: FAQ_ITEMS.map((f, i) => ({ id: i + 1, ...f, sort: i * 10 })),
    open_positions: OPEN_POSITIONS.map((p, i) => ({ id: i + 1, ...p, active: true, sort: i * 10 })),
    settings: [...publicSettings, ...privateSettings],
  };
}
