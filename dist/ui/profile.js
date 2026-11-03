import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, StringSelectMenuBuilder, TextDisplayBuilder } from 'discord.js';
import { profileShopCategories, profileShopItems } from '../data/profile-shop.js';
import { getAccountBalances } from '../services/economy.js';
import { equippedProfileBadges, getProfileInventory, getProfileProgress, getProfileSettings, profileItem } from '../services/profile.js';
import { getRpgPet } from '../services/rpg.js';
import { renderProfileCard } from './profile-cards.js';
const money = new Intl.NumberFormat('es-MX');
const pid = (userId, action) => `profile:${userId}:${action}`;
const accentChoices = [{ label: 'Lavanda', value: '#8b75dc', emoji: '💜' }, { label: 'Menta', value: '#47b69b', emoji: '🍃' }, { label: 'Cielo', value: '#5b9de0', emoji: '💠' }, { label: 'Rosa', value: '#d76f9a', emoji: '🌸' }, { label: 'Ámbar', value: '#d2994e', emoji: '🌟' }, { label: 'Carmesí', value: '#d45d69', emoji: '❤️' }];
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
    const [settings, progress, account, badges, pet] = await Promise.all([getProfileSettings(user.id), getProfileProgress(guildId, user.id), getAccountBalances(guildId, user.id), equippedProfileBadges(user.id), getRpgPet(guildId, user.id)]);
    const buffer = await renderProfileCard({ mode, userId: user.id, username: user.username, avatarUrl: user.displayAvatarURL({ extension: 'png', size: 256 }), settings, progress, wallet: account.wallet, bank: account.bank, premium: account.premium, badges, ...(pet?.name ? { petName: pet.name } : {}) });
    const own = user.id === viewerId;
    const rows = [];
    if (own) {
        rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(pid(viewerId, 'customize')).setLabel('Personalizar').setEmoji('🎨').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId(pid(viewerId, 'inventory')).setLabel('Inventario').setEmoji('🎒').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId(pid(viewerId, 'shop')).setLabel('Tienda').setEmoji('🛒').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId(pid(viewerId, 'progress')).setLabel('Progreso').setEmoji('📈').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId(pid(viewerId, 'wallet')).setLabel('Wallet').setEmoji('💰').setStyle(ButtonStyle.Secondary)));
        rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(pid(viewerId, 'rank')).setLabel('Rank card').setEmoji('🏆').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId(pid(viewerId, 'room')).setLabel('Room card').setEmoji('🏠').setStyle(ButtonStyle.Secondary)));
    }
    const title = mode === 'wallet' ? 'WALLET CARD' : mode === 'rank' ? 'RANK CARD' : 'PROFILE CARD';
    const description = `Nivel global **${progress.level}** · puesto global **#${progress.globalRank}** · ${progress.xp.toLocaleString('es-MX')} XP`;
    return panelContainer(buffer, title, description, settings.accent, `card-${mode}-${user.id}`, rows);
}
export async function profileCustomizePanel(guildId, userId, user) {
    const settings = await getProfileSettings(userId);
    const buffer = await selfCard(guildId, userId, 'profile', settings, user);
    const container = new ContainerBuilder().setAccentColor(Number.parseInt(settings.accent.slice(1), 16) || 0x8b75dc)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('# 🎨 PERSONALIZAR PERFIL\nAjusta tu tarjeta, título, about y color. Los cosméticos comprados se equipan desde Inventario.'))
        .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://custom-profile.png').setDescription('Vista previa del perfil')))
        .addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(pid(userId, 'edit:about')).setLabel('Editar about').setEmoji('📝').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId(pid(userId, 'edit:title')).setLabel('Cambiar título').setEmoji('🏷️').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId(pid(userId, 'inventory')).setLabel('Equipar cosméticos').setEmoji('🎒').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId(pid(userId, 'home')).setLabel('Volver').setEmoji('↩️').setStyle(ButtonStyle.Secondary)))
        .addActionRowComponents(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(pid(userId, 'accent')).setPlaceholder('Cambiar color/accent theme').addOptions(accentChoices.map((choice) => ({ ...choice, default: settings.accent === choice.value })))));
    return { components: [container], files: [png(buffer, 'custom-profile.png')], flags: ['IsComponentsV2', 'Ephemeral'] };
}
export async function profileProgressPanel(guildId, user) {
    const [settings, progress] = await Promise.all([getProfileSettings(user.id), getProfileProgress(guildId, user.id)]);
    const buffer = await selfCard(guildId, user.id, 'rank', settings, user);
    const target = (progress.level ** 2) * 100;
    const container = new ContainerBuilder().setAccentColor(0x5c89d8).addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 📈 PROGRESO GLOBAL\nNivel **${progress.level}** · **${progress.xp.toLocaleString('es-MX')} XP** · rango global **#${progress.globalRank}**\nSiguiente nivel: **${Math.max(0, target - progress.xp).toLocaleString('es-MX')} XP** · actividad: **${progress.messages.toLocaleString('es-MX')} mensajes**`))
        .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://rank-card.png').setDescription('Tarjeta de rango global')))
        .addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(pid(user.id, 'home')).setLabel('Perfil').setEmoji('👤').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId(pid(user.id, 'wallet')).setLabel('Wallet').setEmoji('💰').setStyle(ButtonStyle.Secondary)));
    return { components: [container], files: [png(buffer, 'rank-card.png')], flags: ['IsComponentsV2', 'Ephemeral'] };
}
export async function levelUpCardMessage(guildId, user, level) {
    const [settings, progress, account, badges, pet] = await Promise.all([getProfileSettings(user.id), getProfileProgress(guildId, user.id), getAccountBalances(guildId, user.id), equippedProfileBadges(user.id), getRpgPet(guildId, user.id)]);
    const buffer = await renderProfileCard({ mode: 'levelup', userId: user.id, username: user.username, avatarUrl: user.displayAvatarURL({ extension: 'png', size: 256 }), settings, progress, wallet: account.wallet, bank: account.bank, premium: account.premium, badges, levelUpTo: level, ...(pet?.name ? { petName: pet.name } : {}) });
    return png(buffer, 'level-up.png');
}
export async function profileInventoryPanel(guildId, userId, category = 'all', selectedId, user) {
    const [inventory, settings, pet] = await Promise.all([getProfileInventory(guildId, userId), getProfileSettings(userId), category === 'pets' ? getRpgPet(guildId, userId) : Promise.resolve(undefined)]);
    const owned = new Map(inventory.map((entry) => [entry.itemId, entry.quantity]));
    const matching = profileShopItems.filter((item) => item.type !== 'pet' && owned.has(item.id) && (category === 'all' || item.category === category));
    const selected = matching.find((item) => item.id === selectedId) ?? matching[0];
    const equippedIds = new Set([settings.profileBg, settings.rankBg, settings.walletBg, settings.levelupBg, settings.tag, settings.frame, settings.sticker, settings.housing].filter(Boolean));
    const activeBadges = await equippedProfileBadges(userId);
    activeBadges.forEach((id) => equippedIds.add(id));
    const info = category === 'pets' ? (pet ? `🐾 **${pet.name}** · ${pet.species} · ${pet.rarity}\nNivel ${pet.level} · ${pet.element} · ${pet.specialization}\nLas mascotas se adoptan y entrenan en el módulo RPG.` : 'Todavía no tienes una mascota activa. Adopta una en el módulo RPG.') : (selected ? `${selected.emoji} **${selected.name}** · ${selected.rarity}\n${selected.description}\n${equippedIds.has(selected.id) ? '✅ Equipado' : 'En tu inventario'}${owned.get(selected.id) > 1 ? ` · x${owned.get(selected.id)}` : ''}` : 'Aún no tienes cosméticos de esta categoría. Explora la tienda para conseguirlos.');
    const container = new ContainerBuilder().setAccentColor(0x4ba886).addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🎒 INVENTARIO\n${inventory.reduce((sum, item) => sum + item.quantity, 0)} artículos · elige uno para previsualizar o equipar.\n\n${info}`));
    if (selected)
        container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://inventory-preview.png').setDescription(`Vista previa ${selected.name}`)));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(pid(userId, `inventory-category:${category}`)).setPlaceholder('Filtrar inventario').addOptions(profileShopCategories.map((entry) => ({ label: entry.label, value: entry.id, emoji: entry.emoji, default: category === entry.id })))));
    if (matching.length)
        container.addActionRowComponents(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(pid(userId, `inventory-item:${category}`)).setPlaceholder('Selecciona un artículo').addOptions(matching.slice(0, 25).map((item) => ({ label: item.name, value: item.id, description: `${item.rarity} · ${equippedIds.has(item.id) ? 'equipado' : 'disponible'}`, emoji: item.emoji, default: selected?.id === item.id })))));
    const rows = [];
    if (category === 'pets')
        rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(pid(userId, 'rpg')).setLabel(pet ? 'Ver y entrenar mascota' : 'Adoptar mascota').setEmoji('🐾').setStyle(ButtonStyle.Success)));
    if (selected && selected.type !== 'badge')
        rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(pid(userId, `equip:${selected.id}`)).setLabel('Equipar').setEmoji('✅').setStyle(ButtonStyle.Success).setDisabled(equippedIds.has(selected.id)), new ButtonBuilder().setCustomId(pid(userId, `unequip:${selected.type}`)).setLabel('Desequipar ranura').setEmoji('➖').setStyle(ButtonStyle.Secondary)));
    if (selected?.type === 'badge')
        rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(pid(userId, `equip:${selected.id}`)).setLabel('Equipar badge').setEmoji('🏅').setStyle(ButtonStyle.Success).setDisabled(equippedIds.has(selected.id)), new ButtonBuilder().setCustomId(pid(userId, 'unequip:badge')).setLabel('Quitar badges').setEmoji('➖').setStyle(ButtonStyle.Secondary)));
    rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(pid(userId, 'shop')).setLabel('Ir a tienda').setEmoji('🛒').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId(pid(userId, 'customize')).setLabel('Personalizar').setEmoji('🎨').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId(pid(userId, 'home')).setLabel('Perfil').setEmoji('↩️').setStyle(ButtonStyle.Secondary)));
    for (const row of rows)
        container.addActionRowComponents(row);
    const response = { components: [container], flags: ['IsComponentsV2', 'Ephemeral'] };
    return selected ? { ...response, files: [png(await previewCard(guildId, userId, settings, selected, user), 'inventory-preview.png')] } : response;
}
export async function profileShopPanel(guildId, userId, category = 'all', query = '', selectedId, user) {
    const [settings, inventory, account] = await Promise.all([getProfileSettings(userId), getProfileInventory(guildId, userId), getAccountBalances(guildId, userId)]);
    const owned = new Set(inventory.map((entry) => entry.itemId));
    const matching = profileShopItems.filter((item) => item.type !== 'pet' && (category === 'all' || item.category === category) && (!query || `${item.name} ${item.description} ${item.rarity}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())));
    const selected = matching.find((item) => item.id === selectedId) ?? matching[0];
    const details = category === 'pets' ? 'Las mascotas se consiguen con el sistema RPG: adopción de especies, rarezas, entrenamiento y combates. Abre el panel RPG para ver y adoptar.' : selected ? `${selected.emoji} **${selected.name}** · ${selected.rarity}\n${selected.description}\nPrecio: **${money.format(selected.price)} monedas**${owned.has(selected.id) ? ' · Ya lo tienes' : ''}` : 'No hay artículos que coincidan. Prueba otra categoría o búsqueda.';
    const container = new ContainerBuilder().setAccentColor(0x8b75dc).addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🛒 TIENDA DE PERFIL\nBilletera: **${money.format(account.wallet)}** · vista previa antes de comprar.\n\n${details}`));
    if (selected)
        container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://shop-preview.png').setDescription(`Vista previa de ${selected.name}`)));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(pid(userId, `shop-category:${category}`)).setPlaceholder('Categorías de decoración').addOptions(profileShopCategories.map((entry) => ({ label: entry.label, value: entry.id, emoji: entry.emoji, default: category === entry.id })))));
    if (matching.length)
        container.addActionRowComponents(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(pid(userId, `shop-item:${category}:${encodeURIComponent(query).slice(0, 40)}`)).setPlaceholder('Elige un artículo para previsualizar').addOptions(matching.slice(0, 25).map((item) => ({ label: item.name, value: item.id, description: `${money.format(item.price)} monedas · ${item.rarity}`, emoji: item.emoji, default: selected?.id === item.id })))));
    const actionRow = new ActionRowBuilder();
    actionRow.addComponents(new ButtonBuilder().setCustomId(pid(userId, 'search')).setLabel('Búsqueda avanzada').setEmoji('🔎').setStyle(ButtonStyle.Secondary));
    if (category === 'pets')
        actionRow.addComponents(new ButtonBuilder().setCustomId(pid(userId, 'rpg')).setLabel('Abrir RPG').setEmoji('🐾').setStyle(ButtonStyle.Success));
    if (selected)
        actionRow.addComponents(owned.has(selected.id) ? new ButtonBuilder().setCustomId(pid(userId, `equip:${selected.id}`)).setLabel('Equipar').setEmoji('✅').setStyle(ButtonStyle.Success) : new ButtonBuilder().setCustomId(pid(userId, `buy:${selected.id}`)).setLabel(`Comprar · ${selected.price}`).setEmoji('🪙').setStyle(ButtonStyle.Success));
    actionRow.addComponents(new ButtonBuilder().setCustomId(pid(userId, 'inventory')).setLabel('Inventario').setEmoji('🎒').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId(pid(userId, 'home')).setLabel('Perfil').setEmoji('↩️').setStyle(ButtonStyle.Secondary));
    container.addActionRowComponents(actionRow);
    const response = { components: [container], flags: ['IsComponentsV2', 'Ephemeral'] };
    return selected ? { ...response, files: [png(await previewCard(guildId, userId, settings, selected, user), 'shop-preview.png')] } : response;
}
export async function profileRoomPanel(guildId, userId, user) {
    const settings = await getProfileSettings(userId);
    const house = profileItem(settings.housing);
    const container = new ContainerBuilder().setAccentColor(0x467658).addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🏠 ROOM CARD\n${house ? `${house.emoji} **${house.name}**\n${house.description}` : 'Tu habitación está vacía. Consigue housing en la tienda de perfil.'}\n\nEl housing es una decoración aparte de tu Profile Card.`))
        .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://room-card.png').setDescription('Tu room card')))
        .addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(pid(userId, 'shop-category:housing')).setLabel('Ver housing').setEmoji('🛒').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId(pid(userId, 'inventory-category:housing')).setLabel('Inventario housing').setEmoji('🎒').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId(pid(userId, 'home')).setLabel('Perfil').setEmoji('↩️').setStyle(ButtonStyle.Secondary)));
    const buffer = await selfCard(guildId, userId, 'room', settings, user);
    return { components: [container], files: [png(buffer, 'room-card.png')], flags: ['IsComponentsV2', 'Ephemeral'] };
}
async function selfCard(guildId, userId, mode, settingsOverride, user) {
    const [settings, progress, account, badges, pet] = await Promise.all([settingsOverride ? Promise.resolve(settingsOverride) : getProfileSettings(userId), getProfileProgress(guildId, userId), getAccountBalances(guildId, userId), equippedProfileBadges(userId), getRpgPet(guildId, userId)]);
    const username = user?.username ?? `Usuario ${userId.slice(-4)}`;
    const avatarUrl = user?.displayAvatarURL({ extension: 'png', size: 256 }) ?? '';
    return renderProfileCard({ mode, userId, username, avatarUrl, settings, progress, wallet: account.wallet, bank: account.bank, premium: account.premium, badges, ...(pet?.name ? { petName: pet.name } : {}) });
}
async function previewCard(guildId, userId, settings, item, user) {
    const preview = { ...settings };
    const slot = { profile_bg: 'profileBg', rank_bg: 'rankBg', wallet_bg: 'walletBg', levelup_bg: 'levelupBg', frame: 'frame', tag: 'tag', sticker: 'sticker', housing: 'housing' };
    const key = slot[item.type];
    if (key)
        preview[key] = item.id;
    const [progress, account, badges, pet] = await Promise.all([getProfileProgress(guildId, userId), getAccountBalances(guildId, userId), equippedProfileBadges(userId), getRpgPet(guildId, userId)]);
    return renderProfileCard({ mode: item.type === 'wallet_bg' ? 'wallet' : item.type === 'rank_bg' ? 'rank' : item.type === 'levelup_bg' ? 'levelup' : item.type === 'housing' ? 'room' : 'profile', userId, username: user?.username ?? 'Vista previa', avatarUrl: user?.displayAvatarURL({ extension: 'png', size: 256 }) ?? '', settings: preview, progress, wallet: account.wallet, bank: account.bank, premium: account.premium, badges, ...(pet?.name ? { petName: pet.name } : {}) });
}
