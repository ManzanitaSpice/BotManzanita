import { economyCommand } from './economy.js';
import { economyShortcutCommands } from './economy-shortcuts.js';
import { musicCommand } from './music.js';
import { musicShortcutCommands } from './music-shortcuts.js';
import { rpgCommand } from './rpg.js';
import { adminCommand } from './admin.js';
import { catalogCommand } from './catalog.js';
import { utilitiesCommand } from './utilities.js';
import { wordResponsesCommand } from './word-responses.js';
import { streamsCommand } from './streams.js';
// Keep runtime dispatch and Discord command deployment on one source of truth.
export const commands = [
    economyCommand,
    rpgCommand,
    adminCommand,
    catalogCommand,
    utilitiesCommand,
    wordResponsesCommand,
    streamsCommand,
    musicCommand,
    ...economyShortcutCommands,
    ...musicShortcutCommands,
];
