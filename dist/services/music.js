import { randomBytes } from 'node:crypto';
import { musicPanel } from '../ui/panels.js';
const panelReferences = new Map();
const searchSessions = new Map();
const MAX_SEARCH_SESSIONS = 1_000;
export function rememberMusicPanel(guildId, message) {
    panelReferences.set(guildId, { message });
}
export async function refreshMusicPanel(client, guildId) {
    const reference = panelReferences.get(guildId);
    if (!reference)
        return;
    try {
        await reference.message.edit(musicPanel(guildId, client.lavalink.getPlayer(guildId)));
    }
    catch (error) {
        const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
        if (code === 10008 || code === 10003 || code === 50001 || code === 50013)
            panelReferences.delete(guildId);
        else
            console.error(`No se pudo actualizar el panel musical de ${guildId}:`, error);
    }
}
export async function refreshActiveMusicPanels(client) {
    const activeGuildIds = [...panelReferences.keys()].filter((guildId) => client.lavalink.getPlayer(guildId)?.playing);
    await Promise.allSettled(activeGuildIds.map((guildId) => refreshMusicPanel(client, guildId)));
}
export async function searchTracks(client, query, user) {
    if (!query.trim())
        throw new Error('Escribe el nombre de una canción o pega un enlace.');
    if (!client.lavalink.useable)
        throw new Error('El nodo de audio aún no está disponible.');
    const node = client.lavalink.nodeManager.leastUsedNodes('memory').find((candidate) => candidate.connected);
    if (!node)
        throw new Error('No hay nodos de audio conectados.');
    const result = await searchWithFallback((identifier) => node.search(identifier, user, true), query);
    return result?.tracks ?? [];
}
async function searchWithFallback(search, query) {
    const trimmed = query.trim().replace(/^<(.+)>$/, '$1');
    const youtubeVideoId = youtubeVideoIdFromUrl(trimmed);
    if (youtubeVideoId) {
        let resolved;
        let lastError;
        // Let the source plugin resolve the original URL first. Searching only by ID
        // can return no result for valid YouTube URLs, especially music/watch links.
        try {
            resolved = await search(trimmed);
            const exactTracks = resolved.tracks.filter((track) => track.info.identifier === youtubeVideoId);
            if (exactTracks.length)
                return { ...resolved, tracks: exactTracks };
        }
        catch (error) {
            lastError = error;
        }
        try {
            const byId = await search(`ytsearch:${youtubeVideoId}`);
            const exactTracks = byId.tracks.filter((track) => track.info.identifier === youtubeVideoId);
            if (exactTracks.length)
                return { ...byId, tracks: exactTracks };
            resolved ??= byId;
        }
        catch (error) {
            lastError ??= error;
        }
        if (!resolved && lastError)
            throw lastError;
        return resolved ? { ...resolved, tracks: [] } : undefined;
    }
    const isUrl = isHttpUrl(trimmed);
    const hasSourcePrefix = /^(?:ytmsearch|ytsearch|scsearch|spsearch):/i.test(trimmed);
    const identifiers = isUrl || hasSourcePrefix
        ? [trimmed]
        : [`ytmsearch:${trimmed}`, `ytsearch:${trimmed}`, `scsearch:${trimmed}`];
    let emptyResult;
    let lastError;
    for (const identifier of identifiers) {
        try {
            const result = await search(identifier);
            if (result.tracks.length)
                return result;
            emptyResult ??= result;
        }
        catch (error) {
            lastError = error;
        }
    }
    if (emptyResult)
        return emptyResult;
    if (lastError)
        throw lastError;
    return undefined;
}
function youtubeVideoIdFromUrl(value) {
    let url;
    try {
        url = new URL(value);
    }
    catch {
        return undefined;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:')
        return undefined;
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    let videoId = null;
    if (host === 'youtu.be') {
        videoId = url.pathname.split('/').filter(Boolean)[0] ?? null;
    }
    else if (['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com'].includes(host)) {
        videoId = url.searchParams.get('v');
        if (!videoId)
            videoId = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?]+)/)?.[1] ?? null;
    }
    return videoId && /^[\w-]{11}$/.test(videoId) ? videoId : undefined;
}
function isHttpUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
    }
    catch {
        return false;
    }
}
export function rememberSearch(guildId, userId, tracks) {
    const now = Date.now();
    for (const [id, session] of searchSessions) {
        if (session.expiresAt <= now)
            searchSessions.delete(id);
    }
    while (searchSessions.size >= MAX_SEARCH_SESSIONS) {
        const oldestId = searchSessions.keys().next().value;
        if (!oldestId)
            break;
        searchSessions.delete(oldestId);
    }
    const id = randomBytes(6).toString('hex');
    searchSessions.set(id, { guildId, userId, tracks, expiresAt: now + 5 * 60_000 });
    return id;
}
export function takeSearchTrack(id, guildId, userId, index) {
    const session = searchSessions.get(id);
    if (!session || session.expiresAt <= Date.now()) {
        searchSessions.delete(id);
        return undefined;
    }
    if (session.guildId !== guildId || session.userId !== userId)
        return undefined;
    const track = session.tracks[index];
    if (track)
        searchSessions.delete(id);
    return track;
}
export async function addSelectedTrack(client, input, track) {
    const player = getOrCreatePlayer(client, input);
    if (player.queue.tracks.length >= 500)
        throw new Error('La cola llegó al límite de 500 canciones.');
    if (!player.connected)
        await player.connect();
    await player.queue.add(track);
    if (!player.playing && !player.paused)
        await player.play();
}
export async function disconnectPlayer(player) {
    await player.stopPlaying(true);
    await player.destroy('requested disconnect');
}
export async function applyMusicEffect(player, effect) {
    await player.filterManager.resetFilters();
    if (effect === 'bass')
        await player.filterManager.setEQPreset('BassboostMedium');
    else if (effect === 'rock')
        await player.filterManager.setEQPreset('Rock');
    else if (effect === 'pop')
        await player.filterManager.setEQPreset('Pop');
    else if (effect === 'nightcore')
        await player.filterManager.toggleNightcore();
    else if (effect === 'vaporwave')
        await player.filterManager.toggleVaporwave();
}
export async function addSavedTracks(client, input) {
    if (!client.lavalink.useable)
        throw new Error('El nodo de audio aún no está disponible.');
    if (!input.uris.length)
        throw new Error('Esta lista no tiene canciones guardadas.');
    const player = getOrCreatePlayer(client, input);
    if (player.queue.tracks.length + input.uris.length > 500)
        throw new Error('La cola llegó al límite de 500 canciones.');
    if (!player.connected)
        await player.connect();
    const resolved = new Array(input.uris.length);
    let nextIndex = 0;
    const resolveNext = async () => {
        while (nextIndex < input.uris.length) {
            const index = nextIndex++;
            try {
                const result = await searchWithFallback((identifier) => player.search(identifier, input.user, true), input.uris[index]);
                const track = result?.tracks[0];
                resolved[index] = track && !('resolve' in track) ? track : undefined;
            }
            catch {
                resolved[index] = undefined;
            }
        }
    };
    await Promise.all(Array.from({ length: Math.min(4, input.uris.length) }, () => resolveNext()));
    const tracks = resolved.filter((track) => track !== undefined);
    if (!tracks.length)
        throw new Error('No pude resolver ninguna canción guardada.');
    await player.queue.add(tracks);
    if (!player.playing && !player.paused)
        await player.play();
    return { added: tracks.length, unavailable: input.uris.length - tracks.length };
}
export async function addTrack(client, input) {
    if (!input.query.trim())
        throw new Error('Escribe el nombre de una canción o pega un enlace.');
    if (!client.lavalink.useable)
        throw new Error('El nodo de audio aún no está disponible.');
    let player = client.lavalink.getPlayer(input.guildId);
    if (player && player.voiceChannelId !== input.voiceChannelId) {
        throw new Error('Ya estoy reproduciendo en otro canal de voz de este servidor.');
    }
    const created = !player;
    player ??= getOrCreatePlayer(client, input);
    try {
        if (!player.connected)
            await player.connect();
        const result = await searchWithFallback((identifier) => player.search(identifier, input.user, true), input.query);
        if (!result?.tracks.length) {
            if (youtubeVideoIdFromUrl(input.query.trim().replace(/^<(.+)>$/, '$1'))) {
                throw new Error('No encontré ese video exacto en la búsqueda de YouTube. Prueba con el nombre de la canción y el artista.');
            }
            throw new Error('No encontré canciones. Prueba con canción y artista o pega un enlace directo.');
        }
        const first = result.tracks[0];
        if (!first)
            throw new Error('La búsqueda no devolvió una canción reproducible.');
        const selectedTracks = result.loadType === 'playlist' ? result.tracks.slice(0, 50) : [first];
        if (player.queue.tracks.length + selectedTracks.length > 500) {
            throw new Error('La cola llegó al límite de 500 canciones.');
        }
        await player.queue.add(selectedTracks);
        if (!player.playing && !player.paused)
            await player.play();
        return {
            title: first.info.title,
            count: selectedTracks.length,
            playlist: result.loadType === 'playlist',
            truncated: result.loadType === 'playlist' && result.tracks.length > selectedTracks.length,
        };
    }
    catch (error) {
        if (created)
            await player.destroy('search failed').catch(() => undefined);
        throw error;
    }
}
function getOrCreatePlayer(client, input) {
    const existing = client.lavalink.getPlayer(input.guildId);
    if (existing) {
        if (existing.voiceChannelId !== input.voiceChannelId) {
            throw new Error('Ya estoy reproduciendo en otro canal de voz de este servidor.');
        }
        return existing;
    }
    return client.lavalink.createPlayer({
        guildId: input.guildId,
        voiceChannelId: input.voiceChannelId,
        textChannelId: input.textChannelId,
        selfDeaf: true,
        volume: 65,
    });
}
