import {
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
  type Client,
  type Interaction,
} from 'discord.js';
import { bankPanel, blackjackPanel, casinoPanel, componentUpdate, economyActionPanel, economyPanel, expeditionLogPanel, favoritesPanel, inventoryPanel, jobsPanel, musicPanel, purchaseConfirmPanel, queuePanel, rpgAdoptionPanel, rpgBuildPanel, rpgCareResultPanel, rpgCombatPanel, rpgExplorePanel, rpgFeedPanel, rpgInventoryPanel, rpgManagePanel, rpgMenuPanel, rpgMissionsPanel, rpgPanel, rpgPvPHelpPanel, rpgPvpPanel, rpgRankingPanel, rpgShopPanel, storePanel } from '../ui/panels.js';
import { bankAction, claimDaily, fish, formatCooldown, playBlackjackTurn, purchaseItem, selectJob, storeItems, useShopItem } from '../services/economy.js';
import { adoptRpgPet, battleRpg, buyRpgItem, careForRpgPet, claimRpgQuest, equipRpgMoves, exploreRpg, getRpgInventory, getRpgPet, getRpgQuests, learnRpgMove, playRpgPvpTurn, renameRpgPet, respondRpgPvpChallenge, rpgItems, rpgZones, trainRpgPet, useRpgItem, type PetElement, type RpgPvpAction } from '../services/rpg.js';
import { rpgEggOptions } from '../ui/rpg-art.js';
import { addSelectedTrack, addTrack, applyMusicEffect, disconnectPlayer, refreshMusicPanel, takeSearchTrack, type MusicEffect } from '../services/music.js';
import { getFavorite, getFavorites, removeFavorite } from '../services/music-library.js';
import { removePersistedMusicQueueTrack } from '../storage/music-queue-store.js';
import { ADMIN_OWNER_ID, adminAutocomplete } from '../commands/admin.js';
import { catalogPanel } from '../ui/catalog.js';
import { profileCardPanel, profileCustomizePanel, profileInventoryPanel, profileProgressPanel, profileShopPanel } from '../ui/profile.js';
import { buyProfileItem, equipProfileItem, updateProfileField, unequipProfileType } from '../services/profile.js';
import { profileShopItems } from '../data/profile-shop.js';
import { findStoreProduct, purchaseStoreProduct, type StoreKind } from '../services/store.js';

export function registerInteractionHandler(client: Client) {
  client.on('interactionCreate', async (interaction: Interaction) => {
    try {
      if (interaction.isAutocomplete()) {
        if (interaction.commandName === 'admin') {
          if (interaction.user.id !== ADMIN_OWNER_ID) { await interaction.respond([]); return; }
          const option = interaction.options.getFocused(true);
          await interaction.respond(adminAutocomplete(option.value, option.name));
        } else if (interaction.commandName === 'rpg') {
          const subcommand = interaction.options.getSubcommand();
          const query = interaction.options.getFocused().toLocaleLowerCase();
          const owned = subcommand === 'usar' || subcommand === 'alimentar' ? await getRpgInventory(interaction.guildId ?? '', interaction.user.id) : undefined;
          const candidates = subcommand === 'usar'
            ? (owned ?? []).flatMap((entry) => { const item = rpgItems.find((candidate) => candidate.id === entry.itemId); return item ? [{ name: `${item.emoji} ${item.name} ×${entry.quantity}`, value: item.id }] : []; })
            : subcommand === 'alimentar'
              ? (owned ?? []).flatMap((entry) => { const item = rpgItems.find((candidate) => candidate.id === entry.itemId && candidate.effect === 'snack'); return item ? [{ name: `${item.emoji} ${item.name} ×${entry.quantity}`, value: item.id }] : []; })
              : rpgItems.map((item) => ({ name: `${item.emoji} ${item.name} · ${item.cost} · ${item.rarity}`, value: item.id }));
          await interaction.respond(candidates.filter((choice) => choice.name.toLocaleLowerCase().includes(query)).slice(0, 25));
        } else await interaction.respond([]);
        return;
      }
      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (command) await command.execute(interaction);
        return;
      }
      if (await handleProfileInteraction(interaction)) return;
      if (interaction.isModalSubmit() && interaction.customId === 'rpg:name:submit') {
        if (!interaction.guildId) { await interaction.reply({ content: 'El RPG solo está disponible dentro de un servidor.', flags: MessageFlags.Ephemeral }); return; }
        const result = await renameRpgPet(interaction.guildId, interaction.user.id, interaction.fields.getTextInputValue('name'));
        const message = result.ok ? `🏷️ Tu mascota ahora se llama **${result.pet.name}**. Actualiza el panel RPG para ver el cambio.` : result.reason === 'no_pet' ? 'Primero adopta una mascota.' : result.reason === 'already_used' ? 'Ya usaste el nombre gratuito de esta mascota.' : 'Usa de 2 a 24 caracteres sin menciones ni formato de Discord.';
        await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
        return;
      }
      if (interaction.isModalSubmit() && interaction.customId === 'music:add:modal') {
        if (!interaction.guildId || !interaction.guild) {
          await interaction.reply({ content: 'La música solo está disponible dentro de un servidor.', flags: MessageFlags.Ephemeral });
          return;
        }
        const voiceChannelId = interaction.guild.voiceStates.cache.get(interaction.user.id)?.channelId;
        if (!voiceChannelId) {
          await interaction.reply({ content: 'Entra primero a un canal de voz para reproducir música.', flags: MessageFlags.Ephemeral });
          return;
        }
        const textChannelId = interaction.channelId;
        if (!textChannelId) {
          await interaction.reply({ content: 'No pude identificar el canal donde se inició la solicitud.', flags: MessageFlags.Ephemeral });
          return;
        }
        const query = interaction.fields.getTextInputValue('query').trim();
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
          const result = await addTrack(interaction.client, {
            guildId: interaction.guildId,
            voiceChannelId,
            textChannelId,
            user: interaction.user,
            query,
          });
          const description = result.playlist
            ? `Añadí **${result.count} canciones** de la lista a la cola.`
            : `Añadí **${result.title}** a la cola.`;
          await interaction.editReply(`🎶 ${description}`);
          await refreshMusicPanel(interaction.client, interaction.guildId);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'No pude añadir esa canción.';
          await interaction.editReply(`⚠️ ${message}`);
        }
        return;
      }
      if (interaction.isModalSubmit() && interaction.customId.startsWith('eco:bank:modal:')) {
        if (!interaction.guildId) {
          await interaction.reply({ content: 'El banco solo está disponible dentro de un servidor.', flags: MessageFlags.Ephemeral });
          return;
        }
        const action = interaction.customId.slice('eco:bank:modal:'.length);
        if (action !== 'deposit' && action !== 'withdraw') {
          await interaction.reply({ content: 'Esa operación bancaria no es válida.', flags: MessageFlags.Ephemeral });
          return;
        }
        const amount = Number(interaction.fields.getTextInputValue('amount').trim());
        const result = await bankAction(interaction.guildId, interaction.user.id, action, amount, interaction.id);
        if (!result.ok) {
          const message = result.reason === 'insufficient_wallet' ? 'No tienes esa cantidad disponible en tu billetera.'
            : result.reason === 'insufficient_bank' ? 'No tienes esa cantidad ahorrada en el banco.'
              : 'Escribe una cantidad entera mayor que cero.';
          await interaction.reply({ content: `🏦 ${message}`, flags: MessageFlags.Ephemeral });
          return;
        }
        const verb = action === 'deposit' ? 'Depositaste' : 'Retiraste';
        const interest = result.interestEarned ? ` También se acreditaron **${result.interestEarned} monedas de interés**.` : '';
        await interaction.reply({ content: `🏦 ${verb} **${amount} monedas**. Billetera: **${result.balance}** · Banco: **${result.bankBalance}**.${interest}`, flags: MessageFlags.Ephemeral });
        return;
      }
      if (!interaction.isMessageComponent() || !interaction.guildId) return;

      if (interaction.customId.startsWith('jobs:select:') && interaction.isStringSelectMenu()) {
        const ownerId = interaction.customId.slice('jobs:select:'.length);
        if (interaction.user.id !== ownerId) {
          await interaction.reply({ content: 'Este selector de trabajos pertenece a otra persona.', flags: MessageFlags.Ephemeral });
          return;
        }
        const jobId = interaction.values[0] ?? '';
        const result = await selectJob(interaction.guildId, ownerId, jobId);
        if (!result.ok) {
          await interaction.reply({ content: 'Ese trabajo ya no está disponible. Vuelve a abrir `a!jobs`.', flags: MessageFlags.Ephemeral });
          return;
        }
        const notice = `✅ Elegiste **${result.progress.job.name}** · nivel ${result.progress.level}. Plazas ocupadas: **${result.activeJobIds.length}/${result.slotLimit}**.`;
        await interaction.update(componentUpdate(await jobsPanel(interaction.guildId, ownerId, notice)));
        return;
      }

      if (interaction.customId === 'catalog:category' && interaction.isStringSelectMenu()) {
        await interaction.update(componentUpdate(catalogPanel(interaction.values[0])));
        return;
      }

      if (interaction.customId.startsWith('shop:')) {
        if (interaction.customId === 'shop:category' && interaction.isStringSelectMenu()) {
          await interaction.deferUpdate();
          await interaction.editReply(componentUpdate(await storePanel(interaction.guildId, interaction.user.id, interaction.values[0] ?? 'all')));
          return;
        }
        if (interaction.customId.startsWith('shop:item:') && interaction.isStringSelectMenu()) {
          const [, , categoryValue = 'all', pageValue = '0'] = interaction.customId.split(':');
          const [kind, itemId] = (interaction.values[0] ?? '').split(':', 2);
          if ((kind !== 'profile' && kind !== 'economy' && kind !== 'rpg') || !itemId) {
            await interaction.reply({ content: 'Ese producto ya no está disponible.', flags: MessageFlags.Ephemeral });
            return;
          }
          let category = 'all';
          try { category = decodeURIComponent(categoryValue); } catch { category = 'all'; }
          await interaction.deferUpdate();
          await interaction.editReply(componentUpdate(await storePanel(interaction.guildId, interaction.user.id, category, Number(pageValue), itemId, '', kind)));
          return;
        }
        if (interaction.customId.startsWith('shop:page:') && interaction.isButton()) {
          const [, , pageValue = '0', categoryValue = 'all'] = interaction.customId.split(':');
          let category = 'all';
          try { category = decodeURIComponent(categoryValue); } catch { category = 'all'; }
          await interaction.deferUpdate();
          await interaction.editReply(componentUpdate(await storePanel(interaction.guildId, interaction.user.id, category, Number(pageValue))));
          return;
        }
        if (interaction.customId.startsWith('shop:buy:') && interaction.isButton()) {
          const [, , kindValue, itemId = '', categoryValue = 'all', pageValue = '0'] = interaction.customId.split(':');
          if ((kindValue !== 'profile' && kindValue !== 'economy' && kindValue !== 'rpg') || !itemId) {
            await interaction.reply({ content: 'Ese producto ya no está disponible.', flags: MessageFlags.Ephemeral });
            return;
          }
          const kind: StoreKind = kindValue;
          const item = findStoreProduct(kind, itemId);
          if (!item) {
            await interaction.reply({ content: 'Ese producto ya no está disponible.', flags: MessageFlags.Ephemeral });
            return;
          }
          await interaction.deferUpdate();
          const result = await purchaseStoreProduct(interaction.guildId, interaction.user.id, kind, itemId, interaction.id);
          if (!result.ok) {
            const message = result.reason === 'insufficient_funds' ? `No tienes monedas suficientes para **${item.name}**.`
              : result.reason === 'already_owned' ? `Ya tienes **${item.name}**.` : 'Ese producto ya no está disponible.';
            await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral });
            return;
          }
          let category = 'all';
          try { category = decodeURIComponent(categoryValue); } catch { category = 'all'; }
          await interaction.editReply(componentUpdate(await storePanel(interaction.guildId, interaction.user.id, category, Number(pageValue), itemId,
            `✅ Compraste **${item.name}** · inventario x${result.quantity} · saldo ${result.balance.toLocaleString('es-MX')} monedas.`, kind)));
          return;
        }
        if (interaction.customId.startsWith('shop:equip:') && interaction.isButton()) {
          const [, , itemId = '', categoryValue = 'all', pageValue = '0'] = interaction.customId.split(':');
          let category = 'all';
          try { category = decodeURIComponent(categoryValue); } catch { category = 'all'; }
          await interaction.deferUpdate();
          const result = await equipProfileItem(interaction.guildId, interaction.user.id, itemId);
          if (!result.ok) {
            await interaction.followUp({ content: result.message, flags: MessageFlags.Ephemeral });
            return;
          }
          await interaction.editReply(componentUpdate(await storePanel(interaction.guildId, interaction.user.id, category, Number(pageValue), itemId, result.message, 'profile')));
          return;
        }
      }

      if (interaction.customId.startsWith('rpg:')) {
        const guildId = interaction.guildId;
        if (interaction.customId === 'rpg:ranking') {
          await interaction.update(componentUpdate(await rpgRankingPanel(guildId))); return;
        }
        if (interaction.customId === 'rpg:menu:home') {
          await interaction.update(componentUpdate(await rpgMenuPanel(guildId, interaction.user.id))); return;
        }
        if (interaction.customId === 'rpg:menu:category' && interaction.isStringSelectMenu()) {
          const category = interaction.values[0];
          if (category === 'pet') { await interaction.update(componentUpdate(await rpgPanel(guildId, interaction.user.id, interaction.user.username))); return; }
          if (category === 'explore') { await interaction.update(componentUpdate(await expeditionLogPanel(guildId, interaction.user.id))); return; }
          if (category === 'logs') { await interaction.update(componentUpdate(await expeditionLogPanel(guildId, interaction.user.id))); return; }
          if (category === 'care' || category === 'feed') { await interaction.update(componentUpdate(await rpgFeedPanel(guildId, interaction.user.id))); return; }
          if (category === 'battle') { await interaction.update(componentUpdate(await rpgCombatPanel(guildId, interaction.user.id))); return; }
          if (category === 'inventory') { await interaction.update(componentUpdate(await rpgInventoryPanel(guildId, interaction.user.id))); return; }
          if (category === 'missions') { await interaction.update(componentUpdate(await rpgMissionsPanel(guildId, interaction.user.id))); return; }
          if (category === 'shop') { await interaction.update(componentUpdate(await rpgShopPanel(guildId, interaction.user.id))); return; }
          if (category === 'manage') { await interaction.update(componentUpdate(await rpgManagePanel(guildId, interaction.user.id))); return; }
          if (category === 'pvp') { await interaction.update(componentUpdate(await rpgPvPHelpPanel(guildId))); return; }
          if (category === 'ranking') { await interaction.update(componentUpdate(await rpgRankingPanel(guildId))); return; }
          if (category === 'social') { await interaction.update(componentUpdate(await rpgPvPHelpPanel(guildId))); return; }
        }
        if (interaction.customId === 'rpg:manage' && interaction.isStringSelectMenu()) {
          const action = interaction.values[0];
          if (action === 'inventory') { await interaction.update(componentUpdate(await rpgInventoryPanel(guildId, interaction.user.id))); return; }
          if (action === 'missions') { await interaction.update(componentUpdate(await rpgMissionsPanel(guildId, interaction.user.id))); return; }
          if (action === 'shop') { await interaction.update(componentUpdate(await rpgShopPanel(guildId, interaction.user.id))); return; }
          if (action === 'name') {
            const pet = await getRpgPet(guildId, interaction.user.id);
            if (!pet) { await interaction.reply({ content: 'Primero adopta una mascota.', flags: MessageFlags.Ephemeral }); return; }
            if (pet.freeNameUsed) { await interaction.reply({ content: 'Ya usaste el cambio gratuito de nombre.', flags: MessageFlags.Ephemeral }); return; }
            const modal = new ModalBuilder().setCustomId('rpg:name:submit').setTitle('Nombre gratuito de mascota')
              .addLabelComponents(new LabelBuilder().setLabel('Nombre (2–24 caracteres)').setTextInputComponent(
                new TextInputBuilder().setCustomId('name').setStyle(TextInputStyle.Short).setRequired(true).setMinLength(2).setMaxLength(24).setPlaceholder('Ejemplo: Nube'),
              ));
            await interaction.showModal(modal); return;
          }
          if (action === 'train') {
            const result = await trainRpgPet(guildId, interaction.user.id, 'strength', interaction.id);
            await interaction.update(componentUpdate(await rpgPanel(guildId, interaction.user.id, interaction.user.username)));
            const message = result.ok ? `🏋️ Fuerza mejorada a **${result.pet.strength}** · saciedad ${result.pet.hunger}/100.` : result.reason === 'no_pet' ? 'Primero adopta una mascota.' : result.reason === 'cooldown' ? `Tu mascota necesita descansar ${formatCooldown(result.secondsRemaining ?? 0)}.` : result.reason === 'low_energy' ? 'Necesita 15 de energía.' : result.reason === 'low_hunger' ? 'Dale de comer antes de entrenar.' : 'Necesitas 180 monedas.';
            await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral }); return;
          }
        }
        if (interaction.customId === 'rpg:feed' && interaction.isButton()) {
          await interaction.update(componentUpdate(await rpgFeedPanel(guildId, interaction.user.id))); return;
        }
        if (interaction.customId === 'rpg:feed:select' && interaction.isStringSelectMenu()) {
          const item = rpgItems.find((candidate) => candidate.id === interaction.values[0] && candidate.effect === 'snack');
          if (!item) { await interaction.reply({ content: 'Ese alimento ya no está disponible.', flags: MessageFlags.Ephemeral }); return; }
          const result = await useRpgItem(guildId, interaction.user.id, item.id, interaction.id);
          await interaction.update(componentUpdate(await rpgPanel(guildId, interaction.user.id, interaction.user.username)));
          await interaction.followUp({ content: result.ok ? result.message : result.reason === 'no_pet' ? 'Primero adopta una mascota.' : result.reason === 'missing_item' ? 'Ya no tienes ese alimento.' : 'Tu mascota ya está saciada y recuperada.', flags: MessageFlags.Ephemeral }); return;
        }
        if (interaction.customId === 'rpg:care' && interaction.isButton()) {
          const result = await careForRpgPet(guildId, interaction.user.id);
          if (!result.ok) {
            const message = result.reason === 'no_pet' ? 'Primero adopta una mascota.' : result.reason === 'max_affection' ? 'Tu vínculo ya está al máximo. Dale un poco de tiempo.' : `Podrás volver a cuidarla en ${formatCooldown(result.secondsRemaining ?? 0)}.`;
            await interaction.reply({ content: message, flags: MessageFlags.Ephemeral }); return;
          }
          await interaction.update(componentUpdate(rpgCareResultPanel(result.pet, `Acariciaste a ${result.pet.name}. Su vínculo aumentó **+${result.affectionGained}**.`))); return;
        }
        if (interaction.customId === 'rpg:name' && interaction.isButton()) {
          const modal = new ModalBuilder().setCustomId('rpg:name:submit').setTitle('Nombre gratuito de mascota')
            .addLabelComponents(new LabelBuilder().setLabel('Nombre (2–24 caracteres)').setTextInputComponent(
              new TextInputBuilder().setCustomId('name').setStyle(TextInputStyle.Short).setRequired(true).setMinLength(2).setMaxLength(24).setPlaceholder('Ejemplo: Nube'),
            ));
          await interaction.showModal(modal); return;
        }
        if (interaction.customId === 'rpg:pvp:panel' && interaction.isButton()) {
          await interaction.reply(await rpgPanel(guildId, interaction.user.id, interaction.user.username));
          return;
        }
        if (interaction.isButton() && interaction.customId.startsWith('rpg:pvp:move:')) {
          const parts = interaction.customId.split(':');
          const matchId = parts[3];
          const hasTurnOwner = parts.length >= 6;
          const expectedTurnUserId = hasTurnOwner ? parts[4] : undefined;
          const moveId = hasTurnOwner ? parts[5] : parts[4];
          if (!matchId || !moveId) { await interaction.reply({ content: 'Ese movimiento no es válido.', flags: MessageFlags.Ephemeral }); return; }
          if (expectedTurnUserId && expectedTurnUserId !== interaction.user.id) {
            await interaction.reply({ content: 'Este botón pertenece al turno de otra persona. El mismo panel se actualizará cuando llegue tu turno.', flags: MessageFlags.Ephemeral }); return;
          }
          const result = await playRpgPvpTurn(guildId, matchId, interaction.user.id, 'move', moveId);
          if (!result.ok && result.reason === 'expired') { await interaction.update(componentUpdate(await rpgPvpPanel(result.match))); return; }
          if (!result.ok) {
            const message = result.reason === 'not_your_turn' ? 'Todavía no es tu turno.' : result.reason === 'low_energy' ? 'No tienes energía suficiente para esa técnica.' : result.reason === 'move_not_equipped' ? 'Esa técnica no está en la build de este combate.' : result.reason === 'not_participant' ? 'No participas en este duelo.' : result.reason === 'not_active' ? 'El duelo ya no está activo.' : 'No encontré ese duelo.';
            await interaction.reply({ content: `⚔️ ${message}`, flags: MessageFlags.Ephemeral }); return;
          }
          await interaction.update(componentUpdate(await rpgPvpPanel(result.match))); return;
        }
        if (interaction.isButton() && (interaction.customId.startsWith('rpg:pvp:accept:') || interaction.customId.startsWith('rpg:pvp:decline:'))) {
          const accepting = interaction.customId.startsWith('rpg:pvp:accept:');
          const matchId = interaction.customId.slice(accepting ? 'rpg:pvp:accept:'.length : 'rpg:pvp:decline:'.length);
          const result = await respondRpgPvpChallenge(guildId, matchId, interaction.user.id, accepting);
          if (!result.ok && result.reason === 'expired') {
            await interaction.update(componentUpdate(await rpgPvpPanel(result.match)));
            return;
          }
          if (!result.ok) {
            const message = result.reason === 'not_invited' ? 'Ese desafío fue dirigido a otra persona.'
              : result.reason === 'not_pending' ? 'Ese desafío ya fue respondido o terminó.' : 'No encontré ese desafío.';
            await interaction.reply({ content: `⚔️ ${message}`, flags: MessageFlags.Ephemeral }); return;
          }
          await interaction.update(componentUpdate(await rpgPvpPanel(result.match)));
          return;
        }
        if (interaction.isButton() && interaction.customId.startsWith('rpg:pvp:turn:')) {
          const parts = interaction.customId.split(':');
          const [, , , matchId] = parts;
          const hasTurnOwner = parts.length >= 6;
          const expectedTurnUserId = hasTurnOwner ? parts[4] : undefined;
          const action = hasTurnOwner ? parts[5] : parts[4];
          if (!matchId || !['attack', 'guard', 'special', 'surrender'].includes(action ?? '')) {
            await interaction.reply({ content: 'Esa acción de duelo no es válida.', flags: MessageFlags.Ephemeral }); return;
          }
          if (expectedTurnUserId && expectedTurnUserId !== interaction.user.id) {
            await interaction.reply({ content: 'Este botón pertenece al turno de otra persona. El mismo panel se actualizará cuando llegue tu turno.', flags: MessageFlags.Ephemeral }); return;
          }
          const result = await playRpgPvpTurn(guildId, matchId, interaction.user.id, action as RpgPvpAction);
          if (!result.ok && result.reason === 'expired') {
            await interaction.update(componentUpdate(await rpgPvpPanel(result.match)));
            return;
          }
          if (!result.ok) {
            const message = result.reason === 'not_your_turn' ? 'Todavía no es tu turno.'
              : result.reason === 'special_used' ? 'Ya usaste la técnica especial en este duelo.'
                : result.reason === 'not_participant' ? 'No participas en este duelo.'
                  : result.reason === 'not_active' ? 'El duelo ya no está activo.'
                  : 'No encontré ese duelo.';
            await interaction.reply({ content: `⚔️ ${message}`, flags: MessageFlags.Ephemeral }); return;
          }
          await interaction.update(componentUpdate(await rpgPvpPanel(result.match)));
          return;
        }
        if (interaction.customId === 'rpg:profile' || interaction.customId === 'rpg:panel' || interaction.customId === 'rpg:refresh') {
          await interaction.update(componentUpdate(await rpgPanel(guildId, interaction.user.id, interaction.user.username)));
          return;
        }
        if (interaction.customId === 'rpg:exploration:open') {
          await interaction.update(componentUpdate(await rpgExplorePanel(guildId, interaction.user.id, interaction.user.username)));
          return;
        }
        if (interaction.customId === 'rpg:exploration:zone' && interaction.isStringSelectMenu()) {
          const zoneId = interaction.values[0];
          if (!rpgZones.some((zone) => zone.id === zoneId)) {
            await interaction.reply({ content: 'Esa zona ya no está disponible.', flags: MessageFlags.Ephemeral });
            return;
          }
          await interaction.update(componentUpdate(await rpgExplorePanel(guildId, interaction.user.id, interaction.user.username, zoneId)));
          return;
        }
        if (interaction.customId.startsWith('rpg:logs:') && interaction.isButton()) {
          const page = Number(interaction.customId.slice('rpg:logs:'.length));
          await interaction.update(componentUpdate(await expeditionLogPanel(guildId, interaction.user.id, Number.isSafeInteger(page) ? page : 0)));
          return;
        }
        if (interaction.customId === 'rpg:inventory') {
          await interaction.update(componentUpdate(await rpgInventoryPanel(guildId, interaction.user.id)));
          return;
        }
        if (interaction.customId === 'rpg:missions' || interaction.customId === 'rpg:quests') {
          await interaction.update(componentUpdate(await rpgMissionsPanel(guildId, interaction.user.id)));
          return;
        }
        if (interaction.customId === 'rpg:mission:claim' && interaction.isStringSelectMenu()) {
          const questId = interaction.values[0] ?? '';
          const quest = (await getRpgQuests(guildId, interaction.user.id)).find((entry) => entry.id === questId);
          const result = await claimRpgQuest(guildId, interaction.user.id, questId, interaction.id);
          await interaction.update(componentUpdate(await rpgMissionsPanel(guildId, interaction.user.id)));
          const message = result.ok ? `🎁 **${quest?.title ?? 'Misión'}** cobrada · saldo **${result.balance} monedas**.`
            : result.reason === 'incomplete' ? 'Completa el encargo antes de cobrarlo.' : 'Ese encargo ya se cobró.';
          await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral });
          return;
        }
        if (interaction.customId === 'rpg:build' || interaction.customId === 'rpg:move:back') {
          await interaction.update(componentUpdate(await rpgBuildPanel(guildId, interaction.user.id)));
          return;
        }
        if (interaction.customId === 'rpg:move:learn' && interaction.isStringSelectMenu()) {
          const result = await learnRpgMove(guildId, interaction.user.id, interaction.values[0] ?? '');
          await interaction.update(componentUpdate(await rpgBuildPanel(guildId, interaction.user.id)));
          const message = result.ok ? `✨ **${result.move.name}** aprendida. ${result.pet.movePoints} punto(s) disponibles.` : result.reason === 'no_pet' ? 'Primero adopta una mascota.' : result.reason === 'already_known' ? 'Tu mascota ya conoce esa técnica.' : result.reason === 'no_points' ? 'No tienes puntos de aprendizaje. Gana un nivel en exploración o combate.' : 'Tu mascota aún no cumple los requisitos de nivel, elemento o especialidad.';
          await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral });
          return;
        }
        if (interaction.customId === 'rpg:move:build' && interaction.isStringSelectMenu()) {
          const result = await equipRpgMoves(guildId, interaction.user.id, interaction.values);
          await interaction.update(componentUpdate(await rpgBuildPanel(guildId, interaction.user.id)));
          await interaction.followUp({ content: result.ok ? `⚔️ Build equipada con ${result.pet.equippedMoves.length} técnica(s).` : result.reason === 'no_pet' ? 'Primero adopta una mascota.' : 'Elige entre una y cuatro técnicas que ya conozca tu mascota.', flags: MessageFlags.Ephemeral });
          return;
        }
        if (interaction.customId === 'rpg:egg:element' && interaction.isStringSelectMenu()) {
          const selected = rpgEggOptions.find((entry) => entry.element === interaction.values[0]);
          await interaction.update(componentUpdate(await rpgAdoptionPanel(interaction.user.username, selected?.element ?? 'Fuego')));
          return;
        }
        if (interaction.customId.startsWith('rpg:hatch:') && interaction.isButton()) {
          const element = interaction.customId.slice('rpg:hatch:'.length) as PetElement;
          if (!rpgEggOptions.some((entry) => entry.element === element)) { await interaction.reply({ content: 'Ese huevo no existe.', flags: MessageFlags.Ephemeral }); return; }
          const adopted = await adoptRpgPet(guildId, interaction.user.id, '', element);
          if (!adopted.ok) {
            await interaction.update(componentUpdate(await rpgPanel(guildId, interaction.user.id, interaction.user.username)));
            return;
          }
          await interaction.update(componentUpdate(await rpgPanel(guildId, interaction.user.id, interaction.user.username)));
          return;
        }
        if (interaction.customId === 'rpg:shop') {
          await interaction.update(componentUpdate(await rpgShopPanel(guildId, interaction.user.id)));
          return;
        }
        if (interaction.customId.startsWith('rpg:shop:page:') && interaction.isButton()) {
          const [, , , pageValue, categoryValue = 'all'] = interaction.customId.split(':');
          const page = Number(pageValue); let category = 'all';
          try { category = decodeURIComponent(categoryValue); } catch { category = 'all'; }
          await interaction.update(componentUpdate(await rpgShopPanel(guildId, interaction.user.id, Number.isSafeInteger(page) ? page : 0, category)));
          return;
        }
        if (interaction.customId === 'rpg:shop:category' && interaction.isStringSelectMenu()) {
          await interaction.update(componentUpdate(await rpgShopPanel(guildId, interaction.user.id, 0, interaction.values[0] ?? 'all')));
          return;
        }
        if (interaction.customId === 'rpg:zone:preview' && interaction.isStringSelectMenu()) {
          await interaction.update(componentUpdate(await rpgExplorePanel(guildId, interaction.user.id, interaction.user.username, interaction.values[0])));
          return;
        }
        if (interaction.customId.startsWith('rpg:explore:') && interaction.isButton()) {
          const zoneId = interaction.customId.slice('rpg:explore:'.length);
          const result = await exploreRpg(guildId, interaction.user.id, zoneId, interaction.id);
          if (!result.ok) {
            const message = result.reason === 'no_pet' ? 'Primero elige un huevo desde `/rpg panel`.'
            : result.reason === 'zone_locked' ? 'Tu mascota aún no tiene nivel para esa zona.'
              : result.reason === 'low_energy' ? 'Le falta energía. Usa éter o bayas.' : result.reason === 'low_hunger' ? 'Dale de comer antes de enviarla.' : `Está descansando; vuelve en ${formatCooldown(result.secondsRemaining ?? 0)}.`
            await interaction.update(componentUpdate(await rpgExplorePanel(guildId, interaction.user.id, interaction.user.username, zoneId)));
            await interaction.followUp({ content: `🧭 ${message}`, flags: MessageFlags.Ephemeral });
            return;
          }
          await interaction.update(componentUpdate(await expeditionLogPanel(guildId, interaction.user.id)));
          return;
        }
        if (interaction.customId === 'rpg:battle' && interaction.isButton()) {
          const result = await battleRpg(guildId, interaction.user.id, interaction.id);
          const message = result.ok ? `${result.message}\n❤️ ${result.pet.hp}/${result.pet.maxHp} PV · ⚡ ${result.pet.energy}/${result.pet.maxEnergy} energía.`
            : result.reason === 'no_pet' ? 'Primero adopta una mascota.' : result.reason === 'cooldown' ? `Tu mascota necesita descansar ${formatCooldown(result.secondsRemaining ?? 0)}.` : result.reason === 'low_energy' ? 'Necesita más energía.' : 'Está debilitada; usa polvo de renacer.';
          await interaction.update(componentUpdate(await rpgPanel(guildId, interaction.user.id, interaction.user.username)));
          await interaction.followUp({ content: `⚔️ ${message}`, flags: MessageFlags.Ephemeral });
          return;
        }
        if (interaction.customId === 'rpg:train' && interaction.isButton()) {
          const result = await trainRpgPet(guildId, interaction.user.id, 'strength', interaction.id);
          const message = result.ok ? `🏋️ Fuerza mejorada a **${result.pet.strength}**. Saldo: **${result.balance} monedas**.`
            : result.reason === 'no_pet' ? 'Primero adopta una mascota.' : result.reason === 'cooldown' ? `Tu mascota necesita descansar ${formatCooldown(result.secondsRemaining ?? 0)}.` : result.reason === 'low_energy' ? 'Necesita 15 de energía para entrenar.' : result.reason === 'low_hunger' ? 'Dale de comer antes de entrenar.' : 'Necesitas 180 monedas.';
          await interaction.update(componentUpdate(await rpgPanel(guildId, interaction.user.id, interaction.user.username)));
          await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral });
          return;
        }
        if (interaction.customId === 'rpg:use' && interaction.isStringSelectMenu()) {
          const result = await useRpgItem(guildId, interaction.user.id, interaction.values[0] ?? '', interaction.id);
          const message = result.ok ? result.message : result.reason === 'no_pet' ? 'Primero adopta una mascota.' : result.reason === 'missing_item' ? 'Ese artículo ya no está en tu mochila.' : rpgItems.find((item) => item.id === interaction.values[0])?.effect === 'xp' ? 'Ya alcanzaste el límite de XP de hoy. El manual sigue en tu mochila.' : 'No hace falta usarlo ahora.';
          await interaction.update(componentUpdate(await rpgInventoryPanel(guildId, interaction.user.id)));
          await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral });
          return;
        }
        if (interaction.customId.startsWith('rpg:buy:') && interaction.isStringSelectMenu()) {
          const [, , pageValue = '0', categoryValue = 'all'] = interaction.customId.split(':');
          const page = Number(pageValue); let category = 'all';
          try { category = decodeURIComponent(categoryValue); } catch { category = 'all'; }
          const item = rpgItems.find((candidate) => candidate.id === interaction.values[0]);
          if (!item) { await interaction.reply({ content: 'Ese artículo ya no está disponible.', flags: MessageFlags.Ephemeral }); return; }
          const result = await buyRpgItem(guildId, interaction.user.id, item.id, interaction.id);
          await interaction.update(componentUpdate(await rpgShopPanel(guildId, interaction.user.id, Number.isSafeInteger(page) ? page : 0, category)));
          await interaction.followUp({ content: result.ok ? `✅ Compraste ${item.emoji} **${item.name}** · mochila x${result.quantity} · saldo ${result.balance}.` : 'No tienes suficientes monedas.', flags: MessageFlags.Ephemeral });
          return;
        }
      }

      if (interaction.customId.startsWith('eco:')) {
        if (interaction.customId === 'eco:section' && interaction.isStringSelectMenu()) {
          const section = interaction.values[0];
          const panel = section === 'inventory' ? await inventoryPanel(interaction.guildId, interaction.user.id)
            : section === 'bank' ? await bankPanel(interaction.guildId, interaction.user.id)
              : section === 'casino' ? await casinoPanel(interaction.guildId, interaction.user.id)
                : section === 'store' || section === 'premium' ? await storePanel(interaction.guildId, interaction.user.id) : undefined;
          if (!panel) { await interaction.reply({ content: 'Esa sección ya no está disponible.', flags: MessageFlags.Ephemeral }); return; }
          await interaction.update(componentUpdate(panel)); return;
        }
        if (interaction.customId === 'eco:bank' || interaction.customId === 'eco:bank:refresh') {
          const result = await bankAction(interaction.guildId, interaction.user.id, 'view');
          await interaction.update(componentUpdate(await bankPanel(interaction.guildId, interaction.user.id)));
          if (interaction.customId === 'eco:bank:refresh') {
            const message = result.interestEarned
              ? `💹 Se acreditaron **${result.interestEarned} monedas de interés** a tu ahorro.`
              : '🏦 Aún no se completa un día para generar el siguiente interés.';
            await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral });
          }
          return;
        }
        if ((interaction.customId === 'eco:bank:deposit' || interaction.customId === 'eco:bank:withdraw') && interaction.isButton()) {
          const action = interaction.customId.endsWith('deposit') ? 'deposit' : 'withdraw';
          const modal = new ModalBuilder()
            .setCustomId(`eco:bank:modal:${action}`)
            .setTitle(action === 'deposit' ? 'Depositar monedas' : 'Retirar monedas')
            .addLabelComponents(new LabelBuilder().setLabel('Cantidad de monedas').setTextInputComponent(
              new TextInputBuilder().setCustomId('amount').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(16).setPlaceholder('Ejemplo: 500'),
            ));
          await interaction.showModal(modal);
          return;
        }
        if (interaction.customId === 'eco:daily') {
          const result = await claimDaily(interaction.guildId, interaction.user.id, interaction.id);
          const message = result.ok
            ? economyActionPanel('🎁 Recompensa diaria', 'Tu recompensa de hoy ya está en tu billetera.', result.amount, result.balance)
            : { content: `⏳ Ya reclamaste tu recompensa. Vuelve en **${formatCooldown(result.secondsRemaining)}**.`, flags: ['Ephemeral'] as const };
          await interaction.update(componentUpdate(await economyPanel(interaction.guildId, interaction.user.id, interaction.user.username, interaction.user.displayAvatarURL({extension:'png',size:256}))));
          await interaction.followUp(message);
          return;
        }
        if (interaction.customId === 'eco:casino') {
          await interaction.update(componentUpdate(await casinoPanel(interaction.guildId, interaction.user.id)));
          return;
        }
        if (interaction.customId === 'eco:casino:refresh') {
          await interaction.update(componentUpdate(await casinoPanel(interaction.guildId, interaction.user.id)));
          return;
        }
        if (interaction.customId === 'eco:casino:fish') {
          const result = await fish(interaction.guildId, interaction.user.id, interaction.id);
          const message = result.ok
            ? economyActionPanel('🎣 Pesca', result.message, result.amount, result.balance)
            : { content: result.reason === 'missing_rod' ? 'Necesitas una **Caña de pescar**. Cómprala en `/shop` o `a!shop`.' : `🎣 Ya saliste a pescar. Vuelve en **${formatCooldown(result.secondsRemaining ?? 0)}**.`, flags: ['Ephemeral'] as const };
          await interaction.update(componentUpdate(await casinoPanel(interaction.guildId, interaction.user.id)));
          await interaction.followUp(message);
          return;
        }
        if (interaction.customId === 'eco:use' && interaction.isStringSelectMenu()) {
          const itemId = interaction.values[0];
          if (!itemId) {
            await interaction.reply({ content: 'Selecciona un artículo válido.', flags: MessageFlags.Ephemeral });
            return;
          }
          const result = await useShopItem(interaction.guildId, interaction.user.id, itemId, interaction.id);
          const message = !result.ok
            ? { content: result.reason === 'missing_rod' ? 'Necesitas una Caña de pescar para usar cebo.' : result.reason === 'cooldown' ? `⏳ Espera **${formatCooldown(result.secondsRemaining ?? 0)}** para volver a pescar.` : 'No tienes ese consumible o ya no está disponible.', flags: ['Ephemeral'] as const }
            : result.kind === 'fish' ? economyActionPanel('🎣 Cebo utilizado', result.message, result.amount, result.balance) : { content: result.message, flags: ['Ephemeral'] as const };
          await interaction.update(componentUpdate(await inventoryPanel(interaction.guildId, interaction.user.id)));
          await interaction.followUp(message);
          return;
        }
        if (interaction.customId.startsWith('eco:blackjack:') && interaction.isButton()) {
          const [, , action, gameId] = interaction.customId.split(':');
          if ((action !== 'hit' && action !== 'stand') || !gameId) {
            await interaction.reply({ content: 'Esa acción de blackjack no es válida.', flags: MessageFlags.Ephemeral });
            return;
          }
          const view = await playBlackjackTurn(interaction.guildId, interaction.user.id, gameId, action);
          if (!view) {
            await interaction.reply({ content: 'Esta partida no existe o no te pertenece.', flags: MessageFlags.Ephemeral });
            return;
          }
          await interaction.update(componentUpdate(blackjackPanel(view)));
          return;
        }
        if (interaction.customId === 'eco:store') {
          await interaction.update(componentUpdate(await storePanel(interaction.guildId, interaction.user.id)));
          return;
        }
        if (interaction.customId === 'eco:premium-store') {
          await interaction.update(componentUpdate(await storePanel(interaction.guildId, interaction.user.id)));
          return;
        }
        if (interaction.customId === 'eco:inventory') {
          await interaction.update(componentUpdate(await inventoryPanel(interaction.guildId, interaction.user.id)));
          return;
        }
        if (interaction.customId === 'eco:back' || interaction.customId === 'eco:refresh') {
          await interaction.update(componentUpdate(await economyPanel(interaction.guildId, interaction.user.id, interaction.user.username, interaction.user.displayAvatarURL({extension:'png',size:256}))));
          return;
        }
        if (interaction.customId === 'eco:buy' && interaction.isStringSelectMenu()) {
          const item = storeItems.find((candidate) => candidate.id === interaction.values[0]);
          if (!item) {
            await interaction.reply({ content: 'Ese artículo ya no está disponible.', flags: MessageFlags.Ephemeral });
            return;
          }
          await interaction.update(componentUpdate(purchaseConfirmPanel(item.id)));
          return;
        }
        if (interaction.customId.startsWith('eco:confirm:')) {
          const item = storeItems.find((candidate) => candidate.id === interaction.customId.slice('eco:confirm:'.length));
          if (!item) {
            await interaction.reply({ content: 'Ese artículo ya no está disponible.', flags: MessageFlags.Ephemeral });
            return;
          }
          const result = await purchaseItem(interaction.guildId, interaction.user.id, item.id, interaction.id);
          const content = result.ok
            ? `✅ Compraste **${item.name}** por ${item.cost} monedas. Ahora tienes **x${result.quantity}**. Te quedan **${result.balance}**.`
            : result.reason === 'invalid_item' ? 'Ese artículo ya no está disponible.'
              : result.reason === 'already_owned' ? `Ya tienes **${item.name}**.`
                : `Te faltan monedas para **${item.name}**. Saldo actual: **${result.balance}**.`;
          await interaction.update(componentUpdate(await storePanel(interaction.guildId, interaction.user.id)));
          await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
          return;
        }
      }

      if (interaction.customId.startsWith('music:')) {
        const manager = interaction.client.lavalink;
        const player = manager.getPlayer(interaction.guildId);

        if (interaction.customId.startsWith('music:favorites:') && interaction.isStringSelectMenu()) {
          const [, , action, panelGuildId, ownerId] = interaction.customId.split(':');
          if (panelGuildId !== interaction.guildId || ownerId !== interaction.user.id) {
            await interaction.reply({ content: 'Este panel de favoritos le pertenece a otra persona.', flags: MessageFlags.Ephemeral });
            return;
          }
          const favoriteId = Number(interaction.values[0]);
          if (!Number.isSafeInteger(favoriteId) || favoriteId < 1) {
            await interaction.reply({ content: 'Ese favorito ya no está disponible.', flags: MessageFlags.Ephemeral });
            return;
          }
          const favorite = getFavorite(interaction.guildId, interaction.user.id, favoriteId);
          if (!favorite) {
            await interaction.reply({ content: 'Ese favorito ya no existe. Vuelve a abrir el panel.', flags: MessageFlags.Ephemeral });
            return;
          }
          if (action === 'remove') {
            removeFavorite(interaction.guildId, interaction.user.id, favorite.id);
            await interaction.update(componentUpdate(favoritesPanel(interaction.guildId, interaction.user.id, getFavorites(interaction.guildId, interaction.user.id))));
            return;
          }
          if (action === 'play') {
            const voiceChannelId = interaction.guild?.voiceStates.cache.get(interaction.user.id)?.channelId;
            if (!voiceChannelId) {
              await interaction.reply({ content: 'Entra primero a un canal de voz para reproducir un favorito.', flags: MessageFlags.Ephemeral });
              return;
            }
            const textChannelId = interaction.channelId;
            if (!textChannelId) {
              await interaction.reply({ content: 'No pude identificar el canal donde se inició la solicitud.', flags: MessageFlags.Ephemeral });
              return;
            }
            await interaction.deferUpdate();
            try {
              await addTrack(interaction.client, {
                guildId: interaction.guildId,
                voiceChannelId,
                textChannelId,
                user: interaction.user,
                query: favorite.trackUri,
              });
              await interaction.followUp({ content: `🎶 Añadí **${favorite.title}** a la cola.`, flags: MessageFlags.Ephemeral });
              await refreshMusicPanel(interaction.client, interaction.guildId);
            } catch (error) {
              const message = error instanceof Error ? error.message : 'No pude añadir el favorito.';
              await interaction.followUp({ content: `⚠️ ${message}`, flags: MessageFlags.Ephemeral });
            }
            return;
          }
        }

        if (interaction.customId === 'music:add' && interaction.isButton()) {
          const modal = new ModalBuilder()
            .setCustomId('music:add:modal')
            .setTitle('Añadir canción')
            .addLabelComponents(new LabelBuilder().setLabel('Nombre de canción o enlace').setTextInputComponent(
              new TextInputBuilder()
                .setCustomId('query')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(200),
            ));
          await interaction.showModal(modal);
          return;
        }

        if (interaction.customId.startsWith('music:choose:') && interaction.isStringSelectMenu()) {
          const voiceChannelId = interaction.guild?.voiceStates.cache.get(interaction.user.id)?.channelId;
          if (!voiceChannelId) {
            await interaction.reply({ content: 'Entra a un canal de voz y vuelve a usar `/musica buscar`.', flags: MessageFlags.Ephemeral });
            return;
          }
          const searchId = interaction.customId.slice('music:choose:'.length);
          const track = takeSearchTrack(searchId, interaction.guildId, interaction.user.id, Number(interaction.values[0]));
          if (!track) {
            await interaction.reply({ content: 'Esta búsqueda ya venció. Usa `/musica buscar` para intentarlo otra vez.', flags: MessageFlags.Ephemeral });
            return;
          }
          await interaction.deferUpdate();
          try {
            await addSelectedTrack(interaction.client, {
              guildId: interaction.guildId,
              voiceChannelId,
              textChannelId: interaction.channelId,
              user: interaction.user,
            }, track);
            await interaction.editReply({
              components: [new TextDisplayBuilder().setContent(`🎶 Añadí **${track.info.title}** a la cola.`)],
              flags: MessageFlags.IsComponentsV2,
            });
            await refreshMusicPanel(interaction.client, interaction.guildId);
          } catch (error) {
            const message = error instanceof Error ? error.message : 'No pude añadir esa canción.';
            await interaction.editReply({
              components: [new TextDisplayBuilder().setContent(`⚠️ ${message}`)],
              flags: MessageFlags.IsComponentsV2,
            });
          }
          return;
        }

        if (interaction.customId === 'music:queue') {
          await interaction.reply(queuePanel(player, 0, interaction.guildId));
          return;
        }
        if (interaction.customId === 'music:queue:close') {
          await interaction.update({
            components: [new TextDisplayBuilder().setContent('# Cola cerrada · usa `/musica cola` para abrirla de nuevo.')],
            flags: MessageFlags.IsComponentsV2,
          });
          return;
        }
        if (interaction.customId.startsWith('music:queue:page:') || interaction.customId.startsWith('music:queue:refresh:')) {
          const page = Number(interaction.customId.split(':').at(-1));
          await interaction.update(componentUpdate(queuePanel(player, Number.isFinite(page) ? page : 0, interaction.guildId)));
          return;
        }
        if (interaction.customId.startsWith('music:queue:remove:') && interaction.isStringSelectMenu()) {
          if (!player) {
            const index = Number(interaction.values[0]);
            const removed = removePersistedMusicQueueTrack(interaction.guildId, index);
            await interaction.update(componentUpdate(queuePanel(undefined, Number(interaction.customId.split(':').at(-1)) || 0, interaction.guildId)));
            if (removed) await interaction.followUp({ content: `🗑️ Quité **${removed.info.title}** de la cola guardada.`, flags: MessageFlags.Ephemeral });
            return;
          }
          const voiceChannelId = interaction.guild?.voiceStates.cache.get(interaction.user.id)?.channelId;
          if (!voiceChannelId || voiceChannelId !== player.voiceChannelId) {
            await interaction.reply({ content: 'Entra al mismo canal de voz que el bot para modificar la cola.', flags: MessageFlags.Ephemeral });
            return;
          }
          const index = Number(interaction.values[0]);
          if (!Number.isSafeInteger(index) || index < 0 || index >= player.queue.tracks.length) {
            await interaction.update(componentUpdate(queuePanel(player, 0, interaction.guildId)));
            return;
          }
          const page = Number(interaction.customId.split(':').at(-1)) || 0;
          await interaction.deferUpdate();
          try {
            const removed = await player.queue.remove(index);
            await interaction.editReply(componentUpdate(queuePanel(player, page, interaction.guildId)));
            if (removed?.removed[0]) {
              await interaction.followUp({ content: `🗑️ Quité **${removed.removed[0].info.title}** de la cola.`, flags: MessageFlags.Ephemeral });
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : 'No pude modificar la cola.';
            await interaction.followUp({ content: `⚠️ ${message}`, flags: MessageFlags.Ephemeral });
          }
          return;
        }
        if (interaction.customId === 'music:refresh') {
          await interaction.update(musicPanel(interaction.guildId, player));
          return;
        }
        if (!player) {
          await interaction.reply({ content: 'No hay una sesión musical activa.', flags: MessageFlags.Ephemeral });
          return;
        }
        const voiceChannelId = interaction.guild?.voiceStates.cache.get(interaction.user.id)?.channelId;
        if (!voiceChannelId || voiceChannelId !== player.voiceChannelId) {
          await interaction.reply({ content: 'Para controlar la música, entra al mismo canal de voz que el bot.', flags: MessageFlags.Ephemeral });
          return;
        }
        if (interaction.customId === 'music:effect' && interaction.isStringSelectMenu()) {
          const effect = interaction.values[0] as MusicEffect | undefined;
          const effects: MusicEffect[] = ['normal', 'bass', 'rock', 'pop', 'nightcore', 'vaporwave'];
          if (!effect || !effects.includes(effect)) {
            await interaction.reply({ content: 'Ese efecto no está disponible.', flags: MessageFlags.Ephemeral });
            return;
          }
          await interaction.deferUpdate();
          try {
            await applyMusicEffect(player, effect);
            await interaction.editReply(musicPanel(interaction.guildId, player));
          } catch (error) {
            const message = error instanceof Error ? error.message : 'No pude aplicar el efecto.';
            await interaction.followUp({ content: `⚠️ ${message}`, flags: MessageFlags.Ephemeral });
          }
          return;
        }
        if (interaction.customId.startsWith('music:seek:') && interaction.isButton()) {
          const offset = Number(interaction.customId.slice('music:seek:'.length));
          const current = player.queue.current;
          if (!current || current.info.isStream || current.info.duration <= 0) {
            await interaction.reply({ content: 'Esta reproducción no permite buscar una posición.', flags: MessageFlags.Ephemeral });
            return;
          }
          if (offset !== -15 && offset !== 15) {
            await interaction.reply({ content: 'Ese salto de tiempo no está disponible.', flags: MessageFlags.Ephemeral });
            return;
          }
          const target = Math.min(current.info.duration - 1_000, Math.max(0, player.position + offset * 1_000));
          await interaction.deferUpdate();
          try {
            await player.seek(target);
            await interaction.editReply(musicPanel(interaction.guildId, player));
          } catch (error) {
            const message = error instanceof Error ? error.message : 'No pude cambiar la posición.';
            await interaction.followUp({ content: `⚠️ ${message}`, flags: MessageFlags.Ephemeral });
          }
          return;
        }
        if (interaction.customId === 'music:skip' && !player.queue.current) {
          await interaction.reply({ content: 'No hay una canción activa que se pueda saltar.', flags: MessageFlags.Ephemeral });
          return;
        }
        if (interaction.customId === 'music:previous' && !player.queue.previous.length) {
          await interaction.reply({ content: 'No hay canciones anteriores en el historial.', flags: MessageFlags.Ephemeral });
          return;
        }
        if (interaction.customId === 'music:shuffle' && player.queue.tracks.length < 2) {
          await interaction.reply({ content: 'Añade al menos dos canciones pendientes para mezclarlas.', flags: MessageFlags.Ephemeral });
          return;
        }
        await interaction.deferUpdate();
        try {
          if (interaction.customId === 'music:toggle') {
            if (player.paused) await player.resume();
            else await player.pause();
          } else if (interaction.customId === 'music:skip') {
            await player.skip();
          } else if (interaction.customId === 'music:previous') {
            const previous = await player.queue.shiftPrevious();
            if (previous) await player.play({ clientTrack: previous });
          } else if (interaction.customId === 'music:repeat') {
            const nextMode = player.repeatMode === 'off' ? 'track' : player.repeatMode === 'track' ? 'queue' : 'off';
            await player.setRepeatMode(nextMode);
          } else if (interaction.customId === 'music:shuffle') {
            await player.queue.shuffle();
          } else if (interaction.customId === 'music:stop') {
            await player.stopPlaying(true);
          } else if (interaction.customId === 'music:leave') {
            await disconnectPlayer(player);
          } else if (interaction.customId === 'music:volume:down') {
            await player.setVolume(Math.max(0, player.volume - 10));
          } else if (interaction.customId === 'music:volume:up') {
            await player.setVolume(Math.min(100, player.volume + 10));
          }
          await interaction.editReply(musicPanel(interaction.guildId, interaction.client.lavalink.getPlayer(interaction.guildId)));
        } catch (error) {
          const message = error instanceof Error ? error.message : 'No pude completar esa acción.';
          await interaction.followUp({ content: `⚠️ ${message}`, flags: MessageFlags.Ephemeral });
        }
      }
    } catch (error) {
      console.error('Error procesando interacción:', error);
      if (interaction.isRepliable()) {
        const payload = { content: 'Ocurrió un error al procesar esta acción. Inténtalo de nuevo.', flags: MessageFlags.Ephemeral } as const;
        if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => undefined);
        else await interaction.reply(payload).catch(() => undefined);
      }
    }
  });
}

async function handleProfileInteraction(interaction: Interaction): Promise<boolean> {
  if (!interaction.isModalSubmit() && !interaction.isMessageComponent()) return false;
  if (!interaction.customId.startsWith('profile:')) return false;
  const [prefix, ownerId, ...parts] = interaction.customId.split(':');
  if (prefix !== 'profile' || !ownerId) return false;
  if (ownerId !== interaction.user.id) {
    if (interaction.isRepliable()) await interaction.reply({ content: 'Este panel de perfil pertenece a otra persona.', flags: MessageFlags.Ephemeral });
    return true;
  }
  const action = parts[0] ?? '';
  const guildId = interaction.guildId;
  if (!guildId) {
    if (interaction.isRepliable()) await interaction.reply({ content: 'Este panel solo funciona dentro de un servidor.', flags: MessageFlags.Ephemeral });
    return true;
  }
  if (interaction.isModalSubmit()) {
    if (action === 'edit' && (parts[1] === 'about' || parts[1] === 'title')) {
      const field = parts[1];
      await updateProfileField(ownerId, field, interaction.fields.getTextInputValue(field));
      await interaction.reply({ content: field === 'about' ? 'About guardado. Abre `/perfil` para ver la tarjeta actualizada.' : 'Título actualizado. Abre `/perfil` para ver el cambio.', flags: MessageFlags.Ephemeral });
      return true;
    }
    if (action === 'search-submit') {
      const query = interaction.fields.getTextInputValue('query').trim();
      await interaction.reply(await profileShopPanel(guildId, ownerId, 'all', query));
      return true;
    }
    return false;
  }
  if (!interaction.isMessageComponent()) return false;
  if (interaction.isStringSelectMenu()) {
    if (action === 'accent') {
      const accent = (interaction.values[0] ?? '#8b75dc').toLocaleLowerCase();
      if (accent === '#8b75dc') await unequipProfileType(ownerId, 'accent');
      else {
        const item = profileShopItems.find((entry) => entry.type === 'accent' && entry.color.toLocaleLowerCase() === accent);
        if (!item) { await interaction.reply({ content: 'Ese estilo ya no está disponible. Abre la tienda para ver los estilos actuales.', flags: MessageFlags.Ephemeral }); return true; }
        const result = await equipProfileItem(guildId, ownerId, item.id);
        if (!result.ok) { await interaction.reply({ content: result.message, flags: MessageFlags.Ephemeral }); return true; }
      }
      await interaction.update(componentUpdate(await profileCustomizePanel(guildId, ownerId, interaction.user))); return true;
    }
    if (action === 'shop-category') { await interaction.update(componentUpdate(await profileShopPanel(guildId, ownerId, interaction.values[0] ?? 'all'))); return true; }
    if (action === 'shop-item') {
      const category = parts[1] ?? 'all'; const query = decodeURIComponent(parts.slice(2).join(':') ?? '');
      await interaction.update(componentUpdate(await profileShopPanel(guildId, ownerId, category, query, interaction.values[0]))); return true;
    }
    if (action === 'inventory-category') { await interaction.update(componentUpdate(await profileInventoryPanel(guildId, ownerId, interaction.values[0] ?? 'all'))); return true; }
    if (action === 'inventory-item') { await interaction.update(componentUpdate(await profileInventoryPanel(guildId, ownerId, parts[1] ?? 'all', interaction.values[0]))); return true; }
    return false;
  }
  if (!interaction.isButton()) return false;
  if (action === 'edit' && (parts[1] === 'about' || parts[1] === 'title')) {
    const field = parts[1]; const about = field === 'about';
    const modal = new ModalBuilder().setCustomId(`profile:${ownerId}:edit:${field}`).setTitle(about ? 'Editar about' : 'Cambiar título')
      .addLabelComponents(new LabelBuilder().setLabel(about ? 'Sobre ti (máximo 180 caracteres)' : 'Título (máximo 40 caracteres)').setTextInputComponent(
        new TextInputBuilder().setCustomId(field).setStyle(about ? TextInputStyle.Paragraph : TextInputStyle.Short).setRequired(!about).setMaxLength(about ? 180 : 40).setPlaceholder(about ? 'Cuéntale algo a la comunidad…' : 'Explorador/a'),
      ));
    await interaction.showModal(modal); return true;
  }
  if (action === 'search') {
    const modal = new ModalBuilder().setCustomId(`profile:${ownerId}:search-submit`).setTitle('Búsqueda avanzada de la tienda')
      .addLabelComponents(new LabelBuilder().setLabel('Buscar por nombre, rareza o descripción').setTextInputComponent(new TextInputBuilder().setCustomId('query').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(64).setPlaceholder('ej. sakura, raro, marco')));
    await interaction.showModal(modal); return true;
  }
  if (action === 'buy') {
    const itemId = parts[1] ?? ''; const item = profileShopItems.find((entry) => entry.id === itemId);
    const result = await buyProfileItem(guildId, ownerId, itemId, interaction.id);
    if (result.ok) { await interaction.update(componentUpdate(await profileShopPanel(guildId,ownerId,item?.category??'all','',itemId,`✅ Compraste **${item?.name??itemId}** · saldo restante: **${result.balance.toLocaleString('es-MX')} monedas**.`))); return true; }
    const response = result.reason === 'insufficient' ? `Te faltan monedas. Saldo: **${result.balance.toLocaleString('es-MX')}**.` : result.reason === 'already_owned' ? 'Ya tienes ese artículo.' : 'Ese artículo no se puede comprar.';
    await interaction.reply({ content: response, flags: MessageFlags.Ephemeral });
    return true;
  }
  if (action === 'equip') {
    const itemId=parts[1]??''; const result=await equipProfileItem(guildId,ownerId,itemId);
    if(result.ok) { await interaction.update(componentUpdate(await profileInventoryPanel(guildId,ownerId,profileShopItems.find((item)=>item.id===itemId)?.category??'all',itemId))); return true; }
    await interaction.reply({content:result.message,flags:MessageFlags.Ephemeral});
    return true;
  }
  if (action === 'unequip') {
    const result=await unequipProfileType(ownerId,parts[1]??'');
    if(result.ok) { await interaction.update(componentUpdate(await profileInventoryPanel(guildId,ownerId,'all'))); return true; }
    await interaction.reply({content:result.message,flags:MessageFlags.Ephemeral});
    return true;
  }
  if (action === 'home') { await interaction.reply(await profileCardPanel(guildId,interaction.user)); return true; }
  if (action === 'wallet') { await interaction.reply(await economyPanel(guildId,ownerId,interaction.user.username,interaction.user.displayAvatarURL({extension:'png',size:256}))); return true; }
  if (action === 'rank') { await interaction.reply(await profileCardPanel(guildId,interaction.user,ownerId,'rank')); return true; }
  if (action === 'customize') { await interaction.reply(await profileCustomizePanel(guildId,ownerId,interaction.user)); return true; }
  if (action === 'inventory') { await interaction.reply(await profileInventoryPanel(guildId,ownerId,'all')); return true; }
  if (action === 'shop') { await interaction.reply(await storePanel(guildId,ownerId)); return true; }
  if (action === 'progress') { await interaction.reply(await profileProgressPanel(guildId,interaction.user)); return true; }
  if (action === 'rpg') { await interaction.reply(await rpgPanel(guildId,ownerId,interaction.user.username)); return true; }
  return false;
}
