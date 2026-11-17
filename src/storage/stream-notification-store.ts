import { db } from './database.js';

export type StreamPlatform = 'twitch' | 'kick';

export interface StreamNotification {
  guildId: string;
  platform: StreamPlatform;
  username: string;
  ownerId: string;
  channelId: string;
  message: string;
  isLive: boolean;
  lastStartedAt: string | null;
  checkedAt: number;
}

interface StreamNotificationRow {
  guild_id: string;
  platform: StreamPlatform;
  username: string;
  owner_id: string;
  channel_id: string;
  message: string;
  is_live: number;
  last_started_at: string | null;
  checked_at: number;
}

export function initializeStreamNotificationStorage(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS stream_notifications (
      guild_id TEXT NOT NULL,
      platform TEXT NOT NULL CHECK (platform IN ('twitch', 'kick')),
      username TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      message TEXT NOT NULL,
      is_live INTEGER NOT NULL DEFAULT 0,
      last_started_at TEXT,
      checked_at INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      PRIMARY KEY (guild_id, platform, username)
    );
    CREATE INDEX IF NOT EXISTS idx_stream_notifications_platform_username
      ON stream_notifications (platform, username);
  `);
}

export function getStreamNotification(guildId: string, platform: StreamPlatform, username: string): StreamNotification | undefined {
  const row = db.prepare(`
    SELECT guild_id, platform, username, owner_id, channel_id, message, is_live, last_started_at, checked_at
    FROM stream_notifications
    WHERE guild_id=? AND platform=? AND username=?
  `).get(guildId, platform, username) as StreamNotificationRow | undefined;
  return row ? toNotification(row) : undefined;
}

export function listStreamNotifications(guildId?: string, platform?: StreamPlatform): StreamNotification[] {
  const rows = db.prepare(`
    SELECT guild_id, platform, username, owner_id, channel_id, message, is_live, last_started_at, checked_at
    FROM stream_notifications
    WHERE (? IS NULL OR guild_id=?) AND (? IS NULL OR platform=?)
    ORDER BY platform, username, guild_id
  `).all(guildId ?? null, guildId ?? null, platform ?? null, platform ?? null) as StreamNotificationRow[];
  return rows.map(toNotification);
}

export function countStreamNotifications(guildId: string): number {
  const row = db.prepare('SELECT COUNT(*) AS count FROM stream_notifications WHERE guild_id=?').get(guildId) as { count: number };
  return row.count;
}

export function saveStreamNotification(notification: Omit<StreamNotification, 'isLive' | 'lastStartedAt' | 'checkedAt'>): void {
  db.prepare(`
    INSERT INTO stream_notifications (guild_id, platform, username, owner_id, channel_id, message)
    VALUES (@guildId, @platform, @username, @ownerId, @channelId, @message)
    ON CONFLICT (guild_id, platform, username) DO UPDATE SET
      owner_id=excluded.owner_id,
      channel_id=excluded.channel_id,
      message=excluded.message,
      updated_at=unixepoch()
  `).run(notification);
}

export function removeStreamNotification(guildId: string, platform: StreamPlatform, username: string): boolean {
  return db.prepare('DELETE FROM stream_notifications WHERE guild_id=? AND platform=? AND username=?').run(guildId, platform, username).changes > 0;
}

export function updateStreamNotificationState(
  notification: Pick<StreamNotification, 'guildId' | 'platform' | 'username'>,
  state: Pick<StreamNotification, 'isLive' | 'lastStartedAt'>,
): void {
  db.prepare(`
    UPDATE stream_notifications
    SET is_live=@isLive, last_started_at=@lastStartedAt, checked_at=unixepoch(), updated_at=unixepoch()
    WHERE guild_id=@guildId AND platform=@platform AND username=@username
  `).run({
    guildId: notification.guildId,
    platform: notification.platform,
    username: notification.username,
    isLive: state.isLive ? 1 : 0,
    lastStartedAt: state.lastStartedAt,
  });
}

function toNotification(row: StreamNotificationRow): StreamNotification {
  return {
    guildId: row.guild_id,
    platform: row.platform,
    username: row.username,
    ownerId: row.owner_id,
    channelId: row.channel_id,
    message: row.message,
    isLive: row.is_live === 1,
    lastStartedAt: row.last_started_at,
    checkedAt: row.checked_at,
  };
}
