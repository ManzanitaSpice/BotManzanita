import { db } from './database.js';
export function initializeStreamNotificationStorage() {
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
export function getStreamNotification(guildId, platform, username) {
    const row = db.prepare(`
    SELECT guild_id, platform, username, owner_id, channel_id, message, is_live, last_started_at, checked_at
    FROM stream_notifications
    WHERE guild_id=? AND platform=? AND username=?
  `).get(guildId, platform, username);
    return row ? toNotification(row) : undefined;
}
export function listStreamNotifications(guildId, platform) {
    const rows = db.prepare(`
    SELECT guild_id, platform, username, owner_id, channel_id, message, is_live, last_started_at, checked_at
    FROM stream_notifications
    WHERE (? IS NULL OR guild_id=?) AND (? IS NULL OR platform=?)
    ORDER BY platform, username, guild_id
  `).all(guildId ?? null, guildId ?? null, platform ?? null, platform ?? null);
    return rows.map(toNotification);
}
export function countStreamNotifications(guildId) {
    const row = db.prepare('SELECT COUNT(*) AS count FROM stream_notifications WHERE guild_id=?').get(guildId);
    return row.count;
}
export function saveStreamNotification(notification) {
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
export function removeStreamNotification(guildId, platform, username) {
    return db.prepare('DELETE FROM stream_notifications WHERE guild_id=? AND platform=? AND username=?').run(guildId, platform, username).changes > 0;
}
export function updateStreamNotificationState(notification, state) {
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
function toNotification(row) {
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
