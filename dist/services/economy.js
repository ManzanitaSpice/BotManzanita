import { db } from '../storage/database.js';
export const DAILY_AMOUNT = 100;
const DAILY_COOLDOWN_SECONDS = 24 * 60 * 60;
const WORK_COOLDOWN_SECONDS = 30 * 60;
function ensureAccount(guildId, userId) {
    db.prepare(`INSERT OR IGNORE INTO economy_accounts (guild_id, user_id) VALUES (?, ?)`).run(guildId, userId);
    return db.prepare(`SELECT balance, last_daily_at, last_work_at FROM economy_accounts WHERE guild_id = ? AND user_id = ?`)
        .get(guildId, userId);
}
export function getBalance(guildId, userId) {
    return ensureAccount(guildId, userId).balance;
}
export function claimDaily(guildId, userId, reference) {
    const claim = db.transaction(() => {
        const account = ensureAccount(guildId, userId);
        const now = Math.floor(Date.now() / 1000);
        const nextClaimAt = (account.last_daily_at ?? 0) + DAILY_COOLDOWN_SECONDS;
        if (now < nextClaimAt)
            return { ok: false, secondsRemaining: nextClaimAt - now };
        db.prepare(`UPDATE economy_accounts SET balance = balance + ?, last_daily_at = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?`)
            .run(DAILY_AMOUNT, now, now, guildId, userId);
        db.prepare(`INSERT INTO economy_ledger (guild_id, user_id, amount, reason, reference) VALUES (?, ?, ?, ?, ?)`)
            .run(guildId, userId, DAILY_AMOUNT, 'daily_reward', reference);
        return { ok: true, balance: account.balance + DAILY_AMOUNT, amount: DAILY_AMOUNT };
    });
    return claim.immediate();
}
export function purchaseItem(guildId, userId, itemId, cost, reference) {
    const purchase = db.transaction(() => {
        const account = ensureAccount(guildId, userId);
        const owned = db.prepare(`SELECT 1 FROM economy_inventory WHERE guild_id = ? AND user_id = ? AND item_id = ?`)
            .get(guildId, userId, itemId);
        if (owned)
            return { ok: false, balance: account.balance, reason: 'already_owned' };
        if (account.balance < cost)
            return { ok: false, balance: account.balance, reason: 'insufficient_funds' };
        const now = Math.floor(Date.now() / 1000);
        db.prepare(`UPDATE economy_accounts SET balance = balance - ?, updated_at = ? WHERE guild_id = ? AND user_id = ?`)
            .run(cost, now, guildId, userId);
        db.prepare(`INSERT INTO economy_inventory (guild_id, user_id, item_id, acquired_at) VALUES (?, ?, ?, ?)`)
            .run(guildId, userId, itemId, now);
        db.prepare(`INSERT INTO economy_ledger (guild_id, user_id, amount, reason, reference) VALUES (?, ?, ?, ?, ?)`)
            .run(guildId, userId, -cost, `store:${itemId}`, reference);
        return { ok: true, balance: account.balance - cost };
    });
    return purchase.immediate();
}
export function work(guildId, userId, reference) {
    const earn = db.transaction(() => {
        const account = ensureAccount(guildId, userId);
        const now = Math.floor(Date.now() / 1000);
        const nextWorkAt = (account.last_work_at ?? 0) + WORK_COOLDOWN_SECONDS;
        if (now < nextWorkAt)
            return { ok: false, secondsRemaining: nextWorkAt - now };
        const amount = 35 + Math.floor(Math.random() * 46);
        db.prepare(`UPDATE economy_accounts SET balance = balance + ?, last_work_at = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?`)
            .run(amount, now, now, guildId, userId);
        db.prepare(`INSERT INTO economy_ledger (guild_id, user_id, amount, reason, reference) VALUES (?, ?, ?, ?, ?)`)
            .run(guildId, userId, amount, 'work_reward', reference);
        return { ok: true, amount, balance: account.balance + amount };
    });
    return earn.immediate();
}
export function transferCoins(guildId, fromUserId, toUserId, amount, reference) {
    if (fromUserId === toUserId)
        return { ok: false, reason: 'self' };
    if (!Number.isSafeInteger(amount) || amount <= 0)
        return { ok: false, reason: 'invalid_amount' };
    const send = db.transaction(() => {
        const from = ensureAccount(guildId, fromUserId);
        const to = ensureAccount(guildId, toUserId);
        if (from.balance < amount)
            return { ok: false, reason: 'insufficient_funds' };
        const now = Math.floor(Date.now() / 1000);
        db.prepare(`UPDATE economy_accounts SET balance = balance - ?, updated_at = ? WHERE guild_id = ? AND user_id = ?`)
            .run(amount, now, guildId, fromUserId);
        db.prepare(`UPDATE economy_accounts SET balance = balance + ?, updated_at = ? WHERE guild_id = ? AND user_id = ?`)
            .run(amount, now, guildId, toUserId);
        const ledger = db.prepare(`INSERT INTO economy_ledger (guild_id, user_id, amount, reason, reference) VALUES (?, ?, ?, ?, ?)`);
        ledger.run(guildId, fromUserId, -amount, `transfer:to:${toUserId}`, `${reference}:out`);
        ledger.run(guildId, toUserId, amount, `transfer:from:${fromUserId}`, `${reference}:in`);
        return { ok: true, fromBalance: from.balance - amount, toBalance: to.balance + amount };
    });
    return send.immediate();
}
export function getInventory(guildId, userId) {
    return db.prepare(`SELECT item_id AS itemId, acquired_at AS acquiredAt FROM economy_inventory WHERE guild_id = ? AND user_id = ? ORDER BY acquired_at DESC`)
        .all(guildId, userId);
}
export function getLeaderboard(guildId, limit = 10) {
    return db.prepare(`SELECT user_id AS userId, balance FROM economy_accounts WHERE guild_id = ? ORDER BY balance DESC, user_id ASC LIMIT ?`)
        .all(guildId, limit);
}
export function formatCooldown(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.ceil((seconds % 3600) / 60);
    return hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`;
}
export const storeItems = [
    { id: 'marco_neon', name: 'Marco Neón', description: 'Un marco brillante para tu perfil.', cost: 250, emoji: '💠' },
    { id: 'tema_nocturno', name: 'Tema Nocturno', description: 'Un estilo oscuro para tus tarjetas.', cost: 400, emoji: '🌙' },
    { id: 'insignia_dj', name: 'Insignia DJ', description: 'Presume tu rango de DJ del servidor.', cost: 600, emoji: '🎧' },
];
