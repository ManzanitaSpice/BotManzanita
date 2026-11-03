import { GLOBAL_SCOPE_ID } from '../storage/global-scope.js';
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

const MAX_FAVORITES = 25;
const MAX_PLAYLISTS = 20;
const MAX_PLAYLIST_TRACKS = 100;

function trackValues(track: Track) {
  const uri = track.info.uri?.trim();
  if (!uri) throw new Error('Esta pista no proporciona un enlace que pueda guardarse.');
  return {
    uri,
    title: track.info.title.slice(0, 200),
    author: (track.info.author || 'Artista desconocido').slice(0, 200),
    durationMs: Math.max(0, track.info.duration || 0),
    artworkUrl: track.info.artworkUrl || null,
  };
}

export function addFavorite(guildId: string, userId: string, track: Track): 'saved' | 'exists' | 'full' {
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
  guildId = GLOBAL_SCOPE_ID;
  return db.prepare(`SELECT id, track_uri AS trackUri, title, author, duration_ms AS durationMs,
      artwork_url AS artworkUrl, saved_at AS savedAt
    FROM music_favorites WHERE guild_id = ? AND user_id = ? ORDER BY saved_at DESC, id DESC LIMIT ?`)
    .all(guildId, userId, MAX_FAVORITES) as FavoriteTrack[];
}

export function getFavorite(guildId: string, userId: string, id: number): FavoriteTrack | undefined {
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

export function getPlaylists(guildId: string, userId: string): SavedPlaylist[] {
  guildId = GLOBAL_SCOPE_ID;
  return db.prepare(`SELECT p.id, p.name, p.created_at AS createdAt, COUNT(t.id) AS trackCount
    FROM music_playlists p LEFT JOIN music_playlist_tracks t ON t.playlist_id = p.id
    WHERE p.guild_id = ? AND p.user_id = ? GROUP BY p.id ORDER BY p.name COLLATE NOCASE`)
    .all(guildId, userId) as SavedPlaylist[];
}

export function getPlaylist(guildId: string, userId: string, name: string): { playlist: SavedPlaylist; tracks: SavedPlaylistTrack[] } | undefined {
  guildId = GLOBAL_SCOPE_ID;
  const { normalizedName } = normalizePlaylistName(name);
  const row = db.prepare(`SELECT p.id, p.name, p.created_at AS createdAt, COUNT(t.id) AS trackCount
    FROM music_playlists p LEFT JOIN music_playlist_tracks t ON t.playlist_id = p.id
    WHERE p.guild_id = ? AND p.user_id = ? AND p.normalized_name = ? GROUP BY p.id`)
    .get(guildId, userId, normalizedName) as (SavedPlaylist & { id: number }) | undefined;
  if (!row) return undefined;
  const tracks = db.prepare(`SELECT id, track_uri AS trackUri, title, author, duration_ms AS durationMs,
      artwork_url AS artworkUrl, added_at AS addedAt
    FROM music_playlist_tracks WHERE playlist_id = ? ORDER BY added_at, id LIMIT ?`)
    .all(row.id, MAX_PLAYLIST_TRACKS) as SavedPlaylistTrack[];
  return { playlist: row, tracks };
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
