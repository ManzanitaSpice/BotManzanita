import { GLOBAL_SCOPE_ID } from '../storage/global-scope.js';
import type { RowDataPacket } from 'mysql2/promise';
import { db } from '../storage/database.js';
import { economyPool, withEconomyTransaction } from '../storage/economy-database.js';
import { getAccountBalances } from './economy.js';
import { getRpgInventory, getRpgPet, type RpgPet } from './rpg.js';

export type AdminCurrency = 'wallet' | 'bank' | 'premium';
const currencyColumn: Record<AdminCurrency, string> = { wallet: 'balance', bank: 'bank_balance', premium: 'premium_balance' };
function timestamp(): number { return Math.floor(Date.now() / 1000); }

export async function adjustAdminCurrency(guildId: string, targetId: string, currency: AdminCurrency, amount: number, actorId: string, reference: string): Promise<
  { ok: true; balance: number; ledgerId: number } | { ok: false; reason: 'invalid_amount' | 'insufficient'; balance: number }
> {
  guildId = GLOBAL_SCOPE_ID;
  if (!Number.isSafeInteger(amount) || amount === 0 || Math.abs(amount) > 1_000_000_000) return { ok: false, reason: 'invalid_amount', balance: 0 };
  const column = currencyColumn[currency]; const at = timestamp();
  if (economyPool) return withEconomyTransaction(async (connection) => {
    await connection.execute('INSERT IGNORE INTO economy_accounts (guild_id,user_id,created_at,updated_at) VALUES (?,?,?,?)', [guildId, targetId, at, at]);
    const [rows] = await connection.execute<RowDataPacket[]>(`SELECT ${column} AS balance FROM economy_accounts WHERE guild_id=? AND user_id=? FOR UPDATE`, [guildId, targetId]);
    const balance = Number(rows[0]?.balance ?? 0);
    if (amount < 0 && balance < -amount) return { ok: false as const, reason: 'insufficient' as const, balance };
    await connection.execute(`UPDATE economy_accounts SET ${column}=${column}+?,updated_at=? WHERE guild_id=? AND user_id=?`, [amount, at, guildId, targetId]);
    const reason = currency === 'premium' ? `premium_admin:${actorId}` : `admin_${currency}:${actorId}`;
    const [insert] = await connection.execute('INSERT INTO economy_ledger (guild_id,user_id,amount,reason,reference,created_at) VALUES (?,?,?,?,?,?)', [guildId, targetId, amount, reason, `admin:${reference}:${currency}`, at]);
    return { ok: true as const, balance: balance + amount, ledgerId: Number((insert as { insertId: number }).insertId) };
  });
  const run = db.transaction(() => {
    db.prepare('INSERT OR IGNORE INTO economy_accounts (guild_id,user_id,created_at,updated_at) VALUES (?,?,?,?)').run(guildId, targetId, at, at);
    const row = db.prepare(`SELECT ${column} AS balance FROM economy_accounts WHERE guild_id=? AND user_id=?`).get(guildId, targetId) as { balance: number };
    const balance = Number(row.balance);
    if (amount < 0 && balance < -amount) return { ok: false as const, reason: 'insufficient' as const, balance };
    db.prepare(`UPDATE economy_accounts SET ${column}=${column}+?,updated_at=? WHERE guild_id=? AND user_id=?`).run(amount, at, guildId, targetId);
    const reason = currency === 'premium' ? `premium_admin:${actorId}` : `admin_${currency}:${actorId}`;
    const inserted = db.prepare('INSERT INTO economy_ledger (guild_id,user_id,amount,reason,reference,created_at) VALUES (?,?,?,?,?,?)').run(guildId, targetId, amount, reason, `admin:${reference}:${currency}`, at);
    return { ok: true as const, balance: balance + amount, ledgerId: Number(inserted.lastInsertRowid) };
  });
  return run.immediate();
}

export async function rollbackAdminCurrency(guildId: string, ledgerId: number, actorId: string): Promise<
  { ok: true; amount: number; currency: AdminCurrency; targetId: string; balance: number } | { ok: false; reason: 'not_found' | 'not_reversible' | 'already_reversed' | 'insufficient' }
> {
  guildId = GLOBAL_SCOPE_ID;
  if (!Number.isSafeInteger(ledgerId) || ledgerId < 1) return { ok: false, reason: 'not_found' };
  const at = timestamp();
  const perform = async (connection: import('mysql2/promise').PoolConnection) => {
    const [rows] = await connection.execute<RowDataPacket[]>('SELECT id,guild_id AS guildId,user_id AS userId,amount,reason FROM economy_ledger WHERE id=? AND guild_id=? FOR UPDATE', [ledgerId, guildId]);
    const entry = rows[0]; if (!entry) return { ok: false as const, reason: 'not_found' as const };
    const reason = String(entry.reason);
    const currency: AdminCurrency | undefined = reason.startsWith('admin_wallet:') ? 'wallet' : reason.startsWith('admin_bank:') ? 'bank' : reason.startsWith('premium_admin:') ? 'premium' : undefined;
    if (!currency) return { ok: false as const, reason: 'not_reversible' as const };
    const [reversals] = await connection.execute<RowDataPacket[]>('SELECT id FROM economy_ledger WHERE reference=? LIMIT 1', [`admin:rollback:${ledgerId}`]);
    if (reversals.length) return { ok: false as const, reason: 'already_reversed' as const };
    const reverse = -Number(entry.amount); const column = currencyColumn[currency];
    const [accounts] = await connection.execute<RowDataPacket[]>(`SELECT ${column} AS balance FROM economy_accounts WHERE guild_id=? AND user_id=? FOR UPDATE`, [guildId, String(entry.userId)]);
    const balance = Number(accounts[0]?.balance ?? 0);
    if (reverse < 0 && balance < -reverse) return { ok: false as const, reason: 'insufficient' as const };
    await connection.execute(`UPDATE economy_accounts SET ${column}=${column}+?,updated_at=? WHERE guild_id=? AND user_id=?`, [reverse, at, guildId, String(entry.userId)]);
    await connection.execute('INSERT INTO economy_ledger (guild_id,user_id,amount,reason,reference,created_at) VALUES (?,?,?,?,?,?)', [guildId, String(entry.userId), reverse, `admin_rollback:${actorId}`, `admin:rollback:${ledgerId}`, at]);
    return { ok: true as const, amount: reverse, currency, targetId: String(entry.userId), balance: balance + reverse };
  };
  if (economyPool) return withEconomyTransaction(perform);
  const run = db.transaction(() => {
    const entry = db.prepare('SELECT id,guild_id AS guildId,user_id AS userId,amount,reason FROM economy_ledger WHERE id=? AND guild_id=?').get(ledgerId, guildId) as { id: number; userId: string; amount: number; reason: string } | undefined;
    if (!entry) return { ok: false as const, reason: 'not_found' as const };
    const currency: AdminCurrency | undefined = entry.reason.startsWith('admin_wallet:') ? 'wallet' : entry.reason.startsWith('admin_bank:') ? 'bank' : entry.reason.startsWith('premium_admin:') ? 'premium' : undefined;
    if (!currency) return { ok: false as const, reason: 'not_reversible' as const };
    if (db.prepare('SELECT id FROM economy_ledger WHERE reference=?').get(`admin:rollback:${ledgerId}`)) return { ok: false as const, reason: 'already_reversed' as const };
    const reverse = -entry.amount; const column = currencyColumn[currency];
    const account = db.prepare(`SELECT ${column} AS balance FROM economy_accounts WHERE guild_id=? AND user_id=?`).get(guildId, entry.userId) as { balance: number } | undefined;
    const balance = Number(account?.balance ?? 0);
    if (reverse < 0 && balance < -reverse) return { ok: false as const, reason: 'insufficient' as const };
    db.prepare(`UPDATE economy_accounts SET ${column}=${column}+?,updated_at=? WHERE guild_id=? AND user_id=?`).run(reverse, at, guildId, entry.userId);
    db.prepare('INSERT INTO economy_ledger (guild_id,user_id,amount,reason,reference,created_at) VALUES (?,?,?,?,?,?)').run(guildId, entry.userId, reverse, `admin_rollback:${actorId}`, `admin:rollback:${ledgerId}`, at);
    return { ok: true as const, amount: reverse, currency, targetId: entry.userId, balance: balance + reverse };
  });
  return run.immediate();
}

export async function grantAdminRpgItem(guildId: string, userId: string, itemId: string, amount: number): Promise<number | undefined> {
  guildId = GLOBAL_SCOPE_ID;
  if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 1_000) return undefined;
  if (economyPool) return withEconomyTransaction(async (connection) => {
    await connection.execute('INSERT IGNORE INTO rpg_inventory (guild_id,user_id,item_id,quantity) VALUES (?,?,?,0)', [guildId, userId, itemId]);
    const [rows] = await connection.execute<RowDataPacket[]>('SELECT quantity FROM rpg_inventory WHERE guild_id=? AND user_id=? AND item_id=? FOR UPDATE', [guildId, userId, itemId]);
    const quantity = Number(rows[0]?.quantity ?? 0) + amount; if (quantity < 0) return undefined;
    if (quantity === 0) await connection.execute('DELETE FROM rpg_inventory WHERE guild_id=? AND user_id=? AND item_id=?', [guildId, userId, itemId]);
    else await connection.execute('UPDATE rpg_inventory SET quantity=? WHERE guild_id=? AND user_id=? AND item_id=?', [quantity, guildId, userId, itemId]);
    return quantity;
  });
  const run = db.transaction(() => {
    db.prepare('INSERT OR IGNORE INTO rpg_inventory (guild_id,user_id,item_id,quantity) VALUES (?,?,?,0)').run(guildId, userId, itemId);
    const current = db.prepare('SELECT quantity FROM rpg_inventory WHERE guild_id=? AND user_id=? AND item_id=?').get(guildId, userId, itemId) as { quantity: number };
    const quantity = current.quantity + amount; if (quantity < 0) return undefined;
    if (quantity === 0) db.prepare('DELETE FROM rpg_inventory WHERE guild_id=? AND user_id=? AND item_id=?').run(guildId, userId, itemId);
    else db.prepare('UPDATE rpg_inventory SET quantity=? WHERE guild_id=? AND user_id=? AND item_id=?').run(quantity, guildId, userId, itemId);
    return quantity;
  });
  return run.immediate();
}

export async function resetAdminCooldown(guildId: string, userId: string, cooldown: 'all' | 'daily' | 'work' | 'fish' | 'rob' | 'crime' | 'explore'): Promise<void> {
  guildId = GLOBAL_SCOPE_ID;
  const columns: Record<Exclude<typeof cooldown, 'all'>, string> = { daily: 'last_daily_at', work: 'last_work_at', fish: 'last_fish_at', rob: 'last_rob_at', crime: 'last_crime_at', explore: 'last_explore_at' };
  const clearPet = cooldown === 'all' || cooldown === 'explore';
  const accountColumns = cooldown === 'all' ? Object.values(columns).filter((column) => column !== 'last_explore_at') : cooldown === 'explore' ? [] : [columns[cooldown]];
  if (economyPool) return withEconomyTransaction(async (connection) => {
    if (accountColumns.length) await connection.execute(`UPDATE economy_accounts SET ${accountColumns.map((column) => `${column}=NULL`).join(',')},updated_at=? WHERE guild_id=? AND user_id=?`, [timestamp(), guildId, userId]);
    if (clearPet) await connection.execute('UPDATE rpg_pets SET last_explore_at=NULL WHERE guild_id=? AND user_id=?', [guildId, userId]);
  });
  const run = db.transaction(() => {
    if (accountColumns.length) db.prepare(`UPDATE economy_accounts SET ${accountColumns.map((column) => `${column}=NULL`).join(',')},updated_at=? WHERE guild_id=? AND user_id=?`).run(timestamp(), guildId, userId);
    if (clearPet) db.prepare('UPDATE rpg_pets SET last_explore_at=NULL WHERE guild_id=? AND user_id=?').run(guildId, userId);
  });
  run.immediate();
}

export async function setAdminRobberyShield(guildId: string, userId: string, hours: number): Promise<number> {
  guildId = GLOBAL_SCOPE_ID;
  if (!Number.isInteger(hours) || hours < 1 || hours > 720) throw new Error('invalid_hours');
  const until = timestamp() + hours * 3600; const at = timestamp();
  if (economyPool) await withEconomyTransaction(async (connection) => {
    await connection.execute('INSERT IGNORE INTO economy_accounts (guild_id,user_id,created_at,updated_at) VALUES (?,?,?,?)', [guildId, userId, at, at]);
    await connection.execute('UPDATE economy_accounts SET rob_protected_until=?,updated_at=? WHERE guild_id=? AND user_id=?', [until, at, guildId, userId]);
  });
  else db.prepare('INSERT INTO economy_accounts (guild_id,user_id,rob_protected_until,created_at,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(guild_id,user_id) DO UPDATE SET rob_protected_until=excluded.rob_protected_until,updated_at=excluded.updated_at').run(guildId, userId, until, at, at);
  return until;
}

export async function inspectAdminUser(guildId: string, userId: string): Promise<{ wallet: number; bank: number; premium: number; pet: RpgPet | undefined; inventory: Array<{ itemId: string; quantity: number }> }> {
  guildId = GLOBAL_SCOPE_ID;
  const [account, pet, inventory] = await Promise.all([getAccountBalances(guildId, userId), getRpgPet(guildId, userId), getRpgInventory(guildId, userId)]);
  return { wallet: account.wallet, bank: account.bank, premium: account.premium, pet, inventory };
}

export async function addAdminAudit(guildId: string, actorId: string, targetId: string | null, action: string, details: Record<string, unknown>): Promise<void> {
  guildId = GLOBAL_SCOPE_ID;
  const at = timestamp(); const payload = JSON.stringify(details);
  if (economyPool) {
    await economyPool.execute('INSERT INTO admin_audit_log (guild_id,actor_id,target_id,action,details_json,created_at) VALUES (?,?,?,?,?,?)', [guildId, actorId, targetId, action, payload, at]);
    return;
  }
  db.prepare('INSERT INTO admin_audit_log (guild_id,actor_id,target_id,action,details_json,created_at) VALUES (?,?,?,?,?,?)').run(guildId, actorId, targetId, action, payload, at);
}

export async function getAdminAudit(guildId: string, limit = 10): Promise<Array<{ id: number; actorId: string; targetId: string | null; action: string; details: string; createdAt: number }>> {
  guildId = GLOBAL_SCOPE_ID;
  if (economyPool) {
    const [rows] = await economyPool.execute<RowDataPacket[]>('SELECT id,actor_id AS actorId,target_id AS targetId,action,details_json AS details,created_at AS createdAt FROM admin_audit_log WHERE guild_id=? ORDER BY id DESC LIMIT ?', [guildId, limit]);
    return rows.map((row) => ({ id: Number(row.id), actorId: String(row.actorId), targetId: row.targetId == null ? null : String(row.targetId), action: String(row.action), details: String(row.details), createdAt: Number(row.createdAt) }));
  }
  return (db.prepare('SELECT id,actor_id AS actorId,target_id AS targetId,action,details_json AS details,created_at AS createdAt FROM admin_audit_log WHERE guild_id=? ORDER BY id DESC LIMIT ?').all(guildId, limit) as Array<{ id: number; actorId: string; targetId: string | null; action: string; details: string; createdAt: number }>);
}
