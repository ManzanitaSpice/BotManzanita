import { GLOBAL_SCOPE_ID } from '../storage/global-scope.js';
import { randomInt } from 'node:crypto';
import { db } from '../storage/database.js';
import { economyPool, withEconomyTransaction } from '../storage/economy-database.js';
import { migratePlayerDataToGlobalScope } from '../storage/global-migration.js';
import { profileShopCategories, profileShopItems } from '../data/profile-shop.js';
const messageCooldown = new Map();
const LEVEL_XP = 100;
const DEFAULT_SETTINGS = { about: '', title: 'Aventurero/a', accent: '#8b75dc', profileBg: null, rankBg: null, walletBg: null, levelupBg: null, tag: null, frame: null, sticker: null, housing: null };
const equipColumns = { profile_bg: 'profileBg', rank_bg: 'rankBg', wallet_bg: 'walletBg', levelup_bg: 'levelupBg', tag: 'tag', frame: 'frame', sticker: 'sticker', housing: 'housing' };
export async function initializeProfileStorage() {
    db.exec(`
    CREATE TABLE IF NOT EXISTS user_profiles (
      user_id TEXT PRIMARY KEY, about TEXT NOT NULL DEFAULT '', title TEXT NOT NULL DEFAULT 'Aventurero/a', accent TEXT NOT NULL DEFAULT '#8b75dc',
      profile_bg TEXT, rank_bg TEXT, wallet_bg TEXT, levelup_bg TEXT, tag TEXT, frame TEXT, sticker TEXT, housing TEXT, updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS user_progress (
      user_id TEXT PRIMARY KEY, xp INTEGER NOT NULL DEFAULT 0, level INTEGER NOT NULL DEFAULT 1, messages INTEGER NOT NULL DEFAULT 0, reputation INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_user_progress_xp ON user_progress(xp DESC,user_id);
    CREATE TABLE IF NOT EXISTS shop_categories (category_id TEXT PRIMARY KEY, label TEXT NOT NULL, emoji TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS items (item_id TEXT PRIMARY KEY, item_type TEXT NOT NULL, category_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL, price INTEGER NOT NULL, color TEXT NOT NULL, rarity TEXT NOT NULL, emoji TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS user_inventory (guild_id TEXT NOT NULL, user_id TEXT NOT NULL, item_id TEXT NOT NULL, quantity INTEGER NOT NULL DEFAULT 1, acquired_at INTEGER NOT NULL DEFAULT (unixepoch()), PRIMARY KEY (guild_id,user_id,item_id));
    CREATE TABLE IF NOT EXISTS user_equipped_badges (user_id TEXT NOT NULL, slot INTEGER NOT NULL, item_id TEXT NOT NULL, PRIMARY KEY (user_id,slot), UNIQUE (user_id,item_id));
    CREATE TABLE IF NOT EXISTS user_reputation_log (giver_id TEXT NOT NULL, target_id TEXT NOT NULL, day TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(giver_id,target_id,day));
  `);
    if (economyPool) {
        await economyPool.query(`CREATE TABLE IF NOT EXISTS user_profiles (user_id VARCHAR(32) PRIMARY KEY, about VARCHAR(180) NOT NULL DEFAULT '', title VARCHAR(40) NOT NULL DEFAULT 'Aventurero/a', accent CHAR(7) NOT NULL DEFAULT '#8b75dc', profile_bg VARCHAR(48) NULL, rank_bg VARCHAR(48) NULL, wallet_bg VARCHAR(48) NULL, levelup_bg VARCHAR(48) NULL, tag VARCHAR(48) NULL, frame VARCHAR(48) NULL, sticker VARCHAR(48) NULL, housing VARCHAR(48) NULL, updated_at BIGINT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
        await economyPool.query(`CREATE TABLE IF NOT EXISTS user_progress (user_id VARCHAR(32) PRIMARY KEY, xp BIGINT NOT NULL DEFAULT 0, level INT NOT NULL DEFAULT 1, messages BIGINT NOT NULL DEFAULT 0, reputation INT NOT NULL DEFAULT 0, updated_at BIGINT NOT NULL, KEY idx_user_progress_xp (xp,user_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
        await economyPool.query(`CREATE TABLE IF NOT EXISTS shop_categories (category_id VARCHAR(32) PRIMARY KEY, label VARCHAR(48) NOT NULL, emoji VARCHAR(8) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
        await economyPool.query(`CREATE TABLE IF NOT EXISTS items (item_id VARCHAR(48) PRIMARY KEY, item_type VARCHAR(24) NOT NULL, category_id VARCHAR(32) NOT NULL, name VARCHAR(64) NOT NULL, description VARCHAR(180) NOT NULL, price BIGINT NOT NULL, color CHAR(7) NOT NULL, rarity VARCHAR(24) NOT NULL, emoji VARCHAR(8) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
        await economyPool.query(`CREATE TABLE IF NOT EXISTS user_inventory (guild_id VARCHAR(32) NOT NULL, user_id VARCHAR(32) NOT NULL, item_id VARCHAR(48) NOT NULL, quantity BIGINT NOT NULL DEFAULT 1, acquired_at BIGINT NOT NULL, PRIMARY KEY (guild_id,user_id,item_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
        await economyPool.query(`CREATE TABLE IF NOT EXISTS user_equipped_badges (user_id VARCHAR(32) NOT NULL, slot TINYINT NOT NULL, item_id VARCHAR(48) NOT NULL, PRIMARY KEY (user_id,slot), UNIQUE KEY uq_profile_badge (user_id,item_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
        await economyPool.query(`CREATE TABLE IF NOT EXISTS user_reputation_log (giver_id VARCHAR(32) NOT NULL, target_id VARCHAR(32) NOT NULL, day DATE NOT NULL, created_at BIGINT NOT NULL, PRIMARY KEY(giver_id,target_id,day)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
        for (const category of profileShopCategories)
            await economyPool.execute('INSERT IGNORE INTO shop_categories(category_id,label,emoji) VALUES(?,?,?)', [category.id, category.label, category.emoji]);
        for (const item of profileShopItems)
            await economyPool.execute('INSERT IGNORE INTO items(item_id,item_type,category_id,name,description,price,color,rarity,emoji) VALUES(?,?,?,?,?,?,?,?,?)', [item.id, item.type, item.category, item.name, item.description, item.price, item.color, item.rarity, item.emoji]);
    }
    else {
        const addCategory = db.prepare('INSERT OR IGNORE INTO shop_categories(category_id,label,emoji) VALUES(?,?,?)');
        const addItem = db.prepare('INSERT OR IGNORE INTO items(item_id,item_type,category_id,name,description,price,color,rarity,emoji) VALUES(?,?,?,?,?,?,?,?,?)');
        const seed = db.transaction(() => {
            for (const category of profileShopCategories)
                addCategory.run(category.id, category.label, category.emoji);
            for (const item of profileShopItems)
                addItem.run(item.id, item.type, item.category, item.name, item.description, item.price, item.color, item.rarity, item.emoji);
        });
        seed();
    }
    await migratePlayerDataToGlobalScope();
}
export function levelForExperience(xp) { return Math.max(1, Math.floor(Math.sqrt(Math.max(0, xp) / LEVEL_XP)) + 1); }
export async function recordChatActivity(guildId, userId) {
    guildId = GLOBAL_SCOPE_ID;
    const key = `${guildId}:${userId}`;
    const now = Date.now();
    const last = messageCooldown.get(key) ?? 0;
    if (now - last < 60_000)
        return undefined;
    messageCooldown.set(key, now);
    if (messageCooldown.size > 20_000)
        for (const [entry, time] of messageCooldown)
            if (now - time > 3_600_000)
                messageCooldown.delete(entry);
    const gain = randomInt(10, 21);
    const at = Math.floor(now / 1000);
    if (economyPool) {
        return withEconomyTransaction(async (connection) => {
            await connection.execute('INSERT IGNORE INTO user_progress(user_id,updated_at) VALUES(?,?)', [userId, at]);
            const [beforeRows] = await connection.execute('SELECT level FROM user_progress WHERE user_id=? FOR UPDATE', [userId]);
            await connection.execute('UPDATE user_progress SET level=FLOOR(SQRT((xp+?)/?))+1,xp=xp+?,messages=messages+1,updated_at=? WHERE user_id=?', [gain, LEVEL_XP, gain, at, userId]);
            const [rows] = await connection.execute('SELECT xp,level FROM user_progress WHERE user_id=?', [userId]);
            return { levelUp: Number(rows[0]?.level ?? 1) > Number(beforeRows[0]?.level ?? 1), level: Number(rows[0]?.level ?? 1), xp: Number(rows[0]?.xp ?? gain) };
        });
    }
    const update = db.transaction(() => {
        db.prepare('INSERT OR IGNORE INTO user_progress(user_id) VALUES(?)').run(userId);
        const before = db.prepare('SELECT level FROM user_progress WHERE user_id=?').get(userId);
        const xp = Number(db.prepare('SELECT xp FROM user_progress WHERE user_id=?').get(userId).xp) + gain;
        const level = levelForExperience(xp);
        db.prepare('UPDATE user_progress SET xp=?,level=?,messages=messages+1,updated_at=? WHERE user_id=?').run(xp, level, at, userId);
        return { levelUp: level > Number(before.level), level, xp };
    });
    return update.immediate();
}
export async function getProfileSettings(userId) {
    if (economyPool) {
        await economyPool.execute('INSERT IGNORE INTO user_profiles(user_id,updated_at) VALUES(?,?)', [userId, Math.floor(Date.now() / 1000)]);
        const [rows] = await economyPool.execute('SELECT about,title,accent,profile_bg AS profileBg,rank_bg AS rankBg,wallet_bg AS walletBg,levelup_bg AS levelupBg,tag,frame,sticker,housing FROM user_profiles WHERE user_id=?', [userId]);
        return rows[0] ? rows[0] : DEFAULT_SETTINGS;
    }
    db.prepare('INSERT OR IGNORE INTO user_profiles(user_id) VALUES(?)').run(userId);
    return db.prepare('SELECT about,title,accent,profile_bg AS profileBg,rank_bg AS rankBg,wallet_bg AS walletBg,levelup_bg AS levelupBg,tag,frame,sticker,housing FROM user_profiles WHERE user_id=?').get(userId) ?? DEFAULT_SETTINGS;
}
export async function getProfileProgress(_guildId, userId) {
    if (economyPool) {
        const [rows] = await economyPool.execute('SELECT xp,level,messages,reputation FROM user_progress WHERE user_id=?', [userId]);
        const row = (rows[0] ?? {});
        const xp = Number(row.xp ?? 0);
        const level = Number(row.level ?? 1);
        const messages = Number(row.messages ?? 0);
        const [ranks] = await economyPool.execute('SELECT COUNT(*)+1 rank FROM user_progress WHERE xp>(SELECT COALESCE(xp,0) FROM user_progress WHERE user_id=?)', [userId]);
        const rank = Number(ranks[0]?.rank ?? 1);
        return { xp, level, messages, reputation: Number(row.reputation ?? 0), serverXp: xp, serverLevel: level, serverMessages: messages, globalRank: rank, serverRank: rank };
    }
    const row = db.prepare('SELECT COALESCE(xp,0) xp,COALESCE(level,1) level,COALESCE(messages,0) messages,COALESCE(reputation,0) reputation FROM user_progress WHERE user_id=?').get(userId);
    const xp = Number(row?.xp ?? 0);
    const level = Number(row?.level ?? 1);
    const messages = Number(row?.messages ?? 0);
    const globalRank = Number(db.prepare('SELECT COUNT(*)+1 rank FROM user_progress WHERE xp>(SELECT COALESCE(xp,0) FROM user_progress WHERE user_id=?)').get(userId).rank);
    return { xp, level, messages, reputation: Number(row?.reputation ?? 0), serverXp: xp, serverLevel: level, serverMessages: messages, globalRank, serverRank: globalRank };
}
export async function getProfileInventory(guildId, userId) {
    guildId = GLOBAL_SCOPE_ID;
    if (economyPool) {
        const [rows] = await economyPool.execute('SELECT item_id itemId,quantity,acquired_at acquiredAt FROM user_inventory WHERE guild_id=? AND user_id=? AND quantity>0 ORDER BY acquired_at DESC', [guildId, userId]);
        return rows.map((row) => ({ itemId: String(row.itemId), quantity: Number(row.quantity), acquiredAt: Number(row.acquiredAt) }));
    }
    return db.prepare('SELECT item_id itemId,quantity,acquired_at acquiredAt FROM user_inventory WHERE guild_id=? AND user_id=? AND quantity>0 ORDER BY acquired_at DESC').all(guildId, userId);
}
export async function buyProfileItem(guildId, userId, itemId, reference) {
    guildId = GLOBAL_SCOPE_ID;
    const item = profileShopItems.find((entry) => entry.id === itemId);
    if (!item)
        return { ok: false, reason: 'not_found', balance: 0 };
    if (item.price <= 0)
        return { ok: false, reason: 'free_item', balance: 0 };
    const at = Math.floor(Date.now() / 1000);
    const ledgerReference = `profile-shop:${reference}`;
    if (economyPool)
        return withEconomyTransaction(async (connection) => {
            await connection.execute('INSERT IGNORE INTO economy_accounts(guild_id,user_id,created_at,updated_at) VALUES(?,?,?,?)', [guildId, userId, at, at]);
            const [owned] = await connection.execute('SELECT quantity FROM user_inventory WHERE guild_id=? AND user_id=? AND item_id=? FOR UPDATE', [guildId, userId, itemId]);
            if (owned.length)
                return { ok: false, reason: 'already_owned', balance: 0 };
            const [accounts] = await connection.execute('SELECT balance FROM economy_accounts WHERE guild_id=? AND user_id=? FOR UPDATE', [guildId, userId]);
            const balance = Number(accounts[0]?.balance ?? 0);
            if (balance < item.price)
                return { ok: false, reason: 'insufficient', balance };
            await connection.execute('UPDATE economy_accounts SET balance=balance-?,updated_at=? WHERE guild_id=? AND user_id=?', [item.price, at, guildId, userId]);
            await connection.execute('INSERT INTO economy_ledger(guild_id,user_id,amount,reason,reference,created_at) VALUES(?,?,?,?,?,?)', [guildId, userId, -item.price, `profile_shop:${itemId}`, ledgerReference, at]);
            await connection.execute('INSERT INTO user_inventory(guild_id,user_id,item_id,quantity,acquired_at) VALUES(?,?,?,1,?)', [guildId, userId, itemId, at]);
            return { ok: true, balance: balance - item.price };
        });
    const transaction = db.transaction(() => {
        db.prepare('INSERT OR IGNORE INTO economy_accounts(guild_id,user_id) VALUES(?,?)').run(guildId, userId);
        if (db.prepare('SELECT 1 FROM user_inventory WHERE guild_id=? AND user_id=? AND item_id=?').get(guildId, userId, itemId))
            return { ok: false, reason: 'already_owned', balance: 0 };
        const balance = Number(db.prepare('SELECT balance FROM economy_accounts WHERE guild_id=? AND user_id=?').get(guildId, userId).balance);
        if (balance < item.price)
            return { ok: false, reason: 'insufficient', balance };
        db.prepare('UPDATE economy_accounts SET balance=balance-?,updated_at=? WHERE guild_id=? AND user_id=?').run(item.price, at, guildId, userId);
        db.prepare('INSERT INTO economy_ledger(guild_id,user_id,amount,reason,reference,created_at) VALUES(?,?,?,?,?,?)').run(guildId, userId, -item.price, `profile_shop:${itemId}`, ledgerReference, at);
        db.prepare('INSERT INTO user_inventory(guild_id,user_id,item_id,quantity,acquired_at) VALUES(?,?,?,1,?)').run(guildId, userId, itemId, at);
        return { ok: true, balance: balance - item.price };
    });
    return transaction.immediate();
}
export async function equipProfileItem(guildId, userId, itemId) {
    guildId = GLOBAL_SCOPE_ID;
    const item = profileShopItems.find((entry) => entry.id === itemId);
    if (!item || item.price === 0)
        return { ok: false, message: 'Ese artículo no se puede equipar desde la tienda.' };
    const inventory = await getProfileInventory(guildId, userId);
    if (!inventory.some((entry) => entry.itemId === itemId))
        return { ok: false, message: 'Primero consigue el artículo en la tienda.' };
    if (item.type === 'badge') {
        if (economyPool) {
            const [rows] = await economyPool.execute('SELECT slot FROM user_equipped_badges WHERE user_id=? AND item_id=?', [userId, itemId]);
            if (rows.length)
                return { ok: true, message: 'Ese badge ya está equipado.' };
            const [slots] = await economyPool.execute('SELECT slot FROM user_equipped_badges WHERE user_id=? ORDER BY slot', [userId]);
            const free = [1, 2, 3].find((slot) => !slots.some((row) => Number(row.slot) === slot));
            if (!free)
                return { ok: false, message: 'Ya tienes ocupados los tres slots de badges.' };
            await economyPool.execute('INSERT INTO user_equipped_badges(user_id,slot,item_id) VALUES(?,?,?)', [userId, free, itemId]);
        }
        else {
            const slots = db.prepare('SELECT slot,item_id itemId FROM user_equipped_badges WHERE user_id=? ORDER BY slot').all(userId);
            if (slots.some((row) => row.itemId === itemId))
                return { ok: true, message: 'Ese badge ya está equipado.' };
            const free = [1, 2, 3].find((slot) => !slots.some((row) => row.slot === slot));
            if (!free)
                return { ok: false, message: 'Ya tienes ocupados los tres slots de badges.' };
            db.prepare('INSERT INTO user_equipped_badges(user_id,slot,item_id) VALUES(?,?,?)').run(userId, free, itemId);
        }
        return { ok: true, message: `Badge **${item.name}** equipado.` };
    }
    const column = equipColumns[item.type];
    if (!column)
        return { ok: false, message: 'Ese artículo no tiene ranura de equipamiento.' };
    const sqlColumn = { profileBg: 'profile_bg', rankBg: 'rank_bg', walletBg: 'wallet_bg', levelupBg: 'levelup_bg', tag: 'tag', frame: 'frame', sticker: 'sticker', housing: 'housing' }[column];
    if (economyPool) {
        await economyPool.execute('INSERT IGNORE INTO user_profiles(user_id,updated_at) VALUES(?,?)', [userId, Math.floor(Date.now() / 1000)]);
        await economyPool.execute(`UPDATE user_profiles SET ${sqlColumn}=?,updated_at=? WHERE user_id=?`, [itemId, Math.floor(Date.now() / 1000), userId]);
    }
    else {
        db.prepare('INSERT OR IGNORE INTO user_profiles(user_id) VALUES(?)').run(userId);
        db.prepare(`UPDATE user_profiles SET ${sqlColumn}=?,updated_at=? WHERE user_id=?`).run(itemId, Math.floor(Date.now() / 1000), userId);
    }
    return { ok: true, message: `${item.emoji} **${item.name}** equipado.` };
}
export async function unequipProfileType(userId, type) {
    const sqlColumn = { profile_bg: 'profile_bg', rank_bg: 'rank_bg', wallet_bg: 'wallet_bg', levelup_bg: 'levelup_bg', frame: 'frame', badge: 'badge', tag: 'tag', sticker: 'sticker', housing: 'housing' }[type];
    if (type === 'badge') {
        if (economyPool)
            await economyPool.execute('DELETE FROM user_equipped_badges WHERE user_id=?', [userId]);
        else
            db.prepare('DELETE FROM user_equipped_badges WHERE user_id=?').run(userId);
        return { ok: true, message: 'Badges desequipados.' };
    }
    if (!sqlColumn)
        return { ok: false, message: 'Ranura desconocida.' };
    if (economyPool)
        await economyPool.execute(`UPDATE user_profiles SET ${sqlColumn}=NULL WHERE user_id=?`, [userId]);
    else
        db.prepare(`UPDATE user_profiles SET ${sqlColumn}=NULL WHERE user_id=?`).run(userId);
    return { ok: true, message: 'Decoración retirada.' };
}
export async function updateProfileField(userId, field, value) {
    const limits = { about: 180, title: 40, accent: 7 };
    const cleaned = value.trim().slice(0, limits[field]);
    if (field === 'accent' && !/^#[0-9a-fA-F]{6}$/.test(cleaned))
        throw new Error('El color debe ser hexadecimal, por ejemplo #8b75dc.');
    if (economyPool) {
        await economyPool.execute('INSERT IGNORE INTO user_profiles(user_id,updated_at) VALUES(?,?)', [userId, Math.floor(Date.now() / 1000)]);
        await economyPool.execute(`UPDATE user_profiles SET ${field}=?,updated_at=? WHERE user_id=?`, [cleaned, Math.floor(Date.now() / 1000), userId]);
    }
    else {
        db.prepare('INSERT OR IGNORE INTO user_profiles(user_id) VALUES(?)').run(userId);
        db.prepare(`UPDATE user_profiles SET ${field}=?,updated_at=? WHERE user_id=?`).run(cleaned, Math.floor(Date.now() / 1000), userId);
    }
}
export async function equippedProfileBadges(userId) {
    if (economyPool) {
        const [rows] = await economyPool.execute('SELECT item_id itemId FROM user_equipped_badges WHERE user_id=? ORDER BY slot', [userId]);
        return rows.map((row) => String(row.itemId));
    }
    return db.prepare('SELECT item_id itemId FROM user_equipped_badges WHERE user_id=? ORDER BY slot').all(userId).map((row) => row.itemId);
}
export async function giveReputation(giverId, targetId) {
    if (giverId === targetId)
        return { ok: false, reputation: 0 };
    const now = Date.now();
    const at = Math.floor(now / 1000);
    const day = new Date(now).toISOString().slice(0, 10);
    if (economyPool)
        return withEconomyTransaction(async (connection) => {
            await connection.execute('INSERT IGNORE INTO user_progress(user_id,updated_at) VALUES(?,?)', [targetId, at]);
            try {
                await connection.execute('INSERT INTO user_reputation_log(giver_id,target_id,day,created_at) VALUES(?,?,?,?)', [giverId, targetId, day, at]);
            }
            catch (error) {
                if (error.code === 'ER_DUP_ENTRY')
                    return { ok: false, reputation: 0 };
                throw error;
            }
            await connection.execute('UPDATE user_progress SET reputation=reputation+1,updated_at=? WHERE user_id=?', [at, targetId]);
            const [rows] = await connection.execute('SELECT reputation FROM user_progress WHERE user_id=?', [targetId]);
            return { ok: true, reputation: Number(rows[0]?.reputation ?? 1) };
        });
    const update = db.transaction(() => {
        db.prepare('INSERT OR IGNORE INTO user_progress(user_id) VALUES(?)').run(targetId);
        const inserted = db.prepare('INSERT OR IGNORE INTO user_reputation_log(giver_id,target_id,day,created_at) VALUES(?,?,?,?)').run(giverId, targetId, day, at);
        if (!inserted.changes)
            return { ok: false, reputation: Number(db.prepare('SELECT reputation FROM user_progress WHERE user_id=?').get(targetId).reputation) };
        db.prepare('UPDATE user_progress SET reputation=reputation+1,updated_at=? WHERE user_id=?').run(at, targetId);
        return { ok: true, reputation: Number(db.prepare('SELECT reputation FROM user_progress WHERE user_id=?').get(targetId).reputation) };
    });
    return update.immediate();
}
export function profileItem(itemId) { return itemId ? profileShopItems.find((item) => item.id === itemId) : undefined; }
