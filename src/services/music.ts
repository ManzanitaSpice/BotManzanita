import { randomBytes } from 'node:crypto';
import type { Client, Message } from 'discord.js';
import type { Player, Track, TrackRequester, UnresolvedTrack } from 'lavalink-client';
import { musicPanel } from '../ui/panels.js';
import { getMusicQueueRecovery, rememberMusicQueueChannel } from '../storage/music-queue-store.js';

export type MusicEffect = 'normal' | 'bass' | 'rock' | 'pop' | 'nightcore' | 'vaporwave';

type PanelReference = { message: Message };
type SearchSession = { userId: string; guildId: string; tracks: Track[]; expiresAt: number };
const panelReferences = new Map<string, PanelReference>();
const searchSessions = new Map<string, SearchSession>();
const MAX_SEARCH_SESSIONS = 1_000;
const MAX_MUSIC_QUEUE_TRACKS = 1_000;
const restoredQueues = new WeakSet<Player>();

export function rememberMusicPanel(guildId: string, message: Message): void {
  panelReferences.set(guildId, { message });
}

export async function refreshMusicPanel(client: Client, guildId: string): Promise<void> {
  const reference = panelReferences.get(guildId);
  if (!reference) return;
  try {
    await reference.message.edit(musicPanel(guildId, client.lavalink.getPlayer(guildId)));
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
    if (code === 10008 || code === 10003 || code === 50001 || code === 50013) panelReferences.delete(guildId);
    else console.error(`No se pudo actualizar el panel musical de ${guildId}:`, error);
  }
}

export async function refreshActiveMusicPanels(client: Client): Promise<void> {
  const activeGuildIds = [...panelReferences.keys()].filter((guildId) => client.lavalink.getPlayer(guildId)?.playing);
  await Promise.allSettled(activeGuildIds.map((guildId) => refreshMusicPanel(client, guildId)));
}

export async function searchTracks(client: Client, query: string, user: TrackRequester): Promise<Track[]> {
  if (!query.trim()) throw new Error('Escribe el nombre de una canción o pega un enlace.');
  if (!client.lavalink.useable) throw new Error('El nodo de audio aún no está disponible.');
  const node = client.lavalink.nodeManager.leastUsedNodes('memory').find((candidate) => candidate.connected);
  if (!node) throw new Error('No hay nodos de audio conectados.');
  const result = await searchWithFallback((identifier) => node.search(identifier, user, true), query);
  return result?.tracks ?? [];
}

async function searchWithFallback<T extends { tracks: (Track | UnresolvedTrack)[]; loadType: string }>(
  search: (identifier: string) => Promise<T>,
  query: string,
): Promise<T | undefined> {
  const trimmed = query.trim().replace(/^<(.+)>$/, '$1');
  const youtubePlaylistId = youtubePlaylistIdFromUrl(trimmed);
  if (youtubePlaylistId) {
    let lastError: unknown;
    const playlistUrl = `https://www.youtube.com/playlist?list=${encodeURIComponent(youtubePlaylistId)}`;
    const musicPlaylistUrl = `https://music.youtube.com/playlist?list=${encodeURIComponent(youtubePlaylistId)}`;
    const identifiers = [...new Set([trimmed, playlistUrl, musicPlaylistUrl])];

    for (const identifier of identifiers) {
      try {
        const result = await search(identifier);
        if (result.loadType === 'playlist' && result.tracks.length) return result;
      } catch (error) {
        if (!isNothingFoundError(error)) lastError ??= error;
      }
    }

    if (lastError) throw lastError;
    return undefined;
  }

  const youtubeVideoId = youtubeVideoIdFromUrl(trimmed);
  if (youtubeVideoId) {
    let metadataResult: T | undefined;
    let lastError: unknown;
    for (const identifier of [trimmed, `ytsearch:${youtubeVideoId}`]) {
      try {
        const result = await search(identifier);
        if (!result.tracks.length) continue;
        // Keep YouTube playlists intact. For a single video URL, use the video
        // only to read its title/artist, then return a YouTube Music search hit.
        if (result.loadType === 'playlist') return result;
        metadataResult = result;
        break;
      } catch (error) {
        if (!isNothingFoundError(error)) lastError ??= error;
      }
    }

    const sourceTrack = metadataResult?.tracks[0];
    if (sourceTrack) {
      const title = sourceTrack.info.title?.trim();
      const author = sourceTrack.info.author?.trim();
      const musicQuery = [title, author && author.toLowerCase() !== 'unknown artist' ? author : undefined].filter(Boolean).join(' ');
      if (musicQuery) {
        for (const identifier of [`ytmsearch:${musicQuery}`, `ytsearch:${musicQuery}`]) {
          try {
            const musicResult = await search(identifier);
            if (musicResult.tracks.length) return musicResult;
          } catch (error) {
            if (!isNothingFoundError(error)) lastError ??= error;
          }
        }
      }
      if (lastError) throw searchProviderError(lastError);
      return { ...metadataResult!, tracks: [] } as T;
    }
    if (lastError) throw lastError;
    return metadataResult;
  }

  const isUrl = isHttpUrl(trimmed);
  const hasSourcePrefix = /^(?:ytmsearch|ytsearch|scsearch|spsearch):/i.test(trimmed);
  const identifiers = isUrl || hasSourcePrefix
    ? [trimmed]
    : [`ytmsearch:${trimmed}`, `ytsearch:${trimmed}`, `scsearch:${trimmed}`];
  let emptyResult: T | undefined;
  let lastError: unknown;

  for (const identifier of identifiers) {
    try {
      const result = await search(identifier);
      if (result.tracks.length) return result;
      emptyResult ??= result;
    } catch (error) {
      if (!isNothingFoundError(error)) lastError ??= error;
    }
  }

  if (lastError) throw searchProviderError(lastError);
  if (emptyResult) return emptyResult;
  return undefined;
}

function searchProviderError(cause: unknown): Error {
  return new Error('Un proveedor de música no respondió. Intenta otra vez o pega un enlace directo.', { cause });
}

function youtubeVideoIdFromUrl(value: string): string | undefined {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;

  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  let videoId: string | null = null;
  if (host === 'youtu.be') {
    videoId = url.pathname.split('/').filter(Boolean)[0] ?? null;
  } else if (['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com'].includes(host)) {
    videoId = url.searchParams.get('v');
    if (!videoId) videoId = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?]+)/)?.[1] ?? null;
  }

  return videoId && /^[\w-]{11}$/.test(videoId) ? videoId : undefined;
}

function youtubePlaylistIdFromUrl(value: string): string | undefined {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;

  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (!['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'youtu.be'].includes(host)) {
    return undefined;
  }

  const playlistId = url.searchParams.get('list')?.trim();
  return playlistId || undefined;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isNothingFoundError(error: unknown): boolean {
  return error instanceof Error && error.message === 'Nothing found';
}

export function rememberSearch(guildId: string, userId: string, tracks: Track[]): string {
  const now = Date.now();
  for (const [id, session] of searchSessions) {
    if (session.expiresAt <= now) searchSessions.delete(id);
  }
  while (searchSessions.size >= MAX_SEARCH_SESSIONS) {
    const oldestId = searchSessions.keys().next().value as string | undefined;
    if (!oldestId) break;
    searchSessions.delete(oldestId);
  }
  const id = randomBytes(6).toString('hex');
  searchSessions.set(id, { guildId, userId, tracks, expiresAt: now + 5 * 60_000 });
  return id;
}

export function takeSearchTrack(id: string, guildId: string, userId: string, index: number): Track | undefined {
  const session = searchSessions.get(id);
  if (!session || session.expiresAt <= Date.now()) {
    searchSessions.delete(id);
    return undefined;
  }
  if (session.guildId !== guildId || session.userId !== userId) return undefined;
  const track = session.tracks[index];
  if (track) searchSessions.delete(id);
  return track;
}

export async function addSelectedTrack(
  client: Client,
  input: { guildId: string; voiceChannelId: string; textChannelId: string; user: TrackRequester },
  track: Track,
): Promise<void> {
  const player = await getOrCreatePlayer(client, input);
  if (player.queue.tracks.length >= MAX_MUSIC_QUEUE_TRACKS) throw new Error(`La cola llegó al límite de ${MAX_MUSIC_QUEUE_TRACKS} canciones.`);
  if (!player.connected) await player.connect();
  if (player.queue.tracks.length >= MAX_MUSIC_QUEUE_TRACKS) throw new Error(`La cola llegó al límite de ${MAX_MUSIC_QUEUE_TRACKS} canciones.`);
  await player.queue.add(track);
  rememberMusicQueueChannel(input.guildId, input.voiceChannelId);
  if (!player.playing && !player.paused) await player.play();
}

export async function resumeSavedMusicQueue(
  client: Client,
  input: { guildId: string; voiceChannelId: string; textChannelId: string; user: TrackRequester },
): Promise<{ currentTitle: string; queuedTracks: number; expiresAt: number }> {
  if (!client.lavalink.useable) throw new Error('El nodo de audio aún no está disponible.');
  const recovery = getMusicQueueRecovery(input.guildId);
  if (!recovery) throw new Error('No hay una cola reciente para recuperar; las colas guardadas caducan en una hora.');
  if (recovery.voiceChannelId && recovery.voiceChannelId !== input.voiceChannelId) {
    throw new Error('Entra al mismo canal de voz donde estaba reproduciéndose la música.');
  }
  const existing = client.lavalink.getPlayer(input.guildId);
  if (existing && (existing.playing || existing.paused || existing.queue.current || existing.queue.tracks.length)) {
    throw new Error('Ya hay una sesión musical activa o una cola cargada en este servidor.');
  }
  const player = await getOrCreatePlayer(client, input);
  if (!player.connected) await player.connect();
  if (!player.queue.current && !player.queue.tracks.length) throw new Error('La cola guardada ya no tiene canciones reproducibles.');
  await player.play();
  rememberMusicQueueChannel(input.guildId, input.voiceChannelId);
  const title = player.queue.current?.info.title ?? 'La cola guardada';
  return { currentTitle: title, queuedTracks: player.queue.tracks.length, expiresAt: Math.floor(Date.now() / 1000) + 60 * 60 };
}

export async function disconnectPlayer(player: Player): Promise<void> {
  await player.stopPlaying(true);
  await player.destroy('requested disconnect');
}

export async function applyMusicEffect(player: Player, effect: MusicEffect): Promise<void> {
  await player.filterManager.resetFilters();
  if (effect === 'bass') await player.filterManager.setEQPreset('BassboostMedium');
  else if (effect === 'rock') await player.filterManager.setEQPreset('Rock');
  else if (effect === 'pop') await player.filterManager.setEQPreset('Pop');
  else if (effect === 'nightcore') await player.filterManager.toggleNightcore();
  else if (effect === 'vaporwave') await player.filterManager.toggleVaporwave();
}

export async function addSavedTracks(
  client: Client,
  input: {
    guildId: string;
    voiceChannelId: string;
    textChannelId: string;
    user: TrackRequester;
    uris: string[];
    replaceQueue?: boolean;
    repeatMode?: 'off' | 'track' | 'queue';
  },
): Promise<{ added: number; unavailable: number }> {
  if (!client.lavalink.useable) throw new Error('El nodo de audio aún no está disponible.');
  if (!input.uris.length) throw new Error('Esta lista no tiene canciones guardadas.');
  const player = await getOrCreatePlayer(client, input);
  if (input.uris.length > MAX_MUSIC_QUEUE_TRACKS) {
    throw new Error(`La lista supera el límite de ${MAX_MUSIC_QUEUE_TRACKS} canciones que se pueden cargar a la vez.`);
  }
  if (!input.replaceQueue && player.queue.tracks.length >= MAX_MUSIC_QUEUE_TRACKS) {
    throw new Error(`La cola llegó al límite de ${MAX_MUSIC_QUEUE_TRACKS} canciones.`);
  }
  if (!player.connected) await player.connect();

  const resolved: Array<Track | undefined> = new Array(input.uris.length);
  let nextIndex = 0;
  const resolveNext = async () => {
    while (nextIndex < input.uris.length) {
      const index = nextIndex++;
      try {
        const result = await searchWithFallback((identifier) => player.search(identifier, input.user, true), input.uris[index]!);
        const track = result?.tracks[0];
        if (!track) continue;
        if ('resolve' in track) await track.resolve(player);
        resolved[index] = 'resolve' in track ? undefined : track;
      } catch {
        resolved[index] = undefined;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, input.uris.length) }, () => resolveNext()));
  const tracks = resolved.filter((track): track is Track => track !== undefined);
  if (!tracks.length) throw new Error('No pude resolver ninguna canción guardada.');
  if (input.replaceQueue) await player.stopPlaying(true);
  else if (player.queue.tracks.length + tracks.length > MAX_MUSIC_QUEUE_TRACKS) {
    throw new Error(`La cola llegó al límite de ${MAX_MUSIC_QUEUE_TRACKS} canciones.`);
  }
  await player.queue.add(tracks);
  if (input.repeatMode) await player.setRepeatMode(input.repeatMode);
  rememberMusicQueueChannel(input.guildId, input.voiceChannelId);
  if (!player.playing && !player.paused) await player.play();
  return { added: tracks.length, unavailable: input.uris.length - tracks.length };
}

export async function addTrack(
  client: Client,
  input: { guildId: string; voiceChannelId: string; textChannelId: string; user: TrackRequester; query: string },
): Promise<{ title: string; count: number; playlist: boolean }> {
  if (!input.query.trim()) throw new Error('Escribe el nombre de una canción o pega un enlace.');
  if (!client.lavalink.useable) throw new Error('El nodo de audio aún no está disponible.');
  const activePlayer = client.lavalink.getPlayer(input.guildId);
  if (activePlayer && activePlayer.voiceChannelId !== input.voiceChannelId) {
    throw new Error('Ya estoy reproduciendo en otro canal de voz de este servidor.');
  }
  const node = activePlayer?.node ?? client.lavalink.nodeManager.leastUsedNodes('memory').find((candidate) => candidate.connected);
  if (!node) throw new Error('No hay nodos de audio conectados.');
  const result = await searchWithFallback(
    (identifier) => activePlayer ? activePlayer.search(identifier, input.user, true) : node.search(identifier, input.user, true),
    input.query,
  );
  if (!result?.tracks.length) {
    if (youtubePlaylistIdFromUrl(input.query.trim().replace(/^<(.+)>$/, '$1'))) {
      throw new Error('No pude cargar esa playlist. Comprueba que el enlace sea accesible y vuelve a intentarlo.');
    }
    if (youtubeVideoIdFromUrl(input.query.trim().replace(/^<(.+)>$/, '$1'))) {
      throw new Error('No encontré una canción de YouTube Music para ese enlace. Prueba con el nombre de la canción y el artista.');
    }
    throw new Error('No encontré canciones. Prueba con canción y artista o pega un enlace directo.');
  }

  const first = result.tracks[0];
  if (!first) throw new Error('La búsqueda no devolvió una canción reproducible.');
  const selectedTracks = result.loadType === 'playlist' ? result.tracks : [first];
  const player = activePlayer ?? await getOrCreatePlayer(client, input);
  if (player.queue.tracks.length + selectedTracks.length > MAX_MUSIC_QUEUE_TRACKS) {
    throw new Error(`No caben todas las canciones: la cola admite hasta ${MAX_MUSIC_QUEUE_TRACKS}.`);
  }
  if (!player.connected) await player.connect();
  if (player.queue.tracks.length + selectedTracks.length > MAX_MUSIC_QUEUE_TRACKS) {
    throw new Error(`No caben todas las canciones: la cola admite hasta ${MAX_MUSIC_QUEUE_TRACKS}.`);
  }
  await player.queue.add(selectedTracks);
  rememberMusicQueueChannel(input.guildId, input.voiceChannelId);
  if (!player.playing && !player.paused) await player.play();
  return {
    title: first.info.title,
    count: selectedTracks.length,
    playlist: result.loadType === 'playlist',
  };
}

async function getOrCreatePlayer(client: Client, input: { guildId: string; voiceChannelId: string; textChannelId: string }): Promise<Player> {
  const existing = client.lavalink.getPlayer(input.guildId);
  let player: Player;
  if (existing) {
    if (existing.voiceChannelId !== input.voiceChannelId) {
      throw new Error('Ya estoy reproduciendo en otro canal de voz de este servidor.');
    }
    player = existing;
  } else {
    player = client.lavalink.createPlayer({
      guildId: input.guildId,
      voiceChannelId: input.voiceChannelId,
      textChannelId: input.textChannelId,
      selfDeaf: true,
      volume: 65,
    });
  }
  if (!restoredQueues.has(player)) {
    await player.queue.utils.sync(true, false);
    restoredQueues.add(player);
  }
  return player;
}

