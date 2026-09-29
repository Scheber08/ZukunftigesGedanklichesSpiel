/**
 * Standard-Lobby-Einstellungen – VORLAGE (Entwurf).
 *
 * Das Rennformat steht noch nicht fest. Alle Werte sind Vorschläge, wie sie in
 * kompetitiven F1-25-Ligen üblich sind. „Vorschlag" = noch nicht beschlossen,
 * „wird festgelegt" = bewusst offen. Die Liga-Leitung legt die endgültigen Werte
 * nach dem Lobby-Test fest und pflegt sie pro Saison im Admin-Bereich.
 */

import { LOBBY_JOIN_STEPS_DE, LOBBY_JOIN_STEPS_EN } from './guide';

export interface LobbyItem {
  label_de: string;
  label_en: string;
  value_de: string;
  value_en: string;
}

export interface LobbyGroup {
  key: string;
  title_de: string;
  title_en: string;
  items: LobbyItem[];
}

export const DEFAULT_LOBBY_SETTINGS: { groups: LobbyGroup[]; join_steps_de: string[]; join_steps_en: string[] } = {
  groups: [
    {
      key: 'lobby',
      title_de: 'Lobby',
      title_en: 'Lobby',
      items: [
        {
          label_de: 'Status',
          label_en: 'Status',
          value_de:
            'Entwurf – alle Werte mit „Vorschlag" sind noch nicht beschlossen und werden nach dem Lobby-Test festgelegt. Die Bezeichnungen im Spiel können leicht abweichen.',
          value_en:
            'Draft – all values marked "proposal" have not been decided yet and will be set after the lobby test. Option names in the game may differ slightly.',
        },
        { label_de: 'Crossplay', label_en: 'Crossplay', value_de: 'An', value_en: 'On' },
        {
          label_de: 'Lobby-Typ',
          label_en: 'Lobby type',
          value_de: 'Privat, nur mit Einladung',
          value_en: 'Private, invite only',
        },
        {
          label_de: 'Host',
          label_en: 'Host',
          value_de: 'Rennleitung der Liga',
          value_en: 'League race control',
        },
        {
          label_de: 'Max. Teilnehmer',
          label_en: 'Max. participants',
          value_de: '22 Fahrer',
          value_en: '22 drivers',
        },
        { label_de: 'KI-Fahrer', label_en: 'AI drivers', value_de: 'Aus', value_en: 'Off' },
        {
          label_de: 'Zuschauer',
          label_en: 'Spectators',
          value_de: 'Erlaubt (für Stewards und Streams)',
          value_en: 'Allowed (for stewards and streams)',
        },
        {
          label_de: 'Fahrzeugleistung',
          label_en: 'Car performance',
          value_de: 'Gleich für alle Teams (Vorschlag)',
          value_en: 'Equal for all teams (proposal)',
        },
        {
          label_de: 'Team & Fahrzeug',
          label_en: 'Team & car',
          value_de: 'Laut Teamzuteilung der Liga',
          value_en: 'As assigned by the league',
        },
        {
          label_de: 'Season Pack / Fahrzeugjahrgang',
          label_en: 'Season Pack / car season',
          value_de: 'Wird nach dem Lobby-Test festgelegt',
          value_en: 'To be decided after the lobby test',
        },
        {
          label_de: 'Voice-Chat im Spiel',
          label_en: 'In-game voice chat',
          value_de: 'Aus – wir nutzen Discord (Vorschlag)',
          value_en: 'Off – we use Discord (proposal)',
        },
      ],
    },
    {
      key: 'assists',
      title_de: 'Fahrhilfen',
      title_en: 'Assists',
      items: [
        {
          label_de: 'Traktionskontrolle',
          label_en: 'Traction control',
          value_de: 'Frei wählbar (Vorschlag)',
          value_en: 'Free choice (proposal)',
        },
        {
          label_de: 'ABS',
          label_en: 'ABS',
          value_de: 'Frei wählbar (Vorschlag)',
          value_en: 'Free choice (proposal)',
        },
        {
          label_de: 'Lenkhilfe',
          label_en: 'Steering assist',
          value_de: 'Nicht erlaubt (Vorschlag)',
          value_en: 'Not allowed (proposal)',
        },
        {
          label_de: 'Bremshilfe',
          label_en: 'Braking assist',
          value_de: 'Nicht erlaubt – automatisches Bremsen ist für andere schwer vorhersehbar (Vorschlag)',
          value_en: 'Not allowed – automatic braking is hard for others to predict (proposal)',
        },
        {
          label_de: 'Ideallinie',
          label_en: 'Racing line',
          value_de: 'Frei wählbar',
          value_en: 'Free choice',
        },
        {
          label_de: 'Gangschaltung',
          label_en: 'Gearbox',
          value_de: 'Frei wählbar (automatisch oder manuell)',
          value_en: 'Free choice (automatic or manual)',
        },
        {
          label_de: 'Boxenhilfe',
          label_en: 'Pit assist',
          value_de: 'Frei wählbar',
          value_en: 'Free choice',
        },
        {
          label_de: 'ERS-Hilfe',
          label_en: 'ERS assist',
          value_de: 'Frei wählbar',
          value_en: 'Free choice',
        },
        {
          label_de: 'DRS-Hilfe',
          label_en: 'DRS assist',
          value_de: 'Frei wählbar',
          value_en: 'Free choice',
        },
      ],
    },
    {
      key: 'weekend',
      title_de: 'Wochenende',
      title_en: 'Weekend',
      items: [
        {
          label_de: 'Freies Training',
          label_en: 'Practice',
          value_de: 'Keines (Vorschlag)',
          value_en: 'None (proposal)',
        },
        {
          label_de: 'Qualifying-Format',
          label_en: 'Qualifying format',
          value_de: 'Kurzes Qualifying oder Einzelrunde – wird festgelegt',
          value_en: 'Short qualifying or one-shot – to be decided',
        },
        {
          label_de: 'Renndistanz',
          label_en: 'Race distance',
          value_de: 'Wird festgelegt',
          value_en: 'To be decided',
        },
        {
          label_de: 'Sprint',
          label_en: 'Sprint',
          value_de: 'Je nach Runde (siehe Kalender)',
          value_en: 'Depending on the round (see calendar)',
        },
        {
          label_de: 'Startzeit',
          label_en: 'Start time',
          value_de: 'Laut Kalender',
          value_en: 'As per the calendar',
        },
        {
          label_de: 'Startaufstellung',
          label_en: 'Starting grid',
          value_de: 'Laut Qualifying, zuzüglich Grid-Strafen aus dem vorherigen Rennen',
          value_en: 'As per qualifying, plus grid penalties from the previous race',
        },
        {
          label_de: 'Reifenregeln',
          label_en: 'Tyre rules',
          value_de: 'Standard des Spiels für die gewählte Renndistanz (Vorschlag)',
          value_en: 'Game default for the chosen race distance (proposal)',
        },
      ],
    },
    {
      key: 'weather',
      title_de: 'Wetter',
      title_en: 'Weather',
      items: [
        {
          label_de: 'Wetter',
          label_en: 'Weather',
          value_de: 'Dynamisch (Vorschlag)',
          value_en: 'Dynamic (proposal)',
        },
        {
          label_de: 'Wettervorhersage',
          label_en: 'Weather forecast',
          value_de: 'Genau (Vorschlag)',
          value_en: 'Accurate (proposal)',
        },
        {
          label_de: 'Tageszeit',
          label_en: 'Time of day',
          value_de: 'Originalzeit der jeweiligen Strecke (Vorschlag)',
          value_en: 'Real-world session time of each track (proposal)',
        },
      ],
    },
    {
      key: 'rules',
      title_de: 'Regeln & Flaggen',
      title_en: 'Rules & flags',
      items: [
        {
          label_de: 'Regeln & Flaggen',
          label_en: 'Rules & flags',
          value_de: 'An',
          value_en: 'On',
        },
        {
          label_de: 'Kurvenschneiden',
          label_en: 'Corner cutting',
          value_de: 'Streng (Vorschlag)',
          value_en: 'Strict (proposal)',
        },
        {
          label_de: 'Parc fermé',
          label_en: 'Parc fermé',
          value_de: 'An',
          value_en: 'On',
        },
        {
          label_de: 'Formationsrunde',
          label_en: 'Formation lap',
          value_de: 'An (Vorschlag)',
          value_en: 'On (proposal)',
        },
        {
          label_de: 'Safety Car & VSC',
          label_en: 'Safety car & VSC',
          value_de: 'An, Häufigkeit Standard (Vorschlag)',
          value_en: 'On, standard frequency (proposal)',
        },
        {
          label_de: 'Rote Flaggen',
          label_en: 'Red flags',
          value_de: 'An (Vorschlag)',
          value_en: 'On (proposal)',
        },
        {
          label_de: 'Kollisionen',
          label_en: 'Collisions',
          value_de: 'An',
          value_en: 'On',
        },
        {
          label_de: 'Geister-Modus (Ghosting)',
          label_en: 'Ghosting',
          value_de: 'Nur wie vom Spiel vorgesehen, z. B. beim Zurückkehren auf die Strecke (Vorschlag)',
          value_en: 'Only as provided by the game, e.g. when rejoining the track (proposal)',
        },
        {
          label_de: 'Frühstarts',
          label_en: 'Jump starts',
          value_de: 'Werden vom Spiel bestraft',
          value_en: 'Penalised by the game',
        },
      ],
    },
    {
      key: 'simulation',
      title_de: 'Simulation',
      title_en: 'Simulation',
      items: [
        {
          label_de: 'Reifentemperatur',
          label_en: 'Tyre temperature',
          value_de: 'Oberfläche & Karkasse (Vorschlag)',
          value_en: 'Surface & carcass (proposal)',
        },
        {
          label_de: 'Fahrzeugschaden',
          label_en: 'Car damage',
          value_de: 'Simulation (Vorschlag)',
          value_en: 'Simulation (proposal)',
        },
        {
          label_de: 'Schadensrate',
          label_en: 'Damage rate',
          value_de: 'Standard (Vorschlag)',
          value_en: 'Standard (proposal)',
        },
        {
          label_de: 'Verschleiß von Bauteilen',
          label_en: 'Component wear',
          value_de: 'Aus (Vorschlag)',
          value_en: 'Off (proposal)',
        },
        {
          label_de: 'Kraftstoffverbrauch',
          label_en: 'Fuel usage',
          value_de: 'Realistisch (Vorschlag)',
          value_en: 'Realistic (proposal)',
        },
        {
          label_de: 'Fahrzeug-Setups',
          label_en: 'Car setups',
          value_de: 'Frei (Parc fermé nach dem Qualifying)',
          value_en: 'Free (parc fermé after qualifying)',
        },
        {
          label_de: 'Boxenstopp-Simulation',
          label_en: 'Pit stop experience',
          value_de: 'Automatisch (Vorschlag)',
          value_en: 'Automatic (proposal)',
        },
        {
          label_de: 'Rennstart',
          label_en: 'Race starts',
          value_de: 'Manuell (Vorschlag)',
          value_en: 'Manual (proposal)',
        },
        {
          label_de: 'Streckenentwicklung (Grip)',
          label_en: 'Track evolution (grip)',
          value_de: 'Realistisch (Vorschlag)',
          value_en: 'Realistic (proposal)',
        },
        {
          label_de: 'Rückspulen (Flashbacks)',
          label_en: 'Flashbacks',
          value_de: 'Aus',
          value_en: 'Off',
        },
      ],
    },
  ],
  join_steps_de: LOBBY_JOIN_STEPS_DE,
  join_steps_en: LOBBY_JOIN_STEPS_EN,
};
