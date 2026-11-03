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
    last_daily_at INTEGER,
    last_work_at INTEGER,
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
`);

// Keep local databases created by an earlier version compatible.
try {
  db.exec('ALTER TABLE economy_accounts ADD COLUMN last_work_at INTEGER');
} catch (error) {
  if (!(error instanceof Error) || !error.message.includes('duplicate column name')) throw error;
}
