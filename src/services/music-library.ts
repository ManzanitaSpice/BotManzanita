import { GLOBAL_SCOPE_ID } from '../storage/global-scope.js';
import { randomInt } from 'node:crypto';
import type { Track } from 'lavalink-client';
import { db } from '../storage/database.js';

export type FavoriteTrack = {
  id: number;
  trackUri: string;
  title: string;
  author: string;
  durationMs: number;
  artworkUrl: string | null;
  savedAt: number;
};

export type SavedPlaylist = {
  id: number;
  name: string;
  trackCount: number;
  createdAt: number;
};

export type SavedPlaylistTrack = Omit<FavoriteTrack, 'savedAt'> & { addedAt: number };
export type MusicHistoryTrack = Omit<FavoriteTrack, 'savedAt'> & { playedAt: number };

const MAX_FAVORITES = 25;
export const MAX_PLAYLISTS = 3;
export const MAX_PLAYLIST_TRACKS = 30;
const FAVORITE_RETENTION_SECONDS = 3 * 24 * 60 * 60;
const MUSIC_HISTORY_RETENTION_MS = 2 * 60 * 60 * 1000;
const MUSIC_HISTORY_LIMIT = 30;

export function pruneExpiredFavorites(now = Math.floor(Date.now() / 1000)): number {
  return db.prepare('DELETE FROM music_favorites WHERE saved_at <= ?')
    .run(now - FAVORITE_RETENTION_SECONDS).changes;
}

function trackValues(track: Track) {
  const identifier = track.info.identifier?.trim();
  const sourcePrefix = track.info.sourceName === 'youtube' ? 'ytsearch'
    : track.info.sourceName === 'soundcloud' ? 'scsearch'
      : track.info.sourceName === 'spotify' ? 'spsearch' : undefined;
  const uri = track.info.uri?.trim() || (identifier && sourcePrefix ? `${sourcePrefix}:${identifier}` : undefined);
  if (!uri) throw new Error('Esta pista no proporciona un enlace que pueda guardarse.');
  return {
    uri,
    title: track.info.title.slice(0, 200),
    author: (track.info.author || 'Artista desconocido').slice(0, 200),
    durationMs: Math.max(0, track.info.duration || 0),
    artworkUrl: track.info.artworkUrl || null,
  };
}

export function pruneExpiredMusicHistory(now = Date.now()): number {
  return db.prepare('DELETE FROM music_history WHERE played_at <= ?')
    .run(now - MUSIC_HISTORY_RETENTION_MS).changes;
}

export function recordMusicHistory(guildId: string, userId: string, track: Track, playedAt = Date.now()): void {
  guildId = GLOBAL_SCOPE_ID;
  const values = trackValues(track);
  const save = db.transaction(() => {
    db.prepare('DELETE FROM music_history WHERE played_at <= ?').run(playedAt - MUSIC_HISTORY_RETENTION_MS);
    db.prepare(`INSERT INTO music_history
      (guild_id, user_id, track_uri, title, author, duration_ms, artwork_url, played_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(guildId, userId, values.uri, values.title, values.author, values.durationMs, values.artworkUrl, playedAt);
    db.prepare(`DELETE FROM music_history
      WHERE guild_id = ? AND user_id = ? AND id NOT IN (
        SELECT id FROM music_history
        WHERE guild_id = ? AND user_id = ?
        ORDER BY played_at DESC, id DESC LIMIT ?
      )`).run(guildId, userId, guildId, userId, MUSIC_HISTORY_LIMIT);
  });
  save.immediate();
}

export function getMusicHistory(guildId: string, userId: string): MusicHistoryTrack[] {
  pruneExpiredMusicHistory();
  guildId = GLOBAL_SCOPE_ID;
  return db.prepare(`SELECT id, track_uri AS trackUri, title, author, duration_ms AS durationMs,
      artwork_url AS artworkUrl, played_at AS playedAt
    FROM music_history WHERE guild_id = ? AND user_id = ?
    ORDER BY played_at DESC, id DESC LIMIT ?`)
    .all(guildId, userId, MUSIC_HISTORY_LIMIT) as MusicHistoryTrack[];
}

export function addFavorite(guildId: string, userId: string, track: Track): 'saved' | 'exists' | 'full' {
  pruneExpiredFavorites();
  guildId = GLOBAL_SCOPE_ID;
  const values = trackValues(track);
  const save = db.transaction(() => {
    const existing = db.prepare('SELECT 1 FROM music_favorites WHERE guild_id = ? AND user_id = ? AND track_uri = ?')
      .get(guildId, userId, values.uri);
    if (existing) return 'exists' as const;
    const { count } = db.prepare('SELECT COUNT(*) AS count FROM music_favorites WHERE guild_id = ? AND user_id = ?')
      .get(guildId, userId) as { count: number };
    if (count >= MAX_FAVORITES) return 'full' as const;
    db.prepare(`INSERT INTO music_favorites
      (guild_id, user_id, track_uri, title, author, duration_ms, artwork_url)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(guildId, userId, values.uri, values.title, values.author, values.durationMs, values.artworkUrl);
    return 'saved' as const;
  });
  return save.immediate();
}

export function getFavorites(guildId: string, userId: string): FavoriteTrack[] {
  pruneExpiredFavorites();
  guildId = GLOBAL_SCOPE_ID;
  return db.prepare(`SELECT id, track_uri AS trackUri, title, author, duration_ms AS durationMs,
      artwork_url AS artworkUrl, saved_at AS savedAt
    FROM music_favorites WHERE guild_id = ? AND user_id = ? ORDER BY saved_at DESC, id DESC LIMIT ?`)
    .all(guildId, userId, MAX_FAVORITES) as FavoriteTrack[];
}

export function getFavorite(guildId: string, userId: string, id: number): FavoriteTrack | undefined {
  pruneExpiredFavorites();
  guildId = GLOBAL_SCOPE_ID;
  return db.prepare(`SELECT id, track_uri AS trackUri, title, author, duration_ms AS durationMs,
      artwork_url AS artworkUrl, saved_at AS savedAt
    FROM music_favorites WHERE guild_id = ? AND user_id = ? AND id = ?`)
    .get(guildId, userId, id) as FavoriteTrack | undefined;
}

export function removeFavorite(guildId: string, userId: string, id: number): boolean {
  guildId = GLOBAL_SCOPE_ID;
  return db.prepare('DELETE FROM music_favorites WHERE guild_id = ? AND user_id = ? AND id = ?')
    .run(guildId, userId, id).changes > 0;
}

function normalizePlaylistName(name: string): { name: string; normalizedName: string } {
  const cleanName = name.trim().replace(/\s+/g, ' ');
  if (!cleanName || cleanName.length > 32) throw new Error('El nombre de la lista debe tener entre 1 y 32 caracteres.');
  return { name: cleanName, normalizedName: cleanName.toLocaleLowerCase('es-MX') };
}

export function saveTrackToPlaylist(
  guildId: string,
  userId: string,
  name: string,
  track: Track,
): { state: 'added' | 'exists' | 'playlist_limit' | 'track_limit'; name: string; count: number } {
  guildId = GLOBAL_SCOPE_ID;
  const playlistName = normalizePlaylistName(name);
  const values = trackValues(track);
  const save = db.transaction(() => {
    let playlist = db.prepare(`SELECT id, name FROM music_playlists
      WHERE guild_id = ? AND user_id = ? AND normalized_name = ?`)
      .get(guildId, userId, playlistName.normalizedName) as { id: number; name: string } | undefined;
    if (!playlist) {
      const { count } = db.prepare('SELECT COUNT(*) AS count FROM music_playlists WHERE guild_id = ? AND user_id = ?')
        .get(guildId, userId) as { count: number };
      if (count >= MAX_PLAYLISTS) return { state: 'playlist_limit' as const, name: playlistName.name, count: 0 };
      const result = db.prepare(`INSERT INTO music_playlists (guild_id, user_id, name, normalized_name)
        VALUES (?, ?, ?, ?)`).run(guildId, userId, playlistName.name, playlistName.normalizedName);
      playlist = { id: Number(result.lastInsertRowid), name: playlistName.name };
    }
    const existing = db.prepare('SELECT 1 FROM music_playlist_tracks WHERE playlist_id = ? AND track_uri = ?')
      .get(playlist.id, values.uri);
    const { count } = db.prepare('SELECT COUNT(*) AS count FROM music_playlist_tracks WHERE playlist_id = ?')
      .get(playlist.id) as { count: number };
    if (existing) return { state: 'exists' as const, name: playlist.name, count };
    if (count >= MAX_PLAYLIST_TRACKS) return { state: 'track_limit' as const, name: playlist.name, count };
    db.prepare(`INSERT INTO music_playlist_tracks
      (playlist_id, track_uri, title, author, duration_ms, artwork_url)
      VALUES (?, ?, ?, ?, ?, ?)`).run(playlist.id, values.uri, values.title, values.author, values.durationMs, values.artworkUrl);
    return { state: 'added' as const, name: playlist.name, count: count + 1 };
  });
  return save.immediate();
}

export function saveTracksToPlaylist(
  guildId: string,
  userId: string,
  name: string,
  tracks: MusicHistoryTrack[],
): { state: 'created' | 'exists' | 'playlist_limit' | 'track_limit' | 'empty'; name: string; count: number } {
  guildId = GLOBAL_SCOPE_ID;
  const playlistName = normalizePlaylistName(name);
  if (!tracks.length) return { state: 'empty', name: playlistName.name, count: 0 };
  if (tracks.length > MAX_PLAYLIST_TRACKS) return { state: 'track_limit', name: playlistName.name, count: 0 };
  const values = tracks.map((track) => ({
    uri: track.trackUri.trim(),
    title: track.title.slice(0, 200),
    author: (track.author || 'Artista desconocido').slice(0, 200),
    durationMs: Math.max(0, track.durationMs || 0),
    artworkUrl: track.artworkUrl || null,
  }));
  if (values.some((track) => !track.uri)) throw new Error('Una canción del historial no tiene un enlace reproducible.');
  const save = db.transaction(() => {
    const existing = db.prepare(`SELECT id FROM music_playlists
      WHERE guild_id = ? AND user_id = ? AND normalized_name = ?`)
      .get(guildId, userId, playlistName.normalizedName);
    if (existing) return { state: 'exists' as const, name: playlistName.name, count: 0 };
    const { count: playlistCount } = db.prepare('SELECT COUNT(*) AS count FROM music_playlists WHERE guild_id = ? AND user_id = ?')
      .get(guildId, userId) as { count: number };
    if (playlistCount >= MAX_PLAYLISTS) return { state: 'playlist_limit' as const, name: playlistName.name, count: 0 };
    const created = db.prepare('INSERT INTO music_playlists (guild_id, user_id, name, normalized_name) VALUES (?, ?, ?, ?)')
      .run(guildId, userId, playlistName.name, playlistName.normalizedName);
    const playlistId = Number(created.lastInsertRowid);
    const insertTrack = db.prepare(`INSERT INTO music_playlist_tracks
      (playlist_id, track_uri, title, author, duration_ms, artwork_url)
      VALUES (?, ?, ?, ?, ?, ?)`);
    for (const track of values) {
      insertTrack.run(playlistId, track.uri, track.title, track.author, track.durationMs, track.artworkUrl);
    }
    return { state: 'created' as const, name: playlistName.name, count: values.length };
  });
  return save.immediate();
}

export function getPlaylists(guildId: string, userId: string): SavedPlaylist[] {
  guildId = GLOBAL_SCOPE_ID;
  const playlists = db.prepare(`SELECT p.id, p.name, p.created_at AS createdAt, COUNT(t.id) AS trackCount
    FROM music_playlists p LEFT JOIN music_playlist_tracks t ON t.playlist_id = p.id
    WHERE p.guild_id = ? AND p.user_id = ? GROUP BY p.id ORDER BY p.name COLLATE NOCASE`)
    .all(guildId, userId) as SavedPlaylist[];
  return playlists.map((playlist) => ({ ...playlist, trackCount: Math.min(playlist.trackCount, MAX_PLAYLIST_TRACKS) }));
}

export function getPlaylist(guildId: string, userId: string, name: string): { playlist: SavedPlaylist; tracks: SavedPlaylistTrack[] } | undefined {
  guildId = GLOBAL_SCOPE_ID;
  const { normalizedName } = normalizePlaylistName(name);
  const row = db.prepare(`SELECT p.id, p.name, p.created_at AS createdAt, COUNT(t.id) AS trackCount
    FROM music_playlists p LEFT JOIN music_playlist_tracks t ON t.playlist_id = p.id
    WHERE p.guild_id = ? AND p.user_id = ? AND p.normalized_name = ? GROUP BY p.id`)
    .get(guildId, userId, normalizedName) as (SavedPlaylist & { id: number }) | undefined;
  if (!row) return undefined;
  row.trackCount = Math.min(row.trackCount, MAX_PLAYLIST_TRACKS);
  const tracks = db.prepare(`SELECT id, track_uri AS trackUri, title, author, duration_ms AS durationMs,
      artwork_url AS artworkUrl, added_at AS addedAt
    FROM music_playlist_tracks WHERE playlist_id = ? ORDER BY added_at, id LIMIT ?`)
    .all(row.id, MAX_PLAYLIST_TRACKS) as SavedPlaylistTrack[];
  return { playlist: row, tracks };
}

export function shufflePlaylist(guildId: string, userId: string, name: string): { name: string; count: number } | undefined {
  guildId = GLOBAL_SCOPE_ID;
  const playlist = getPlaylist(guildId, userId, name);
  if (!playlist) return undefined;
  const tracks = [...playlist.tracks];
  for (let index = tracks.length - 1; index > 0; index--) {
    const swapIndex = randomInt(index + 1);
    [tracks[index], tracks[swapIndex]] = [tracks[swapIndex]!, tracks[index]!];
  }
  if (tracks.length > 1) {
    const reorder = db.transaction(() => {
      db.prepare('DELETE FROM music_playlist_tracks WHERE playlist_id = ?').run(playlist.playlist.id);
      const insert = db.prepare(`INSERT INTO music_playlist_tracks
        (playlist_id, track_uri, title, author, duration_ms, artwork_url, added_at)
        VALUES (?, ?, ?, ?, ?, ?, 0)`);
      for (const track of tracks) {
        insert.run(playlist.playlist.id, track.trackUri, track.title, track.author, track.durationMs, track.artworkUrl);
      }
    });
    reorder.immediate();
  }
  return { name: playlist.playlist.name, count: tracks.length };
}

export function removePlaylistTrack(guildId: string, userId: string, name: string, position: number): boolean {
  guildId = GLOBAL_SCOPE_ID;
  const playlist = getPlaylist(guildId, userId, name);
  if (!playlist || !Number.isSafeInteger(position) || position < 1) return false;
  const track = playlist.tracks[position - 1];
  if (!track) return false;
  return db.prepare('DELETE FROM music_playlist_tracks WHERE id = ?').run(track.id).changes > 0;
}

export function deletePlaylist(guildId: string, userId: string, name: string): boolean {
  guildId = GLOBAL_SCOPE_ID;
  const { normalizedName } = normalizePlaylistName(name);
  return db.prepare('DELETE FROM music_playlists WHERE guild_id = ? AND user_id = ? AND normalized_name = ?')
    .run(guildId, userId, normalizedName).changes > 0;
}
