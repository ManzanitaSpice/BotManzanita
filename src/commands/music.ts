import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { RepeatMode } from 'lavalink-client';
import type { BotCommand } from '../types.js';
import { addSavedTracks, addTrack, applyMusicEffect, refreshMusicPanel, rememberMusicPanel, rememberSearch, searchTracks, type MusicEffect } from '../services/music.js';
import { addFavorite, deletePlaylist, getFavorites, getPlaylist, getPlaylists, removeFavorite, removePlaylistTrack, saveTrackToPlaylist } from '../services/music-library.js';
import { componentUpdate, favoritesPanel, musicPanel, playlistDetailPanel, playlistsPanel, queuePanel, searchResultsPanel } from '../ui/panels.js';

export const musicCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('musica')
    .setDescription('Busca música y controla el reproductor del servidor')
    .addSubcommand((subcommand) => subcommand.setName('panel').setDescription('Publica el panel de controles musicales'))
    .addSubcommand((subcommand) => subcommand.setName('buscar').setDescription('Busca y elige una canción')
      .addStringOption((option) => option.setName('consulta').setDescription('Canción, artista o enlace').setRequired(true).setMaxLength(200)))
    .addSubcommand((subcommand) => subcommand.setName('agregar').setDescription('Añade el primer resultado a la cola')
      .addStringOption((option) => option.setName('consulta').setDescription('Canción, artista o enlace').setRequired(true).setMaxLength(200)))
    .addSubcommand((subcommand) => subcommand.setName('cola').setDescription('Consulta y administra la cola'))
    .addSubcommand((subcommand) => subcommand.setName('pausar').setDescription('Pausa la canción actual'))
    .addSubcommand((subcommand) => subcommand.setName('reanudar').setDescription('Reanuda la canción actual'))
    .addSubcommand((subcommand) => subcommand.setName('saltar').setDescription('Salta a la siguiente canción'))
    .addSubcommand((subcommand) => subcommand.setName('anterior').setDescription('Reproduce de nuevo la canción anterior'))
    .addSubcommand((subcommand) => subcommand.setName('detener').setDescription('Detiene la reproducción y vacía la cola'))
    .addSubcommand((subcommand) => subcommand.setName('desconectar').setDescription('Detiene la música y sale del canal de voz'))
    .addSubcommand((subcommand) => subcommand.setName('mezclar').setDescription('Mezcla las canciones pendientes'))
    .addSubcommand((subcommand) => subcommand.setName('repetir').setDescription('Cambia el modo de repetición')
      .addStringOption((option) => option.setName('modo').setDescription('Qué debe repetirse').setRequired(true)
        .addChoices(
          { name: 'Desactivado', value: 'off' },
          { name: 'Canción actual', value: 'track' },
          { name: 'Cola completa', value: 'queue' },
        )))
    .addSubcommand((subcommand) => subcommand.setName('volumen').setDescription('Ajusta el volumen del reproductor')
      .addIntegerOption((option) => option.setName('porcentaje').setDescription('Del 0 al 100').setRequired(true).setMinValue(0).setMaxValue(100)))
    .addSubcommand((subcommand) => subcommand.setName('efecto').setDescription('Aplica un efecto de audio')
      .addStringOption((option) => option.setName('modo').setDescription('Ecualización o efecto').setRequired(true)
        .addChoices(
          { name: 'Normal', value: 'normal' },
          { name: 'Graves', value: 'bass' },
          { name: 'Rock', value: 'rock' },
          { name: 'Pop', value: 'pop' },
          { name: 'Nightcore', value: 'nightcore' },
          { name: 'Vaporwave', value: 'vaporwave' },
        )))
    .addSubcommandGroup((group) => group.setName('favorito').setDescription('Guarda y administra tus canciones favoritas')
      .addSubcommand((subcommand) => subcommand.setName('guardar').setDescription('Guarda la canción que está sonando'))
      .addSubcommand((subcommand) => subcommand.setName('ver').setDescription('Abre tus canciones favoritas'))
      .addSubcommand((subcommand) => subcommand.setName('quitar').setDescription('Quita un favorito por posición')
        .addIntegerOption((option) => option.setName('posicion').setDescription('Posición en `/musica favorito ver`').setRequired(true).setMinValue(1))))
    .addSubcommandGroup((group) => group.setName('lista').setDescription('Crea y administra tus listas guardadas')
      .addSubcommand((subcommand) => subcommand.setName('guardar').setDescription('Guarda la canción actual en una lista')
        .addStringOption((option) => option.setName('nombre').setDescription('Nombre de la lista').setRequired(true).setMaxLength(32)))
      .addSubcommand((subcommand) => subcommand.setName('ver').setDescription('Muestra las canciones de una lista')
        .addStringOption((option) => option.setName('nombre').setDescription('Lista que quieres abrir').setRequired(true).setMaxLength(32)))
      .addSubcommand((subcommand) => subcommand.setName('reproducir').setDescription('Añade una lista a la cola')
        .addStringOption((option) => option.setName('nombre').setDescription('Lista que quieres reproducir').setRequired(true).setMaxLength(32)))
      .addSubcommand((subcommand) => subcommand.setName('mislistas').setDescription('Muestra tus listas guardadas'))
      .addSubcommand((subcommand) => subcommand.setName('quitar').setDescription('Quita una canción de una lista')
        .addStringOption((option) => option.setName('nombre').setDescription('Lista que quieres editar').setRequired(true).setMaxLength(32))
        .addIntegerOption((option) => option.setName('posicion').setDescription('Posición mostrada en `/musica lista ver`').setRequired(true).setMinValue(1)))
      .addSubcommand((subcommand) => subcommand.setName('eliminar').setDescription('Elimina una lista completa')
        .addStringOption((option) => option.setName('nombre').setDescription('Lista que quieres eliminar').setRequired(true).setMaxLength(32))))
    .addSubcommand((subcommand) => subcommand.setName('quitar').setDescription('Quita una canción pendiente de la cola')
      .addIntegerOption((option) => option.setName('posicion').setDescription('Posición en la cola, empezando en 1').setRequired(true).setMinValue(1))),
  async execute(interaction) {
    const guildId = interaction.guildId;
    const guild = interaction.guild;
    if (!guildId || !guild) {
      await interaction.reply({ content: 'La música solo está disponible dentro de un servidor.', flags: MessageFlags.Ephemeral });
      return;
    }
    const action = interaction.options.getSubcommand();
    const group = interaction.options.getSubcommandGroup(false);
    const manager = interaction.client.lavalink;

    if (group === 'favorito') {
      if (action === 'ver') {
        await interaction.reply(favoritesPanel(guildId, interaction.user.id, getFavorites(guildId, interaction.user.id)));
        return;
      }
      if (action === 'guardar') {
        const player = manager.getPlayer(guildId);
        const voiceChannelId = guild.voiceStates.cache.get(interaction.user.id)?.channelId;
        if (!player?.queue.current) {
          await interaction.reply({ content: 'No hay una canción activa para guardar.', flags: MessageFlags.Ephemeral });
          return;
        }
        if (!voiceChannelId || voiceChannelId !== player.voiceChannelId) {
          await interaction.reply({ content: 'Entra al mismo canal de voz que el bot para guardar la canción actual.', flags: MessageFlags.Ephemeral });
          return;
        }
        const result = addFavorite(guildId, interaction.user.id, player.queue.current);
        const message = result === 'saved' ? `💜 Guardé **${player.queue.current.info.title}** en tus favoritos.`
          : result === 'exists' ? 'Esa canción ya está en tus favoritos.' : 'Llegaste al límite de 25 favoritos.';
        await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
        return;
      }
      if (action === 'quitar') {
        const position = interaction.options.getInteger('posicion', true);
        const favorite = getFavorites(guildId, interaction.user.id)[position - 1];
        if (!favorite || !removeFavorite(guildId, interaction.user.id, favorite.id)) {
          await interaction.reply({ content: 'No hay un favorito en esa posición.', flags: MessageFlags.Ephemeral });
          return;
        }
        await interaction.reply({ content: `🗑️ Quité **${favorite.title}** de tus favoritos.`, flags: MessageFlags.Ephemeral });
        return;
      }
    }

    if (group === 'lista') {
      if (action === 'mislistas') {
        await interaction.reply(playlistsPanel(getPlaylists(guildId, interaction.user.id)));
        return;
      }
      const name = interaction.options.getString('nombre', true).trim();
      if (action === 'guardar') {
        const player = manager.getPlayer(guildId);
        const voiceChannelId = guild.voiceStates.cache.get(interaction.user.id)?.channelId;
        if (!player?.queue.current) {
          await interaction.reply({ content: 'No hay una canción activa para guardar.', flags: MessageFlags.Ephemeral });
          return;
        }
        if (!voiceChannelId || voiceChannelId !== player.voiceChannelId) {
          await interaction.reply({ content: 'Entra al mismo canal de voz que el bot para guardar la canción actual.', flags: MessageFlags.Ephemeral });
          return;
        }
        const result = saveTrackToPlaylist(guildId, interaction.user.id, name ?? '', player.queue.current);
        const message = result.state === 'added' ? `🎼 Guardé **${player.queue.current.info.title}** en **${result.name}** (${result.count} canciones).`
          : result.state === 'exists' ? `Esa canción ya está en **${result.name}**.`
            : result.state === 'playlist_limit' ? 'Llegaste al límite de 20 listas.' : `**${result.name}** ya tiene 100 canciones.`;
        await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
        return;
      }
      if (action === 'ver') {
        const result = getPlaylist(guildId, interaction.user.id, name ?? '');
        if (!result) {
          await interaction.reply({ content: `No encontré la lista **${name}**. Usa /musica lista mislistas para ver las tuyas.`, flags: MessageFlags.Ephemeral });
          return;
        }
        await interaction.reply(playlistDetailPanel(result.playlist.name, result.playlist.trackCount, result.tracks));
        return;
      }
      if (action === 'reproducir') {
        const result = getPlaylist(guildId, interaction.user.id, name ?? '');
        if (!result) {
          await interaction.reply({ content: `No encontré la lista **${name}**.`, flags: MessageFlags.Ephemeral });
          return;
        }
        const voiceChannelId = guild.voiceStates.cache.get(interaction.user.id)?.channelId;
        if (!voiceChannelId) {
          await interaction.reply({ content: 'Entra primero a un canal de voz para reproducir la lista.', flags: MessageFlags.Ephemeral });
          return;
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
          const playback = await addSavedTracks(interaction.client, {
            guildId,
            voiceChannelId,
            textChannelId: interaction.channelId,
            user: interaction.user,
            uris: result.tracks.map((track) => track.trackUri),
          });
          const unavailable = playback.unavailable ? ` No pude recuperar ${playback.unavailable} pistas.` : '';
          await interaction.editReply(`🎶 Añadí **${playback.added} canciones** de **${result.playlist.name}** a la cola.${unavailable}`);
          await refreshMusicPanel(interaction.client, guildId);
        } catch (error) {
          await interaction.editReply(`⚠️ ${errorText(error, 'No pude reproducir esa lista.')}`);
        }
        return;
      }
      if (action === 'quitar') {
        const position = interaction.options.getInteger('posicion', true);
        const removed = removePlaylistTrack(guildId, interaction.user.id, name ?? '', position);
        await interaction.reply({ content: removed ? `🗑️ Quité la canción **${position}** de **${name}**.` : 'No encontré esa lista o esa posición.', flags: MessageFlags.Ephemeral });
        return;
      }
      if (action === 'eliminar') {
        const removed = deletePlaylist(guildId, interaction.user.id, name ?? '');
        await interaction.reply({ content: removed ? `🗑️ Eliminé la lista **${name}**.` : `No encontré la lista **${name}**.`, flags: MessageFlags.Ephemeral });
        return;
      }
    }

    if (action === 'panel') {
      await interaction.reply(musicPanel(guildId, manager.getPlayer(guildId)));
      rememberMusicPanel(guildId, await interaction.fetchReply());
      return;
    }

    if (action === 'buscar') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const query = interaction.options.getString('consulta', true).trim();
        const tracks = (await searchTracks(interaction.client, query, interaction.user)).slice(0, 25);
        if (!tracks.length) throw new Error('No encontré canciones para esa consulta.');
        const searchId = rememberSearch(guildId, interaction.user.id, tracks);
        await interaction.editReply(componentUpdate(searchResultsPanel(searchId, tracks)));
      } catch (error) {
        await interaction.editReply(`⚠️ ${errorText(error, 'No pude buscar esa canción.')}`);
      }
      return;
    }

    if (action === 'agregar') {
      const voiceChannelId = guild.voiceStates.cache.get(interaction.user.id)?.channelId;
      if (!voiceChannelId) {
        await interaction.reply({ content: 'Entra primero a un canal de voz para reproducir música.', flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const query = interaction.options.getString('consulta', true).trim();
        const result = await addTrack(interaction.client, {
          guildId,
          voiceChannelId,
          textChannelId: interaction.channelId,
          user: interaction.user,
          query,
        });
        const description = result.playlist ? `Añadí **${result.count} canciones** de la lista.` : `Añadí **${result.title}** a la cola.`;
        await interaction.editReply(`🎶 ${description}`);
        await refreshMusicPanel(interaction.client, guildId);
      } catch (error) {
          await interaction.editReply(`⚠️ ${errorText(error, 'No pude añadir esa canción. Prueba /play o /search.')}`);
      }
      return;
    }

    const player = manager.getPlayer(guildId);
    if (action === 'cola') {
      await interaction.reply(queuePanel(player, 0));
      return;
    }
    if (!player) {
      await interaction.reply({ content: 'No hay una sesión musical activa. Usa `/play` para empezar.', flags: MessageFlags.Ephemeral });
      return;
    }
    const voiceChannelId = guild.voiceStates.cache.get(interaction.user.id)?.channelId;
    if (!voiceChannelId || voiceChannelId !== player.voiceChannelId) {
      await interaction.reply({ content: 'Entra al mismo canal de voz que el bot para controlar la música.', flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      if (action === 'pausar') {
        if (!player.playing || player.paused) {
          await interaction.editReply('No hay una canción reproduciéndose ahora.');
          return;
        }
        await player.pause();
        await interaction.editReply('⏸️ Música pausada.');
      } else if (action === 'reanudar') {
        if (!player.paused) {
          await interaction.editReply('La música ya está reproduciéndose.');
          return;
        }
        await player.resume();
        await interaction.editReply('▶️ Música reanudada.');
      } else if (action === 'saltar') {
        if (!player.queue.current) {
          await interaction.editReply('No hay una canción activa que se pueda saltar.');
          return;
        }
        await player.skip();
        await interaction.editReply('⏭️ Canción saltada.');
      } else if (action === 'anterior') {
        const previous = await player.queue.shiftPrevious();
        if (!previous) {
          await interaction.editReply('No hay canciones anteriores en el historial.');
          return;
        }
        await player.play({ clientTrack: previous });
        await interaction.editReply(`⏮️ Volviendo a **${previous.info.title}**.`);
      } else if (action === 'detener') {
        await player.stopPlaying(true);
        await interaction.editReply('⏹️ Reproducción detenida y cola vaciada.');
      } else if (action === 'desconectar') {
        await player.stopPlaying(true);
        await player.destroy('requested disconnect');
        await interaction.editReply('👋 Me desconecté del canal de voz.');
      } else if (action === 'mezclar') {
        if (player.queue.tracks.length < 2) {
          await interaction.editReply('Añade al menos dos canciones pendientes para mezclarlas.');
          return;
        }
        const count = await player.queue.shuffle();
        await interaction.editReply(`🔀 Mezclé **${count} canciones** de la cola.`);
      } else if (action === 'repetir') {
        const mode = interaction.options.getString('modo', true) as RepeatMode;
        await player.setRepeatMode(mode);
        const label = mode === 'off' ? 'desactivada' : mode === 'track' ? 'repetir canción' : 'repetir cola';
        await interaction.editReply(`🔁 Repetición: **${label}**.`);
      } else if (action === 'volumen') {
        const volume = interaction.options.getInteger('porcentaje', true);
        await player.setVolume(volume);
        await interaction.editReply(`🔊 Volumen ajustado a **${volume}%**.`);
      } else if (action === 'efecto') {
        const effect = interaction.options.getString('modo', true) as MusicEffect;
        await applyMusicEffect(player, effect);
        const labels: Record<MusicEffect, string> = {
          normal: 'sonido normal', bass: 'graves', rock: 'rock', pop: 'pop', nightcore: 'nightcore', vaporwave: 'vaporwave',
        };
        await interaction.editReply(`🎚️ Efecto aplicado: **${labels[effect]}**.`);
      } else if (action === 'quitar') {
        const position = interaction.options.getInteger('posicion', true);
        if (position > player.queue.tracks.length) {
          await interaction.editReply(`La cola solo tiene **${player.queue.tracks.length} canciones pendientes**.`);
          return;
        }
        const removed = await player.queue.remove(position - 1);
        const title = removed?.removed[0]?.info.title;
        await interaction.editReply(title ? `🗑️ Quité **${title}** de la cola.` : 'No pude quitar esa canción.');
      }
      await refreshMusicPanel(interaction.client, guildId);
    } catch (error) {
      await interaction.editReply(`⚠️ ${errorText(error, 'No pude completar esa acción.')}`);
    }
  },
};

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
