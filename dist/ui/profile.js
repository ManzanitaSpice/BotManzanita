import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, StringSelectMenuBuilder, TextDisplayBuilder } from 'discord.js';
import { profileShopCategories, profileShopItems } from '../data/profile-shop.js';
import { getAccountBalances } from '../services/economy.js';
import { equippedProfileBadges, getProfileInventory, getProfileProgress, getProfileSettings, PROFILE_CHAT_XP_DAILY_CAP } from '../services/profile.js';
import { getRpgPet } from '../services/rpg.js';
import { storePanel } from './panels.js';
import { renderProfileCard, renderShopItemPreview } from './profile-cards.js';
const pid = (userId, action) => `profile:${userId}:${action}`;
function png(buffer, name) { return new AttachmentBuilder(buffer).setName(name); }
function panelContainer(buffer, title, description, accent, customId, rows, top = '') {
    const color = Number.parseInt(accent.slice(1), 16) || 0x8b75dc;
    const container = new ContainerBuilder().setAccentColor(color).addTextDisplayComponents(new TextDisplayBuilder().setContent(`${top}# ${title}\n${description}`))
        .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${customId}.png`).setDescription(title)));
    for (const row of rows)
        container.addActionRowComponents(row);
    return { components: [container], files: [png(buffer, `${customId}.png`)], flags: ['IsComponentsV2', 'Ephemeral'] };
}
export async function profileCardPanel(guildId, user, viewerId = user.id, mode = 'profile') {
    const [settings, progress, account, badges] = await Promise.all([getProfileSettings(user.id), getProfileProgress(guildId, user.id), getAccountBalances(guildId, user.id), equippedProfileBadges(user.id)]);
    const buffer = await renderProfileCard({ mode, userId: user.id, username: user.username, avatarUrl: user.displayAvatarURL({ extension: 'png', size: 256 }), settings, progress, wallet: account.wallet, bank: account.bank, premium: account.premium, badges });
    const own = user.id === viewerId;
    const rows = [];
    if (own) {
        rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(pid(viewerId, 'customize')).setLabel('Personalizar').setEmoji('🎨').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId(pid(viewerId, 'inventory')).setLabel('Inventario').setEmoji('🎒').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId(pid(viewerId, 'shop')).setLabel('Tienda').setEmoji('🛒').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId(pid(viewerId, 'progress')).setLabel('Progreso').setEmoji('📈').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId(pid(viewerId, 'wallet')).setLabel('Wallet').setEmoji('💰').setStyle(ButtonStyle.Secondary)));
        rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(pid(viewerId, 'rank')).setLabel('Rank card').setEmoji('🏆').setStyle(ButtonStyle.Secondary)));
    }
    const title = mode === 'wallet' ? 'BILLETERA' : mode === 'rank' ? 'TARJETA DE RANGO' : mode === 'levelup' ? 'NUEVO NIVEL' : 'TARJETA DE PERFIL';
    const description = mode === 'wallet' ? 'Monedas y gemas premium' : mode === 'rank' ? 'Rango global y actividad de usuario' : 'Tarjeta de comunidad de Manzanita';
    return panelContainer(buffer, title, description, settings.accent, `card-${mode}-${user.id}`, rows);
}
export async function profileCustomizePanel(guildId, userId, user) {
    const settings = await getProfileSettings(userId);
    const buffer = await selfCard(guildId, userId, 'profile', settings, user);
    const activeStyle = profileShopItems.find((item) => item.type === 'accent' && item.color.toLocaleLowerCase() === settings.accent.toLocaleLowerCase())?.name ?? 'Lavanda predeterminado';
    const container = new ContainerBuilder().setAccentColor(Number.parseInt(settings.accent.slice(1), 16) || 0x8b75dc)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🎨 PERSONALIZAR PERFIL\n**Estilo activo:** ${activeStyle}\nEdita tu título y descripción gratis. Lavanda es el estilo predeterminado; los demás estilos y cosméticos se compran en la tienda.`))
        .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://custom-profile.png').setDescription('Vista previa del perfil')))
        .addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(pid(userId, 'edit:about')).setLabel('Editar about').setEmoji('📝').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId(pid(userId, 'edit:title')).setLabel('Cambiar título').setEmoji('🏷️').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId(pid(userId, 'shop')).setLabel('Tienda por categorías').setEmoji('🛍️').setStyle(ButtonStyle.Success)))
        .addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(pid(userId, 'inventory')).setLabel('Equipar cosméticos').setEmoji('🎒').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId(pid(userId, 'wallet')).setLabel('Vista de wallet').setEmoji('💳').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId(pid(userId, 'home')).setLabel('Volver').setEmoji('↩️').setStyle(ButtonStyle.Secondary)));
    return { components: [container], files: [png(buffer, 'custom-profile.png')], flags: ['IsComponentsV2', 'Ephemeral'] };
}
export async function profileProgressPanel(guildId, user) {
    const [settings, progress] = await Promise.all([getProfileSettings(user.id), getProfileProgress(guildId, user.id)]);
    const buffer = await selfCard(guildId, user.id, 'rank', settings, user);
    const target = (progress.level ** 2) * 100;
    const container = new ContainerBuilder().setAccentColor(0x5c89d8).addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 📈 PROGRESO GLOBAL\nNivel **${progress.level}** · **${progress.xp.toLocaleString('es-MX')} XP** · rango global **#${progress.globalRank}**\nSiguiente nivel: **${Math.max(0, target - progress.xp).toLocaleString('es-MX')} XP** · XP de chat hoy: **${progress.dailyXp}/${PROFILE_CHAT_XP_DAILY_CAP}**\nActividad: **${progress.messages.toLocaleString('es-MX')} mensajes**`))
        .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://rank-card.png').setDescription('Tarjeta de rango global')))
        .addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(pid(user.id, 'home')).setLabel('Perfil').setEmoji('👤').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId(pid(user.id, 'wallet')).setLabel('Wallet').setEmoji('💰').setStyle(ButtonStyle.Secondary)));
    return { components: [container], files: [png(buffer, 'rank-card.png')], flags: ['IsComponentsV2', 'Ephemeral'] };
}
export async function levelUpCardMessage(guildId, user, level) {
    const [settings, progress, account, badges] = await Promise.all([getProfileSettings(user.id), getProfileProgress(guildId, user.id), getAccountBalances(guildId, user.id), equippedProfileBadges(user.id)]);
    const buffer = await renderProfileCard({ mode: 'levelup', userId: user.id, username: user.username, avatarUrl: user.displayAvatarURL({ extension: 'png', size: 256 }), settings, progress, wallet: account.wallet, bank: account.bank, premium: account.premium, badges, levelUpTo: level });
    return png(buffer, 'level-up.png');
}
export async function profileInventoryPanel(guildId, userId, category = 'all', selectedId) {
    const [inventory, settings, pet] = await Promise.all([getProfileInventory(guildId, userId), getProfileSettings(userId), category === 'pets' ? getRpgPet(guildId, userId) : Promise.resolve(undefined)]);
    const owned = new Map(inventory.map((entry) => [entry.itemId, entry.quantity]));
    const visibleInventory = inventory.filter((entry) => profileShopItems.some((item) => item.id === entry.itemId));
    const matching = profileShopItems.filter((item) => item.type !== 'pet' && owned.has(item.id) && (category === 'all' || item.category === category));
    const selected = matching.find((item) => item.id === selectedId) ?? matching[0];
    const equippedIds = new Set([settings.profileBg, settings.rankBg, settings.walletBg, settings.levelupBg, settings.tag, settings.frame, settings.sticker, profileShopItems.find((item) => item.type === 'accent' && item.color.toLocaleLowerCase() === settings.accent.toLocaleLowerCase())?.id].filter(Boolean));
    const activeBadges = await equippedProfileBadges(userId);
    activeBadges.forEach((id) => equippedIds.add(id));
    const info = category === 'pets' ? (pet ? `🐾 **${pet.name}** · ${pet.species} · ${pet.rarity}\nNivel ${pet.level} · ${pet.element} · ${pet.specialization}\nLas mascotas se adoptan y entrenan en el módulo RPG.` : 'Todavía no tienes una mascota activa. Adopta una en el módulo RPG.') : (selected ? `${selected.emoji} **${selected.name}** · ${selected.rarity}\n${selected.description}\n${equippedIds.has(selected.id) ? '✅ Equipado' : 'En tu inventario'}${owned.get(selected.id) > 1 ? ` · x${owned.get(selected.id)}` : ''}` : 'Aún no tienes cosméticos de esta categoría. Explora la tienda para conseguirlos.');
    const container = new ContainerBuilder().setAccentColor(0x4ba886).addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🎒 INVENTARIO\n${visibleInventory.reduce((sum, item) => sum + item.quantity, 0)} artículos · elige uno para previsualizar o equipar.\n\n${info}`));
    if (selected)
        container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://inventory-preview.png').setDescription(`Vista previa ${selected.name}`)));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(pid(userId, `inventory-category:${category}`)).setPlaceholder('Filtrar inventario').addOptions(profileShopCategories.map((entry) => ({ label: entry.label, value: entry.id, emoji: entry.emoji, default: category === entry.id })))));
    if (matching.length)
        container.addActionRowComponents(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(pid(userId, `inventory-item:${category}`)).setPlaceholder('Selecciona un artículo').addOptions(matching.slice(0, 25).map((item) => ({ label: item.name, value: item.id, description: `${item.rarity} · ${equippedIds.has(item.id) ? 'equipado' : 'disponible'}`, emoji: item.emoji, default: selected?.id === item.id })))));
    const rows = [];
    if (category === 'pets')
        rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(pid(userId, 'rpg')).setLabel(pet ? 'Ver y entrenar mascota' : 'Adoptar mascota').setEmoji('🐾').setStyle(ButtonStyle.Success)));
    if (selected && selected.type !== 'badge') {
        rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(pid(userId, `equip:${selected.id}`)).setLabel('Equipar').setEmoji('✅').setStyle(ButtonStyle.Success).setDisabled(equippedIds.has(selected.id)), new ButtonBuilder().setCustomId(pid(userId, `unequip:${selected.type}`)).setLabel('Desequipar ranura').setEmoji('➖').setStyle(ButtonStyle.Secondary)));
    }
    if (selected?.type === 'badge')
        rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(pid(userId, `equip:${selected.id}`)).setLabel('Equipar badge').setEmoji('🏅').setStyle(ButtonStyle.Success).setDisabled(equippedIds.has(selected.id)), new ButtonBuilder().setCustomId(pid(userId, 'unequip:badge')).setLabel('Quitar badges').setEmoji('➖').setStyle(ButtonStyle.Secondary)));
    rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(pid(userId, 'shop')).setLabel('Ir a tienda').setEmoji('🛒').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId(pid(userId, 'customize')).setLabel('Personalizar').setEmoji('🎨').setStyle(ButtonStyle.Secondary), ...(category === 'wallet_bg' || category === 'accent' ? [new ButtonBuilder().setCustomId(pid(userId, 'wallet')).setLabel('Vista de wallet').setEmoji('💳').setStyle(ButtonStyle.Primary)] : []), new ButtonBuilder().setCustomId(pid(userId, 'home')).setLabel('Perfil').setEmoji('↩️').setStyle(ButtonStyle.Secondary)));
    for (const row of rows)
        container.addActionRowComponents(row);
    const response = { components: [container], flags: ['IsComponentsV2', 'Ephemeral'] };
    return selected ? { ...response, files: [png(await renderShopItemPreview(selected), 'inventory-preview.png')] } : response;
}
export async function profileShopPanel(guildId, userId, category = 'all', query = '', selectedId, notice = '', previewUser) {
    void query;
    return storePanel(guildId, userId, category === 'all' ? 'profile:all' : `profile:${category}`, 0, selectedId, notice, 'profile', previewUser);
}
async function selfCard(guildId, userId, mode, settingsOverride, user) {
    const [settings, progress, account, badges] = await Promise.all([settingsOverride ? Promise.resolve(settingsOverride) : getProfileSettings(userId), getProfileProgress(guildId, userId), getAccountBalances(guildId, userId), equippedProfileBadges(userId)]);
    const username = user?.username ?? `Usuario ${userId.slice(-4)}`;
    const avatarUrl = user?.displayAvatarURL({ extension: 'png', size: 256 }) ?? '';
    return renderProfileCard({ mode, userId, username, avatarUrl, settings, progress, wallet: account.wallet, bank: account.bank, premium: account.premium, badges });
}
