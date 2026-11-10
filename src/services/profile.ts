import { GLOBAL_SCOPE_ID } from '../storage/global-scope.js';
import { randomInt } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import { db } from '../storage/database.js';
import { ECONOMY_STARTING_BALANCE } from '../storage/economy-defaults.js';
import { economyPool, withEconomyTransaction } from '../storage/economy-database.js';
import { migratePlayerDataToGlobalScope } from '../storage/global-migration.js';
import { profileShopCategories, profileShopItems, type ProfileItemType, type ProfileShopItem } from '../data/profile-shop.js';
import { getProductPriceQuote, recordProductSaleMysql, recordProductSaleSqlite } from './product-market.js';

export type ProfileSettings = { about: string; title: string; accent: string; profileBg: string | null; rankBg: string | null; walletBg: string | null; levelupBg: string | null; tag: string | null; frame: string | null; sticker: string | null };
export type ProfileBackgroundTarget = 'profile' | 'rank' | 'wallet' | 'levelup' | 'all';
export type ProfileProgress = { xp: number; level: number; messages: number; reputation: number; hugsReceived: number; patsReceived: number; dailyXp: number; serverXp: number; serverLevel: number; serverMessages: number; globalRank: number; serverRank: number };
export type ProfileInventoryEntry = { itemId: string; quantity: number; acquiredAt: number };
const messageCooldown = new Map<string, number>();
const LEVEL_XP = 100;
const CHAT_XP_COOLDOWN_MS = 60_000;
export const PROFILE_CHAT_XP_DAILY_CAP = 1_200;
const DEFAULT_SETTINGS: ProfileSettings = { about: '', title: 'Aventurero/a', accent: '#8b75dc', profileBg: null, rankBg: null, walletBg: null, levelupBg: null, tag: null, frame: null, sticker: null };
const equipColumns: Partial<Record<ProfileItemType, keyof ProfileSettings>> = { profile_bg: 'profileBg', rank_bg: 'rankBg', wallet_bg: 'walletBg', levelup_bg: 'levelupBg', tag: 'tag', frame: 'frame', sticker: 'sticker', accent: 'accent' };
const profileBackgroundColumns: Record<Exclude<ProfileBackgroundTarget, 'all'>, string> = {
  profile: 'profile_bg', rank: 'rank_bg', wallet: 'wallet_bg', levelup: 'levelup_bg',
};
const gemPricedCosmeticTypes = new Set<ProfileItemType>(['profile_bg', 'rank_bg', 'wallet_bg', 'levelup_bg', 'badge', 'tag', 'frame', 'sticker', 'accent']);

function normalizeProfileSettings(row: Record<string, unknown> | undefined): ProfileSettings {
  if (!row) return DEFAULT_SETTINGS;
  return { ...DEFAULT_SETTINGS, ...row } as ProfileSettings;
}

export async function initializeProfileStorage(): Promise<void> {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_profiles (
      user_id TEXT PRIMARY KEY, about TEXT NOT NULL DEFAULT '', title TEXT NOT NULL DEFAULT 'Aventurero/a', accent TEXT NOT NULL DEFAULT '#8b75dc',
      profile_bg TEXT, rank_bg TEXT, wallet_bg TEXT, levelup_bg TEXT, tag TEXT, frame TEXT, sticker TEXT,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS user_progress (
      user_id TEXT PRIMARY KEY, xp INTEGER NOT NULL DEFAULT 0, level INTEGER NOT NULL DEFAULT 1, messages INTEGER NOT NULL DEFAULT 0, reputation INTEGER NOT NULL DEFAULT 0,
      hugs_received INTEGER NOT NULL DEFAULT 0, pats_received INTEGER NOT NULL DEFAULT 0, daily_xp INTEGER NOT NULL DEFAULT 0, daily_xp_date TEXT NOT NULL DEFAULT '', last_xp_at INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_user_progress_xp ON user_progress(xp DESC,user_id);
    CREATE TABLE IF NOT EXISTS shop_categories (category_id TEXT PRIMARY KEY, label TEXT NOT NULL, emoji TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS items (item_id TEXT PRIMARY KEY, item_type TEXT NOT NULL, category_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL, price INTEGER NOT NULL, color TEXT NOT NULL, rarity TEXT NOT NULL, emoji TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS user_inventory (guild_id TEXT NOT NULL, user_id TEXT NOT NULL, item_id TEXT NOT NULL, quantity INTEGER NOT NULL DEFAULT 1, acquired_at INTEGER NOT NULL DEFAULT (unixepoch()), PRIMARY KEY (guild_id,user_id,item_id));
    CREATE TABLE IF NOT EXISTS user_equipped_badges (user_id TEXT NOT NULL, slot INTEGER NOT NULL, item_id TEXT NOT NULL, PRIMARY KEY (user_id,slot), UNIQUE (user_id,item_id));
    CREATE TABLE IF NOT EXISTS user_reputation_log (giver_id TEXT NOT NULL, target_id TEXT NOT NULL, day TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(giver_id,target_id,day));
  `);
  if (economyPool) {
    await economyPool.query(`CREATE TABLE IF NOT EXISTS user_profiles (user_id VARCHAR(32) PRIMARY KEY, about VARCHAR(180) NOT NULL DEFAULT '', title VARCHAR(40) NOT NULL DEFAULT 'Aventurero/a', accent CHAR(7) NOT NULL DEFAULT '#8b75dc', profile_bg VARCHAR(48) NULL, rank_bg VARCHAR(48) NULL, wallet_bg VARCHAR(48) NULL, levelup_bg VARCHAR(48) NULL, tag VARCHAR(48) NULL, frame VARCHAR(48) NULL, sticker VARCHAR(48) NULL, updated_at BIGINT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await economyPool.query(`CREATE TABLE IF NOT EXISTS user_progress (user_id VARCHAR(32) PRIMARY KEY, xp BIGINT NOT NULL DEFAULT 0, level INT NOT NULL DEFAULT 1, messages BIGINT NOT NULL DEFAULT 0, reputation INT NOT NULL DEFAULT 0, hugs_received BIGINT NOT NULL DEFAULT 0, pats_received BIGINT NOT NULL DEFAULT 0, daily_xp INT NOT NULL DEFAULT 0, daily_xp_date VARCHAR(10) NOT NULL DEFAULT '', last_xp_at BIGINT NOT NULL DEFAULT 0, updated_at BIGINT NOT NULL, KEY idx_user_progress_xp (xp,user_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    for (const [column, definition] of [['hugs_received', 'BIGINT NOT NULL DEFAULT 0'], ['pats_received', 'BIGINT NOT NULL DEFAULT 0'], ['daily_xp', 'INT NOT NULL DEFAULT 0'], ['daily_xp_date', "VARCHAR(10) NOT NULL DEFAULT ''"], ['last_xp_at', 'BIGINT NOT NULL DEFAULT 0']] as const) {
      try { await economyPool.query(`ALTER TABLE user_progress ADD COLUMN ${column} ${definition}`); }
      catch (error) { if (!(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'ER_DUP_FIELDNAME')) throw error; }
    }
    await economyPool.query(`CREATE TABLE IF NOT EXISTS shop_categories (category_id VARCHAR(32) PRIMARY KEY, label VARCHAR(48) NOT NULL, emoji VARCHAR(8) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await economyPool.query(`CREATE TABLE IF NOT EXISTS items (item_id VARCHAR(48) PRIMARY KEY, item_type VARCHAR(24) NOT NULL, category_id VARCHAR(32) NOT NULL, name VARCHAR(64) NOT NULL, description VARCHAR(180) NOT NULL, price BIGINT NOT NULL, color CHAR(7) NOT NULL, rarity VARCHAR(24) NOT NULL, emoji VARCHAR(8) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await economyPool.query(`CREATE TABLE IF NOT EXISTS user_inventory (guild_id VARCHAR(32) NOT NULL, user_id VARCHAR(32) NOT NULL, item_id VARCHAR(48) NOT NULL, quantity BIGINT NOT NULL DEFAULT 1, acquired_at BIGINT NOT NULL, PRIMARY KEY (guild_id,user_id,item_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await economyPool.query(`CREATE TABLE IF NOT EXISTS user_equipped_badges (user_id VARCHAR(32) NOT NULL, slot TINYINT NOT NULL, item_id VARCHAR(48) NOT NULL, PRIMARY KEY (user_id,slot), UNIQUE KEY uq_profile_badge (user_id,item_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await economyPool.query(`CREATE TABLE IF NOT EXISTS user_reputation_log (giver_id VARCHAR(32) NOT NULL, target_id VARCHAR(32) NOT NULL, day DATE NOT NULL, created_at BIGINT NOT NULL, PRIMARY KEY(giver_id,target_id,day)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    for (const category of profileShopCategories) await economyPool.execute('INSERT IGNORE INTO shop_categories(category_id,label,emoji) VALUES(?,?,?)', [category.id, category.label, category.emoji]);
    for (const item of profileShopItems) await economyPool.execute('INSERT IGNORE INTO items(item_id,item_type,category_id,name,description,price,color,rarity,emoji) VALUES(?,?,?,?,?,?,?,?,?)', [item.id,item.type,item.category,item.name,item.description,item.price,item.color,item.rarity,item.emoji]);
    await economyPool.execute('DELETE FROM items WHERE item_id=?', ['pet_rpg_link']);
  } else {
    for (const [column, definition] of [['hugs_received', 'INTEGER NOT NULL DEFAULT 0'], ['pats_received', 'INTEGER NOT NULL DEFAULT 0'], ['daily_xp', 'INTEGER NOT NULL DEFAULT 0'], ['daily_xp_date', "TEXT NOT NULL DEFAULT ''"], ['last_xp_at', 'INTEGER NOT NULL DEFAULT 0']] as const) {
      try { db.exec(`ALTER TABLE user_progress ADD COLUMN ${column} ${definition}`); }
      catch (error) { if (!(error instanceof Error) || !error.message.includes('duplicate column name')) throw error; }
    }
    const addCategory = db.prepare('INSERT OR IGNORE INTO shop_categories(category_id,label,emoji) VALUES(?,?,?)');
    const addItem = db.prepare('INSERT OR IGNORE INTO items(item_id,item_type,category_id,name,description,price,color,rarity,emoji) VALUES(?,?,?,?,?,?,?,?,?)');
    const seed = db.transaction(() => {
      for (const category of profileShopCategories) addCategory.run(category.id, category.label, category.emoji);
      for (const item of profileShopItems) addItem.run(item.id,item.type,item.category,item.name,item.description,item.price,item.color,item.rarity,item.emoji);
      db.prepare('DELETE FROM items WHERE item_id=?').run('pet_rpg_link');
    }); seed();
  }
  await migratePlayerDataToGlobalScope();
}

export function levelForExperience(xp: number): number { return Math.max(1, Math.floor(Math.sqrt(Math.max(0, xp) / LEVEL_XP)) + 1); }

export async function recordChatActivity(guildId: string, userId: string): Promise<{ levelUp: boolean; level: number; xp: number } | undefined> {
  guildId = GLOBAL_SCOPE_ID;
  const key = `${guildId}:${userId}`; const now = Date.now(); const last = messageCooldown.get(key) ?? 0;
  if (now - last < CHAT_XP_COOLDOWN_MS) return undefined;
  if (messageCooldown.size > 20_000) for (const [entry, time] of messageCooldown) if (now - time > 3_600_000) messageCooldown.delete(entry);
  messageCooldown.set(key, now);
  const roll = randomInt(10, 21); const at = Math.floor(now / 1000); const date = new Date(now).toISOString().slice(0, 10);
  if (economyPool) {
    const result = await withEconomyTransaction(async (connection) => {
      await connection.execute('INSERT IGNORE INTO user_progress(user_id,updated_at) VALUES(?,?)', [userId,at]);
      const [beforeRows] = await connection.execute<RowDataPacket[]>('SELECT level,xp,daily_xp AS dailyXp,daily_xp_date AS dailyXpDate,last_xp_at AS lastXpAt FROM user_progress WHERE user_id=? FOR UPDATE', [userId]);
      const before = beforeRows[0]!; if (at - Number(before.lastXpAt ?? 0) < CHAT_XP_COOLDOWN_MS / 1000) return undefined;
      const earnedToday = String(before.dailyXpDate ?? '') === date ? Number(before.dailyXp ?? 0) : 0;
      const gain = Math.min(roll, PROFILE_CHAT_XP_DAILY_CAP - earnedToday); if (gain <= 0) return undefined;
      const nextXp = Number(before.xp) + gain;
      await connection.execute('UPDATE user_progress SET level=FLOOR(SQRT(?/?))+1,xp=?,messages=messages+1,daily_xp=?,daily_xp_date=?,last_xp_at=?,updated_at=? WHERE user_id=?', [nextXp,LEVEL_XP,nextXp,earnedToday+gain,date,at,at,userId]);
      const [rows] = await connection.execute<RowDataPacket[]>('SELECT xp,level FROM user_progress WHERE user_id=?', [userId]);
      return { levelUp: Number(rows[0]?.level ?? 1) > Number(before.level ?? 1), level: Number(rows[0]?.level ?? 1), xp: Number(rows[0]?.xp ?? gain) };
    });
    return result;
  }
  const result = db.transaction(() => {
    db.prepare('INSERT OR IGNORE INTO user_progress(user_id) VALUES(?)').run(userId);
    const before = db.prepare('SELECT level,xp,daily_xp AS dailyXp,daily_xp_date AS dailyXpDate,last_xp_at AS lastXpAt FROM user_progress WHERE user_id=?').get(userId) as { level: number; xp: number; dailyXp: number; dailyXpDate: string; lastXpAt: number };
    if (at - Number(before.lastXpAt ?? 0) < CHAT_XP_COOLDOWN_MS / 1000) return undefined;
    const earnedToday = before.dailyXpDate === date ? Number(before.dailyXp) : 0;
    const gain = Math.min(roll, PROFILE_CHAT_XP_DAILY_CAP - earnedToday); if (gain <= 0) return undefined;
    const xp = Number(before.xp) + gain; const level = levelForExperience(xp);
    db.prepare('UPDATE user_progress SET xp=?,level=?,messages=messages+1,daily_xp=?,daily_xp_date=?,last_xp_at=?,updated_at=? WHERE user_id=?').run(xp,level,earnedToday+gain,date,at,at,userId);
    return { levelUp: level > Number(before.level), level, xp };
  }).immediate();
  return result;
}

export async function getProfileSettings(userId: string): Promise<ProfileSettings> {
  if (economyPool) {
    await economyPool.execute('INSERT IGNORE INTO user_profiles(user_id,updated_at) VALUES(?,?)',[userId,Math.floor(Date.now()/1000)]);
    const [rows] = await economyPool.execute<RowDataPacket[]>('SELECT about,title,accent,profile_bg AS profileBg,rank_bg AS rankBg,wallet_bg AS walletBg,levelup_bg AS levelupBg,tag,frame,sticker FROM user_profiles WHERE user_id=?',[userId]);
    return normalizeProfileSettings(rows[0] as Record<string, unknown> | undefined);
  }
  db.prepare('INSERT OR IGNORE INTO user_profiles(user_id) VALUES(?)').run(userId);
  return normalizeProfileSettings(db.prepare('SELECT about,title,accent,profile_bg AS profileBg,rank_bg AS rankBg,wallet_bg AS walletBg,levelup_bg AS levelupBg,tag,frame,sticker FROM user_profiles WHERE user_id=?').get(userId) as Record<string, unknown> | undefined);
}

export async function getProfileProgress(_guildId: string, userId: string): Promise<ProfileProgress> {
  const today = new Date().toISOString().slice(0,10);
  if (economyPool) {
    const [rows] = await economyPool.execute<RowDataPacket[]>('SELECT xp,level,messages,reputation,hugs_received AS hugsReceived,pats_received AS patsReceived,daily_xp AS dailyXp,daily_xp_date AS dailyXpDate FROM user_progress WHERE user_id=?', [userId]);
    const row=(rows[0] ?? {}) as Record<string, number|string>;
    const xp=Number(row.xp ?? 0); const level=Number(row.level ?? 1); const messages=Number(row.messages ?? 0);
    const dailyXp=String(row.dailyXpDate??'')===today?Number(row.dailyXp??0):0;
    const [ranks] = await economyPool.execute<RowDataPacket[]>('SELECT COUNT(*)+1 rank FROM user_progress WHERE xp>(SELECT COALESCE(xp,0) FROM user_progress WHERE user_id=?)', [userId]);
    const rank=Number((ranks[0] as Record<string, number> | undefined)?.rank ?? 1);
    return { xp,level,messages,reputation:Number(row.reputation ?? 0),hugsReceived:Number(row.hugsReceived ?? 0),patsReceived:Number(row.patsReceived ?? 0),dailyXp,serverXp:xp,serverLevel:level,serverMessages:messages,globalRank:rank,serverRank:rank };
  }
  const row = db.prepare('SELECT COALESCE(xp,0) xp,COALESCE(level,1) level,COALESCE(messages,0) messages,COALESCE(reputation,0) reputation,COALESCE(hugs_received,0) hugsReceived,COALESCE(pats_received,0) patsReceived,COALESCE(daily_xp,0) dailyXp,daily_xp_date AS dailyXpDate FROM user_progress WHERE user_id=?').get(userId) as (Record<string, number|string> | undefined);
  const xp=Number(row?.xp ?? 0); const level=Number(row?.level ?? 1); const messages=Number(row?.messages ?? 0);
  const globalRank = Number((db.prepare('SELECT COUNT(*)+1 rank FROM user_progress WHERE xp>(SELECT COALESCE(xp,0) FROM user_progress WHERE user_id=?)').get(userId) as { rank:number }).rank);
  const dailyXp=String(row?.dailyXpDate??'')===today?Number(row?.dailyXp??0):0;
  return { xp,level,messages,reputation:Number(row?.reputation ?? 0),hugsReceived:Number(row?.hugsReceived ?? 0),patsReceived:Number(row?.patsReceived ?? 0),dailyXp,serverXp:xp,serverLevel:level,serverMessages:messages,globalRank,serverRank:globalRank };
}

export async function recordReceivedRpgReaction(userId: string, kind: 'hug' | 'pat'): Promise<void> {
  const column = kind === 'hug' ? 'hugs_received' : 'pats_received';
  const at = Math.floor(Date.now() / 1000);
  if (economyPool) {
    await economyPool.execute('INSERT IGNORE INTO user_progress(user_id,updated_at) VALUES(?,?)', [userId, at]);
    await economyPool.execute(`UPDATE user_progress SET ${column}=${column}+1,updated_at=? WHERE user_id=?`, [at, userId]);
    return;
  }
  db.prepare('INSERT OR IGNORE INTO user_progress(user_id) VALUES(?)').run(userId);
  db.prepare(`UPDATE user_progress SET ${column}=${column}+1,updated_at=? WHERE user_id=?`).run(at, userId);
}

export async function getProfileInventory(guildId: string, userId: string): Promise<ProfileInventoryEntry[]> {
  guildId = GLOBAL_SCOPE_ID;
  const [settings, badges] = await Promise.all([getProfileSettings(userId), equippedProfileBadges(userId)]);
  const equippedIds = [settings.profileBg, settings.rankBg, settings.walletBg, settings.levelupBg, settings.tag, settings.frame, settings.sticker, ...badges]
    .filter((itemId): itemId is string => Boolean(itemId));
  const selectedAccent = profileShopItems.find((item) => item.type === 'accent' && item.color.toLocaleLowerCase() === settings.accent.toLocaleLowerCase());
  if (selectedAccent) equippedIds.push(selectedAccent.id);
  const legacyOwnedIds = [...new Set(equippedIds.filter((itemId) => profileShopItems.some((item) => item.id === itemId)))];
  const at = Math.floor(Date.now() / 1000);
  if (economyPool) {
    for (const itemId of legacyOwnedIds) {
      await economyPool.execute('INSERT INTO user_inventory(guild_id,user_id,item_id,quantity,acquired_at) VALUES(?,?,?,1,?) ON DUPLICATE KEY UPDATE quantity=GREATEST(quantity,1)', [guildId,userId,itemId,at]);
    }
    const [rows] = await economyPool.execute<RowDataPacket[]>('SELECT item_id itemId,quantity,acquired_at acquiredAt FROM user_inventory WHERE guild_id=? AND user_id=? AND quantity>0 ORDER BY acquired_at DESC',[guildId,userId]);
    return rows.map((row) => ({itemId:String(row.itemId),quantity:Number(row.quantity),acquiredAt:Number(row.acquiredAt)}));
  }
  const transaction = db.transaction(() => {
    const insert = db.prepare('INSERT INTO user_inventory(guild_id,user_id,item_id,quantity,acquired_at) VALUES(?,?,?,1,?) ON CONFLICT(guild_id,user_id,item_id) DO UPDATE SET quantity=MAX(user_inventory.quantity,1)');
    for (const itemId of legacyOwnedIds) insert.run(guildId,userId,itemId,at);
  });
  transaction.immediate();
  return db.prepare('SELECT item_id itemId,quantity,acquired_at acquiredAt FROM user_inventory WHERE guild_id=? AND user_id=? AND quantity>0 ORDER BY acquired_at DESC').all(guildId,userId) as ProfileInventoryEntry[];
}

export type ProfilePurchaseCurrency = 'coins' | 'gems';
export async function buyProfileItem(guildId: string,userId: string,itemId: string,reference: string,currency:ProfilePurchaseCurrency='coins'): Promise<{ok:true;balance:number;price:number}|{ok:false;reason:'not_found'|'free_item'|'currency_unavailable'|'already_owned'|'insufficient';balance:number}> {
  guildId = GLOBAL_SCOPE_ID;
  const item=profileShopItems.find((entry)=>entry.id===itemId);
  if(!item) return {ok:false,reason:'not_found',balance:0};
  const priceQuote=currency==='coins'&&item.price>0?await getProductPriceQuote({kind:'profile',id:itemId,category:item.category,basePrice:item.price,categorySize:profileShopItems.filter((entry)=>entry.type!=='pet'&&entry.category===item.category).length}):undefined;
  const price=currency==='gems'?(gemPricedCosmeticTypes.has(item.type)?item.premiumPrice:undefined):priceQuote?.price??item.price;
  if(typeof price!=='number'||!Number.isSafeInteger(price)||price<=0) return {ok:false,reason:currency==='gems'?'currency_unavailable':'free_item',balance:0};
  const balanceColumn=currency==='gems'?'premium_balance':'balance';
  const ledgerReference=`${currency==='gems'?'profile-shop-gems':'profile-shop'}:${reference}`;
  const ledgerReason=currency==='gems'?`profile_shop_gems:${itemId}`:`profile_shop:${itemId}`;
  const at=Math.floor(Date.now()/1000);
  if(economyPool) return withEconomyTransaction(async(connection)=>{
    await connection.execute('INSERT IGNORE INTO economy_accounts(guild_id,user_id,balance,created_at,updated_at) VALUES(?,?,?,?,?)',[guildId,userId,ECONOMY_STARTING_BALANCE,at,at]);
    const [owned]=await connection.execute<RowDataPacket[]>('SELECT quantity FROM user_inventory WHERE guild_id=? AND user_id=? AND item_id=? FOR UPDATE',[guildId,userId,itemId]);
    if(owned.length) return {ok:false as const,reason:'already_owned' as const,balance:0};
    const [accounts]=await connection.execute<RowDataPacket[]>(`SELECT ${balanceColumn} AS balance FROM economy_accounts WHERE guild_id=? AND user_id=? FOR UPDATE`,[guildId,userId]);
    const balance=Number(accounts[0]?.balance??0);
    if(balance<price) return {ok:false as const,reason:'insufficient' as const,balance};
    await connection.execute(`UPDATE economy_accounts SET ${balanceColumn}=${balanceColumn}-?,updated_at=? WHERE guild_id=? AND user_id=?`,[price,at,guildId,userId]);
    await connection.execute('INSERT INTO economy_ledger(guild_id,user_id,amount,reason,reference,created_at) VALUES(?,?,?,?,?,?)',[guildId,userId,-price,ledgerReason,ledgerReference,at]);
    await connection.execute('INSERT INTO user_inventory(guild_id,user_id,item_id,quantity,acquired_at) VALUES(?,?,?,1,?) ON DUPLICATE KEY UPDATE quantity=quantity+1',[guildId,userId,itemId,at]);
    if(currency==='coins') await recordProductSaleMysql(connection,{userId,kind:'profile',id:itemId,category:item.category,quantity:1,unitPrice:price,reference:ledgerReference,soldAt:at});
    return {ok:true as const,balance:balance-price,price};
  });
  const transaction=db.transaction(()=>{
    db.prepare('INSERT OR IGNORE INTO economy_accounts(guild_id,user_id,balance) VALUES(?,?,?)').run(guildId,userId,ECONOMY_STARTING_BALANCE);
    if(db.prepare('SELECT 1 FROM user_inventory WHERE guild_id=? AND user_id=? AND item_id=?').get(guildId,userId,itemId)) return {ok:false as const,reason:'already_owned' as const,balance:0};
    const account=db.prepare(`SELECT ${balanceColumn} AS balance FROM economy_accounts WHERE guild_id=? AND user_id=?`).get(guildId,userId) as {balance:number};
    const balance=Number(account.balance);
    if(balance<price) return {ok:false as const,reason:'insufficient' as const,balance};
    db.prepare(`UPDATE economy_accounts SET ${balanceColumn}=${balanceColumn}-?,updated_at=? WHERE guild_id=? AND user_id=?`).run(price,at,guildId,userId);
    db.prepare('INSERT INTO economy_ledger(guild_id,user_id,amount,reason,reference,created_at) VALUES(?,?,?,?,?,?)').run(guildId,userId,-price,ledgerReason,ledgerReference,at);
    db.prepare('INSERT INTO user_inventory(guild_id,user_id,item_id,quantity,acquired_at) VALUES(?,?,?,1,?) ON CONFLICT(guild_id,user_id,item_id) DO UPDATE SET quantity=quantity+1').run(guildId,userId,itemId,at);
    if(currency==='coins') recordProductSaleSqlite({userId,kind:'profile',id:itemId,category:item.category,quantity:1,unitPrice:price,reference:ledgerReference,soldAt:at});
    return {ok:true as const,balance:balance-price,price};
  }); return transaction.immediate();
}

export async function equipProfileItem(guildId: string,userId: string,itemId: string): Promise<{ok:boolean;message:string}> {
  guildId = GLOBAL_SCOPE_ID;
  const item=profileShopItems.find((entry)=>entry.id===itemId); if(!item||item.price===0) return {ok:false,message:'Ese artículo no se puede equipar desde la tienda.'};
  const inventory=await getProfileInventory(guildId,userId); if(!inventory.some((entry)=>entry.itemId===itemId)) return {ok:false,message:'Primero consigue el artículo en la tienda.'};
  if(item.type==='badge') {
    if(economyPool) { const [rows]=await economyPool.execute<RowDataPacket[]>('SELECT slot FROM user_equipped_badges WHERE user_id=? AND item_id=?',[userId,itemId]); if(rows.length)return {ok:true,message:'Ese badge ya está equipado.'}; const [slots]=await economyPool.execute<RowDataPacket[]>('SELECT slot FROM user_equipped_badges WHERE user_id=? ORDER BY slot',[userId]); const free=[1,2,3].find((slot)=>!slots.some((row)=>Number(row.slot)===slot)); if(!free)return {ok:false,message:'Ya tienes ocupados los tres slots de badges.'}; await economyPool.execute('INSERT INTO user_equipped_badges(user_id,slot,item_id) VALUES(?,?,?)',[userId,free,itemId]); }
    else { const slots=db.prepare('SELECT slot,item_id itemId FROM user_equipped_badges WHERE user_id=? ORDER BY slot').all(userId) as Array<{slot:number;itemId:string}>; if(slots.some((row)=>row.itemId===itemId))return {ok:true,message:'Ese badge ya está equipado.'}; const free=[1,2,3].find((slot)=>!slots.some((row)=>row.slot===slot)); if(!free)return {ok:false,message:'Ya tienes ocupados los tres slots de badges.'}; db.prepare('INSERT INTO user_equipped_badges(user_id,slot,item_id) VALUES(?,?,?)').run(userId,free,itemId); }
    return {ok:true,message:`Badge **${item.name}** equipado.`};
  }
  const column=equipColumns[item.type]; if(!column)return {ok:false,message:'Ese artículo no tiene ranura de equipamiento.'};
  const sqlColumn=({profileBg:'profile_bg',rankBg:'rank_bg',walletBg:'wallet_bg',levelupBg:'levelup_bg',tag:'tag',frame:'frame',sticker:'sticker',accent:'accent'} as Record<keyof ProfileSettings,string>)[column];
  if(economyPool) { await economyPool.execute('INSERT IGNORE INTO user_profiles(user_id,updated_at) VALUES(?,?)',[userId,Math.floor(Date.now()/1000)]); await economyPool.execute(`UPDATE user_profiles SET ${sqlColumn}=?,updated_at=? WHERE user_id=?`,[itemId,Math.floor(Date.now()/1000),userId]); }
  else { db.prepare('INSERT OR IGNORE INTO user_profiles(user_id) VALUES(?)').run(userId); db.prepare(`UPDATE user_profiles SET ${sqlColumn}=?,updated_at=? WHERE user_id=?`).run(itemId,Math.floor(Date.now()/1000),userId); }
  return {ok:true,message:`${item.emoji} **${item.name}** equipado.`};
}

export async function assignProfileBackground(guildId: string,userId: string,target:ProfileBackgroundTarget,itemId:string|null):Promise<{ok:boolean;message:string}> {
  guildId = GLOBAL_SCOPE_ID;
  const item = itemId ? profileShopItems.find((entry) => entry.id === itemId) : undefined;
  if (itemId && (!item || !['profile_bg','rank_bg','wallet_bg','levelup_bg'].includes(item.type))) {
    return { ok: false, message: 'Selecciona un fondo válido.' };
  }
  if (itemId) {
    const inventory = await getProfileInventory(guildId,userId);
    if (!inventory.some((entry) => entry.itemId === itemId)) return { ok: false, message: 'Primero consigue ese fondo en la tienda.' };
  }

  const at = Math.floor(Date.now() / 1000);
  if (economyPool) {
    await withEconomyTransaction(async (connection) => {
      await connection.execute('INSERT IGNORE INTO user_profiles(user_id,updated_at) VALUES(?,?)', [userId,at]);
      if (target === 'all') {
        await connection.execute('UPDATE user_profiles SET profile_bg=?,rank_bg=?,wallet_bg=?,levelup_bg=?,updated_at=? WHERE user_id=?', [itemId,itemId,itemId,itemId,at,userId]);
      } else {
        const column = profileBackgroundColumns[target];
        await connection.execute(`UPDATE user_profiles SET ${column}=?,updated_at=? WHERE user_id=?`, [itemId,at,userId]);
      }
    });
  } else {
    const update = db.transaction(() => {
      db.prepare('INSERT OR IGNORE INTO user_profiles(user_id) VALUES(?)').run(userId);
      if (target === 'all') {
        db.prepare('UPDATE user_profiles SET profile_bg=?,rank_bg=?,wallet_bg=?,levelup_bg=?,updated_at=? WHERE user_id=?').run(itemId,itemId,itemId,itemId,at,userId);
      } else {
        const column = profileBackgroundColumns[target];
        db.prepare(`UPDATE user_profiles SET ${column}=?,updated_at=? WHERE user_id=?`).run(itemId,at,userId);
      }
    });
    update.immediate();
  }

  const targetName = target === 'all' ? 'todas las tarjetas' : target === 'levelup' ? 'la tarjeta de subida de nivel' : target === 'rank' ? 'la tarjeta de rango' : target === 'wallet' ? 'la wallet' : 'el perfil';
  return { ok: true, message: item ? `Fondo **${item.name}** aplicado a ${targetName}.` : `Fondo retirado de ${targetName}.` };
}

export async function unequipProfileType(userId:string,type:string):Promise<{ok:boolean;message:string}> {
  if(type==='accent') {
    if(economyPool) await economyPool.execute('UPDATE user_profiles SET accent=?,updated_at=? WHERE user_id=?',[DEFAULT_SETTINGS.accent,Math.floor(Date.now()/1000),userId]);
    else db.prepare('UPDATE user_profiles SET accent=?,updated_at=? WHERE user_id=?').run(DEFAULT_SETTINGS.accent,Math.floor(Date.now()/1000),userId);
    return {ok:true,message:'Estilo predeterminado aplicado.'};
  }
  const sqlColumn=({profile_bg:'profile_bg',rank_bg:'rank_bg',wallet_bg:'wallet_bg',levelup_bg:'levelup_bg',frame:'frame',badge:'badge',tag:'tag',sticker:'sticker'} as Record<string,string>)[type];
  if(type==='badge') { if(economyPool) await economyPool.execute('DELETE FROM user_equipped_badges WHERE user_id=?',[userId]); else db.prepare('DELETE FROM user_equipped_badges WHERE user_id=?').run(userId); return {ok:true,message:'Badges desequipados.'}; }
  if(!sqlColumn)return {ok:false,message:'Ranura desconocida.'};
  if(economyPool) await economyPool.execute(`UPDATE user_profiles SET ${sqlColumn}=NULL WHERE user_id=?`,[userId]); else db.prepare(`UPDATE user_profiles SET ${sqlColumn}=NULL WHERE user_id=?`).run(userId);
  return {ok:true,message:'Decoración retirada.'};
}

export async function updateProfileField(userId:string,field:'about'|'title',value:string):Promise<void> {
  const limits={about:180,title:40} as const; const cleaned=value.trim().slice(0,limits[field]);
  if(economyPool) { await economyPool.execute('INSERT IGNORE INTO user_profiles(user_id,updated_at) VALUES(?,?)',[userId,Math.floor(Date.now()/1000)]); await economyPool.execute(`UPDATE user_profiles SET ${field}=?,updated_at=? WHERE user_id=?`,[cleaned,Math.floor(Date.now()/1000),userId]); }
  else { db.prepare('INSERT OR IGNORE INTO user_profiles(user_id) VALUES(?)').run(userId); db.prepare(`UPDATE user_profiles SET ${field}=?,updated_at=? WHERE user_id=?`).run(cleaned,Math.floor(Date.now()/1000),userId); }
}

export async function equippedProfileBadges(userId:string):Promise<string[]> {
  if(economyPool) { const [rows]=await economyPool.execute<RowDataPacket[]>('SELECT item_id itemId FROM user_equipped_badges WHERE user_id=? ORDER BY slot',[userId]); return rows.map((row)=>String(row.itemId)); }
  return (db.prepare('SELECT item_id itemId FROM user_equipped_badges WHERE user_id=? ORDER BY slot').all(userId) as Array<{itemId:string}>).map((row)=>row.itemId);
}

export async function giveReputation(giverId:string,targetId:string):Promise<{ok:boolean;reputation:number}> {
  if(giverId===targetId)return {ok:false,reputation:0};
  const now=Date.now();const at=Math.floor(now/1000);const day=new Date(now).toISOString().slice(0,10);
  if(economyPool)return withEconomyTransaction(async(connection)=>{
    await connection.execute('INSERT IGNORE INTO user_progress(user_id,updated_at) VALUES(?,?)',[targetId,at]);
    try{await connection.execute('INSERT INTO user_reputation_log(giver_id,target_id,day,created_at) VALUES(?,?,?,?)',[giverId,targetId,day,at]);}
    catch(error){if((error as {code?:string}).code==='ER_DUP_ENTRY')return {ok:false,reputation:0};throw error;}
    await connection.execute('UPDATE user_progress SET reputation=reputation+1,updated_at=? WHERE user_id=?',[at,targetId]);
    const [rows]=await connection.execute<RowDataPacket[]>('SELECT reputation FROM user_progress WHERE user_id=?',[targetId]);
    return {ok:true,reputation:Number(rows[0]?.reputation??1)};
  });
  const update=db.transaction(()=>{
    db.prepare('INSERT OR IGNORE INTO user_progress(user_id) VALUES(?)').run(targetId);
    const inserted=db.prepare('INSERT OR IGNORE INTO user_reputation_log(giver_id,target_id,day,created_at) VALUES(?,?,?,?)').run(giverId,targetId,day,at);
    if(!inserted.changes)return {ok:false,reputation:Number((db.prepare('SELECT reputation FROM user_progress WHERE user_id=?').get(targetId) as {reputation:number}).reputation)};
    db.prepare('UPDATE user_progress SET reputation=reputation+1,updated_at=? WHERE user_id=?').run(at,targetId);
    return {ok:true,reputation:Number((db.prepare('SELECT reputation FROM user_progress WHERE user_id=?').get(targetId) as {reputation:number}).reputation)};
  });return update.immediate();
}

export function profileItem(itemId:string|null|undefined):ProfileShopItem|undefined { return itemId ? profileShopItems.find((item)=>item.id===itemId) : undefined; }
