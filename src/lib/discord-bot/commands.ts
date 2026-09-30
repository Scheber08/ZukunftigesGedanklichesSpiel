/**
 * Slash-Befehle des Liga-Bots (Plan Phase 3): Definitionen für die Registrierung bei Discord
 * (scripts/discord-register-commands.ts) und Namen für den Interactions-Endpunkt.
 *
 * Standardnamen Englisch, deutsche Namen/Beschreibungen über name_localizations bzw.
 * description_localizations (Discord zeigt sie Nutzern mit deutscher Client-Sprache):
 *   /next-race  → /naechstes-rennen
 *   /standings  → /wertung [art: Fahrer|Konstrukteure]
 *   /driver     → /fahrer name:<Gamertag>   (Autocomplete)
 *   /role       → /rolle rolle:<Auswahl>    (Autocomplete, nur konfigurierte Selbstrollen)
 *
 * Bewusst ohne Importe: Das Registrierungsskript lädt die Datei direkt mit
 * `node --experimental-strip-types`.
 */

/** Discord-API-Konstanten (nur die benötigten). */
export const InteractionType = { PING: 1, APPLICATION_COMMAND: 2, MESSAGE_COMPONENT: 3, AUTOCOMPLETE: 4, MODAL_SUBMIT: 5 } as const;
export const ResponseType = { PONG: 1, CHANNEL_MESSAGE: 4, DEFERRED_CHANNEL_MESSAGE: 5, AUTOCOMPLETE_RESULT: 8 } as const;
export const OptionType = { STRING: 3, INTEGER: 4 } as const;
export const MessageFlags = { EPHEMERAL: 64 } as const;
/** Kontexte: 0 = Server, 1 = Direktnachricht mit dem Bot */
const CONTEXT_GUILD = 0;
const CONTEXT_BOT_DM = 1;

export const COMMAND_NAMES = {
  nextRace: 'next-race',
  standings: 'standings',
  driver: 'driver',
  role: 'role',
} as const;
export type CommandKey = keyof typeof COMMAND_NAMES;

/** Deutsche Befehlsnamen (falls jemand die Befehle mit deutschen Standardnamen registriert). */
const GERMAN_NAMES: Record<string, CommandKey> = {
  'naechstes-rennen': 'nextRace',
  wertung: 'standings',
  fahrer: 'driver',
  rolle: 'role',
};

/** Befehl aus `data.name` bestimmen (Discord schickt immer den Standardnamen). */
export function commandKey(name: string | undefined | null): CommandKey | null {
  if (!name) return null;
  const hit = (Object.keys(COMMAND_NAMES) as CommandKey[]).find((k) => COMMAND_NAMES[k] === name);
  return hit ?? GERMAN_NAMES[name] ?? null;
}

export interface CommandOptionChoice {
  name: string;
  name_localizations?: Record<string, string>;
  value: string;
}

export interface CommandOption {
  type: number;
  name: string;
  name_localizations?: Record<string, string>;
  description: string;
  description_localizations?: Record<string, string>;
  required?: boolean;
  autocomplete?: boolean;
  choices?: CommandOptionChoice[];
  min_length?: number;
  max_length?: number;
}

export interface CommandDefinition {
  name: string;
  name_localizations: Record<string, string>;
  description: string;
  description_localizations: Record<string, string>;
  type: 1;
  options?: CommandOption[];
  contexts: number[];
  integration_types: number[];
}

/** Optionsnamen (Standard) – der Endpunkt liest die Werte darüber. */
export const OPTION_NAMES = {
  standingsType: 'type',
  driverName: 'name',
  role: 'role',
} as const;

export const COMMANDS: CommandDefinition[] = [
  {
    name: COMMAND_NAMES.nextRace,
    name_localizations: { de: 'naechstes-rennen' },
    description: 'Next race: track, date in your time zone and countdown',
    description_localizations: { de: 'Nächstes Rennen: Strecke, Termin in deiner Zeitzone und Countdown' },
    type: 1,
    contexts: [CONTEXT_GUILD, CONTEXT_BOT_DM],
    integration_types: [0],
  },
  {
    name: COMMAND_NAMES.standings,
    name_localizations: { de: 'wertung' },
    description: 'Current standings (top 10)',
    description_localizations: { de: 'Aktuelle Wertung (Top 10)' },
    type: 1,
    options: [
      {
        type: OptionType.STRING,
        name: OPTION_NAMES.standingsType,
        name_localizations: { de: 'art' },
        description: 'Drivers or constructors',
        description_localizations: { de: 'Fahrer oder Konstrukteure' },
        required: false,
        choices: [
          { name: 'Drivers', name_localizations: { de: 'Fahrer' }, value: 'drivers' },
          { name: 'Constructors', name_localizations: { de: 'Konstrukteure' }, value: 'teams' },
        ],
      },
    ],
    contexts: [CONTEXT_GUILD, CONTEXT_BOT_DM],
    integration_types: [0],
  },
  {
    name: COMMAND_NAMES.driver,
    name_localizations: { de: 'fahrer' },
    description: 'Driver profile: team, number, points and position',
    description_localizations: { de: 'Fahrerprofil: Team, Startnummer, Punkte und Platz' },
    type: 1,
    options: [
      {
        type: OptionType.STRING,
        name: OPTION_NAMES.driverName,
        name_localizations: { de: 'name' },
        description: 'Gamertag',
        description_localizations: { de: 'Gamertag' },
        required: true,
        autocomplete: true,
        min_length: 1,
        max_length: 40,
      },
    ],
    contexts: [CONTEXT_GUILD, CONTEXT_BOT_DM],
    integration_types: [0],
  },
  {
    name: COMMAND_NAMES.role,
    name_localizations: { de: 'rolle' },
    description: 'Add or remove a self-assignable role (e.g. race day ping)',
    description_localizations: { de: 'Selbstrolle an- oder abwählen (z. B. Renntag-Ping)' },
    type: 1,
    options: [
      {
        type: OptionType.STRING,
        name: OPTION_NAMES.role,
        name_localizations: { de: 'rolle' },
        description: 'Role',
        description_localizations: { de: 'Rolle' },
        required: true,
        autocomplete: true,
      },
    ],
    // Rollen gibt es nur auf dem Server
    contexts: [CONTEXT_GUILD],
    integration_types: [0],
  },
];
