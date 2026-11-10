import { GLOBAL_SCOPE_ID } from '../storage/global-scope.js';
import { randomBytes, randomInt } from 'node:crypto';
import { db } from '../storage/database.js';
import { ECONOMY_STARTING_BALANCE } from '../storage/economy-defaults.js';
import { economyPool, insertItemLedger, insertLedger, withEconomyTransaction } from '../storage/economy-database.js';
export const DAILY_AMOUNT = 75;
const DAILY_COOLDOWN_SECONDS = 24 * 60 * 60;
const WORK_COOLDOWN_SECONDS = 60 * 60;
const FISH_COOLDOWN_SECONDS = 60 * 60;
const ROB_COOLDOWN_SECONDS = 2 * 60 * 60;
const CRIME_COOLDOWN_SECONDS = 4 * 60 * 60;
const BANK_INTEREST_INTERVAL_SECONDS = 5 * 60 * 60;
const BANK_PERIODS_PER_YEAR = (365 * 24 * 60 * 60) / BANK_INTEREST_INTERVAL_SECONDS;
const BANK_INTEREST_REMAINDER_DENOMINATOR = 10_000 * BANK_PERIODS_PER_YEAR;
const BANK_POLICY_REBALANCE_SECONDS = 24 * 60 * 60;
const BANK_MODEL_VERSION = 3;
export const BANK_APR_FLOOR_BPS = 6_500;
export const BANK_APR_CEILING_BPS = 9_500;
export const BANK_BASE_APR_BPS = 6_500;
const BANK_TARGET_SAVINGS_SHARE = 0.3;
const BANK_MAX_DAILY_APR_STEP_BPS = 1_000;
const BANK_ACTIVITY_WINDOW_SECONDS = 30 * 24 * 60 * 60;
const ROB_SHIELD_SECONDS = 24 * 60 * 60;
const MAX_BET = 100_000;
export const JOB_XP_PER_SHIFT = 25;
export const MAX_JOB_LEVEL = 20;
export const economyJobs = [
    { id: 'minero', name: 'Minero', emoji: '⛏️', toolId: 'pico', toolName: 'Pico', minPay: 42, maxPay: 56, messages: ['⛏️ Extrajiste mineral de una veta profunda.', '💎 Encontraste una bolsa de mineral valioso.', '🪨 Limpiaste el túnel y llevaste el mineral al taller.'] },
    { id: 'lenador', name: 'Leñador', emoji: '🪓', toolId: 'hacha', toolName: 'Hacha', minPay: 40, maxPay: 54, messages: ['🪵 Cortaste y apilaste madera para el pueblo.', '🌲 Preparaste troncos para la carpintería.', '🪓 Despejaste una zona y cargaste la leña.'] },
    { id: 'agricultor', name: 'Agricultor', emoji: '🌾', toolId: 'azada', toolName: 'Azada', minPay: 38, maxPay: 52, messages: ['🌱 Preparaste los surcos para la siguiente cosecha.', '🥕 Cuidaste el cultivo y llevaste verduras al mercado.', '🌾 Regaste y limpiaste el campo antes del anochecer.'] },
    { id: 'repartidor', name: 'Repartidor', emoji: '📦', toolId: 'mochila_repartidor', toolName: 'Mochila de reparto', minPay: 40, maxPay: 54, messages: ['🚲 Entregaste paquetes por todo el barrio.', '📦 Completaste una ruta de entregas a tiempo.', '🧭 Encontraste cada dirección y entregaste los pedidos.'] },
    { id: 'cocinero', name: 'Cocinero', emoji: '🍳', toolId: 'kit_cocinero', toolName: 'Kit de cocina', minPay: 42, maxPay: 56, messages: ['🍜 Preparaste un turno lleno en la cocina.', '🥘 Cocinaste el menú del día para el mercado.', '🧁 Vendiste una tanda completa de postres.'] },
    { id: 'pescador', name: 'Pescador', emoji: '🎣', toolId: 'cana_pescar', toolName: 'Caña de pescar', minPay: 38, maxPay: 52, messages: ['🎣 Reparaste las redes del muelle y ordenaste la captura.', '🛶 Ayudaste a preparar las barcas para salir al lago.', '🐟 Clasificaste la pesca de la mañana para el mercado.'] },
];
function jobXpToNext(level) { return level >= MAX_JOB_LEVEL ? 0 : 100 + (level - 1) * 25; }
function makeJobProgress(jobId, level, xp) {
    const job = economyJobs.find((candidate) => candidate.id === jobId);
    return job ? { job, level, xp, xpToNext: jobXpToNext(level) } : undefined;
}
const fishCommon = ['mojarra', 'trucha', 'carpa', 'sardina', 'bagre', 'tilapia', 'robalo', 'lisa'];
const fishRare = ['salmón plateado', 'atún gigante', 'pez dorado', 'lucio legendario', 'carpa koi'];
const fishCatchLines = [
    'La caña se dobló y sacaste un **{fish}**.',
    '¡Buena pesca! Un **{fish}** mordió el anzuelo.',
    'Después de esperar junto al agua, atrapaste un **{fish}**.',
    'Tu paciencia rindió frutos: apareció un **{fish}**.',
    'El agua salpicó por todos lados cuando sacaste un **{fish}**.',
    '¡La suerte estuvo de tu lado! Pescaste un **{fish}**.',
    'El pescador del muelle se quedó con tu **{fish}**.',
    'Una captura fresca: **{fish}**.',
    'La red volvió pesada. Entre la pesca había un **{fish}**.',
    'El anzuelo encontró dueño: un **{fish}**.',
    'Tuviste una mañana productiva y sacaste un **{fish}**.',
    'El mercado recibió con gusto tu **{fish}**.',
    '¡Captura limpia! Un **{fish}** cayó en la cubeta.',
    'Un **{fish}** saltó directo a la cubeta.',
    'Volviste del río con un **{fish}** en el cubo.',
    'El agua estaba tranquila hasta que picó un **{fish}**.',
    'El puesto de la plaza recibió tu **{fish}**.',
    '¡Qué buen ejemplar! Sacaste un **{fish}**.',
    'Una vuelta más al lago valió la pena: apareció un **{fish}**.',
    'El pescador vecino te envidió la captura: un **{fish}**.',
];
const fishMissLines = [
    'Un pez mordió el anzuelo y escapó justo antes de subirlo. Hoy no hubo venta.',
    'Sacaste una bota vieja. El mercado no aceptó la mercancía.',
    'El viento se llevó la carnada. Te quedaste sin captura, pero con una buena historia.',
    'La caña se movió… era una rama. No ganaste monedas esta vez.',
    'El lago estaba tranquilo y los peces también. Vuelve a intentarlo más tarde.',
    'Un cangrejo robó tu carnada y desapareció entre las piedras.',
    'La red regresó vacía. Al menos disfrutaste la vista.',
    'Se rompió el sedal antes de la captura. Hoy la pesca no pagó.',
    'Un pez enorme pasó frente a ti y siguió nadando. Mala suerte.',
    'El anzuelo volvió sin carnada y sin peces.',
    'La lluvia espantó a los peces. Tu bolsillo quedó igual.',
    'El cubo terminó lleno de agua, pero sin pesca que vender.',
];
const robSuccessLines = [
    'Te moviste entre las sombras y escapaste sin que {target} lo notara.',
    'El plan salió perfecto: {target} no alcanzó a reaccionar.',
    'Un descuido de {target} te dejó vía libre.',
    'Hiciste el cambio de bolsillo sin que nadie lo notara.',
    'La huida fue limpia. Te alejaste de {target} a tiempo.',
    'Tu disfraz funcionó y {target} no sospechó nada.',
    'El golpe fue rápido y silencioso.', 'Te mezclaste con la multitud y desapareciste.',
    'Una distracción, un paso y listo.', 'El plan maestro funcionó por una vez.',
];
const robFailLines = [
    '{target} te vio venir. Tocó pagar la multa.', 'El guardia apareció de la nada y la huida salió cara.',
    'Te resbalaste antes de llegar al botín. Qué timing.', '{target} te atrapó con las manos en la masa.',
    'Tu plan falló por un ruido inoportuno.', 'La bolsa tenía una campanita. Mala elección.',
    'La alarma sonó y tuviste que salir corriendo.', 'Te confundiste de bolsillo y todo salió al revés.',
    'El intento fue detectado.', 'La mala suerte ganó esta ronda.',
];
const rouletteWinLines = [
    '¡La bola cayó donde dijiste!', 'La ruleta te sonrió.', 'Apuesta acertada. El casino paga.',
    'La mesa quedó en silencio: ¡acertaste!', 'Tu predicción fue exacta.',
    'La suerte giró a tu favor.', '¡Color ganador!', 'La bola se detuvo en tu color.',
];
const rouletteLoseLines = [
    'La bola cayó en otro color. Esta ronda se queda en la mesa.',
    'La ruleta no coincidió con tu apuesta. Prueba otra vez cuando quieras.',
    'Esta vez el casino tuvo suerte. La apuesta se perdió.',
    'La bola pasó de largo tu color. No hubo premio.',
    'Casi aciertas, pero no. La siguiente puede ser tuya.',
    'El giro terminó en otro color. Apuesta liquidada.',
    'La mesa se llevó la apuesta. No persigas las pérdidas; vuelve cuando quieras.',
    'El resultado no coincidió con tu elección. Sin premio en esta ronda.',
];
const blackjackWinLines = ['¡21! La mesa paga tu victoria.', 'Mano ganadora. Cobraste el premio.', 'El crupier se pasó. Esta ronda es tuya.', 'Buena mano: venciste al crupier.'];
const blackjackLoseLines = ['El crupier ganó esta mano.', 'Te pasaste de 21. La apuesta se perdió.', 'La mesa se lleva esta ronda.', 'No alcanzó para vencer al crupier.'];
function nowSeconds() { return Math.floor(Date.now() / 1000); }
function pick(items) { return items[randomInt(items.length)]; }
function formatMessage(template, values) {
    return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ''));
}
function sqliteEnsureAccount(guildId, userId) {
    const now = nowSeconds();
    db.prepare('INSERT OR IGNORE INTO economy_accounts (guild_id, user_id, balance, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
        .run(guildId, userId, ECONOMY_STARTING_BALANCE, now, now);
    const row = db.prepare(`SELECT balance, bank_balance AS bankBalance, premium_balance AS premiumBalance,
      last_daily_at AS lastDailyAt, last_work_at AS lastWorkAt,
      last_fish_at AS lastFishAt, last_rob_at AS lastRobAt, last_crime_at AS lastCrimeAt,
      last_bank_interest_at AS lastBankInterestAt, bank_interest_remainder AS bankInterestRemainder,
      rob_protected_until AS robProtectedUntil
    FROM economy_accounts WHERE guild_id = ? AND user_id = ?`).get(guildId, userId);
    return row;
}
async function mysqlRows(connection, sql, values = []) {
    const [rows] = await connection.execute(sql, values);
    return rows;
}
async function mysqlEnsureAccount(connection, guildId, userId, lock = false) {
    const now = nowSeconds();
    await connection.execute('INSERT IGNORE INTO economy_accounts (guild_id, user_id, balance, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [guildId, userId, ECONOMY_STARTING_BALANCE, now, now]);
    const rows = await mysqlRows(connection, `SELECT balance, bank_balance AS bankBalance, premium_balance AS premiumBalance,
       last_daily_at AS lastDailyAt, last_work_at AS lastWorkAt,
       last_fish_at AS lastFishAt, last_rob_at AS lastRobAt, last_crime_at AS lastCrimeAt,
       last_bank_interest_at AS lastBankInterestAt, bank_interest_remainder AS bankInterestRemainder,
       rob_protected_until AS robProtectedUntil
     FROM economy_accounts WHERE guild_id = ? AND user_id = ?${lock ? ' FOR UPDATE' : ''}`, [guildId, userId]);
    const row = rows[0];
    if (!row)
        throw new Error('No pude cargar la cuenta de economía.');
    return {
        balance: Number(row.balance),
        bankBalance: Number(row.bankBalance),
        premiumBalance: Number(row.premiumBalance),
        lastDailyAt: row.lastDailyAt === null ? null : Number(row.lastDailyAt),
        lastWorkAt: row.lastWorkAt === null ? null : Number(row.lastWorkAt),
        lastFishAt: row.lastFishAt === null ? null : Number(row.lastFishAt),
        lastRobAt: row.lastRobAt === null ? null : Number(row.lastRobAt),
        lastCrimeAt: row.lastCrimeAt === null ? null : Number(row.lastCrimeAt),
        lastBankInterestAt: row.lastBankInterestAt === null ? null : Number(row.lastBankInterestAt),
        bankInterestRemainder: Number(row.bankInterestRemainder),
        robProtectedUntil: row.robProtectedUntil === null ? null : Number(row.robProtectedUntil),
    };
}
async function mysqlAddLedger(connection, guildId, userId, amount, reason, reference, at = nowSeconds()) {
    await insertLedger(connection, { guildId, userId, amount, reason, reference, createdAt: at });
}
export async function getAccountBalances(guildId, userId) {
    guildId = GLOBAL_SCOPE_ID;
    if (economyPool) {
        const connection = await economyPool.getConnection();
        try {
            const account = await mysqlEnsureAccount(connection, guildId, userId);
            return { wallet: account.balance, bank: account.bankBalance, total: account.balance + account.bankBalance, premium: account.premiumBalance };
        }
        finally {
            connection.release();
        }
    }
    const account = sqliteEnsureAccount(guildId, userId);
    return { wallet: account.balance, bank: account.bankBalance, total: account.balance + account.bankBalance, premium: account.premiumBalance };
}
export async function getBalance(guildId, userId) {
    guildId = GLOBAL_SCOPE_ID;
    return (await getAccountBalances(guildId, userId)).wallet;
}
export async function adjustPremiumCurrency(guildId, userId, amount, adminId, reference) {
    guildId = GLOBAL_SCOPE_ID;
    if (!Number.isSafeInteger(amount) || amount === 0 || Math.abs(amount) > 1_000_000)
        return { ok: false, reason: 'invalid_amount', balance: 0 };
    const at = nowSeconds();
    const reason = `premium_admin:${adminId}`;
    if (economyPool)
        return withEconomyTransaction(async (connection) => {
            const account = await mysqlEnsureAccount(connection, guildId, userId, true);
            if (amount < 0 && account.premiumBalance < -amount)
                return { ok: false, reason: 'insufficient_premium', balance: account.premiumBalance };
            await connection.execute('UPDATE economy_accounts SET premium_balance=premium_balance+?,updated_at=? WHERE guild_id=? AND user_id=?', [amount, at, guildId, userId]);
            await mysqlAddLedger(connection, guildId, userId, amount, reason, reference, at);
            return { ok: true, balance: account.premiumBalance + amount };
        });
    const run = db.transaction(() => {
        const account = sqliteEnsureAccount(guildId, userId);
        if (amount < 0 && account.premiumBalance < -amount)
            return { ok: false, reason: 'insufficient_premium', balance: account.premiumBalance };
        db.prepare('UPDATE economy_accounts SET premium_balance=premium_balance+?,updated_at=? WHERE guild_id=? AND user_id=?').run(amount, at, guildId, userId);
        db.prepare('INSERT INTO economy_ledger (guild_id,user_id,amount,reason,reference,created_at) VALUES (?,?,?,?,?,?)').run(guildId, userId, amount, reason, reference, at);
        return { ok: true, balance: account.premiumBalance + amount };
    });
    return run.immediate();
}
function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
}
function effectiveAnnualYieldBps(aprBps) {
    const periodYield = Math.max(0, aprBps) / BANK_INTEREST_REMAINDER_DENOMINATOR;
    return Math.round((Math.pow(1 + periodYield, BANK_PERIODS_PER_YEAR) - 1) * 10_000);
}
function clampBankApr(rateBps) {
    return clamp(Math.round(rateBps), BANK_APR_FLOOR_BPS, BANK_APR_CEILING_BPS);
}
function preserveHistoricalBankApr(rateBps) {
    return clamp(Math.round(rateBps), 1, BANK_APR_CEILING_BPS);
}
function buildBankMarketSnapshot(moneySupply, savings, flow, activeJobs, historicalJobs) {
    const jobsById = new Map();
    for (const job of historicalJobs) {
        const knownJob = economyJobs.find((candidate) => candidate.id === job.jobId);
        jobsById.set(job.jobId, { jobId: job.jobId, name: knownJob?.name ?? (job.jobId === 'legacy' ? 'Trabajo general' : job.jobId),
            workers: 0, averageLevel: 0, payroll30d: Number(job.payroll), shifts30d: Number(job.shifts) });
    }
    const activeJobLevelTotals = new Map();
    for (const job of activeJobs) {
        const knownJob = economyJobs.find((candidate) => candidate.id === job.jobId);
        if (!jobsById.has(job.jobId))
            jobsById.set(job.jobId, { jobId: job.jobId, name: knownJob?.name ?? job.jobId, workers: 0, averageLevel: 0, payroll30d: 0, shifts30d: 0 });
        const current = activeJobLevelTotals.get(job.jobId) ?? { workers: 0, levelTotal: 0 };
        current.workers++;
        current.levelTotal += Number(job.level);
        activeJobLevelTotals.set(job.jobId, current);
    }
    for (const [jobId, totals] of activeJobLevelTotals) {
        const entry = jobsById.get(jobId);
        entry.workers = totals.workers;
        entry.averageLevel = Math.round((totals.levelTotal / totals.workers) * 100) / 100;
    }
    const jobs = [...jobsById.values()].sort((a, b) => b.payroll30d - a.payroll30d || a.name.localeCompare(b.name));
    const activeWorkers = new Set(activeJobs.map((job, index) => job.userId ?? `${job.jobId}:${index}`)).size;
    const savingsShare = moneySupply > 0 ? savings / moneySupply : 0;
    const moneyGrowthBps = Math.round((flow.netIssuance30d / Math.max(moneySupply, 1)) * 10_000);
    const purchaseVelocityBps = Math.max(0, Math.round((flow.purchaseVolume30d / Math.max(moneySupply, 1)) * 10_000));
    const savingsShareBps = Math.round(savingsShare * 10_000);
    const issuancePressureBps = clamp(Math.round(moneyGrowthBps * 0.15), -1_500, 2_000);
    const purchasesPressureBps = clamp(Math.round(purchaseVelocityBps * 0.035), 0, 750);
    const savingsPressureBps = clamp(Math.round((BANK_TARGET_SAVINGS_SHARE - savingsShare) * 10_000 * 0.12), -500, 500);
    const liquidityPressureBps = clamp(Math.round(((flow.withdrawals - flow.deposits) / Math.max(moneySupply, 1)) * 10_000 * 0.025), -600, 600);
    const activePay = activeJobs.reduce((sum, job) => {
        const definition = economyJobs.find((candidate) => candidate.id === job.jobId);
        return sum + (definition ? (definition.minPay + definition.maxPay) / 2 + Math.min(Math.max(job.level - 1, 0), MAX_JOB_LEVEL - 1) * 3 : 47);
    }, 0);
    const averageJobPay = activeJobs.length ? activePay / activeJobs.length : 47;
    const wagePressure = clamp(Math.round(((averageJobPay / 47) - 1) * 1_000), -300, 300);
    const activeJobShiftCount = jobs.reduce((sum, job) => sum + job.shifts30d, 0);
    const jobActivityPressure = activeWorkers ? Math.round(Math.min(1, activeJobShiftCount / (activeWorkers * 12)) * 600) : 0;
    const payrollPressure = clamp(Math.round((flow.payroll30d / Math.max(moneySupply, 1)) * 100), 0, 500);
    const laborPressureBps = wagePressure + jobActivityPressure + payrollPressure;
    const targetAprBps = clamp(BANK_BASE_APR_BPS + issuancePressureBps + purchasesPressureBps + savingsPressureBps + liquidityPressureBps + laborPressureBps, BANK_APR_FLOOR_BPS, BANK_APR_CEILING_BPS);
    return { totalMoney: moneySupply, savings, deposits: flow.deposits, withdrawals: flow.withdrawals,
        netIssuance30d: flow.netIssuance30d, purchaseVolume30d: flow.purchaseVolume30d, payroll30d: flow.payroll30d,
        workShifts30d: flow.workShifts30d, activeWorkers, jobs, botMoneyGrowthBps: moneyGrowthBps, purchaseVelocityBps,
        savingsShareBps, projectedMoneySupply30d: Math.max(0, moneySupply + flow.netIssuance30d), targetAprBps,
        issuancePressureBps, purchasesPressureBps, savingsPressureBps, liquidityPressureBps, laborPressureBps };
}
function mergeBankJobPayrollRows(rows) {
    const byJob = new Map();
    for (const row of rows) {
        const jobId = row.reason === 'work_reward' ? 'legacy' : row.reason.split(':')[1] ?? 'legacy';
        const entry = byJob.get(jobId) ?? { jobId, payroll: 0, shifts: 0 };
        entry.payroll += Number(row.payroll);
        entry.shifts += Number(row.shifts);
        byJob.set(jobId, entry);
    }
    return [...byJob.values()];
}
async function mysqlBankMarketSnapshot(connection, now) {
    const [accounts] = await connection.execute('SELECT COALESCE(SUM(balance+bank_balance),0) AS totalMoney,COALESCE(SUM(bank_balance),0) AS savings FROM economy_accounts WHERE guild_id=?', [GLOBAL_SCOPE_ID]);
    const [flowRows] = await connection.execute(`SELECT
    COALESCE(SUM(CASE WHEN created_at>=? AND reason='bank:deposit:vault' AND amount>0 THEN amount ELSE 0 END),0) AS deposits,
    COALESCE(SUM(CASE WHEN created_at>=? AND reason='bank:withdraw:vault' AND amount<0 THEN -amount ELSE 0 END),0) AS withdrawals,
    COALESCE(SUM(CASE WHEN reason IN ('bank:deposit:wallet','bank:deposit:vault','bank:withdraw:wallet','bank:withdraw:vault') OR reason LIKE 'transfer:%' OR reason LIKE 'rob:from:%' OR reason LIKE 'rob:to:%' THEN 0 ELSE amount END),0) AS netIssuance30d,
    COALESCE(SUM(CASE WHEN amount<0 AND (reason LIKE 'store:%' OR reason='rpg_shop' OR reason='rpg_training' OR reason LIKE 'profile_shop:%') THEN -amount ELSE 0 END),0) AS purchaseVolume30d,
    COALESCE(SUM(CASE WHEN amount>0 AND (reason='work_reward' OR reason LIKE 'work_reward:%') THEN amount ELSE 0 END),0) AS payroll30d,
    COALESCE(SUM(CASE WHEN amount>0 AND (reason='work_reward' OR reason LIKE 'work_reward:%') THEN 1 ELSE 0 END),0) AS workShifts30d
    FROM economy_ledger WHERE guild_id=? AND created_at>=? AND created_at<=?`, [now - BANK_POLICY_REBALANCE_SECONDS, now - BANK_POLICY_REBALANCE_SECONDS, GLOBAL_SCOPE_ID, now - BANK_ACTIVITY_WINDOW_SECONDS, now]);
    const [activeRows] = await connection.execute('SELECT user_id AS userId,job_id AS jobId,level FROM economy_jobs WHERE guild_id=? AND is_active=1', [GLOBAL_SCOPE_ID]);
    const [jobPayrollRows] = await connection.execute(`SELECT reason,COALESCE(SUM(amount),0) AS payroll,COUNT(*) AS shifts FROM economy_ledger
    WHERE guild_id=? AND created_at>=? AND created_at<=? AND amount>0 AND (reason='work_reward' OR reason LIKE 'work_reward:%') GROUP BY reason`, [GLOBAL_SCOPE_ID, now - BANK_ACTIVITY_WINDOW_SECONDS, now]);
    const activeJobs = activeRows.map((row) => ({ userId: String(row.userId), jobId: String(row.jobId), level: Number(row.level) }));
    const historicalJobs = mergeBankJobPayrollRows(jobPayrollRows.map((row) => ({ reason: String(row.reason), payroll: Number(row.payroll), shifts: Number(row.shifts) })));
    const flow = flowRows[0] ?? {};
    return buildBankMarketSnapshot(Number(accounts[0]?.totalMoney ?? 0), Number(accounts[0]?.savings ?? 0), {
        deposits: Number(flow.deposits ?? 0), withdrawals: Number(flow.withdrawals ?? 0), netIssuance30d: Number(flow.netIssuance30d ?? 0),
        purchaseVolume30d: Number(flow.purchaseVolume30d ?? 0), payroll30d: Number(flow.payroll30d ?? 0), workShifts30d: Number(flow.workShifts30d ?? 0),
    }, activeJobs, historicalJobs);
}
function sqliteBankMarketSnapshot(now) {
    const accounts = db.prepare('SELECT COALESCE(SUM(balance+bank_balance),0) AS totalMoney,COALESCE(SUM(bank_balance),0) AS savings FROM economy_accounts WHERE guild_id=?').get(GLOBAL_SCOPE_ID);
    const flow = db.prepare(`SELECT
    COALESCE(SUM(CASE WHEN created_at>=? AND reason='bank:deposit:vault' AND amount>0 THEN amount ELSE 0 END),0) AS deposits,
    COALESCE(SUM(CASE WHEN created_at>=? AND reason='bank:withdraw:vault' AND amount<0 THEN -amount ELSE 0 END),0) AS withdrawals,
    COALESCE(SUM(CASE WHEN reason IN ('bank:deposit:wallet','bank:deposit:vault','bank:withdraw:wallet','bank:withdraw:vault') OR reason LIKE 'transfer:%' OR reason LIKE 'rob:from:%' OR reason LIKE 'rob:to:%' THEN 0 ELSE amount END),0) AS netIssuance30d,
    COALESCE(SUM(CASE WHEN amount<0 AND (reason LIKE 'store:%' OR reason='rpg_shop' OR reason='rpg_training' OR reason LIKE 'profile_shop:%') THEN -amount ELSE 0 END),0) AS purchaseVolume30d,
    COALESCE(SUM(CASE WHEN amount>0 AND (reason='work_reward' OR reason LIKE 'work_reward:%') THEN amount ELSE 0 END),0) AS payroll30d,
    COALESCE(SUM(CASE WHEN amount>0 AND (reason='work_reward' OR reason LIKE 'work_reward:%') THEN 1 ELSE 0 END),0) AS workShifts30d
    FROM economy_ledger WHERE guild_id=? AND created_at>=? AND created_at<=?`)
        .get(now - BANK_POLICY_REBALANCE_SECONDS, now - BANK_POLICY_REBALANCE_SECONDS, GLOBAL_SCOPE_ID, now - BANK_ACTIVITY_WINDOW_SECONDS, now);
    const activeJobs = db.prepare('SELECT user_id AS userId,job_id AS jobId,level FROM economy_jobs WHERE guild_id=? AND is_active=1').all(GLOBAL_SCOPE_ID);
    const jobPayrollRows = db.prepare(`SELECT reason,COALESCE(SUM(amount),0) AS payroll,COUNT(*) AS shifts FROM economy_ledger
    WHERE guild_id=? AND created_at>=? AND created_at<=? AND amount>0 AND (reason='work_reward' OR reason LIKE 'work_reward:%') GROUP BY reason`)
        .all(GLOBAL_SCOPE_ID, now - BANK_ACTIVITY_WINDOW_SECONDS, now);
    const historicalJobs = mergeBankJobPayrollRows(jobPayrollRows.map((row) => ({ reason: String(row.reason), payroll: Number(row.payroll), shifts: Number(row.shifts) })));
    return buildBankMarketSnapshot(Number(accounts.totalMoney), Number(accounts.savings), {
        deposits: Number(flow.deposits), withdrawals: Number(flow.withdrawals), netIssuance30d: Number(flow.netIssuance30d),
        purchaseVolume30d: Number(flow.purchaseVolume30d), payroll30d: Number(flow.payroll30d), workShifts30d: Number(flow.workShifts30d),
    }, activeJobs.map((job) => ({ userId: String(job.userId), jobId: String(job.jobId), level: Number(job.level) })), historicalJobs);
}
function nextBankApr(currentAprBps, targetAprBps, firstObservation = false) {
    const target = clampBankApr(targetAprBps);
    if (firstObservation)
        return target;
    const delta = target - currentAprBps;
    return clampBankApr(currentAprBps + Math.sign(delta) * Math.min(Math.abs(delta), BANK_MAX_DAILY_APR_STEP_BPS));
}
function observationFromSnapshot(snapshot, rateBps, observedAt) {
    const effectiveAnnualBps = effectiveAnnualYieldBps(rateBps);
    return {
        observedAt, nominalAprBps: rateBps, effectiveAnnualBps, targetAprBps: snapshot.targetAprBps,
        targetEffectiveAnnualBps: effectiveAnnualYieldBps(snapshot.targetAprBps),
        botMoneyGrowthBps: snapshot.botMoneyGrowthBps, purchaseVelocityBps: snapshot.purchaseVelocityBps,
        savingsShareBps: snapshot.savingsShareBps, projectedMoneySupply30d: snapshot.projectedMoneySupply30d,
        moneySupply: snapshot.totalMoney, savings: snapshot.savings, netIssuance30d: snapshot.netIssuance30d,
        purchaseVolume30d: snapshot.purchaseVolume30d, payroll30d: snapshot.payroll30d, workShifts30d: snapshot.workShifts30d,
        activeWorkers: snapshot.activeWorkers, deposits24h: snapshot.deposits, withdrawals24h: snapshot.withdrawals,
        issuancePressureBps: snapshot.issuancePressureBps, purchasesPressureBps: snapshot.purchasesPressureBps,
        savingsPressureBps: snapshot.savingsPressureBps, liquidityPressureBps: snapshot.liquidityPressureBps,
        laborPressureBps: snapshot.laborPressureBps, jobs: snapshot.jobs,
    };
}
async function mysqlInsertMarketObservation(connection, observation) {
    await connection.execute(`INSERT INTO economy_bank_market_history (observed_at,nominal_apr_bps,effective_annual_bps,real_yield_bps,target_real_bps,
    inflation_reference_bps,issuance_pressure_bps,purchases_pressure_bps,savings_pressure_bps,liquidity_pressure_bps,labor_pressure_bps,
    money_supply,savings,net_issuance_30d,purchase_volume_30d,payroll_30d,work_shifts_30d,active_workers,deposits_24h,withdrawals_24h,job_mix_json,
    bot_money_growth_bps,purchase_velocity_bps,savings_share_bps,projected_money_supply_30d,target_apr_bps)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE nominal_apr_bps=VALUES(nominal_apr_bps),effective_annual_bps=VALUES(effective_annual_bps),
    real_yield_bps=VALUES(real_yield_bps),target_real_bps=VALUES(target_real_bps),inflation_reference_bps=VALUES(inflation_reference_bps),
    issuance_pressure_bps=VALUES(issuance_pressure_bps),purchases_pressure_bps=VALUES(purchases_pressure_bps),savings_pressure_bps=VALUES(savings_pressure_bps),
    liquidity_pressure_bps=VALUES(liquidity_pressure_bps),labor_pressure_bps=VALUES(labor_pressure_bps),money_supply=VALUES(money_supply),savings=VALUES(savings),
    net_issuance_30d=VALUES(net_issuance_30d),purchase_volume_30d=VALUES(purchase_volume_30d),payroll_30d=VALUES(payroll_30d),work_shifts_30d=VALUES(work_shifts_30d),
    active_workers=VALUES(active_workers),deposits_24h=VALUES(deposits_24h),withdrawals_24h=VALUES(withdrawals_24h),job_mix_json=VALUES(job_mix_json),
    bot_money_growth_bps=VALUES(bot_money_growth_bps),purchase_velocity_bps=VALUES(purchase_velocity_bps),savings_share_bps=VALUES(savings_share_bps),
    projected_money_supply_30d=VALUES(projected_money_supply_30d),target_apr_bps=VALUES(target_apr_bps)`, [observation.observedAt, observation.nominalAprBps, observation.effectiveAnnualBps, 0, 0,
        0, observation.issuancePressureBps, observation.purchasesPressureBps, observation.savingsPressureBps,
        observation.liquidityPressureBps, observation.laborPressureBps, observation.moneySupply, observation.savings, observation.netIssuance30d,
        observation.purchaseVolume30d, observation.payroll30d, observation.workShifts30d, observation.activeWorkers, observation.deposits24h,
        observation.withdrawals24h, JSON.stringify(observation.jobs), observation.botMoneyGrowthBps, observation.purchaseVelocityBps,
        observation.savingsShareBps, observation.projectedMoneySupply30d, observation.targetAprBps]);
}
function sqliteInsertMarketObservation(observation) {
    db.prepare(`INSERT INTO economy_bank_market_history (observed_at,nominal_apr_bps,effective_annual_bps,real_yield_bps,target_real_bps,
    inflation_reference_bps,issuance_pressure_bps,purchases_pressure_bps,savings_pressure_bps,liquidity_pressure_bps,labor_pressure_bps,
    money_supply,savings,net_issuance_30d,purchase_volume_30d,payroll_30d,work_shifts_30d,active_workers,deposits_24h,withdrawals_24h,job_mix_json,
    bot_money_growth_bps,purchase_velocity_bps,savings_share_bps,projected_money_supply_30d,target_apr_bps)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(observed_at) DO UPDATE SET nominal_apr_bps=excluded.nominal_apr_bps,
    effective_annual_bps=excluded.effective_annual_bps,real_yield_bps=excluded.real_yield_bps,target_real_bps=excluded.target_real_bps,
    inflation_reference_bps=excluded.inflation_reference_bps,issuance_pressure_bps=excluded.issuance_pressure_bps,purchases_pressure_bps=excluded.purchases_pressure_bps,
    savings_pressure_bps=excluded.savings_pressure_bps,liquidity_pressure_bps=excluded.liquidity_pressure_bps,labor_pressure_bps=excluded.labor_pressure_bps,
    money_supply=excluded.money_supply,savings=excluded.savings,net_issuance_30d=excluded.net_issuance_30d,purchase_volume_30d=excluded.purchase_volume_30d,
    payroll_30d=excluded.payroll_30d,work_shifts_30d=excluded.work_shifts_30d,active_workers=excluded.active_workers,deposits_24h=excluded.deposits_24h,
    withdrawals_24h=excluded.withdrawals_24h,job_mix_json=excluded.job_mix_json,bot_money_growth_bps=excluded.bot_money_growth_bps,
    purchase_velocity_bps=excluded.purchase_velocity_bps,savings_share_bps=excluded.savings_share_bps,
    projected_money_supply_30d=excluded.projected_money_supply_30d,target_apr_bps=excluded.target_apr_bps`).run(observation.observedAt, observation.nominalAprBps, observation.effectiveAnnualBps, 0, 0, 0, observation.issuancePressureBps, observation.purchasesPressureBps, observation.savingsPressureBps, observation.liquidityPressureBps, observation.laborPressureBps, observation.moneySupply, observation.savings, observation.netIssuance30d, observation.purchaseVolume30d, observation.payroll30d, observation.workShifts30d, observation.activeWorkers, observation.deposits24h, observation.withdrawals24h, JSON.stringify(observation.jobs), observation.botMoneyGrowthBps, observation.purchaseVelocityBps, observation.savingsShareBps, observation.projectedMoneySupply30d, observation.targetAprBps);
}
async function rebalanceBankInterestMysql(connection, now) {
    await connection.execute('INSERT IGNORE INTO economy_bank_policy (policy_id,interest_rate_bps,last_rebalanced_at,model_version) VALUES (1,?,?,?)', [BANK_BASE_APR_BPS, 0, BANK_MODEL_VERSION]);
    const [rows] = await connection.execute('SELECT interest_rate_bps AS rateBps,last_rebalanced_at AS lastRebalancedAt,model_version AS modelVersion FROM economy_bank_policy WHERE policy_id=1 FOR UPDATE');
    const row = rows[0];
    if (!row)
        throw new Error('No pude cargar la política de interés del banco.');
    const currentRate = clampBankApr(Number(row.rateBps));
    const lastRebalancedAt = Number(row.lastRebalancedAt);
    const modelVersion = Number(row.modelVersion);
    if (modelVersion < BANK_MODEL_VERSION) {
        // v2 already stores annual APR and uses this remainder denominator. Preserve that
        // history when changing only the policy model; only v1 needs conversion from per-cut rates.
        if (modelVersion < 2) {
            await connection.execute('UPDATE economy_accounts SET bank_interest_remainder=LEAST(?,GREATEST(0,bank_interest_remainder)*?),last_bank_interest_at=CASE WHEN bank_balance>0 THEN ? ELSE last_bank_interest_at END WHERE bank_balance>0', [BANK_INTEREST_REMAINDER_DENOMINATOR - 1, BANK_PERIODS_PER_YEAR, now]);
            await connection.execute('DELETE FROM economy_bank_rate_history');
        }
        await connection.execute('DELETE FROM economy_bank_market_history');
        const snapshot = await mysqlBankMarketSnapshot(connection, now);
        const newRate = snapshot.targetAprBps;
        const observation = observationFromSnapshot(snapshot, newRate, now);
        await connection.execute('UPDATE economy_bank_policy SET interest_rate_bps=?,last_rebalanced_at=?,model_version=? WHERE policy_id=1', [newRate, now, BANK_MODEL_VERSION]);
        await connection.execute('INSERT INTO economy_bank_rate_history (effective_at,interest_rate_bps) VALUES (?,?) ON DUPLICATE KEY UPDATE interest_rate_bps=VALUES(interest_rate_bps)', [now, newRate]);
        await mysqlInsertMarketObservation(connection, observation);
        return { rateBps: newRate, lastRebalancedAt: now, nextRebalanceAt: now + BANK_POLICY_REBALANCE_SECONDS };
    }
    if (lastRebalancedAt > 0 && now - lastRebalancedAt < BANK_POLICY_REBALANCE_SECONDS) {
        return { rateBps: currentRate, lastRebalancedAt, nextRebalanceAt: lastRebalancedAt + BANK_POLICY_REBALANCE_SECONDS };
    }
    const snapshot = await mysqlBankMarketSnapshot(connection, now);
    const firstObservation = lastRebalancedAt <= 0;
    const newRate = nextBankApr(currentRate, snapshot.targetAprBps, firstObservation);
    const observation = observationFromSnapshot(snapshot, newRate, now);
    await connection.execute('UPDATE economy_bank_policy SET interest_rate_bps=?,last_rebalanced_at=?,model_version=? WHERE policy_id=1', [newRate, now, BANK_MODEL_VERSION]);
    await connection.execute('INSERT INTO economy_bank_rate_history (effective_at,interest_rate_bps) VALUES (?,?) ON DUPLICATE KEY UPDATE interest_rate_bps=VALUES(interest_rate_bps)', [now, newRate]);
    await mysqlInsertMarketObservation(connection, observation);
    return { rateBps: newRate, lastRebalancedAt: now, nextRebalanceAt: now + BANK_POLICY_REBALANCE_SECONDS };
}
function rebalanceBankInterestSqlite(now) {
    db.prepare('INSERT OR IGNORE INTO economy_bank_policy (policy_id,interest_rate_bps,last_rebalanced_at,model_version) VALUES (1,?,?,?)').run(BANK_BASE_APR_BPS, 0, BANK_MODEL_VERSION);
    const row = db.prepare('SELECT interest_rate_bps AS rateBps,last_rebalanced_at AS lastRebalancedAt,model_version AS modelVersion FROM economy_bank_policy WHERE policy_id=1').get();
    const currentRate = clampBankApr(Number(row.rateBps));
    const lastRebalancedAt = Number(row.lastRebalancedAt);
    if (Number(row.modelVersion) < BANK_MODEL_VERSION) {
        if (Number(row.modelVersion) < 2) {
            db.prepare('UPDATE economy_accounts SET bank_interest_remainder=MIN(?,MAX(0,bank_interest_remainder)*?),last_bank_interest_at=CASE WHEN bank_balance>0 THEN ? ELSE last_bank_interest_at END WHERE bank_balance>0')
                .run(BANK_INTEREST_REMAINDER_DENOMINATOR - 1, BANK_PERIODS_PER_YEAR, now);
            db.prepare('DELETE FROM economy_bank_rate_history').run();
        }
        db.prepare('DELETE FROM economy_bank_market_history').run();
        const snapshot = sqliteBankMarketSnapshot(now);
        const newRate = snapshot.targetAprBps;
        const observation = observationFromSnapshot(snapshot, newRate, now);
        db.prepare('UPDATE economy_bank_policy SET interest_rate_bps=?,last_rebalanced_at=?,model_version=? WHERE policy_id=1').run(newRate, now, BANK_MODEL_VERSION);
        db.prepare('INSERT INTO economy_bank_rate_history (effective_at,interest_rate_bps) VALUES (?,?) ON CONFLICT(effective_at) DO UPDATE SET interest_rate_bps=excluded.interest_rate_bps').run(now, newRate);
        sqliteInsertMarketObservation(observation);
        return { rateBps: newRate, lastRebalancedAt: now, nextRebalanceAt: now + BANK_POLICY_REBALANCE_SECONDS };
    }
    if (lastRebalancedAt > 0 && now - lastRebalancedAt < BANK_POLICY_REBALANCE_SECONDS) {
        return { rateBps: currentRate, lastRebalancedAt, nextRebalanceAt: lastRebalancedAt + BANK_POLICY_REBALANCE_SECONDS };
    }
    const snapshot = sqliteBankMarketSnapshot(now);
    const firstObservation = lastRebalancedAt <= 0;
    const newRate = nextBankApr(currentRate, snapshot.targetAprBps, firstObservation);
    const observation = observationFromSnapshot(snapshot, newRate, now);
    db.prepare('UPDATE economy_bank_policy SET interest_rate_bps=?,last_rebalanced_at=?,model_version=? WHERE policy_id=1').run(newRate, now, BANK_MODEL_VERSION);
    db.prepare('INSERT INTO economy_bank_rate_history (effective_at,interest_rate_bps) VALUES (?,?) ON CONFLICT(effective_at) DO UPDATE SET interest_rate_bps=excluded.interest_rate_bps').run(now, newRate);
    sqliteInsertMarketObservation(observation);
    return { rateBps: newRate, lastRebalancedAt: now, nextRebalanceAt: now + BANK_POLICY_REBALANCE_SECONDS };
}
export async function rebalanceBankInterest(now = nowSeconds()) {
    if (economyPool)
        return withEconomyTransaction((connection) => rebalanceBankInterestMysql(connection, now));
    return db.transaction(() => rebalanceBankInterestSqlite(now)).immediate();
}
function bankObservationFromRow(row) {
    let jobs = [];
    try {
        const parsed = JSON.parse(row.jobMixJson);
        if (Array.isArray(parsed))
            jobs = parsed;
    }
    catch { /* ignore malformed historical metadata and keep the financial observation */ }
    return {
        observedAt: Number(row.observedAt), nominalAprBps: Number(row.nominalAprBps), effectiveAnnualBps: Number(row.effectiveAnnualBps),
        targetAprBps: Number(row.targetAprBps), targetEffectiveAnnualBps: effectiveAnnualYieldBps(Number(row.targetAprBps)),
        botMoneyGrowthBps: Number(row.botMoneyGrowthBps), purchaseVelocityBps: Number(row.purchaseVelocityBps),
        savingsShareBps: Number(row.savingsShareBps), projectedMoneySupply30d: Number(row.projectedMoneySupply30d),
        moneySupply: Number(row.moneySupply), savings: Number(row.savings), netIssuance30d: Number(row.netIssuance30d),
        purchaseVolume30d: Number(row.purchaseVolume30d), payroll30d: Number(row.payroll30d), workShifts30d: Number(row.workShifts30d),
        activeWorkers: Number(row.activeWorkers), deposits24h: Number(row.deposits24h), withdrawals24h: Number(row.withdrawals24h),
        issuancePressureBps: Number(row.issuancePressureBps), purchasesPressureBps: Number(row.purchasesPressureBps),
        savingsPressureBps: Number(row.savingsPressureBps), liquidityPressureBps: Number(row.liquidityPressureBps),
        laborPressureBps: Number(row.laborPressureBps), jobs,
    };
}
export async function getBankInterestDashboard(now = nowSeconds()) {
    const policy = await rebalanceBankInterest(now);
    const select = `SELECT observed_at AS observedAt,nominal_apr_bps AS nominalAprBps,effective_annual_bps AS effectiveAnnualBps,
    target_apr_bps AS targetAprBps,bot_money_growth_bps AS botMoneyGrowthBps,purchase_velocity_bps AS purchaseVelocityBps,
    savings_share_bps AS savingsShareBps,projected_money_supply_30d AS projectedMoneySupply30d,
    money_supply AS moneySupply,savings,net_issuance_30d AS netIssuance30d,purchase_volume_30d AS purchaseVolume30d,
    payroll_30d AS payroll30d,work_shifts_30d AS workShifts30d,active_workers AS activeWorkers,deposits_24h AS deposits24h,
    withdrawals_24h AS withdrawals24h,issuance_pressure_bps AS issuancePressureBps,purchases_pressure_bps AS purchasesPressureBps,
    savings_pressure_bps AS savingsPressureBps,liquidity_pressure_bps AS liquidityPressureBps,labor_pressure_bps AS laborPressureBps,job_mix_json AS jobMixJson
    FROM economy_bank_market_history ORDER BY observed_at DESC LIMIT 30`;
    let rows;
    if (economyPool) {
        const [result] = await economyPool.execute(select);
        rows = result;
    }
    else {
        rows = db.prepare(select).all();
    }
    const history = rows.map(bankObservationFromRow).reverse();
    const current = history.at(-1);
    if (!current)
        throw new Error('Todavía no hay una observación guardada para mostrar del mercado bancario.');
    const liveSnapshot = economyPool
        ? await economyPool.getConnection().then(async (connection) => {
            try {
                return await mysqlBankMarketSnapshot(connection, now);
            }
            finally {
                connection.release();
            }
        })
        : sqliteBankMarketSnapshot(now);
    const live = observationFromSnapshot(liveSnapshot, policy.rateBps, now);
    return { current, history, live };
}
async function mysqlBankInterestRateHistory(connection, after, now) {
    const [earlierRows] = await connection.execute('SELECT effective_at AS effectiveAt,interest_rate_bps AS rateBps FROM economy_bank_rate_history WHERE effective_at<=? ORDER BY effective_at DESC LIMIT 1', [after]);
    const [laterRows] = await connection.execute('SELECT effective_at AS effectiveAt,interest_rate_bps AS rateBps FROM economy_bank_rate_history WHERE effective_at>? AND effective_at<=? ORDER BY effective_at ASC', [after, now]);
    const rows = [...earlierRows, ...laterRows];
    return rows.map((entry) => ({ effectiveAt: Number(entry.effectiveAt), rateBps: preserveHistoricalBankApr(Number(entry.rateBps)) }));
}
function sqliteBankInterestRateHistory(after, now) {
    const earlier = db.prepare('SELECT effective_at AS effectiveAt,interest_rate_bps AS rateBps FROM economy_bank_rate_history WHERE effective_at<=? ORDER BY effective_at DESC LIMIT 1').get(after);
    const later = db.prepare('SELECT effective_at AS effectiveAt,interest_rate_bps AS rateBps FROM economy_bank_rate_history WHERE effective_at>? AND effective_at<=? ORDER BY effective_at ASC').all(after, now);
    return [...(earlier ? [{ effectiveAt: Number(earlier.effectiveAt), rateBps: preserveHistoricalBankApr(Number(earlier.rateBps)) }] : []), ...later.map((entry) => ({ effectiveAt: Number(entry.effectiveAt), rateBps: preserveHistoricalBankApr(Number(entry.rateBps)) }))];
}
function calculateBankInterest(account, now, rates) {
    const rawLastAt = account.lastBankInterestAt === null ? now : Number(account.lastBankInterestAt);
    // Older versions stored zero for untouched accounts; Discord rendered that as “57 years ago”.
    const lastAt = !Number.isSafeInteger(rawLastAt) || rawLastAt <= 0 || rawLastAt > now + 60 ? now : rawLastAt;
    const periods = Math.max(0, Math.floor((now - lastAt) / BANK_INTEREST_INTERVAL_SECONDS));
    let bankBalance = account.bankBalance;
    let remainder = clamp(Math.trunc(account.bankInterestRemainder), 0, BANK_INTEREST_REMAINDER_DENOMINATOR - 1);
    let rateIndex = 0;
    let currentRate = rates[0]?.rateBps ?? BANK_BASE_APR_BPS;
    for (let period = 0; period < periods; period++) {
        const dueAt = lastAt + (period + 1) * BANK_INTEREST_INTERVAL_SECONDS;
        while (rateIndex + 1 < rates.length && rates[rateIndex + 1].effectiveAt <= dueAt) {
            rateIndex++;
            currentRate = rates[rateIndex].rateBps;
        }
        const numerator = bankBalance * currentRate + remainder;
        const earned = Math.floor(numerator / BANK_INTEREST_REMAINDER_DENOMINATOR);
        remainder = numerator % BANK_INTEREST_REMAINDER_DENOMINATOR;
        bankBalance += earned;
    }
    const nextInterestAt = lastAt + periods * BANK_INTEREST_INTERVAL_SECONDS;
    return { periods, bankBalance, remainder, interestEarned: bankBalance - account.bankBalance, nextInterestAt };
}
function minimumInterestAnchor(accounts, now) {
    return accounts.reduce((earliest, account) => {
        const value = account.lastBankInterestAt === null ? now : Number(account.lastBankInterestAt);
        const anchor = !Number.isSafeInteger(value) || value <= 0 || value > now + 60 ? now : value;
        return Math.min(earliest, anchor);
    }, now);
}
export async function accrueMaturedBankInterest(now = nowSeconds()) {
    const dueBefore = now - BANK_INTEREST_INTERVAL_SECONDS;
    if (economyPool)
        return withEconomyTransaction(async (connection) => {
            await rebalanceBankInterestMysql(connection, now);
            const [rows] = await connection.execute(`SELECT user_id AS userId,bank_balance AS bankBalance,
      last_bank_interest_at AS lastBankInterestAt,bank_interest_remainder AS bankInterestRemainder
      FROM economy_accounts WHERE guild_id=? AND bank_balance>0
      AND (last_bank_interest_at IS NULL OR last_bank_interest_at<=?) ORDER BY user_id FOR UPDATE`, [GLOBAL_SCOPE_ID, dueBefore]);
            const accounts = rows.map((row) => ({ userId: String(row.userId), bankBalance: Number(row.bankBalance),
                lastBankInterestAt: row.lastBankInterestAt === null ? null : Number(row.lastBankInterestAt),
                bankInterestRemainder: Number(row.bankInterestRemainder) }));
            if (!accounts.length)
                return { accountsProcessed: 0, totalInterest: 0 };
            const rates = await mysqlBankInterestRateHistory(connection, minimumInterestAnchor(accounts, now), now);
            let totalInterest = 0;
            for (const account of accounts) {
                const accrued = calculateBankInterest(account, now, rates);
                await connection.execute(`UPDATE economy_accounts SET bank_balance=?,bank_interest_remainder=?,last_bank_interest_at=?,updated_at=? WHERE guild_id=? AND user_id=?`, [accrued.bankBalance, accrued.remainder, accrued.nextInterestAt, now, GLOBAL_SCOPE_ID, account.userId]);
                if (accrued.interestEarned > 0) {
                    await mysqlAddLedger(connection, GLOBAL_SCOPE_ID, account.userId, accrued.interestEarned, 'bank:interest', `bank-interest:${GLOBAL_SCOPE_ID}:${account.userId}:${accrued.nextInterestAt}`, now);
                    totalInterest += accrued.interestEarned;
                }
            }
            return { accountsProcessed: accounts.length, totalInterest };
        });
    const processSqlite = db.transaction(() => {
        rebalanceBankInterestSqlite(now);
        const rows = db.prepare(`SELECT user_id AS userId,bank_balance AS bankBalance,
      last_bank_interest_at AS lastBankInterestAt,bank_interest_remainder AS bankInterestRemainder
      FROM economy_accounts WHERE guild_id=? AND bank_balance>0
      AND (last_bank_interest_at IS NULL OR last_bank_interest_at<=?) ORDER BY user_id`)
            .all(GLOBAL_SCOPE_ID, dueBefore);
        if (!rows.length)
            return { accountsProcessed: 0, totalInterest: 0 };
        const rates = sqliteBankInterestRateHistory(minimumInterestAnchor(rows, now), now);
        let totalInterest = 0;
        for (const account of rows) {
            const accrued = calculateBankInterest(account, now, rates);
            db.prepare('UPDATE economy_accounts SET bank_balance=?,bank_interest_remainder=?,last_bank_interest_at=?,updated_at=? WHERE guild_id=? AND user_id=?')
                .run(accrued.bankBalance, accrued.remainder, accrued.nextInterestAt, now, GLOBAL_SCOPE_ID, account.userId);
            if (accrued.interestEarned > 0) {
                db.prepare('INSERT INTO economy_ledger (guild_id,user_id,amount,reason,reference,created_at) VALUES (?,?,?,?,?,?)')
                    .run(GLOBAL_SCOPE_ID, account.userId, accrued.interestEarned, 'bank:interest', `bank-interest:${GLOBAL_SCOPE_ID}:${account.userId}:${accrued.nextInterestAt}`, now);
                totalInterest += accrued.interestEarned;
            }
        }
        return { accountsProcessed: rows.length, totalInterest };
    });
    return processSqlite.immediate();
}
async function accrueBankInterestMysql(connection, guildId, userId, account, now) {
    const anchor = account.lastBankInterestAt === null || Number(account.lastBankInterestAt) <= 0 || Number(account.lastBankInterestAt) > now + 60 ? now : Number(account.lastBankInterestAt);
    const rates = await mysqlBankInterestRateHistory(connection, anchor, now);
    const accrued = calculateBankInterest(account, now, rates);
    await connection.execute(`UPDATE economy_accounts SET bank_balance = ?, bank_interest_remainder = ?,
    last_bank_interest_at = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?`, [accrued.bankBalance, accrued.remainder, accrued.nextInterestAt, now, guildId, userId]);
    if (accrued.interestEarned > 0) {
        await mysqlAddLedger(connection, guildId, userId, accrued.interestEarned, 'bank:interest', `bank-interest:${guildId}:${userId}:${accrued.nextInterestAt}`, now);
    }
    return accrued;
}
function accrueBankInterestSqlite(guildId, userId, account, now) {
    const anchor = account.lastBankInterestAt === null || Number(account.lastBankInterestAt) <= 0 || Number(account.lastBankInterestAt) > now + 60 ? now : Number(account.lastBankInterestAt);
    const accrued = calculateBankInterest(account, now, sqliteBankInterestRateHistory(anchor, now));
    db.prepare(`UPDATE economy_accounts SET bank_balance = ?, bank_interest_remainder = ?,
    last_bank_interest_at = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?`)
        .run(accrued.bankBalance, accrued.remainder, accrued.nextInterestAt, now, guildId, userId);
    if (accrued.interestEarned > 0) {
        db.prepare('INSERT INTO economy_ledger (guild_id, user_id, amount, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?)')
            .run(guildId, userId, accrued.interestEarned, 'bank:interest', `bank-interest:${guildId}:${userId}:${accrued.nextInterestAt}`, now);
    }
    return accrued;
}
export async function bankAction(guildId, userId, action, amount = 0, reference = '') {
    guildId = GLOBAL_SCOPE_ID;
    if (action !== 'view' && (!Number.isSafeInteger(amount) || amount <= 0)) {
        const now = nowSeconds();
        return { ok: false, reason: 'invalid_amount', balance: 0, bankBalance: 0, interestEarned: 0,
            interestRateBps: BANK_BASE_APR_BPS, nextInterestAt: now + BANK_INTEREST_INTERVAL_SECONDS,
            nextRateRebalanceAt: now + BANK_POLICY_REBALANCE_SECONDS };
    }
    const now = nowSeconds();
    if (economyPool)
        return withEconomyTransaction(async (connection) => {
            const policy = await rebalanceBankInterestMysql(connection, now);
            const account = await mysqlEnsureAccount(connection, guildId, userId, true);
            const accrued = await accrueBankInterestMysql(connection, guildId, userId, account, now);
            const bankBalance = accrued.bankBalance;
            let balance = account.balance;
            let nextBankBalance = bankBalance;
            if (action === 'deposit') {
                if (balance < amount)
                    return { ok: false, reason: 'insufficient_wallet', balance, bankBalance, interestEarned: accrued.interestEarned,
                        interestRateBps: policy.rateBps, nextInterestAt: accrued.nextInterestAt + BANK_INTEREST_INTERVAL_SECONDS, nextRateRebalanceAt: policy.nextRebalanceAt };
                balance -= amount;
                nextBankBalance += amount;
                await connection.execute('UPDATE economy_accounts SET balance = ?, bank_balance = ?, last_bank_interest_at = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?', [balance, nextBankBalance, accrued.nextInterestAt, now, guildId, userId]);
                await mysqlAddLedger(connection, guildId, userId, -amount, 'bank:deposit:wallet', `${reference}:wallet`, now);
                await mysqlAddLedger(connection, guildId, userId, amount, 'bank:deposit:vault', `${reference}:vault`, now);
            }
            else if (action === 'withdraw') {
                if (bankBalance < amount)
                    return { ok: false, reason: 'insufficient_bank', balance, bankBalance, interestEarned: accrued.interestEarned,
                        interestRateBps: policy.rateBps, nextInterestAt: accrued.nextInterestAt + BANK_INTEREST_INTERVAL_SECONDS, nextRateRebalanceAt: policy.nextRebalanceAt };
                balance += amount;
                nextBankBalance -= amount;
                await connection.execute('UPDATE economy_accounts SET balance = ?, bank_balance = ?, last_bank_interest_at = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?', [balance, nextBankBalance, accrued.nextInterestAt, now, guildId, userId]);
                await mysqlAddLedger(connection, guildId, userId, amount, 'bank:withdraw:wallet', `${reference}:wallet`, now);
                await mysqlAddLedger(connection, guildId, userId, -amount, 'bank:withdraw:vault', `${reference}:vault`, now);
            }
            return { ok: true, balance, bankBalance: nextBankBalance, interestEarned: accrued.interestEarned,
                interestRateBps: policy.rateBps, nextInterestAt: accrued.nextInterestAt + BANK_INTEREST_INTERVAL_SECONDS,
                nextRateRebalanceAt: policy.nextRebalanceAt };
        });
    const operate = db.transaction(() => {
        const policy = rebalanceBankInterestSqlite(now);
        const account = sqliteEnsureAccount(guildId, userId);
        const accrued = accrueBankInterestSqlite(guildId, userId, account, now);
        const bankBalance = accrued.bankBalance;
        let balance = account.balance;
        let nextBankBalance = bankBalance;
        if (action === 'deposit') {
            if (balance < amount)
                return { ok: false, reason: 'insufficient_wallet', balance, bankBalance, interestEarned: accrued.interestEarned,
                    interestRateBps: policy.rateBps, nextInterestAt: accrued.nextInterestAt + BANK_INTEREST_INTERVAL_SECONDS, nextRateRebalanceAt: policy.nextRebalanceAt };
            balance -= amount;
            nextBankBalance += amount;
            db.prepare('UPDATE economy_accounts SET balance = ?, bank_balance = ?, last_bank_interest_at = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?')
                .run(balance, nextBankBalance, accrued.nextInterestAt, now, guildId, userId);
            db.prepare('INSERT INTO economy_ledger (guild_id, user_id, amount, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?)')
                .run(guildId, userId, -amount, 'bank:deposit:wallet', `${reference}:wallet`, now);
            db.prepare('INSERT INTO economy_ledger (guild_id, user_id, amount, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?)')
                .run(guildId, userId, amount, 'bank:deposit:vault', `${reference}:vault`, now);
        }
        else if (action === 'withdraw') {
            if (bankBalance < amount)
                return { ok: false, reason: 'insufficient_bank', balance, bankBalance, interestEarned: accrued.interestEarned,
                    interestRateBps: policy.rateBps, nextInterestAt: accrued.nextInterestAt + BANK_INTEREST_INTERVAL_SECONDS, nextRateRebalanceAt: policy.nextRebalanceAt };
            balance += amount;
            nextBankBalance -= amount;
            db.prepare('UPDATE economy_accounts SET balance = ?, bank_balance = ?, last_bank_interest_at = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?')
                .run(balance, nextBankBalance, accrued.nextInterestAt, now, guildId, userId);
            db.prepare('INSERT INTO economy_ledger (guild_id, user_id, amount, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?)')
                .run(guildId, userId, amount, 'bank:withdraw:wallet', `${reference}:wallet`, now);
            db.prepare('INSERT INTO economy_ledger (guild_id, user_id, amount, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?)')
                .run(guildId, userId, -amount, 'bank:withdraw:vault', `${reference}:vault`, now);
        }
        return { ok: true, balance, bankBalance: nextBankBalance, interestEarned: accrued.interestEarned,
            interestRateBps: policy.rateBps, nextInterestAt: accrued.nextInterestAt + BANK_INTEREST_INTERVAL_SECONDS,
            nextRateRebalanceAt: policy.nextRebalanceAt };
    });
    return operate.immediate();
}
export async function claimDaily(guildId, userId, reference) {
    guildId = GLOBAL_SCOPE_ID;
    if (economyPool)
        return withEconomyTransaction(async (connection) => {
            const account = await mysqlEnsureAccount(connection, guildId, userId, true);
            const now = nowSeconds();
            const nextClaimAt = (account.lastDailyAt ?? 0) + DAILY_COOLDOWN_SECONDS;
            if (now < nextClaimAt)
                return { ok: false, secondsRemaining: nextClaimAt - now };
            await connection.execute('UPDATE economy_accounts SET balance = balance + ?, last_daily_at = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?', [DAILY_AMOUNT, now, now, guildId, userId]);
            await mysqlAddLedger(connection, guildId, userId, DAILY_AMOUNT, 'daily_reward', reference, now);
            return { ok: true, balance: account.balance + DAILY_AMOUNT, amount: DAILY_AMOUNT };
        });
    const claim = db.transaction(() => {
        const account = sqliteEnsureAccount(guildId, userId);
        const now = nowSeconds();
        const nextClaimAt = (account.lastDailyAt ?? 0) + DAILY_COOLDOWN_SECONDS;
        if (now < nextClaimAt)
            return { ok: false, secondsRemaining: nextClaimAt - now };
        db.prepare('UPDATE economy_accounts SET balance = balance + ?, last_daily_at = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?').run(DAILY_AMOUNT, now, now, guildId, userId);
        db.prepare('INSERT INTO economy_ledger (guild_id, user_id, amount, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(guildId, userId, DAILY_AMOUNT, 'daily_reward', reference, now);
        return { ok: true, balance: account.balance + DAILY_AMOUNT, amount: DAILY_AMOUNT };
    });
    return claim.immediate();
}
export async function purchaseItem(guildId, userId, itemId, reference) {
    guildId = GLOBAL_SCOPE_ID;
    const item = storeItems.find((candidate) => candidate.id === itemId);
    if (!item)
        return { ok: false, balance: 0, reason: 'invalid_item' };
    const cost = item.cost;
    if (economyPool)
        return withEconomyTransaction(async (connection) => {
            const account = await mysqlEnsureAccount(connection, guildId, userId, true);
            if (item.repeatable === false) {
                const [owned] = await connection.execute('SELECT quantity FROM economy_inventory WHERE guild_id=? AND user_id=? AND item_id=? FOR UPDATE', [guildId, userId, itemId]);
                if (Number(owned[0]?.quantity ?? 0) > 0)
                    return { ok: false, balance: account.balance, reason: 'already_owned' };
            }
            if (account.balance < cost)
                return { ok: false, balance: account.balance, reason: 'insufficient_funds' };
            const now = nowSeconds();
            await connection.execute('UPDATE economy_accounts SET balance = balance - ?, updated_at = ? WHERE guild_id = ? AND user_id = ?', [cost, now, guildId, userId]);
            await connection.execute(`INSERT INTO economy_inventory (guild_id, user_id, item_id, quantity, acquired_at) VALUES (?, ?, ?, 1, ?)
      ON DUPLICATE KEY UPDATE quantity = quantity + 1`, [guildId, userId, itemId, now]);
            await mysqlAddLedger(connection, guildId, userId, -cost, `store:${itemId}`, reference, now);
            await insertItemLedger(connection, { guildId, userId, itemId, quantityDelta: 1, reason: 'store_purchase', reference: `${reference}:item`, createdAt: now });
            return { ok: true, balance: account.balance - cost, quantity: (await getInventoryQuantityMysql(connection, guildId, userId, itemId)) };
        });
    const purchase = db.transaction(() => {
        const account = sqliteEnsureAccount(guildId, userId);
        if (item.repeatable === false) {
            const owned = db.prepare('SELECT quantity FROM economy_inventory WHERE guild_id=? AND user_id=? AND item_id=?')
                .get(guildId, userId, itemId);
            if ((owned?.quantity ?? 0) > 0)
                return { ok: false, balance: account.balance, reason: 'already_owned' };
        }
        if (account.balance < cost)
            return { ok: false, balance: account.balance, reason: 'insufficient_funds' };
        const now = nowSeconds();
        db.prepare('UPDATE economy_accounts SET balance = balance - ?, updated_at = ? WHERE guild_id = ? AND user_id = ?').run(cost, now, guildId, userId);
        db.prepare(`INSERT INTO economy_inventory (guild_id, user_id, item_id, quantity, acquired_at) VALUES (?, ?, ?, 1, ?)
      ON CONFLICT (guild_id, user_id, item_id) DO UPDATE SET quantity = quantity + 1`).run(guildId, userId, itemId, now);
        db.prepare('INSERT INTO economy_ledger (guild_id, user_id, amount, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(guildId, userId, -cost, `store:${itemId}`, reference, now);
        db.prepare('INSERT INTO economy_item_ledger (guild_id, user_id, item_id, quantity_delta, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .run(guildId, userId, itemId, 1, 'store_purchase', `${reference}:item`, now);
        const inventory = db.prepare('SELECT quantity FROM economy_inventory WHERE guild_id = ? AND user_id = ? AND item_id = ?').get(guildId, userId, itemId);
        return { ok: true, balance: account.balance - cost, quantity: inventory.quantity };
    });
    return purchase.immediate();
}
async function getInventoryQuantityMysql(connection, guildId, userId, itemId) {
    const [rows] = await connection.execute('SELECT quantity FROM economy_inventory WHERE guild_id = ? AND user_id = ? AND item_id = ?', [guildId, userId, itemId]);
    return Number(rows[0]?.quantity ?? 0);
}
export async function getActiveJob(guildId, userId) {
    guildId = GLOBAL_SCOPE_ID;
    if (economyPool) {
        const [rows] = await economyPool.execute('SELECT job_id AS jobId, level, xp FROM economy_jobs WHERE guild_id=? AND user_id=? AND is_active=1 ORDER BY updated_at DESC,job_id ASC LIMIT 1', [guildId, userId]);
        const row = rows[0];
        return row ? makeJobProgress(String(row.jobId), Number(row.level), Number(row.xp)) : undefined;
    }
    const row = db.prepare('SELECT job_id AS jobId, level, xp FROM economy_jobs WHERE guild_id=? AND user_id=? AND is_active=1 ORDER BY updated_at DESC,job_id ASC LIMIT 1')
        .get(guildId, userId);
    return row ? makeJobProgress(row.jobId, row.level, row.xp) : undefined;
}
export async function getJobRoster(guildId, userId) {
    guildId = GLOBAL_SCOPE_ID;
    let rows;
    if (economyPool) {
        const [result] = await economyPool.execute('SELECT job_id AS jobId,level,xp,is_active AS active FROM economy_jobs WHERE guild_id=? AND user_id=? ORDER BY updated_at DESC,job_id ASC', [guildId, userId]);
        rows = result.map((row) => ({ jobId: String(row.jobId), level: Number(row.level), xp: Number(row.xp), active: Number(row.active) }));
    }
    else {
        rows = db.prepare('SELECT job_id AS jobId,level,xp,is_active AS active FROM economy_jobs WHERE guild_id=? AND user_id=? ORDER BY updated_at DESC,job_id ASC')
            .all(guildId, userId);
    }
    const progressById = new Map(rows.map((row) => [row.jobId, row]));
    const secondSlotUnlocked = rows.some((row) => row.level >= MAX_JOB_LEVEL);
    const jobs = economyJobs.map((job) => {
        const saved = progressById.get(job.id);
        return { ...makeJobProgress(job.id, saved?.level ?? 1, saved?.xp ?? 0), active: Boolean(saved?.active) };
    });
    const primaryJobId = rows.find((row) => Boolean(row.active))?.jobId;
    return { jobs, activeCount: jobs.filter((job) => job.active).length, slotLimit: secondSlotUnlocked ? 2 : 1, secondSlotUnlocked,
        ...(primaryJobId ? { primaryJobId } : {}) };
}
function planJobResignation(rows, requestedJobId) {
    const activeJobs = rows.flatMap((row) => {
        const job = economyJobs.find((candidate) => candidate.id === row.jobId);
        return job ? [{ job, level: Number(row.level), jobId: row.jobId }] : [];
    });
    if (!activeJobs.length)
        return { ok: false, reason: 'no_active_job' };
    const selected = requestedJobId
        ? activeJobs.find((entry) => entry.jobId === requestedJobId)
        : activeJobs.length === 1 ? activeJobs[0] : undefined;
    if (!selected) {
        if (requestedJobId) {
            const job = economyJobs.find((candidate) => candidate.id === requestedJobId);
            return job ? { ok: false, reason: 'not_active', job } : { ok: false, reason: 'invalid_job' };
        }
        return { ok: false, reason: 'choose_job', activeJobs: activeJobs.map((entry) => entry.job) };
    }
    return { ok: true, job: selected.job, level: selected.level, remainingJobs: activeJobs.filter((entry) => entry.jobId !== selected.jobId).map((entry) => entry.job), jobId: selected.jobId };
}
export async function resignJob(guildId, userId, requestedJobId) {
    guildId = GLOBAL_SCOPE_ID;
    if (requestedJobId && !economyJobs.some((job) => job.id === requestedJobId))
        return { ok: false, reason: 'invalid_job' };
    if (economyPool)
        return withEconomyTransaction(async (connection) => {
            const [result] = await connection.execute('SELECT job_id AS jobId,level FROM economy_jobs WHERE guild_id=? AND user_id=? AND is_active=1 ORDER BY updated_at DESC,job_id ASC FOR UPDATE', [guildId, userId]);
            const plan = planJobResignation(result.map((row) => ({ jobId: String(row.jobId), level: Number(row.level) })), requestedJobId);
            if (!plan.ok)
                return plan;
            await connection.execute('UPDATE economy_jobs SET is_active=0 WHERE guild_id=? AND user_id=? AND job_id=? AND is_active=1', [guildId, userId, plan.jobId]);
            return { ok: true, job: plan.job, level: plan.level, remainingJobs: plan.remainingJobs };
        });
    const run = db.transaction(() => {
        const rows = db.prepare('SELECT job_id AS jobId,level FROM economy_jobs WHERE guild_id=? AND user_id=? AND is_active=1 ORDER BY updated_at DESC,job_id ASC')
            .all(guildId, userId);
        const plan = planJobResignation(rows, requestedJobId);
        if (!plan.ok)
            return plan;
        db.prepare('UPDATE economy_jobs SET is_active=0 WHERE guild_id=? AND user_id=? AND job_id=? AND is_active=1').run(guildId, userId, plan.jobId);
        return { ok: true, job: plan.job, level: plan.level, remainingJobs: plan.remainingJobs };
    });
    return run.immediate();
}
function planActiveJobs(rows, selectedJobId) {
    const secondSlotUnlocked = rows.some((row) => Number(row.level) >= MAX_JOB_LEVEL);
    const slotLimit = secondSlotUnlocked ? 2 : 1;
    const activeRows = rows.filter((row) => Boolean(row.active) && row.jobId !== selectedJobId);
    // Keep a maxed job and the most recently used other job when an occupied slot must be replaced.
    activeRows.sort((a, b) => Number(b.level >= MAX_JOB_LEVEL) - Number(a.level >= MAX_JOB_LEVEL) || Number(b.updatedAt) - Number(a.updatedAt));
    return { activeJobIds: [selectedJobId, ...activeRows.slice(0, slotLimit - 1).map((row) => row.jobId)], slotLimit, secondSlotUnlocked };
}
export async function selectJob(guildId, userId, jobId) {
    guildId = GLOBAL_SCOPE_ID;
    const job = economyJobs.find((candidate) => candidate.id === jobId);
    if (!job)
        return { ok: false, reason: 'invalid_job' };
    const now = nowSeconds();
    if (economyPool)
        return withEconomyTransaction(async (connection) => {
            await mysqlEnsureAccount(connection, guildId, userId, true);
            const [savedRows] = await connection.execute('SELECT job_id AS jobId,level,xp,is_active AS active,updated_at AS updatedAt FROM economy_jobs WHERE guild_id=? AND user_id=? FOR UPDATE', [guildId, userId]);
            const rows = savedRows.map((row) => ({ jobId: String(row.jobId), level: Number(row.level), xp: Number(row.xp), active: Number(row.active), updatedAt: Number(row.updatedAt) }));
            const plan = planActiveJobs(rows, jobId);
            const selectedAt = Math.max(now, ...rows.map((row) => row.updatedAt + 1));
            await connection.execute(`INSERT INTO economy_jobs (guild_id,user_id,job_id,level,xp,is_active,created_at,updated_at)
      VALUES (?,?,?,1,0,1,?,?) ON DUPLICATE KEY UPDATE is_active=1,updated_at=VALUES(updated_at)`, [guildId, userId, jobId, selectedAt, selectedAt]);
            await connection.execute('UPDATE economy_jobs SET is_active=0 WHERE guild_id=? AND user_id=?', [guildId, userId]);
            for (const activeJobId of plan.activeJobIds) {
                await connection.execute('UPDATE economy_jobs SET is_active=1,updated_at=IF(job_id=?, ?, updated_at) WHERE guild_id=? AND user_id=? AND job_id=?', [jobId, selectedAt, guildId, userId, activeJobId]);
            }
            const [jobProgressRows] = await connection.execute('SELECT level,xp FROM economy_jobs WHERE guild_id=? AND user_id=? AND job_id=?', [guildId, userId, jobId]);
            const row = jobProgressRows[0];
            return { ok: true, progress: makeJobProgress(job.id, Number(row?.level ?? 1), Number(row?.xp ?? 0)), ...plan };
        });
    const select = db.transaction(() => {
        sqliteEnsureAccount(guildId, userId);
        const rows = db.prepare('SELECT job_id AS jobId,level,xp,is_active AS active,updated_at AS updatedAt FROM economy_jobs WHERE guild_id=? AND user_id=?')
            .all(guildId, userId);
        const plan = planActiveJobs(rows, jobId);
        const selectedAt = Math.max(now, ...rows.map((row) => row.updatedAt + 1));
        db.prepare(`INSERT INTO economy_jobs (guild_id,user_id,job_id,level,xp,is_active,created_at,updated_at)
      VALUES (?,?,?,1,0,1,?,?) ON CONFLICT(guild_id,user_id,job_id) DO UPDATE SET is_active=1,updated_at=excluded.updated_at`).run(guildId, userId, jobId, selectedAt, selectedAt);
        db.prepare('UPDATE economy_jobs SET is_active=0 WHERE guild_id=? AND user_id=?').run(guildId, userId);
        for (const activeJobId of plan.activeJobIds) {
            db.prepare('UPDATE economy_jobs SET is_active=1,updated_at=CASE WHEN job_id=? THEN ? ELSE updated_at END WHERE guild_id=? AND user_id=? AND job_id=?')
                .run(jobId, selectedAt, guildId, userId, activeJobId);
        }
        const row = db.prepare('SELECT level,xp FROM economy_jobs WHERE guild_id=? AND user_id=? AND job_id=?')
            .get(guildId, userId, jobId);
        return { ok: true, progress: makeJobProgress(job.id, row.level, row.xp), ...plan };
    });
    return select.immediate();
}
function addJobExperience(level, xp) {
    if (level >= MAX_JOB_LEVEL)
        return { level: MAX_JOB_LEVEL, xp: 0, levelUp: false };
    let nextLevel = level;
    let nextXp = xp + JOB_XP_PER_SHIFT;
    while (nextLevel < MAX_JOB_LEVEL && nextXp >= jobXpToNext(nextLevel)) {
        nextXp -= jobXpToNext(nextLevel);
        nextLevel++;
    }
    if (nextLevel >= MAX_JOB_LEVEL)
        nextXp = 0;
    return { level: nextLevel, xp: nextXp, levelUp: nextLevel > level };
}
export async function work(guildId, userId, reference) {
    guildId = GLOBAL_SCOPE_ID;
    if (economyPool)
        return withEconomyTransaction(async (connection) => {
            const account = await mysqlEnsureAccount(connection, guildId, userId, true);
            const [jobRows] = await connection.execute('SELECT job_id AS jobId,level,xp,updated_at AS updatedAt FROM economy_jobs WHERE guild_id=? AND user_id=? AND is_active=1 ORDER BY updated_at DESC,job_id ASC LIMIT 1 FOR UPDATE', [guildId, userId]);
            const current = jobRows[0];
            if (!current)
                return { ok: false, reason: 'no_job' };
            const job = economyJobs.find((candidate) => candidate.id === String(current.jobId));
            if (!job)
                return { ok: false, reason: 'no_job' };
            const [tools] = await connection.execute('SELECT quantity FROM economy_inventory WHERE guild_id=? AND user_id=? AND item_id=? FOR UPDATE', [guildId, userId, job.toolId]);
            if (Number(tools[0]?.quantity ?? 0) < 1)
                return { ok: false, reason: 'missing_tool', job };
            const now = nowSeconds();
            const selectedAt = Math.max(now, Number(current.updatedAt ?? 0) + 1);
            const nextWorkAt = (account.lastWorkAt ?? 0) + WORK_COOLDOWN_SECONDS;
            if (now < nextWorkAt)
                return { ok: false, reason: 'cooldown', secondsRemaining: nextWorkAt - now, job };
            const level = Number(current.level);
            const xp = Number(current.xp);
            const amount = job.minPay + randomInt(job.maxPay - job.minPay + 1) + Math.min(level - 1, MAX_JOB_LEVEL - 1) * 3;
            const progress = addJobExperience(level, xp);
            await connection.execute('UPDATE economy_jobs SET level=?,xp=?,updated_at=? WHERE guild_id=? AND user_id=? AND job_id=?', [progress.level, progress.xp, selectedAt, guildId, userId, job.id]);
            await connection.execute('UPDATE economy_accounts SET balance=balance+?,last_work_at=?,updated_at=? WHERE guild_id=? AND user_id=?', [amount, now, now, guildId, userId]);
            await mysqlAddLedger(connection, guildId, userId, amount, `work_reward:${job.id}:lv${level}`, reference, now);
            const xpText = progress.level >= MAX_JOB_LEVEL ? ' · nivel máximo' : ` · ${progress.xp}/${jobXpToNext(progress.level)} XP`;
            const levelText = progress.levelUp ? `\n🎉 **${job.name} subió al nivel ${progress.level}.**` : '';
            return { ok: true, amount, balance: account.balance + amount, jobName: job.name, level: progress.level, levelUp: progress.levelUp,
                message: `${pick(job.messages)}\n**${job.name} · nivel ${progress.level}**${xpText}${levelText}` };
        });
    const earn = db.transaction(() => {
        const account = sqliteEnsureAccount(guildId, userId);
        const current = db.prepare('SELECT job_id AS jobId,level,xp,updated_at AS updatedAt FROM economy_jobs WHERE guild_id=? AND user_id=? AND is_active=1 ORDER BY updated_at DESC,job_id ASC LIMIT 1')
            .get(guildId, userId);
        if (!current)
            return { ok: false, reason: 'no_job' };
        const job = economyJobs.find((candidate) => candidate.id === current.jobId);
        if (!job)
            return { ok: false, reason: 'no_job' };
        const tools = db.prepare('SELECT quantity FROM economy_inventory WHERE guild_id=? AND user_id=? AND item_id=?')
            .get(guildId, userId, job.toolId);
        if (!tools || tools.quantity < 1)
            return { ok: false, reason: 'missing_tool', job };
        const now = nowSeconds();
        const selectedAt = Math.max(now, Number(current.updatedAt ?? 0) + 1);
        const nextWorkAt = (account.lastWorkAt ?? 0) + WORK_COOLDOWN_SECONDS;
        if (now < nextWorkAt)
            return { ok: false, reason: 'cooldown', secondsRemaining: nextWorkAt - now, job };
        const amount = job.minPay + randomInt(job.maxPay - job.minPay + 1) + Math.min(current.level - 1, MAX_JOB_LEVEL - 1) * 3;
        const progress = addJobExperience(current.level, current.xp);
        db.prepare('UPDATE economy_jobs SET level=?,xp=?,updated_at=? WHERE guild_id=? AND user_id=? AND job_id=?')
            .run(progress.level, progress.xp, selectedAt, guildId, userId, job.id);
        db.prepare('UPDATE economy_accounts SET balance=balance+?,last_work_at=?,updated_at=? WHERE guild_id=? AND user_id=?')
            .run(amount, now, now, guildId, userId);
        db.prepare('INSERT INTO economy_ledger (guild_id,user_id,amount,reason,reference,created_at) VALUES (?,?,?,?,?,?)')
            .run(guildId, userId, amount, `work_reward:${job.id}:lv${current.level}`, reference, now);
        const xpText = progress.level >= MAX_JOB_LEVEL ? ' · nivel máximo' : ` · ${progress.xp}/${jobXpToNext(progress.level)} XP`;
        const levelText = progress.levelUp ? `\n🎉 **${job.name} subió al nivel ${progress.level}.**` : '';
        return { ok: true, amount, balance: account.balance + amount, jobName: job.name, level: progress.level, levelUp: progress.levelUp,
            message: `${pick(job.messages)}\n**${job.name} · nivel ${progress.level}**${xpText}${levelText}` };
    });
    return earn.immediate();
}
const crimeSuccessLines = [
    'El plan salió limpio y encontraste un buen botín.', 'La operación fue un éxito: escapaste a tiempo.',
    'Nadie sospechó de ti. El golpe salió redondo.', 'Una distracción perfecta y el botín terminó en tus manos.',
    'El guardia miró hacia otro lado.', 'El botín estaba mejor de lo esperado.',
    'Todo salió según el plan.', 'La suerte te acompañó durante la huida.',
    'Cambiaste de ruta a tiempo y saliste a salvo.', 'El golpe fue rápido y limpio.',
];
const crimeFailLines = [
    'La alarma se activó y tuviste que pagar una multa.', 'Un testigo te reconoció y tocó negociar.',
    'El plan salió mal y perdiste parte del botín en la huida.', 'Te atraparon antes de llegar al objetivo.',
    'La puerta estaba vigilada. El intento salió caro.', 'Tu coartada no convenció a nadie.',
    'Un ruido arruinó la operación.', 'La patrulla llegó justo a tiempo.',
    'El objetivo estaba vacío y acabaste pagando una multa.', 'El plan necesitaba más preparación.',
];
export async function crime(guildId, userId, reference) {
    guildId = GLOBAL_SCOPE_ID;
    const success = randomInt(100) < 40;
    const now = nowSeconds();
    if (economyPool)
        return withEconomyTransaction(async (connection) => {
            const account = await mysqlEnsureAccount(connection, guildId, userId, true);
            const nextCrimeAt = (account.lastCrimeAt ?? 0) + CRIME_COOLDOWN_SECONDS;
            if (now < nextCrimeAt)
                return { ok: false, secondsRemaining: nextCrimeAt - now };
            const amount = success
                ? 40 + randomInt(41)
                : Math.min(account.balance, 10 + randomInt(21));
            const signedAmount = success ? amount : -amount;
            const message = formatMessage(pick(success ? crimeSuccessLines : crimeFailLines), { amount });
            await connection.execute('UPDATE economy_accounts SET balance = balance + ?, last_crime_at = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?', [signedAmount, now, now, guildId, userId]);
            if (signedAmount)
                await mysqlAddLedger(connection, guildId, userId, signedAmount, success ? 'crime_reward' : 'crime_fine', reference, now);
            return { ok: true, success, amount, balance: account.balance + signedAmount, message };
        });
    const commitCrime = db.transaction(() => {
        const account = sqliteEnsureAccount(guildId, userId);
        const nextCrimeAt = (account.lastCrimeAt ?? 0) + CRIME_COOLDOWN_SECONDS;
        if (now < nextCrimeAt)
            return { ok: false, secondsRemaining: nextCrimeAt - now };
        const amount = success
            ? 40 + randomInt(41)
            : Math.min(account.balance, 10 + randomInt(21));
        const signedAmount = success ? amount : -amount;
        const message = formatMessage(pick(success ? crimeSuccessLines : crimeFailLines), { amount });
        db.prepare('UPDATE economy_accounts SET balance = balance + ?, last_crime_at = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?')
            .run(signedAmount, now, now, guildId, userId);
        if (signedAmount)
            db.prepare('INSERT INTO economy_ledger (guild_id, user_id, amount, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?)')
                .run(guildId, userId, signedAmount, success ? 'crime_reward' : 'crime_fine', reference, now);
        return { ok: true, success, amount, balance: account.balance + signedAmount, message };
    });
    return commitCrime.immediate();
}
export async function transferCoins(guildId, fromUserId, toUserId, amount, reference) {
    guildId = GLOBAL_SCOPE_ID;
    if (fromUserId === toUserId)
        return { ok: false, reason: 'self' };
    if (!Number.isSafeInteger(amount) || amount <= 0)
        return { ok: false, reason: 'invalid_amount' };
    if (economyPool)
        return withEconomyTransaction(async (connection) => {
            const ids = [fromUserId, toUserId].sort();
            const accounts = new Map();
            for (const id of ids)
                accounts.set(id, await mysqlEnsureAccount(connection, guildId, id, true));
            const from = accounts.get(fromUserId);
            const to = accounts.get(toUserId);
            if (from.balance < amount)
                return { ok: false, reason: 'insufficient_funds' };
            const now = nowSeconds();
            await connection.execute('UPDATE economy_accounts SET balance = balance - ?, updated_at = ? WHERE guild_id = ? AND user_id = ?', [amount, now, guildId, fromUserId]);
            await connection.execute('UPDATE economy_accounts SET balance = balance + ?, updated_at = ? WHERE guild_id = ? AND user_id = ?', [amount, now, guildId, toUserId]);
            await mysqlAddLedger(connection, guildId, fromUserId, -amount, `transfer:to:${toUserId}`, `${reference}:out`, now);
            await mysqlAddLedger(connection, guildId, toUserId, amount, `transfer:from:${fromUserId}`, `${reference}:in`, now);
            return { ok: true, fromBalance: from.balance - amount, toBalance: to.balance + amount };
        });
    const send = db.transaction(() => {
        const from = sqliteEnsureAccount(guildId, fromUserId);
        const to = sqliteEnsureAccount(guildId, toUserId);
        if (from.balance < amount)
            return { ok: false, reason: 'insufficient_funds' };
        const now = nowSeconds();
        db.prepare('UPDATE economy_accounts SET balance = balance - ?, updated_at = ? WHERE guild_id = ? AND user_id = ?').run(amount, now, guildId, fromUserId);
        db.prepare('UPDATE economy_accounts SET balance = balance + ?, updated_at = ? WHERE guild_id = ? AND user_id = ?').run(amount, now, guildId, toUserId);
        const ledger = db.prepare('INSERT INTO economy_ledger (guild_id, user_id, amount, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?)');
        ledger.run(guildId, fromUserId, -amount, `transfer:to:${toUserId}`, `${reference}:out`, now);
        ledger.run(guildId, toUserId, amount, `transfer:from:${fromUserId}`, `${reference}:in`, now);
        return { ok: true, fromBalance: from.balance - amount, toBalance: to.balance + amount };
    });
    return send.immediate();
}
export async function fish(guildId, userId, reference) {
    guildId = GLOBAL_SCOPE_ID;
    const caught = randomInt(100) < 70;
    const rare = caught && randomInt(100) < 5;
    const fishName = pick(rare ? fishRare : fishCommon);
    const amount = caught ? (rare ? 50 + randomInt(31) : 12 + randomInt(19)) : 0;
    const message = caught
        ? formatMessage(pick(fishCatchLines), { fish: fishName, amount })
        : pick(fishMissLines);
    if (economyPool)
        return withEconomyTransaction(async (connection) => {
            const account = await mysqlEnsureAccount(connection, guildId, userId, true);
            const [rods] = await connection.execute('SELECT quantity FROM economy_inventory WHERE guild_id=? AND user_id=? AND item_id=? FOR UPDATE', [guildId, userId, 'cana_pescar']);
            if (Number(rods[0]?.quantity ?? 0) < 1)
                return { ok: false, reason: 'missing_rod' };
            const now = nowSeconds();
            const nextFishAt = (account.lastFishAt ?? 0) + FISH_COOLDOWN_SECONDS;
            if (now < nextFishAt)
                return { ok: false, reason: 'cooldown', secondsRemaining: nextFishAt - now };
            await connection.execute('UPDATE economy_accounts SET balance = balance + ?, last_fish_at = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?', [amount, now, now, guildId, userId]);
            if (amount)
                await mysqlAddLedger(connection, guildId, userId, amount, rare ? 'fish_rare' : 'fish', reference, now);
            return { ok: true, amount, balance: account.balance + amount, message };
        });
    const catchFish = db.transaction(() => {
        const account = sqliteEnsureAccount(guildId, userId);
        const rod = db.prepare('SELECT quantity FROM economy_inventory WHERE guild_id=? AND user_id=? AND item_id=?')
            .get(guildId, userId, 'cana_pescar');
        if (!rod || rod.quantity < 1)
            return { ok: false, reason: 'missing_rod' };
        const now = nowSeconds();
        const nextFishAt = (account.lastFishAt ?? 0) + FISH_COOLDOWN_SECONDS;
        if (now < nextFishAt)
            return { ok: false, reason: 'cooldown', secondsRemaining: nextFishAt - now };
        db.prepare('UPDATE economy_accounts SET balance = balance + ?, last_fish_at = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?').run(amount, now, now, guildId, userId);
        if (amount)
            db.prepare('INSERT INTO economy_ledger (guild_id, user_id, amount, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(guildId, userId, amount, rare ? 'fish_rare' : 'fish', reference, now);
        return { ok: true, amount, balance: account.balance + amount, message };
    });
    return catchFish.immediate();
}
export async function robPlayer(guildId, userId, targetId, targetName, reference) {
    guildId = GLOBAL_SCOPE_ID;
    if (userId === targetId)
        return { ok: false, reason: 'self' };
    const success = randomInt(100) < 40;
    if (economyPool)
        return withEconomyTransaction(async (connection) => {
            const ids = [userId, targetId].sort();
            const accounts = new Map();
            for (const id of ids)
                accounts.set(id, await mysqlEnsureAccount(connection, guildId, id, true));
            const robber = accounts.get(userId);
            const victim = accounts.get(targetId);
            const now = nowSeconds();
            const nextRobAt = (robber.lastRobAt ?? 0) + ROB_COOLDOWN_SECONDS;
            if (now < nextRobAt)
                return { ok: false, reason: 'cooldown', secondsRemaining: nextRobAt - now };
            if (victim.balance <= 0)
                return { ok: false, reason: 'target_empty' };
            if ((victim.robProtectedUntil ?? 0) > now) {
                await connection.execute('UPDATE economy_accounts SET last_rob_at = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?', [now, now, guildId, userId]);
                return { ok: true, success: false, protected: true, amount: 0, balance: robber.balance,
                    message: `🛡️ ${targetName} tenía un escudo activo. El intento fue bloqueado y tendrás que esperar antes de volver a robar.` };
            }
            let amount;
            let message;
            if (success) {
                amount = Math.min(victim.balance, 200, Math.max(1, Math.floor(victim.balance * (5 + randomInt(11)) / 100)));
                message = formatMessage(pick(robSuccessLines), { amount, target: targetName });
                await connection.execute('UPDATE economy_accounts SET balance = balance + ?, last_rob_at = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?', [amount, now, now, guildId, userId]);
                await connection.execute('UPDATE economy_accounts SET balance = balance - ?, updated_at = ? WHERE guild_id = ? AND user_id = ?', [amount, now, guildId, targetId]);
                await mysqlAddLedger(connection, guildId, userId, amount, `rob:from:${targetId}`, `${reference}:in`, now);
                await mysqlAddLedger(connection, guildId, targetId, -amount, `rob:to:${userId}`, `${reference}:out`, now);
                return { ok: true, success: true, amount, balance: robber.balance + amount, message };
            }
            amount = Math.min(robber.balance, Math.max(1, Math.floor(robber.balance * 0.05)));
            message = formatMessage(pick(robFailLines), { amount, target: targetName });
            await connection.execute('UPDATE economy_accounts SET balance = balance - ?, last_rob_at = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?', [amount, now, now, guildId, userId]);
            if (amount)
                await mysqlAddLedger(connection, guildId, userId, -amount, 'rob_fine', `${reference}:fine`, now);
            return { ok: true, success: false, amount, balance: robber.balance - amount, message };
        });
    const attempt = db.transaction(() => {
        const accounts = new Map();
        for (const id of [userId, targetId].sort())
            accounts.set(id, sqliteEnsureAccount(guildId, id));
        const robber = accounts.get(userId);
        const victim = accounts.get(targetId);
        const now = nowSeconds();
        const nextRobAt = (robber.lastRobAt ?? 0) + ROB_COOLDOWN_SECONDS;
        if (now < nextRobAt)
            return { ok: false, reason: 'cooldown', secondsRemaining: nextRobAt - now };
        if (victim.balance <= 0)
            return { ok: false, reason: 'target_empty' };
        if ((victim.robProtectedUntil ?? 0) > now) {
            db.prepare('UPDATE economy_accounts SET last_rob_at = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?').run(now, now, guildId, userId);
            return { ok: true, success: false, protected: true, amount: 0, balance: robber.balance,
                message: `🛡️ ${targetName} tenía un escudo activo. El intento fue bloqueado y tendrás que esperar antes de volver a robar.` };
        }
        if (success) {
            const amount = Math.min(victim.balance, 200, Math.max(1, Math.floor(victim.balance * (5 + randomInt(11)) / 100)));
            const message = formatMessage(pick(robSuccessLines), { amount, target: targetName });
            db.prepare('UPDATE economy_accounts SET balance = balance + ?, last_rob_at = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?').run(amount, now, now, guildId, userId);
            db.prepare('UPDATE economy_accounts SET balance = balance - ?, updated_at = ? WHERE guild_id = ? AND user_id = ?').run(amount, now, guildId, targetId);
            const ledger = db.prepare('INSERT INTO economy_ledger (guild_id, user_id, amount, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?)');
            ledger.run(guildId, userId, amount, `rob:from:${targetId}`, `${reference}:in`, now);
            ledger.run(guildId, targetId, -amount, `rob:to:${userId}`, `${reference}:out`, now);
            return { ok: true, success: true, amount, balance: robber.balance + amount, message };
        }
        const amount = Math.min(robber.balance, Math.max(1, Math.floor(robber.balance * 0.05)));
        const message = formatMessage(pick(robFailLines), { amount, target: targetName });
        db.prepare('UPDATE economy_accounts SET balance = balance - ?, last_rob_at = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?').run(amount, now, now, guildId, userId);
        if (amount)
            db.prepare('INSERT INTO economy_ledger (guild_id, user_id, amount, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(guildId, userId, -amount, 'rob_fine', `${reference}:fine`, now);
        return { ok: true, success: false, amount, balance: robber.balance - amount, message };
    });
    return attempt.immediate();
}
const redNumbers = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export async function playRoulette(guildId, userId, bet, choice, reference) {
    guildId = GLOBAL_SCOPE_ID;
    if (!Number.isSafeInteger(bet) || bet < 1 || bet > MAX_BET)
        return { ok: false, reason: 'invalid_bet' };
    const number = randomInt(37);
    const result = number === 0 ? 'verde' : redNumbers.has(number) ? 'rojo' : 'negro';
    const won = choice === result;
    const payout = won ? bet * (choice === 'verde' ? 36 : 2) : 0;
    const message = won
        ? formatMessage(pick(rouletteWinLines), { payout })
        : pick(rouletteLoseLines);
    if (economyPool)
        return withEconomyTransaction(async (connection) => {
            const account = await mysqlEnsureAccount(connection, guildId, userId, true);
            if (account.balance < bet)
                return { ok: false, reason: 'insufficient_funds' };
            const now = nowSeconds();
            await connection.execute('UPDATE economy_accounts SET balance = balance - ? + ?, updated_at = ? WHERE guild_id = ? AND user_id = ?', [bet, payout, now, guildId, userId]);
            await mysqlAddLedger(connection, guildId, userId, -bet, `roulette:${choice}:bet`, `${reference}:bet`, now);
            if (payout)
                await mysqlAddLedger(connection, guildId, userId, payout, `roulette:${choice}:payout`, `${reference}:payout`, now);
            return { ok: true, balance: account.balance - bet + payout, bet, choice, number, result, payout, message };
        });
    const spin = db.transaction(() => {
        const account = sqliteEnsureAccount(guildId, userId);
        if (account.balance < bet)
            return { ok: false, reason: 'insufficient_funds' };
        const now = nowSeconds();
        db.prepare('UPDATE economy_accounts SET balance = balance - ? + ?, updated_at = ? WHERE guild_id = ? AND user_id = ?').run(bet, payout, now, guildId, userId);
        const ledger = db.prepare('INSERT INTO economy_ledger (guild_id, user_id, amount, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?)');
        ledger.run(guildId, userId, -bet, `roulette:${choice}:bet`, `${reference}:bet`, now);
        if (payout)
            ledger.run(guildId, userId, payout, `roulette:${choice}:payout`, `${reference}:payout`, now);
        return { ok: true, balance: account.balance - bet + payout, bet, choice, number, result, payout, message };
    });
    return spin.immediate();
}
const emptyRoosterProgress = { name: 'Tu gallo', streak: 0, bestStreak: 0, wins: 0, losses: 0 };
function normalizeRoosterName(value) {
    if (typeof value !== 'string')
        return undefined;
    const name = value.trim().replace(/\s+/g, ' ');
    return name.length >= 2 && name.length <= 24 && !/[\r\n@<>`*_~|]/.test(name) ? name : undefined;
}
function roosterProgress(value) {
    try {
        const parsed = JSON.parse(String(value ?? '{}'));
        return {
            name: normalizeRoosterName(parsed.name) ?? emptyRoosterProgress.name,
            streak: Math.max(0, Math.min(20, Math.floor(Number(parsed.streak) || 0))),
            bestStreak: Math.max(0, Math.floor(Number(parsed.bestStreak) || 0)),
            wins: Math.max(0, Math.floor(Number(parsed.wins) || 0)),
            losses: Math.max(0, Math.floor(Number(parsed.losses) || 0)),
        };
    }
    catch {
        return { ...emptyRoosterProgress };
    }
}
export async function setRoosterName(guildId, userId, requestedName) {
    guildId = GLOBAL_SCOPE_ID;
    const name = normalizeRoosterName(requestedName);
    if (!name)
        return { ok: false, reason: 'invalid_name' };
    const gameId = `rooster_${userId}`;
    const at = nowSeconds();
    if (economyPool)
        return withEconomyTransaction(async (connection) => {
            await mysqlEnsureAccount(connection, guildId, userId, true);
            const [rows] = await connection.execute("SELECT state_json AS stateJson FROM economy_games WHERE id=? AND guild_id=? AND user_id=? AND game_type='rooster_stats' FOR UPDATE", [gameId, guildId, userId]);
            const state = { ...roosterProgress(rows[0]?.stateJson), name };
            await connection.execute("INSERT INTO economy_games (id,guild_id,user_id,game_type,bet,status,state_json,created_at,updated_at) VALUES (?,?,?,'rooster_stats',0,'saved',?,?,?) ON DUPLICATE KEY UPDATE state_json=VALUES(state_json),updated_at=VALUES(updated_at)", [gameId, guildId, userId, JSON.stringify(state), at, at]);
            return { ok: true, name };
        });
    const run = db.transaction(() => {
        sqliteEnsureAccount(guildId, userId);
        const row = db.prepare("SELECT state_json AS stateJson FROM economy_games WHERE id=? AND guild_id=? AND user_id=? AND game_type='rooster_stats'")
            .get(gameId, guildId, userId);
        const state = { ...roosterProgress(row?.stateJson), name };
        db.prepare("INSERT INTO economy_games (id,guild_id,user_id,game_type,bet,status,state_json,created_at,updated_at) VALUES (?,?,?,'rooster_stats',0,'saved',?,?,?) ON CONFLICT(id) DO UPDATE SET state_json=excluded.state_json,updated_at=excluded.updated_at")
            .run(gameId, guildId, userId, JSON.stringify(state), at, at);
        return { ok: true, name };
    });
    return run.immediate();
}
function settleRoosterRound(balance, bet, progress) {
    const chance = Math.min(70, 50 + progress.streak);
    const won = randomInt(100) < chance;
    // The gross prize scales down with the rising win chance (about 90% RTP throughout the streak).
    const payout = won ? Math.floor((bet * 90) / chance) : 0;
    const streak = won ? Math.min(20, progress.streak + 1) : 0;
    const nextProgress = {
        name: progress.name,
        streak,
        bestStreak: Math.max(progress.bestStreak, streak),
        wins: progress.wins + (won ? 1 : 0),
        losses: progress.losses + (won ? 0 : 1),
    };
    const nextChance = Math.min(70, 50 + streak);
    const message = won
        ? `🐓 ¡Victoria! **${progress.name}** ganó con **${chance}%** de probabilidad y recibió **${payout.toLocaleString('es-MX')} monedas**. Racha: **${streak}** · próxima probabilidad: **${nextChance}%**.`
        : `🐓 Esta vez **${progress.name}** perdió. Tu racha vuelve a cero y la próxima pelea empieza en **50%** de probabilidad.`;
    return {
        round: { balance: balance - bet + payout, bet, won, chance, payout, streak, nextChance, bestStreak: nextProgress.bestStreak, roosterName: progress.name, message },
        progress: nextProgress,
    };
}
export async function playRoosterFight(guildId, userId, bet, reference) {
    guildId = GLOBAL_SCOPE_ID;
    if (!Number.isSafeInteger(bet) || bet < 1 || bet > MAX_BET)
        return { ok: false, reason: 'invalid_bet' };
    const gameId = `rooster_${userId}`;
    const at = nowSeconds();
    if (economyPool)
        return withEconomyTransaction(async (connection) => {
            const account = await mysqlEnsureAccount(connection, guildId, userId, true);
            if (account.balance < bet)
                return { ok: false, reason: 'insufficient_funds' };
            const [statsRows] = await connection.execute("SELECT state_json AS stateJson FROM economy_games WHERE id=? AND guild_id=? AND user_id=? AND game_type='rooster_stats' FOR UPDATE", [gameId, guildId, userId]);
            const progress = roosterProgress(statsRows[0]?.stateJson);
            const settled = settleRoosterRound(account.balance, bet, progress);
            await connection.execute('UPDATE economy_accounts SET balance=balance-?+?,updated_at=? WHERE guild_id=? AND user_id=?', [bet, settled.round.payout, at, guildId, userId]);
            await mysqlAddLedger(connection, guildId, userId, -bet, 'rooster:bet', `${reference}:bet`, at);
            if (settled.round.payout)
                await mysqlAddLedger(connection, guildId, userId, settled.round.payout, 'rooster:payout', `${reference}:payout`, at);
            await connection.execute("INSERT INTO economy_games (id,guild_id,user_id,game_type,bet,status,state_json,created_at,updated_at) VALUES (?,?,?,'rooster_stats',0,'saved',?,?,?) ON DUPLICATE KEY UPDATE state_json=VALUES(state_json),updated_at=VALUES(updated_at)", [gameId, guildId, userId, JSON.stringify(settled.progress), at, at]);
            return { ok: true, ...settled.round };
        });
    const play = db.transaction(() => {
        const account = sqliteEnsureAccount(guildId, userId);
        if (account.balance < bet)
            return { ok: false, reason: 'insufficient_funds' };
        const stats = db.prepare("SELECT state_json AS stateJson FROM economy_games WHERE id=? AND guild_id=? AND user_id=? AND game_type='rooster_stats'")
            .get(gameId, guildId, userId);
        const settled = settleRoosterRound(account.balance, bet, roosterProgress(stats?.stateJson));
        db.prepare('UPDATE economy_accounts SET balance=balance-?+?,updated_at=? WHERE guild_id=? AND user_id=?').run(bet, settled.round.payout, at, guildId, userId);
        const ledger = db.prepare('INSERT INTO economy_ledger (guild_id,user_id,amount,reason,reference,created_at) VALUES (?,?,?,?,?,?)');
        ledger.run(guildId, userId, -bet, 'rooster:bet', `${reference}:bet`, at);
        if (settled.round.payout)
            ledger.run(guildId, userId, settled.round.payout, 'rooster:payout', `${reference}:payout`, at);
        db.prepare("INSERT INTO economy_games (id,guild_id,user_id,game_type,bet,status,state_json,created_at,updated_at) VALUES (?,?,?,'rooster_stats',0,'saved',?,?,?) ON CONFLICT(id) DO UPDATE SET state_json=excluded.state_json,updated_at=excluded.updated_at")
            .run(gameId, guildId, userId, JSON.stringify(settled.progress), at, at);
        return { ok: true, ...settled.round };
    });
    return play.immediate();
}
const slotSymbols = [
    { emoji: '🍒', weight: 36, multiplier: 3 },
    { emoji: '🍋', weight: 28, multiplier: 4 },
    { emoji: '🔔', weight: 20, multiplier: 7 },
    { emoji: '💎', weight: 11, multiplier: 15 },
    { emoji: '7️⃣', weight: 5, multiplier: 50 },
];
function rollSlotSymbol() {
    let roll = randomInt(100);
    for (const symbol of slotSymbols) {
        if (roll < symbol.weight)
            return symbol;
        roll -= symbol.weight;
    }
    return slotSymbols[0];
}
export async function playSlots(guildId, userId, bet, reference) {
    guildId = GLOBAL_SCOPE_ID;
    if (!Number.isSafeInteger(bet) || bet < 1 || bet > MAX_BET)
        return { ok: false, reason: 'invalid_bet' };
    const symbols = [rollSlotSymbol(), rollSlotSymbol(), rollSlotSymbol()];
    const isTriple = symbols[0].emoji === symbols[1].emoji && symbols[1].emoji === symbols[2].emoji;
    const isPair = !isTriple && (symbols[0].emoji === symbols[1].emoji || symbols[0].emoji === symbols[2].emoji || symbols[1].emoji === symbols[2].emoji);
    const winningSymbol = isTriple ? symbols[0] : undefined;
    const multiplier = winningSymbol?.multiplier ?? (isPair ? 1 : 0);
    const payout = multiplier * bet;
    const outcome = isTriple ? 'triple' : isPair ? 'pair' : 'miss';
    const reels = [symbols[0].emoji, symbols[1].emoji, symbols[2].emoji];
    const message = outcome === 'triple'
        ? `🎉 ¡Tres ${winningSymbol.emoji}! Premio total **×${multiplier}** (incluye la apuesta): **${payout.toLocaleString('es-MX')} monedas**.`
        : outcome === 'pair' ? '✨ Dos símbolos iguales: recuperas tu apuesta.' : 'Esta vez no hubo combinación. La apuesta se perdió.';
    const at = nowSeconds();
    if (economyPool)
        return withEconomyTransaction(async (connection) => {
            const account = await mysqlEnsureAccount(connection, guildId, userId, true);
            if (account.balance < bet)
                return { ok: false, reason: 'insufficient_funds' };
            await connection.execute('UPDATE economy_accounts SET balance=balance-?+?,updated_at=? WHERE guild_id=? AND user_id=?', [bet, payout, at, guildId, userId]);
            await mysqlAddLedger(connection, guildId, userId, -bet, 'slots:bet', `${reference}:bet`, at);
            if (payout)
                await mysqlAddLedger(connection, guildId, userId, payout, `slots:${outcome}:payout`, `${reference}:payout`, at);
            return { ok: true, balance: account.balance - bet + payout, bet, reels, outcome, multiplier, payout, message };
        });
    const spin = db.transaction(() => {
        const account = sqliteEnsureAccount(guildId, userId);
        if (account.balance < bet)
            return { ok: false, reason: 'insufficient_funds' };
        db.prepare('UPDATE economy_accounts SET balance=balance-?+?,updated_at=? WHERE guild_id=? AND user_id=?').run(bet, payout, at, guildId, userId);
        const ledger = db.prepare('INSERT INTO economy_ledger (guild_id,user_id,amount,reason,reference,created_at) VALUES (?,?,?,?,?,?)');
        ledger.run(guildId, userId, -bet, 'slots:bet', `${reference}:bet`, at);
        if (payout)
            ledger.run(guildId, userId, payout, `slots:${outcome}:payout`, `${reference}:payout`, at);
        return { ok: true, balance: account.balance - bet + payout, bet, reels, outcome, multiplier, payout, message };
    });
    return spin.immediate();
}
export async function playItemRoulette(guildId, userId, itemId, choice, reference) {
    guildId = GLOBAL_SCOPE_ID;
    const item = storeItems.find((candidate) => candidate.id === itemId && candidate.usable);
    if (!item)
        return { ok: false, reason: 'invalid_item' };
    const number = randomInt(37);
    const result = number === 0 ? 'verde' : redNumbers.has(number) ? 'rojo' : 'negro';
    const payout = choice === result ? item.cost * (choice === 'verde' ? 36 : 2) : 0;
    const message = payout
        ? `La bola cayó en **${number} ${result}**. Tu **${item.name}** acertó la apuesta.`
        : `La bola cayó en **${number} ${result}**. Perdiste tu **${item.name}**; la apuesta no devuelve el artículo.`;
    if (economyPool)
        return withEconomyTransaction(async (connection) => {
            const account = await mysqlEnsureAccount(connection, guildId, userId, true);
            const [items] = await connection.execute('SELECT quantity FROM economy_inventory WHERE guild_id = ? AND user_id = ? AND item_id = ? FOR UPDATE', [guildId, userId, itemId]);
            const quantity = Number(items[0]?.quantity ?? 0);
            if (quantity < 1)
                return { ok: false, reason: 'missing_item' };
            await connection.execute('UPDATE economy_inventory SET quantity = quantity - 1 WHERE guild_id = ? AND user_id = ? AND item_id = ?', [guildId, userId, itemId]);
            await connection.execute('DELETE FROM economy_inventory WHERE guild_id = ? AND user_id = ? AND item_id = ? AND quantity <= 0', [guildId, userId, itemId]);
            const now = nowSeconds();
            await insertItemLedger(connection, { guildId, userId, itemId, quantityDelta: -1, reason: 'roulette_item_bet', reference: `${reference}:item`, createdAt: now });
            if (payout) {
                await connection.execute('UPDATE economy_accounts SET balance = balance + ?, updated_at = ? WHERE guild_id = ? AND user_id = ?', [payout, now, guildId, userId]);
                await mysqlAddLedger(connection, guildId, userId, payout, `roulette_item:${itemId}`, `${reference}:payout`, now);
            }
            return { ok: true, itemName: item.name, number, result, payout, balance: account.balance + payout, message };
        });
    const spin = db.transaction(() => {
        const account = sqliteEnsureAccount(guildId, userId);
        const inventory = db.prepare('SELECT quantity FROM economy_inventory WHERE guild_id = ? AND user_id = ? AND item_id = ?')
            .get(guildId, userId, itemId);
        if (!inventory || inventory.quantity < 1)
            return { ok: false, reason: 'missing_item' };
        db.prepare('UPDATE economy_inventory SET quantity = quantity - 1 WHERE guild_id = ? AND user_id = ? AND item_id = ?').run(guildId, userId, itemId);
        db.prepare('DELETE FROM economy_inventory WHERE guild_id = ? AND user_id = ? AND item_id = ? AND quantity <= 0').run(guildId, userId, itemId);
        const now = nowSeconds();
        db.prepare('INSERT INTO economy_item_ledger (guild_id, user_id, item_id, quantity_delta, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .run(guildId, userId, itemId, -1, 'roulette_item_bet', `${reference}:item`, now);
        if (payout) {
            db.prepare('UPDATE economy_accounts SET balance = balance + ?, updated_at = ? WHERE guild_id = ? AND user_id = ?').run(payout, now, guildId, userId);
            db.prepare('INSERT INTO economy_ledger (guild_id, user_id, amount, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?)')
                .run(guildId, userId, payout, `roulette_item:${itemId}`, `${reference}:payout`, now);
        }
        return { ok: true, itemName: item.name, number, result, payout, balance: account.balance + payout, message };
    });
    return spin.immediate();
}
function consumeItemSqlite(guildId, userId, itemId, reference, reason, now) {
    const row = db.prepare('SELECT quantity FROM economy_inventory WHERE guild_id = ? AND user_id = ? AND item_id = ?')
        .get(guildId, userId, itemId);
    if (!row || row.quantity < 1)
        return false;
    db.prepare('UPDATE economy_inventory SET quantity = quantity - 1 WHERE guild_id = ? AND user_id = ? AND item_id = ?').run(guildId, userId, itemId);
    db.prepare('DELETE FROM economy_inventory WHERE guild_id = ? AND user_id = ? AND item_id = ? AND quantity <= 0').run(guildId, userId, itemId);
    db.prepare('INSERT INTO economy_item_ledger (guild_id, user_id, item_id, quantity_delta, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(guildId, userId, itemId, -1, reason, reference, now);
    return true;
}
export async function useShopItem(guildId, userId, itemId, reference) {
    guildId = GLOBAL_SCOPE_ID;
    const item = storeItems.find((candidate) => candidate.id === itemId && candidate.usable);
    if (!item)
        return { ok: false, reason: 'invalid_item' };
    const caught = randomInt(100) < 70;
    const rare = caught && randomInt(100) < 5;
    const fishName = pick(rare ? fishRare : fishCommon);
    const amount = caught ? (rare ? 50 + randomInt(31) : 12 + randomInt(19)) * 2 : 0;
    const fishMessage = caught
        ? `¡El cebo premium atrajo un **${fishName}**! La captura salió excelente.`
        : 'El cebo premium se gastó, pero los peces no picaron. Inténtalo de nuevo después del enfriamiento.';
    if (economyPool)
        return withEconomyTransaction(async (connection) => {
            const account = await mysqlEnsureAccount(connection, guildId, userId, true);
            const [items] = await connection.execute('SELECT quantity FROM economy_inventory WHERE guild_id = ? AND user_id = ? AND item_id = ? FOR UPDATE', [guildId, userId, itemId]);
            if (Number(items[0]?.quantity ?? 0) < 1)
                return { ok: false, reason: 'missing_item' };
            const now = nowSeconds();
            if (itemId === 'cebo_premium') {
                const [rods] = await connection.execute('SELECT quantity FROM economy_inventory WHERE guild_id = ? AND user_id = ? AND item_id = ? FOR UPDATE', [guildId, userId, 'cana_pescar']);
                if (Number(rods[0]?.quantity ?? 0) < 1)
                    return { ok: false, reason: 'missing_rod' };
                const nextFishAt = (account.lastFishAt ?? 0) + FISH_COOLDOWN_SECONDS;
                if (now < nextFishAt)
                    return { ok: false, reason: 'cooldown', secondsRemaining: nextFishAt - now };
                await connection.execute('UPDATE economy_inventory SET quantity = quantity - 1 WHERE guild_id = ? AND user_id = ? AND item_id = ?', [guildId, userId, itemId]);
                await connection.execute('DELETE FROM economy_inventory WHERE guild_id = ? AND user_id = ? AND item_id = ? AND quantity <= 0', [guildId, userId, itemId]);
                await insertItemLedger(connection, { guildId, userId, itemId, quantityDelta: -1, reason: 'use_premium_bait', reference: `${reference}:item`, createdAt: now });
                await connection.execute('UPDATE economy_accounts SET balance = balance + ?, last_fish_at = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?', [amount, now, now, guildId, userId]);
                if (amount)
                    await mysqlAddLedger(connection, guildId, userId, amount, rare ? 'fish_rare:premium_bait' : 'fish:premium_bait', `${reference}:payout`, now);
                return { ok: true, kind: 'fish', balance: account.balance + amount, amount, message: fishMessage };
            }
            const protectedUntil = Math.max(account.robProtectedUntil ?? now, now) + ROB_SHIELD_SECONDS;
            await connection.execute('UPDATE economy_inventory SET quantity = quantity - 1 WHERE guild_id = ? AND user_id = ? AND item_id = ?', [guildId, userId, itemId]);
            await connection.execute('DELETE FROM economy_inventory WHERE guild_id = ? AND user_id = ? AND item_id = ? AND quantity <= 0', [guildId, userId, itemId]);
            await insertItemLedger(connection, { guildId, userId, itemId, quantityDelta: -1, reason: 'activate_robbery_shield', reference: `${reference}:item`, createdAt: now });
            await connection.execute('UPDATE economy_accounts SET rob_protected_until = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?', [protectedUntil, now, guildId, userId]);
            return { ok: true, kind: 'shield', protectedUntil,
                message: `🛡️ Escudo activo hasta <t:${protectedUntil}:F>. Los intentos de robo contra ti serán bloqueados.` };
        });
    const use = db.transaction(() => {
        const account = sqliteEnsureAccount(guildId, userId);
        const now = nowSeconds();
        if (itemId === 'cebo_premium') {
            const rod = db.prepare('SELECT quantity FROM economy_inventory WHERE guild_id = ? AND user_id = ? AND item_id = ?')
                .get(guildId, userId, 'cana_pescar');
            if (!rod || rod.quantity < 1)
                return { ok: false, reason: 'missing_rod' };
            const nextFishAt = (account.lastFishAt ?? 0) + FISH_COOLDOWN_SECONDS;
            if (now < nextFishAt)
                return { ok: false, reason: 'cooldown', secondsRemaining: nextFishAt - now };
            if (!consumeItemSqlite(guildId, userId, itemId, `${reference}:item`, 'use_premium_bait', now))
                return { ok: false, reason: 'missing_item' };
            db.prepare('UPDATE economy_accounts SET balance = balance + ?, last_fish_at = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?').run(amount, now, now, guildId, userId);
            if (amount)
                db.prepare('INSERT INTO economy_ledger (guild_id, user_id, amount, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?)')
                    .run(guildId, userId, amount, rare ? 'fish_rare:premium_bait' : 'fish:premium_bait', `${reference}:payout`, now);
            return { ok: true, kind: 'fish', balance: account.balance + amount, amount, message: fishMessage };
        }
        if (!consumeItemSqlite(guildId, userId, itemId, `${reference}:item`, 'activate_robbery_shield', now))
            return { ok: false, reason: 'missing_item' };
        const protectedUntil = Math.max(account.robProtectedUntil ?? now, now) + ROB_SHIELD_SECONDS;
        db.prepare('UPDATE economy_accounts SET rob_protected_until = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?').run(protectedUntil, now, guildId, userId);
        return { ok: true, kind: 'shield', protectedUntil,
            message: `🛡️ Escudo activo hasta <t:${protectedUntil}:F>. Los intentos de robo contra ti serán bloqueados.` };
    });
    return use.immediate();
}
function makeDeck() {
    const suits = ['♠', '♥', '♦', '♣'];
    const ranks = [
        { rank: 'A', value: 11 }, { rank: '2', value: 2 }, { rank: '3', value: 3 }, { rank: '4', value: 4 },
        { rank: '5', value: 5 }, { rank: '6', value: 6 }, { rank: '7', value: 7 }, { rank: '8', value: 8 },
        { rank: '9', value: 9 }, { rank: '10', value: 10 }, { rank: 'J', value: 10 }, { rank: 'Q', value: 10 }, { rank: 'K', value: 10 },
    ];
    const deck = suits.flatMap((suit) => ranks.map(({ rank, value }) => ({ rank, suit, value })));
    for (let i = deck.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}
function drawCard(state) {
    if (!state.deck.length)
        state.deck = makeDeck();
    return state.deck.pop();
}
function total(cards) {
    let value = cards.reduce((sum, card) => sum + card.value, 0);
    let aces = cards.filter((card) => card.rank === 'A').length;
    while (value > 21 && aces > 0) {
        value -= 10;
        aces--;
    }
    return value;
}
function cardText(card) { return `**${card.rank}${card.suit}**`; }
function effectiveCardValues(cards) {
    const values = cards.map((card) => card.value);
    let sum = values.reduce((value, cardValue) => value + cardValue, 0);
    for (let index = 0; sum > 21 && index < cards.length; index++) {
        if (cards[index]?.rank === 'A') {
            values[index] = 1;
            sum -= 10;
        }
    }
    return values;
}
function isBlackjackFinished(state) { return state.status === 'finished'; }
function blackjackView(gameId, bet, balance, state, lastDrawnCard) {
    const dealerCards = state.status === 'active'
        ? [cardText(state.dealerCards[0]), '🂠']
        : state.dealerCards.map(cardText);
    return {
        gameId, bet, balance,
        playerCards: state.playerCards.map(cardText),
        playerCardValues: effectiveCardValues(state.playerCards),
        ...(lastDrawnCard ? { lastDrawnCard: cardText(lastDrawnCard) } : {}),
        dealerCards,
        playerTotal: total(state.playerCards),
        ...(isBlackjackFinished(state) ? { dealerTotal: total(state.dealerCards) } : {}),
        status: state.status,
        ...(state.outcome ? { outcome: state.outcome } : {}),
        payout: state.payout,
        ...(state.resultText ? { resultText: state.resultText } : {}),
    };
}
function settleBlackjack(state, outcome, payout, resultText) {
    state.status = 'finished';
    state.outcome = outcome;
    state.payout = payout;
    state.resultText = resultText;
}
function openingBlackjackSettlement(state, bet) {
    const playerNatural = total(state.playerCards) === 21;
    const dealerNatural = total(state.dealerCards) === 21;
    if (playerNatural && dealerNatural)
        settleBlackjack(state, 'push', bet, 'Ambos abrieron con 21. Recuperas tu apuesta.');
    else if (playerNatural)
        settleBlackjack(state, 'win', Math.floor(bet * 2.5), '¡Blackjack natural! La mesa paga 3:2.');
    else if (dealerNatural)
        settleBlackjack(state, 'lose', 0, 'El crupier abrió con blackjack. Esta mano se pierde.');
}
function settleAfterTurn(state, bet) {
    const playerTotal = total(state.playerCards);
    if (playerTotal > 21) {
        settleBlackjack(state, 'lose', 0, `Te pasaste con **${playerTotal}**. ${pick(blackjackLoseLines)}`);
        return;
    }
    while (total(state.dealerCards) < 17)
        state.dealerCards.push(drawCard(state));
    const dealerTotal = total(state.dealerCards);
    if (dealerTotal > 21 || playerTotal > dealerTotal)
        settleBlackjack(state, 'win', bet * 2, pick(blackjackWinLines));
    else if (playerTotal === dealerTotal)
        settleBlackjack(state, 'push', bet, `Empate con **${playerTotal}**. Recuperas tu apuesta.`);
    else
        settleBlackjack(state, 'lose', 0, `${pick(blackjackLoseLines)} Tu mano: **${playerTotal}** · crupier: **${dealerTotal}**.`);
}
export async function startBlackjack(guildId, userId, bet, reference) {
    guildId = GLOBAL_SCOPE_ID;
    if (!Number.isSafeInteger(bet) || bet < 1 || bet > MAX_BET)
        return { ok: false, reason: 'invalid_bet' };
    const gameId = randomBytes(12).toString('hex');
    const begin = (account) => {
        const state = { deck: makeDeck(), playerCards: [], dealerCards: [], status: 'active', payout: 0 };
        state.playerCards.push(drawCard(state), drawCard(state));
        state.dealerCards.push(drawCard(state), drawCard(state));
        openingBlackjackSettlement(state, bet);
        return { account, state };
    };
    if (economyPool)
        return withEconomyTransaction(async (connection) => {
            const account = await mysqlEnsureAccount(connection, guildId, userId, true);
            const active = await mysqlRows(connection, "SELECT id, bet, state_json, status FROM economy_games WHERE guild_id = ? AND user_id = ? AND game_type = 'blackjack' AND status = 'active' LIMIT 1 FOR UPDATE", [guildId, userId]);
            if (active[0]) {
                return { ok: true, view: blackjackView(active[0].id, Number(active[0].bet), account.balance, JSON.parse(active[0].state_json)), existing: true };
            }
            if (account.balance < bet)
                return { ok: false, reason: 'insufficient_funds' };
            const { state } = begin(account);
            const now = nowSeconds();
            let balance = account.balance - bet;
            await connection.execute('UPDATE economy_accounts SET balance = balance - ?, updated_at = ? WHERE guild_id = ? AND user_id = ?', [bet, now, guildId, userId]);
            await mysqlAddLedger(connection, guildId, userId, -bet, 'blackjack:bet', `${reference}:bet`, now);
            if (state.payout) {
                balance += state.payout;
                await connection.execute('UPDATE economy_accounts SET balance = balance + ?, updated_at = ? WHERE guild_id = ? AND user_id = ?', [state.payout, now, guildId, userId]);
                await mysqlAddLedger(connection, guildId, userId, state.payout, 'blackjack:payout', `${reference}:payout`, now);
            }
            await connection.execute('INSERT INTO economy_games (id, guild_id, user_id, game_type, bet, status, state_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [gameId, guildId, userId, 'blackjack', bet, state.status, JSON.stringify(state), now, now]);
            return { ok: true, view: blackjackView(gameId, bet, balance, state), existing: false };
        });
    const start = db.transaction(() => {
        const account = sqliteEnsureAccount(guildId, userId);
        const active = db.prepare("SELECT id, bet, state_json, status FROM economy_games WHERE guild_id = ? AND user_id = ? AND game_type = 'blackjack' AND status = 'active' LIMIT 1")
            .get(guildId, userId);
        if (active)
            return { ok: true, view: blackjackView(active.id, active.bet, account.balance, JSON.parse(active.state_json)), existing: true };
        if (account.balance < bet)
            return { ok: false, reason: 'insufficient_funds' };
        const { state } = begin(account);
        const now = nowSeconds();
        let balance = account.balance - bet;
        db.prepare('UPDATE economy_accounts SET balance = balance - ?, updated_at = ? WHERE guild_id = ? AND user_id = ?').run(bet, now, guildId, userId);
        db.prepare('INSERT INTO economy_ledger (guild_id, user_id, amount, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(guildId, userId, -bet, 'blackjack:bet', `${reference}:bet`, now);
        if (state.payout) {
            balance += state.payout;
            db.prepare('UPDATE economy_accounts SET balance = balance + ?, updated_at = ? WHERE guild_id = ? AND user_id = ?').run(state.payout, now, guildId, userId);
            db.prepare('INSERT INTO economy_ledger (guild_id, user_id, amount, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(guildId, userId, state.payout, 'blackjack:payout', `${reference}:payout`, now);
        }
        db.prepare('INSERT INTO economy_games (id, guild_id, user_id, game_type, bet, status, state_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .run(gameId, guildId, userId, 'blackjack', bet, state.status, JSON.stringify(state), now, now);
        return { ok: true, view: blackjackView(gameId, bet, balance, state), existing: false };
    });
    return start.immediate();
}
export async function playBlackjackTurn(guildId, userId, gameId, action) {
    guildId = GLOBAL_SCOPE_ID;
    if (economyPool)
        return withEconomyTransaction(async (connection) => {
            const account = await mysqlEnsureAccount(connection, guildId, userId, true);
            const games = await mysqlRows(connection, 'SELECT id, bet, state_json, status FROM economy_games WHERE id = ? AND guild_id = ? AND user_id = ? FOR UPDATE', [gameId, guildId, userId]);
            const game = games[0];
            if (!game)
                return undefined;
            const state = JSON.parse(game.state_json);
            if (game.status !== 'active' || state.status !== 'active')
                return blackjackView(game.id, Number(game.bet), account.balance, state);
            let lastDrawnCard;
            if (action === 'hit') {
                lastDrawnCard = drawCard(state);
                state.playerCards.push(lastDrawnCard);
            }
            else
                settleAfterTurn(state, Number(game.bet));
            if (action === 'hit' && total(state.playerCards) > 21)
                settleAfterTurn(state, Number(game.bet));
            const now = nowSeconds();
            let balance = account.balance;
            if (isBlackjackFinished(state) && state.payout) {
                balance += state.payout;
                await connection.execute('UPDATE economy_accounts SET balance = balance + ?, updated_at = ? WHERE guild_id = ? AND user_id = ?', [state.payout, now, guildId, userId]);
                await mysqlAddLedger(connection, guildId, userId, state.payout, 'blackjack:payout', `${game.id}:payout`, now);
            }
            await connection.execute('UPDATE economy_games SET status = ?, state_json = ?, updated_at = ? WHERE id = ?', [state.status, JSON.stringify(state), now, game.id]);
            return blackjackView(game.id, Number(game.bet), balance, state, lastDrawnCard);
        });
    const play = db.transaction(() => {
        const account = sqliteEnsureAccount(guildId, userId);
        const game = db.prepare('SELECT id, bet, state_json, status FROM economy_games WHERE id = ? AND guild_id = ? AND user_id = ?')
            .get(gameId, guildId, userId);
        if (!game)
            return undefined;
        const state = JSON.parse(game.state_json);
        if (game.status !== 'active' || state.status !== 'active')
            return blackjackView(game.id, game.bet, account.balance, state);
        let lastDrawnCard;
        if (action === 'hit') {
            lastDrawnCard = drawCard(state);
            state.playerCards.push(lastDrawnCard);
        }
        else
            settleAfterTurn(state, game.bet);
        if (action === 'hit' && total(state.playerCards) > 21)
            settleAfterTurn(state, game.bet);
        const now = nowSeconds();
        let balance = account.balance;
        if (isBlackjackFinished(state) && state.payout) {
            balance += state.payout;
            db.prepare('UPDATE economy_accounts SET balance = balance + ?, updated_at = ? WHERE guild_id = ? AND user_id = ?').run(state.payout, now, guildId, userId);
            db.prepare('INSERT INTO economy_ledger (guild_id, user_id, amount, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(guildId, userId, state.payout, 'blackjack:payout', `${game.id}:payout`, now);
        }
        db.prepare('UPDATE economy_games SET status = ?, state_json = ?, updated_at = ? WHERE id = ?').run(state.status, JSON.stringify(state), now, game.id);
        return blackjackView(game.id, game.bet, balance, state, lastDrawnCard);
    });
    return play.immediate();
}
export async function getInventory(guildId, userId) {
    guildId = GLOBAL_SCOPE_ID;
    if (economyPool) {
        const [rows] = await economyPool.execute('SELECT item_id AS itemId, quantity, acquired_at AS acquiredAt FROM economy_inventory WHERE guild_id = ? AND user_id = ? AND quantity > 0 ORDER BY acquired_at DESC', [guildId, userId]);
        return rows.map((row) => ({ itemId: String(row.itemId), quantity: Number(row.quantity), acquiredAt: Number(row.acquiredAt) }));
    }
    return db.prepare('SELECT item_id AS itemId, quantity, acquired_at AS acquiredAt FROM economy_inventory WHERE guild_id = ? AND user_id = ? AND quantity > 0 ORDER BY acquired_at DESC')
        .all(guildId, userId);
}
export async function getLeaderboard(guildId, limit = 10) {
    guildId = GLOBAL_SCOPE_ID;
    if (economyPool) {
        const [rows] = await economyPool.execute('SELECT user_id AS userId, balance + bank_balance AS balance FROM economy_accounts WHERE guild_id = ? ORDER BY balance + bank_balance DESC, user_id ASC LIMIT ?', [guildId, limit]);
        return rows.map((row) => ({ userId: String(row.userId), balance: Number(row.balance) }));
    }
    return db.prepare('SELECT user_id AS userId, balance + bank_balance AS balance FROM economy_accounts WHERE guild_id = ? ORDER BY balance + bank_balance DESC, user_id ASC LIMIT ?')
        .all(guildId, limit);
}
export function formatCooldown(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.ceil((seconds % 3600) / 60);
    return hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`;
}
export const storeItems = [
    { id: 'cebo_premium', name: 'Cebo premium', description: 'Duplica el premio de una pesca. Requiere una caña y respeta el enfriamiento normal.', cost: 15, emoji: '🪱', category: 'consumables', repeatable: true, usable: true },
    { id: 'escudo_antirrobo', name: 'Escudo antirrobo', description: 'Úsalo para bloquear robos contra ti durante 24 horas. Puedes extender la protección con otro escudo.', cost: 320, emoji: '🛡️', category: 'consumables', repeatable: true, usable: true },
    { id: 'cana_pescar', name: 'Caña de pescar', description: 'Herramienta duradera para pescar y trabajar como pescador. Necesaria para usar a!fish.', cost: 75, emoji: '🎣', category: 'jobs', repeatable: false, usable: false },
    { id: 'pico', name: 'Pico de minero', description: 'Herramienta duradera que necesitas para trabajar como minero.', cost: 75, emoji: '⛏️', category: 'jobs', repeatable: false, usable: false },
    { id: 'hacha', name: 'Hacha de leñador', description: 'Herramienta duradera que necesitas para trabajar como leñador.', cost: 70, emoji: '🪓', category: 'jobs', repeatable: false, usable: false },
    { id: 'azada', name: 'Azada de agricultor', description: 'Herramienta duradera que necesitas para trabajar como agricultor.', cost: 60, emoji: '🌱', category: 'jobs', repeatable: false, usable: false },
    { id: 'mochila_repartidor', name: 'Mochila de reparto', description: 'Herramienta duradera que necesitas para trabajar como repartidor.', cost: 60, emoji: '🎒', category: 'jobs', repeatable: false, usable: false },
    { id: 'kit_cocinero', name: 'Kit de cocina', description: 'Herramienta duradera que necesitas para trabajar como cocinero.', cost: 70, emoji: '🍳', category: 'jobs', repeatable: false, usable: false },
];
