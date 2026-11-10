import mysql, { type Pool, type PoolConnection, type ResultSetHeader, type RowDataPacket } from 'mysql2/promise';
import { config } from '../config.js';
import { ECONOMY_STARTING_BALANCE } from './economy-defaults.js';

export const economyPool: Pool | undefined = config.economyDatabase.driver === 'mysql'
  ? mysql.createPool({
    host: config.economyDatabase.host,
    port: config.economyDatabase.port,
    user: config.economyDatabase.user,
    password: config.economyDatabase.password,
    database: config.economyDatabase.name,
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 8,
    queueLimit: 0,
    supportBigNumbers: true,
    bigNumberStrings: false,
  })
  : undefined;

export async function initializeEconomyDatabase(): Promise<void> {
  if (!economyPool) return;
  const { host, user, name } = config.economyDatabase;
  if (!host || !user || !name || !config.economyDatabase.password) {
    throw new Error('Faltan ECONOMY_DB_ENDPOINT (o ECONOMY_DB_HOST), ECONOMY_DB_USER, ECONOMY_DB_PASSWORD o ECONOMY_DB_NAME.');
  }

  await economyPool.query(`
    CREATE TABLE IF NOT EXISTS economy_accounts (
      guild_id VARCHAR(32) NOT NULL,
      user_id VARCHAR(32) NOT NULL,
      balance BIGINT NOT NULL DEFAULT ${ECONOMY_STARTING_BALANCE},
      bank_balance BIGINT NOT NULL DEFAULT 0,
      last_daily_at BIGINT NULL,
      last_work_at BIGINT NULL,
      last_fish_at BIGINT NULL,
      last_rob_at BIGINT NULL,
      last_crime_at BIGINT NULL,
      last_bank_interest_at BIGINT NULL,
      bank_interest_remainder INT NOT NULL DEFAULT 0,
      rob_protected_until BIGINT NULL,
      premium_balance BIGINT NOT NULL DEFAULT 0,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      PRIMARY KEY (guild_id, user_id),
      CONSTRAINT chk_economy_balance_nonnegative CHECK (balance >= 0)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await ensureColumn('economy_accounts', 'last_work_at', 'BIGINT NULL');
  await ensureColumn('economy_accounts', 'last_fish_at', 'BIGINT NULL');
  await ensureColumn('economy_accounts', 'last_rob_at', 'BIGINT NULL');
  await ensureColumn('economy_accounts', 'last_crime_at', 'BIGINT NULL');
  await ensureColumn('economy_accounts', 'bank_balance', 'BIGINT NOT NULL DEFAULT 0');
  await ensureColumn('economy_accounts', 'last_bank_interest_at', 'BIGINT NULL');
  await ensureColumn('economy_accounts', 'bank_interest_remainder', 'INT NOT NULL DEFAULT 0');
  await ensureColumn('economy_accounts', 'rob_protected_until', 'BIGINT NULL');
  await ensureColumn('economy_accounts', 'premium_balance', 'BIGINT NOT NULL DEFAULT 0');

  await economyPool.query(`
    CREATE TABLE IF NOT EXISTS economy_ledger (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      guild_id VARCHAR(32) NOT NULL,
      user_id VARCHAR(32) NOT NULL,
      amount BIGINT NOT NULL,
      reason VARCHAR(96) NOT NULL,
      reference VARCHAR(191) NULL,
      created_at BIGINT NOT NULL,
      UNIQUE KEY uq_economy_ledger_reference (reference),
      KEY idx_economy_ledger_user (guild_id, user_id, created_at),
      KEY idx_economy_ledger_scope_time_reason (guild_id, created_at, reason)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await ensureIndex('economy_ledger', 'idx_economy_ledger_scope_time_reason', 'guild_id,created_at,reason');
  await economyPool.query(`
    CREATE TABLE IF NOT EXISTS economy_bank_policy (
      policy_id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
      interest_rate_bps SMALLINT UNSIGNED NOT NULL DEFAULT 608,
      last_rebalanced_at BIGINT NOT NULL DEFAULT 0,
      model_version TINYINT UNSIGNED NOT NULL DEFAULT 2
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await ensureColumn('economy_bank_policy', 'model_version', 'TINYINT UNSIGNED NOT NULL DEFAULT 1');
  await economyPool.execute('INSERT IGNORE INTO economy_bank_policy (policy_id,interest_rate_bps,last_rebalanced_at,model_version) VALUES (1,608,0,2)');
  await economyPool.query(`
    CREATE TABLE IF NOT EXISTS economy_bank_rate_history (
      effective_at BIGINT NOT NULL PRIMARY KEY,
      interest_rate_bps SMALLINT UNSIGNED NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await economyPool.query(`
    CREATE TABLE IF NOT EXISTS economy_bank_market_history (
      observed_at BIGINT NOT NULL PRIMARY KEY,
      nominal_apr_bps SMALLINT UNSIGNED NOT NULL,
      effective_annual_bps SMALLINT UNSIGNED NOT NULL,
      real_yield_bps SMALLINT NOT NULL,
      target_real_bps SMALLINT UNSIGNED NOT NULL,
      inflation_reference_bps SMALLINT UNSIGNED NOT NULL,
      issuance_pressure_bps SMALLINT NOT NULL,
      purchases_pressure_bps SMALLINT NOT NULL,
      savings_pressure_bps SMALLINT NOT NULL,
      liquidity_pressure_bps SMALLINT NOT NULL,
      labor_pressure_bps SMALLINT NOT NULL,
      money_supply BIGINT NOT NULL,
      savings BIGINT NOT NULL,
      net_issuance_30d BIGINT NOT NULL,
      purchase_volume_30d BIGINT NOT NULL,
      payroll_30d BIGINT NOT NULL,
      work_shifts_30d INT UNSIGNED NOT NULL,
      active_workers INT UNSIGNED NOT NULL,
      deposits_24h BIGINT NOT NULL,
      withdrawals_24h BIGINT NOT NULL,
      job_mix_json TEXT NOT NULL,
      KEY idx_economy_bank_market_history_time (observed_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await economyPool.query(`
    CREATE TABLE IF NOT EXISTS admin_audit_log (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      guild_id VARCHAR(32) NOT NULL,
      actor_id VARCHAR(32) NOT NULL,
      target_id VARCHAR(32) NULL,
      action VARCHAR(48) NOT NULL,
      details_json TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      KEY idx_admin_audit_guild_time (guild_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await economyPool.query(`
    CREATE TABLE IF NOT EXISTS economy_inventory (
      guild_id VARCHAR(32) NOT NULL,
      user_id VARCHAR(32) NOT NULL,
      item_id VARCHAR(64) NOT NULL,
      quantity BIGINT NOT NULL DEFAULT 1,
      acquired_at BIGINT NOT NULL,
      PRIMARY KEY (guild_id, user_id, item_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await ensureColumn('economy_inventory', 'quantity', 'BIGINT NOT NULL DEFAULT 1');
  await economyPool.query(`
    CREATE TABLE IF NOT EXISTS economy_jobs (
      guild_id VARCHAR(32) NOT NULL,
      user_id VARCHAR(32) NOT NULL,
      job_id VARCHAR(32) NOT NULL,
      level INT NOT NULL DEFAULT 1,
      xp INT NOT NULL DEFAULT 0,
      is_active TINYINT(1) NOT NULL DEFAULT 0,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      PRIMARY KEY (guild_id, user_id, job_id),
      KEY idx_economy_jobs_active (guild_id, user_id, is_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await economyPool.query(`
    CREATE TABLE IF NOT EXISTS economy_item_ledger (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      guild_id VARCHAR(32) NOT NULL,
      user_id VARCHAR(32) NOT NULL,
      item_id VARCHAR(64) NOT NULL,
      quantity_delta BIGINT NOT NULL,
      reason VARCHAR(64) NOT NULL,
      reference VARCHAR(191) NOT NULL UNIQUE,
      created_at BIGINT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await economyPool.query(`
    CREATE TABLE IF NOT EXISTS economy_games (
      id VARCHAR(32) NOT NULL PRIMARY KEY,
      guild_id VARCHAR(32) NOT NULL,
      user_id VARCHAR(32) NOT NULL,
      game_type VARCHAR(24) NOT NULL,
      bet BIGINT NOT NULL,
      status VARCHAR(16) NOT NULL,
      state_json LONGTEXT NOT NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      KEY idx_economy_games_owner_status (guild_id, user_id, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await economyPool.query(`
    CREATE TABLE IF NOT EXISTS rpg_pets (
      guild_id VARCHAR(32) NOT NULL,
      user_id VARCHAR(32) NOT NULL,
      name VARCHAR(32) NOT NULL,
      species VARCHAR(32) NOT NULL,
      rarity VARCHAR(16) NOT NULL,
      element VARCHAR(16) NOT NULL DEFAULT 'Neutral',
      specialization VARCHAR(24) NOT NULL DEFAULT 'Explorador',
      level INT NOT NULL DEFAULT 1,
      xp INT NOT NULL DEFAULT 0,
      strength INT NOT NULL,
      defense INT NOT NULL,
      agility INT NOT NULL,
      hp INT NOT NULL,
      max_hp INT NOT NULL,
      energy INT NOT NULL DEFAULT 100,
      max_energy INT NOT NULL DEFAULT 100,
      hunger TINYINT UNSIGNED NOT NULL DEFAULT 80,
      affection TINYINT UNSIGNED NOT NULL DEFAULT 60,
      needs_updated_at BIGINT NOT NULL DEFAULT 0,
      last_care_at BIGINT NULL,
      last_explore_at BIGINT NULL,
      last_battle_at BIGINT NULL,
      last_train_at BIGINT NULL,
      daily_xp INT NOT NULL DEFAULT 0,
      daily_xp_date VARCHAR(10) NOT NULL DEFAULT '',
      equipment_json TEXT NOT NULL,
      expedition_effects_json TEXT NOT NULL,
      expedition_memory_json TEXT NOT NULL,
      known_moves_json TEXT NOT NULL,
      equipped_moves_json TEXT NOT NULL,
      move_points INT NOT NULL DEFAULT 0,
      free_name_used TINYINT(1) NOT NULL DEFAULT 0,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      PRIMARY KEY (guild_id, user_id),
      KEY idx_rpg_pets_ranking (guild_id, level, xp)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await ensureColumn('rpg_pets', 'element', "VARCHAR(16) NOT NULL DEFAULT 'Neutral'");
  await ensureColumn('rpg_pets', 'specialization', "VARCHAR(24) NOT NULL DEFAULT 'Explorador'");
  await ensureColumn('rpg_pets', 'hunger', 'TINYINT UNSIGNED NOT NULL DEFAULT 80');
  await ensureColumn('rpg_pets', 'affection', 'TINYINT UNSIGNED NOT NULL DEFAULT 60');
  await ensureColumn('rpg_pets', 'needs_updated_at', 'BIGINT NOT NULL DEFAULT 0');
  await ensureColumn('rpg_pets', 'last_care_at', 'BIGINT NULL');
  await ensureColumn('rpg_pets', 'last_battle_at', 'BIGINT NULL');
  await ensureColumn('rpg_pets', 'last_train_at', 'BIGINT NULL');
  await ensureColumn('rpg_pets', 'daily_xp', 'INT NOT NULL DEFAULT 0');
  await ensureColumn('rpg_pets', 'daily_xp_date', "VARCHAR(10) NOT NULL DEFAULT ''");
  await ensureTextColumn('rpg_pets', 'expedition_effects_json', '{}');
  await ensureTextColumn('rpg_pets', 'expedition_memory_json', '{}');
  await ensureTextColumn('rpg_pets', 'known_moves_json', '[]');
  await ensureTextColumn('rpg_pets', 'equipped_moves_json', '[]');
  await ensureColumn('rpg_pets', 'move_points', 'INT NOT NULL DEFAULT 0');
  await ensureColumn('rpg_pets', 'free_name_used', 'TINYINT(1) NOT NULL DEFAULT 0');
  await economyPool.query('UPDATE rpg_pets SET needs_updated_at=UNIX_TIMESTAMP() WHERE needs_updated_at=0');
  await economyPool.query("UPDATE rpg_pets SET move_points=GREATEST(level-1,0) WHERE move_points=0 AND level>1 AND known_moves_json='[]'");
  await economyPool.query(`
    CREATE TABLE IF NOT EXISTS rpg_inventory (
      guild_id VARCHAR(32) NOT NULL,
      user_id VARCHAR(32) NOT NULL,
      item_id VARCHAR(48) NOT NULL,
      quantity BIGINT NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, user_id, item_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await economyPool.query(`
    CREATE TABLE IF NOT EXISTS rpg_quests (
      guild_id VARCHAR(32) NOT NULL,
      user_id VARCHAR(32) NOT NULL,
      quest_date DATE NOT NULL,
      quest_id VARCHAR(32) NOT NULL,
      progress INT NOT NULL DEFAULT 0,
      claimed TINYINT(1) NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, user_id, quest_date, quest_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await economyPool.query(`
    CREATE TABLE IF NOT EXISTS rpg_expedition_logs (
      id VARCHAR(32) NOT NULL PRIMARY KEY,
      guild_id VARCHAR(32) NOT NULL,
      user_id VARCHAR(32) NOT NULL,
      zone_id VARCHAR(24) NOT NULL,
      events_json LONGTEXT NOT NULL,
      coins BIGINT NOT NULL DEFAULT 0,
      xp INT NOT NULL DEFAULT 0,
      item_id VARCHAR(48) NULL,
      created_at BIGINT NOT NULL,
      KEY idx_rpg_expedition_logs_owner (guild_id,user_id,created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await economyPool.query(`
    CREATE TABLE IF NOT EXISTS rpg_pvp_matches (
      id VARCHAR(32) NOT NULL PRIMARY KEY,
      guild_id VARCHAR(32) NOT NULL,
      challenger_id VARCHAR(32) NOT NULL,
      defender_id VARCHAR(32) NOT NULL,
      status VARCHAR(16) NOT NULL,
      state_json LONGTEXT NOT NULL,
      winner_id VARCHAR(32) NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      expires_at BIGINT NOT NULL,
      KEY idx_rpg_pvp_active_participants (guild_id,status,challenger_id,defender_id,updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  const connection = await economyPool.getConnection();
  connection.release();
}

async function ensureColumn(table: string, column: string, definition: string): Promise<void> {
  if (!economyPool) return;
  const [rows] = await economyPool.execute<RowDataPacket[]>(
    'SELECT 1 FROM information_schema.columns WHERE table_schema = ? AND table_name = ? AND column_name = ? LIMIT 1',
    [config.economyDatabase.name, table, column],
  );
  if (!rows.length) await economyPool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
}

async function ensureIndex(table: string, index: string, definition: string): Promise<void> {
  if (!economyPool) return;
  const [rows] = await economyPool.execute<RowDataPacket[]>(
    'SELECT 1 FROM information_schema.statistics WHERE table_schema=? AND table_name=? AND index_name=? LIMIT 1',
    [config.economyDatabase.name, table, index],
  );
  if (!rows.length) await economyPool.query(`CREATE INDEX \`${index}\` ON \`${table}\` (${definition})`);
}

async function ensureTextColumn(table: string, column: string, initialValue: string): Promise<void> {
  if (!economyPool) return;
  const [rows] = await economyPool.execute<RowDataPacket[]>(
    'SELECT IS_NULLABLE FROM information_schema.columns WHERE table_schema = ? AND table_name = ? AND column_name = ? LIMIT 1',
    [config.economyDatabase.name, table, column],
  );
  if (!rows.length) await economyPool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` TEXT NULL`);
  if (!rows.length || rows[0]!.IS_NULLABLE === 'YES') {
    await economyPool.execute(`UPDATE \`${table}\` SET \`${column}\` = ? WHERE \`${column}\` IS NULL`, [initialValue]);
    await economyPool.query(`ALTER TABLE \`${table}\` MODIFY COLUMN \`${column}\` TEXT NOT NULL`);
  }
}

export async function withEconomyTransaction<T>(operation: (connection: PoolConnection) => Promise<T>): Promise<T> {
  if (!economyPool) throw new Error('MySQL de economía no está configurado.');
  const connection = await economyPool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await operation(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function insertLedger(
  connection: PoolConnection,
  entry: { guildId: string; userId: string; amount: number; reason: string; reference: string | null; createdAt: number },
): Promise<void> {
  await connection.execute<ResultSetHeader>(
    'INSERT INTO economy_ledger (guild_id, user_id, amount, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [entry.guildId, entry.userId, entry.amount, entry.reason, entry.reference, entry.createdAt],
  );
}

export async function insertItemLedger(
  connection: PoolConnection,
  entry: { guildId: string; userId: string; itemId: string; quantityDelta: number; reason: string; reference: string; createdAt: number },
): Promise<void> {
  await connection.execute<ResultSetHeader>(
    'INSERT INTO economy_item_ledger (guild_id, user_id, item_id, quantity_delta, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [entry.guildId, entry.userId, entry.itemId, entry.quantityDelta, entry.reason, entry.reference, entry.createdAt],
  );
}
