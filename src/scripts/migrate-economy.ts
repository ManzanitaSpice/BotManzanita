import { db } from '../storage/database.js';
import { economyPool, initializeEconomyDatabase, withEconomyTransaction } from '../storage/economy-database.js';

type LegacyAccount = {
  guild_id: string; user_id: string; balance: number; bank_balance: number; last_daily_at: number | null;
  last_work_at: number | null; last_fish_at: number | null; last_rob_at: number | null; last_crime_at: number | null;
  last_bank_interest_at: number | null; bank_interest_remainder: number; rob_protected_until: number | null;
  created_at: number; updated_at: number;
};
type LegacyLedger = { guild_id: string; user_id: string; amount: number; reason: string; reference: string | null; created_at: number };
type LegacyItem = { guild_id: string; user_id: string; item_id: string; quantity: number; acquired_at: number };
type LegacyItemMovement = { guild_id: string; user_id: string; item_id: string; quantity_delta: number; reason: string; reference: string; created_at: number };
type LegacyJob = { guild_id: string; user_id: string; job_id: string; level: number; xp: number; is_active: number; created_at: number; updated_at: number };

if (!economyPool) throw new Error('Configura ECONOMY_DB_DRIVER=mysql antes de migrar la economía.');

await initializeEconomyDatabase();
const accounts = db.prepare(`SELECT guild_id, user_id, balance, bank_balance, last_daily_at, last_work_at,
  last_fish_at, last_rob_at, last_crime_at, last_bank_interest_at, bank_interest_remainder, rob_protected_until,
  created_at, updated_at FROM economy_accounts`).all() as LegacyAccount[];
const ledger = db.prepare('SELECT guild_id, user_id, amount, reason, reference, created_at FROM economy_ledger ORDER BY id').all() as LegacyLedger[];
const inventory = db.prepare('SELECT guild_id, user_id, item_id, quantity, acquired_at FROM economy_inventory').all() as LegacyItem[];
const itemMovements = db.prepare(`SELECT guild_id, user_id, item_id, quantity_delta, reason, reference, created_at
  FROM economy_item_ledger ORDER BY id`).all() as LegacyItemMovement[];
const jobs = db.prepare('SELECT guild_id,user_id,job_id,level,xp,is_active,created_at,updated_at FROM economy_jobs').all() as LegacyJob[];

await withEconomyTransaction(async (connection) => {
  for (const account of accounts) {
    await connection.execute(`INSERT IGNORE INTO economy_accounts
      (guild_id, user_id, balance, bank_balance, last_daily_at, last_work_at, last_fish_at, last_rob_at, last_crime_at,
       last_bank_interest_at, bank_interest_remainder, rob_protected_until, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [account.guild_id, account.user_id, account.balance, account.bank_balance,
      account.last_daily_at, account.last_work_at, account.last_fish_at, account.last_rob_at, account.last_crime_at,
      account.last_bank_interest_at, account.bank_interest_remainder, account.rob_protected_until,
      account.created_at, account.updated_at]);
  }
  for (const entry of ledger) {
    await connection.execute(`INSERT IGNORE INTO economy_ledger
      (guild_id, user_id, amount, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [entry.guild_id, entry.user_id, entry.amount, entry.reason, entry.reference, entry.created_at]);
  }
  for (const item of inventory) {
    await connection.execute('INSERT IGNORE INTO economy_inventory (guild_id, user_id, item_id, quantity, acquired_at) VALUES (?, ?, ?, ?, ?)',
      [item.guild_id, item.user_id, item.item_id, item.quantity, item.acquired_at]);
  }
  for (const movement of itemMovements) {
    await connection.execute(`INSERT IGNORE INTO economy_item_ledger
      (guild_id, user_id, item_id, quantity_delta, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [movement.guild_id, movement.user_id, movement.item_id, movement.quantity_delta, movement.reason,
      movement.reference, movement.created_at]);
  }
  for (const job of jobs) {
    await connection.execute(`INSERT IGNORE INTO economy_jobs
      (guild_id,user_id,job_id,level,xp,is_active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`,
    [job.guild_id, job.user_id, job.job_id, job.level, job.xp, job.is_active, job.created_at, job.updated_at]);
  }
});

console.log(`Migración idempotente terminada: ${accounts.length} cuentas, ${ledger.length} movimientos de monedas, ${inventory.length} artículos, ${itemMovements.length} movimientos de artículos y ${jobs.length} oficios revisados.`);
db.close();
await economyPool.end();
