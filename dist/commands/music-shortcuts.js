import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { addTrack, disconnectPlayer, refreshMusicPanel, rememberMusicPanel, rememberSearch, searchTracks } from '../services/music.js';
import { componentUpdate, musicPanel, queuePanel, searchResultsPanel } from '../ui/panels.js';
export const musicShortcutCommands = [
    createPlayCommand('play', 'Reproduce música o enlaces de YouTube, SoundCloud y Spotify.'),
    createPlayCommand('p', 'Atajo de /play.'),
    createSearchCommand('search', 'Busca canciones y deja elegir el resultado.'),
    createSearchCommand('buscar', 'Busca canciones y deja elegir el resultado.'),
    createQueueCommand('queue'),
    createQueueCommand('q'),
    createControlCommand('pause', 'Pausa la canción actual.', 'pause'),
    createControlCommand('resume', 'Reanuda la canción actual.', 'resume'),
    createControlCommand('skip', 'Salta a la siguiente canción.', 'skip'),
    createControlCommand('prev', 'Vuelve a la canción anterior.', 'previous'),
    createControlCommand('stop', 'Detiene la música y vacía la cola.', 'stop'),
    createControlCommand('leave', 'Detiene la música y sale del canal de voz.', 'leave'),
    createPanelCommand(),
];
function createPlayCommand(name, description) {
    return {
        data: new SlashCommandBuilder()
            .setName(name)
            .setDescription(description)
            .addStringOption((option) => option.setName('cancion').setDescription('Canción, artista o enlace').setRequired(true).setMaxLength(200)),
        async execute(interaction) {
            const context = getGuildContext(interaction);
            if (!context) {
                await interaction.reply({ content: 'La música solo está disponible dentro de un servidor.', flags: MessageFlags.Ephemeral });
                return;
            }
            const voiceChannelId = context.guild.voiceStates.cache.get(interaction.user.id)?.channelId;
            if (!voiceChannelId) {
                await interaction.reply({ content: 'Entra a un canal de voz y vuelve a usar el comando.', flags: MessageFlags.Ephemeral });
                return;
            }
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            try {
                const result = await addTrack(interaction.client, {
                    guildId: context.guildId,
                    voiceChannelId,
                    textChannelId: interaction.channelId,
                    user: interaction.user,
                    query: interaction.options.getString('cancion', true).trim(),
                });
                const added = result.playlist
                    ? `Añadí **${result.count} canciones** de la lista${result.truncated ? ' (límite de 50 por solicitud)' : ''}.`
                    : `Añadí **${result.title}** a la cola.`;
                await interaction.editReply(`🎶 ${added}`);
                await refreshMusicPanel(interaction.client, context.guildId);
            }
            catch (error) {
                await interaction.editReply(`⚠️ ${errorText(error, 'No pude añadir esa canción.')}`);
            }
        },
    };
}
function createSearchCommand(name, description) {
    return {
        data: new SlashCommandBuilder()
            .setName(name)
            .setDescription(description)
            .addStringOption((option) => option.setName('cancion').setDescription('Canción, artista o enlace').setRequired(true).setMaxLength(200)),
        async execute(interaction) {
            const context = getGuildContext(interaction);
            if (!context) {
                await interaction.reply({ content: 'La búsqueda solo está disponible dentro de un servidor.', flags: MessageFlags.Ephemeral });
                return;
            }
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            try {
                const tracks = (await searchTracks(interaction.client, interaction.options.getString('cancion', true).trim(), interaction.user)).slice(0, 25);
                if (!tracks.length)
                    throw new Error('No encontré resultados. Prueba con canción y artista o pega un enlace directo.');
                const searchId = rememberSearch(context.guildId, interaction.user.id, tracks);
                await interaction.editReply(componentUpdate(searchResultsPanel(searchId, tracks)));
            }
            catch (error) {
                await interaction.editReply(`⚠️ ${errorText(error, 'No pude buscar esa canción.')}`);
            }
        },
    };
}
function createQueueCommand(name) {
    return {
        data: new SlashCommandBuilder().setName(name).setDescription('Muestra y administra la cola de música.'),
        async execute(interaction) {
            const context = getGuildContext(interaction);
            if (!context) {
                await interaction.reply({ content: 'La cola solo está disponible dentro de un servidor.', flags: MessageFlags.Ephemeral });
                return;
            }
            await interaction.reply(queuePanel(interaction.client.lavalink.getPlayer(context.guildId), 0));
        },
    };
}
function createControlCommand(name, description, action) {
    return {
        data: new SlashCommandBuilder().setName(name).setDescription(description),
        async execute(interaction) {
            const context = getGuildContext(interaction);
            if (!context) {
                await interaction.reply({ content: 'Este comando solo funciona dentro de un servidor.', flags: MessageFlags.Ephemeral });
                return;
            }
            const player = interaction.client.lavalink.getPlayer(context.guildId);
            if (!player) {
                await interaction.reply({ content: 'No hay música activa. Usa `/play` para empezar.', flags: MessageFlags.Ephemeral });
                return;
            }
            const voiceChannelId = context.guild.voiceStates.cache.get(interaction.user.id)?.channelId;
            if (!voiceChannelId || voiceChannelId !== player.voiceChannelId) {
                await interaction.reply({ content: 'Entra al mismo canal de voz que el bot para controlar la música.', flags: MessageFlags.Ephemeral });
                return;
            }
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            try {
                let message;
                if (action === 'pause') {
                    if (!player.playing || player.paused)
                        message = 'No hay una canción reproduciéndose ahora.';
                    else {
                        await player.pause();
                        message = '⏸️ Música pausada.';
                    }
                }
                else if (action === 'resume') {
                    if (!player.paused)
                        message = 'La música ya está reproduciéndose.';
                    else {
                        await player.resume();
                        message = '▶️ Música reanudada.';
                    }
                }
                else if (action === 'skip') {
                    if (!player.queue.current)
                        message = 'No hay una canción activa que se pueda saltar.';
                    else {
                        await player.skip();
                        message = '⏭️ Canción saltada.';
                    }
                }
                else if (action === 'previous') {
                    const previous = await player.queue.shiftPrevious();
                    if (!previous)
                        message = 'No hay canciones anteriores en el historial.';
                    else {
                        await player.play({ clientTrack: previous });
                        message = `⏮️ Volviendo a **${previous.info.title}**.`;
                    }
                }
                else if (action === 'stop') {
                    await player.stopPlaying(true);
                    message = '⏹️ Reproducción detenida y cola vaciada.';
                }
                else {
                    await disconnectPlayer(player);
                    message = '👋 Me desconecté del canal de voz.';
                }
                await interaction.editReply(message);
                await refreshMusicPanel(interaction.client, context.guildId);
            }
            catch (error) {
                await interaction.editReply(`⚠️ ${errorText(error, 'No pude completar esa acción.')}`);
            }
        },
    };
}
function createPanelCommand() {
    return {
        data: new SlashCommandBuilder().setName('np').setDescription('Abre el panel de la canción y los controles.'),
        async execute(interaction) {
            const context = getGuildContext(interaction);
            if (!context) {
                await interaction.reply({ content: 'El panel solo está disponible dentro de un servidor.', flags: MessageFlags.Ephemeral });
                return;
            }
            await interaction.reply(musicPanel(context.guildId, interaction.client.lavalink.getPlayer(context.guildId)));
            rememberMusicPanel(context.guildId, await interaction.fetchReply());
        },
    };
}
function getGuildContext(interaction) {
    if (!interaction.guildId || !interaction.guild)
        return undefined;
    return { guildId: interaction.guildId, guild: interaction.guild };
}
function errorText(error, fallback) {
    return error instanceof Error ? error.message : fallback;
}
