import { GLOBAL_SCOPE_ID } from '../storage/global-scope.js';
import { db } from '../storage/database.js';
const MAX_FAVORITES = 25;
const MAX_PLAYLISTS = 20;
const MAX_PLAYLIST_TRACKS = 100;
const FAVORITE_RETENTION_SECONDS = 3 * 24 * 60 * 60;
export function pruneExpiredFavorites(now = Math.floor(Date.now() / 1000)) {
    return db.prepare('DELETE FROM music_favorites WHERE saved_at <= ?')
        .run(now - FAVORITE_RETENTION_SECONDS).changes;
}
function trackValues(track) {
    const identifier = track.info.identifier?.trim();
    const sourcePrefix = track.info.sourceName === 'youtube' ? 'ytsearch'
        : track.info.sourceName === 'soundcloud' ? 'scsearch'
            : track.info.sourceName === 'spotify' ? 'spsearch' : undefined;
    const uri = track.info.uri?.trim() || (identifier && sourcePrefix ? `${sourcePrefix}:${identifier}` : undefined);
    if (!uri)
        throw new Error('Esta pista no proporciona un enlace que pueda guardarse.');
    return {
        uri,
        title: track.info.title.slice(0, 200),
        author: (track.info.author || 'Artista desconocido').slice(0, 200),
        durationMs: Math.max(0, track.info.duration || 0),
        artworkUrl: track.info.artworkUrl || null,
    };
}
export function addFavorite(guildId, userId, track) {
    pruneExpiredFavorites();
    guildId = GLOBAL_SCOPE_ID;
    const values = trackValues(track);
    const save = db.transaction(() => {
        const existing = db.prepare('SELECT 1 FROM music_favorites WHERE guild_id = ? AND user_id = ? AND track_uri = ?')
            .get(guildId, userId, values.uri);
        if (existing)
            return 'exists';
        const { count } = db.prepare('SELECT COUNT(*) AS count FROM music_favorites WHERE guild_id = ? AND user_id = ?')
            .get(guildId, userId);
        if (count >= MAX_FAVORITES)
            return 'full';
        db.prepare(`INSERT INTO music_favorites
      (guild_id, user_id, track_uri, title, author, duration_ms, artwork_url)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(guildId, userId, values.uri, values.title, values.author, values.durationMs, values.artworkUrl);
        return 'saved';
    });
    return save.immediate();
}
export function getFavorites(guildId, userId) {
    pruneExpiredFavorites();
    guildId = GLOBAL_SCOPE_ID;
    return db.prepare(`SELECT id, track_uri AS trackUri, title, author, duration_ms AS durationMs,
      artwork_url AS artworkUrl, saved_at AS savedAt
    FROM music_favorites WHERE guild_id = ? AND user_id = ? ORDER BY saved_at DESC, id DESC LIMIT ?`)
        .all(guildId, userId, MAX_FAVORITES);
}
export function getFavorite(guildId, userId, id) {
    pruneExpiredFavorites();
    guildId = GLOBAL_SCOPE_ID;
    return db.prepare(`SELECT id, track_uri AS trackUri, title, author, duration_ms AS durationMs,
      artwork_url AS artworkUrl, saved_at AS savedAt
    FROM music_favorites WHERE guild_id = ? AND user_id = ? AND id = ?`)
        .get(guildId, userId, id);
}
export function removeFavorite(guildId, userId, id) {
    guildId = GLOBAL_SCOPE_ID;
    return db.prepare('DELETE FROM music_favorites WHERE guild_id = ? AND user_id = ? AND id = ?')
        .run(guildId, userId, id).changes > 0;
}
function normalizePlaylistName(name) {
    const cleanName = name.trim().replace(/\s+/g, ' ');
    if (!cleanName || cleanName.length > 32)
        throw new Error('El nombre de la lista debe tener entre 1 y 32 caracteres.');
    return { name: cleanName, normalizedName: cleanName.toLocaleLowerCase('es-MX') };
}
export function saveTrackToPlaylist(guildId, userId, name, track) {
    guildId = GLOBAL_SCOPE_ID;
    const playlistName = normalizePlaylistName(name);
    const values = trackValues(track);
    const save = db.transaction(() => {
        let playlist = db.prepare(`SELECT id, name FROM music_playlists
      WHERE guild_id = ? AND user_id = ? AND normalized_name = ?`)
            .get(guildId, userId, playlistName.normalizedName);
        if (!playlist) {
            const { count } = db.prepare('SELECT COUNT(*) AS count FROM music_playlists WHERE guild_id = ? AND user_id = ?')
                .get(guildId, userId);
            if (count >= MAX_PLAYLISTS)
                return { state: 'playlist_limit', name: playlistName.name, count: 0 };
            const result = db.prepare(`INSERT INTO music_playlists (guild_id, user_id, name, normalized_name)
        VALUES (?, ?, ?, ?)`).run(guildId, userId, playlistName.name, playlistName.normalizedName);
            playlist = { id: Number(result.lastInsertRowid), name: playlistName.name };
        }
        const existing = db.prepare('SELECT 1 FROM music_playlist_tracks WHERE playlist_id = ? AND track_uri = ?')
            .get(playlist.id, values.uri);
        const { count } = db.prepare('SELECT COUNT(*) AS count FROM music_playlist_tracks WHERE playlist_id = ?')
            .get(playlist.id);
        if (existing)
            return { state: 'exists', name: playlist.name, count };
        if (count >= MAX_PLAYLIST_TRACKS)
            return { state: 'track_limit', name: playlist.name, count };
        db.prepare(`INSERT INTO music_playlist_tracks
      (playlist_id, track_uri, title, author, duration_ms, artwork_url)
      VALUES (?, ?, ?, ?, ?, ?)`).run(playlist.id, values.uri, values.title, values.author, values.durationMs, values.artworkUrl);
        return { state: 'added', name: playlist.name, count: count + 1 };
    });
    return save.immediate();
}
export function getPlaylists(guildId, userId) {
    guildId = GLOBAL_SCOPE_ID;
    return db.prepare(`SELECT p.id, p.name, p.created_at AS createdAt, COUNT(t.id) AS trackCount
    FROM music_playlists p LEFT JOIN music_playlist_tracks t ON t.playlist_id = p.id
    WHERE p.guild_id = ? AND p.user_id = ? GROUP BY p.id ORDER BY p.name COLLATE NOCASE`)
        .all(guildId, userId);
}
export function getPlaylist(guildId, userId, name) {
    guildId = GLOBAL_SCOPE_ID;
    const { normalizedName } = normalizePlaylistName(name);
    const row = db.prepare(`SELECT p.id, p.name, p.created_at AS createdAt, COUNT(t.id) AS trackCount
    FROM music_playlists p LEFT JOIN music_playlist_tracks t ON t.playlist_id = p.id
    WHERE p.guild_id = ? AND p.user_id = ? AND p.normalized_name = ? GROUP BY p.id`)
        .get(guildId, userId, normalizedName);
    if (!row)
        return undefined;
    const tracks = db.prepare(`SELECT id, track_uri AS trackUri, title, author, duration_ms AS durationMs,
      artwork_url AS artworkUrl, added_at AS addedAt
    FROM music_playlist_tracks WHERE playlist_id = ? ORDER BY added_at, id LIMIT ?`)
        .all(row.id, MAX_PLAYLIST_TRACKS);
    return { playlist: row, tracks };
}
export function removePlaylistTrack(guildId, userId, name, position) {
    guildId = GLOBAL_SCOPE_ID;
    const playlist = getPlaylist(guildId, userId, name);
    if (!playlist || !Number.isSafeInteger(position) || position < 1)
        return false;
    const track = playlist.tracks[position - 1];
    if (!track)
        return false;
    return db.prepare('DELETE FROM music_playlist_tracks WHERE id = ?').run(track.id).changes > 0;
}
export function deletePlaylist(guildId, userId, name) {
    guildId = GLOBAL_SCOPE_ID;
    const { normalizedName } = normalizePlaylistName(name);
    return db.prepare('DELETE FROM music_playlists WHERE guild_id = ? AND user_id = ? AND normalized_name = ?')
        .run(guildId, userId, normalizedName).changes > 0;
}
