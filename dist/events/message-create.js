import { MessageFlags } from 'discord.js';
import { ADMIN_OWNER_ID } from '../commands/admin.js';
import { bankAction, claimDaily, crime, fish, formatCooldown, getAccountBalances, getLeaderboard, playItemRoulette, playRoulette, robPlayer, startBlackjack, transferCoins, useShopItem, work, storeItems } from '../services/economy.js';
import { addSavedTracks, addTrack, applyMusicEffect, disconnectPlayer, refreshMusicPanel, rememberMusicPanel, rememberSearch, searchTracks } from '../services/music.js';
import { addFavorite, getFavorites, getPlaylist, getPlaylists, removeFavorite, saveTrackToPlaylist } from '../services/music-library.js';
import { adminEditRpgPet, adminGrantRpgPet, adminRemoveRpgPet, battleRpg, buyRpgItem, claimRpgQuest, createRpgPvpChallenge, exploreRpg, getRpgInventory, getRpgLeaderboard, getRpgQuests, getSpeciesCatalog, rpgItems, rpgZones, trainRpgPet, useRpgItem } from '../services/rpg.js';
import { bankPanel, blackjackPanel, casinoPanel, economyPanel, economyProfilePanel, favoritesPanel, inventoryPanel, musicPanel, premiumStorePanel, queuePanel, rpgBestiaryPanel, rpgBuildPanel, rpgPanel, rpgPvpPanel, rpgShopPanel, searchResultsPanel, storePanel } from '../ui/panels.js';
import { addAdminAudit, adjustAdminCurrency, getAdminAudit, grantAdminRpgItem, inspectAdminUser, resetAdminCooldown, rollbackAdminCurrency, setAdminRobberyShield } from '../services/admin.js';
import { createAnimeReaction, findAnimeReaction } from '../services/reactions.js';
import { catalogPanel } from '../ui/catalog.js';
const PREFIX = 'a!';
const money = new Intl.NumberFormat('es-MX');
export function registerMessageCommandHandler(client) {
    client.on('messageCreate', (message) => {
        if (message.author.bot || !message.content.toLocaleLowerCase().startsWith(PREFIX))
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
    if (['adopt', 'adoptar', 'name', 'nombrar', 'bestiary', 'bestiario', 'explore', 'explorar', 'fight', 'battle', 'combatir', 'train', 'entrenar', 'rpgshop', 'buy', 'comprar', 'item', 'quests', 'misiones', 'rank', 'ranking', 'challenge', 'retar', 'attacks'].includes(command)) {
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
            return say(message, lists.length ? lists.map((list) => `**${list.name}** · ${list.trackCount} canciones`).join('\n') : 'Aún no tienes listas. Usa `a!lists save nombre de lista` con una canción activa.');
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
        return say(message, `💰 **${target.username}** · cartera ${money.format(account.wallet)} · banco ${money.format(account.bank)} · total **${money.format(account.total)}**`);
    }
    if (['top', 'baltop', 'rich'].includes(command)) {
        const rows = await getLeaderboard(guildId);
        return say(message, `# 🏆 TOP ECONOMÍA\n${rows.length ? rows.map((row, i) => `**${i + 1}.** <@${row.userId}> · ${money.format(row.balance)}`).join('\n') : 'Aún no hay cuentas.'}`);
    }
    if (command === 'profile') {
        await sendPanel(message, await economyProfilePanel(guildId, userId, message.author.username));
        return;
    }
    if (['eco', 'economy'].includes(command)) {
        await sendPanel(message, await economyPanel(guildId, userId));
        return;
    }
    if (['daily', 'd', 'diaria'].includes(command)) {
        const result = await claimDaily(guildId, userId, message.id);
        return say(message, result.ok ? `🎁 +${result.amount} monedas · saldo ${money.format(result.balance)}.` : `⏳ Vuelve en ${formatCooldown(result.secondsRemaining)}.`);
    }
    if (['work', 'w', 'trabajar'].includes(command)) {
        const result = await work(guildId, userId, message.id);
        return say(message, result.ok ? `${result.message} · saldo ${money.format(result.balance)}.` : `🧰 Vuelve en ${formatCooldown(result.secondsRemaining)}.`);
    }
    if (['fish', 'f', 'pescar'].includes(command)) {
        const result = await fish(guildId, userId, message.id);
        return say(message, result.ok ? `${result.message} · saldo ${money.format(result.balance)}.` : `🎣 Vuelve en ${formatCooldown(result.secondsRemaining)}.`);
    }
    if (['crime', 'c', 'crimen'].includes(command)) {
        const result = await crime(guildId, userId, message.id);
        return say(message, result.ok ? `${result.message} · saldo ${money.format(result.balance)}.` : `🚨 Vuelve en ${formatCooldown(result.secondsRemaining)}.`);
    }
    if (['rob', 'r', 'robar'].includes(command)) {
        const target = message.mentions.users.first();
        if (!target || target.bot)
            return say(message, 'Uso: `a!rob @persona`.');
        const result = await robPlayer(guildId, userId, target.id, target.username, message.id);
        return say(message, result.ok ? `${result.message} · saldo ${money.format(result.balance)}.` : result.reason === 'target_empty' ? 'Esa persona no tiene monedas para robar.' : result.reason === 'self' ? 'No puedes robarte.' : `⏳ Vuelve en ${formatCooldown(result.secondsRemaining ?? 0)}.`);
    }
    if (['roulette', 'rl', 'ruleta'].includes(command)) {
        const amount = Number(args[0]);
        const color = normalizeColor(args[1]);
        if (!Number.isInteger(amount) || !color)
            return say(message, 'Uso: `a!roulette cantidad rojo|negro|verde`.');
        const result = await playRoulette(guildId, userId, amount, color, message.id);
        return say(message, result.ok ? `🎰 ${result.number} ${result.result} · ${result.message} · saldo ${money.format(result.balance)}.` : 'Apuesta inválida o saldo insuficiente.');
    }
    if (['itemroulette', 'itembet', 'apostar_objeto'].includes(command)) {
        const itemQuery = args.slice(0, -1).join('_').toLowerCase();
        const color = normalizeColor(args.at(-1));
        const item = storeItems.find((entry) => entry.id === itemQuery || entry.name.toLowerCase() === args.slice(0, -1).join(' ').toLowerCase());
        if (!item || !color)
            return say(message, 'Uso: a!itembet cebo_premium rojo|negro|verde.');
        const result = await playItemRoulette(guildId, userId, item.id, color, message.id);
        return say(message, result.ok ? `🎰 ${result.message}` : result.reason === 'missing_item' ? 'No tienes ese artículo.' : 'Ese artículo no se puede apostar.');
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
        const action = (args.shift() ?? 'panel').toLowerCase();
        if (['panel', 'profile', 'perfil'].includes(action)) {
            await sendPanel(message, await rpgPanel(guildId, userId, message.author.username));
            return;
        }
        if (['adopt', 'adoptar'].includes(action)) {
            const { adoptRpgPet } = await import('../services/rpg.js');
            const result = await adoptRpgPet(guildId, userId, args.join(' '));
            return say(message, result.ok ? `🐾 Adoptaste **${result.pet.name}**, ${result.pet.rarity} ${result.pet.species}.` : result.reason === 'invalid_name' ? 'Nombre inválido.' : 'Ya tienes mascota.');
        }
        if (['name', 'nombrar'].includes(action)) {
            const { renameRpgPet } = await import('../services/rpg.js');
            const result = await renameRpgPet(guildId, userId, args.join(' '));
            return say(message, result.ok ? `🏷️ Ahora se llama **${result.pet.name}**.` : result.reason === 'no_pet' ? 'Primero adopta una mascota.' : result.reason === 'already_used' ? 'Ya usaste el cambio gratuito.' : 'Nombre inválido.');
        }
        if (['bestiary', 'bestiario'].includes(action)) {
            await sendPanel(message, rpgBestiaryPanel());
            return;
        }
        if (['attacks', 'ataques', 'build'].includes(action)) {
            await sendPanel(message, await rpgBuildPanel(guildId, userId));
            return;
        }
        if (['shop', 'tienda', 'rpgshop'].includes(action)) {
            await sendPanel(message, await rpgShopPanel(guildId, userId));
            return;
        }
        if (['inventory', 'inv', 'mochila'].includes(action)) {
            const items = await getRpgInventory(guildId, userId);
            return say(message, items.length ? items.map((entry) => `${rpgItems.find((item) => item.id === entry.itemId)?.name ?? entry.itemId} ×${entry.quantity}`).join('\n') : 'Tu mochila RPG está vacía.');
        }
        if (['explore', 'explorar'].includes(action)) {
            const zoneInput = args.join(' ').toLowerCase();
            const zone = rpgZones.find((candidate) => candidate.id === zoneInput || candidate.name.toLowerCase() === zoneInput);
            if (!zone)
                return say(message, `Zonas: ${rpgZones.map((z) => z.id).join(', ')}.`);
            const result = await exploreRpg(guildId, userId, zone.id, message.id);
            return say(message, result.ok ? `# 🧭 ${zone.name}\n${result.events.map((event) => `${event.emoji} **${event.title}:** ${event.detail}`).join('\n')}\n${result.message}` : result.reason === 'zone_locked' ? 'Tu mascota aún no tiene el nivel necesario.' : result.reason === 'low_energy' ? 'A tu mascota le falta energía.' : result.reason === 'cooldown' ? `Descansa ${formatCooldown(result.secondsRemaining ?? 0)}.` : 'Primero adopta una mascota.');
        }
        if (['fight', 'battle', 'combatir'].includes(action)) {
            const result = await battleRpg(guildId, userId, message.id);
            return say(message, result.ok ? result.message : result.reason === 'no_pet' ? 'Primero adopta una mascota.' : result.reason === 'low_energy' ? 'A tu mascota le falta energía.' : 'Tu mascota está debilitada.');
        }
        if (['train', 'entrenar'].includes(action)) {
            const stat = { fuerza: 'strength', strength: 'strength', defensa: 'defense', defense: 'defense', agilidad: 'agility', agility: 'agility' }[(args[0] ?? '').toLowerCase()];
            if (!stat)
                return say(message, 'Uso: `a!rpg train fuerza|defensa|agilidad`.');
            const result = await trainRpgPet(guildId, userId, stat, message.id);
            return say(message, result.ok ? `🏋️ ${stat}: ${result.pet[stat]} · saldo ${money.format(result.balance)}.` : result.reason === 'no_pet' ? 'Adopta una mascota primero.' : result.reason === 'low_energy' ? 'Necesita energía para entrenar.' : 'Necesitas 180 monedas.');
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
            return say(message, result.ok ? result.message : result.reason === 'no_pet' ? 'Adopta una mascota primero.' : result.reason === 'missing_item' ? 'No tienes ese objeto.' : 'No es necesario usarlo ahora.');
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
            return say(message, quests.map((quest) => `${quest.claimed ? '✅' : quest.progress >= quest.target ? '🎁' : '▫️'} **${quest.title}** ${quest.progress}/${quest.target} · ${quest.reward} monedas`).join('\n') || 'No hay misiones.');
        }
        if (['rank', 'ranking'].includes(action)) {
            const rows = await getRpgLeaderboard(guildId);
            return say(message, `# 🏆 RANKING RPG\n${rows.length ? rows.map((pet, i) => `**${i + 1}.** <@${pet.userId}> · ${pet.name} · Nv. ${pet.level}`).join('\n') : 'Aún no hay mascotas.'}`);
        }
        if (['challenge', 'retar', 'pvp'].includes(action)) {
            const opponent = message.mentions.users.first();
            if (!opponent || opponent.bot)
                return say(message, 'Uso: a!rpg challenge @persona.');
            const result = await createRpgPvpChallenge(guildId, userId, message.author.username, opponent.id, opponent.username, message.id);
            if (!result.ok)
                return say(message, 'No se pudo iniciar el reto; revisa que ambos tengan mascota y no estén en otro duelo.');
            await message.reply({ ...rpgPvpPanel(result.match), allowedMentions: { repliedUser: false } });
            return;
        }
        return say(message, 'Subcomandos: `panel`, `adopt`, `name`, `bestiary`, `explore zona`, `fight`, `train stat`, `shop`, `buy objeto`, `use objeto`, `quests`, `rank`, `challenge @persona`, `attacks`.');
    }
    return say(message, `No conozco el comando ${PREFIX}${command}. Usa a!help para ver abreviaturas.`);
}
async function adminDmCommands(message, args) {
    const [action = 'help', guildId = '', targetId = '', ...rest] = args;
    const actorId = message.author.id;
    if (action === 'help')
        return say(message, 'Admin por DM: wallet|bank|premium <guildID> <userID> ±cantidad · pet <guildID> <userID> <especie exacta> · remove|heal|xp|rename|stat|item|cooldown|shield|inspect <guildID> <userID> ... · rollback <guildID> <ledgerID> · history <guildID>.');
    if (!/^\d{17,20}$/.test(guildId))
        return say(message, 'Falta un ID de servidor válido. Usa a!admin help.');
    if (action === 'history') {
        const entries = await getAdminAudit(guildId, 12);
        return say(message, entries.length ? entries.map((entry) => `#${entry.id} · ${entry.action} · ${entry.targetId ?? '—'} · ${new Date(entry.createdAt * 1000).toLocaleString('es-MX')}`).join('\n') : 'Sin acciones registradas.');
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
            return say(message, 'Escribe el nombre exacto de una especie del bestiario.');
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
    await message.reply({ components: panel.components, ...(panel.files ? { files: panel.files } : {}), flags: MessageFlags.IsComponentsV2, allowedMentions: { repliedUser: false } });
}
