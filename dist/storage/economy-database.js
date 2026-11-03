import mysql from 'mysql2/promise';
import { config } from '../config.js';
export const economyPool = config.economyDatabase.driver === 'mysql'
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
export async function initializeEconomyDatabase() {
    if (!economyPool)
        return;
    const { host, user, name } = config.economyDatabase;
    if (!host || !user || !name || !config.economyDatabase.password) {
        throw new Error('Faltan ECONOMY_DB_ENDPOINT (o ECONOMY_DB_HOST), ECONOMY_DB_USER, ECONOMY_DB_PASSWORD o ECONOMY_DB_NAME.');
    }
    await economyPool.query(`
    CREATE TABLE IF NOT EXISTS economy_accounts (
      guild_id VARCHAR(32) NOT NULL,
      user_id VARCHAR(32) NOT NULL,
      balance BIGINT NOT NULL DEFAULT 0,
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
      KEY idx_economy_ledger_user (guild_id, user_id, created_at)
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
      last_explore_at BIGINT NULL,
      equipment_json TEXT NOT NULL,
      expedition_effects_json TEXT NOT NULL,
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
    await ensureColumn('rpg_pets', 'expedition_effects_json', "TEXT NOT NULL DEFAULT '{}'");
    await ensureColumn('rpg_pets', 'known_moves_json', "TEXT NOT NULL DEFAULT '[]'");
    await ensureColumn('rpg_pets', 'equipped_moves_json', "TEXT NOT NULL DEFAULT '[]'");
    await ensureColumn('rpg_pets', 'move_points', 'INT NOT NULL DEFAULT 0');
    await ensureColumn('rpg_pets', 'free_name_used', 'TINYINT(1) NOT NULL DEFAULT 0');
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
async function ensureColumn(table, column, definition) {
    if (!economyPool)
        return;
    const [rows] = await economyPool.execute('SELECT 1 FROM information_schema.columns WHERE table_schema = ? AND table_name = ? AND column_name = ? LIMIT 1', [config.economyDatabase.name, table, column]);
    if (!rows.length)
        await economyPool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
}
export async function withEconomyTransaction(operation) {
    if (!economyPool)
        throw new Error('MySQL de economía no está configurado.');
    const connection = await economyPool.getConnection();
    try {
        await connection.beginTransaction();
        const result = await operation(connection);
        await connection.commit();
        return result;
    }
    catch (error) {
        await connection.rollback();
        throw error;
    }
    finally {
        connection.release();
    }
}
export async function insertLedger(connection, entry) {
    await connection.execute('INSERT INTO economy_ledger (guild_id, user_id, amount, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?)', [entry.guildId, entry.userId, entry.amount, entry.reason, entry.reference, entry.createdAt]);
}
export async function insertItemLedger(connection, entry) {
    await connection.execute('INSERT INTO economy_item_ledger (guild_id, user_id, item_id, quantity_delta, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [entry.guildId, entry.userId, entry.itemId, entry.quantityDelta, entry.reason, entry.reference, entry.createdAt]);
}
