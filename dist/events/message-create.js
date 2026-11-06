import { EmbedBuilder, MessageFlags, PermissionFlagsBits, escapeMarkdown } from 'discord.js';
import { randomInt } from 'node:crypto';
import { answerEightBall } from '../services/eight-ball.js';
import { ADMIN_OWNER_ID } from '../commands/admin.js';
import { bankAction, claimDaily, crime, economyJobs, fish, formatCooldown, getAccountBalances, getLeaderboard, MAX_JOB_LEVEL, playItemRoulette, playRoosterFight, playRoulette, playSlots, resignJob, robPlayer, selectJob, startBlackjack, transferCoins, useShopItem, work, storeItems } from '../services/economy.js';
import { addSavedTracks, addTrack, applyMusicEffect, disconnectPlayer, refreshMusicPanel, rememberMusicPanel, rememberSearch, resumeSavedMusicQueue, searchTracks } from '../services/music.js';
import { addFavorite, deletePlaylist, getFavorites, getMusicHistory, getPlaylist, getPlaylists, MAX_PLAYLISTS, MAX_PLAYLIST_TRACKS, removeFavorite, saveTracksToPlaylist, saveTrackToPlaylist, shufflePlaylist } from '../services/music-library.js';
import { adminEditRpgPet, adminGrantRpgPet, adminRemoveRpgPet, battleRpg, buyRpgItem, careForRpgPet, claimRpgQuest, createRpgPvpChallenge, exploreRpg, getRpgQuests, getSpeciesCatalog, releaseRpgPet, rpgItems, rpgZones, trainRpgPet, useRpgItem } from '../services/rpg.js';
import { balancePanel, bankPanel, blackjackPanel, casinoPanel, economyActionPanel, economyPanel, expeditionLogPanel, favoritesPanel, inventoryPanel, jobsPanel, leaderboardPanel, listPanel, musicPanel, queuePanel, rpgAdoptionPanel, rpgBuildPanel, rpgCareResultPanel, rpgExplorePanel, rpgFeedPanel, rpgInventoryPanel, rpgMenuPanel, rpgMissionsPanel, rpgPanel, rpgPvPHelpPanel, rpgPvpPanel, rpgRankingPanel, searchResultsPanel, storePanel, playlistsPanel } from '../ui/panels.js';
import { rpgEggOptions } from '../ui/rpg-art.js';
import { addAdminAudit, adjustAdminCurrency, getAdminAudit, grantAdminRpgItem, inspectAdminUser, resetAdminCooldown, rollbackAdminCurrency, setAdminRobberyShield } from '../services/admin.js';
import { createAnimeReaction, findAnimeReaction } from '../services/reactions.js';
import { catalogPanel } from '../ui/catalog.js';
import { profileCardPanel, levelUpCardMessage } from '../ui/profile.js';
import { giveReputation, recordChatActivity, recordReceivedRpgReaction } from '../services/profile.js';
const PREFIX = 'a!';
const money = new Intl.NumberFormat('es-MX');
const adminActionAliases = {
    agregar: 'wallet_add', sumar: 'wallet_add', 'add-money': 'wallet_add', addmoney: 'wallet_add',
    quitar: 'wallet_remove', 'remove-money': 'wallet_remove', removemoney: 'wallet_remove',
    mq: 'remove', mascota_quitar: 'remove', resetpet: 'remove',
    md: 'pet', mascota_dar: 'pet',
    mc: 'heal', mascota_curar: 'heal',
    mxp: 'xp', mascota_xp: 'xp',
    mn: 'rename', mascota_nombre: 'rename',
    ma: 'stat', mascota_atributo: 'stat',
    rt: 'cooldown', reiniciar_tiempo: 'cooldown',
    i: 'inspect', inspeccionar: 'inspect',
    pr: 'shield', proteger_robo: 'shield',
    rb: 'rollback', h: 'history', historial: 'history',
};
export function registerMessageCommandHandler(client) {
    client.on('messageCreate', (message) => {
        if (message.author.bot)
            return;
        if (message.guildId)
            void recordChatActivity(message.guildId, message.author.id).then(async (result) => {
                if (result?.levelUp)
                    await message.reply({ content: `🎉 **${message.author.username} subió al nivel ${result.level}!**`, files: [await levelUpCardMessage(message.guildId, message.author, result.level)], allowedMentions: { repliedUser: false } });
            }).catch((error) => console.error('No pude registrar la actividad de perfil:', error));
        if (!message.content.toLocaleLowerCase().startsWith(PREFIX))
            return;
        void routeMessage(message).catch(async (error) => {
            console.error(`Error procesando comando ${PREFIX} de ${message.author.id}:`, error);
            await message.reply({ content: `⚠️ ${error instanceof Error ? error.message : 'No pude completar el comando.'}`, allowedMentions: { repliedUser: false } }).catch(() => undefined);
        });
    });
}
async function routeMessage(message) {
    const parts = message.content.slice(PREFIX.length).trim().split(/\s+/).filter(Boolean);
    let command = (parts.shift() ?? '').toLocaleLowerCase();
    const userId = message.author.id;
    const client = message.client;
    const args = parts;
    if (!command || ['help', 'ayuda', 'h', 'catalog', 'catalogo', 'comandos'].includes(command)) {
        await sendPanel(message, catalogPanel(args[0]));
        return;
    }
    if (command === 'say' || command === 'embed') {
        await relayMessageCommand(message, command);
        return;
    }
    if (await routeUtilityMessage(message, command, args))
        return;
    if (adminActionAliases[command]) {
        args.unshift(adminActionAliases[command]);
        command = 'admin';
    }
    if (command === 'admin') {
        if (userId !== ADMIN_OWNER_ID) {
            await say(message, 'Comando privado.');
            return;
        }
        if (message.guildId) {
            await say(message, 'Por seguridad, usa `a!admin` en el DM del bot. Así la gestión no aparece en el canal del servidor.');
            return;
        }
        await adminDmCommands(message, args);
        return;
    }
    if (!message.guild || !message.guildId) {
        await say(message, 'Este comando funciona dentro de un servidor.');
        return;
    }
    const guildId = message.guildId;
    if (['bitacora', 'bitácora', 'log', 'logs'].includes(command)) {
        await sendPanel(message, await expeditionLogPanel(guildId, userId));
        return;
    }
    if (['adopt', 'adoptar', 'release', 'liberar', 'soltar', 'releasepet', 'name', 'nombrar', 'explore', 'explorar', 'fight', 'battle', 'combatir', 'train', 'entrenar', 'buy', 'comprar', 'item', 'quests', 'misiones', 'rank', 'ranking', 'challenge', 'retar', 'attacks'].includes(command)) {
        args.unshift(command);
        command = 'rpg';
    }
    const reactionId = findAnimeReaction(command);
    if (reactionId) {
        const target = message.mentions.users.first();
        if (target?.id === userId)
            return say(message, 'No puedes dirigirte la acción a ti mismo.');
        const actorName = escapeMarkdown(message.member?.displayName ?? message.author.globalName ?? message.author.username).replace(/@/g, '@\u200b');
        const targetMember = target ? message.mentions.members?.get(target.id) : undefined;
        const targetName = target ? escapeMarkdown(targetMember?.displayName ?? target.globalName ?? target.username).replace(/@/g, '@\u200b') : undefined;
        const result = await createAnimeReaction(reactionId, actorName, targetName, `${guildId}:${userId}`);
        if (!result.ok)
            return say(message, result.reason === 'target_required' ? `Menciona a alguien: a!${reactionId} @persona.` : result.reason === 'cooldown' ? `Espera ${result.seconds ?? 1} s antes de otra expresión.` : 'No pude cargar el GIF ahora; intenta en un momento.');
        if (target && (reactionId === 'hug' || reactionId === 'pat'))
            await recordReceivedRpgReaction(target.id, reactionId);
        await message.reply({ embeds: [result.embed], ...(result.files ? { files: result.files } : {}), allowedMentions: { parse: [] } });
        return;
    }
    // MUSIC
    if (['play', 'p', 'add', 'agregar'].includes(command)) {
        const query = args.join(' ').trim();
        if (!query)
            return say(message, 'Uso: `a!play canción o enlace`.');
        const voiceChannelId = message.guild.voiceStates.cache.get(userId)?.channelId;
        if (!voiceChannelId)
            return say(message, 'Entra a un canal de voz antes de usar música.');
        const result = await addTrack(client, { guildId, voiceChannelId, textChannelId: message.channelId, user: requester(message), query });
        await refreshMusicPanel(client, guildId);
        await say(message, result.playlist ? `🎶 Añadí **${result.count} canciones** de la playlist a la cola.` : `🎶 Añadí **${result.title}** a la cola.`);
        return;
    }
    if (['search', 's', 'buscar'].includes(command)) {
        const query = args.join(' ').trim();
        if (!query)
            return say(message, 'Uso: `a!search artista y canción`.');
        const tracks = (await searchTracks(client, query, requester(message))).slice(0, 25);
        if (!tracks.length)
            return say(message, 'No encontré resultados. Prueba con artista y canción.');
        const searchId = rememberSearch(guildId, userId, tracks);
        await message.reply({ components: searchResultsPanel(searchId, tracks).components, flags: MessageFlags.IsComponentsV2, allowedMentions: { repliedUser: false } });
        return;
    }
    if (['queue', 'q', 'cola'].includes(command)) {
        await sendPanel(message, queuePanel(client.lavalink.getPlayer(guildId), 0, guildId));
        return;
    }
    if (['historial', 'hist', 'histm'].includes(command)) {
        const limit = args[0] === undefined ? 10 : Number(args[0]);
        if (!Number.isInteger(limit) || limit < 1 || limit > 30)
            return say(message, 'Uso: `a!hist [1-30]`. El historial guarda hasta 30 canciones durante 2 horas.');
        const history = getMusicHistory(guildId, userId).slice(0, limit);
        const entries = history.map((track, index) => {
            const title = track.title.length > 65 ? `${track.title.slice(0, 62)}…` : track.title;
            const artist = track.author.length > 35 ? `${track.author.slice(0, 32)}…` : track.author;
            const expiresAt = Math.floor((track.playedAt + 2 * 60 * 60 * 1000) / 1000);
            return `**${String(index + 1).padStart(2, '0')}.** ${title} · ${artist} · vence <t:${expiresAt}:R>`;
        });
        await sendPanel(message, listPanel('🎧 HISTORIAL MUSICAL', `Tus últimas ${history.length} reproducciones · se conservan 2 horas`, entries, 0x8b5cf6, 'Aún no hay canciones reproducidas recientemente.'));
        return;
    }
    if (['bucle', 'loop', 'bl'].includes(command)) {
        const player = client.lavalink.getPlayer(guildId);
        const voiceChannelId = message.guild.voiceStates.cache.get(userId)?.channelId;
        if (!voiceChannelId || (player && voiceChannelId !== player.voiceChannelId))
            return say(message, 'Entra al mismo canal de voz que el bot para controlar la música.');
        const mode = args[0]?.toLocaleLowerCase();
        if (['off', 'no', 'desactivar'].includes(mode ?? '')) {
            if (!player)
                return say(message, 'No hay una sesión musical activa.');
            await player.setRepeatMode('off');
            await refreshMusicPanel(client, guildId);
            return say(message, '🔁 Bucle desactivado.');
        }
        const requestedCount = args.length ? Number(args[0]) : 1;
        if (!Number.isInteger(requestedCount) || requestedCount < 1 || requestedCount > 30)
            return say(message, 'Uso: `a!bucle [1-30|off]`. Sin número repite la última canción.');
        const history = getMusicHistory(guildId, userId).slice(0, requestedCount).reverse();
        if (!history.length)
            return say(message, 'Aún no tienes canciones recientes en el historial.');
        const result = await addSavedTracks(client, {
            guildId, voiceChannelId, textChannelId: message.channelId, user: requester(message),
            uris: history.map((track) => track.trackUri), replaceQueue: true,
            repeatMode: history.length === 1 ? 'track' : 'queue',
        });
        await refreshMusicPanel(client, guildId);
        const partial = result.unavailable ? ` · ${result.unavailable} no disponibles` : '';
        const shortened = history.length < requestedCount ? ` · solo había ${history.length} en el historial` : '';
        return say(message, `🔁 Bucle activado con **${result.added} canción(es)**${partial}${shortened}. Usa \`a!bucle off\` para detenerlo.`);
    }
    if (['np', 'nowplaying', 'panel'].includes(command)) {
        const panelMessage = await message.reply({ ...musicPanel(guildId, client.lavalink.getPlayer(guildId)), allowedMentions: { repliedUser: false } });
        rememberMusicPanel(guildId, panelMessage);
        return;
    }
    if (['shuffle', 'sh'].includes(command) && ['playlist', 'lista', 'pl'].includes(args[0]?.toLocaleLowerCase() ?? '')) {
        const name = args.slice(1).join(' ');
        if (!name)
            return say(message, 'Uso: `a!shuffle playlist nombre`. Esto guarda el nuevo orden de tu lista.');
        const result = shufflePlaylist(guildId, userId, name);
        return say(message, result ? `🔀 Mezclé **${result.name}** (${result.count} canciones).` : 'No encontré esa playlist.');
    }
    if (['pause', 'resume', 'skip', 'prev', 'stop', 'leave', 'shuffle', 'sh', 'repeat', 'vol', 'volume', 'fx', 'effect'].includes(command)) {
        const player = client.lavalink.getPlayer(guildId);
        if (!player && command === 'resume') {
            const voiceChannelId = message.guild.voiceStates.cache.get(userId)?.channelId;
            if (!voiceChannelId)
                return say(message, 'Entra a un canal de voz para recuperar la cola.');
            const resumed = await resumeSavedMusicQueue(client, { guildId, voiceChannelId, textChannelId: message.channelId, user: requester(message) });
            await refreshMusicPanel(client, guildId);
            await say(message, `▶️ Recuperé **${resumed.currentTitle}** y ${resumed.queuedTracks} canciones en espera. Puedes recuperarla durante una hora: vence <t:${resumed.expiresAt}:R>.`);
            return;
        }
        if (!player)
            return say(message, 'No hay música activa ni una cola reciente para recuperar.');
        const voiceChannelId = message.guild.voiceStates.cache.get(userId)?.channelId;
        if (!voiceChannelId || voiceChannelId !== player.voiceChannelId)
            return say(message, 'Entra al mismo canal de voz que el bot para controlarlo.');
        let response = '';
        if (command === 'pause') {
            await player.pause();
            response = '⏸️ Pausada.';
        }
        else if (command === 'resume') {
            if (player.paused) {
                await player.resume();
                response = '▶️ Reanudada.';
            }
            else if (!player.playing && (player.queue.current || player.queue.tracks.length)) {
                await player.play();
                response = '▶️ Cola recuperada y en reproducción.';
            }
            else
                response = 'La música ya está reproduciéndose.';
        }
        else if (command === 'skip') {
            await player.skip();
            response = '⏭️ Siguiente canción.';
        }
        else if (command === 'prev') {
            const track = await player.queue.shiftPrevious();
            if (!track)
                return say(message, 'No hay canciones anteriores.');
            await player.play({ clientTrack: track });
            response = `⏮️ Volviendo a **${track.info.title}**.`;
        }
        else if (command === 'stop') {
            await player.stopPlaying(true);
            response = '⏹️ Reproducción detenida y cola vaciada.';
        }
        else if (command === 'leave') {
            await disconnectPlayer(player);
            response = '👋 Desconectada del canal de voz.';
        }
        else if (command === 'shuffle' || command === 'sh') {
            if (player.queue.tracks.length < 2)
                return say(message, 'Añade al menos dos canciones pendientes.');
            await player.queue.shuffle();
            response = '🔀 Cola mezclada.';
        }
        else if (command === 'repeat') {
            const mode = args[0]?.toLowerCase();
            const next = mode === 'track' || mode === 'cancion' ? 'track' : mode === 'queue' || mode === 'cola' ? 'queue' : mode === 'off' || mode === 'no' ? 'off' : player.repeatMode === 'off' ? 'track' : player.repeatMode === 'track' ? 'queue' : 'off';
            await player.setRepeatMode(next);
            response = `🔁 Repetición: **${next}**.`;
        }
        else if (command === 'vol' || command === 'volume') {
            const value = Number(args[0]);
            if (!Number.isInteger(value) || value < 0 || value > 100)
                return say(message, `Volumen actual: **${player.volume}%**. Uso: a!vol 0-100.`);
            await player.setVolume(value);
            response = `🔊 Volumen en **${value}%**.`;
        }
        else {
            const names = { normal: 'normal', bass: 'bass', graves: 'bass', rock: 'rock', pop: 'pop', nightcore: 'nightcore', vaporwave: 'vaporwave' };
            const effect = names[(args[0] ?? '').toLowerCase()];
            if (!effect)
                return say(message, 'Efectos: `normal`, `bass`, `rock`, `pop`, `nightcore`, `vaporwave`.');
            await applyMusicEffect(player, effect);
            response = `🎚️ Efecto **${effect}** aplicado.`;
        }
        await refreshMusicPanel(client, guildId);
        await say(message, response);
        return;
    }
    if (['fav', 'favorite', 'favorito'].includes(command)) {
        const action = args[0]?.toLowerCase();
        if (action === 'list' || action === 'lista') {
            await sendPanel(message, favoritesPanel(guildId, userId, getFavorites(guildId, userId)));
            return;
        }
        if (action === 'remove' || action === 'quitar') {
            const removed = removeFavorite(guildId, userId, Number(args[1]));
            return say(message, removed ? '🗑️ Favorito eliminado.' : 'No encontré ese favorito.');
        }
        const current = client.lavalink.getPlayer(guildId)?.queue.current;
        if (!current)
            return say(message, 'No hay canción activa. Usa `a!fav list` para ver tus favoritos.');
        const result = addFavorite(guildId, userId, current);
        return say(message, result === 'saved' ? `⭐ Guardé **${current.info.title}**.` : result === 'exists' ? 'Esa canción ya está en tus favoritos.' : 'Llegaste al límite de 25 favoritos.');
    }
    if (['lists', 'listas', 'playlist', 'pl', 'play_playlist', 'pp', 'pd'].includes(command)) {
        const directPlay = command === 'play_playlist' || command === 'pp';
        const directDelete = command === 'pd';
        const action = directPlay ? 'play' : directDelete ? 'delete' : args[0]?.toLocaleLowerCase();
        if (!action || action === 'list') {
            const lists = getPlaylists(guildId, userId);
            await sendPanel(message, playlistsPanel(lists));
            return;
        }
        if (['now', 'recientes', 'recent'].includes(action)) {
            const hasCount = /^\d+$/.test(args[1] ?? '');
            const count = hasCount ? Number(args[1]) : 20;
            const name = args.slice(hasCount ? 2 : 1).join(' ');
            if (!name || !Number.isInteger(count) || count < 1 || count > MAX_PLAYLIST_TRACKS)
                return say(message, `Uso: \`a!playlist now [1-${MAX_PLAYLIST_TRACKS}] nombre\` (por defecto usa 20).`);
            const history = getMusicHistory(guildId, userId).slice(0, count).reverse();
            const result = saveTracksToPlaylist(guildId, userId, name, history);
            if (result.state === 'empty')
                return say(message, 'No tienes canciones recientes para crear una playlist.');
            if (result.state === 'exists')
                return say(message, `Ya existe una playlist llamada **${result.name}**.`);
            if (result.state === 'playlist_limit')
                return say(message, `Llegaste al límite de ${MAX_PLAYLISTS} playlists por usuario.`);
            if (result.state === 'track_limit')
                return say(message, `Cada playlist admite hasta ${MAX_PLAYLIST_TRACKS} canciones.`);
            const shortHistory = history.length < count ? ` · solo había ${history.length} en el historial` : '';
            return say(message, `💾 Creé **${result.name}** con ${result.count} reproducción(es)${shortHistory}.`);
        }
        if (action === 'save' || action === 'guardar') {
            const name = args.slice(1).join(' ');
            const current = client.lavalink.getPlayer(guildId)?.queue.current;
            if (!name || !current)
                return say(message, 'Uso: `a!playlist save nombre` mientras hay una canción activa.');
            const result = saveTrackToPlaylist(guildId, userId, name, current);
            return say(message, result.state === 'added' ? `💾 Guardada en **${result.name}** (${result.count}/${MAX_PLAYLIST_TRACKS}).`
                : result.state === 'exists' ? 'Esa canción ya está en la lista.'
                    : result.state === 'playlist_limit' ? `Llegaste al límite de ${MAX_PLAYLISTS} playlists por usuario.`
                        : `**${result.name}** ya llegó al límite de ${MAX_PLAYLIST_TRACKS} canciones.`);
        }
        if (['delete', 'eliminar', 'remove', 'borrar'].includes(action)) {
            const name = directDelete ? args.join(' ') : args.slice(1).join(' ');
            if (!name)
                return say(message, 'Uso: `a!playlist delete nombre`.');
            return say(message, deletePlaylist(guildId, userId, name) ? `🗑️ Eliminé **${name}**.` : 'No encontré esa playlist.');
        }
        if (action === 'play' || action === 'reproducir') {
            const name = directPlay ? args.join(' ') : args.slice(1).join(' ');
            const saved = getPlaylist(guildId, userId, name);
            const voiceChannelId = message.guild.voiceStates.cache.get(userId)?.channelId;
            if (!saved)
                return say(message, 'No encontré esa playlist. Usa `a!playlist list` para ver las tuyas.');
            if (!voiceChannelId)
                return say(message, 'Entra a un canal de voz primero.');
            const result = await addSavedTracks(client, { guildId, voiceChannelId, textChannelId: message.channelId, user: requester(message), uris: saved.tracks.map((track) => track.trackUri) });
            return say(message, `🎶 Añadí ${result.added} canción(es) de **${saved.playlist.name}**${result.unavailable ? ` · ${result.unavailable} no disponibles` : ''}.`);
        }
        return say(message, 'Usa `a!playlist list`, `a!playlist now [N] nombre`, `a!playlist save nombre`, `a!playlist delete nombre`, `a!play_playlist nombre` o `a!shuffle playlist nombre`.');
    }
    // ECONOMY
    if (['bal', 'b', 'balance', 'saldo', 'dinero', 'money'].includes(command)) {
        const target = message.mentions.users.first() ?? message.author;
        const account = await getAccountBalances(guildId, target.id);
        await sendPanel(message, balancePanel(target.username, account, false));
        return;
    }
    if (['top', 'baltop', 'rich', 'ranking', 'leaderboard'].includes(command)) {
        const rows = await getLeaderboard(guildId);
        const listing = rows.map((row) => `<@${row.userId}>  ·  **${money.format(row.balance)}** monedas`);
        await sendPanel(message, leaderboardPanel('🏆 TOP DE ECONOMÍA', 'Las mayores fortunas globales', listing, 0x22c55e, 'Aún no hay cuentas.', false));
        return;
    }
    if (['profile', 'perfil'].includes(command)) {
        const target = message.mentions.users.first() ?? message.author;
        await sendPanel(message, await profileCardPanel(guildId, target, userId));
        return;
    }
    if (command === 'wallet') {
        await sendPanel(message, await economyPanel(guildId, userId, message.author.username, message.author.displayAvatarURL({ extension: 'png', size: 256 })));
        return;
    }
    if (command === 'rankcard') {
        await sendPanel(message, await profileCardPanel(guildId, message.author, userId, 'rank'));
        return;
    }
    if (command === 'rep') {
        const target = message.mentions.users.first();
        if (!target)
            return say(message, 'Uso: `a!rep @persona`.');
        const result = await giveReputation(userId, target.id);
        return say(message, result.ok ? `✨ Le diste reputación a **${target.username}**. Ahora tiene **${result.reputation}**.` : target.id === userId ? 'No puedes darte reputación a ti.' : 'Ya reconociste a esa persona hoy.');
    }
    if (['eco', 'economy'].includes(command)) {
        await sendPanel(message, await economyPanel(guildId, userId, message.author.username, message.author.displayAvatarURL({ extension: 'png', size: 256 })));
        return;
    }
    if (['daily', 'd', 'diaria'].includes(command)) {
        const result = await claimDaily(guildId, userId, message.id);
        if (!result.ok)
            return say(message, `⏳ Vuelve en ${formatCooldown(result.secondsRemaining)}.`);
        return sendPanel(message, economyActionPanel('🎁 Recompensa diaria', 'Tu recompensa de hoy ya está en tu billetera.', result.amount, result.balance));
    }
    if (['job', 'jobs', 'empleo', 'empleos', 'trabajo'].includes(command)) {
        const action = (args[0] ?? '').toLocaleLowerCase();
        if (['renunciar', 'resign', 'quit'].includes(action)) {
            await resignMessageJob(message, guildId, userId, args.slice(1).join(' '));
            return;
        }
        const selectionWords = ['elegir', 'seleccionar', 'select', 'choose'];
        const listing = !args.length || ['lista', 'list', 'ver', 'help', 'ayuda'].includes(action);
        const query = selectionWords.includes(action) ? args.slice(1).join(' ') : args.join(' ');
        const normalizedQuery = query.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
        const selectedJob = economyJobs.find((job) => job.id === normalizedQuery || job.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase() === normalizedQuery);
        if (selectedJob && (selectionWords.includes(action) || !['lista', 'list', 'ver', 'help', 'ayuda'].includes(action))) {
            const result = await selectJob(guildId, userId, selectedJob.id);
            if (!result.ok)
                return say(message, 'Ese trabajo no está disponible. Usa `a!jobs` para ver las opciones.');
            const notice = `✅ Elegiste **${result.progress.job.name}** · nivel ${result.progress.level}. Plazas ocupadas: **${result.activeJobIds.length}/${result.slotLimit}**. ${result.secondSlotUnlocked ? 'El segundo espacio está desbloqueado.' : `Alcanza el nivel ${MAX_JOB_LEVEL} en cualquier oficio para desbloquearlo.`}`;
            return sendPanel(message, await jobsPanel(guildId, userId, notice));
        }
        if (query && !selectedJob && !listing)
            return say(message, 'No reconocí ese trabajo. Usa `a!jobs` y selecciónalo en el panel, o escribe `a!jobs elegir minero`.');
        return sendPanel(message, await jobsPanel(guildId, userId));
    }
    if (['renunciar', 'resign', 'quitjob'].includes(command)) {
        await resignMessageJob(message, guildId, userId, args.join(' '));
        return;
    }
    if (['work', 'w', 'trabajar'].includes(command)) {
        const result = await work(guildId, userId, message.id);
        if (!result.ok)
            return say(message, result.reason === 'no_job'
                ? 'Primero elige un trabajo con `a!jobs`.'
                : result.reason === 'missing_tool'
                    ? `Para trabajar como **${result.job?.name ?? 'este oficio'}** necesitas **${result.job?.toolName ?? 'su herramienta'}**. Cómprala en a!shop.`
                    : `🧰 Ya trabajaste. Vuelve en ${formatCooldown(result.secondsRemaining ?? 0)}.`);
        return sendPanel(message, economyActionPanel('🧰 Trabajo completado', result.message, result.amount, result.balance));
    }
    if (['gallo', 'gallera', 'peleagallos'].includes(command)) {
        const bet = Number(args[0]);
        if (!Number.isSafeInteger(bet) || bet < 1 || bet > 100_000)
            return say(message, 'Uso: `a!gallo apuesta` · apuesta entre 1 y 100000 monedas.');
        const result = await playRoosterFight(guildId, userId, bet, message.id);
        if (!result.ok)
            return say(message, result.reason === 'invalid_bet' ? 'La apuesta debe ser de 1 a 100000 monedas.' : 'No tienes monedas suficientes para esa apuesta.');
        return sendPanel(message, economyActionPanel('🐓 Duelo de gallos', result.message, result.won ? result.payout - result.bet : -result.bet, result.balance));
    }
    if (['slots', 'slot', 'tragamonedas', 'machine', 'maquina', 'máquina'].includes(command)) {
        const bet = Number(args[0]);
        if (!Number.isSafeInteger(bet) || bet < 1 || bet > 100_000)
            return say(message, 'Uso: `a!machine apuesta` · también puedes usar `a!slots` · apuesta entre 1 y 100000 monedas.');
        const result = await playSlots(guildId, userId, bet, message.id);
        if (!result.ok)
            return say(message, result.reason === 'invalid_bet' ? 'La apuesta debe ser de 1 a 100000 monedas.' : 'No tienes monedas suficientes para esa apuesta.');
        return sendPanel(message, economyActionPanel('🎰 Tragamonedas', `${result.reels.join('　│　')}\n${result.message}`, result.payout - result.bet, result.balance));
    }
    if (['fish', 'f', 'pescar'].includes(command)) {
        const result = await fish(guildId, userId, message.id);
        if (!result.ok)
            return say(message, result.reason === 'missing_rod' ? 'Necesitas una **Caña de pescar**. Cómprala en `a!shop` antes de usar `a!fish`.' : `🎣 Ya saliste a pescar. Vuelve en ${formatCooldown(result.secondsRemaining ?? 0)}.`);
        return sendPanel(message, economyActionPanel('🎣 Pesca', result.message, result.amount, result.balance));
    }
    if (['crime', 'c', 'crimen'].includes(command)) {
        const result = await crime(guildId, userId, message.id);
        if (!result.ok)
            return say(message, `🚨 Vuelve en ${formatCooldown(result.secondsRemaining)}.`);
        return sendPanel(message, economyActionPanel(result.success ? '🕶️ Golpe exitoso' : '🚨 Golpe fallido', result.message, result.success ? result.amount : -result.amount, result.balance));
    }
    if (['rob', 'r', 'robar'].includes(command)) {
        const target = message.mentions.users.first();
        if (!target || target.bot)
            return say(message, 'Uso: `a!rob @persona`.');
        const result = await robPlayer(guildId, userId, target.id, target.username, message.id);
        if (!result.ok)
            return say(message, result.reason === 'target_empty' ? 'Esa persona no tiene monedas para robar.' : result.reason === 'self' ? 'No puedes robarte.' : `⏳ Vuelve en ${formatCooldown(result.secondsRemaining ?? 0)}.`);
        return sendPanel(message, economyActionPanel(result.success ? '🕵️ Robo exitoso' : result.protected ? '🛡️ Robo bloqueado' : '🕵️ Robo fallido', result.message, result.success ? result.amount : -result.amount, result.balance, false));
    }
    if (['roulette', 'rl', 'ruleta'].includes(command)) {
        const amount = Number(args[0]);
        const color = normalizeColor(args[1]);
        if (!Number.isInteger(amount) || !color)
            return say(message, 'Uso: `a!roulette cantidad rojo|negro|verde`.');
        const result = await playRoulette(guildId, userId, amount, color, message.id);
        const ball = result.ok ? (result.result === 'rojo' ? '🔴 rojo' : result.result === 'negro' ? '⚫ negro' : '🟢 verde') : '';
        return result.ok ? sendPanel(message, economyActionPanel('🎰 Ruleta', `La bola cayó en **${result.number} ${ball}**. ${result.message}`, result.payout - result.bet, result.balance)) : say(message, 'Apuesta inválida o saldo insuficiente.');
    }
    if (['itemroulette', 'itembet', 'apostar_objeto'].includes(command)) {
        const itemQuery = args.slice(0, -1).join('_').toLowerCase();
        const color = normalizeColor(args.at(-1));
        const item = storeItems.find((entry) => entry.id === itemQuery || entry.name.toLowerCase() === args.slice(0, -1).join(' ').toLowerCase());
        if (!item || !color)
            return say(message, 'Uso: a!itembet cebo_premium rojo|negro|verde.');
        const result = await playItemRoulette(guildId, userId, item.id, color, message.id);
        return result.ok ? sendPanel(message, economyActionPanel('🎒 Apuesta de objeto', result.message, result.payout ? result.payout : -item.cost, result.balance)) : say(message, result.reason === 'missing_item' ? 'No tienes ese artículo.' : 'Ese artículo no se puede apostar.');
    }
    if (['21', 'bj', 'blackjack'].includes(command)) {
        const bet = Number(args[0]);
        if (!Number.isInteger(bet) || bet < 1 || bet > 100_000)
            return say(message, 'Uso: `a!21 apuesta` (1–100000).');
        const result = await startBlackjack(guildId, userId, bet, message.id);
        return result.ok ? sendPanel(message, blackjackPanel(result.view)) : say(message, result.reason === 'invalid_bet' ? 'Apuesta inválida.' : 'Saldo insuficiente.');
    }
    if (['bank', 'banco', 'deposit', 'depositar', 'ingresar', 'withdraw', 'retirar', 'sacar'].includes(command)) {
        const directAction = ['deposit', 'depositar', 'ingresar'].includes(command) ? 'deposit' : ['withdraw', 'retirar', 'sacar'].includes(command) ? 'withdraw' : undefined;
        const action = directAction ?? args[0]?.toLowerCase();
        const amount = Number(directAction ? args[0] : args[1]);
        if ((action === 'deposit' || action === 'withdraw') && Number.isSafeInteger(amount) && amount > 0) {
            const result = await bankAction(guildId, userId, action, amount, message.id);
            if (!result.ok)
                return say(message, result.reason === 'insufficient_wallet' ? 'No tienes suficiente en la billetera.' : result.reason === 'insufficient_bank' ? 'No tienes suficiente en el banco.' : 'Cantidad inválida.');
            return say(message, `🏦 Billetera ${money.format(result.balance)} · banco ${money.format(result.bankBalance)}${result.interestEarned ? ` · interés +${money.format(result.interestEarned)}` : ''}.`);
        }
        if (directAction)
            return say(message, `Uso: \`a!${command} cantidad\`.`);
        await sendPanel(message, await bankPanel(guildId, userId));
        return;
    }
    if (['shop', 'tienda'].includes(command)) {
        await sendPanel(message, await storePanel(guildId, userId));
        return;
    }
    if (command === 'premium') {
        const account = await getAccountBalances(guildId, userId);
        return say(message, `💎 Tienes **${money.format(account.premium)} gemas premium**.`);
    }
    if (['casino'].includes(command)) {
        await sendPanel(message, await casinoPanel(guildId, userId));
        return;
    }
    if (['inv', 'inventory', 'inventario'].includes(command)) {
        await sendPanel(message, await inventoryPanel(guildId, userId));
        return;
    }
    if (['pay', 'pagar', 'dar', 'enviar', 'transferir', 'give-money', 'givemoney'].includes(command)) {
        const target = message.mentions.users.first();
        const amount = Number(args.find((arg) => /^\d+$/.test(arg)));
        if (!target || target.bot || !Number.isSafeInteger(amount) || amount < 1)
            return say(message, 'Uso: `a!dar @persona cantidad` o `a!give-money @persona cantidad`.');
        const result = await transferCoins(guildId, userId, target.id, amount, message.id);
        return say(message, result.ok ? `💸 Enviaste ${money.format(amount)} monedas a ${target}.` : result.reason === 'self' ? 'No puedes enviarte monedas.' : result.reason === 'insufficient_funds' ? 'No tienes saldo suficiente.' : 'Cantidad inválida.');
    }
    if (command === 'use') {
        const key = args.join('_').toLocaleLowerCase();
        const item = storeItems.find((candidate) => candidate.id === key || candidate.name.toLocaleLowerCase() === args.join(' ').toLocaleLowerCase());
        if (!item)
            return say(message, 'Uso: `a!use cebo_premium` o `a!use escudo_antirrobo`.');
        const result = await useShopItem(guildId, userId, item.id, message.id);
        return say(message, result.ok ? result.message : result.reason === 'missing_rod' ? 'Necesitas una **Caña de pescar** comprada en `a!shop` para usar el cebo.' : result.reason === 'cooldown' ? `Espera ${formatCooldown(result.secondsRemaining ?? 0)} para volver a pescar.` : 'No tienes ese artículo o no puedes usarlo ahora.');
    }
    // RPG
    if (['rpg', 'pet', 'mascota'].includes(command)) {
        const action = (args.shift() ?? (command === 'rpg' ? 'menu' : 'panel')).toLowerCase();
        if (['menu', 'menú', 'help', 'ayuda'].includes(action)) {
            await sendPanel(message, await rpgMenuPanel(guildId, userId));
            return;
        }
        if (['panel', 'profile', 'perfil'].includes(action)) {
            await sendPanel(message, await rpgPanel(guildId, userId, message.author.username));
            return;
        }
        if (['release', 'liberar', 'soltar', 'releasepet'].includes(action)) {
            if ((args[0] ?? '').toLocaleLowerCase() !== 'confirmar')
                return say(message, '⚠️ Esto borrará tu mascota actual, incluyendo su nivel, estadísticas, equipo y progreso. Tu mochila RPG y la bitácora se conservan. Para continuar, escribe `a!liberar confirmar`.');
            const released = await releaseRpgPet(guildId, userId);
            if (!released)
                return say(message, 'No tienes una mascota para liberar. Usa `a!pet` para abrir la incubadora.');
            await sendPanel(message, await rpgAdoptionPanel(message.author.username, 'Fuego', '✅ Mascota liberada. Tu nueva adopción empezará desde nivel 1.'));
            return;
        }
        if (['bitacora', 'bitácora', 'log', 'logs', 'historial'].includes(action)) {
            await sendPanel(message, await expeditionLogPanel(guildId, userId));
            return;
        }
        if (['bag', 'mochila', 'inventory', 'inventario'].includes(action)) {
            await sendPanel(message, await rpgInventoryPanel(guildId, userId));
            return;
        }
        if (['feed', 'alimentar', 'comida'].includes(action)) {
            const query = args.join(' ').trim();
            if (!query) {
                await sendPanel(message, await rpgFeedPanel(guildId, userId));
                return;
            }
            const item = findRpgItem(query);
            if (!item || item.effect !== 'snack')
                return say(message, 'Ese artículo no es comida. Usa `a!rpg alimentar` para abrir tus alimentos.');
            const result = await useRpgItem(guildId, userId, item.id, message.id);
            if (!result.ok)
                return say(message, result.reason === 'no_pet' ? 'Primero adopta una mascota.' : result.reason === 'missing_item' ? 'No tienes ese alimento.' : 'Tu mascota ya está saciada y recuperada.');
            await sendPanel(message, rpgCareResultPanel(result.pet, result.message));
            return;
        }
        if (['care', 'cuidar', 'mimar'].includes(action)) {
            const result = await careForRpgPet(guildId, userId);
            if (!result.ok)
                return say(message, result.reason === 'no_pet' ? 'Primero adopta una mascota.' : result.reason === 'max_affection' ? 'El vínculo ya está al máximo.' : `Podrás volver a cuidarla en ${formatCooldown(result.secondsRemaining ?? 0)}.`);
            await sendPanel(message, rpgCareResultPanel(result.pet, `Acariciaste a ${result.pet.name}. Su vínculo aumentó **+${result.affectionGained}**.`));
            return;
        }
        if (['adopt', 'adoptar'].includes(action)) {
            const element = rpgEggOptions.find((entry) => entry.element.toLocaleLowerCase() === (args[0] ?? '').toLocaleLowerCase());
            if (!element) {
                await sendPanel(message, await rpgAdoptionPanel(message.author.username));
                return;
            }
            const { adoptRpgPet } = await import('../services/rpg.js');
            const result = await adoptRpgPet(guildId, userId, args.slice(1).join(' '), element.element);
            if (!result.ok)
                return say(message, result.reason === 'invalid_name' ? 'Nombre inválido.' : 'Ya tienes mascota.');
            await sendPanel(message, await rpgPanel(guildId, userId, message.author.username));
            return;
        }
        if (['name', 'nombrar'].includes(action)) {
            const { renameRpgPet } = await import('../services/rpg.js');
            const result = await renameRpgPet(guildId, userId, args.join(' '));
            return say(message, result.ok ? `🏷️ Ahora se llama **${result.pet.name}**.` : result.reason === 'no_pet' ? 'Primero adopta una mascota.' : result.reason === 'already_used' ? 'Ya usaste el cambio gratuito.' : 'Nombre inválido.');
        }
        if (['attacks', 'ataques', 'build'].includes(action)) {
            await sendPanel(message, await rpgBuildPanel(guildId, userId));
            return;
        }
        if (['explore', 'explorar'].includes(action)) {
            const zoneInput = args.join(' ').trim().toLocaleLowerCase();
            if (!zoneInput) {
                await sendPanel(message, await rpgExplorePanel(guildId, userId, message.author.username));
                return;
            }
            const normalizedZone = zoneInput.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            const zone = rpgZones.find((candidate) => candidate.id === zoneInput || candidate.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase() === normalizedZone);
            if (!zone)
                return say(message, `No reconocí esa zona. Usa \`a!explore\` para elegirla en el panel o elige: ${rpgZones.map((entry) => `\`${entry.id}\``).join(', ')}.`);
            const result = await exploreRpg(guildId, userId, zone.id, message.id);
            if (!result.ok)
                return say(message, result.reason === 'zone_locked' ? 'Tu mascota aún no tiene el nivel necesario.' : result.reason === 'low_energy' ? 'Dale de comer y recupera energía antes de explorar.' : result.reason === 'low_hunger' ? 'Dale de comer antes de explorar.' : result.reason === 'cooldown' ? `Descansa ${formatCooldown(result.secondsRemaining ?? 0)}.` : 'Primero adopta una mascota.');
            await sendPanel(message, await expeditionLogPanel(guildId, userId));
            return;
        }
        if (['fight', 'battle', 'combatir'].includes(action)) {
            const result = await battleRpg(guildId, userId, message.id);
            return say(message, result.ok ? result.message : result.reason === 'no_pet' ? 'Primero adopta una mascota.' : result.reason === 'cooldown' ? `Tu mascota necesita descansar ${formatCooldown(result.secondsRemaining ?? 0)}.` : result.reason === 'low_energy' ? 'A tu mascota le falta energía.' : 'Tu mascota está debilitada.');
        }
        if (['train', 'entrenar'].includes(action)) {
            const stat = { fuerza: 'strength', strength: 'strength', defensa: 'defense', defense: 'defense', agilidad: 'agility', agility: 'agility' }[(args[0] ?? '').toLowerCase()];
            if (!stat)
                return say(message, 'Uso: `a!rpg train fuerza|defensa|agilidad`.');
            const result = await trainRpgPet(guildId, userId, stat, message.id);
            return say(message, result.ok ? `🏋️ ${stat}: ${result.pet[stat]} · saldo ${money.format(result.balance)}.` : result.reason === 'no_pet' ? 'Adopta una mascota primero.' : result.reason === 'cooldown' ? `Tu mascota necesita descansar ${formatCooldown(result.secondsRemaining ?? 0)}.` : result.reason === 'low_energy' ? 'Necesita energía para entrenar.' : result.reason === 'low_hunger' ? 'Dale de comer antes de entrenar.' : 'Necesitas 180 monedas.');
        }
        if (['buy', 'comprar'].includes(action)) {
            const item = findRpgItem(args.join(' '));
            if (!item)
                return say(message, 'Indica el nombre del objeto: `a!rpg buy nombre`.');
            const result = await buyRpgItem(guildId, userId, item.id, message.id);
            return say(message, result.ok ? `🛒 Compraste **${item.name}** · mochila x${result.quantity}.` : 'No tienes monedas suficientes.');
        }
        if (['use', 'usar', 'item'].includes(action)) {
            const item = findRpgItem(args.join(' '));
            if (!item)
                return say(message, 'Indica el objeto: a!rpg use nombre.');
            const result = await useRpgItem(guildId, userId, item.id, message.id);
            return say(message, result.ok ? result.message : result.reason === 'no_pet' ? 'Adopta una mascota primero.' : result.reason === 'missing_item' ? 'No tienes ese objeto.' : item.effect === 'xp' ? 'Ya alcanzaste el límite de XP de hoy. El manual sigue en tu mochila.' : 'No es necesario usarlo ahora.');
        }
        if (['quests', 'misiones'].includes(action)) {
            const quests = await getRpgQuests(guildId, userId);
            if (args[0]?.toLowerCase() === 'claim' || args[0]?.toLowerCase() === 'cobrar') {
                const query = args.slice(1).join(' ').toLowerCase();
                const quest = quests.find((entry) => entry.id === query || entry.title.toLowerCase() === query);
                if (!quest)
                    return say(message, `Misiones: ${quests.map((entry) => entry.id).join(', ')}.`);
                const result = await claimRpgQuest(guildId, userId, quest.id, message.id);
                return say(message, result.ok ? `🎁 Cobraste ${quest.reward} monedas.` : result.reason === 'incomplete' ? 'Aún no completas esa misión.' : result.reason === 'claimed' ? 'Ya la cobraste.' : 'No encontré esa misión.');
            }
            await sendPanel(message, await rpgMissionsPanel(guildId, userId));
            return;
        }
        if (['rank', 'ranking'].includes(action)) {
            await sendPanel(message, await rpgRankingPanel(guildId));
            return;
        }
        if (['challenge', 'retar', 'pvp'].includes(action)) {
            const opponent = message.mentions.users.first();
            if (!opponent) {
                await sendPanel(message, await rpgPvPHelpPanel(guildId));
                return;
            }
            if (opponent.bot)
                return say(message, 'Solo puedes retar a una persona, no a un bot.');
            const result = await createRpgPvpChallenge(guildId, userId, message.author.username, opponent.id, opponent.username, message.id);
            if (!result.ok)
                return say(message, 'No se pudo iniciar el reto; revisa que ambos tengan mascota y no estén en otro duelo.');
            await message.reply({ ...await rpgPvpPanel(result.match), allowedMentions: { repliedUser: false } });
            return;
        }
        return say(message, 'Subcomandos: `panel`, `bitacora`, `adopt elemento [nombre]`, `name`, `alimentar [comida]`, `cuidar`, `explore [zona]`, `fight`, `train stat`, `mochila`, `shop`, `buy objeto`, `use objeto`, `quests`, `rank`, `challenge @persona`, `attacks`.');
    }
    return say(message, `No conozco el comando ${PREFIX}${command}. Usa a!help para ver abreviaturas.`);
}
async function relayMessageCommand(message, command) {
    if (!message.channel.isSendable()) {
        await say(message, 'No puedo publicar mensajes en este canal.');
        return;
    }
    if (message.guild) {
        const botMember = message.guild.members.me;
        if (!botMember?.permissionsIn(message.channelId).has(PermissionFlagsBits.ManageMessages)) {
            await say(message, 'Necesito el permiso **Administrar mensajes** para borrar el comando.');
            return;
        }
    }
    const body = message.content.slice(PREFIX.length).replace(/^\S+\s*/, '').trim();
    const attachments = [...message.attachments.values()];
    const totalBytes = attachments.reduce((sum, attachment) => sum + attachment.size, 0);
    if (totalBytes > 25 * 1024 * 1024) {
        await say(message, 'Los archivos adjuntos superan el límite de 25 MB.');
        return;
    }
    let files;
    try {
        files = await Promise.all(attachments.map(async (attachment, index) => {
            const response = await fetch(attachment.url);
            if (!response.ok)
                throw new Error(`No pude descargar ${attachment.name ?? 'un archivo adjunto'}.`);
            const originalName = (attachment.name ?? `archivo-${index + 1}`).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
            const name = `${index + 1}-${originalName || `archivo-${index + 1}`}`;
            return { attachment: Buffer.from(await response.arrayBuffer()), name, ...(attachment.contentType ? { contentType: attachment.contentType } : {}) };
        }));
    }
    catch (error) {
        await say(message, error instanceof Error ? error.message : 'No pude copiar los archivos adjuntos.');
        return;
    }
    const firstImageIndex = attachments.findIndex((attachment) => attachment.contentType?.startsWith('image/'));
    if (command === 'say') {
        if (!body && !files.length) {
            await say(message, 'Uso: `a!say texto` o adjunta un archivo o imagen.');
            return;
        }
        await message.delete();
        await message.channel.send({ ...(body ? { content: body } : {}), files, allowedMentions: { parse: [] } });
        return;
    }
    const sections = body.split('|').map((section) => section.trim());
    const title = sections.length > 1 ? sections[0] : '';
    let description = sections.length > 1 ? sections[1] : sections[0];
    const requestedColor = sections[2];
    const imageUrl = sections[3];
    if (!title && !description && !files.length && !imageUrl) {
        await say(message, 'Uso: `a!embed título | descripción | #5865f2` o adjunta una imagen.');
        return;
    }
    let color = 0x5865f2;
    if (requestedColor) {
        if (!/^#?[\da-fA-F]{6}$/.test(requestedColor)) {
            await say(message, 'El color debe ser un hexadecimal de seis caracteres, como `#5865f2`.');
            return;
        }
        color = Number.parseInt(requestedColor.replace(/^#/, ''), 16);
    }
    let parsedImageUrl;
    if (imageUrl) {
        try {
            const parsed = new URL(imageUrl);
            if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')
                throw new Error();
            parsedImageUrl = parsed.toString();
        }
        catch {
            await say(message, 'La imagen debe ser un enlace HTTP o HTTPS válido.');
            return;
        }
    }
    if (!title && !description && !parsedImageUrl && firstImageIndex < 0 && files.length) {
        description = `📎 Archivos adjuntos: ${files.map((file) => file.name.replace(/^\d+-/, '')).join(', ')}`;
    }
    const embed = new EmbedBuilder().setColor(color);
    if (title)
        embed.setTitle(title.slice(0, 256));
    if (description)
        embed.setDescription(description.slice(0, 4096));
    if (parsedImageUrl)
        embed.setImage(parsedImageUrl);
    else if (firstImageIndex >= 0)
        embed.setImage(`attachment://${files[firstImageIndex].name}`);
    await message.delete();
    await message.channel.send({ embeds: [embed], files, allowedMentions: { parse: [] } });
}
async function routeUtilityMessage(message, command, args) {
    const target = message.mentions.users.first() ?? message.author;
    const embed = new EmbedBuilder().setColor(0x38bdf8);
    if (['hack', 'hackear'].includes(command)) {
        const ipRanges = ['192.0.2', '198.51.100', '203.0.113'];
        const ip = `${ipRanges[randomInt(ipRanges.length)]}.${randomInt(1, 255)}`;
        const token = Array.from({ length: 12 }, () => randomInt(16).toString(16)).join('');
        const targetName = escapeMarkdown(message.mentions.users.first()?.username ?? `node-${randomInt(10, 99)}.local`).replace(/@/g, '@\u200b');
        const portSet = [
            '22/tcp open  ssh       OpenSSH 9.6',
            '80/tcp open  http      nginx 1.24',
            '443/tcp open https     TLS 1.3',
            '3306/tcp open mysql    MySQL 8.0',
        ];
        const hostKey = Array.from({ length: 4 }, () => randomInt(256).toString(16).padStart(2, '0')).join(':');
        const stages = [
            { progress: 12, command: `ssh root@${ip}`, output: `Resolving ${targetName}…\nHost ${ip} found · ${randomInt(8, 42)} ms` },
            { progress: 34, command: `nmap -sV ${ip}`, output: `PORT      STATE SERVICE\n${portSet[randomInt(portSet.length)]}\nHost key: SHA256:${token.slice(0, 8)}` },
            { progress: 57, command: 'auth --negotiate --key-exchange', output: `Handshake accepted\nFingerprint: ${hostKey}\nSession token: ${token.slice(0, 10)}` },
            { progress: 81, command: 'decrypt --source /var/cache/session.enc', output: `Cipher: AES-256-GCM\nBlocks processed: ${randomInt(128, 4096)}\nIndexing user directory…` },
            { progress: 100, command: 'ls -la /home/root', output: `drwx------  profile.cache\n-rw-------  chat_archive_${randomInt(10, 99)}.dat\n-rw-------  credentials_${token.slice(-4)}.enc\nSession closed.` },
        ];
        const makeHackEmbed = (stage) => new EmbedBuilder().setColor(stage.progress === 100 ? 0x22c55e : 0x38bdf8)
            .setAuthor({ name: 'root@manzanita:~#' })
            .setTitle('⌁ ACCESS TERMINAL')
            .setDescription(`**${targetName}** · \`${ip}\`\n\`\`\`ansi\n$ ${stage.command}\n[${'█'.repeat(Math.floor(stage.progress / 10))}${'░'.repeat(10 - Math.floor(stage.progress / 10))}] ${stage.progress}%\n${stage.output}\n\`\`\``);
        const response = await message.reply({ embeds: [makeHackEmbed(stages[0])], allowedMentions: { parse: [], repliedUser: false } });
        for (const stage of stages.slice(1)) {
            await new Promise((resolve) => setTimeout(resolve, 650 + randomInt(400)));
            await response.edit({ embeds: [makeHackEmbed(stage)], allowedMentions: { parse: [] } });
        }
        return true;
    }
    else if (['roll', 'dado'].includes(command)) {
        const sides = args[0] === undefined ? 100 : Number(args[0]);
        if (!Number.isSafeInteger(sides) || sides < 2 || sides > 1_000_000) {
            await say(message, 'Uso: `a!roll [caras]` · elige entre 2 y 1,000,000.');
            return true;
        }
        embed.setTitle('🎲 Dado').setDescription(`Salió **${randomInt(1, sides + 1)}** de **${sides}**.`);
    }
    else if (['coin', 'moneda'].includes(command)) {
        embed.setTitle('🪙 Volado').setDescription(`Cayó **${randomInt(0, 2) ? 'Sol' : 'Águila'}**.`);
    }
    else if (['choose', 'elegir'].includes(command)) {
        const choices = args.join(' ').split(',').map((choice) => choice.trim()).filter(Boolean).slice(0, 25);
        if (choices.length < 2) {
            await say(message, 'Uso: `a!choose pizza, tacos, sushi` · escribe al menos dos opciones separadas por coma.');
            return true;
        }
        embed.setTitle('🧭 Decisión tomada').setDescription(`Entre ${choices.length} opciones, elijo **${choices[randomInt(choices.length)]}**.`);
    }
    else if (['8ball', 'bola'].includes(command)) {
        const question = args.join(' ').trim();
        if (!question) {
            await say(message, 'Uso: `a!8ball ¿debería pedir tacos?`');
            return true;
        }
        embed.setTitle('🔮 Bola de cristal').addFields({ name: question.slice(0, 256), value: answerEightBall() });
    }
    else if (['avatar', 'av'].includes(command)) {
        embed.setTitle(`🖼️ Avatar de ${target.username}`).setImage(target.displayAvatarURL({ size: 1024 }));
    }
    else if (['userinfo', 'whois', 'usuario'].includes(command)) {
        const member = message.guild?.members.cache.get(target.id);
        embed.setAuthor({ name: target.username, iconURL: target.displayAvatarURL() }).setTitle('👤 Información de usuario')
            .addFields({ name: 'Cuenta', value: `<t:${Math.floor(target.createdTimestamp / 1000)}:D>`, inline: true }, ...(member?.joinedTimestamp ? [{ name: 'Se unió', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:D>`, inline: true }] : []), { name: 'ID', value: `\`${target.id}\``, inline: true });
    }
    else if (['serverinfo', 'server', 'servidor'].includes(command)) {
        const guild = message.guild;
        if (!guild) {
            await say(message, 'Este comando necesita ejecutarse dentro de un servidor.');
            return true;
        }
        const channels = guild.channels.cache;
        const textChannels = channels.filter((channel) => channel.isTextBased() && !channel.isDMBased()).size;
        const voiceChannels = channels.filter((channel) => channel.isVoiceBased()).size;
        embed.setTitle(`🏠 ${guild.name}`).setThumbnail(guild.iconURL({ size: 256 }))
            .addFields({ name: 'Miembros', value: guild.memberCount.toLocaleString('es-MX'), inline: true }, { name: 'Canales', value: `${textChannels} texto · ${voiceChannels} voz`, inline: true }, { name: 'Creado', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: true });
    }
    else if (command === 'ping') {
        embed.setTitle('🏓 Pong').setDescription(`Gateway de Discord: **${Math.max(0, Math.round(message.client.ws.ping))} ms**.`);
    }
    else
        return false;
    await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
    return true;
}
async function adminDmCommands(message, args) {
    const [requestedAction = 'help', guildId = '', targetId = '', ...rest] = args;
    const action = adminActionAliases[requestedAction.toLocaleLowerCase()] ?? requestedAction.toLocaleLowerCase();
    const actorId = message.author.id;
    if (action === 'help')
        return say(message, 'Admin exclusivo del propietario por DM. Dinero: `a!agregar @persona cantidad` / `a!quitar @persona cantidad` (alias `a!add-money` / `a!remove-money`; también `a!admin agregar/quitar`). Consulta: `a!admin inspeccionar <guildID> <userID>` · `a!admin historial <guildID>` · `a!admin rollback <guildID> <ledgerID>`. Herramientas RPG: `pet|remove|heal|xp|rename|stat|item|cooldown|shield` con los argumentos indicados por `a!admin help`.');
    if (action === 'wallet_add' || action === 'wallet_remove') {
        const amount = Number(targetId);
        const targetUserId = message.mentions.users.first()?.id ?? guildId.match(/^<@!?(\d{17,20})>$/)?.[1] ?? guildId;
        if (!/^\d{17,20}$/.test(targetUserId) || !Number.isSafeInteger(amount) || amount < 1 || amount > 1_000_000_000)
            return say(message, 'Uso: `a!agregar @persona cantidad` o `a!quitar @persona cantidad` (solo por DM).');
        const signedAmount = action === 'wallet_add' ? amount : -amount;
        const result = await adjustAdminCurrency(guildId, targetUserId, 'wallet', signedAmount, actorId, message.id);
        if (!result.ok)
            return say(message, result.reason === 'insufficient' ? 'No hay saldo suficiente para retirar esa cantidad.' : 'Cantidad inválida.');
        await addAdminAudit(guildId, actorId, targetUserId, `currency_${action}`, { amount: signedAmount, balance: result.balance, ledgerId: result.ledgerId });
        return say(message, `${action === 'wallet_add' ? 'Agregadas a' : 'Retiradas de'} <@${targetUserId}> **${money.format(amount)} monedas** · saldo actual **${money.format(result.balance)}** · movimiento #${result.ledgerId}.`);
    }
    if (!/^\d{17,20}$/.test(guildId))
        return say(message, 'Falta un ID de servidor válido. Usa a!admin help.');
    if (action === 'history') {
        const entries = await getAdminAudit(guildId, 12);
        const rows = entries.map((entry) => `**#${entry.id} · ${entry.action}**  ·  ${new Date(entry.createdAt * 1000).toLocaleString('es-MX')}\nCuenta: ${entry.targetId ?? '—'}`);
        await sendPanel(message, listPanel('🛡️ HISTORIAL ADMINISTRATIVO', 'Últimos movimientos · acceso privado', rows, 0x475569, 'Sin acciones registradas.'));
        return;
    }
    if (action === 'rollback') {
        const ledgerId = Number(targetId);
        if (!Number.isSafeInteger(ledgerId) || ledgerId < 1)
            return say(message, 'Uso: a!admin rollback <guildID> <ledgerID>.');
        const result = await rollbackAdminCurrency(guildId, ledgerId, actorId);
        if (!result.ok)
            return say(message, `No se pudo revertir: ${result.reason}.`);
        await addAdminAudit(guildId, actorId, result.targetId, 'rollback', { ledgerId, amount: result.amount, currency: result.currency });
        return say(message, `Revertido. Cuenta ${result.targetId} · ${result.currency} ${money.format(result.balance)}.`);
    }
    if (!/^\d{17,20}$/.test(targetId))
        return say(message, 'Falta un ID de usuario válido. Usa a!admin help.');
    if (action === 'inspect') {
        const result = await inspectAdminUser(guildId, targetId);
        const pet = result.pet;
        return say(message, `💰 Cartera ${money.format(result.wallet)} · banco ${money.format(result.bank)} · premium ${money.format(result.premium)}\n🐾 ${pet ? `${pet.name} · ${pet.species} · Nv. ${pet.level} · ${pet.hp}/${pet.maxHp} PV` : 'sin mascota'}\n🎒 ${result.inventory.map((entry) => `${entry.itemId} ×${entry.quantity}`).join(' · ') || 'vacío'}`);
    }
    if (['wallet', 'bank', 'premium'].includes(action)) {
        const amount = Number(rest[0]);
        if (!Number.isSafeInteger(amount) || amount === 0)
            return say(message, 'Indica una cantidad positiva o negativa.');
        const result = await adjustAdminCurrency(guildId, targetId, action, amount, actorId, message.id);
        if (!result.ok)
            return say(message, 'Cantidad inválida o saldo insuficiente.');
        await addAdminAudit(guildId, actorId, targetId, `currency_${action}`, { amount, balance: result.balance, ledgerId: result.ledgerId });
        return say(message, `Listo · saldo ${money.format(result.balance)} · movimiento #${result.ledgerId}.`);
    }
    if (action === 'pet') {
        const query = rest.join(' ').toLocaleLowerCase();
        const species = getSpeciesCatalog().find((entry) => entry.name.toLocaleLowerCase() === query);
        if (!species)
            return say(message, 'Escribe el nombre exacto de una especie registrada.');
        const result = await adminGrantRpgPet(guildId, targetId, species.name);
        if (!result.ok)
            return say(message, result.reason === 'already_has_pet' ? 'La cuenta ya tiene mascota.' : 'No se pudo crear la mascota.');
        await addAdminAudit(guildId, actorId, targetId, 'pet_grant', { species: result.pet.species, rarity: result.pet.rarity });
        return say(message, `Entregada ${result.pet.rarity} ${result.pet.species}.`);
    }
    if (action === 'remove') {
        const removed = await adminRemoveRpgPet(guildId, targetId);
        if (removed)
            await addAdminAudit(guildId, actorId, targetId, 'pet_remove', {});
        return say(message, removed ? 'Mascota retirada.' : 'No tenía mascota.');
    }
    if (['heal', 'xp', 'rename'].includes(action)) {
        const edit = action === 'heal' ? { type: 'restore' } : action === 'xp' ? { type: 'xp', amount: Number(rest[0]) } : { type: 'rename', name: rest.join(' ') };
        const result = await adminEditRpgPet(guildId, targetId, edit);
        if (!result.ok)
            return say(message, 'No existe la mascota o el dato no es válido.');
        await addAdminAudit(guildId, actorId, targetId, `pet_${action}`, { value: rest.join(' ') });
        return say(message, action === 'rename' ? `Nuevo nombre: ${result.pet.name}.` : action === 'xp' ? `${result.pet.name}: nivel ${result.pet.level}, ${result.pet.xp} XP.` : `${result.pet.name}: salud y energía restauradas.`);
    }
    if (action === 'stat') {
        const stats = { fuerza: 'strength', strength: 'strength', defensa: 'defense', defense: 'defense', agilidad: 'agility', agility: 'agility' };
        const stat = stats[(rest[0] ?? '').toLowerCase()];
        const amount = Number(rest[1]);
        if (!stat)
            return say(message, 'Atributos: fuerza, defensa, agilidad.');
        const result = await adminEditRpgPet(guildId, targetId, { type: 'stat', stat, amount });
        if (!result.ok)
            return say(message, 'No se aplicó el cambio.');
        await addAdminAudit(guildId, actorId, targetId, 'pet_stat', { stat, amount });
        return say(message, `${stat}: ${result.pet[stat]}.`);
    }
    if (action === 'item') {
        const amount = Number(rest.at(-1));
        const item = rpgItems.find((entry) => entry.id === rest.slice(0, -1).join('_').toLowerCase());
        if (!item)
            return say(message, 'Indica el item_id exacto del catálogo RPG.');
        const quantity = await grantAdminRpgItem(guildId, targetId, item.id, amount);
        if (quantity === undefined)
            return say(message, 'Cantidad inválida o inventario insuficiente.');
        await addAdminAudit(guildId, actorId, targetId, 'rpg_item', { itemId: item.id, amount, quantity });
        return say(message, `${item.name}: ahora x${quantity}.`);
    }
    if (action === 'cooldown') {
        const cooldown = rest[0];
        if (!['all', 'daily', 'work', 'fish', 'rob', 'crime', 'explore'].includes(cooldown))
            return say(message, 'Cooldown: all, daily, work, fish, rob, crime o explore.');
        await resetAdminCooldown(guildId, targetId, cooldown);
        await addAdminAudit(guildId, actorId, targetId, 'cooldown_reset', { cooldown });
        return say(message, `Cooldown ${cooldown} reiniciado.`);
    }
    if (action === 'shield') {
        const hours = Number(rest[0]);
        if (!Number.isInteger(hours) || hours < 1 || hours > 720)
            return say(message, 'Horas válidas: 1–720.');
        const until = await setAdminRobberyShield(guildId, targetId, hours);
        await addAdminAudit(guildId, actorId, targetId, 'robbery_shield', { hours, until });
        return say(message, `Protección hasta ${new Date(until * 1000).toLocaleString('es-MX')}.`);
    }
    return say(message, 'Comando no reconocido. Usa a!admin help.');
}
function findRpgItem(query) { const normalized = query.toLocaleLowerCase().replace(/\s+/g, ' ').trim(); return rpgItems.find((item) => item.id.toLowerCase() === normalized || item.name.toLocaleLowerCase() === normalized) ?? rpgItems.find((item) => normalized.length >= 3 && item.name.toLocaleLowerCase().includes(normalized)); }
function normalizeColor(value) { const color = value?.toLowerCase(); return color === 'red' ? 'rojo' : color === 'black' ? 'negro' : color === 'green' ? 'verde' : color === 'rojo' || color === 'negro' || color === 'verde' ? color : undefined; }
function requester(message) { return { id: message.author.id, username: message.author.username }; }
async function resignMessageJob(message, guildId, userId, query) {
    const normalized = query.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim();
    const job = normalized ? economyJobs.find((candidate) => candidate.id === normalized || candidate.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase() === normalized) : undefined;
    if (normalized && !job)
        return say(message, `No reconocí ese oficio. Uso: \`a!renunciar [${economyJobs.map((entry) => entry.id).join('|')}]\`.`);
    const result = await resignJob(guildId, userId, job?.id);
    if (!result.ok) {
        if (result.reason === 'no_active_job')
            return say(message, 'No tienes un oficio activo. Usa `a!jobs` para elegir uno.');
        if (result.reason === 'choose_job')
            return say(message, `Tienes varios oficios activos. Indica cuál quieres dejar: ${result.activeJobs.map((entry) => `\`a!renunciar ${entry.id}\``).join(' · ')}.`);
        if (result.reason === 'not_active')
            return say(message, `No tienes activo el oficio **${result.job.name}**. Revisa tus trabajos con \`a!jobs\`.`);
        return say(message, 'No reconocí ese oficio. Usa `a!jobs` para ver la lista.');
    }
    const remaining = result.remainingJobs.length
        ? ` Sigue activo: **${result.remainingJobs.map((entry) => entry.name).join(', ')}**.`
        : ' Ya no tienes un oficio activo; elige otro con `a!jobs` para volver a trabajar.';
    await sendPanel(message, await jobsPanel(guildId, userId, `📤 Renunciaste a **${result.job.name} · nivel ${result.level}**. Tu nivel y XP se conservan si eliges ese oficio otra vez.${remaining}`));
}
async function say(message, content) { await message.reply({ content, allowedMentions: { repliedUser: false } }); }
async function sendPanel(message, panel) {
    await message.reply({ components: panel.components, ...(panel.files ? { files: panel.files } : {}), flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [], repliedUser: false } });
}
