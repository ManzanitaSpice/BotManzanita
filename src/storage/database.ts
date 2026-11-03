import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { config } from '../config.js';

const filename = resolve(config.databasePath);
mkdirSync(dirname(filename), { recursive: true });

export const db = new Database(filename);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS economy_accounts (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
    bank_balance INTEGER NOT NULL DEFAULT 0 CHECK (bank_balance >= 0),
    last_daily_at INTEGER,
    last_work_at INTEGER,
    last_fish_at INTEGER,
    last_rob_at INTEGER,
    last_crime_at INTEGER,
    last_bank_interest_at INTEGER,
    bank_interest_remainder INTEGER NOT NULL DEFAULT 0,
    rob_protected_until INTEGER,
    premium_balance INTEGER NOT NULL DEFAULT 0 CHECK (premium_balance >= 0),
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (guild_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS economy_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    amount INTEGER NOT NULL,
    reason TEXT NOT NULL,
    reference TEXT UNIQUE,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_economy_ledger_user
    ON economy_ledger (guild_id, user_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS admin_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    target_id TEXT,
    action TEXT NOT NULL,
    details_json TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_admin_audit_guild_time
    ON admin_audit_log (guild_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS economy_item_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    quantity_delta INTEGER NOT NULL,
    reason TEXT NOT NULL,
    reference TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS economy_inventory (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    acquired_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (guild_id, user_id, item_id)
  );

  CREATE TABLE IF NOT EXISTS music_favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    track_uri TEXT NOT NULL,
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    artwork_url TEXT,
    saved_at INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE (guild_id, user_id, track_uri)
  );

  CREATE INDEX IF NOT EXISTS idx_music_favorites_user
    ON music_favorites (guild_id, user_id, saved_at DESC);

  CREATE TABLE IF NOT EXISTS music_playlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE (guild_id, user_id, normalized_name)
  );

  CREATE TABLE IF NOT EXISTS music_playlist_tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    playlist_id INTEGER NOT NULL REFERENCES music_playlists(id) ON DELETE CASCADE,
    track_uri TEXT NOT NULL,
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    artwork_url TEXT,
    added_at INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE (playlist_id, track_uri)
  );

  CREATE INDEX IF NOT EXISTS idx_music_playlist_tracks_playlist
    ON music_playlist_tracks (playlist_id, added_at, id);

  CREATE TABLE IF NOT EXISTS economy_games (
    id TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    game_type TEXT NOT NULL,
    bet INTEGER NOT NULL,
    status TEXT NOT NULL,
    state_json TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_economy_games_owner_status
    ON economy_games (guild_id, user_id, status);

  CREATE TABLE IF NOT EXISTS rpg_pets (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    species TEXT NOT NULL,
    rarity TEXT NOT NULL,
    element TEXT NOT NULL DEFAULT 'Neutral',
    specialization TEXT NOT NULL DEFAULT 'Explorador',
    level INTEGER NOT NULL DEFAULT 1,
    xp INTEGER NOT NULL DEFAULT 0,
    strength INTEGER NOT NULL,
    defense INTEGER NOT NULL,
    agility INTEGER NOT NULL,
    hp INTEGER NOT NULL,
    max_hp INTEGER NOT NULL,
    energy INTEGER NOT NULL DEFAULT 100,
    max_energy INTEGER NOT NULL DEFAULT 100,
    last_explore_at INTEGER,
    equipment_json TEXT NOT NULL DEFAULT '{}',
    expedition_effects_json TEXT NOT NULL DEFAULT '{}',
    known_moves_json TEXT NOT NULL DEFAULT '[]',
    equipped_moves_json TEXT NOT NULL DEFAULT '[]',
    move_points INTEGER NOT NULL DEFAULT 0,
    free_name_used INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (guild_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS rpg_inventory (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    PRIMARY KEY (guild_id, user_id, item_id)
  );

  CREATE TABLE IF NOT EXISTS rpg_quests (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    quest_date TEXT NOT NULL,
    quest_id TEXT NOT NULL,
    progress INTEGER NOT NULL DEFAULT 0,
    claimed INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, user_id, quest_date, quest_id)
  );

  CREATE TABLE IF NOT EXISTS rpg_expedition_logs (
    id TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    zone_id TEXT NOT NULL,
    events_json TEXT NOT NULL,
    coins INTEGER NOT NULL DEFAULT 0,
    xp INTEGER NOT NULL DEFAULT 0,
    item_id TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS rpg_pvp_matches (
    id TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    challenger_id TEXT NOT NULL,
    defender_id TEXT NOT NULL,
    status TEXT NOT NULL,
    state_json TEXT NOT NULL,
    winner_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_rpg_pets_ranking
    ON rpg_pets (guild_id, level DESC, xp DESC);
  CREATE INDEX IF NOT EXISTS idx_rpg_expedition_logs_owner
    ON rpg_expedition_logs (guild_id, user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_rpg_pvp_active_participants
    ON rpg_pvp_matches (guild_id, status, challenger_id, defender_id, updated_at);
`);

for (const [column, definition] of [['element', "TEXT NOT NULL DEFAULT 'Neutral'"], ['specialization', "TEXT NOT NULL DEFAULT 'Explorador'"], ['expedition_effects_json', "TEXT NOT NULL DEFAULT '{}'"], ['known_moves_json', "TEXT NOT NULL DEFAULT '[]'"], ['equipped_moves_json', "TEXT NOT NULL DEFAULT '[]'"], ['move_points', 'INTEGER NOT NULL DEFAULT 0'], ['free_name_used', 'INTEGER NOT NULL DEFAULT 0']] as const) {
  try { db.exec(`ALTER TABLE rpg_pets ADD COLUMN ${column} ${definition}`); }
  catch (error) { if (!(error instanceof Error) || !error.message.includes('duplicate column name')) throw error; }
}
db.exec("UPDATE rpg_pets SET move_points = MAX(level - 1, 0) WHERE move_points = 0 AND level > 1 AND known_moves_json = '[]'");

// Keep local databases created by an earlier version compatible.
try {
  db.exec('ALTER TABLE economy_accounts ADD COLUMN last_work_at INTEGER');
} catch (error) {
  if (!(error instanceof Error) || !error.message.includes('duplicate column name')) throw error;
}

for (const column of ['last_fish_at', 'last_rob_at', 'last_crime_at', 'last_bank_interest_at', 'rob_protected_until']) {
  try {
    db.exec(`ALTER TABLE economy_accounts ADD COLUMN ${column} INTEGER`);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('duplicate column name')) throw error;
  }
}

try {
  db.exec('ALTER TABLE economy_accounts ADD COLUMN bank_interest_remainder INTEGER NOT NULL DEFAULT 0');
} catch (error) {
  if (!(error instanceof Error) || !error.message.includes('duplicate column name')) throw error;
}

try {
  db.exec('ALTER TABLE economy_accounts ADD COLUMN bank_balance INTEGER NOT NULL DEFAULT 0 CHECK (bank_balance >= 0)');
} catch (error) {
  if (!(error instanceof Error) || !error.message.includes('duplicate column name')) throw error;
}

try {
  db.exec('ALTER TABLE economy_accounts ADD COLUMN premium_balance INTEGER NOT NULL DEFAULT 0 CHECK (premium_balance >= 0)');
} catch (error) {
  if (!(error instanceof Error) || !error.message.includes('duplicate column name')) throw error;
}

try {
  db.exec('ALTER TABLE economy_inventory ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 0)');
} catch (error) {
  if (!(error instanceof Error) || !error.message.includes('duplicate column name')) throw error;
}
