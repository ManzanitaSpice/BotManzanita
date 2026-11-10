import { GLOBAL_SCOPE_ID } from '../storage/global-scope.js';
import { db } from '../storage/database.js';
import { economyPool, withEconomyTransaction } from '../storage/economy-database.js';
const DAY_SECONDS = 24 * 60 * 60;
const SALES_WINDOW_SECONDS = 30 * DAY_SECONDS;
const SALES_RETENTION_SECONDS = 90 * DAY_SECONDS;
const PRICE_INDEX_FLOOR_BPS = 9_000;
const PRICE_INDEX_CEILING_BPS = 11_500;
const MAX_DAILY_INDEX_STEP_BPS = 150;
function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
}
function kindKey(kind, id) { return `${kind}:${id}`; }
function categoryKey(kind, category) { return `${kind}:${category}`; }
function saleKey(kind, category, id) { return `${kind}:${category}:${id}`; }
async function getGlobalPriceIndex(now) {
    if (economyPool)
        return withEconomyTransaction(async (connection) => {
            await connection.execute('INSERT IGNORE INTO economy_product_price_policy(policy_id,price_index_bps,last_rebalanced_at) VALUES(1,10000,0)');
            const [rows] = await connection.execute('SELECT price_index_bps AS priceIndexBps,last_rebalanced_at AS lastRebalancedAt FROM economy_product_price_policy WHERE policy_id=1 FOR UPDATE');
            const row = rows[0] ?? { priceIndexBps: 10_000, lastRebalancedAt: 0 };
            return rebalanceGlobalPriceIndex(connection, Number(row.priceIndexBps), Number(row.lastRebalancedAt), now);
        });
    return db.transaction(() => {
        const row = db.prepare('SELECT price_index_bps AS priceIndexBps,last_rebalanced_at AS lastRebalancedAt FROM economy_product_price_policy WHERE policy_id=1').get();
        return rebalanceGlobalPriceIndexSqlite(Number(row?.priceIndexBps ?? 10_000), Number(row?.lastRebalancedAt ?? 0), now);
    }).immediate();
}
async function rebalanceGlobalPriceIndex(connection, currentIndex, lastAt, now) {
    let priceIndexBps = clamp(currentIndex, PRICE_INDEX_FLOOR_BPS, PRICE_INDEX_CEILING_BPS);
    let lastRebalancedAt = lastAt;
    if (lastAt <= 0 || now - lastAt >= DAY_SECONDS) {
        const snapshot = await mysqlMarketSnapshot(connection, now);
        priceIndexBps = nextPriceIndex(priceIndexBps, snapshot.targetIndexBps);
        lastRebalancedAt = now;
        await connection.execute('UPDATE economy_product_price_policy SET price_index_bps=?,last_rebalanced_at=? WHERE policy_id=1', [priceIndexBps, lastRebalancedAt]);
        await connection.execute('DELETE FROM economy_product_sales WHERE sold_at<?', [now - SALES_RETENTION_SECONDS]);
    }
    return { priceIndexBps, lastRebalancedAt };
}
function rebalanceGlobalPriceIndexSqlite(currentIndex, lastAt, now) {
    let priceIndexBps = clamp(currentIndex, PRICE_INDEX_FLOOR_BPS, PRICE_INDEX_CEILING_BPS);
    let lastRebalancedAt = lastAt;
    if (lastAt <= 0 || now - lastAt >= DAY_SECONDS) {
        priceIndexBps = nextPriceIndex(priceIndexBps, sqliteMarketSnapshot(now));
        lastRebalancedAt = now;
        db.prepare('UPDATE economy_product_price_policy SET price_index_bps=?,last_rebalanced_at=? WHERE policy_id=1').run(priceIndexBps, lastRebalancedAt);
        db.prepare('DELETE FROM economy_product_sales WHERE sold_at<?').run(now - SALES_RETENTION_SECONDS);
    }
    return { priceIndexBps, lastRebalancedAt };
}
function nextPriceIndex(current, target) {
    const delta = target - current;
    return clamp(current + Math.sign(delta) * Math.min(Math.abs(delta), MAX_DAILY_INDEX_STEP_BPS), PRICE_INDEX_FLOOR_BPS, PRICE_INDEX_CEILING_BPS);
}
function marketTargetIndex(snapshot) {
    const moneyGrowthBps = Math.round(snapshot.netIssuance30d / Math.max(snapshot.moneySupply, 1) * 10_000);
    const purchaseVelocityBps = Math.max(0, Math.round(snapshot.purchaseVolume30d / Math.max(snapshot.moneySupply, 1) * 10_000));
    const issuancePressure = clamp(Math.round(moneyGrowthBps * 0.1), -300, 400);
    const demandPressure = clamp(Math.round(purchaseVelocityBps * 0.02), 0, 200);
    const savingsPressure = clamp(Math.round((0.3 - snapshot.savingsShare) * 10_000 * 0.08), -180, 180);
    const payrollPressure = clamp(Math.round(snapshot.payroll30d / Math.max(snapshot.moneySupply, 1) * 10_000 * 0.015), 0, 100);
    const jobPressure = snapshot.activeWorkers > 0
        ? clamp(Math.round(Math.min(1, snapshot.workShifts30d / (snapshot.activeWorkers * 8)) * 50), 0, 50)
        : 0;
    return clamp(10_000 + issuancePressure + demandPressure + savingsPressure + payrollPressure + jobPressure, PRICE_INDEX_FLOOR_BPS, PRICE_INDEX_CEILING_BPS);
}
async function mysqlMarketSnapshot(connection, now) {
    const [accounts] = await connection.execute(`SELECT COALESCE(SUM(balance+bank_balance),0) AS moneySupply,
    COALESCE(SUM(bank_balance),0) AS savings FROM economy_accounts WHERE guild_id=?`, [GLOBAL_SCOPE_ID]);
    const [rows] = await connection.execute(`SELECT
    COALESCE(SUM(CASE WHEN reason IN ('bank:deposit:wallet','bank:deposit:vault','bank:withdraw:wallet','bank:withdraw:vault') OR reason LIKE 'transfer:%' OR reason LIKE 'rob:from:%' OR reason LIKE 'rob:to:%' THEN 0 ELSE amount END),0) AS netIssuance30d,
    COALESCE(SUM(CASE WHEN amount<0 AND (reason LIKE 'store:%' OR reason LIKE 'tool_upgrade:%' OR reason='rpg_shop' OR reason LIKE 'rpg_shop:%' OR reason='rpg_training' OR reason LIKE 'profile_shop:%' OR reason LIKE 'business:land%' OR reason IN ('business:construction','business:upgrade','business:hire:npc','business:utilities','business:debt_payment','business:npc_wage')) THEN -amount ELSE 0 END),0) AS purchaseVolume30d,
    COALESCE(SUM(CASE WHEN amount>0 AND (reason='work_reward' OR reason LIKE 'work_reward:%') THEN amount ELSE 0 END),0) AS payroll30d,
    COALESCE(SUM(CASE WHEN amount>0 AND (reason='work_reward' OR reason LIKE 'work_reward:%') THEN 1 ELSE 0 END),0) AS workShifts30d
    FROM economy_ledger WHERE guild_id=? AND created_at>=? AND created_at<=?`, [GLOBAL_SCOPE_ID, now - SALES_WINDOW_SECONDS, now]);
    const [workers] = await connection.execute('SELECT COUNT(DISTINCT user_id) AS activeWorkers FROM economy_jobs WHERE guild_id=? AND is_active=1', [GLOBAL_SCOPE_ID]);
    const account = (accounts[0] ?? {});
    const flow = (rows[0] ?? {});
    const moneySupply = Number(account.moneySupply ?? 0);
    const savings = Number(account.savings ?? 0);
    return { targetIndexBps: marketTargetIndex({ moneySupply, savingsShare: moneySupply > 0 ? savings / moneySupply : 0,
            netIssuance30d: Number(flow.netIssuance30d ?? 0), purchaseVolume30d: Number(flow.purchaseVolume30d ?? 0),
            payroll30d: Number(flow.payroll30d ?? 0), workShifts30d: Number(flow.workShifts30d ?? 0), activeWorkers: Number(workers[0]?.activeWorkers ?? 0) }) };
}
function sqliteMarketSnapshot(now) {
    const account = db.prepare('SELECT COALESCE(SUM(balance+bank_balance),0) AS moneySupply,COALESCE(SUM(bank_balance),0) AS savings FROM economy_accounts WHERE guild_id=?').get(GLOBAL_SCOPE_ID);
    const flow = db.prepare(`SELECT
    COALESCE(SUM(CASE WHEN reason IN ('bank:deposit:wallet','bank:deposit:vault','bank:withdraw:wallet','bank:withdraw:vault') OR reason LIKE 'transfer:%' OR reason LIKE 'rob:from:%' OR reason LIKE 'rob:to:%' THEN 0 ELSE amount END),0) AS netIssuance30d,
    COALESCE(SUM(CASE WHEN amount<0 AND (reason LIKE 'store:%' OR reason LIKE 'tool_upgrade:%' OR reason='rpg_shop' OR reason LIKE 'rpg_shop:%' OR reason='rpg_training' OR reason LIKE 'profile_shop:%' OR reason LIKE 'business:land%' OR reason IN ('business:construction','business:upgrade','business:hire:npc','business:utilities','business:debt_payment','business:npc_wage')) THEN -amount ELSE 0 END),0) AS purchaseVolume30d,
    COALESCE(SUM(CASE WHEN amount>0 AND (reason='work_reward' OR reason LIKE 'work_reward:%') THEN amount ELSE 0 END),0) AS payroll30d,
    COALESCE(SUM(CASE WHEN amount>0 AND (reason='work_reward' OR reason LIKE 'work_reward:%') THEN 1 ELSE 0 END),0) AS workShifts30d
    FROM economy_ledger WHERE guild_id=? AND created_at>=? AND created_at<=?`)
        .get(GLOBAL_SCOPE_ID, now - SALES_WINDOW_SECONDS, now);
    const workers = db.prepare('SELECT COUNT(DISTINCT user_id) AS activeWorkers FROM economy_jobs WHERE guild_id=? AND is_active=1').get(GLOBAL_SCOPE_ID);
    const moneySupply = Number(account?.moneySupply ?? 0);
    const savings = Number(account?.savings ?? 0);
    return marketTargetIndex({ moneySupply, savingsShare: moneySupply > 0 ? savings / moneySupply : 0,
        netIssuance30d: Number(flow.netIssuance30d), purchaseVolume30d: Number(flow.purchaseVolume30d), payroll30d: Number(flow.payroll30d),
        workShifts30d: Number(flow.workShifts30d), activeWorkers: Number(workers.activeWorkers) });
}
export async function getProductPriceQuotes(requests, now = Math.floor(Date.now() / 1000)) {
    const valid = requests.filter((entry) => Number.isSafeInteger(entry.basePrice) && entry.basePrice >= 0 && entry.id.length > 0);
    const quotes = new Map();
    if (!valid.length)
        return quotes;
    const policy = await getGlobalPriceIndex(now);
    const requestedKeys = new Set(valid.map((entry) => kindKey(entry.kind, entry.id)));
    const cached = new Map();
    const selectQuotes = 'SELECT product_kind AS productKind,product_id AS productId,category,base_price AS basePrice,current_price AS currentPrice,global_index_bps AS globalIndexBps,demand_index_bps AS demandIndexBps,units_30d AS units30d,category_size AS categorySize,quoted_at AS quotedAt FROM economy_product_price_quotes';
    const cacheRows = economyPool
        ? (await economyPool.execute(selectQuotes))[0]
        : db.prepare(selectQuotes).all();
    for (const row of cacheRows) {
        const key = kindKey(row.productKind, String(row.productId));
        if (requestedKeys.has(key))
            cached.set(key, { ...row, basePrice: Number(row.basePrice), currentPrice: Number(row.currentPrice), globalIndexBps: Number(row.globalIndexBps), demandIndexBps: Number(row.demandIndexBps), units30d: Number(row.units30d), categorySize: Number(row.categorySize), quotedAt: Number(row.quotedAt) });
    }
    const stale = valid.filter((entry) => {
        const key = kindKey(entry.kind, entry.id);
        if (entry.basePrice === 0) {
            quotes.set(key, { price: 0, basePrice: 0, globalIndexBps: policy.priceIndexBps, demandIndexBps: 10_000, units30d: 0, quotedAt: policy.lastRebalancedAt });
            return false;
        }
        const row = cached.get(key);
        if (row && row.quotedAt === policy.lastRebalancedAt && row.basePrice === entry.basePrice && row.category === entry.category && row.categorySize === entry.categorySize) {
            quotes.set(key, { price: row.currentPrice, basePrice: row.basePrice, globalIndexBps: row.globalIndexBps, demandIndexBps: row.demandIndexBps, units30d: row.units30d, quotedAt: row.quotedAt });
            return false;
        }
        return true;
    });
    if (!stale.length)
        return quotes;
    const stats = new Map();
    const categoryTotals = new Map();
    const pendingQuotes = [];
    const query = `SELECT product_kind AS productKind,product_id AS productId,category,
    COALESCE(SUM(CASE WHEN sold_at>=? THEN quantity ELSE 0 END),0) AS recentUnits,
    COALESCE(SUM(CASE WHEN sold_at<? THEN quantity ELSE 0 END),0) AS previousUnits
    FROM economy_product_sales WHERE sold_at>=? AND sold_at<=? GROUP BY product_kind,category,product_id`;
    const saleRows = economyPool
        ? (await economyPool.execute(query, [now - SALES_WINDOW_SECONDS, now - SALES_WINDOW_SECONDS, now - 2 * SALES_WINDOW_SECONDS, now]))[0]
        : db.prepare(query).all(now - SALES_WINDOW_SECONDS, now - SALES_WINDOW_SECONDS, now - 2 * SALES_WINDOW_SECONDS, now);
    for (const row of saleRows) {
        const recentUnits = Number(row.recentUnits);
        const previousUnits = Number(row.previousUnits);
        stats.set(saleKey(row.productKind, String(row.category), String(row.productId)), { recentUnits, previousUnits });
        const key = categoryKey(row.productKind, String(row.category));
        const total = categoryTotals.get(key) ?? { recentUnits: 0, previousUnits: 0 };
        total.recentUnits += recentUnits;
        total.previousUnits += previousUnits;
        categoryTotals.set(key, total);
    }
    for (const entry of stale) {
        const itemStats = stats.get(saleKey(entry.kind, entry.category, entry.id)) ?? { recentUnits: 0, previousUnits: 0 };
        const categoryStats = categoryTotals.get(categoryKey(entry.kind, entry.category)) ?? { recentUnits: 0, previousUnits: 0 };
        const categoryAverage = categoryStats.recentUnits / Math.max(1, entry.categorySize);
        // Two baseline sales soften sparse data; category comparison and week-over-week demand keep prices responsive.
        const relativeDemand = (itemStats.recentUnits + 2) / (categoryAverage + 2);
        const demandTrend = (itemStats.recentUnits + 2) / (itemStats.previousUnits + 2);
        // Everyday economy goods stay within a narrower band; cosmetics and RPG goods
        // can react more to scarcity and popularity as discretionary purchases.
        const flexibleLuxury = entry.kind !== 'economy';
        const demandElasticity = flexibleLuxury ? 1_600 : 700;
        const trendElasticity = flexibleLuxury ? 600 : 300;
        const demandIndexBps = clamp(Math.round(10_000 + demandElasticity * Math.log(relativeDemand) + trendElasticity * Math.log(demandTrend)), flexibleLuxury ? 8_500 : 9_500, flexibleLuxury ? 13_000 : 11_000);
        const floor = Math.max(1, Math.floor(entry.basePrice * (flexibleLuxury ? 0.75 : 0.9)));
        const ceiling = Math.max(floor, Math.ceil(entry.basePrice * (flexibleLuxury ? 1.5 : 1.2)));
        const price = clamp(Math.round(entry.basePrice * policy.priceIndexBps * demandIndexBps / 100_000_000), floor, ceiling);
        const quote = { price, basePrice: entry.basePrice, globalIndexBps: policy.priceIndexBps, demandIndexBps, units30d: itemStats.recentUnits, quotedAt: policy.lastRebalancedAt };
        quotes.set(kindKey(entry.kind, entry.id), quote);
        pendingQuotes.push([entry.kind, entry.id, entry.category, entry.basePrice, price, policy.priceIndexBps, demandIndexBps, itemStats.recentUnits, Math.max(1, entry.categorySize), policy.lastRebalancedAt]);
    }
    const columns = 'product_kind,product_id,category,base_price,current_price,global_index_bps,demand_index_bps,units_30d,category_size,quoted_at';
    const update = economyPool
        ? 'ON DUPLICATE KEY UPDATE category=VALUES(category),base_price=VALUES(base_price),current_price=VALUES(current_price),global_index_bps=VALUES(global_index_bps),demand_index_bps=VALUES(demand_index_bps),units_30d=VALUES(units_30d),category_size=VALUES(category_size),quoted_at=VALUES(quoted_at)'
        : 'ON CONFLICT(product_kind,product_id) DO UPDATE SET category=excluded.category,base_price=excluded.base_price,current_price=excluded.current_price,global_index_bps=excluded.global_index_bps,demand_index_bps=excluded.demand_index_bps,units_30d=excluded.units_30d,category_size=excluded.category_size,quoted_at=excluded.quoted_at';
    for (let offset = 0; offset < pendingQuotes.length; offset += 40) {
        const chunk = pendingQuotes.slice(offset, offset + 40);
        const placeholders = chunk.map(() => '(?,?,?,?,?,?,?,?,?,?)').join(',');
        const statement = `INSERT INTO economy_product_price_quotes(${columns}) VALUES ${placeholders} ${update}`;
        const values = chunk.flat();
        if (economyPool)
            await economyPool.execute(statement, values);
        else
            db.prepare(statement).run(...values);
    }
    return quotes;
}
export async function getProductPriceQuote(request, now = Math.floor(Date.now() / 1000)) {
    return (await getProductPriceQuotes([request], now)).get(kindKey(request.kind, request.id));
}
export function calculateProductSaleCommission(quote, quantity) {
    const grossAmount = quote.price * quantity;
    const pricePressureBps = clamp(Math.floor(Math.log10(Math.max(1, quote.price)) * 150), 0, 450);
    const demandPressureBps = clamp(Math.round((quote.demandIndexBps - 10_000) * 0.35), -175, 350);
    const bankPressureBps = clamp(Math.round((quote.globalIndexBps - 10_000) * 0.12), -120, 180);
    const commissionBps = clamp(200 + pricePressureBps + demandPressureBps + bankPressureBps, 100, 1_000);
    const calculatedCommission = Math.ceil(grossAmount * commissionBps / 10_000);
    // Selling always pays: leave at least one coin with the player, even after rounding.
    const commissionAmount = grossAmount <= 1 ? 0 : Math.min(grossAmount - 1, Math.max(1, calculatedCommission));
    const effectiveCommissionBps = grossAmount > 0 ? Math.round(commissionAmount / grossAmount * 10_000) : 0;
    return { grossAmount, commissionAmount, netAmount: grossAmount - commissionAmount, commissionBps, effectiveCommissionBps };
}
export async function recordProductSaleMysql(connection, sale) {
    await connection.execute('INSERT INTO economy_product_sales(user_id,product_kind,product_id,category,quantity,unit_price,reference,sold_at) VALUES(?,?,?,?,?,?,?,?)', [sale.userId, sale.kind, sale.id, sale.category, sale.quantity, sale.unitPrice, sale.reference, sale.soldAt]);
}
export function recordProductSaleSqlite(sale) {
    db.prepare('INSERT INTO economy_product_sales(user_id,product_kind,product_id,category,quantity,unit_price,reference,sold_at) VALUES(?,?,?,?,?,?,?,?)')
        .run(sale.userId, sale.kind, sale.id, sale.category, sale.quantity, sale.unitPrice, sale.reference, sale.soldAt);
}
