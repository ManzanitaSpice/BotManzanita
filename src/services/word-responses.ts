import type { RowDataPacket } from 'mysql2/promise';
import { db } from '../storage/database.js';
import { economyPool } from '../storage/economy-database.js';

const MAX_SAVED_WORDS_PER_GUILD = 100;
const WORD_RESPONSE_CACHE_TTL_MS = 5_000;
const WORD_PATTERN = /^[\p{L}\p{N}_]+(?:-[\p{L}\p{N}_]+)*$/u;
const MESSAGE_WORD_PATTERN = /[\p{L}\p{N}_]+(?:-[\p{L}\p{N}_]+)*/gu;
const wordResponseCache = new Map<string, { expiresAt: number; rules: SavedWordResponse[] }>();

export type SavedWordResponse = { triggerKey: string; triggerWord: string; response: string };
export type SaveWordResponseResult = 'saved' | 'invalid_word' | 'invalid_response' | 'limit_reached';

function normalizeTriggerWord(input: string): { triggerWord: string; triggerKey: string } | undefined {
  const triggerWord = input.normalize('NFKC').trim();
  if (triggerWord.length < 1 || triggerWord.length > 64 || !WORD_PATTERN.test(triggerWord)) return undefined;
  return { triggerWord, triggerKey: triggerWord.toLocaleLowerCase('es-MX') };
}

export async function saveWordResponse(guildId: string, rawWord: string, rawResponse: string): Promise<SaveWordResponseResult> {
  const normalized = normalizeTriggerWord(rawWord);
  if (!normalized) return 'invalid_word';
  const response = rawResponse.trim();
  if (!response || response.length > 1_800) return 'invalid_response';
  const now = Math.floor(Date.now() / 1000);

  if (economyPool) {
    const [existing] = await economyPool.execute<RowDataPacket[]>(
      'SELECT 1 FROM saved_word_responses WHERE guild_id=? AND trigger_key=? LIMIT 1', [guildId, normalized.triggerKey]);
    if (!existing.length) {
      const [counts] = await economyPool.execute<RowDataPacket[]>(
        'SELECT COUNT(*) AS total FROM saved_word_responses WHERE guild_id=?', [guildId]);
      if (Number(counts[0]?.total ?? 0) >= MAX_SAVED_WORDS_PER_GUILD) return 'limit_reached';
    }
    await economyPool.execute(`INSERT INTO saved_word_responses (guild_id,trigger_key,trigger_word,response,updated_at)
      VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE trigger_word=VALUES(trigger_word),response=VALUES(response),updated_at=VALUES(updated_at)`,
    [guildId, normalized.triggerKey, normalized.triggerWord, response, now]);
    wordResponseCache.delete(guildId);
    return 'saved';
  }

  const existing = db.prepare('SELECT 1 FROM saved_word_responses WHERE guild_id=? AND trigger_key=? LIMIT 1')
    .get(guildId, normalized.triggerKey);
  if (!existing) {
    const count = db.prepare('SELECT COUNT(*) AS total FROM saved_word_responses WHERE guild_id=?')
      .get(guildId) as { total: number };
    if (Number(count.total) >= MAX_SAVED_WORDS_PER_GUILD) return 'limit_reached';
  }
  db.prepare(`INSERT INTO saved_word_responses (guild_id,trigger_key,trigger_word,response,updated_at) VALUES (?,?,?,?,?)
    ON CONFLICT(guild_id,trigger_key) DO UPDATE SET trigger_word=excluded.trigger_word,response=excluded.response,updated_at=excluded.updated_at`)
    .run(guildId, normalized.triggerKey, normalized.triggerWord, response, now);
  wordResponseCache.delete(guildId);
  return 'saved';
}

export async function removeWordResponse(guildId: string, rawWord: string): Promise<boolean> {
  const normalized = normalizeTriggerWord(rawWord);
  if (!normalized) return false;
  if (economyPool) {
    const [result] = await economyPool.execute(
      'DELETE FROM saved_word_responses WHERE guild_id=? AND trigger_key=?', [guildId, normalized.triggerKey]);
    wordResponseCache.delete(guildId);
    return Number((result as { affectedRows?: number }).affectedRows ?? 0) > 0;
  }
  const removed = db.prepare('DELETE FROM saved_word_responses WHERE guild_id=? AND trigger_key=?')
    .run(guildId, normalized.triggerKey).changes > 0;
  if (removed) wordResponseCache.delete(guildId);
  return removed;
}

export async function getSavedWordResponses(guildId: string): Promise<SavedWordResponse[]> {
  const cached = wordResponseCache.get(guildId);
  if (cached && cached.expiresAt > Date.now()) return cached.rules;
  let rules: SavedWordResponse[];
  if (economyPool) {
    const [rows] = await economyPool.execute<RowDataPacket[]>(`SELECT trigger_key AS triggerKey,trigger_word AS triggerWord,response
      FROM saved_word_responses WHERE guild_id=? ORDER BY trigger_key LIMIT ${MAX_SAVED_WORDS_PER_GUILD}`, [guildId]);
    rules = rows.map((row) => ({ triggerKey: String(row.triggerKey), triggerWord: String(row.triggerWord), response: String(row.response) }));
  } else {
    rules = db.prepare(`SELECT trigger_key AS triggerKey,trigger_word AS triggerWord,response
      FROM saved_word_responses WHERE guild_id=? ORDER BY trigger_key LIMIT ${MAX_SAVED_WORDS_PER_GUILD}`)
      .all(guildId) as SavedWordResponse[];
  }
  wordResponseCache.set(guildId, { rules, expiresAt: Date.now() + WORD_RESPONSE_CACHE_TTL_MS });
  return rules;
}

export async function findSavedWordResponse(guildId: string, content: string): Promise<string | undefined> {
  const words = content.normalize('NFKC').toLocaleLowerCase('es-MX').match(MESSAGE_WORD_PATTERN) ?? [];
  if (!words.length) return undefined;
  const rules = await getSavedWordResponses(guildId);
  const responses = new Map(rules.map((rule) => [rule.triggerKey, rule.response]));
  // Reply once per message, using the first configured word in the text to prevent spam.
  for (const word of words) {
    const response = responses.get(word);
    if (response) return response;
  }
  return undefined;
}
