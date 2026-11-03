import { db } from '../storage/database.js';

export const DAILY_AMOUNT = 100;
const DAILY_COOLDOWN_SECONDS = 24 * 60 * 60;
const WORK_COOLDOWN_SECONDS = 30 * 60;

type AccountRow = { balance: number; last_daily_at: number | null; last_work_at: number | null };

function ensureAccount(guildId: string, userId: string): AccountRow {
  db.prepare(`INSERT OR IGNORE INTO economy_accounts (guild_id, user_id) VALUES (?, ?)`).run(guildId, userId);
  return db.prepare(`SELECT balance, last_daily_at, last_work_at FROM economy_accounts WHERE guild_id = ? AND user_id = ?`)
    .get(guildId, userId) as AccountRow;
}

export function getBalance(guildId: string, userId: string): number {
  return ensureAccount(guildId, userId).balance;
}

export function claimDaily(guildId: string, userId: string, reference: string):
  | { ok: true; balance: number; amount: number }
  | { ok: false; secondsRemaining: number } {
  const claim = db.transaction(() => {
    const account = ensureAccount(guildId, userId);
    const now = Math.floor(Date.now() / 1000);
    const nextClaimAt = (account.last_daily_at ?? 0) + DAILY_COOLDOWN_SECONDS;
    if (now < nextClaimAt) return { ok: false as const, secondsRemaining: nextClaimAt - now };

    db.prepare(`UPDATE economy_accounts SET balance = balance + ?, last_daily_at = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?`)
      .run(DAILY_AMOUNT, now, now, guildId, userId);
    db.prepare(`INSERT INTO economy_ledger (guild_id, user_id, amount, reason, reference) VALUES (?, ?, ?, ?, ?)`)
      .run(guildId, userId, DAILY_AMOUNT, 'daily_reward', reference);
    return { ok: true as const, balance: account.balance + DAILY_AMOUNT, amount: DAILY_AMOUNT };
  });
  return claim.immediate();
}

export function purchaseItem(guildId: string, userId: string, itemId: string, cost: number, reference: string):
  | { ok: true; balance: number }
  | { ok: false; balance: number; reason: 'insufficient_funds' | 'already_owned' } {
  const purchase = db.transaction(() => {
    const account = ensureAccount(guildId, userId);
    const owned = db.prepare(`SELECT 1 FROM economy_inventory WHERE guild_id = ? AND user_id = ? AND item_id = ?`)
      .get(guildId, userId, itemId);
    if (owned) return { ok: false as const, balance: account.balance, reason: 'already_owned' as const };
    if (account.balance < cost) return { ok: false as const, balance: account.balance, reason: 'insufficient_funds' as const };
    const now = Math.floor(Date.now() / 1000);
    db.prepare(`UPDATE economy_accounts SET balance = balance - ?, updated_at = ? WHERE guild_id = ? AND user_id = ?`)
      .run(cost, now, guildId, userId);
    db.prepare(`INSERT INTO economy_inventory (guild_id, user_id, item_id, acquired_at) VALUES (?, ?, ?, ?)`)
      .run(guildId, userId, itemId, now);
    db.prepare(`INSERT INTO economy_ledger (guild_id, user_id, amount, reason, reference) VALUES (?, ?, ?, ?, ?)`)
      .run(guildId, userId, -cost, `store:${itemId}`, reference);
    return { ok: true as const, balance: account.balance - cost };
  });
  return purchase.immediate();
}

export function work(guildId: string, userId: string, reference: string):
  | { ok: true; amount: number; balance: number }
  | { ok: false; secondsRemaining: number } {
  const earn = db.transaction(() => {
    const account = ensureAccount(guildId, userId);
    const now = Math.floor(Date.now() / 1000);
    const nextWorkAt = (account.last_work_at ?? 0) + WORK_COOLDOWN_SECONDS;
    if (now < nextWorkAt) return { ok: false as const, secondsRemaining: nextWorkAt - now };
    const amount = 35 + Math.floor(Math.random() * 46);
    db.prepare(`UPDATE economy_accounts SET balance = balance + ?, last_work_at = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?`)
      .run(amount, now, now, guildId, userId);
    db.prepare(`INSERT INTO economy_ledger (guild_id, user_id, amount, reason, reference) VALUES (?, ?, ?, ?, ?)`)
      .run(guildId, userId, amount, 'work_reward', reference);
    return { ok: true as const, amount, balance: account.balance + amount };
  });
  return earn.immediate();
}

export function transferCoins(guildId: string, fromUserId: string, toUserId: string, amount: number, reference: string):
  | { ok: true; fromBalance: number; toBalance: number }
  | { ok: false; reason: 'self' | 'invalid_amount' | 'insufficient_funds' } {
  if (fromUserId === toUserId) return { ok: false, reason: 'self' };
  if (!Number.isSafeInteger(amount) || amount <= 0) return { ok: false, reason: 'invalid_amount' };
  const send = db.transaction(() => {
    const from = ensureAccount(guildId, fromUserId);
    const to = ensureAccount(guildId, toUserId);
    if (from.balance < amount) return { ok: false as const, reason: 'insufficient_funds' as const };
    const now = Math.floor(Date.now() / 1000);
    db.prepare(`UPDATE economy_accounts SET balance = balance - ?, updated_at = ? WHERE guild_id = ? AND user_id = ?`)
      .run(amount, now, guildId, fromUserId);
    db.prepare(`UPDATE economy_accounts SET balance = balance + ?, updated_at = ? WHERE guild_id = ? AND user_id = ?`)
      .run(amount, now, guildId, toUserId);
    const ledger = db.prepare(`INSERT INTO economy_ledger (guild_id, user_id, amount, reason, reference) VALUES (?, ?, ?, ?, ?)`);
    ledger.run(guildId, fromUserId, -amount, `transfer:to:${toUserId}`, `${reference}:out`);
    ledger.run(guildId, toUserId, amount, `transfer:from:${fromUserId}`, `${reference}:in`);
    return { ok: true as const, fromBalance: from.balance - amount, toBalance: to.balance + amount };
  });
  return send.immediate();
}

export function getInventory(guildId: string, userId: string): Array<{ itemId: string; acquiredAt: number }> {
  return db.prepare(`SELECT item_id AS itemId, acquired_at AS acquiredAt FROM economy_inventory WHERE guild_id = ? AND user_id = ? ORDER BY acquired_at DESC`)
    .all(guildId, userId) as Array<{ itemId: string; acquiredAt: number }>;
}

export function getLeaderboard(guildId: string, limit = 10): Array<{ userId: string; balance: number }> {
  return db.prepare(`SELECT user_id AS userId, balance FROM economy_accounts WHERE guild_id = ? ORDER BY balance DESC, user_id ASC LIMIT ?`)
    .all(guildId, limit) as Array<{ userId: string; balance: number }>;
}

export function formatCooldown(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.ceil((seconds % 3600) / 60);
  return hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`;
}

export const storeItems = [
  { id: 'marco_neon', name: 'Marco Neón', description: 'Un marco brillante para tu perfil.', cost: 250, emoji: '💠' },
  { id: 'tema_nocturno', name: 'Tema Nocturno', description: 'Un estilo oscuro para tus tarjetas.', cost: 400, emoji: '🌙' },
  { id: 'insignia_dj', name: 'Insignia DJ', description: 'Presume tu rango de DJ del servidor.', cost: 600, emoji: '🎧' },
] as const;
