import type { QueueStoreManager, StoredQueue, Track, UnresolvedTrack } from 'lavalink-client';
import { db } from './database.js';

const emptyQueue: StoredQueue = { current: null, previous: [], tracks: [] };
export const MUSIC_QUEUE_RECOVERY_SECONDS = 60 * 60;

function safeTrack(track: Track | UnresolvedTrack | null): Track | UnresolvedTrack | null {
  if (!track) return null;
  const requester = track.requester as (Record<string, unknown> & { toJSON?: () => unknown }) | undefined;
  let safeRequester: unknown = requester;
  if (requester && typeof requester === 'object') {
    try {
      safeRequester = typeof requester.toJSON === 'function'
        ? requester.toJSON()
        : Object.fromEntries(['id', 'username', 'globalName', 'displayName', 'avatar'].flatMap((key) => key in requester ? [[key, requester[key]]] : []));
    } catch {
      safeRequester = { id: requester.id, username: requester.username };
    }
  }
  return { encoded: track.encoded, info: track.info, pluginInfo: track.pluginInfo, requester: safeRequester } as Track | UnresolvedTrack;
}

function normalizeQueue(value: unknown): StoredQueue {
  if (!value || typeof value !== 'object') return { ...emptyQueue };
  const queue = value as Partial<StoredQueue>;
  return {
    current: safeTrack(queue.current ?? null) as Track | null,
    previous: Array.isArray(queue.previous) ? queue.previous.map((track) => safeTrack(track) as Track).filter((track): track is Track => track !== null) : [],
    tracks: Array.isArray(queue.tracks) ? queue.tracks.map((track) => safeTrack(track)).filter((track): track is Track | UnresolvedTrack => track !== null) : [],
  };
}

export class SQLiteMusicQueueStore implements QueueStoreManager {
  get(guildId: string): string {
    const row = db.prepare('SELECT queue_json AS queueJson, updated_at AS updatedAt FROM music_queue_store WHERE guild_id = ?')
      .get(guildId) as { queueJson: string; updatedAt: number } | undefined;
    if (row && row.updatedAt <= Math.floor(Date.now() / 1000) - MUSIC_QUEUE_RECOVERY_SECONDS) {
      db.prepare('DELETE FROM music_queue_store WHERE guild_id = ?').run(guildId);
      return JSON.stringify(emptyQueue);
    }
    return row?.queueJson ?? JSON.stringify(emptyQueue);
  }

  set(guildId: string, value: StoredQueue | string): void {
    const parsed = typeof value === 'string' ? normalizeQueue(this.parse(value)) : normalizeQueue(value);
    const serialized = this.stringify(parsed);
    if (!parsed.current && !parsed.previous.length && !parsed.tracks.length) {
      this.delete(guildId);
      return;
    }
    db.prepare(`INSERT INTO music_queue_store (guild_id, queue_json, updated_at) VALUES (?, ?, unixepoch())
      ON CONFLICT(guild_id) DO UPDATE SET queue_json = excluded.queue_json, updated_at = unixepoch()`)
      .run(guildId, serialized);
  }

  delete(guildId: string): void {
    // Lavalink also deletes the store when a player is destroyed. Keep a non-empty
    // queue so a transient voice disconnect or process restart does not lose it.
    const row = db.prepare('SELECT queue_json AS queueJson FROM music_queue_store WHERE guild_id = ?')
      .get(guildId) as { queueJson: string } | undefined;
    if (!row) return;
    const queue = this.parse(row.queueJson);
    if (!queue.current && !queue.tracks?.length && !queue.previous?.length) {
      db.prepare('DELETE FROM music_queue_store WHERE guild_id = ?').run(guildId);
    }
  }

  stringify(value: StoredQueue | string): string {
    return typeof value === 'string' ? value : JSON.stringify(normalizeQueue(value));
  }

  parse(value: StoredQueue | string | undefined): Partial<StoredQueue> {
    if (!value) return { ...emptyQueue };
    if (typeof value !== 'string') return normalizeQueue(value);
    try {
      return normalizeQueue(JSON.parse(value) as unknown);
    } catch {
      return { ...emptyQueue };
    }
  }
}

const queueStore = new SQLiteMusicQueueStore();

export function getPersistedMusicQueue(guildId: string): StoredQueue {
  return normalizeQueue(queueStore.parse(queueStore.get(guildId)));
}

export function getMusicQueueRecovery(guildId: string): { queue: StoredQueue; voiceChannelId: string | null; expiresAt: number } | undefined {
  const row = db.prepare('SELECT queue_json AS queueJson, voice_channel_id AS voiceChannelId, updated_at AS updatedAt FROM music_queue_store WHERE guild_id = ?')
    .get(guildId) as { queueJson: string; voiceChannelId: string | null; updatedAt: number } | undefined;
  if (!row) return undefined;
  const expiresAt = row.updatedAt + MUSIC_QUEUE_RECOVERY_SECONDS;
  if (expiresAt <= Math.floor(Date.now() / 1000)) {
    db.prepare('DELETE FROM music_queue_store WHERE guild_id = ?').run(guildId);
    return undefined;
  }
  const queue = normalizeQueue(queueStore.parse(row.queueJson));
  if (!queue.current && !queue.tracks.length) return undefined;
  return { queue, voiceChannelId: row.voiceChannelId, expiresAt };
}

export function rememberMusicQueueChannel(guildId: string, voiceChannelId: string): void {
  db.prepare('UPDATE music_queue_store SET voice_channel_id = ? WHERE guild_id = ?').run(voiceChannelId, guildId);
}

export function removePersistedMusicQueueTrack(guildId: string, index: number): Track | UnresolvedTrack | undefined {
  if (!Number.isSafeInteger(index) || index < 0) return undefined;
  const queue = getPersistedMusicQueue(guildId);
  const [removed] = queue.tracks.splice(index, 1);
  if (!removed) return undefined;
  queueStore.set(guildId, queue);
  return removed;
}

export function musicQueueStoreManager(): QueueStoreManager {
  return queueStore;
}
