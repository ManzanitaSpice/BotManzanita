import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from 'discord.js';
import type { Player, Track } from 'lavalink-client';
import type { FavoriteTrack, SavedPlaylist } from '../services/music-library.js';
import { getBalance, getInventory, storeItems } from '../services/economy.js';

const colors = { music: 0x8b5cf6, economy: 0x22c55e };
const money = new Intl.NumberFormat('es-MX');

export function componentUpdate(panel: { components: ContainerBuilder[] }) {
  return { components: panel.components, flags: ['IsComponentsV2'] as const };
}

export function economyPanel(guildId: string, userId: string) {
  const balance = getBalance(guildId, userId);
  const container = new ContainerBuilder()
    .setAccentColor(colors.economy)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `# ✨ BÓVEDA DEL SERVIDOR\n## ${money.format(balance)} monedas\nTu saldo está listo. Reclama tu diaria o explora la tienda.`))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `**Recompensa diaria**\n100 monedas cada 24 horas\n\n**Cómo ganar más**\nTrabaja cada 30 minutos o recibe monedas de otros miembros.`))
    .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('eco:daily').setLabel('Reclamar diaria').setEmoji('🎁').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('eco:store').setLabel('Abrir tienda').setEmoji('🛍️').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('eco:inventory').setLabel('Inventario').setEmoji('🎒').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('eco:refresh').setLabel('Actualizar').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
    ));
  return { components: [container], flags: ['IsComponentsV2', 'Ephemeral'] as const };
}

export function inventoryPanel(guildId: string, userId: string) {
  const ownedItems = getInventory(guildId, userId);
  const descriptions = new Map<string, string>(storeItems.map((item) => [item.id, `${item.emoji} **${item.name}** — ${item.description}`]));
  const listing = ownedItems.length
    ? ownedItems.map((item) => descriptions.get(item.itemId) ?? `📦 ${item.itemId}`).join('\n')
    : '_Todavía no tienes artículos. Visita la tienda para conseguir el primero._';
  const container = new ContainerBuilder()
    .setAccentColor(colors.economy)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `# 🎒 TU INVENTARIO\nArtículos desbloqueados: **${ownedItems.length}**\n\n${listing}`))
    .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('eco:back').setLabel('Volver a mi bóveda').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('eco:store').setLabel('Abrir tienda').setEmoji('🛍️').setStyle(ButtonStyle.Primary),
    ));
  return { components: [container], flags: ['IsComponentsV2', 'Ephemeral'] as const };
}

export function storePanel(guildId: string, userId: string) {
  const balance = getBalance(guildId, userId);
  const container = new ContainerBuilder()
    .setAccentColor(colors.economy)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `# 🛍️ TIENDA\nSaldo disponible: **${money.format(balance)} monedas**\nElige un artículo para ver la confirmación de compra.`))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      storeItems.map((item) => `${item.emoji} **${item.name}** · ${money.format(item.cost)} monedas\n${item.description}`).join('\n\n')))
    .addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder().setCustomId('eco:buy').setPlaceholder('Selecciona un artículo')
        .addOptions(storeItems.map((item) => ({ label: item.name, value: item.id, description: `${money.format(item.cost)} monedas · ${item.description}`, emoji: item.emoji }))),
    ))
    .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('eco:back').setLabel('Volver a mi bóveda').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    ));
  return { components: [container], flags: ['IsComponentsV2', 'Ephemeral'] as const };
}

export function purchaseConfirmPanel(itemId: string) {
  const item = storeItems.find((candidate) => candidate.id === itemId);
  if (!item) throw new Error('Artículo de tienda inválido.');
  const container = new ContainerBuilder()
    .setAccentColor(colors.economy)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `# 🛒 CONFIRMAR COMPRA\n## ${item.emoji} ${item.name}\n${item.description}\n\nPrecio: **${money.format(item.cost)} monedas**\nLa compra se descontará de tu saldo y quedará en tu inventario.`))
    .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`eco:confirm:${item.id}`).setLabel('Confirmar compra').setEmoji('✅').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('eco:store').setLabel('Cancelar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    ));
  return { components: [container], flags: ['IsComponentsV2', 'Ephemeral'] as const };
}

export function musicPanel(guildId: string, player: Player | undefined) {
  const current = player?.queue.current;
  const upcoming = player?.queue.tracks.slice(0, 5) ?? [];
  const queueText = upcoming.length
    ? upcoming.map((track, index) => {
      const requesterId = (track.requester as { id?: string } | undefined)?.id;
      return `**${index + 1}.** ${track.info.title}${requesterId ? ` · <@${requesterId}>` : ''}`;
    }).join('\n')
    : '_La cola está vacía. Usa `/musica agregar` para reproducir algo._';
  const duration = current?.info.duration ?? 0;
  const position = player?.position ?? 0;
  const progressRatio = duration > 0 ? Math.min(1, Math.max(0, position / duration)) : 0;
  const progressTicks = Math.floor(progressRatio * 14);
  const progress = current?.info.isStream
    ? '🔴 EN VIVO'
    : duration > 0
      ? `${time(position)} ━${'━'.repeat(progressTicks)}●${'─'.repeat(14 - progressTicks)} ${time(duration)}`
      : '🔴 En espera';
  const playback = player?.paused ? '⏸️ Pausado' : player?.playing ? '🟢 Reproduciendo' : '🔌 Conectado y listo';
  const currentRequesterId = (current?.requester as { id?: string } | undefined)?.id;
  const activeEffect = player?.filterManager.filters.nightcore
    ? 'Nightcore'
    : player?.filterManager.filters.vaporwave
      ? 'Vaporwave'
      : player?.filterManager.equalizerBands.some((band) => band.gain !== 0)
        ? 'Ecualizador'
        : 'Normal';

  const container = new ContainerBuilder()
    .setAccentColor(colors.music)
    .addSectionComponents((section) => section
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `# 🎧 MANZANITA PLAYER\n${current ? `## ${current.info.title}\n${current.info.author}${currentRequesterId ? ` · pedido por <@${currentRequesterId}>` : ''}` : '## Sin reproducción activa'}\n\n${playback}`))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(current?.info.artworkUrl || 'https://cdn.discordapp.com/embed/avatars/0.png').setDescription(current?.info.title || 'Manzanita Player')))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(progress))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**SIGUIENTE EN LA COLA** · ${player?.queue.tracks.length ?? 0} canciones · Volumen ${player?.volume ?? 65}% · Efecto ${activeEffect}\n${queueText}`))
    .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('music:toggle').setLabel(player?.paused ? 'Reanudar' : 'Pausar').setEmoji(player?.paused ? '▶️' : '⏸️').setStyle(ButtonStyle.Primary).setDisabled(!player?.playing && !player?.paused),
      new ButtonBuilder().setCustomId('music:skip').setLabel('Siguiente').setEmoji('⏭️').setStyle(ButtonStyle.Secondary).setDisabled(!player?.queue.current),
      new ButtonBuilder().setCustomId('music:previous').setLabel('Anterior').setEmoji('⏮️').setStyle(ButtonStyle.Secondary).setDisabled(!player?.queue.previous.length),
      new ButtonBuilder().setCustomId('music:repeat').setLabel(`Repetir: ${repeatLabel(player?.repeatMode ?? 'off')}`).setEmoji('🔁').setStyle(ButtonStyle.Secondary).setDisabled(!player),
      new ButtonBuilder().setCustomId('music:shuffle').setLabel('Mezclar').setEmoji('🔀').setStyle(ButtonStyle.Secondary).setDisabled((player?.queue.tracks.length ?? 0) < 2),
    ))
    .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('music:stop').setLabel('Detener').setEmoji('⏹️').setStyle(ButtonStyle.Danger).setDisabled(!player),
      new ButtonBuilder().setCustomId('music:queue').setLabel('Ver cola').setEmoji('📜').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('music:refresh').setLabel('Actualizar').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('music:volume:down').setLabel('Bajar volumen').setEmoji('🔉').setStyle(ButtonStyle.Secondary).setDisabled(!player),
      new ButtonBuilder().setCustomId('music:volume:up').setLabel('Subir volumen').setEmoji('🔊').setStyle(ButtonStyle.Secondary).setDisabled(!player),
    ))
    .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('music:add').setLabel('Añadir canción').setEmoji('🎵').setStyle(ButtonStyle.Success),
    ));
  container
    .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('music:seek:-15').setLabel('−15 s').setStyle(ButtonStyle.Secondary).setDisabled(!current || current.info.isStream),
      new ButtonBuilder().setCustomId('music:seek:15').setLabel('+15 s').setStyle(ButtonStyle.Secondary).setDisabled(!current || current.info.isStream),
    ))
    .addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder().setCustomId('music:effect').setPlaceholder('🎚️ Efecto de audio')
        .addOptions(
          { label: 'Sonido normal', value: 'normal', description: 'Desactiva todos los efectos' },
          { label: 'Graves', value: 'bass', description: 'Realza los graves' },
          { label: 'Rock', value: 'rock', description: 'Ecualización para rock' },
          { label: 'Pop', value: 'pop', description: 'Ecualización para pop' },
          { label: 'Nightcore', value: 'nightcore', description: 'Más velocidad y tono agudo' },
          { label: 'Vaporwave', value: 'vaporwave', description: 'Más lento y tono grave' },
        ),
    ));
  return { components: [container], flags: ['IsComponentsV2'] as const };
}

export function searchResultsPanel(searchId: string, tracks: Track[]) {
  const container = new ContainerBuilder()
    .setAccentColor(colors.music)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `# 🔎 RESULTADOS DE BÚSQUEDA\nEncontré ${tracks.length} resultados. Elige cuál quieres añadir a la cola.`))
    .addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder().setCustomId(`music:choose:${searchId}`).setPlaceholder('Selecciona una canción')
        .addOptions(tracks.slice(0, 25).map((track, index) => ({
          label: truncate(track.info.title, 100),
          value: String(index),
          description: truncate(track.info.author || track.info.sourceName, 100),
        }))),
    ));
  return { components: [container], flags: ['IsComponentsV2', 'Ephemeral'] as const };
}

export function favoritesPanel(guildId: string, userId: string, favorites: FavoriteTrack[]) {
  const container = new ContainerBuilder()
    .setAccentColor(colors.music)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `# 💜 MIS FAVORITOS\n${favorites.length}/25 canciones guardadas\n\n${favorites.length
        ? favorites.map((track, index) => `**${index + 1}.** ${truncate(track.title, 90)} · ${truncate(track.author, 55)}`).join('\n')
        : '_Guarda la canción actual con `/musica favorito guardar`._'}`));
  if (favorites.length) {
    const options = favorites.map((track) => ({
      label: truncate(track.title, 100),
      value: String(track.id),
      description: truncate(track.author, 100),
    }));
    container
      .addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder().setCustomId(`music:favorites:play:${guildId}:${userId}`).setPlaceholder('Añadir un favorito a la cola').addOptions(options),
      ))
      .addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder().setCustomId(`music:favorites:remove:${guildId}:${userId}`).setPlaceholder('Quitar de favoritos').addOptions(options),
      ));
  }
  return { components: [container], flags: ['IsComponentsV2', 'Ephemeral'] as const };
}

export function playlistsPanel(playlists: SavedPlaylist[]) {
  const listing = playlists.length
    ? playlists.map((playlist) => `🎼 **${playlist.name}** · ${playlist.trackCount} canciones`).join('\n')
    : '_Todavía no has creado listas. Guarda una canción con `/musica lista guardar` y asígnale un nombre._';
  const container = new ContainerBuilder()
    .setAccentColor(colors.music)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `# 🎶 MIS LISTAS\n${playlists.length}/20 listas guardadas\n\n${listing}\n\nUsa /musica lista ver para explorar o /musica lista reproducir para añadir una lista a la cola.`));
  return { components: [container], flags: ['IsComponentsV2', 'Ephemeral'] as const };
}

export function playlistDetailPanel(name: string, trackCount: number, tracks: Array<{ title: string; author: string }>) {
  const listing = tracks.length
    ? tracks.slice(0, 12).map((track, index) => `**${index + 1}.** ${truncate(track.title, 100)} · ${truncate(track.author, 65)}`).join('\n')
    : '_Lista vacía._';
  const remaining = trackCount > 12 ? `\n_y ${trackCount - 12} canciones más…_` : '';
  const container = new ContainerBuilder()
    .setAccentColor(colors.music)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `# 🎼 ${truncate(name, 60)}\n${trackCount} canciones guardadas\n\n${listing}${remaining}`));
  return { components: [container], flags: ['IsComponentsV2', 'Ephemeral'] as const };
}

const QUEUE_PAGE_SIZE = 10;

export function queuePanel(player: Player | undefined, page: number) {
  const queue = player?.queue.tracks ?? [];
  const pageCount = Math.max(1, Math.ceil(queue.length / QUEUE_PAGE_SIZE));
  const safePage = Math.min(Math.max(0, page), pageCount - 1);
  const start = safePage * QUEUE_PAGE_SIZE;
  const tracks = queue.slice(start, start + QUEUE_PAGE_SIZE);
  const listing = tracks.length
    ? tracks.map((track, index) => `**${start + index + 1}.** ${truncate(track.info.title, 120)} · ${truncate(track.info.author || 'Artista desconocido', 80)}`).join('\n')
    : '_No hay canciones esperando en la cola._';
  const container = new ContainerBuilder()
    .setAccentColor(colors.music)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `# 📜 COLA MUSICAL\n${player?.queue.current ? `Ahora: **${player.queue.current.info.title}**\n\n` : ''}${listing}\n\nPágina **${safePage + 1}/${pageCount}** · ${queue.length} canciones en espera`))
    .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`music:queue:page:${safePage - 1}`).setLabel('Anterior').setEmoji('◀️').setStyle(ButtonStyle.Secondary).setDisabled(safePage === 0),
      new ButtonBuilder().setCustomId(`music:queue:page:${safePage + 1}`).setLabel('Siguiente').setEmoji('▶️').setStyle(ButtonStyle.Secondary).setDisabled(safePage >= pageCount - 1),
      new ButtonBuilder().setCustomId(`music:queue:refresh:${safePage}`).setLabel('Actualizar').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('music:queue:close').setLabel('Cerrar').setEmoji('✖️').setStyle(ButtonStyle.Danger),
    ));
  if (tracks.length) container.addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder().setCustomId(`music:queue:remove:${safePage}`).setPlaceholder('Quitar una canción de esta página').setDisabled(!tracks.length)
        .addOptions(tracks.map((track, index) => ({
          label: truncate(track.info.title, 100),
          value: String(start + index),
          description: `Quitar de la posición ${start + index + 1}`,
        }))),
    ));
  return { components: [container], flags: ['IsComponentsV2', 'Ephemeral'] as const };
}

function repeatLabel(mode: 'off' | 'track' | 'queue'): string {
  if (mode === 'track') return 'Canción';
  if (mode === 'queue') return 'Cola';
  return 'No';
}

function truncate(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

function time(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
