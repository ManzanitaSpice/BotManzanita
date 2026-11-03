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
import { componentUpdate, economyPanel, favoritesPanel, inventoryPanel, musicPanel, purchaseConfirmPanel, queuePanel, storePanel } from '../ui/panels.js';
import { claimDaily, formatCooldown, getBalance, purchaseItem, storeItems } from '../services/economy.js';
import { addSelectedTrack, addTrack, applyMusicEffect, refreshMusicPanel, takeSearchTrack, type MusicEffect } from '../services/music.js';
import { getFavorite, getFavorites, removeFavorite } from '../services/music-library.js';

export function registerInteractionHandler(client: Client) {
  client.on('interactionCreate', async (interaction: Interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (command) await command.execute(interaction);
        return;
      }
      if (interaction.isModalSubmit() && interaction.customId === 'music:add:modal') {
        if (!interaction.guildId || !interaction.guild) {
          await interaction.reply({ content: 'La música solo está disponible dentro de un servidor.', ephemeral: true });
          return;
        }
        const voiceChannelId = interaction.guild.voiceStates.cache.get(interaction.user.id)?.channelId;
        if (!voiceChannelId) {
          await interaction.reply({ content: 'Entra primero a un canal de voz para reproducir música.', ephemeral: true });
          return;
        }
        const textChannelId = interaction.channelId;
        if (!textChannelId) {
          await interaction.reply({ content: 'No pude identificar el canal donde se inició la solicitud.', ephemeral: true });
          return;
        }
        const query = interaction.fields.getTextInputValue('query').trim();
        await interaction.deferReply({ ephemeral: true });
        try {
          const result = await addTrack(interaction.client, {
            guildId: interaction.guildId,
            voiceChannelId,
            textChannelId,
            user: interaction.user,
            query,
          });
          const description = result.playlist ? `Añadí **${result.count} canciones** de la lista.` : `Añadí **${result.title}** a la cola.`;
          await interaction.editReply(`🎶 ${description}`);
          await refreshMusicPanel(interaction.client, interaction.guildId);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'No pude añadir esa canción.';
          await interaction.editReply(`⚠️ ${message}`);
        }
        return;
      }
      if (!interaction.isMessageComponent() || !interaction.guildId) return;

      if (interaction.customId.startsWith('eco:')) {
        if (interaction.customId === 'eco:daily') {
          const result = claimDaily(interaction.guildId, interaction.user.id, interaction.id);
          const message = result.ok
            ? `🎁 Reclamaste **${result.amount} monedas**. Tu saldo ahora es **${result.balance}**.`
            : `⏳ Ya reclamaste tu recompensa. Vuelve en **${formatCooldown(result.secondsRemaining)}**.`;
          await interaction.update(componentUpdate(economyPanel(interaction.guildId, interaction.user.id)));
          await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral });
          return;
        }
        if (interaction.customId === 'eco:store') {
          await interaction.update(componentUpdate(storePanel(interaction.guildId, interaction.user.id)));
          return;
        }
        if (interaction.customId === 'eco:inventory') {
          await interaction.update(componentUpdate(inventoryPanel(interaction.guildId, interaction.user.id)));
          return;
        }
        if (interaction.customId === 'eco:back' || interaction.customId === 'eco:refresh') {
          await interaction.update(componentUpdate(economyPanel(interaction.guildId, interaction.user.id)));
          return;
        }
        if (interaction.customId === 'eco:buy' && interaction.isStringSelectMenu()) {
          const item = storeItems.find((candidate) => candidate.id === interaction.values[0]);
          if (!item) {
            await interaction.reply({ content: 'Ese artículo ya no está disponible.', ephemeral: true });
            return;
          }
          await interaction.update(componentUpdate(purchaseConfirmPanel(item.id)));
          return;
        }
        if (interaction.customId.startsWith('eco:confirm:')) {
          const item = storeItems.find((candidate) => candidate.id === interaction.customId.slice('eco:confirm:'.length));
          if (!item) {
            await interaction.reply({ content: 'Ese artículo ya no está disponible.', ephemeral: true });
            return;
          }
          const result = purchaseItem(interaction.guildId, interaction.user.id, item.id, item.cost, interaction.id);
          const content = result.ok
            ? `✅ Compraste **${item.name}** por ${item.cost} monedas. Te quedan **${result.balance}**.`
            : result.reason === 'already_owned'
              ? `Ya tienes **${item.name}** en tu inventario.`
              : `Te faltan monedas para **${item.name}**. Saldo actual: **${result.balance}**.`;
          await interaction.update(componentUpdate(storePanel(interaction.guildId, interaction.user.id)));
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
            await interaction.reply({ content: 'Este panel de favoritos le pertenece a otra persona.', ephemeral: true });
            return;
          }
          const favoriteId = Number(interaction.values[0]);
          if (!Number.isSafeInteger(favoriteId) || favoriteId < 1) {
            await interaction.reply({ content: 'Ese favorito ya no está disponible.', ephemeral: true });
            return;
          }
          const favorite = getFavorite(interaction.guildId, interaction.user.id, favoriteId);
          if (!favorite) {
            await interaction.reply({ content: 'Ese favorito ya no existe. Vuelve a abrir el panel.', ephemeral: true });
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
              await interaction.reply({ content: 'Entra primero a un canal de voz para reproducir un favorito.', ephemeral: true });
              return;
            }
            const textChannelId = interaction.channelId;
            if (!textChannelId) {
              await interaction.reply({ content: 'No pude identificar el canal donde se inició la solicitud.', ephemeral: true });
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
            await interaction.reply({ content: 'Entra a un canal de voz y vuelve a usar `/musica buscar`.', ephemeral: true });
            return;
          }
          const searchId = interaction.customId.slice('music:choose:'.length);
          const track = takeSearchTrack(searchId, interaction.guildId, interaction.user.id, Number(interaction.values[0]));
          if (!track) {
            await interaction.reply({ content: 'Esta búsqueda ya venció. Usa `/musica buscar` para intentarlo otra vez.', ephemeral: true });
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
          await interaction.reply(queuePanel(player, 0));
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
          await interaction.update(componentUpdate(queuePanel(player, Number.isFinite(page) ? page : 0)));
          return;
        }
        if (interaction.customId.startsWith('music:queue:remove:') && interaction.isStringSelectMenu()) {
          if (!player) {
            await interaction.update(componentUpdate(queuePanel(undefined, 0)));
            return;
          }
          const voiceChannelId = interaction.guild?.voiceStates.cache.get(interaction.user.id)?.channelId;
          if (!voiceChannelId || voiceChannelId !== player.voiceChannelId) {
            await interaction.reply({ content: 'Entra al mismo canal de voz que el bot para modificar la cola.', ephemeral: true });
            return;
          }
          const index = Number(interaction.values[0]);
          if (!Number.isSafeInteger(index) || index < 0 || index >= player.queue.tracks.length) {
            await interaction.update(componentUpdate(queuePanel(player, 0)));
            return;
          }
          const page = Number(interaction.customId.split(':').at(-1)) || 0;
          await interaction.deferUpdate();
          try {
            const removed = await player.queue.remove(index);
            await interaction.editReply(componentUpdate(queuePanel(player, page)));
            if (removed?.removed[0]) {
              await interaction.followUp({ content: `🗑️ Quité **${removed.removed[0].info.title}** de la cola.`, ephemeral: true });
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : 'No pude modificar la cola.';
            await interaction.followUp({ content: `⚠️ ${message}`, ephemeral: true });
          }
          return;
        }
        if (interaction.customId === 'music:refresh') {
          await interaction.update(musicPanel(interaction.guildId, player));
          return;
        }
        if (!player) {
          await interaction.reply({ content: 'No hay una sesión musical activa.', ephemeral: true });
          return;
        }
        const voiceChannelId = interaction.guild?.voiceStates.cache.get(interaction.user.id)?.channelId;
        if (!voiceChannelId || voiceChannelId !== player.voiceChannelId) {
          await interaction.reply({ content: 'Para controlar la música, entra al mismo canal de voz que el bot.', ephemeral: true });
          return;
        }
        if (interaction.customId === 'music:effect' && interaction.isStringSelectMenu()) {
          const effect = interaction.values[0] as MusicEffect | undefined;
          const effects: MusicEffect[] = ['normal', 'bass', 'rock', 'pop', 'nightcore', 'vaporwave'];
          if (!effect || !effects.includes(effect)) {
            await interaction.reply({ content: 'Ese efecto no está disponible.', ephemeral: true });
            return;
          }
          await interaction.deferUpdate();
          try {
            await applyMusicEffect(player, effect);
            await interaction.editReply(musicPanel(interaction.guildId, player));
          } catch (error) {
            const message = error instanceof Error ? error.message : 'No pude aplicar el efecto.';
            await interaction.followUp({ content: `⚠️ ${message}`, ephemeral: true });
          }
          return;
        }
        if (interaction.customId.startsWith('music:seek:') && interaction.isButton()) {
          const offset = Number(interaction.customId.slice('music:seek:'.length));
          const current = player.queue.current;
          if (!current || current.info.isStream || current.info.duration <= 0) {
            await interaction.reply({ content: 'Esta reproducción no permite buscar una posición.', ephemeral: true });
            return;
          }
          if (offset !== -15 && offset !== 15) {
            await interaction.reply({ content: 'Ese salto de tiempo no está disponible.', ephemeral: true });
            return;
          }
          const target = Math.min(current.info.duration - 1_000, Math.max(0, player.position + offset * 1_000));
          await interaction.deferUpdate();
          try {
            await player.seek(target);
            await interaction.editReply(musicPanel(interaction.guildId, player));
          } catch (error) {
            const message = error instanceof Error ? error.message : 'No pude cambiar la posición.';
            await interaction.followUp({ content: `⚠️ ${message}`, ephemeral: true });
          }
          return;
        }
        if (interaction.customId === 'music:skip' && !player.queue.current) {
          await interaction.reply({ content: 'No hay una canción activa que se pueda saltar.', ephemeral: true });
          return;
        }
        if (interaction.customId === 'music:previous' && !player.queue.previous.length) {
          await interaction.reply({ content: 'No hay canciones anteriores en el historial.', ephemeral: true });
          return;
        }
        if (interaction.customId === 'music:shuffle' && player.queue.tracks.length < 2) {
          await interaction.reply({ content: 'Añade al menos dos canciones pendientes para mezclarlas.', ephemeral: true });
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
          } else if (interaction.customId === 'music:volume:down') {
            await player.setVolume(Math.max(0, player.volume - 10));
          } else if (interaction.customId === 'music:volume:up') {
            await player.setVolume(Math.min(100, player.volume + 10));
          }
          await interaction.editReply(musicPanel(interaction.guildId, interaction.client.lavalink.getPlayer(interaction.guildId)));
        } catch (error) {
          const message = error instanceof Error ? error.message : 'No pude completar esa acción.';
          await interaction.followUp({ content: `⚠️ ${message}`, ephemeral: true });
        }
      }
    } catch (error) {
      console.error('Error procesando interacción:', error);
      if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: 'Ocurrió un error al procesar esta acción.', ephemeral: true }).catch(() => undefined);
      }
    }
  });
}
