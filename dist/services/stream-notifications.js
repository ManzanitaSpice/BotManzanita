import { config } from '../config.js';
import { listStreamNotifications, updateStreamNotificationState, } from '../storage/stream-notification-store.js';
const POLL_INTERVAL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 15_000;
const twitchTokenEndpoint = 'https://id.twitch.tv/oauth2/token';
const kickTokenEndpoint = 'https://id.kick.com/oauth/token';
const twitchApiEndpoint = 'https://api.twitch.tv/helix/streams';
const kickApiEndpoint = 'https://api.kick.com/public/v1/channels';
let twitchToken;
let kickToken;
let pollTimer;
let isPolling = false;
export function hasStreamPlatformCredentials(platform) {
    const credentials = config.streamPlatforms[platform];
    return Boolean(credentials.clientId && credentials.clientSecret);
}
export function missingStreamPlatformVariables(platform) {
    const credentials = config.streamPlatforms[platform];
    const prefix = platform === 'twitch' ? 'TWITCH' : 'KICK';
    return [
        ...(credentials.clientId ? [] : [`${prefix}_CLIENT_ID`]),
        ...(credentials.clientSecret ? [] : [`${prefix}_CLIENT_SECRET`]),
    ];
}
export function startStreamNotificationPolling(client) {
    if (pollTimer)
        return;
    const notifications = listStreamNotifications();
    const missingPlatforms = ['twitch', 'kick']
        .filter((platform) => notifications.some((entry) => entry.platform === platform) && !hasStreamPlatformCredentials(platform));
    for (const platform of missingPlatforms) {
        console.warn(`Avisos de ${platform} sin revisar: completa ${missingStreamPlatformVariables(platform).join(' y ')} en el host.`);
    }
    void pollAndSchedule(client);
}
async function pollAndSchedule(client) {
    if (isPolling)
        return;
    isPolling = true;
    try {
        const notifications = listStreamNotifications();
        await pollPlatform(client, 'twitch', notifications.filter((entry) => entry.platform === 'twitch'));
        await pollPlatform(client, 'kick', notifications.filter((entry) => entry.platform === 'kick'));
    }
    catch (error) {
        console.error('No se pudieron revisar los avisos de streams:', error);
    }
    finally {
        isPolling = false;
        pollTimer = setTimeout(() => void pollAndSchedule(client), POLL_INTERVAL_MS);
        pollTimer.unref();
    }
}
async function pollPlatform(client, platform, notifications) {
    if (!notifications.length || !hasStreamPlatformCredentials(platform))
        return;
    const handles = [...new Set(notifications.map((entry) => entry.username))];
    let liveStreams;
    try {
        liveStreams = platform === 'twitch'
            ? await getTwitchLiveStreams(handles)
            : await getKickLiveStreams(handles);
    }
    catch (error) {
        console.error(`No se pudieron consultar los directos de ${platform}:`, error);
        return;
    }
    for (const notification of notifications) {
        const startedAt = liveStreams.get(notification.username);
        if (startedAt === undefined) {
            if (notification.isLive || notification.checkedAt === 0) {
                updateStreamNotificationState(notification, { isLive: false, lastStartedAt: notification.lastStartedAt });
            }
            continue;
        }
        // The first successful poll establishes a baseline, so a bot restart or a
        // newly registered channel that is already live does not create a false alert.
        if (notification.checkedAt === 0) {
            updateStreamNotificationState(notification, { isLive: true, lastStartedAt: startedAt ?? notification.lastStartedAt });
            continue;
        }
        const newBroadcast = !notification.isLive
            || Boolean(startedAt && notification.lastStartedAt && startedAt !== notification.lastStartedAt);
        if (newBroadcast) {
            const streamUrl = platform === 'twitch'
                ? `https://www.twitch.tv/${notification.username}`
                : `https://kick.com/${notification.username}`;
            try {
                const channel = await client.channels.fetch(notification.channelId);
                if (!channel?.isSendable())
                    throw new Error('El canal guardado ya no existe o no admite mensajes.');
                await channel.send({
                    content: `${notification.message}\n${streamUrl}`,
                    allowedMentions: {
                        parse: [],
                        roles: [...new Set([...notification.message.matchAll(/<@&(\d{17,20})>/g)]
                                .map((match) => match[1]).filter((roleId) => Boolean(roleId)))],
                    },
                });
            }
            catch (error) {
                console.error(`No se pudo enviar el aviso de ${platform}/${notification.username} en ${notification.guildId}:`, error);
                continue;
            }
        }
        updateStreamNotificationState(notification, {
            isLive: true,
            lastStartedAt: startedAt ?? notification.lastStartedAt,
        });
    }
}
async function getTwitchLiveStreams(userLogins) {
    const live = new Map();
    for (const batch of chunks(userLogins, 100)) {
        const params = new URLSearchParams();
        for (const login of batch)
            params.append('user_login', login);
        const result = await twitchApiRequest(`${twitchApiEndpoint}?${params.toString()}`);
        for (const stream of result.data ?? [])
            live.set(stream.user_login.toLowerCase(), stream.started_at || null);
    }
    return live;
}
async function getKickLiveStreams(slugs) {
    const live = new Map();
    for (const batch of chunks(slugs, 50)) {
        const params = new URLSearchParams();
        for (const slug of batch)
            params.append('slug', slug);
        const result = await kickApiRequest(`${kickApiEndpoint}?${params.toString()}`);
        for (const channel of result.data ?? []) {
            if (channel.stream?.is_live)
                live.set(channel.slug.toLowerCase(), channel.stream.start_time ?? null);
        }
    }
    return live;
}
async function twitchApiRequest(url) {
    const credentials = config.streamPlatforms.twitch;
    const send = (token) => fetch(url, {
        headers: { Authorization: `Bearer ${token}`, 'Client-Id': credentials.clientId },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    let token = await getTwitchToken();
    let response = await send(token);
    if (response.status === 401) {
        twitchToken = undefined;
        token = await getTwitchToken();
        response = await send(token);
    }
    return readJson(response, 'Twitch');
}
async function kickApiRequest(url) {
    const send = async (token) => fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    let token = await getKickToken();
    let response = await send(token);
    if (response.status === 401) {
        kickToken = undefined;
        token = await getKickToken();
        response = await send(token);
    }
    return readJson(response, 'Kick');
}
async function getTwitchToken() {
    if (twitchToken && twitchToken.expiresAt > Date.now() + 60_000)
        return twitchToken.value;
    const credentials = config.streamPlatforms.twitch;
    const body = new URLSearchParams({
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        grant_type: 'client_credentials',
    });
    twitchToken = await requestAppToken(twitchTokenEndpoint, body, 'Twitch');
    return twitchToken.value;
}
async function getKickToken() {
    if (kickToken && kickToken.expiresAt > Date.now() + 60_000)
        return kickToken.value;
    const credentials = config.streamPlatforms.kick;
    const body = new URLSearchParams({
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        grant_type: 'client_credentials',
    });
    kickToken = await requestAppToken(kickTokenEndpoint, body, 'Kick');
    return kickToken.value;
}
async function requestAppToken(endpoint, body, platform) {
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const result = await readJson(response, platform);
    if (!result.access_token || !result.expires_in)
        throw new Error(`${platform} no devolvió un token de aplicación válido.`);
    return { value: result.access_token, expiresAt: Date.now() + Math.max(30, result.expires_in - 60) * 1000 };
}
async function readJson(response, platform) {
    if (!response.ok)
        throw new Error(`${platform} API respondió HTTP ${response.status}.`);
    return await response.json();
}
function chunks(items, size) {
    const result = [];
    for (let index = 0; index < items.length; index += size)
        result.push(items.slice(index, index + size));
    return result;
}
