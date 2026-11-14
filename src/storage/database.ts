import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { config } from '../config.js';
import { ECONOMY_STARTING_BALANCE } from './economy-defaults.js';

const filename = resolve(config.databasePath);
mkdirSync(dirname(filename), { recursive: true });

export const db = new Database(filename);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS economy_accounts (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    balance INTEGER NOT NULL DEFAULT ${ECONOMY_STARTING_BALANCE},
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

  CREATE TABLE IF NOT EXISTS economy_loans (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    principal INTEGER NOT NULL CHECK (principal > 0),
    balance_due INTEGER NOT NULL CHECK (balance_due >= 0),
    origination_fee INTEGER NOT NULL DEFAULT 0,
    interest_amount INTEGER NOT NULL DEFAULT 0,
    apr_bps INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    due_at INTEGER NOT NULL,
    late_fee_periods INTEGER NOT NULL DEFAULT 0,
    bankrupt_at INTEGER,
    foreclosure_at INTEGER,
    foreclosed_at INTEGER,
    collateral_value INTEGER NOT NULL DEFAULT 0,
    reference TEXT NOT NULL UNIQUE,
    PRIMARY KEY (guild_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS economy_loan_foreclosures (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    loan_created_at INTEGER NOT NULL,
    job_id TEXT NOT NULL,
    collateral_value INTEGER NOT NULL,
    applied_to_debt INTEGER NOT NULL,
    cash_surplus INTEGER NOT NULL DEFAULT 0,
    foreclosed_at INTEGER NOT NULL,
    PRIMARY KEY (guild_id, user_id, loan_created_at)
  );

  CREATE TABLE IF NOT EXISTS economy_product_price_policy (
    policy_id INTEGER PRIMARY KEY CHECK (policy_id = 1),
    price_index_bps INTEGER NOT NULL DEFAULT 10000,
    last_rebalanced_at INTEGER NOT NULL DEFAULT 0
  );

  INSERT OR IGNORE INTO economy_product_price_policy (policy_id, price_index_bps, last_rebalanced_at) VALUES (1, 10000, 0);

  CREATE TABLE IF NOT EXISTS economy_product_sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    product_kind TEXT NOT NULL,
    product_id TEXT NOT NULL,
    category TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price INTEGER NOT NULL,
    reference TEXT NOT NULL UNIQUE,
    sold_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_economy_product_sales_market
    ON economy_product_sales (product_kind, category, sold_at, product_id);

  CREATE INDEX IF NOT EXISTS idx_economy_product_sales_time
    ON economy_product_sales (sold_at);

  CREATE TABLE IF NOT EXISTS economy_product_price_quotes (
    product_kind TEXT NOT NULL,
    product_id TEXT NOT NULL,
    category TEXT NOT NULL,
    base_price INTEGER NOT NULL,
    current_price INTEGER NOT NULL,
    global_index_bps INTEGER NOT NULL,
    demand_index_bps INTEGER NOT NULL,
    units_30d INTEGER NOT NULL DEFAULT 0,
    category_size INTEGER NOT NULL DEFAULT 1,
    quoted_at INTEGER NOT NULL,
    PRIMARY KEY (product_kind, product_id)
  );

  CREATE TABLE IF NOT EXISTS economy_bank_policy (
    policy_id INTEGER PRIMARY KEY CHECK (policy_id = 1),
    interest_rate_bps INTEGER NOT NULL DEFAULT 1200 CHECK (interest_rate_bps >= 1),
    last_rebalanced_at INTEGER NOT NULL DEFAULT 0,
    model_version INTEGER NOT NULL DEFAULT 4
  );

  INSERT OR IGNORE INTO economy_bank_policy (policy_id, interest_rate_bps, last_rebalanced_at, model_version) VALUES (1, 1200, 0, 4);

  CREATE TABLE IF NOT EXISTS economy_bank_rate_history (
    effective_at INTEGER PRIMARY KEY,
    interest_rate_bps INTEGER NOT NULL CHECK (interest_rate_bps >= 1)
  );

  CREATE TABLE IF NOT EXISTS economy_bank_market_history (
    observed_at INTEGER PRIMARY KEY,
    nominal_apr_bps INTEGER NOT NULL,
    effective_annual_bps INTEGER NOT NULL,
    real_yield_bps INTEGER NOT NULL,
    target_real_bps INTEGER NOT NULL,
    inflation_reference_bps INTEGER NOT NULL,
    issuance_pressure_bps INTEGER NOT NULL,
    purchases_pressure_bps INTEGER NOT NULL,
    savings_pressure_bps INTEGER NOT NULL,
    liquidity_pressure_bps INTEGER NOT NULL,
    labor_pressure_bps INTEGER NOT NULL,
    money_supply INTEGER NOT NULL,
    savings INTEGER NOT NULL,
    net_issuance_30d INTEGER NOT NULL,
    purchase_volume_30d INTEGER NOT NULL,
    payroll_30d INTEGER NOT NULL,
    work_shifts_30d INTEGER NOT NULL,
    active_workers INTEGER NOT NULL,
    deposits_24h INTEGER NOT NULL,
    withdrawals_24h INTEGER NOT NULL,
    job_mix_json TEXT NOT NULL,
    bot_money_growth_bps INTEGER NOT NULL DEFAULT 0,
    purchase_velocity_bps INTEGER NOT NULL DEFAULT 0,
    savings_share_bps INTEGER NOT NULL DEFAULT 0,
    projected_money_supply_30d INTEGER NOT NULL DEFAULT 0,
    target_apr_bps INTEGER NOT NULL DEFAULT 6500
  );

  CREATE INDEX IF NOT EXISTS idx_economy_bank_market_history_time
    ON economy_bank_market_history (observed_at DESC);

  CREATE INDEX IF NOT EXISTS idx_economy_ledger_user
    ON economy_ledger (guild_id, user_id, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_economy_ledger_scope_time_reason
    ON economy_ledger (guild_id, created_at, reason);

  CREATE TABLE IF NOT EXISTS saved_word_responses (
    guild_id TEXT NOT NULL,
    trigger_key TEXT NOT NULL,
    trigger_word TEXT NOT NULL,
    response TEXT NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (guild_id, trigger_key)
  );

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

  CREATE TABLE IF NOT EXISTS economy_tool_state (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    tool_id TEXT NOT NULL,
    durability INTEGER NOT NULL DEFAULT 0 CHECK (durability >= 0),
    max_durability INTEGER NOT NULL DEFAULT 0 CHECK (max_durability >= 0),
    upgrade_level INTEGER NOT NULL DEFAULT 0 CHECK (upgrade_level >= 0 AND upgrade_level <= 3),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (guild_id, user_id, tool_id)
  );

  CREATE TABLE IF NOT EXISTS economy_jobs (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    job_id TEXT NOT NULL,
    level INTEGER NOT NULL DEFAULT 1,
    xp INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (guild_id, user_id, job_id)
  );
  CREATE INDEX IF NOT EXISTS idx_economy_jobs_active
    ON economy_jobs (guild_id, user_id, is_active);

  CREATE TABLE IF NOT EXISTS economy_businesses (
    guild_id TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    job_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'land',
    level INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1 AND level <= 10),
    construction_complete_at INTEGER,
    debt INTEGER NOT NULL DEFAULT 0 CHECK (debt >= 0),
    investment_value INTEGER NOT NULL DEFAULT 0 CHECK (investment_value >= 0),
    mortgaged_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (guild_id, owner_id)
  );
  CREATE INDEX IF NOT EXISTS idx_economy_businesses_status
    ON economy_businesses (guild_id, status, job_id);

  CREATE TABLE IF NOT EXISTS economy_business_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    amount INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    resolved_at INTEGER,
    reference TEXT NOT NULL UNIQUE
  );
  CREATE INDEX IF NOT EXISTS idx_economy_business_events_pending
    ON economy_business_events (guild_id, owner_id, status, event_type);

  CREATE TABLE IF NOT EXISTS economy_business_employees (
    guild_id TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    employee_key TEXT NOT NULL,
    employee_user_id TEXT,
    employee_name TEXT NOT NULL,
    kind TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at INTEGER NOT NULL,
    PRIMARY KEY (guild_id, owner_id, employee_key)
  );
  CREATE INDEX IF NOT EXISTS idx_economy_business_employees_user
    ON economy_business_employees (guild_id, employee_user_id, status);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_economy_business_employee_contract
    ON economy_business_employees (guild_id, employee_user_id);

  CREATE TABLE IF NOT EXISTS economy_business_shifts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    worker_id TEXT NOT NULL,
    gross INTEGER NOT NULL,
    utilities_due INTEGER NOT NULL,
    utilities_paid INTEGER NOT NULL,
    wages_paid INTEGER NOT NULL,
    net INTEGER NOT NULL,
    worked_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_economy_business_shifts_owner_time
    ON economy_business_shifts (guild_id, owner_id, worked_at);

  CREATE TABLE IF NOT EXISTS economy_business_buffs (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    uses INTEGER NOT NULL DEFAULT 0 CHECK (uses >= 0 AND uses <= 2),
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (guild_id, user_id)
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

  CREATE TABLE IF NOT EXISTS music_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    track_uri TEXT NOT NULL,
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    artwork_url TEXT,
    played_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_music_history_user
    ON music_history (guild_id, user_id, played_at DESC, id DESC);

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
    added_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_music_playlist_tracks_playlist
    ON music_playlist_tracks (playlist_id, added_at, id);

  CREATE TABLE IF NOT EXISTS music_queue_store (
    guild_id TEXT PRIMARY KEY,
    queue_json TEXT NOT NULL,
    voice_channel_id TEXT,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

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

  CREATE TABLE IF NOT EXISTS economy_rooster_duels (
    id TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    challenger_id TEXT NOT NULL,
    defender_id TEXT NOT NULL,
    bet INTEGER NOT NULL CHECK (bet > 0),
    status TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    state_json TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_economy_rooster_pending
    ON economy_rooster_duels (guild_id, status, expires_at);
  CREATE INDEX IF NOT EXISTS idx_economy_rooster_challenger
    ON economy_rooster_duels (guild_id, challenger_id, status);
  CREATE INDEX IF NOT EXISTS idx_economy_rooster_defender
    ON economy_rooster_duels (guild_id, defender_id, status);

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
    hunger INTEGER NOT NULL DEFAULT 80,
    affection INTEGER NOT NULL DEFAULT 60,
    needs_updated_at INTEGER NOT NULL DEFAULT 0,
    last_care_at INTEGER,
    last_explore_at INTEGER,
    last_battle_at INTEGER,
    last_train_at INTEGER,
    daily_xp INTEGER NOT NULL DEFAULT 0,
    daily_xp_date TEXT NOT NULL DEFAULT '',
    equipment_json TEXT NOT NULL DEFAULT '{}',
    expedition_effects_json TEXT NOT NULL DEFAULT '{}',
    expedition_memory_json TEXT NOT NULL DEFAULT '{}',
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

try {
  db.exec('ALTER TABLE economy_bank_policy ADD COLUMN model_version INTEGER NOT NULL DEFAULT 1');
} catch (error) {
  if (!(error instanceof Error) || !error.message.includes('duplicate column name')) throw error;
}

for (const [table, column, definition] of [
  ['economy_loans', 'bankrupt_at', 'INTEGER'],
  ['economy_loans', 'foreclosure_at', 'INTEGER'],
  ['economy_loans', 'foreclosed_at', 'INTEGER'],
  ['economy_loans', 'collateral_value', 'INTEGER NOT NULL DEFAULT 0'],
  ['economy_businesses', 'investment_value', 'INTEGER NOT NULL DEFAULT 0'],
  ['economy_businesses', 'mortgaged_at', 'INTEGER'],
] as const) {
  try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`); }
  catch (error) { if (!(error instanceof Error) || !error.message.includes('duplicate column name')) throw error; }
}

for (const [column, definition] of [
  ['bot_money_growth_bps', 'INTEGER NOT NULL DEFAULT 0'],
  ['purchase_velocity_bps', 'INTEGER NOT NULL DEFAULT 0'],
  ['savings_share_bps', 'INTEGER NOT NULL DEFAULT 0'],
  ['projected_money_supply_30d', 'INTEGER NOT NULL DEFAULT 0'],
  ['target_apr_bps', 'INTEGER NOT NULL DEFAULT 6500'],
] as const) {
  try {
    db.exec(`ALTER TABLE economy_bank_market_history ADD COLUMN ${column} ${definition}`);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('duplicate column name')) throw error;
  }
}

const playlistTrackIndexes = db.prepare("PRAGMA index_list('music_playlist_tracks')").all() as Array<{ unique: number; origin: string }>;
if (playlistTrackIndexes.some((index) => index.unique === 1 && index.origin === 'u')) {
  const migratePlaylistTracks = db.transaction(() => {
    db.exec(`
      CREATE TABLE music_playlist_tracks_rebuild (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        playlist_id INTEGER NOT NULL REFERENCES music_playlists(id) ON DELETE CASCADE,
        track_uri TEXT NOT NULL,
        title TEXT NOT NULL,
        author TEXT NOT NULL,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        artwork_url TEXT,
        added_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
      INSERT INTO music_playlist_tracks_rebuild
        (id, playlist_id, track_uri, title, author, duration_ms, artwork_url, added_at)
        SELECT id, playlist_id, track_uri, title, author, duration_ms, artwork_url, added_at
        FROM music_playlist_tracks;
      DROP TABLE music_playlist_tracks;
      ALTER TABLE music_playlist_tracks_rebuild RENAME TO music_playlist_tracks;
      CREATE INDEX idx_music_playlist_tracks_playlist
        ON music_playlist_tracks (playlist_id, added_at, id);
    `);
  });
  migratePlaylistTracks.immediate();
}

for (const [column, definition] of [['element', "TEXT NOT NULL DEFAULT 'Neutral'"], ['specialization', "TEXT NOT NULL DEFAULT 'Explorador'"], ['hunger', 'INTEGER NOT NULL DEFAULT 80'], ['affection', 'INTEGER NOT NULL DEFAULT 60'], ['needs_updated_at', 'INTEGER NOT NULL DEFAULT 0'], ['last_care_at', 'INTEGER'], ['last_battle_at', 'INTEGER'], ['last_train_at', 'INTEGER'], ['daily_xp', 'INTEGER NOT NULL DEFAULT 0'], ['daily_xp_date', "TEXT NOT NULL DEFAULT ''"], ['expedition_effects_json', "TEXT NOT NULL DEFAULT '{}'"], ['expedition_memory_json', "TEXT NOT NULL DEFAULT '{}'"], ['known_moves_json', "TEXT NOT NULL DEFAULT '[]'"], ['equipped_moves_json', "TEXT NOT NULL DEFAULT '[]'"], ['move_points', 'INTEGER NOT NULL DEFAULT 0'], ['free_name_used', 'INTEGER NOT NULL DEFAULT 0']] as const) {
  try { db.exec(`ALTER TABLE rpg_pets ADD COLUMN ${column} ${definition}`); }
  catch (error) { if (!(error instanceof Error) || !error.message.includes('duplicate column name')) throw error; }
}
db.exec('UPDATE rpg_pets SET needs_updated_at = unixepoch() WHERE needs_updated_at = 0');
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

const economyAccountsSchema = db.prepare("SELECT sql FROM sqlite_schema WHERE type='table' AND name='economy_accounts'").get() as { sql: string } | undefined;
if (economyAccountsSchema?.sql && /CHECK\s*\(\s*balance\s*>=\s*0\s*\)/i.test(economyAccountsSchema.sql)) {
  const accountIndexesAndTriggers = db.prepare("SELECT sql FROM sqlite_schema WHERE tbl_name='economy_accounts' AND type IN ('index','trigger') AND sql IS NOT NULL").all() as Array<{ sql: string }>;
  const foreignKeysWereEnabled = Boolean(db.pragma('foreign_keys', { simple: true }));
  if (foreignKeysWereEnabled) db.pragma('foreign_keys = OFF');
  try {
    const migrateEconomyAccountBalance = db.transaction(() => {
      db.exec(`
        CREATE TABLE economy_accounts_rebuild (
          guild_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          balance INTEGER NOT NULL DEFAULT ${ECONOMY_STARTING_BALANCE},
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
        INSERT INTO economy_accounts_rebuild
          (guild_id,user_id,balance,bank_balance,last_daily_at,last_work_at,last_fish_at,last_rob_at,last_crime_at,last_bank_interest_at,bank_interest_remainder,rob_protected_until,premium_balance,created_at,updated_at)
        SELECT guild_id,user_id,balance,bank_balance,last_daily_at,last_work_at,last_fish_at,last_rob_at,last_crime_at,last_bank_interest_at,bank_interest_remainder,rob_protected_until,premium_balance,created_at,updated_at
        FROM economy_accounts;
        DROP TABLE economy_accounts;
        ALTER TABLE economy_accounts_rebuild RENAME TO economy_accounts;
      `);
      for (const { sql } of accountIndexesAndTriggers) db.exec(sql);
      const violations = db.pragma('foreign_key_check') as unknown[];
      if (violations.length) throw new Error('La migración de economy_accounts produjo violaciones de claves foráneas.');
    });
    migrateEconomyAccountBalance.immediate();
  } finally {
    if (foreignKeysWereEnabled) db.pragma('foreign_keys = ON');
  }
}

try {
  db.exec('ALTER TABLE economy_inventory ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 0)');
} catch (error) {
  if (!(error instanceof Error) || !error.message.includes('duplicate column name')) throw error;
}

try {
  db.exec('ALTER TABLE music_queue_store ADD COLUMN voice_channel_id TEXT');
} catch (error) {
  if (!(error instanceof Error) || !error.message.includes('duplicate column name')) throw error;
}
