import { GLOBAL_SCOPE_ID } from '../storage/global-scope.js';
import { randomBytes, randomInt } from 'node:crypto';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { db } from '../storage/database.js';
import { economyPool, insertItemLedger, insertLedger, withEconomyTransaction } from '../storage/economy-database.js';

export const DAILY_AMOUNT = 100;
const DAILY_COOLDOWN_SECONDS = 24 * 60 * 60;
const WORK_COOLDOWN_SECONDS = 45 * 60;
const FISH_COOLDOWN_SECONDS = 30 * 60;
const ROB_COOLDOWN_SECONDS = 2 * 60 * 60;
const CRIME_COOLDOWN_SECONDS = 2 * 60 * 60;
const BANK_INTEREST_INTERVAL_SECONDS = 24 * 60 * 60;
const BANK_INTEREST_BASIS_POINTS = 10;
const BANK_MAX_ACCRUAL_DAYS = 30;
const ROB_SHIELD_SECONDS = 24 * 60 * 60;
const MAX_BET = 100_000;

type AccountRow = {
  balance: number;
  bankBalance: number;
  premiumBalance: number;
  lastDailyAt: number | null;
  lastWorkAt: number | null;
  lastFishAt: number | null;
  lastRobAt: number | null;
  lastCrimeAt: number | null;
  lastBankInterestAt: number | null;
  bankInterestRemainder: number;
  robProtectedUntil: number | null;
};
type MysqlAccountRow = RowDataPacket & AccountRow;
type BlackjackCard = { rank: string; suit: string; value: number };
type BlackjackState = {
  deck: BlackjackCard[];
  playerCards: BlackjackCard[];
  dealerCards: BlackjackCard[];
  status: 'active' | 'finished';
  outcome?: 'win' | 'lose' | 'push';
  payout: number;
  resultText?: string;
};
export type BlackjackView = {
  gameId: string;
  bet: number;
  balance: number;
  playerCards: string[];
  dealerCards: string[];
  playerTotal: number;
  dealerTotal?: number;
  status: 'active' | 'finished';
  outcome?: 'win' | 'lose' | 'push';
  payout: number;
  resultText?: string;
};
type MysqlGameRow = RowDataPacket & { id: string; bet: number; state_json: string; status: string };

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

function nowSeconds(): number { return Math.floor(Date.now() / 1000); }
function pick<T>(items: readonly T[]): T { return items[randomInt(items.length)]!; }
function formatMessage(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''));
}

function sqliteEnsureAccount(guildId: string, userId: string): AccountRow {
  const now = nowSeconds();
  db.prepare('INSERT OR IGNORE INTO economy_accounts (guild_id, user_id, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run(guildId, userId, now, now);
  const row = db.prepare(`SELECT balance, bank_balance AS bankBalance, premium_balance AS premiumBalance,
      last_daily_at AS lastDailyAt, last_work_at AS lastWorkAt,
      last_fish_at AS lastFishAt, last_rob_at AS lastRobAt, last_crime_at AS lastCrimeAt,
      last_bank_interest_at AS lastBankInterestAt, bank_interest_remainder AS bankInterestRemainder,
      rob_protected_until AS robProtectedUntil
    FROM economy_accounts WHERE guild_id = ? AND user_id = ?`).get(guildId, userId) as AccountRow;
  return row;
}

async function mysqlRows<T extends RowDataPacket[]>(
  connection: PoolConnection,
  sql: string,
  values: unknown[] = [],
): Promise<T> {
  const [rows] = await connection.execute<T>(sql, values as never[]);
  return rows;
}

async function mysqlEnsureAccount(connection: PoolConnection, guildId: string, userId: string, lock = false): Promise<AccountRow> {
  const now = nowSeconds();
  await connection.execute(
    'INSERT IGNORE INTO economy_accounts (guild_id, user_id, created_at, updated_at) VALUES (?, ?, ?, ?)',
    [guildId, userId, now, now],
  );
  const rows = await mysqlRows<MysqlAccountRow[]>(connection,
    `SELECT balance, bank_balance AS bankBalance, premium_balance AS premiumBalance,
       last_daily_at AS lastDailyAt, last_work_at AS lastWorkAt,
       last_fish_at AS lastFishAt, last_rob_at AS lastRobAt, last_crime_at AS lastCrimeAt,
       last_bank_interest_at AS lastBankInterestAt, bank_interest_remainder AS bankInterestRemainder,
       rob_protected_until AS robProtectedUntil
     FROM economy_accounts WHERE guild_id = ? AND user_id = ?${lock ? ' FOR UPDATE' : ''}`,
    [guildId, userId],
  );
  const row = rows[0];
  if (!row) throw new Error('No pude cargar la cuenta de economía.');
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

async function mysqlAddLedger(connection: PoolConnection, guildId: string, userId: string, amount: number, reason: string, reference: string | null, at = nowSeconds()): Promise<void> {
  await insertLedger(connection, { guildId, userId, amount, reason, reference, createdAt: at });
}

export async function getAccountBalances(guildId: string, userId: string): Promise<{ wallet: number; bank: number; total: number; premium: number }> {
  guildId = GLOBAL_SCOPE_ID;
  if (economyPool) {
    const connection = await economyPool.getConnection();
    try {
      const account = await mysqlEnsureAccount(connection, guildId, userId);
      return { wallet: account.balance, bank: account.bankBalance, total: account.balance + account.bankBalance, premium: account.premiumBalance };
    }
    finally { connection.release(); }
  }
  const account = sqliteEnsureAccount(guildId, userId);
  return { wallet: account.balance, bank: account.bankBalance, total: account.balance + account.bankBalance, premium: account.premiumBalance };
}

export async function getBalance(guildId: string, userId: string): Promise<number> {
  guildId = GLOBAL_SCOPE_ID;
  return (await getAccountBalances(guildId, userId)).wallet;
}

export async function adjustPremiumCurrency(guildId: string, userId: string, amount: number, adminId: string, reference: string): Promise<
  | { ok: true; balance: number }
  | { ok: false; reason: 'invalid_amount' | 'insufficient_premium'; balance: number }
> {
  guildId = GLOBAL_SCOPE_ID;
  if (!Number.isSafeInteger(amount) || amount === 0 || Math.abs(amount) > 1_000_000) return { ok: false, reason: 'invalid_amount', balance: 0 };
  const at = nowSeconds();
  const reason = `premium_admin:${adminId}`;
  if (economyPool) return withEconomyTransaction(async (connection) => {
    const account = await mysqlEnsureAccount(connection, guildId, userId, true);
    if (amount < 0 && account.premiumBalance < -amount) return { ok: false as const, reason: 'insufficient_premium' as const, balance: account.premiumBalance };
    await connection.execute('UPDATE economy_accounts SET premium_balance=premium_balance+?,updated_at=? WHERE guild_id=? AND user_id=?', [amount, at, guildId, userId]);
    await mysqlAddLedger(connection, guildId, userId, amount, reason, reference, at);
    return { ok: true as const, balance: account.premiumBalance + amount };
  });
  const run = db.transaction(() => {
    const account = sqliteEnsureAccount(guildId, userId);
    if (amount < 0 && account.premiumBalance < -amount) return { ok: false as const, reason: 'insufficient_premium' as const, balance: account.premiumBalance };
    db.prepare('UPDATE economy_accounts SET premium_balance=premium_balance+?,updated_at=? WHERE guild_id=? AND user_id=?').run(amount, at, guildId, userId);
    db.prepare('INSERT INTO economy_ledger (guild_id,user_id,amount,reason,reference,created_at) VALUES (?,?,?,?,?,?)').run(guildId, userId, amount, reason, reference, at);
    return { ok: true as const, balance: account.premiumBalance + amount };
  });
  return run.immediate();
}

type BankAction = 'view' | 'deposit' | 'withdraw';
export type BankResult = {
  ok: boolean;
  reason?: 'invalid_amount' | 'insufficient_wallet' | 'insufficient_bank';
  balance: number;
  bankBalance: number;
  interestEarned: number;
  nextInterestAt: number;
};

function calculateBankInterest(account: AccountRow, now: number) {
  const lastAt = account.lastBankInterestAt ?? now;
  const periods = Math.min(BANK_MAX_ACCRUAL_DAYS,
    Math.max(0, Math.floor((now - lastAt) / BANK_INTEREST_INTERVAL_SECONDS)));
  let bankBalance = account.bankBalance;
  let remainder = account.bankInterestRemainder;
  for (let day = 0; day < periods; day++) {
    const numerator = bankBalance * BANK_INTEREST_BASIS_POINTS + remainder;
    const earned = Math.floor(numerator / 10_000);
    remainder = numerator % 10_000;
    bankBalance += earned;
  }
  const nextInterestAt = periods ? lastAt + periods * BANK_INTEREST_INTERVAL_SECONDS : lastAt;
  return { periods, bankBalance, remainder, interestEarned: bankBalance - account.bankBalance, nextInterestAt };
}

async function accrueBankInterestMysql(connection: PoolConnection, guildId: string, userId: string, account: AccountRow, now: number) {
  const accrued = calculateBankInterest(account, now);
  await connection.execute(`UPDATE economy_accounts SET bank_balance = ?, bank_interest_remainder = ?,
    last_bank_interest_at = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?`,
  [accrued.bankBalance, accrued.remainder, accrued.nextInterestAt, now, guildId, userId]);
  if (accrued.interestEarned > 0) {
    await mysqlAddLedger(connection, guildId, userId, accrued.interestEarned, 'bank:interest',
      `bank-interest:${guildId}:${userId}:${accrued.nextInterestAt}`, now);
  }
  return accrued;
}

function accrueBankInterestSqlite(guildId: string, userId: string, account: AccountRow, now: number) {
  const accrued = calculateBankInterest(account, now);
  db.prepare(`UPDATE economy_accounts SET bank_balance = ?, bank_interest_remainder = ?,
    last_bank_interest_at = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?`)
    .run(accrued.bankBalance, accrued.remainder, accrued.nextInterestAt, now, guildId, userId);
  if (accrued.interestEarned > 0) {
    db.prepare('INSERT INTO economy_ledger (guild_id, user_id, amount, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(guildId, userId, accrued.interestEarned, 'bank:interest',
        `bank-interest:${guildId}:${userId}:${accrued.nextInterestAt}`, now);
  }
  return accrued;
}

export async function bankAction(guildId: string, userId: string, action: BankAction, amount = 0, reference = ''): Promise<BankResult> {
  guildId = GLOBAL_SCOPE_ID;
  if (action !== 'view' && (!Number.isSafeInteger(amount) || amount <= 0)) {
    return { ok: false, reason: 'invalid_amount', balance: 0, bankBalance: 0, interestEarned: 0, nextInterestAt: nowSeconds() };
  }
  const now = nowSeconds();
  if (economyPool) return withEconomyTransaction(async (connection) => {
    const account = await mysqlEnsureAccount(connection, guildId, userId, true);
    const accrued = await accrueBankInterestMysql(connection, guildId, userId, account, now);
    const bankBalance = accrued.bankBalance;
    let balance = account.balance;
    let nextBankBalance = bankBalance;
    if (action === 'deposit') {
      if (balance < amount) return { ok: false, reason: 'insufficient_wallet', balance, bankBalance, interestEarned: accrued.interestEarned, nextInterestAt: accrued.nextInterestAt };
      balance -= amount;
      nextBankBalance += amount;
      await connection.execute('UPDATE economy_accounts SET balance = ?, bank_balance = ?, last_bank_interest_at = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?',
        [balance, nextBankBalance, now, now, guildId, userId]);
      await mysqlAddLedger(connection, guildId, userId, -amount, 'bank:deposit:wallet', `${reference}:wallet`, now);
      await mysqlAddLedger(connection, guildId, userId, amount, 'bank:deposit:vault', `${reference}:vault`, now);
    } else if (action === 'withdraw') {
      if (bankBalance < amount) return { ok: false, reason: 'insufficient_bank', balance, bankBalance, interestEarned: accrued.interestEarned, nextInterestAt: accrued.nextInterestAt };
      balance += amount;
      nextBankBalance -= amount;
      await connection.execute('UPDATE economy_accounts SET balance = ?, bank_balance = ?, last_bank_interest_at = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?',
        [balance, nextBankBalance, now, now, guildId, userId]);
      await mysqlAddLedger(connection, guildId, userId, amount, 'bank:withdraw:wallet', `${reference}:wallet`, now);
      await mysqlAddLedger(connection, guildId, userId, -amount, 'bank:withdraw:vault', `${reference}:vault`, now);
    }
    return { ok: true, balance, bankBalance: nextBankBalance, interestEarned: accrued.interestEarned,
      nextInterestAt: (action === 'view' ? accrued.nextInterestAt : now) + BANK_INTEREST_INTERVAL_SECONDS };
  });

  const operate = db.transaction(() => {
    const account = sqliteEnsureAccount(guildId, userId);
    const accrued = accrueBankInterestSqlite(guildId, userId, account, now);
    const bankBalance = accrued.bankBalance;
    let balance = account.balance;
    let nextBankBalance = bankBalance;
    if (action === 'deposit') {
      if (balance < amount) return { ok: false, reason: 'insufficient_wallet' as const, balance, bankBalance, interestEarned: accrued.interestEarned, nextInterestAt: accrued.nextInterestAt };
      balance -= amount;
      nextBankBalance += amount;
      db.prepare('UPDATE economy_accounts SET balance = ?, bank_balance = ?, last_bank_interest_at = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?')
        .run(balance, nextBankBalance, now, now, guildId, userId);
      db.prepare('INSERT INTO economy_ledger (guild_id, user_id, amount, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(guildId, userId, -amount, 'bank:deposit:wallet', `${reference}:wallet`, now);
      db.prepare('INSERT INTO economy_ledger (guild_id, user_id, amount, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(guildId, userId, amount, 'bank:deposit:vault', `${reference}:vault`, now);
    } else if (action === 'withdraw') {
      if (bankBalance < amount) return { ok: false, reason: 'insufficient_bank' as const, balance, bankBalance, interestEarned: accrued.interestEarned, nextInterestAt: accrued.nextInterestAt };
      balance += amount;
      nextBankBalance -= amount;
      db.prepare('UPDATE economy_accounts SET balance = ?, bank_balance = ?, last_bank_interest_at = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?')
        .run(balance, nextBankBalance, now, now, guildId, userId);
      db.prepare('INSERT INTO economy_ledger (guild_id, user_id, amount, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(guildId, userId, amount, 'bank:withdraw:wallet', `${reference}:wallet`, now);
      db.prepare('INSERT INTO economy_ledger (guild_id, user_id, amount, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(guildId, userId, -amount, 'bank:withdraw:vault', `${reference}:vault`, now);
    }
    return { ok: true, balance, bankBalance: nextBankBalance, interestEarned: accrued.interestEarned,
      nextInterestAt: (action === 'view' ? accrued.nextInterestAt : now) + BANK_INTEREST_INTERVAL_SECONDS };
  });
  return operate.immediate();
}

export async function claimDaily(guildId: string, userId: string, reference: string): Promise<
  | { ok: true; balance: number; amount: number }
  | { ok: false; secondsRemaining: number }
> {
  guildId = GLOBAL_SCOPE_ID;
  if (economyPool) return withEconomyTransaction(async (connection) => {
    const account = await mysqlEnsureAccount(connection, guildId, userId, true);
    const now = nowSeconds();
    const nextClaimAt = (account.lastDailyAt ?? 0) + DAILY_COOLDOWN_SECONDS;
    if (now < nextClaimAt) return { ok: false as const, secondsRemaining: nextClaimAt - now };
    await connection.execute('UPDATE economy_accounts SET balance = balance + ?, last_daily_at = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?', [DAILY_AMOUNT, now, now, guildId, userId]);
    await mysqlAddLedger(connection, guildId, userId, DAILY_AMOUNT, 'daily_reward', reference, now);
    return { ok: true as const, balance: account.balance + DAILY_AMOUNT, amount: DAILY_AMOUNT };
  });

  const claim = db.transaction(() => {
    const account = sqliteEnsureAccount(guildId, userId);
    const now = nowSeconds();
    const nextClaimAt = (account.lastDailyAt ?? 0) + DAILY_COOLDOWN_SECONDS;
    if (now < nextClaimAt) return { ok: false as const, secondsRemaining: nextClaimAt - now };
    db.prepare('UPDATE economy_accounts SET balance = balance + ?, last_daily_at = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?').run(DAILY_AMOUNT, now, now, guildId, userId);
    db.prepare('INSERT INTO economy_ledger (guild_id, user_id, amount, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(guildId, userId, DAILY_AMOUNT, 'daily_reward', reference, now);
    return { ok: true as const, balance: account.balance + DAILY_AMOUNT, amount: DAILY_AMOUNT };
  });
  return claim.immediate();
}

export async function purchaseItem(guildId: string, userId: string, itemId: string, reference: string): Promise<
  | { ok: true; balance: number; quantity: number }
  | { ok: false; balance: number; reason: 'insufficient_funds' | 'invalid_item' }
> {
  guildId = GLOBAL_SCOPE_ID;
  const item = storeItems.find((candidate) => candidate.id === itemId);
  if (!item) return { ok: false, balance: 0, reason: 'invalid_item' };
  const cost = item.cost;
  if (economyPool) return withEconomyTransaction(async (connection) => {
    const account = await mysqlEnsureAccount(connection, guildId, userId, true);
    if (account.balance < cost) return { ok: false as const, balance: account.balance, reason: 'insufficient_funds' as const };
    const now = nowSeconds();
    await connection.execute('UPDATE economy_accounts SET balance = balance - ?, updated_at = ? WHERE guild_id = ? AND user_id = ?', [cost, now, guildId, userId]);
    await connection.execute(`INSERT INTO economy_inventory (guild_id, user_id, item_id, quantity, acquired_at) VALUES (?, ?, ?, 1, ?)
      ON DUPLICATE KEY UPDATE quantity = quantity + 1`, [guildId, userId, itemId, now]);
    await mysqlAddLedger(connection, guildId, userId, -cost, `store:${itemId}`, reference, now);
    await insertItemLedger(connection, { guildId, userId, itemId, quantityDelta: 1, reason: 'store_purchase', reference: `${reference}:item`, createdAt: now });
    return { ok: true as const, balance: account.balance - cost, quantity: (await getInventoryQuantityMysql(connection, guildId, userId, itemId)) };
  });

  const purchase = db.transaction(() => {
    const account = sqliteEnsureAccount(guildId, userId);
    if (account.balance < cost) return { ok: false as const, balance: account.balance, reason: 'insufficient_funds' as const };
    const now = nowSeconds();
    db.prepare('UPDATE economy_accounts SET balance = balance - ?, updated_at = ? WHERE guild_id = ? AND user_id = ?').run(cost, now, guildId, userId);
    db.prepare(`INSERT INTO economy_inventory (guild_id, user_id, item_id, quantity, acquired_at) VALUES (?, ?, ?, 1, ?)
      ON CONFLICT (guild_id, user_id, item_id) DO UPDATE SET quantity = quantity + 1`).run(guildId, userId, itemId, now);
    db.prepare('INSERT INTO economy_ledger (guild_id, user_id, amount, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(guildId, userId, -cost, `store:${itemId}`, reference, now);
    db.prepare('INSERT INTO economy_item_ledger (guild_id, user_id, item_id, quantity_delta, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(guildId, userId, itemId, 1, 'store_purchase', `${reference}:item`, now);
    const inventory = db.prepare('SELECT quantity FROM economy_inventory WHERE guild_id = ? AND user_id = ? AND item_id = ?').get(guildId, userId, itemId) as { quantity: number };
    return { ok: true as const, balance: account.balance - cost, quantity: inventory.quantity };
  });
  return purchase.immediate();
}

async function getInventoryQuantityMysql(connection: PoolConnection, guildId: string, userId: string, itemId: string): Promise<number> {
  const [rows] = await connection.execute<RowDataPacket[]>('SELECT quantity FROM economy_inventory WHERE guild_id = ? AND user_id = ? AND item_id = ?', [guildId, userId, itemId]);
  return Number(rows[0]?.quantity ?? 0);
}

export async function work(guildId: string, userId: string, reference: string): Promise<
  | { ok: true; amount: number; balance: number; message: string }
  | { ok: false; secondsRemaining: number }
> {
  guildId = GLOBAL_SCOPE_ID;
  const amount = 25 + randomInt(41);
  const messages = [
    '🧰 Reparaste una nave en el muelle.', '📦 Repartiste paquetes por toda la ciudad.',
    '🍜 Cubriste un turno en el puesto de ramen.', '🪴 Ayudaste en el invernadero.',
    '🧹 Dejaste impecable la plaza.', '🐕 Paseaste una jauría por el barrio.',
    '🔧 Arreglaste una máquina rebelde.', '🎨 Pintaste un mural para el barrio.',
    '☕ Cubriste el turno de la cafetería.', '🚲 Reparaste bicicletas en el taller.',
    '📚 Ordenaste la biblioteca.', '🧁 Vendiste una tanda de postres.',
    '🎟️ Ayudaste en un concierto.', '🪵 Construiste una banca nueva.',
    '🛠️ Terminaste un encargo antes de la hora.', '🌱 Plantaste árboles en el parque.',
    '📻 Reparaste una radio antigua.', '🏪 Cubriste la caja de una tienda.',
    '🧵 Arreglaste un traje para el festival.', '🧭 Guiaste a un grupo que se había perdido.',
  ];

  if (economyPool) return withEconomyTransaction(async (connection) => {
    const account = await mysqlEnsureAccount(connection, guildId, userId, true);
    const now = nowSeconds();
    const nextWorkAt = (account.lastWorkAt ?? 0) + WORK_COOLDOWN_SECONDS;
    if (now < nextWorkAt) return { ok: false as const, secondsRemaining: nextWorkAt - now };
    await connection.execute('UPDATE economy_accounts SET balance = balance + ?, last_work_at = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?', [amount, now, now, guildId, userId]);
    await mysqlAddLedger(connection, guildId, userId, amount, 'work_reward', reference, now);
    return { ok: true as const, amount, balance: account.balance + amount, message: pick(messages) };
  });

  const earn = db.transaction(() => {
    const account = sqliteEnsureAccount(guildId, userId);
    const now = nowSeconds();
    const nextWorkAt = (account.lastWorkAt ?? 0) + WORK_COOLDOWN_SECONDS;
    if (now < nextWorkAt) return { ok: false as const, secondsRemaining: nextWorkAt - now };
    db.prepare('UPDATE economy_accounts SET balance = balance + ?, last_work_at = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?').run(amount, now, now, guildId, userId);
    db.prepare('INSERT INTO economy_ledger (guild_id, user_id, amount, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(guildId, userId, amount, 'work_reward', reference, now);
    return { ok: true as const, amount, balance: account.balance + amount, message: pick(messages) };
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

export async function crime(guildId: string, userId: string, reference: string): Promise<
  | { ok: true; success: boolean; amount: number; balance: number; message: string }
  | { ok: false; secondsRemaining: number }
> {
  guildId = GLOBAL_SCOPE_ID;
  const success = randomInt(100) < 45;
  const now = nowSeconds();
  if (economyPool) return withEconomyTransaction(async (connection) => {
    const account = await mysqlEnsureAccount(connection, guildId, userId, true);
    const nextCrimeAt = (account.lastCrimeAt ?? 0) + CRIME_COOLDOWN_SECONDS;
    if (now < nextCrimeAt) return { ok: false as const, secondsRemaining: nextCrimeAt - now };
    const amount = success
      ? 70 + randomInt(71)
      : Math.min(account.balance, 15 + randomInt(31));
    const signedAmount = success ? amount : -amount;
    const message = formatMessage(pick(success ? crimeSuccessLines : crimeFailLines), { amount });
    await connection.execute('UPDATE economy_accounts SET balance = balance + ?, last_crime_at = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?',
      [signedAmount, now, now, guildId, userId]);
    if (signedAmount) await mysqlAddLedger(connection, guildId, userId, signedAmount, success ? 'crime_reward' : 'crime_fine', reference, now);
    return { ok: true as const, success, amount, balance: account.balance + signedAmount, message };
  });

  const commitCrime = db.transaction(() => {
    const account = sqliteEnsureAccount(guildId, userId);
    const nextCrimeAt = (account.lastCrimeAt ?? 0) + CRIME_COOLDOWN_SECONDS;
    if (now < nextCrimeAt) return { ok: false as const, secondsRemaining: nextCrimeAt - now };
    const amount = success
      ? 70 + randomInt(71)
      : Math.min(account.balance, 15 + randomInt(31));
    const signedAmount = success ? amount : -amount;
    const message = formatMessage(pick(success ? crimeSuccessLines : crimeFailLines), { amount });
    db.prepare('UPDATE economy_accounts SET balance = balance + ?, last_crime_at = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?')
      .run(signedAmount, now, now, guildId, userId);
    if (signedAmount) db.prepare('INSERT INTO economy_ledger (guild_id, user_id, amount, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(guildId, userId, signedAmount, success ? 'crime_reward' : 'crime_fine', reference, now);
    return { ok: true as const, success, amount, balance: account.balance + signedAmount, message };
  });
  return commitCrime.immediate();
}

export async function transferCoins(guildId: string, fromUserId: string, toUserId: string, amount: number, reference: string): Promise<
  | { ok: true; fromBalance: number; toBalance: number }
  | { ok: false; reason: 'self' | 'invalid_amount' | 'insufficient_funds' }
> {
  guildId = GLOBAL_SCOPE_ID;
  if (fromUserId === toUserId) return { ok: false, reason: 'self' };
  if (!Number.isSafeInteger(amount) || amount <= 0) return { ok: false, reason: 'invalid_amount' };
  if (economyPool) return withEconomyTransaction(async (connection) => {
    const ids = [fromUserId, toUserId].sort();
    const accounts = new Map<string, AccountRow>();
    for (const id of ids) accounts.set(id, await mysqlEnsureAccount(connection, guildId, id, true));
    const from = accounts.get(fromUserId)!;
    const to = accounts.get(toUserId)!;
    if (from.balance < amount) return { ok: false as const, reason: 'insufficient_funds' as const };
    const now = nowSeconds();
    await connection.execute('UPDATE economy_accounts SET balance = balance - ?, updated_at = ? WHERE guild_id = ? AND user_id = ?', [amount, now, guildId, fromUserId]);
    await connection.execute('UPDATE economy_accounts SET balance = balance + ?, updated_at = ? WHERE guild_id = ? AND user_id = ?', [amount, now, guildId, toUserId]);
    await mysqlAddLedger(connection, guildId, fromUserId, -amount, `transfer:to:${toUserId}`, `${reference}:out`, now);
    await mysqlAddLedger(connection, guildId, toUserId, amount, `transfer:from:${fromUserId}`, `${reference}:in`, now);
    return { ok: true as const, fromBalance: from.balance - amount, toBalance: to.balance + amount };
  });

  const send = db.transaction(() => {
    const from = sqliteEnsureAccount(guildId, fromUserId);
    const to = sqliteEnsureAccount(guildId, toUserId);
    if (from.balance < amount) return { ok: false as const, reason: 'insufficient_funds' as const };
    const now = nowSeconds();
    db.prepare('UPDATE economy_accounts SET balance = balance - ?, updated_at = ? WHERE guild_id = ? AND user_id = ?').run(amount, now, guildId, fromUserId);
    db.prepare('UPDATE economy_accounts SET balance = balance + ?, updated_at = ? WHERE guild_id = ? AND user_id = ?').run(amount, now, guildId, toUserId);
    const ledger = db.prepare('INSERT INTO economy_ledger (guild_id, user_id, amount, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?)');
    ledger.run(guildId, fromUserId, -amount, `transfer:to:${toUserId}`, `${reference}:out`, now);
    ledger.run(guildId, toUserId, amount, `transfer:from:${fromUserId}`, `${reference}:in`, now);
    return { ok: true as const, fromBalance: from.balance - amount, toBalance: to.balance + amount };
  });
  return send.immediate();
}

export async function fish(guildId: string, userId: string, reference: string): Promise<
  | { ok: true; amount: number; balance: number; message: string }
  | { ok: false; secondsRemaining: number }
> {
  guildId = GLOBAL_SCOPE_ID;
  const caught = randomInt(100) < 78;
  const rare = caught && randomInt(100) < 8;
  const fishName = pick(rare ? fishRare : fishCommon);
  const amount = caught ? (rare ? 90 + randomInt(61) : 20 + randomInt(31)) : 0;
  const message = caught
    ? formatMessage(pick(fishCatchLines), { fish: fishName, amount })
    : pick(fishMissLines);

  if (economyPool) return withEconomyTransaction(async (connection) => {
    const account = await mysqlEnsureAccount(connection, guildId, userId, true);
    const now = nowSeconds();
    const nextFishAt = (account.lastFishAt ?? 0) + FISH_COOLDOWN_SECONDS;
    if (now < nextFishAt) return { ok: false as const, secondsRemaining: nextFishAt - now };
    await connection.execute('UPDATE economy_accounts SET balance = balance + ?, last_fish_at = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?', [amount, now, now, guildId, userId]);
    if (amount) await mysqlAddLedger(connection, guildId, userId, amount, rare ? 'fish_rare' : 'fish', reference, now);
    return { ok: true as const, amount, balance: account.balance + amount, message };
  });

  const catchFish = db.transaction(() => {
    const account = sqliteEnsureAccount(guildId, userId);
    const now = nowSeconds();
    const nextFishAt = (account.lastFishAt ?? 0) + FISH_COOLDOWN_SECONDS;
    if (now < nextFishAt) return { ok: false as const, secondsRemaining: nextFishAt - now };
    db.prepare('UPDATE economy_accounts SET balance = balance + ?, last_fish_at = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?').run(amount, now, now, guildId, userId);
    if (amount) db.prepare('INSERT INTO economy_ledger (guild_id, user_id, amount, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(guildId, userId, amount, rare ? 'fish_rare' : 'fish', reference, now);
    return { ok: true as const, amount, balance: account.balance + amount, message };
  });
  return catchFish.immediate();
}

export async function robPlayer(guildId: string, userId: string, targetId: string, targetName: string, reference: string): Promise<
  | { ok: true; success: boolean; protected?: boolean; amount: number; balance: number; message: string }
  | { ok: false; reason: 'self' | 'cooldown' | 'target_empty'; secondsRemaining?: number }
> {
  guildId = GLOBAL_SCOPE_ID;
  if (userId === targetId) return { ok: false, reason: 'self' };
  const success = randomInt(100) < 40;
  if (economyPool) return withEconomyTransaction(async (connection) => {
    const ids = [userId, targetId].sort();
    const accounts = new Map<string, AccountRow>();
    for (const id of ids) accounts.set(id, await mysqlEnsureAccount(connection, guildId, id, true));
    const robber = accounts.get(userId)!;
    const victim = accounts.get(targetId)!;
    const now = nowSeconds();
    const nextRobAt = (robber.lastRobAt ?? 0) + ROB_COOLDOWN_SECONDS;
    if (now < nextRobAt) return { ok: false as const, reason: 'cooldown' as const, secondsRemaining: nextRobAt - now };
    if (victim.balance <= 0) return { ok: false as const, reason: 'target_empty' as const };
    if ((victim.robProtectedUntil ?? 0) > now) {
      await connection.execute('UPDATE economy_accounts SET last_rob_at = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?', [now, now, guildId, userId]);
      return { ok: true as const, success: false, protected: true, amount: 0, balance: robber.balance,
        message: `🛡️ ${targetName} tenía un escudo activo. El intento fue bloqueado y tendrás que esperar antes de volver a robar.` };
    }

    let amount: number;
    let message: string;
    if (success) {
      amount = Math.min(victim.balance, 200, Math.max(1, Math.floor(victim.balance * (5 + randomInt(11)) / 100)));
      message = formatMessage(pick(robSuccessLines), { amount, target: targetName });
      await connection.execute('UPDATE economy_accounts SET balance = balance + ?, last_rob_at = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?', [amount, now, now, guildId, userId]);
      await connection.execute('UPDATE economy_accounts SET balance = balance - ?, updated_at = ? WHERE guild_id = ? AND user_id = ?', [amount, now, guildId, targetId]);
      await mysqlAddLedger(connection, guildId, userId, amount, `rob:from:${targetId}`, `${reference}:in`, now);
      await mysqlAddLedger(connection, guildId, targetId, -amount, `rob:to:${userId}`, `${reference}:out`, now);
      return { ok: true as const, success: true, amount, balance: robber.balance + amount, message };
    }
    amount = Math.min(robber.balance, Math.max(1, Math.floor(robber.balance * 0.05)));
    message = formatMessage(pick(robFailLines), { amount, target: targetName });
    await connection.execute('UPDATE economy_accounts SET balance = balance - ?, last_rob_at = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?', [amount, now, now, guildId, userId]);
    if (amount) await mysqlAddLedger(connection, guildId, userId, -amount, 'rob_fine', `${reference}:fine`, now);
    return { ok: true as const, success: false, amount, balance: robber.balance - amount, message };
  });

  const attempt = db.transaction(() => {
    const accounts = new Map<string, AccountRow>();
    for (const id of [userId, targetId].sort()) accounts.set(id, sqliteEnsureAccount(guildId, id));
    const robber = accounts.get(userId)!;
    const victim = accounts.get(targetId)!;
    const now = nowSeconds();
    const nextRobAt = (robber.lastRobAt ?? 0) + ROB_COOLDOWN_SECONDS;
    if (now < nextRobAt) return { ok: false as const, reason: 'cooldown' as const, secondsRemaining: nextRobAt - now };
    if (victim.balance <= 0) return { ok: false as const, reason: 'target_empty' as const };
    if ((victim.robProtectedUntil ?? 0) > now) {
      db.prepare('UPDATE economy_accounts SET last_rob_at = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?').run(now, now, guildId, userId);
      return { ok: true as const, success: false, protected: true, amount: 0, balance: robber.balance,
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
      return { ok: true as const, success: true, amount, balance: robber.balance + amount, message };
    }
    const amount = Math.min(robber.balance, Math.max(1, Math.floor(robber.balance * 0.05)));
    const message = formatMessage(pick(robFailLines), { amount, target: targetName });
    db.prepare('UPDATE economy_accounts SET balance = balance - ?, last_rob_at = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?').run(amount, now, now, guildId, userId);
    if (amount) db.prepare('INSERT INTO economy_ledger (guild_id, user_id, amount, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(guildId, userId, -amount, 'rob_fine', `${reference}:fine`, now);
    return { ok: true as const, success: false, amount, balance: robber.balance - amount, message };
  });
  return attempt.immediate();
}

export type RouletteColor = 'rojo' | 'negro' | 'verde';
const redNumbers = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export async function playRoulette(guildId: string, userId: string, bet: number, choice: RouletteColor, reference: string): Promise<
  | { ok: true; balance: number; bet: number; choice: RouletteColor; number: number; result: RouletteColor; payout: number; message: string }
  | { ok: false; reason: 'invalid_bet' | 'insufficient_funds' }
> {
  guildId = GLOBAL_SCOPE_ID;
  if (!Number.isSafeInteger(bet) || bet < 1 || bet > MAX_BET) return { ok: false, reason: 'invalid_bet' };
  const number = randomInt(37);
  const result: RouletteColor = number === 0 ? 'verde' : redNumbers.has(number) ? 'rojo' : 'negro';
  const won = choice === result;
  const payout = won ? bet * (choice === 'verde' ? 36 : 2) : 0;
  const message = won
    ? formatMessage(pick(rouletteWinLines), { payout })
    : pick(rouletteLoseLines);

  if (economyPool) return withEconomyTransaction(async (connection) => {
    const account = await mysqlEnsureAccount(connection, guildId, userId, true);
    if (account.balance < bet) return { ok: false as const, reason: 'insufficient_funds' as const };
    const now = nowSeconds();
    await connection.execute('UPDATE economy_accounts SET balance = balance - ? + ?, updated_at = ? WHERE guild_id = ? AND user_id = ?', [bet, payout, now, guildId, userId]);
    await mysqlAddLedger(connection, guildId, userId, -bet, `roulette:${choice}:bet`, `${reference}:bet`, now);
    if (payout) await mysqlAddLedger(connection, guildId, userId, payout, `roulette:${choice}:payout`, `${reference}:payout`, now);
    return { ok: true as const, balance: account.balance - bet + payout, bet, choice, number, result, payout, message };
  });

  const spin = db.transaction(() => {
    const account = sqliteEnsureAccount(guildId, userId);
    if (account.balance < bet) return { ok: false as const, reason: 'insufficient_funds' as const };
    const now = nowSeconds();
    db.prepare('UPDATE economy_accounts SET balance = balance - ? + ?, updated_at = ? WHERE guild_id = ? AND user_id = ?').run(bet, payout, now, guildId, userId);
    const ledger = db.prepare('INSERT INTO economy_ledger (guild_id, user_id, amount, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?)');
    ledger.run(guildId, userId, -bet, `roulette:${choice}:bet`, `${reference}:bet`, now);
    if (payout) ledger.run(guildId, userId, payout, `roulette:${choice}:payout`, `${reference}:payout`, now);
    return { ok: true as const, balance: account.balance - bet + payout, bet, choice, number, result, payout, message };
  });
  return spin.immediate();
}

export async function playItemRoulette(guildId: string, userId: string, itemId: string, choice: RouletteColor, reference: string): Promise<
  | { ok: true; itemName: string; number: number; result: RouletteColor; payout: number; balance: number; message: string }
  | { ok: false; reason: 'invalid_item' | 'missing_item' }
> {
  guildId = GLOBAL_SCOPE_ID;
  const item = storeItems.find((candidate) => candidate.id === itemId);
  if (!item) return { ok: false, reason: 'invalid_item' };
  const number = randomInt(37);
  const result: RouletteColor = number === 0 ? 'verde' : redNumbers.has(number) ? 'rojo' : 'negro';
  const payout = choice === result ? item.cost * (choice === 'verde' ? 36 : 2) : 0;
  const message = payout
    ? `La bola cayó en **${number} ${result}**. Tu **${item.name}** acertó la apuesta.`
    : `La bola cayó en **${number} ${result}**. Perdiste tu **${item.name}**; la apuesta no devuelve el artículo.`;
  if (economyPool) return withEconomyTransaction(async (connection) => {
    const account = await mysqlEnsureAccount(connection, guildId, userId, true);
    const [items] = await connection.execute<RowDataPacket[]>(
      'SELECT quantity FROM economy_inventory WHERE guild_id = ? AND user_id = ? AND item_id = ? FOR UPDATE',
      [guildId, userId, itemId],
    );
    const quantity = Number(items[0]?.quantity ?? 0);
    if (quantity < 1) return { ok: false as const, reason: 'missing_item' as const };
    await connection.execute('UPDATE economy_inventory SET quantity = quantity - 1 WHERE guild_id = ? AND user_id = ? AND item_id = ?', [guildId, userId, itemId]);
    await connection.execute('DELETE FROM economy_inventory WHERE guild_id = ? AND user_id = ? AND item_id = ? AND quantity <= 0', [guildId, userId, itemId]);
    const now = nowSeconds();
    await insertItemLedger(connection, { guildId, userId, itemId, quantityDelta: -1, reason: 'roulette_item_bet', reference: `${reference}:item`, createdAt: now });
    if (payout) {
      await connection.execute('UPDATE economy_accounts SET balance = balance + ?, updated_at = ? WHERE guild_id = ? AND user_id = ?', [payout, now, guildId, userId]);
      await mysqlAddLedger(connection, guildId, userId, payout, `roulette_item:${itemId}`, `${reference}:payout`, now);
    }
    return { ok: true as const, itemName: item.name, number, result, payout, balance: account.balance + payout, message };
  });

  const spin = db.transaction(() => {
    const account = sqliteEnsureAccount(guildId, userId);
    const inventory = db.prepare('SELECT quantity FROM economy_inventory WHERE guild_id = ? AND user_id = ? AND item_id = ?')
      .get(guildId, userId, itemId) as { quantity: number } | undefined;
    if (!inventory || inventory.quantity < 1) return { ok: false as const, reason: 'missing_item' as const };
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
    return { ok: true as const, itemName: item.name, number, result, payout, balance: account.balance + payout, message };
  });
  return spin.immediate();
}

export type UseItemResult =
  | { ok: true; kind: 'fish'; balance: number; amount: number; message: string }
  | { ok: true; kind: 'shield'; protectedUntil: number; message: string }
  | { ok: false; reason: 'invalid_item' | 'missing_item' | 'cooldown'; secondsRemaining?: number };

function consumeItemSqlite(guildId: string, userId: string, itemId: string, reference: string, reason: string, now: number): boolean {
  const row = db.prepare('SELECT quantity FROM economy_inventory WHERE guild_id = ? AND user_id = ? AND item_id = ?')
    .get(guildId, userId, itemId) as { quantity: number } | undefined;
  if (!row || row.quantity < 1) return false;
  db.prepare('UPDATE economy_inventory SET quantity = quantity - 1 WHERE guild_id = ? AND user_id = ? AND item_id = ?').run(guildId, userId, itemId);
  db.prepare('DELETE FROM economy_inventory WHERE guild_id = ? AND user_id = ? AND item_id = ? AND quantity <= 0').run(guildId, userId, itemId);
  db.prepare('INSERT INTO economy_item_ledger (guild_id, user_id, item_id, quantity_delta, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(guildId, userId, itemId, -1, reason, reference, now);
  return true;
}

export async function useShopItem(guildId: string, userId: string, itemId: string, reference: string): Promise<UseItemResult> {
  guildId = GLOBAL_SCOPE_ID;
  const item = storeItems.find((candidate) => candidate.id === itemId && candidate.usable);
  if (!item) return { ok: false, reason: 'invalid_item' };
  const caught = randomInt(100) < 78;
  const rare = caught && randomInt(100) < 8;
  const fishName = pick(rare ? fishRare : fishCommon);
  const amount = caught ? (rare ? 90 + randomInt(61) : 20 + randomInt(31)) * 2 : 0;
  const fishMessage = caught
    ? `¡El cebo premium atrajo un **${fishName}**! La captura salió excelente.`
    : 'El cebo premium se gastó, pero los peces no picaron. Inténtalo de nuevo después del enfriamiento.';

  if (economyPool) return withEconomyTransaction(async (connection) => {
    const account = await mysqlEnsureAccount(connection, guildId, userId, true);
    const [items] = await connection.execute<RowDataPacket[]>(
      'SELECT quantity FROM economy_inventory WHERE guild_id = ? AND user_id = ? AND item_id = ? FOR UPDATE',
      [guildId, userId, itemId],
    );
    if (Number(items[0]?.quantity ?? 0) < 1) return { ok: false as const, reason: 'missing_item' as const };
    const now = nowSeconds();
    if (itemId === 'cebo_premium') {
      const nextFishAt = (account.lastFishAt ?? 0) + FISH_COOLDOWN_SECONDS;
      if (now < nextFishAt) return { ok: false as const, reason: 'cooldown' as const, secondsRemaining: nextFishAt - now };
      await connection.execute('UPDATE economy_inventory SET quantity = quantity - 1 WHERE guild_id = ? AND user_id = ? AND item_id = ?', [guildId, userId, itemId]);
      await connection.execute('DELETE FROM economy_inventory WHERE guild_id = ? AND user_id = ? AND item_id = ? AND quantity <= 0', [guildId, userId, itemId]);
      await insertItemLedger(connection, { guildId, userId, itemId, quantityDelta: -1, reason: 'use_premium_bait', reference: `${reference}:item`, createdAt: now });
      await connection.execute('UPDATE economy_accounts SET balance = balance + ?, last_fish_at = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?', [amount, now, now, guildId, userId]);
      if (amount) await mysqlAddLedger(connection, guildId, userId, amount, rare ? 'fish_rare:premium_bait' : 'fish:premium_bait', `${reference}:payout`, now);
      return { ok: true as const, kind: 'fish' as const, balance: account.balance + amount, amount, message: fishMessage };
    }
    const protectedUntil = Math.max(account.robProtectedUntil ?? now, now) + ROB_SHIELD_SECONDS;
    await connection.execute('UPDATE economy_inventory SET quantity = quantity - 1 WHERE guild_id = ? AND user_id = ? AND item_id = ?', [guildId, userId, itemId]);
    await connection.execute('DELETE FROM economy_inventory WHERE guild_id = ? AND user_id = ? AND item_id = ? AND quantity <= 0', [guildId, userId, itemId]);
    await insertItemLedger(connection, { guildId, userId, itemId, quantityDelta: -1, reason: 'activate_robbery_shield', reference: `${reference}:item`, createdAt: now });
    await connection.execute('UPDATE economy_accounts SET rob_protected_until = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?', [protectedUntil, now, guildId, userId]);
    return { ok: true as const, kind: 'shield' as const, protectedUntil,
      message: `🛡️ Escudo activo hasta <t:${protectedUntil}:F>. Los intentos de robo contra ti serán bloqueados.` };
  });

  const use = db.transaction((): UseItemResult => {
    const account = sqliteEnsureAccount(guildId, userId);
    const now = nowSeconds();
    if (itemId === 'cebo_premium') {
      const nextFishAt = (account.lastFishAt ?? 0) + FISH_COOLDOWN_SECONDS;
      if (now < nextFishAt) return { ok: false, reason: 'cooldown', secondsRemaining: nextFishAt - now };
      if (!consumeItemSqlite(guildId, userId, itemId, `${reference}:item`, 'use_premium_bait', now)) return { ok: false, reason: 'missing_item' };
      db.prepare('UPDATE economy_accounts SET balance = balance + ?, last_fish_at = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?').run(amount, now, now, guildId, userId);
      if (amount) db.prepare('INSERT INTO economy_ledger (guild_id, user_id, amount, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(guildId, userId, amount, rare ? 'fish_rare:premium_bait' : 'fish:premium_bait', `${reference}:payout`, now);
      return { ok: true, kind: 'fish', balance: account.balance + amount, amount, message: fishMessage };
    }
    if (!consumeItemSqlite(guildId, userId, itemId, `${reference}:item`, 'activate_robbery_shield', now)) return { ok: false, reason: 'missing_item' };
    const protectedUntil = Math.max(account.robProtectedUntil ?? now, now) + ROB_SHIELD_SECONDS;
    db.prepare('UPDATE economy_accounts SET rob_protected_until = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?').run(protectedUntil, now, guildId, userId);
    return { ok: true, kind: 'shield', protectedUntil,
      message: `🛡️ Escudo activo hasta <t:${protectedUntil}:F>. Los intentos de robo contra ti serán bloqueados.` };
  });
  return use.immediate();
}

function makeDeck(): BlackjackCard[] {
  const suits = ['♠', '♥', '♦', '♣'];
  const ranks = [
    { rank: 'A', value: 11 }, { rank: '2', value: 2 }, { rank: '3', value: 3 }, { rank: '4', value: 4 },
    { rank: '5', value: 5 }, { rank: '6', value: 6 }, { rank: '7', value: 7 }, { rank: '8', value: 8 },
    { rank: '9', value: 9 }, { rank: '10', value: 10 }, { rank: 'J', value: 10 }, { rank: 'Q', value: 10 }, { rank: 'K', value: 10 },
  ];
  const deck = suits.flatMap((suit) => ranks.map(({ rank, value }) => ({ rank, suit, value })));
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  return deck;
}

function drawCard(state: BlackjackState): BlackjackCard {
  if (!state.deck.length) state.deck = makeDeck();
  return state.deck.pop()!;
}
function total(cards: BlackjackCard[]): number {
  let value = cards.reduce((sum, card) => sum + card.value, 0);
  let aces = cards.filter((card) => card.rank === 'A').length;
  while (value > 21 && aces > 0) { value -= 10; aces--; }
  return value;
}
function cardText(card: BlackjackCard): string { return `**${card.rank}${card.suit}**`; }
function isBlackjackFinished(state: BlackjackState): boolean { return state.status === 'finished'; }
function blackjackView(gameId: string, bet: number, balance: number, state: BlackjackState): BlackjackView {
  const dealerCards = state.status === 'active'
    ? [cardText(state.dealerCards[0]!), '🂠']
    : state.dealerCards.map(cardText);
  return {
    gameId, bet, balance,
    playerCards: state.playerCards.map(cardText),
    dealerCards,
    playerTotal: total(state.playerCards),
    ...(isBlackjackFinished(state) ? { dealerTotal: total(state.dealerCards) } : {}),
    status: state.status,
    ...(state.outcome ? { outcome: state.outcome } : {}),
    payout: state.payout,
    ...(state.resultText ? { resultText: state.resultText } : {}),
  };
}

function settleBlackjack(state: BlackjackState, outcome: 'win' | 'lose' | 'push', payout: number, resultText: string): void {
  state.status = 'finished'; state.outcome = outcome; state.payout = payout; state.resultText = resultText;
}
function openingBlackjackSettlement(state: BlackjackState, bet: number): void {
  const playerNatural = total(state.playerCards) === 21;
  const dealerNatural = total(state.dealerCards) === 21;
  if (playerNatural && dealerNatural) settleBlackjack(state, 'push', bet, 'Ambos abrieron con 21. Recuperas tu apuesta.');
  else if (playerNatural) settleBlackjack(state, 'win', Math.floor(bet * 2.5), '¡Blackjack natural! La mesa paga 3:2.');
  else if (dealerNatural) settleBlackjack(state, 'lose', 0, 'El crupier abrió con blackjack. Esta mano se pierde.');
}
function settleAfterTurn(state: BlackjackState, bet: number): void {
  const playerTotal = total(state.playerCards);
  if (playerTotal > 21) {
    settleBlackjack(state, 'lose', 0, `Te pasaste con **${playerTotal}**. ${pick(blackjackLoseLines)}`);
    return;
  }
  while (total(state.dealerCards) < 17) state.dealerCards.push(drawCard(state));
  const dealerTotal = total(state.dealerCards);
  if (dealerTotal > 21 || playerTotal > dealerTotal) settleBlackjack(state, 'win', bet * 2, pick(blackjackWinLines));
  else if (playerTotal === dealerTotal) settleBlackjack(state, 'push', bet, `Empate con **${playerTotal}**. Recuperas tu apuesta.`);
  else settleBlackjack(state, 'lose', 0, `${pick(blackjackLoseLines)} Tu mano: **${playerTotal}** · crupier: **${dealerTotal}**.`);
}

export async function startBlackjack(guildId: string, userId: string, bet: number, reference: string): Promise<
  | { ok: true; view: BlackjackView; existing: boolean }
  | { ok: false; reason: 'invalid_bet' | 'insufficient_funds' }
> {
  guildId = GLOBAL_SCOPE_ID;
  if (!Number.isSafeInteger(bet) || bet < 1 || bet > MAX_BET) return { ok: false, reason: 'invalid_bet' };
  const gameId = randomBytes(12).toString('hex');

  const begin = (account: AccountRow) => {
    const state: BlackjackState = { deck: makeDeck(), playerCards: [], dealerCards: [], status: 'active', payout: 0 };
    state.playerCards.push(drawCard(state), drawCard(state));
    state.dealerCards.push(drawCard(state), drawCard(state));
    openingBlackjackSettlement(state, bet);
    return { account, state };
  };

  if (economyPool) return withEconomyTransaction(async (connection) => {
    const account = await mysqlEnsureAccount(connection, guildId, userId, true);
    const active = await mysqlRows<MysqlGameRow[]>(connection,
      "SELECT id, bet, state_json, status FROM economy_games WHERE guild_id = ? AND user_id = ? AND game_type = 'blackjack' AND status = 'active' LIMIT 1 FOR UPDATE",
      [guildId, userId],
    );
    if (active[0]) {
      return { ok: true as const, view: blackjackView(active[0].id, Number(active[0].bet), account.balance, JSON.parse(active[0].state_json) as BlackjackState), existing: true };
    }
    if (account.balance < bet) return { ok: false as const, reason: 'insufficient_funds' as const };
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
    await connection.execute('INSERT INTO economy_games (id, guild_id, user_id, game_type, bet, status, state_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [gameId, guildId, userId, 'blackjack', bet, state.status, JSON.stringify(state), now, now]);
    return { ok: true as const, view: blackjackView(gameId, bet, balance, state), existing: false };
  });

  const start = db.transaction(() => {
    const account = sqliteEnsureAccount(guildId, userId);
    const active = db.prepare("SELECT id, bet, state_json, status FROM economy_games WHERE guild_id = ? AND user_id = ? AND game_type = 'blackjack' AND status = 'active' LIMIT 1")
      .get(guildId, userId) as { id: string; bet: number; state_json: string; status: string } | undefined;
    if (active) return { ok: true as const, view: blackjackView(active.id, active.bet, account.balance, JSON.parse(active.state_json) as BlackjackState), existing: true };
    if (account.balance < bet) return { ok: false as const, reason: 'insufficient_funds' as const };
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
    return { ok: true as const, view: blackjackView(gameId, bet, balance, state), existing: false };
  });
  return start.immediate();
}

export async function playBlackjackTurn(guildId: string, userId: string, gameId: string, action: 'hit' | 'stand'): Promise<BlackjackView | undefined> {
  guildId = GLOBAL_SCOPE_ID;
  if (economyPool) return withEconomyTransaction(async (connection) => {
    const account = await mysqlEnsureAccount(connection, guildId, userId, true);
    const games = await mysqlRows<MysqlGameRow[]>(connection, 'SELECT id, bet, state_json, status FROM economy_games WHERE id = ? AND guild_id = ? AND user_id = ? FOR UPDATE', [gameId, guildId, userId]);
    const game = games[0];
    if (!game) return undefined;
    const state = JSON.parse(game.state_json) as BlackjackState;
    if (game.status !== 'active' || state.status !== 'active') return blackjackView(game.id, Number(game.bet), account.balance, state);
    if (action === 'hit') state.playerCards.push(drawCard(state));
    else settleAfterTurn(state, Number(game.bet));
    if (action === 'hit' && total(state.playerCards) > 21) settleAfterTurn(state, Number(game.bet));
    const now = nowSeconds();
    let balance = account.balance;
    if (isBlackjackFinished(state) && state.payout) {
      balance += state.payout;
      await connection.execute('UPDATE economy_accounts SET balance = balance + ?, updated_at = ? WHERE guild_id = ? AND user_id = ?', [state.payout, now, guildId, userId]);
      await mysqlAddLedger(connection, guildId, userId, state.payout, 'blackjack:payout', `${game.id}:payout`, now);
    }
    await connection.execute('UPDATE economy_games SET status = ?, state_json = ?, updated_at = ? WHERE id = ?', [state.status, JSON.stringify(state), now, game.id]);
    return blackjackView(game.id, Number(game.bet), balance, state);
  });

  const play = db.transaction(() => {
    const account = sqliteEnsureAccount(guildId, userId);
    const game = db.prepare('SELECT id, bet, state_json, status FROM economy_games WHERE id = ? AND guild_id = ? AND user_id = ?')
      .get(gameId, guildId, userId) as { id: string; bet: number; state_json: string; status: string } | undefined;
    if (!game) return undefined;
    const state = JSON.parse(game.state_json) as BlackjackState;
    if (game.status !== 'active' || state.status !== 'active') return blackjackView(game.id, game.bet, account.balance, state);
    if (action === 'hit') state.playerCards.push(drawCard(state));
    else settleAfterTurn(state, game.bet);
    if (action === 'hit' && total(state.playerCards) > 21) settleAfterTurn(state, game.bet);
    const now = nowSeconds();
    let balance = account.balance;
    if (isBlackjackFinished(state) && state.payout) {
      balance += state.payout;
      db.prepare('UPDATE economy_accounts SET balance = balance + ?, updated_at = ? WHERE guild_id = ? AND user_id = ?').run(state.payout, now, guildId, userId);
      db.prepare('INSERT INTO economy_ledger (guild_id, user_id, amount, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(guildId, userId, state.payout, 'blackjack:payout', `${game.id}:payout`, now);
    }
    db.prepare('UPDATE economy_games SET status = ?, state_json = ?, updated_at = ? WHERE id = ?').run(state.status, JSON.stringify(state), now, game.id);
    return blackjackView(game.id, game.bet, balance, state);
  });
  return play.immediate();
}

export async function getInventory(guildId: string, userId: string): Promise<Array<{ itemId: string; quantity: number; acquiredAt: number }>> {
  guildId = GLOBAL_SCOPE_ID;
  if (economyPool) {
    const [rows] = await economyPool.execute<RowDataPacket[]>('SELECT item_id AS itemId, quantity, acquired_at AS acquiredAt FROM economy_inventory WHERE guild_id = ? AND user_id = ? AND quantity > 0 ORDER BY acquired_at DESC', [guildId, userId]);
    return rows.map((row) => ({ itemId: String(row.itemId), quantity: Number(row.quantity), acquiredAt: Number(row.acquiredAt) }));
  }
  return db.prepare('SELECT item_id AS itemId, quantity, acquired_at AS acquiredAt FROM economy_inventory WHERE guild_id = ? AND user_id = ? AND quantity > 0 ORDER BY acquired_at DESC')
    .all(guildId, userId) as Array<{ itemId: string; quantity: number; acquiredAt: number }>;
}

export async function getLeaderboard(guildId: string, limit = 10): Promise<Array<{ userId: string; balance: number }>> {
  guildId = GLOBAL_SCOPE_ID;
  if (economyPool) {
    const [rows] = await economyPool.execute<RowDataPacket[]>('SELECT user_id AS userId, balance + bank_balance AS balance FROM economy_accounts WHERE guild_id = ? ORDER BY balance + bank_balance DESC, user_id ASC LIMIT ?', [guildId, limit]);
    return rows.map((row) => ({ userId: String(row.userId), balance: Number(row.balance) }));
  }
  return db.prepare('SELECT user_id AS userId, balance + bank_balance AS balance FROM economy_accounts WHERE guild_id = ? ORDER BY balance + bank_balance DESC, user_id ASC LIMIT ?')
    .all(guildId, limit) as Array<{ userId: string; balance: number }>;
}

export function formatCooldown(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.ceil((seconds % 3600) / 60);
  return hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`;
}

export const storeItems = [
  { id: 'cebo_premium', name: 'Cebo premium', description: 'Duplica el premio de una pesca. Respeta el enfriamiento normal.', cost: 40, emoji: '🎣', usable: true },
  { id: 'escudo_antirrobo', name: 'Escudo antirrobo', description: 'Úsalo para bloquear robos contra ti durante 24 horas. Puedes extender la protección con otro escudo.', cost: 320, emoji: '🛡️', usable: true },
] as const;
