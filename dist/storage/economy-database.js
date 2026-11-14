import mysql from 'mysql2/promise';
import { config } from '../config.js';
import { ECONOMY_STARTING_BALANCE } from './economy-defaults.js';
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
      PRIMARY KEY (guild_id, user_id)
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
    const [balanceChecks] = await economyPool.execute('SELECT CONSTRAINT_NAME AS constraintName FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=? AND TABLE_NAME=? AND CONSTRAINT_NAME=? AND CONSTRAINT_TYPE=? LIMIT 1', [config.economyDatabase.name, 'economy_accounts', 'chk_economy_balance_nonnegative', 'CHECK']);
    if (balanceChecks.length)
        await economyPool.query('ALTER TABLE economy_accounts DROP CHECK chk_economy_balance_nonnegative');
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
    await economyPool.query(`
    CREATE TABLE IF NOT EXISTS economy_loans (
      guild_id VARCHAR(32) NOT NULL,
      user_id VARCHAR(32) NOT NULL,
      principal BIGINT NOT NULL,
      balance_due BIGINT NOT NULL,
      origination_fee BIGINT NOT NULL DEFAULT 0,
      interest_amount BIGINT NOT NULL DEFAULT 0,
      apr_bps INT UNSIGNED NOT NULL,
      created_at BIGINT NOT NULL,
      due_at BIGINT NOT NULL,
      late_fee_periods INT UNSIGNED NOT NULL DEFAULT 0,
      bankrupt_at BIGINT NULL,
      foreclosure_at BIGINT NULL,
      foreclosed_at BIGINT NULL,
      collateral_value BIGINT UNSIGNED NOT NULL DEFAULT 0,
      reference VARCHAR(191) NOT NULL,
      PRIMARY KEY (guild_id,user_id),
      UNIQUE KEY uq_economy_loans_reference (reference),
      KEY idx_economy_loans_due (due_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
    await ensureColumn('economy_loans', 'bankrupt_at', 'BIGINT NULL');
    await ensureColumn('economy_loans', 'foreclosure_at', 'BIGINT NULL');
    await ensureColumn('economy_loans', 'foreclosed_at', 'BIGINT NULL');
    await ensureColumn('economy_loans', 'collateral_value', 'BIGINT UNSIGNED NOT NULL DEFAULT 0');
    await economyPool.query(`
    CREATE TABLE IF NOT EXISTS economy_loan_foreclosures (
      guild_id VARCHAR(32) NOT NULL,
      user_id VARCHAR(32) NOT NULL,
      loan_created_at BIGINT NOT NULL,
      job_id VARCHAR(32) NOT NULL,
      collateral_value BIGINT UNSIGNED NOT NULL,
      applied_to_debt BIGINT UNSIGNED NOT NULL,
      cash_surplus BIGINT UNSIGNED NOT NULL DEFAULT 0,
      foreclosed_at BIGINT NOT NULL,
      PRIMARY KEY (guild_id,user_id,loan_created_at),
      KEY idx_economy_loan_foreclosures_user_date (guild_id,user_id,foreclosed_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
    await ensureIndex('economy_ledger', 'idx_economy_ledger_scope_time_reason', 'guild_id,created_at,reason');
    await economyPool.query(`
    CREATE TABLE IF NOT EXISTS economy_product_price_policy (
      policy_id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
      price_index_bps SMALLINT UNSIGNED NOT NULL DEFAULT 10000,
      last_rebalanced_at BIGINT NOT NULL DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
    await economyPool.execute('INSERT IGNORE INTO economy_product_price_policy (policy_id,price_index_bps,last_rebalanced_at) VALUES (1,10000,0)');
    await economyPool.query(`
    CREATE TABLE IF NOT EXISTS economy_product_sales (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(32) NOT NULL,
      product_kind VARCHAR(16) NOT NULL,
      product_id VARCHAR(64) NOT NULL,
      category VARCHAR(96) NOT NULL,
      quantity INT UNSIGNED NOT NULL DEFAULT 1,
      unit_price BIGINT NOT NULL,
      reference VARCHAR(191) NOT NULL,
      sold_at BIGINT NOT NULL,
      UNIQUE KEY uq_economy_product_sales_reference (reference),
      KEY idx_economy_product_sales_market (product_kind,category,sold_at,product_id),
      KEY idx_economy_product_sales_time (sold_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
    await economyPool.query(`
    CREATE TABLE IF NOT EXISTS economy_product_price_quotes (
      product_kind VARCHAR(16) NOT NULL,
      product_id VARCHAR(64) NOT NULL,
      category VARCHAR(96) NOT NULL,
      base_price BIGINT NOT NULL,
      current_price BIGINT NOT NULL,
      global_index_bps SMALLINT UNSIGNED NOT NULL,
      demand_index_bps SMALLINT UNSIGNED NOT NULL,
      units_30d BIGINT NOT NULL DEFAULT 0,
      category_size INT UNSIGNED NOT NULL DEFAULT 1,
      quoted_at BIGINT NOT NULL,
      PRIMARY KEY (product_kind,product_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
    await economyPool.query(`
    CREATE TABLE IF NOT EXISTS saved_word_responses (
      guild_id VARCHAR(32) NOT NULL,
      trigger_key VARCHAR(64) NOT NULL,
      trigger_word VARCHAR(64) NOT NULL,
      response TEXT NOT NULL,
      updated_at BIGINT NOT NULL,
      PRIMARY KEY (guild_id,trigger_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
    await economyPool.query(`
    CREATE TABLE IF NOT EXISTS economy_bank_policy (
      policy_id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
      interest_rate_bps SMALLINT UNSIGNED NOT NULL DEFAULT 1200,
      last_rebalanced_at BIGINT NOT NULL DEFAULT 0,
      model_version TINYINT UNSIGNED NOT NULL DEFAULT 4
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
    await ensureColumn('economy_bank_policy', 'model_version', 'TINYINT UNSIGNED NOT NULL DEFAULT 1');
    await economyPool.execute('INSERT IGNORE INTO economy_bank_policy (policy_id,interest_rate_bps,last_rebalanced_at,model_version) VALUES (1,1200,0,4)');
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
      bot_money_growth_bps INT NOT NULL DEFAULT 0,
      purchase_velocity_bps INT UNSIGNED NOT NULL DEFAULT 0,
      savings_share_bps INT UNSIGNED NOT NULL DEFAULT 0,
      projected_money_supply_30d BIGINT NOT NULL DEFAULT 0,
      target_apr_bps SMALLINT UNSIGNED NOT NULL DEFAULT 6500,
      KEY idx_economy_bank_market_history_time (observed_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
    await ensureColumn('economy_bank_market_history', 'bot_money_growth_bps', 'INT NOT NULL DEFAULT 0');
    await ensureColumn('economy_bank_market_history', 'purchase_velocity_bps', 'INT UNSIGNED NOT NULL DEFAULT 0');
    await ensureColumn('economy_bank_market_history', 'savings_share_bps', 'INT UNSIGNED NOT NULL DEFAULT 0');
    await ensureColumn('economy_bank_market_history', 'projected_money_supply_30d', 'BIGINT NOT NULL DEFAULT 0');
    await ensureColumn('economy_bank_market_history', 'target_apr_bps', 'SMALLINT UNSIGNED NOT NULL DEFAULT 6500');
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
    CREATE TABLE IF NOT EXISTS economy_tool_state (
      guild_id VARCHAR(32) NOT NULL,
      user_id VARCHAR(32) NOT NULL,
      tool_id VARCHAR(64) NOT NULL,
      durability SMALLINT UNSIGNED NOT NULL DEFAULT 0,
      max_durability SMALLINT UNSIGNED NOT NULL DEFAULT 0,
      upgrade_level TINYINT UNSIGNED NOT NULL DEFAULT 0,
      updated_at BIGINT NOT NULL,
      PRIMARY KEY (guild_id,user_id,tool_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
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
    CREATE TABLE IF NOT EXISTS economy_businesses (
      guild_id VARCHAR(32) NOT NULL,
      owner_id VARCHAR(32) NOT NULL,
      job_id VARCHAR(32) NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'land',
      level TINYINT UNSIGNED NOT NULL DEFAULT 1,
      construction_complete_at BIGINT NULL,
      debt BIGINT UNSIGNED NOT NULL DEFAULT 0,
      investment_value BIGINT UNSIGNED NOT NULL DEFAULT 0,
      mortgaged_at BIGINT NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      PRIMARY KEY (guild_id, owner_id),
      KEY idx_economy_businesses_status (guild_id, status, job_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
    await ensureColumn('economy_businesses', 'investment_value', 'BIGINT UNSIGNED NOT NULL DEFAULT 0');
    await ensureColumn('economy_businesses', 'mortgaged_at', 'BIGINT NULL');
    await economyPool.query(`
    CREATE TABLE IF NOT EXISTS economy_business_events (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      guild_id VARCHAR(32) NOT NULL,
      owner_id VARCHAR(32) NOT NULL,
      event_type VARCHAR(16) NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'pending',
      amount BIGINT NOT NULL,
      created_at BIGINT NOT NULL,
      resolved_at BIGINT NULL,
      reference VARCHAR(191) NOT NULL,
      UNIQUE KEY uq_economy_business_events_reference (reference),
      KEY idx_economy_business_events_pending (guild_id, owner_id, status, event_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
    await economyPool.query(`
    CREATE TABLE IF NOT EXISTS economy_business_employees (
      guild_id VARCHAR(32) NOT NULL,
      owner_id VARCHAR(32) NOT NULL,
      employee_key VARCHAR(48) NOT NULL,
      employee_user_id VARCHAR(32) NULL,
      employee_name VARCHAR(80) NOT NULL,
      kind VARCHAR(8) NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'active',
      created_at BIGINT NOT NULL,
      PRIMARY KEY (guild_id, owner_id, employee_key),
      KEY idx_economy_business_employees_user (guild_id, employee_user_id, status),
      UNIQUE KEY uq_economy_business_employee_contract (guild_id, employee_user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
    await economyPool.query(`
    CREATE TABLE IF NOT EXISTS economy_business_shifts (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      guild_id VARCHAR(32) NOT NULL,
      owner_id VARCHAR(32) NOT NULL,
      worker_id VARCHAR(32) NOT NULL,
      gross BIGINT NOT NULL,
      utilities_due BIGINT NOT NULL,
      utilities_paid BIGINT NOT NULL,
      wages_paid BIGINT NOT NULL,
      net BIGINT NOT NULL,
      worked_at BIGINT NOT NULL,
      KEY idx_economy_business_shifts_owner_time (guild_id, owner_id, worked_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
    await economyPool.query(`
    CREATE TABLE IF NOT EXISTS economy_business_buffs (
      guild_id VARCHAR(32) NOT NULL,
      user_id VARCHAR(32) NOT NULL,
      uses TINYINT UNSIGNED NOT NULL DEFAULT 0,
      updated_at BIGINT NOT NULL,
      PRIMARY KEY (guild_id, user_id)
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
    CREATE TABLE IF NOT EXISTS economy_rooster_duels (
      id VARCHAR(32) NOT NULL PRIMARY KEY,
      guild_id VARCHAR(32) NOT NULL,
      challenger_id VARCHAR(32) NOT NULL,
      defender_id VARCHAR(32) NOT NULL,
      bet BIGINT UNSIGNED NOT NULL,
      status VARCHAR(16) NOT NULL,
      expires_at BIGINT NOT NULL,
      state_json LONGTEXT NOT NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      KEY idx_economy_rooster_pending (guild_id,status,expires_at),
      KEY idx_economy_rooster_challenger (guild_id,challenger_id,status),
      KEY idx_economy_rooster_defender (guild_id,defender_id,status)
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
async function ensureColumn(table, column, definition) {
    if (!economyPool)
        return;
    const [rows] = await economyPool.execute('SELECT 1 FROM information_schema.columns WHERE table_schema = ? AND table_name = ? AND column_name = ? LIMIT 1', [config.economyDatabase.name, table, column]);
    if (!rows.length)
        await economyPool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
}
async function ensureIndex(table, index, definition) {
    if (!economyPool)
        return;
    const [rows] = await economyPool.execute('SELECT 1 FROM information_schema.statistics WHERE table_schema=? AND table_name=? AND index_name=? LIMIT 1', [config.economyDatabase.name, table, index]);
    if (!rows.length)
        await economyPool.query(`CREATE INDEX \`${index}\` ON \`${table}\` (${definition})`);
}
async function ensureTextColumn(table, column, initialValue) {
    if (!economyPool)
        return;
    const [rows] = await economyPool.execute('SELECT IS_NULLABLE FROM information_schema.columns WHERE table_schema = ? AND table_name = ? AND column_name = ? LIMIT 1', [config.economyDatabase.name, table, column]);
    if (!rows.length)
        await economyPool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` TEXT NULL`);
    if (!rows.length || rows[0].IS_NULLABLE === 'YES') {
        await economyPool.execute(`UPDATE \`${table}\` SET \`${column}\` = ? WHERE \`${column}\` IS NULL`, [initialValue]);
        await economyPool.query(`ALTER TABLE \`${table}\` MODIFY COLUMN \`${column}\` TEXT NOT NULL`);
    }
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
