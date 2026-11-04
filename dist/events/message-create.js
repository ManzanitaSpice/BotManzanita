import { EmbedBuilder, MessageFlags } from 'discord.js';
import { randomInt } from 'node:crypto';
import { ADMIN_OWNER_ID } from '../commands/admin.js';
import { bankAction, claimDaily, crime, fish, formatCooldown, getAccountBalances, getLeaderboard, playItemRoulette, playRoulette, robPlayer, startBlackjack, transferCoins, useShopItem, work, storeItems } from '../services/economy.js';
import { addSavedTracks, addTrack, applyMusicEffect, disconnectPlayer, refreshMusicPanel, rememberMusicPanel, rememberSearch, searchTracks } from '../services/music.js';
import { addFavorite, getFavorites, getPlaylist, getPlaylists, removeFavorite, saveTrackToPlaylist } from '../services/music-library.js';
import { adminEditRpgPet, adminGrantRpgPet, adminRemoveRpgPet, battleRpg, buyRpgItem, careForRpgPet, claimRpgQuest, createRpgPvpChallenge, exploreRpg, getRpgQuests, getSpeciesCatalog, rpgItems, rpgZones, trainRpgPet, useRpgItem } from '../services/rpg.js';
import { balancePanel, bankPanel, blackjackPanel, casinoPanel, economyActionPanel, economyPanel, expeditionPanel, favoritesPanel, inventoryPanel, leaderboardPanel, listPanel, musicPanel, premiumStorePanel, queuePanel, rpgAdoptionPanel, rpgBuildPanel, rpgCareResultPanel, rpgFeedPanel, rpgInventoryPanel, rpgMenuPanel, rpgMissionsPanel, rpgPanel, rpgPvPHelpPanel, rpgPvpPanel, rpgRankingPanel, rpgShopPanel, searchResultsPanel, storePanel, playlistsPanel } from '../ui/panels.js';
import { rpgEggOptions } from '../ui/rpg-art.js';
import { addAdminAudit, adjustAdminCurrency, getAdminAudit, grantAdminRpgItem, inspectAdminUser, resetAdminCooldown, rollbackAdminCurrency, setAdminRobberyShield } from '../services/admin.js';
import { createAnimeReaction, findAnimeReaction } from '../services/reactions.js';
import { catalogPanel } from '../ui/catalog.js';
import { profileCardPanel, levelUpCardMessage } from '../ui/profile.js';
import { giveReputation, recordChatActivity } from '../services/profile.js';
const PREFIX = 'a!';
const money = new Intl.NumberFormat('es-MX');
const adminActionAliases = {
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
    if (['adopt', 'adoptar', 'name', 'nombrar', 'explore', 'explorar', 'fight', 'battle', 'combatir', 'train', 'entrenar', 'rpgshop', 'buy', 'comprar', 'item', 'quests', 'misiones', 'rank', 'ranking', 'challenge', 'retar', 'attacks'].includes(command)) {
        args.unshift(command);
        command = 'rpg';
    }
    const reactionId = findAnimeReaction(command);
    if (reactionId) {
        const target = message.mentions.users.first();
        if (target?.id === userId)
            return say(message, 'Manzanita no puede hacer esa acción consigo misma.');
        const result = await createAnimeReaction(reactionId, '🌿 Manzanita', target?.username, `${guildId}:${userId}`);
        if (!result.ok)
            return say(message, result.reason === 'target_required' ? `Menciona a alguien: a!${reactionId} @persona.` : result.reason === 'self' ? 'Manzanita no puede hacer esa acción consigo misma.' : result.reason === 'cooldown' ? `Espera ${result.seconds ?? 1} s antes de otra expresión.` : 'No pude cargar el GIF ahora; intenta en un momento.');
        await message.reply({ embeds: [result.embed], allowedMentions: { parse: [] } });
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
        await say(message, result.playlist ? `🎶 Añadí **${result.count} canciones** a la cola${result.truncated ? ' (límite de 50)' : ''}.` : `🎶 Añadí **${result.title}** a la cola.`);
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
        await sendPanel(message, queuePanel(client.lavalink.getPlayer(guildId), 0));
        return;
    }
    if (['np', 'nowplaying', 'panel'].includes(command)) {
        const panelMessage = await message.reply({ ...musicPanel(guildId, client.lavalink.getPlayer(guildId)), allowedMentions: { repliedUser: false } });
        rememberMusicPanel(guildId, panelMessage);
        return;
    }
    if (['pause', 'resume', 'skip', 'prev', 'stop', 'leave', 'shuffle', 'repeat', 'vol', 'volume', 'fx', 'effect'].includes(command)) {
        const player = client.lavalink.getPlayer(guildId);
        if (!player)
            return say(message, 'No hay música activa. Usa `a!play canción`.');
        const voiceChannelId = message.guild.voiceStates.cache.get(userId)?.channelId;
        if (!voiceChannelId || voiceChannelId !== player.voiceChannelId)
            return say(message, 'Entra al mismo canal de voz que el bot para controlarlo.');
        let response = '';
        if (command === 'pause') {
            await player.pause();
            response = '⏸️ Pausada.';
        }
        else if (command === 'resume') {
            await player.resume();
            response = '▶️ Reanudada.';
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
        else if (command === 'shuffle') {
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
    if (['lists', 'listas', 'playlist'].includes(command)) {
        const action = args[0]?.toLowerCase();
        if (!action || action === 'list') {
            const lists = getPlaylists(guildId, userId);
            await sendPanel(message, playlistsPanel(lists));
            return;
        }
        if (action === 'save' || action === 'guardar') {
            const name = args.slice(1).join(' ');
            const current = client.lavalink.getPlayer(guildId)?.queue.current;
            if (!name || !current)
                return say(message, 'Uso: `a!lists save nombre` mientras hay una canción activa.');
            const result = saveTrackToPlaylist(guildId, userId, name, current);
            return say(message, result.state === 'added' ? `💾 Guardada en **${result.name}** (${result.count}).` : result.state === 'exists' ? 'Esa canción ya está en la lista.' : 'La lista llegó a su límite.');
        }
        if (action === 'play' || action === 'reproducir') {
            const name = args.slice(1).join(' ');
            const saved = getPlaylist(guildId, userId, name);
            const voiceChannelId = message.guild.voiceStates.cache.get(userId)?.channelId;
            if (!saved)
                return say(message, 'No encontré esa lista.');
            if (!voiceChannelId)
                return say(message, 'Entra a un canal de voz primero.');
            const result = await addSavedTracks(client, { guildId, voiceChannelId, textChannelId: message.channelId, user: requester(message), uris: saved.tracks.map((track) => track.trackUri) });
            return say(message, `🎶 Añadí ${result.added} canción(es) de **${saved.playlist.name}**${result.unavailable ? ` · ${result.unavailable} no disponibles` : ''}.`);
        }
        return say(message, 'Usa `a!lists`, `a!lists save nombre` o `a!lists play nombre`.');
    }
    // ECONOMY
    if (['bal', 'b', 'balance', 'saldo'].includes(command)) {
        const target = message.mentions.users.first() ?? message.author;
        const account = await getAccountBalances(guildId, target.id);
        await sendPanel(message, balancePanel(target.username, account, false));
        return;
    }
    if (['top', 'baltop', 'rich'].includes(command)) {
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
        await sendPanel(message, await profileCardPanel(guildId, message.author, userId, 'wallet'));
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
        await sendPanel(message, await economyPanel(guildId, userId, message.author.username));
        return;
    }
    if (['daily', 'd', 'diaria'].includes(command)) {
        const result = await claimDaily(guildId, userId, message.id);
        if (!result.ok)
            return say(message, `⏳ Vuelve en ${formatCooldown(result.secondsRemaining)}.`);
        return sendPanel(message, economyActionPanel('🎁 Recompensa diaria', 'Tu recompensa de hoy ya está en tu billetera.', result.amount, result.balance));
    }
    if (['work', 'w', 'trabajar'].includes(command)) {
        const result = await work(guildId, userId, message.id);
        if (!result.ok)
            return say(message, `🧰 Vuelve en ${formatCooldown(result.secondsRemaining)}.`);
        return sendPanel(message, economyActionPanel('🧰 Trabajo completado', result.message, result.amount, result.balance));
    }
    if (['fish', 'f', 'pescar'].includes(command)) {
        const result = await fish(guildId, userId, message.id);
        if (!result.ok)
            return say(message, `🎣 Vuelve en ${formatCooldown(result.secondsRemaining)}.`);
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
    if (['bank', 'banco'].includes(command)) {
        const action = args[0]?.toLowerCase();
        const amount = Number(args[1]);
        if ((action === 'deposit' || action === 'withdraw') && Number.isSafeInteger(amount) && amount > 0) {
            const result = await bankAction(guildId, userId, action, amount, message.id);
            if (!result.ok)
                return say(message, result.reason === 'insufficient_wallet' ? 'No tienes suficiente en la billetera.' : result.reason === 'insufficient_bank' ? 'No tienes suficiente en el banco.' : 'Cantidad inválida.');
            return say(message, `🏦 Billetera ${money.format(result.balance)} · banco ${money.format(result.bankBalance)}${result.interestEarned ? ` · interés +${money.format(result.interestEarned)}` : ''}.`);
        }
        await sendPanel(message, await bankPanel(guildId, userId));
        return;
    }
    if (['shop', 'tienda'].includes(command)) {
        await sendPanel(message, await storePanel(guildId, userId));
        return;
    }
    if (['premium', 'premiumshop'].includes(command)) {
        await sendPanel(message, await premiumStorePanel(guildId, userId));
        return;
    }
    if (['casino'].includes(command)) {
        await sendPanel(message, await casinoPanel(guildId, userId));
        return;
    }
    if (['inv', 'inventory', 'inventario'].includes(command)) {
        await sendPanel(message, await inventoryPanel(guildId, userId));
        return;
    }
    if (['pay', 'pagar'].includes(command)) {
        const target = message.mentions.users.first();
        const amount = Number(args.find((arg) => /^\d+$/.test(arg)));
        if (!target || target.bot || !Number.isSafeInteger(amount) || amount < 1)
            return say(message, 'Uso: `a!pay @persona cantidad`.');
        const result = await transferCoins(guildId, userId, target.id, amount, message.id);
        return say(message, result.ok ? `💸 Enviaste ${money.format(amount)} monedas a ${target}.` : result.reason === 'self' ? 'No puedes enviarte monedas.' : result.reason === 'insufficient_funds' ? 'No tienes saldo suficiente.' : 'Cantidad inválida.');
    }
    if (command === 'use') {
        const key = args.join('_').toLocaleLowerCase();
        const item = storeItems.find((candidate) => candidate.id === key || candidate.name.toLocaleLowerCase() === args.join(' ').toLocaleLowerCase());
        if (!item)
            return say(message, 'Uso: `a!use cebo_premium` o `a!use escudo_antirrobo`.');
        const result = await useShopItem(guildId, userId, item.id, message.id);
        return say(message, result.ok ? result.message : 'No tienes ese artículo o no puedes usarlo ahora.');
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
            await sendPanel(message, rpgCareResultPanel(result.pet, `Pasaste tiempo con ${result.pet.name}. Su vínculo aumentó **+${result.affectionGained}**.`));
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
        if (['shop', 'tienda', 'rpgshop'].includes(action)) {
            await sendPanel(message, await rpgShopPanel(guildId, userId));
            return;
        }
        if (['explore', 'explorar'].includes(action)) {
            const zoneInput = args.join(' ').toLowerCase();
            const zone = rpgZones.find((candidate) => candidate.id === zoneInput || candidate.name.toLowerCase() === zoneInput);
            if (!zone)
                return say(message, `Zonas: ${rpgZones.map((z) => z.id).join(', ')}.`);
            const result = await exploreRpg(guildId, userId, zone.id, message.id);
            if (!result.ok)
                return say(message, result.reason === 'zone_locked' ? 'Tu mascota aún no tiene el nivel necesario.' : result.reason === 'low_energy' ? 'A tu mascota le falta energía.' : result.reason === 'low_hunger' ? 'Dale de comer antes de explorar.' : result.reason === 'cooldown' ? `Descansa ${formatCooldown(result.secondsRemaining ?? 0)}.` : 'Primero adopta una mascota.');
            await sendPanel(message, expeditionPanel(result.events, result.message, result.pet.hp, result.pet.maxHp, result.pet.energy, result.pet.maxEnergy, result.pet.hunger, result.pet.affection));
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
            await message.reply({ ...rpgPvpPanel(result.match), allowedMentions: { repliedUser: false } });
            return;
        }
        return say(message, 'Subcomandos: `panel`, `adopt elemento [nombre]`, `name`, `alimentar [comida]`, `cuidar`, `explore zona`, `fight`, `train stat`, `mochila`, `shop`, `buy objeto`, `use objeto`, `quests`, `rank`, `challenge @persona`, `attacks`.');
    }
    return say(message, `No conozco el comando ${PREFIX}${command}. Usa a!help para ver abreviaturas.`);
}
async function routeUtilityMessage(message, command, args) {
    const target = message.mentions.users.first() ?? message.author;
    const embed = new EmbedBuilder().setColor(0x38bdf8);
    if (['roll', 'dado'].includes(command)) {
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
        const answers = ['Sí, y con bastante confianza.', 'Todo apunta a que sí.', 'Parece que sí, pero no lo grites todavía.', 'Hoy las probabilidades están de tu lado.', 'Mejor pregunta en un ratito.', 'No puedo prometerlo.', 'Las señales dicen que no.', 'No cuentes con ello.', 'Definitivamente no.', 'La respuesta está detrás de otra taza de té.'];
        embed.setTitle('🔮 Bola de cristal').addFields({ name: question.slice(0, 256), value: answers[randomInt(answers.length)] });
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
        return say(message, 'Admin por DM: wallet|bank|premium <guildID> <userID> ±cantidad · pet|md <guildID> <userID> <especie> · remove|mq|resetpet <guildID> <userID> · heal|mc · xp|mxp · rename|mn · stat|ma · item · cooldown|rt · shield|pr · inspect|i · rollback|rb · history|h. También puedes usar los alias directamente: `a!mq <guildID> <userID>`.');
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
async function say(message, content) { await message.reply({ content, allowedMentions: { repliedUser: false } }); }
async function sendPanel(message, panel) {
    await message.reply({ components: panel.components, ...(panel.files ? { files: panel.files } : {}), flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [], repliedUser: false } });
}
