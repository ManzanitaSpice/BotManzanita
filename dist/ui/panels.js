import { AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, SeparatorBuilder, SeparatorSpacingSize, StringSelectMenuBuilder, TextDisplayBuilder, ThumbnailBuilder, } from 'discord.js';
import { getPersistedMusicQueue } from '../storage/music-queue-store.js';
import { profileShopCategories } from '../data/profile-shop.js';
import { bankAction, DAILY_AMOUNT, getAccountBalances, getBalance, getInventory, getJobRoster, JOB_XP_PER_SHIFT, MAX_JOB_LEVEL, storeItems } from '../services/economy.js';
import { getExpeditionLogPage, getLearnableRpgMoves, getRpgInventory, getRpgLeaderboard, getRpgMove, getRpgPet, getRpgQuests, RPG_COIN_REWARD_SCALE, RPG_DAILY_XP_CAP, RPG_EXPLORE_COOLDOWN, rpgItems, rpgZones } from '../services/rpg.js';
import { filterStoreCatalog, getStoreSnapshot, storeCategoryOptions } from '../services/store.js';
import { renderEggCard, renderPetCard, renderPvpDuelCard, rpgEggOptions } from './rpg-art.js';
import { renderProfileCard } from './profile-cards.js';
import { equippedProfileBadges, getProfileProgress, getProfileSettings, profileItem } from '../services/profile.js';
const colors = { music: 0x8b5cf6, economy: 0x22c55e };
const money = new Intl.NumberFormat('es-MX');
export function listPanel(title, subtitle, entries, accent = colors.economy, emptyMessage = 'Todavía no hay elementos para mostrar.', ephemeral = true) {
    const rows = entries.length ? entries.map((entry) => `›  ${entry}`).join('\n') : `_ ${emptyMessage} _`;
    const container = new ContainerBuilder().setAccentColor(accent)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${title}\n${subtitle}`))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(rows));
    return { components: [container], flags: ephemeral ? ['IsComponentsV2', 'Ephemeral'] : ['IsComponentsV2'] };
}
export function balancePanel(username, account, ephemeral = true) {
    const container = new ContainerBuilder().setAccentColor(colors.economy)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 💰 BALANCE\nPatrimonio de **${username}**`))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`👛 **Billetera**\n${money.format(account.wallet)} monedas\n\n🏦 **Banco**\n${money.format(account.bank)} monedas\n\n✨ **Patrimonio total**\n${money.format(account.total)} monedas\n\n💎 **Gemas premium**\n${money.format(account.premium)}`));
    return { components: [container], flags: ephemeral ? ['IsComponentsV2', 'Ephemeral'] : ['IsComponentsV2'] };
}
export function economyActionPanel(title, narrative, amount, balance, ephemeral = true) {
    const won = amount > 0;
    const lost = amount < 0;
    const outcome = amount > 0
        ? `## +${money.format(amount)} monedas\nGanancia`
        : amount < 0
            ? `## −${money.format(Math.abs(amount))} monedas\nPérdida`
            : '## Sin ganancia esta vez';
    const container = new ContainerBuilder().setAccentColor(won ? 0x22c55e : lost ? 0xef4444 : 0x38bdf8)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${title}\n${narrative}`))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${outcome}\n\n💰 **Saldo actual**　${money.format(balance)} monedas`));
    return { components: [container], flags: ephemeral ? ['IsComponentsV2', 'Ephemeral'] : ['IsComponentsV2'] };
}
export function leaderboardPanel(title, subtitle, entries, accent = colors.economy, emptyMessage = 'Todavía no hay resultados para mostrar.', ephemeral = false) {
    const rows = entries.length ? entries.map((entry, index) => {
        const medal = ['🥇', '🥈', '🥉'][index] ?? `**${String(index + 1).padStart(2, '0')}.**`;
        return `${medal}  ${entry}`;
    }).join('\n') : `_ ${emptyMessage} _`;
    const container = new ContainerBuilder().setAccentColor(accent)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${title}\n${subtitle}`))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(rows));
    return { components: [container], flags: ephemeral ? ['IsComponentsV2', 'Ephemeral'] : ['IsComponentsV2'] };
}
export function componentUpdate(panel) {
    return { components: panel.components, attachments: [], ...(panel.files ? { files: panel.files } : {}), flags: ['IsComponentsV2'] };
}
export async function economyPanel(guildId, userId, username = `Usuario ${userId.slice(-4)}`, avatarUrl = '') {
    const [account, settings, progress, badges] = await Promise.all([
        getAccountBalances(guildId, userId), getProfileSettings(userId), getProfileProgress(guildId, userId), equippedProfileBadges(userId),
    ]);
    const walletCard = await renderProfileCard({ mode: 'wallet', userId, username, avatarUrl, settings, progress,
        wallet: account.wallet, bank: account.bank, premium: account.premium, badges });
    const walletTheme = profileItem(settings.walletBg)?.color ?? (settings.accent.toLocaleLowerCase() === '#8b75dc' ? '#0876d8' : settings.accent);
    const container = new ContainerBuilder()
        .setAccentColor(Number.parseInt(walletTheme.slice(1), 16) || 0x0876d8)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 💰 ECONOMÍA\nMonedas y gemas premium\n🎁 Recompensa diaria: **+${money.format(DAILY_AMOUNT)} monedas**`))
        .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://economy-wallet.png').setDescription(`Wallet de ${username}`)))
        .addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('eco:daily').setLabel('Reclamar diaria').setEmoji('🎁').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('eco:store').setLabel('Tienda').setEmoji('🛍️').setStyle(ButtonStyle.Primary)))
        .addActionRowComponents(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('eco:section').setPlaceholder('Más opciones de economía').addOptions({ label: 'Inventario', value: 'inventory', emoji: '🎒', description: 'Revisar y usar tus objetos' }, { label: 'Banco de monedas', value: 'bank', emoji: '🏦', description: 'Guardar o retirar tus monedas' }, { label: 'Casino', value: 'casino', emoji: '🎰', description: 'Juegos y apuestas' }, { label: 'Tienda completa', value: 'store', emoji: '🛍️', description: 'Herramientas, consumibles, personalización y RPG' })));
    return { components: [container], files: [new AttachmentBuilder(walletCard).setName('economy-wallet.png')], flags: ['IsComponentsV2', 'Ephemeral'] };
}
export async function jobsPanel(guildId, userId, notice = '') {
    const [roster, inventory] = await Promise.all([getJobRoster(guildId, userId), getInventory(guildId, userId)]);
    const owned = new Set(inventory.filter((item) => item.quantity > 0).map((item) => item.itemId));
    const activeJobs = roster.jobs.filter((entry) => entry.active);
    const activeSummary = activeJobs.length
        ? activeJobs.map((entry) => `› ${entry.job.emoji} **${entry.job.name} · nivel ${entry.level}**${entry.level >= MAX_JOB_LEVEL ? ' · máximo' : ` · ${entry.xp}/${entry.xpToNext} XP`}${entry.job.id === roster.primaryJobId ? ' · en uso con a!work' : ''}`).join('\n')
        : 'Todavía no tienes un oficio elegido. Selecciona uno abajo.';
    const jobList = roster.jobs.map((entry) => {
        const { job, level, xp, xpToNext } = entry;
        const payBonus = Math.min(level - 1, MAX_JOB_LEVEL - 1) * 3;
        const progress = level >= MAX_JOB_LEVEL ? 'nivel máximo' : `${xp}/${xpToNext} XP`;
        const toolCost = storeItems.find((item) => item.id === job.toolId)?.cost;
        const tool = owned.has(job.toolId) ? '✅ herramienta disponible' : `🛒 ${job.toolName} · ${toolCost === undefined ? 'precio por confirmar' : `${money.format(toolCost)} monedas`} en a!shop`;
        return `${job.emoji} **${job.name} · Nv. ${level}** (${progress})\nPaga: **${money.format(job.minPay + payBonus)}–${money.format(job.maxPay + payBonus)}** monedas · ${tool}`;
    }).join('\n\n');
    const container = new ContainerBuilder().setAccentColor(colors.economy)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🧰 OFICIOS\nElige el trabajo con el que quieres generar monedas. Cada turno de trabajo da **${JOB_XP_PER_SHIFT} XP** y el pago aumenta con cada nivel.${notice ? `\n\n${notice}` : ''}`))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## Plazas de trabajo · ${roster.activeCount}/${roster.slotLimit}\n${activeSummary}\n\n${roster.secondSlotUnlocked
        ? '🔓 Alcanzaste el nivel máximo en un oficio: tienes **dos plazas**. Si ambas están ocupadas, se prioriza conservar el oficio al máximo y el más reciente; el progreso de los demás también queda guardado.'
        : `🔒 Llega al nivel ${MAX_JOB_LEVEL} en cualquier oficio para desbloquear una segunda plaza.`}`))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## Trabajos disponibles\n${jobList}\n\nUsa **a!work** para cobrar. Necesitas la herramienta indicada; puedes comprarla con **a!shop**. Renuncia con **a!renunciar [oficio]**; el nivel y la experiencia quedan guardados.`))
        .addActionRowComponents(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`jobs:select:${userId}`).setPlaceholder('Elegir o cambiar de trabajo').addOptions(roster.jobs.map((entry) => ({
        label: `${entry.job.name} · Nv. ${entry.level}`,
        value: entry.job.id,
        emoji: entry.job.emoji,
        description: `${entry.level >= MAX_JOB_LEVEL ? 'Nivel máximo' : `${entry.xp}/${entry.xpToNext} XP`} · ${owned.has(entry.job.toolId) ? 'herramienta disponible' : `requiere ${entry.job.toolName}`}`.slice(0, 100),
        default: entry.job.id === roster.primaryJobId,
    })))));
    return { components: [container], flags: ['IsComponentsV2'] };
}
function statBar(value, max, width = 10) {
    const filled = Math.max(0, Math.min(width, Math.round((value / Math.max(1, max)) * width)));
    return `${'▰'.repeat(filled)}${'▱'.repeat(width - filled)}`;
}
export async function rpgPanel(guildId, userId, username) {
    const pet = await getRpgPet(guildId, userId);
    const container = new ContainerBuilder().setAccentColor(pet ? { 'Común': 0x94a3b8, 'Poco común': 0x22c55e, 'Raro': 0x3b82f6, 'Épico': 0xa855f7, 'Legendario': 0xf59e0b }[pet.rarity] : 0x14b8a6);
    if (!pet)
        return rpgAdoptionPanel(username, 'Fuego');
    const inventory = await getRpgInventory(guildId, userId);
    const foods = inventory.map((entry) => ({ entry, item: rpgItems.find((candidate) => candidate.id === entry.itemId && candidate.effect === 'snack') })).filter((row) => row.item);
    const xpNext = 100 + (pet.level - 1) * 45;
    const currentTime = Math.floor(Date.now() / 1000);
    const exploreReady = !pet.lastExploreAt || pet.lastExploreAt + RPG_EXPLORE_COOLDOWN <= currentTime;
    const restStatus = !exploreReady ? `⏳ Descansando · disponible <t:${pet.lastExploreAt + RPG_EXPLORE_COOLDOWN}:R>` : '🟢 Lista para explorar';
    const profileArt = { ...rpgZones[0], emoji: '🐾', name: 'Ficha de compañera', difficulty: `Nivel ${pet.level}` };
    const petCard = await renderPetCard(pet, rpgZones[0].background, profileArt, xpNext);
    container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://rpg-pet-card.png').setDescription(`${pet.name}, ${pet.species} · tarjeta de mascota`)))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🐾 FICHA RPG\n**${pet.name}** · ${pet.species} · ${pet.rarity} · nivel ${pet.level}\n${restStatus} · 📘 XP de exploración hoy ${pet.dailyXp}/${RPG_DAILY_XP_CAP}\n${foods.length ? '🍓 Elige un alimento de abajo para darle de comer.' : '🍓 No tienes comida; consigue alimento en la tienda.'}`));
    if (foods.length)
        container.addActionRowComponents(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('rpg:feed:select').setPlaceholder(`Alimentar a ${pet.name}`).addOptions(foods.slice(0, 25).map(({ entry, item }) => ({
            label: `${item.name} · x${entry.quantity}`, value: entry.itemId, emoji: item.emoji, description: item.description.slice(0, 100),
        })))));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('rpg:care').setLabel('Acariciar').setEmoji('🫶').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('rpg:shop').setLabel('Tienda').setEmoji('🛍️').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('rpg:exploration:open').setLabel('Explorar').setEmoji('🧭').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('rpg:logs:0').setLabel('Bitácora').setEmoji('📜').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('rpg:menu:home').setLabel('Menú RPG').setEmoji('📋').setStyle(ButtonStyle.Secondary)));
    return { components: [container], files: [petCard], flags: ['IsComponentsV2', 'Ephemeral'] };
}
export async function rpgExplorePanel(guildId, userId, username, requestedZoneId) {
    const pet = await getRpgPet(guildId, userId);
    if (!pet)
        return rpgAdoptionPanel(username, 'Fuego');
    const zone = rpgZones.find((candidate) => candidate.id === requestedZoneId) ?? rpgZones[0];
    const xpNext = 100 + (pet.level - 1) * 45;
    const now = Math.floor(Date.now() / 1000);
    const nextExploreAt = (pet.lastExploreAt ?? 0) + RPG_EXPLORE_COOLDOWN;
    const exploreReady = !pet.lastExploreAt || nextExploreAt <= now;
    const levelLocked = pet.level < zone.minLevel;
    const status = !exploreReady ? `⏳ Tu mascota descansa hasta <t:${nextExploreAt}:R>.`
        : levelLocked ? `🔒 Esta zona requiere nivel ${zone.minLevel}.`
            : pet.energy < 20 ? '⚡ Necesita al menos 20 de energía.'
                : pet.hunger < 15 ? '🍖 Necesita comer antes de salir.'
                    : '🟢 Lista para salir.';
    const consumption = Math.min(pet.hunger, 20 + Math.floor(zone.minLevel / 2));
    const petCard = await renderPetCard(pet, zone.background, zone, xpNext);
    const container = new ContainerBuilder().setAccentColor(0x14b8a6)
        .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://rpg-pet-card.png').setDescription(`${pet.name} · ${zone.name}`)))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🧭 EXPLORACIÓN\nElige la zona y revisa sus riesgos antes de partir. La expedición se resuelve al instante; después, tu mascota descansa 4 horas.`))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${zone.emoji} ${zone.name}\n**${zone.difficulty}** · nivel ${zone.minLevel}+\n⚠️ Peligro base ${zone.danger}% · 🎁 botín regional ${zone.lootChance}%\n🪙 Recompensa base ${money.format(Math.floor(zone.reward[0] * RPG_COIN_REWARD_SCALE))}–${money.format(Math.floor(zone.reward[1] * RPG_COIN_REWARD_SCALE))} monedas\n👑 ${zone.boss.emoji} ${zone.boss.name} · aparece ${zone.boss.spawnChance}% · premio ${money.format(Math.floor(zone.boss.reward[0] * RPG_COIN_REWARD_SCALE))}–${money.format(Math.floor(zone.boss.reward[1] * RPG_COIN_REWARD_SCALE))} monedas\n\n${status}\n⚡ Coste: 20 energía · 🍖 consume hasta ${consumption} de saciedad · 📘 XP diaria ${pet.dailyXp}/${RPG_DAILY_XP_CAP}`))
        .addActionRowComponents(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('rpg:exploration:zone').setPlaceholder('Elegir zona').addOptions(rpgZones.map((candidate) => ({
        label: `${candidate.name} · Nv. ${candidate.minLevel}+`, value: candidate.id, emoji: candidate.emoji,
        description: `${candidate.difficulty} · peligro ${candidate.danger}% · botín ${candidate.lootChance}%`, default: candidate.id === zone.id,
    })))))
        .addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`rpg:explore:${zone.id}`).setLabel('Iniciar expedición').setEmoji('🧭').setStyle(ButtonStyle.Success)
        .setDisabled(!exploreReady || levelLocked || pet.energy < 20 || pet.hunger < 15), new ButtonBuilder().setCustomId('rpg:logs:0').setLabel('Bitácora').setEmoji('📜').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('rpg:profile').setLabel('Ficha').setEmoji('🐾').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('rpg:menu:home').setLabel('Menú').setEmoji('📋').setStyle(ButtonStyle.Secondary)));
    return { components: [container], files: [petCard], flags: ['IsComponentsV2', 'Ephemeral'] };
}
export async function expeditionLogPanel(guildId, userId, requestedPage = 0) {
    const pageSize = 1;
    const requested = Math.max(0, Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 0);
    let page = requested;
    let snapshot = await getExpeditionLogPage(guildId, userId, pageSize, page * pageSize);
    const pageCount = Math.max(1, Math.ceil(snapshot.total / pageSize));
    page = Math.min(page, pageCount - 1);
    if (page !== requested)
        snapshot = await getExpeditionLogPage(guildId, userId, pageSize, page * pageSize);
    const log = snapshot.logs[0];
    const container = new ContainerBuilder().setAccentColor(0x0ea5a4);
    if (!log) {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent('# 📜 BITÁCORA DE EXPLORACIÓN\n\nTodavía no hay expediciones registradas. Elige una zona, prepara a tu mascota y parte cuando esté lista.'))
            .addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('rpg:exploration:open').setLabel('Elegir zona').setEmoji('🧭').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('rpg:profile').setLabel('Ficha').setEmoji('🐾').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('rpg:menu:home').setLabel('Menú RPG').setEmoji('📋').setStyle(ButtonStyle.Secondary)));
        return { components: [container], flags: ['IsComponentsV2', 'Ephemeral'] };
    }
    const recordNumber = snapshot.total - page * pageSize;
    const hadSetback = log.events.some((event) => event.title === 'Un contratiempo' || event.title.startsWith('Jefe avistado'));
    const outcome = hadSetback ? '⚠️ Expedición con contratiempos' : '✅ Expedición completada';
    const itemName = log.itemId ? rpgItems.find((item) => item.id === log.itemId)?.name ?? log.itemId : undefined;
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 📜 BITÁCORA DE EXPLORACIÓN\n**${outcome}** · ${recordNumber} de ${snapshot.total}\n🗺️ ${log.zoneName} · <t:${log.createdAt}:F>`))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🎁 Recompensas\n🪙 **${money.format(log.coins)} monedas**　·　📘 **${log.xp} XP**${itemName ? `\n📦 Hallazgo: **${itemName}**` : '\n🔎 Sin objeto especial en esta salida.'}`))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🧭 Recorrido'));
    for (const [index, event] of log.events.entries()) {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**${String(index + 1).padStart(2, '0')}　${event.emoji} ${event.title}**\n${event.detail}`));
        if (index < log.events.length - 1)
            container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    }
    container.addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`rpg:logs:previous:${Math.max(0, page - 1)}`).setLabel('Más recientes').setEmoji('◀️').setStyle(ButtonStyle.Secondary).setDisabled(page === 0), new ButtonBuilder().setCustomId(`rpg:logs:next:${Math.min(pageCount - 1, page + 1)}`).setLabel('Anteriores').setEmoji('▶️').setStyle(ButtonStyle.Secondary).setDisabled(page + 1 >= pageCount), new ButtonBuilder().setCustomId('rpg:exploration:open').setLabel('Nueva expedición').setEmoji('🧭').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('rpg:profile').setLabel('Ficha').setEmoji('🐾').setStyle(ButtonStyle.Primary)));
    return { components: [container], flags: ['IsComponentsV2', 'Ephemeral'] };
}
export async function rpgMenuPanel(guildId, userId) {
    const pet = await getRpgPet(guildId, userId);
    const status = pet ? `🐾 **${pet.name}** · Nv. ${pet.level} · 🍖 ${pet.hunger}/100 · 🫶 ${pet.affection}/100` : '🥚 Aún no tienes mascota. Adopta una desde **Mascota y stats**.';
    const container = new ContainerBuilder().setAccentColor(0x8b5cf6)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🐾 GREMIO RPG\n${status}\n\nElige una sección para continuar.`))
        .addActionRowComponents(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('rpg:menu:category').setPlaceholder('Abrir una categoría').addOptions({ label: 'Mascota', value: 'pet', emoji: '🐾', description: 'Tarjeta, nivel y estadísticas' }, { label: 'Aventura', value: 'explore', emoji: '📜', description: 'Bitácora de expediciones' }, { label: 'Combate', value: 'battle', emoji: '⚔️', description: 'PvE y build de ataques' }, { label: 'Mochila', value: 'inventory', emoji: '🎒', description: 'Objetos y equipo' }, { label: 'Artículos RPG', value: 'shop', emoji: '🛍️', description: 'Comida, equipo y consumibles' }, { label: 'Misiones', value: 'missions', emoji: '📜', description: 'Encargos diarios y recompensas' }, { label: 'Gestión', value: 'manage', emoji: '⚙️', description: 'Entrenamiento y nombre de mascota' }, { label: 'PvP y ranking', value: 'social', emoji: '🏆', description: 'Retos y clasificación global' })));
    return { components: [container], flags: ['IsComponentsV2', 'Ephemeral'] };
}
export async function rpgManagePanel(guildId, userId) {
    const pet = await getRpgPet(guildId, userId);
    const container = new ContainerBuilder().setAccentColor(0x64748b)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ⚙️ GESTIÓN DE MASCOTA\n${pet ? `**${pet.name}** · fuerza ${pet.strength} · ${pet.freeNameUsed ? 'cambio de nombre usado' : 'un cambio de nombre gratis disponible'}` : 'Primero adopta una mascota.'}\n\nEntrena para mejorar sus atributos o usa el cambio gratuito de nombre.`));
    if (pet)
        container.addActionRowComponents(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('rpg:manage').setPlaceholder('Elegir acción').addOptions({ label: 'Entrenar fuerza', value: 'train', emoji: '🏋️', description: 'Cuesta monedas y energía' }, { label: pet.freeNameUsed ? 'Cambio gratuito usado' : 'Nombrar mascota', value: 'name', emoji: '🏷️', description: pet.freeNameUsed ? 'Ya cambiaste el nombre gratis' : 'Renombra a tu compañera una vez' })));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('rpg:menu:home').setLabel('Menú RPG').setEmoji('↩️').setStyle(ButtonStyle.Secondary)));
    return { components: [container], flags: ['IsComponentsV2', 'Ephemeral'] };
}
export async function rpgPvPHelpPanel(guildId) {
    const ranking = await getRpgLeaderboard(guildId);
    const rows = ranking.slice(0, 3).map((pet, index) => `${['🥇', '🥈', '🥉'][index]} <@${pet.userId}> · **${pet.name}** · Nv. ${pet.level}`);
    const container = new ContainerBuilder().setAccentColor(0xef4444)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🥊 RETOS RPG\nDesafía a otra persona a un duelo por turnos. Ambos necesitan tener una mascota.\n\n**Comandos**\n\`/rpg retar\` · elegir oponente\n\`a!rpg pvp @persona\` · reto rápido${rows.length ? `\n\n## 🏆 Mejores aventureros\n${rows.join('\n')}` : ''}`))
        .addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('rpg:menu:home').setLabel('Menú RPG').setEmoji('↩️').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('rpg:ranking').setLabel('Ranking').setEmoji('🏆').setStyle(ButtonStyle.Primary)));
    return { components: [container], flags: ['IsComponentsV2', 'Ephemeral'] };
}
export async function rpgCombatPanel(guildId, userId) {
    const pet = await getRpgPet(guildId, userId);
    const container = new ContainerBuilder().setAccentColor(0xef4444)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ⚔️ COMBATE RPG${pet ? ` · ${pet.name} Nv. ${pet.level}` : ''}\n${pet ? `❤️ ${pet.hp}/${pet.maxHp} PV · ⚡ ${pet.energy}/${pet.maxEnergy} energía · 🍖 ${pet.hunger}/100 saciedad` : 'Primero adopta una mascota para participar en combate.'}\n\nCombate PvE consume energía y puede reducir PV. Tu build determina las técnicas disponibles en PvP.`))
        .addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('rpg:battle').setLabel('Combatir PvE').setEmoji('⚔️').setStyle(ButtonStyle.Danger).setDisabled(!pet || pet.hp <= 0 || pet.energy < 10), new ButtonBuilder().setCustomId('rpg:build').setLabel('Preparar build').setEmoji('📘').setStyle(ButtonStyle.Primary).setDisabled(!pet), new ButtonBuilder().setCustomId('rpg:menu:home').setLabel('Menú RPG').setEmoji('↩️').setStyle(ButtonStyle.Secondary)));
    return { components: [container], flags: ['IsComponentsV2', 'Ephemeral'] };
}
export async function rpgRankingPanel(guildId) {
    const ranking = await getRpgLeaderboard(guildId);
    const rows = ranking.map((pet) => `<@${pet.userId}> · **${pet.name}** · ${pet.rarity} · Nv. ${pet.level}`);
    const panel = leaderboardPanel('🏆 RANKING RPG', 'Mascotas con más nivel · global', rows, 0x8b5cf6, 'Aún no hay mascotas registradas.');
    const container = panel.components[0];
    container.addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('rpg:menu:home').setLabel('Menú RPG').setEmoji('↩️').setStyle(ButtonStyle.Secondary)));
    return panel;
}
export async function rpgInventoryPanel(guildId, userId) {
    const [pet, inventory] = await Promise.all([getRpgPet(guildId, userId), getRpgInventory(guildId, userId)]);
    const entries = inventory.map((entry) => ({ entry, item: rpgItems.find((candidate) => candidate.id === entry.itemId) })).filter((row) => row.item);
    const text = entries.slice(0, 8).map(({ entry, item }) => `${item.emoji} **${item.name}** ×${entry.quantity} · ${item.rarity}\n${item.description}`).join('\n\n');
    const container = new ContainerBuilder().setAccentColor(0x16a085)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🎒 MOCHILA${pet ? ` · ${pet.name}` : ''}\n${inventory.reduce((sum, entry) => sum + entry.quantity, 0)} objetos\n\n${text || '_Aún no tienes objetos. Encuentra botín explorando o visita la tienda._'}`));
    if (entries.length)
        container.addActionRowComponents(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('rpg:use').setPlaceholder('Usar o equipar un objeto').addOptions(entries.slice(0, 25).map(({ entry, item }) => ({ label: `${item.name} · x${entry.quantity}`, value: entry.itemId, emoji: item.emoji, description: item.description.slice(0, 100) })))));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('rpg:shop').setLabel('Tienda').setEmoji('🛍️').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('rpg:panel').setLabel('Mi mascota').setEmoji('🐾').setStyle(ButtonStyle.Secondary)));
    return { components: [container], flags: ['IsComponentsV2', 'Ephemeral'] };
}
export async function rpgFeedPanel(guildId, userId) {
    const [pet, inventory] = await Promise.all([getRpgPet(guildId, userId), getRpgInventory(guildId, userId)]);
    const foods = inventory.map((entry) => ({ entry, item: rpgItems.find((candidate) => candidate.id === entry.itemId && candidate.effect === 'snack') })).filter((row) => row.item);
    const container = new ContainerBuilder().setAccentColor(0xf59e0b)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🍓 ALIMENTAR${pet ? ` · ${pet.name}` : ''}\n${pet ? `🍖 Saciedad **${pet.hunger}/100**　🫶 Cariño **${pet.affection}/100**\n\n${foods.length ? 'Elige un alimento de tu mochila.' : 'No tienes comida. Encuentra bayas explorando o compra alimento en la tienda RPG.'}` : 'Primero adopta una mascota.'}`));
    if (foods.length)
        container.addActionRowComponents(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('rpg:feed:select').setPlaceholder('Elegir alimento').addOptions(foods.slice(0, 25).map(({ entry, item }) => ({ label: `${item.name} · x${entry.quantity}`, value: entry.itemId, emoji: item.emoji, description: item.description.slice(0, 100) })))));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('rpg:care').setLabel('Acariciar').setEmoji('🫶').setStyle(ButtonStyle.Secondary).setDisabled(!pet), new ButtonBuilder().setCustomId('rpg:shop').setLabel('Tienda').setEmoji('🛍️').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('rpg:panel').setLabel('Mi mascota').setEmoji('🐾').setStyle(ButtonStyle.Secondary)));
    return { components: [container], flags: ['IsComponentsV2', 'Ephemeral'] };
}
export function rpgCareResultPanel(pet, message) {
    const container = new ContainerBuilder().setAccentColor(0xec79b7)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🫶 UN MOMENTO JUNTOS\n${message}\n\n**${pet.name}** · vínculo **${pet.affection}/100**\n🍖 Saciedad ${statBar(pet.hunger, 100, 12)} **${pet.hunger}/100**`))
        .addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('rpg:panel').setLabel('Volver a mi mascota').setEmoji('🐾').setStyle(ButtonStyle.Secondary)));
    return { components: [container], flags: ['IsComponentsV2', 'Ephemeral'] };
}
export async function rpgMissionsPanel(guildId, userId) {
    const quests = await getRpgQuests(guildId, userId);
    const rows = quests.map((quest) => {
        const marker = quest.claimed ? '✅' : quest.progress >= quest.target ? '🎁' : '▫️';
        return `${marker} **${quest.title}** · ${Math.min(quest.progress, quest.target)}/${quest.target}\n${quest.description} · **${money.format(quest.reward)} monedas**`;
    }).join('\n\n');
    const claimable = quests.filter((quest) => !quest.claimed && quest.progress >= quest.target);
    const container = new ContainerBuilder().setAccentColor(0x8b75dc)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 📜 ENCARGOS DEL GREMIO\n${quests.length} misiones diarias${claimable.length ? ` · ${claimable.length} lista(s) para cobrar` : ''}\n\n${rows || '_Sin encargos disponibles hoy._'}`));
    if (claimable.length)
        container.addActionRowComponents(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('rpg:mission:claim').setPlaceholder('Cobrar recompensa').addOptions(claimable.map((quest) => ({ label: quest.title, value: quest.id, description: `${money.format(quest.reward)} monedas` })))));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('rpg:panel').setLabel('Mi mascota').setEmoji('🐾').setStyle(ButtonStyle.Secondary)));
    return { components: [container], flags: ['IsComponentsV2', 'Ephemeral'] };
}
export async function rpgAdoptionPanel(username, selectedElement = 'Fuego', notice = '') {
    const option = rpgEggOptions.find((entry) => entry.element === selectedElement) ?? rpgEggOptions[0];
    const card = await renderEggCard(username, option.element);
    const container = new ContainerBuilder().setAccentColor(0x14b8a6)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🥚 INCUBADORA DEL GREMIO\n${notice ? `${notice}\n\n` : ''}Elige una afinidad. La mascota sale al azar entre las especies de ese elemento.`))
        .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://rpg-egg-selection.png').setDescription(`${option.title} · afinidad ${option.element}`)))
        .addActionRowComponents(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('rpg:egg:element').setPlaceholder('Selecciona un huevo elemental')
        .addOptions(rpgEggOptions.map((entry) => ({ label: `${entry.title} · ${entry.element}`, value: entry.element, emoji: entry.emoji, description: entry.flavor, default: entry.element === option.element })))))
        .addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`rpg:hatch:${option.element}`).setLabel(`Eclosionar · ${option.element}`).setEmoji('🐾').setStyle(ButtonStyle.Success)));
    return { components: [container], files: [card], flags: ['IsComponentsV2', 'Ephemeral'] };
}
export async function rpgBuildPanel(guildId, userId) {
    const pet = await getRpgPet(guildId, userId);
    const container = new ContainerBuilder().setAccentColor(0x7c3aed);
    if (!pet)
        return { components: [container.addTextDisplayComponents(new TextDisplayBuilder().setContent('# 📘 BUILD DE COMBATE\nPrimero elige un huevo en `/rpg panel`.'))], flags: ['IsComponentsV2', 'Ephemeral'] };
    const moves = pet.knownMoves.map((id) => getRpgMove(id)).filter((move) => Boolean(move));
    const learnable = getLearnableRpgMoves(pet);
    const equippedNames = pet.equippedMoves.map((id) => getRpgMove(id)).filter((move) => Boolean(move)).map((move) => `**${move.name}** · ${move.element} · poder ${move.power} · precisión ${move.accuracy}% · ⚡${move.energy}`).join('\n') || 'Sin ataques equipados';
    const knownNames = moves.map((move) => `${move.element === 'Neutral' ? '⚪' : '✨'} **${move.name}** · Nv. ${move.minLevel} · ${move.description}`).join('\n') || 'Todavía no conoce ataques.';
    const learnNames = learnable.map((move) => `▫️ **${move.name}** · Nv. ${move.minLevel} · poder ${move.power} · precisión ${move.accuracy}% · ⚡${move.energy}\n${move.description}`).join('\n') || 'No hay técnicas nuevas disponibles para su nivel, elemento y especialidad.';
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 📘 BUILD · ${pet.name}\nNv. ${pet.level} · ${pet.element} ${pet.specialization} · **${pet.movePoints} pts** · **${pet.equippedMoves.length}/4 equipados**\n\n## ⚔️ Equipados\n${equippedNames}\n\n## 📚 Conocidos\n${knownNames}\n\n## ✨ Desbloqueados\n${learnNames}`));
    if (learnable.length)
        container.addActionRowComponents(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('rpg:move:learn').setPlaceholder('Aprender técnica · cuesta 1 punto').addOptions(learnable.map((move) => ({ label: `${move.name} · Nv. ${move.minLevel}`, value: move.id, emoji: move.element === 'Neutral' ? '📘' : '✨', description: `${move.element} · poder ${move.power} · ⚡${move.energy}` })))));
    if (moves.length)
        container.addActionRowComponents(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('rpg:move:build').setPlaceholder('Selecciona las técnicas equipadas (hasta 4)').setMinValues(1).setMaxValues(Math.min(4, moves.length)).addOptions(moves.map((move) => ({ label: move.name, value: move.id, emoji: move.element === 'Neutral' ? '⚪' : '✨', description: `${move.element} · poder ${move.power} · ${move.effect}`, default: pet.equippedMoves.includes(move.id) })))));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('rpg:panel').setLabel('Volver a mi mascota').setEmoji('↩️').setStyle(ButtonStyle.Secondary)));
    return { components: [container], flags: ['IsComponentsV2', 'Ephemeral'] };
}
export function expeditionPanel(events, summary, hp, maxHp, energy, maxEnergy, hunger, affection) {
    const journal = events.length
        ? events.map((event, index) => `**${String(index + 1).padStart(2, '0')} · ${event.emoji} ${event.title}**\n${event.detail}`).join('\n\n')
        : '_La expedición terminó sin incidentes._';
    const container = new ContainerBuilder().setAccentColor(0x14b8a6)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('# 🧭 REGRESO DE EXPLORACIÓN\nResumen del recorrido y sus hallazgos.'))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(journal))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🏁 Regreso\n${summary}\n\n❤️ **${hp}/${maxHp} PV**  ·  ⚡ **${energy}/${maxEnergy} energía**\n🍖 Saciedad ${statBar(hunger, 100, 8)} **${hunger}/100**  ·  🫶 vínculo **${affection}/100**`))
        .addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('rpg:panel').setLabel('Volver a mi mascota').setEmoji('🐾').setStyle(ButtonStyle.Secondary)));
    return { components: [container], flags: ['IsComponentsV2', 'Ephemeral'] };
}
export async function rpgPvpPanel(match) {
    const [challenger, defender] = match.fighters;
    const duelCard = await renderPvpDuelCard(match);
    const status = match.status === 'pending' ? 'DESAFÍO PENDIENTE · vence en 5 minutos'
        : match.status === 'active' ? `COMBATE · RONDA ${match.round} · turno de <@${match.turnUserId}>`
            : match.status === 'finished' ? `COMBATE TERMINADO · ${match.winnerId ? `gana <@${match.winnerId}>` : 'sin ganador'}`
                : match.status === 'declined' ? 'DESAFÍO RECHAZADO' : 'DESAFÍO VENCIDO';
    const container = new ContainerBuilder().setAccentColor(match.status === 'active' ? 0xef4444 : 0x8b5cf6)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ⚔️ DUELO · ${status}`))
        .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://rpg-pvp-duel.png').setDescription(`${challenger.petName} contra ${defender.petName}`)));
    if (match.status === 'pending') {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`Duelo amistoso · PV y energía simulados.\n<@${match.defenderId}>, acepta o rechaza abajo. <@${match.challengerId}> toma el primer turno.`))
            .addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`rpg:pvp:accept:${match.id}`).setLabel('Aceptar duelo').setEmoji('⚔️').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId(`rpg:pvp:decline:${match.id}`).setLabel('Rechazar').setEmoji('🚫').setStyle(ButtonStyle.Secondary)));
    }
    else if (match.status === 'active') {
        const recentLog = match.log.slice(-4).map((line) => `• ${line}`).join('\n');
        const turnFighter = match.fighters.find((fighter) => fighter.userId === match.turnUserId);
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 📜 Bitácora del duelo\n${recentLog || 'El duelo está por comenzar.'}\n\n**Turno actual:** <@${match.turnUserId}>\nSolo esa persona puede ejecutar las acciones. Este panel es compartido y se actualiza para ambos.`))
            .addActionRowComponents(new ActionRowBuilder().addComponents((turnFighter?.equippedMoves ?? ['quick_tackle']).slice(0, 4).map((id) => { const move = getRpgMove(id); return new ButtonBuilder().setCustomId(`rpg:pvp:move:${match.id}:${match.turnUserId}:${id}`).setLabel(move?.name ?? 'Placaje').setEmoji(move?.element === 'Neutral' ? '⚪' : '✨').setStyle(ButtonStyle.Danger).setDisabled((turnFighter?.energy ?? 0) < (move?.energy ?? 0)); })))
            .addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`rpg:pvp:turn:${match.id}:${match.turnUserId}:guard`).setLabel('Defender').setEmoji('🛡️').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId(`rpg:pvp:turn:${match.id}:${match.turnUserId}:special`).setLabel('Técnica especial').setEmoji('✨').setStyle(ButtonStyle.Success).setDisabled(turnFighter?.specialUsed ?? false), new ButtonBuilder().setCustomId(`rpg:pvp:turn:${match.id}:${match.turnUserId}:surrender`).setLabel('Rendirse').setEmoji('🏳️').setStyle(ButtonStyle.Secondary)));
    }
    else {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 📜 Resultado\n${match.log.slice(-4).map((line) => `• ${line}`).join('\n')}`))
            .addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('rpg:pvp:panel').setLabel('Ver mi panel RPG').setEmoji('↩️').setStyle(ButtonStyle.Secondary)));
    }
    return { components: [container], files: [duelCard], flags: ['IsComponentsV2'] };
}
export async function rpgShopPanel(guildId, userId, requestedPage = 0, requestedCategory = 'all') {
    return storePanel(guildId, userId, requestedCategory === 'all' ? 'rpg:all' : `rpg:${requestedCategory}`, requestedPage);
}
export async function inventoryPanel(guildId, userId) {
    const ownedItems = await getInventory(guildId, userId);
    const descriptions = new Map(storeItems.map((item) => [item.id, `${item.emoji} **${item.name}** — ${item.description}`]));
    const legacyNames = new Map([['marco_neon', 'Marco Neón'], ['tema_nocturno', 'Tema Nocturno'], ['insignia_dj', 'Insignia DJ']]);
    const listing = ownedItems.length
        ? ownedItems.map((item, index) => `${String(index + 1).padStart(2, '0')}  ${descriptions.get(item.itemId) ?? `📦 **${legacyNames.get(item.itemId) ?? item.itemId}** · coleccionable anterior`}${item.quantity > 1 ? `  **×${item.quantity}**` : ''}`).join('\n')
        : '_Tu mochila está vacía. Abre la tienda para encontrar tu primer artículo._';
    const usableItems = ownedItems.filter((item) => item.quantity > 0 && storeItems.some((entry) => entry.id === item.itemId && entry.usable));
    const container = new ContainerBuilder()
        .setAccentColor(colors.economy)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🎒 MOCHILA\n**${ownedItems.reduce((sum, item) => sum + item.quantity, 0)} unidades** · ${ownedItems.length} tipos de artículo\n\n${listing}`));
    if (usableItems.length)
        container.addActionRowComponents(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('eco:use').setPlaceholder('Usar un artículo')
            .addOptions(usableItems.map((item) => {
            const definition = storeItems.find((entry) => entry.id === item.itemId);
            return { label: `${definition.name} · x${item.quantity}`, value: item.itemId, description: definition.description.slice(0, 100), emoji: definition.emoji };
        }))));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('eco:back').setLabel('Volver a mi bóveda').setEmoji('↩️').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('eco:store').setLabel('Abrir tienda').setEmoji('🛍️').setStyle(ButtonStyle.Primary)));
    return { components: [container], flags: ['IsComponentsV2', 'Ephemeral'] };
}
export async function storePanel(guildId, userId, requestedCategory = 'all', requestedPage = 0, requestedItemId, notice = '', requestedKind) {
    const selectedCategory = storeCategoryOptions.some((entry) => entry.id === requestedCategory) ? requestedCategory : 'all';
    const categoryState = selectedCategory;
    const catalogFilter = selectedCategory;
    const snapshot = await getStoreSnapshot(guildId, userId);
    const matchingIds = new Set(filterStoreCatalog(catalogFilter).map((item) => `${item.kind}:${item.id}`));
    const filtered = snapshot.products.filter((item) => matchingIds.has(`${item.kind}:${item.id}`));
    const pageSize = 6;
    const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
    const page = Math.max(0, Math.min(pageCount - 1, Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 0));
    const pageItems = filtered.slice(page * pageSize, (page + 1) * pageSize);
    const selected = pageItems.find((item) => item.id === requestedItemId && (!requestedKind || item.kind === requestedKind)) ?? pageItems[0];
    const categoryLabel = storeCategoryOptions.find((entry) => entry.id === selectedCategory)?.label ?? 'Todo';
    const getProductCategoryLabel = (item) => {
        const categoryId = item.kind === 'profile' ? `profile:${item.category}` : item.kind === 'economy' ? item.category : `rpg:${item.category}`;
        return storeCategoryOptions.find((entry) => entry.id === categoryId)?.label
            ?? (item.kind === 'profile' ? profileShopCategories.find((entry) => entry.id === item.category)?.label : undefined)
            ?? (item.kind === 'profile' ? 'Personalización' : item.kind === 'economy' ? 'Consumibles' : item.category);
    };
    const listing = pageItems.map((item) => `${item.emoji} **${item.name} (${getProductCategoryLabel(item)})** · ${item.rarity}\n${money.format(item.price)} monedas · ${item.quantity ? `tienes x${item.quantity}` : 'sin comprar'}`).join('\n\n');
    const selectedDetails = selected
        ? `### ${selected.emoji} ${selected.name} (${getProductCategoryLabel(selected)})\n${selected.description}\n**Precio:** ${money.format(selected.price)} monedas · **Rareza:** ${selected.rarity}${selected.quantity ? ` · **En inventario:** x${selected.quantity}` : ''}`
        : '_No hay productos en esta categoría._';
    const accentCategoryNote = selectedCategory === 'profile:accent' ? '\n\nEl estilo Lavanda predeterminado es gratis; los demás estilos se compran aquí.' : '';
    const status = notice ? `\n\n${notice}` : '';
    const container = new ContainerBuilder().setAccentColor(0x8b75dc)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🛍️ TIENDA MANZANITA\n**Saldo:** ${money.format(snapshot.balance)} monedas · **Categoría:** ${categoryLabel}\n${filtered.length} productos · página ${page + 1} de ${pageCount}${accentCategoryNote}${status}`))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${listing || '_No hay productos en esta categoría._'}\n\n${selectedDetails}`))
        .addActionRowComponents(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('shop:category').setPlaceholder('Categorías de la tienda')
        .addOptions(storeCategoryOptions.map((entry) => ({ label: entry.label, value: entry.id, emoji: entry.emoji, default: entry.id === selectedCategory })))));
    if (pageItems.length)
        container.addActionRowComponents(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`shop:item:${encodeURIComponent(categoryState)}:${page}`).setPlaceholder('Seleccionar producto')
            .addOptions(pageItems.map((item) => ({ label: `${item.name} (${getProductCategoryLabel(item)})`.slice(0, 100), value: `${item.kind}:${item.id}`, emoji: item.emoji, description: `${money.format(item.price)} monedas · ${item.rarity}${item.quantity ? ` · tienes x${item.quantity}` : ''}`.slice(0, 100), default: item.id === selected?.id && item.kind === selected.kind })))));
    if (selected)
        container.addActionRowComponents(new ActionRowBuilder().addComponents(selected.kind === 'profile' && selected.quantity > 0 && !selected.repeatable
            ? new ButtonBuilder().setCustomId(`shop:equip:${selected.id}:${encodeURIComponent(categoryState)}:${page}`).setLabel('Equipar').setEmoji('✅').setStyle(ButtonStyle.Success)
            : new ButtonBuilder().setCustomId(`shop:buy:${selected.kind}:${selected.id}:${encodeURIComponent(categoryState)}:${page}`).setLabel(selected.quantity > 0 && !selected.repeatable ? 'Ya comprado' : `${selected.kind === 'profile' && selected.quantity > 0 ? 'Comprar otra copia' : 'Comprar'} · ${money.format(selected.price)}`).setEmoji(selected.quantity > 0 && !selected.repeatable ? '✅' : '🪙').setStyle(ButtonStyle.Success).setDisabled(selected.quantity > 0 && !selected.repeatable), new ButtonBuilder().setCustomId('eco:back').setLabel('Volver a economía').setEmoji('↩️').setStyle(ButtonStyle.Secondary)));
    if (pageCount > 1)
        container.addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`shop:page:${Math.max(0, page - 1)}:${encodeURIComponent(categoryState)}`).setLabel('Anterior').setEmoji('◀️').setStyle(ButtonStyle.Secondary).setDisabled(page === 0), new ButtonBuilder().setCustomId(`shop:page:${Math.min(pageCount - 1, page + 1)}:${encodeURIComponent(categoryState)}`).setLabel('Siguiente').setEmoji('▶️').setStyle(ButtonStyle.Secondary).setDisabled(page + 1 >= pageCount)));
    return { components: [container], flags: ['IsComponentsV2', 'Ephemeral'] };
}
export async function casinoPanel(guildId, userId) {
    const balance = await getBalance(guildId, userId);
    const container = new ContainerBuilder()
        .setAccentColor(0xf59e0b)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🎰 CASINO\nSaldo disponible: **${money.format(balance)} monedas**\nElige un juego y escribe su comando con la cantidad que quieras apostar.`))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🎰 Máquinas y ruletas\n**Tragamonedas** · **a!machine 100** / **a!slots 100**\nTres símbolos iguales dan premio; con dos iguales recuperas la apuesta.\n\n**Ruleta** · **a!ruleta 100 rojo**\nApuesta a **rojo**, **negro** o **verde**. Rojo y negro pagan ×2; verde paga ×36.\n\n**Ruleta de objetos** · **a!itembet cebo_premium rojo**\nApuesta un objeto de tu inventario a un color.`))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🃏 Cartas\n**Blackjack / 21** · **a!21 100** / **a!bj 100** / **a!blackjack 100**\nJuega contra el crupier; pide cartas o plántate con los botones de la partida.`))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🐓 Retos y actividades\n**Pelea de gallos** · **a!gallo 100**\nEmpiezas con 50% de probabilidad; cada victoria suma 1% hasta 70%. Si pierdes, la racha vuelve a cero. Ponle nombre con **a!gallo nombre NOMBRE**.\n\n**Crimen** · **a!crime** · puedes ganar monedas o recibir una multa.\n**Robo** · **a!rob @persona** · intenta quitarle monedas a otra persona.\n**Pesca** · **a!fish** · necesitas una Caña de pescar de **a!shop**.`))
        .addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('eco:casino:fish').setLabel('Ir a pescar').setEmoji('🎣').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('eco:store').setLabel('Tienda').setEmoji('🛍️').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('eco:casino:refresh').setLabel('Actualizar').setEmoji('🔄').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('eco:back').setLabel('Volver').setEmoji('↩️').setStyle(ButtonStyle.Secondary)));
    return { components: [container], flags: ['IsComponentsV2', 'Ephemeral'] };
}
export async function bankPanel(guildId, userId) {
    const bank = await bankAction(guildId, userId, 'view');
    const next = Math.floor(bank.nextInterestAt / 1000);
    const earned = bank.interestEarned ? `\n\nInterés acreditado al abrir el banco: **${money.format(bank.interestEarned)} monedas**.` : '';
    const container = new ContainerBuilder()
        .setAccentColor(0x0ea5e9)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🏦 BANCO\n💰 Billetera **${money.format(bank.balance)}** · 🏦 Ahorro **${money.format(bank.bankBalance)}**\n📈 0.01% por día completo · siguiente interés <t:${next}:R>${earned}`))
        .addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('eco:bank:deposit').setLabel('Depositar').setEmoji('📥').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('eco:bank:withdraw').setLabel('Retirar').setEmoji('📤').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('eco:bank:refresh').setLabel('Actualizar').setEmoji('💹').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('eco:back').setLabel('Volver').setEmoji('↩️').setStyle(ButtonStyle.Secondary)));
    return { components: [container], flags: ['IsComponentsV2', 'Ephemeral'] };
}
export function blackjackPanel(game) {
    const active = game.status === 'active';
    const accent = active ? 0x7c3aed : game.outcome === 'win' ? 0x22c55e : game.outcome === 'push' ? 0x0ea5e9 : 0xef4444;
    const playerCards = game.playerCards.join('　＋　');
    const scoreLine = game.playerCardValues.join(' + ');
    const dealerCards = game.dealerCards.join('　');
    const dealerHeading = active ? '### 🎩 CRUPIER · carta visible' : `### 🎩 CRUPIER · ${game.dealerTotal} puntos`;
    const playerBusted = game.playerTotal > 21;
    const outcome = active
        ? '### 🎯 TU TURNO\nPide una carta para acercarte a 21 o plántate para cerrar tu mano.'
        : game.outcome === 'win'
            ? `### ✅ GANASTE\n${game.resultText ?? 'Venciste al crupier.'}\n💰 Cobraste **${money.format(game.payout)} monedas**.`
            : game.outcome === 'push'
                ? `### 🤝 EMPATE\n${game.resultText ?? 'Empataste con el crupier.'}\n↩️ Se devolvió tu apuesta de **${money.format(game.bet)} monedas**.`
                : `### ❌ PERDISTE\n${playerBusted ? `Te pasaste de 21 con **${game.playerTotal} puntos**.` : game.resultText ?? 'El crupier ganó esta mano.'}\n🔻 Perdiste la apuesta de **${money.format(game.bet)} monedas**.`;
    const container = new ContainerBuilder()
        .setAccentColor(accent)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🃏 VEINTIUNO\n💵 **Apuesta:** ${money.format(game.bet)} monedas　 ·　 👛 **Saldo:** ${money.format(game.balance)} monedas`))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### 🙋 TU MANO · ${game.playerCards.length} ${game.playerCards.length === 1 ? 'carta' : 'cartas'}\n${playerCards}\n**${scoreLine} = ${game.playerTotal} ${game.playerTotal === 1 ? 'punto' : 'puntos'}**${game.lastDrawnCard ? `\n\n🎴 Carta nueva: ${game.lastDrawnCard}` : ''}`))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${dealerHeading}\n${dealerCards}${active ? '\n_El crupier revela su mano al terminar tu turno._' : ''}`))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(outcome))
        .addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`eco:blackjack:hit:${game.gameId}`).setLabel('Pedir carta').setEmoji('🎴').setStyle(ButtonStyle.Primary).setDisabled(!active), new ButtonBuilder().setCustomId(`eco:blackjack:stand:${game.gameId}`).setLabel('Plantarse').setEmoji('✋').setStyle(ButtonStyle.Success).setDisabled(!active)));
    return { components: [container], flags: ['IsComponentsV2', 'Ephemeral'] };
}
export function purchaseConfirmPanel(itemId) {
    const item = storeItems.find((candidate) => candidate.id === itemId);
    if (!item)
        throw new Error('Artículo de tienda inválido.');
    const container = new ContainerBuilder()
        .setAccentColor(colors.economy)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🛒 CONFIRMAR COMPRA\n## ${item.emoji} ${item.name}\n${item.description}\n\nPrecio: **${money.format(item.cost)} monedas**\nSe descontará el precio y se añadirá una unidad a tu inventario.${item.repeatable ? ' Puedes acumular unidades.' : ' Solo puedes comprar una unidad.'}`))
        .addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`eco:confirm:${item.id}`).setLabel('Confirmar compra').setEmoji('✅').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('eco:store').setLabel('Cancelar').setEmoji('↩️').setStyle(ButtonStyle.Secondary)));
    return { components: [container], flags: ['IsComponentsV2', 'Ephemeral'] };
}
export function musicPanel(_guildId, player) {
    const current = player?.queue.current;
    const upcoming = player?.queue.tracks.slice(0, 5) ?? [];
    const queueText = upcoming.length
        ? upcoming.map((track, index) => {
            const requesterId = track.requester?.id;
            return `**${index + 1}.** ${track.info.title}${requesterId ? ` · <@${requesterId}>` : ''}`;
        }).join('\n')
        : '_Cola vacía · añade música con `/play`_';
    const duration = current?.info.duration ?? 0;
    const position = player?.position ?? 0;
    const progressRatio = duration > 0 ? Math.min(1, Math.max(0, position / duration)) : 0;
    const progressTicks = Math.floor(progressRatio * 14);
    const progress = current?.info.isStream
        ? '🔴 EN VIVO'
        : duration > 0
            ? `${time(position)} ━${'━'.repeat(progressTicks)}●${'─'.repeat(14 - progressTicks)} ${time(duration)}`
            : 'En espera';
    const playback = player?.paused ? '⏸️ Pausado' : player?.playing ? '🟢 En reproducción' : '🔌 Listo';
    const currentRequesterId = current?.requester?.id;
    const source = current?.info.sourceName ? current.info.sourceName.toUpperCase() : undefined;
    const trackUrl = current?.info.uri;
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
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🎧 MANZANITA\n${current ? `## ${current.info.title}\n${current.info.author}${source ? ` · ${source}` : ''}${currentRequesterId ? ` · <@${currentRequesterId}>` : ''}` : '## Sin reproducción'}\n${playback}`))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(current?.info.artworkUrl || 'https://cdn.discordapp.com/embed/avatars/0.png').setDescription(current?.info.title || 'Manzanita Player')))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(progress))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`🔊 ${player?.volume ?? 65}% · 🎚️ ${activeEffect} · 📜 ${player?.queue.tracks.length ?? 0} en cola\n${queueText}`))
        .addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('music:toggle').setLabel(player?.paused ? 'Reanudar' : 'Pausar').setEmoji(player?.paused ? '▶️' : '⏸️').setStyle(ButtonStyle.Primary).setDisabled(!player?.playing && !player?.paused), new ButtonBuilder().setCustomId('music:skip').setLabel('Siguiente').setEmoji('⏭️').setStyle(ButtonStyle.Secondary).setDisabled(!player?.queue.current), new ButtonBuilder().setCustomId('music:previous').setLabel('Anterior').setEmoji('⏮️').setStyle(ButtonStyle.Secondary).setDisabled(!player?.queue.previous.length), new ButtonBuilder().setCustomId('music:repeat').setLabel(`Repetir: ${repeatLabel(player?.repeatMode ?? 'off')}`).setEmoji('🔁').setStyle(ButtonStyle.Secondary).setDisabled(!player), new ButtonBuilder().setCustomId('music:shuffle').setLabel('Mezclar').setEmoji('🔀').setStyle(ButtonStyle.Secondary).setDisabled((player?.queue.tracks.length ?? 0) < 2)))
        .addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('music:stop').setLabel('Detener').setEmoji('⏹️').setStyle(ButtonStyle.Danger).setDisabled(!player), new ButtonBuilder().setCustomId('music:queue').setLabel('Ver cola').setEmoji('📜').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('music:refresh').setLabel('Actualizar').setEmoji('🔄').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('music:volume:down').setLabel('Bajar volumen').setEmoji('🔉').setStyle(ButtonStyle.Secondary).setDisabled(!player), new ButtonBuilder().setCustomId('music:volume:up').setLabel('Subir volumen').setEmoji('🔊').setStyle(ButtonStyle.Secondary).setDisabled(!player)))
        .addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('music:add').setLabel('Añadir canción').setEmoji('🎵').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('music:leave').setLabel('Desconectar').setEmoji('👋').setStyle(ButtonStyle.Danger).setDisabled(!player), ...(isHttpUrl(trackUrl) ? [new ButtonBuilder().setLabel(`Abrir ${source ?? 'canción'}`).setStyle(ButtonStyle.Link).setURL(trackUrl)] : [])));
    container
        .addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('music:seek:-15').setLabel('−15 s').setStyle(ButtonStyle.Secondary).setDisabled(!current || current.info.isStream), new ButtonBuilder().setCustomId('music:seek:15').setLabel('+15 s').setStyle(ButtonStyle.Secondary).setDisabled(!current || current.info.isStream)))
        .addActionRowComponents(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('music:effect').setPlaceholder('🎚️ Efecto de audio')
        .addOptions({ label: 'Sonido normal', value: 'normal', description: 'Desactiva todos los efectos' }, { label: 'Graves', value: 'bass', description: 'Realza los graves' }, { label: 'Rock', value: 'rock', description: 'Ecualización para rock' }, { label: 'Pop', value: 'pop', description: 'Ecualización para pop' }, { label: 'Nightcore', value: 'nightcore', description: 'Más velocidad y tono agudo' }, { label: 'Vaporwave', value: 'vaporwave', description: 'Más lento y tono grave' })));
    return { components: [container], flags: ['IsComponentsV2'] };
}
function isHttpUrl(value) {
    if (!value)
        return false;
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
    }
    catch {
        return false;
    }
}
export function searchResultsPanel(searchId, tracks) {
    const preview = tracks.slice(0, 5).map((track, index) => {
        const duration = track.info.isStream ? '🔴 EN VIVO' : time(track.info.duration ?? 0);
        return `**${String(index + 1).padStart(2, '0')}  ${truncate(track.info.title, 72)}**\n${truncate(track.info.author || 'Artista desconocido', 48)}  ·  ${duration}`;
    }).join('\n\n');
    const container = new ContainerBuilder()
        .setAccentColor(colors.music)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🔎 RESULTADOS\nEncontré **${tracks.length} canciones**. Vista rápida de las primeras ${Math.min(5, tracks.length)}:`))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(preview))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('Elige una opción del menú para añadirla a la cola.'))
        .addActionRowComponents(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`music:choose:${searchId}`).setPlaceholder('Selecciona una canción')
        .addOptions(tracks.slice(0, 25).map((track, index) => ({
        label: truncate(track.info.title, 100),
        value: String(index),
        description: truncate(`${track.info.author || 'Artista desconocido'} · ${track.info.sourceName}`, 100),
    })))));
    return { components: [container], flags: ['IsComponentsV2', 'Ephemeral'] };
}
export function favoritesPanel(guildId, userId, favorites) {
    const container = new ContainerBuilder()
        .setAccentColor(colors.music)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 💜 MIS FAVORITOS\n${favorites.length}/25 canciones guardadas · caducan a los 3 días\n\n${favorites.length
        ? favorites.map((track, index) => `**${index + 1}.** ${truncate(track.title, 90)} · ${truncate(track.author, 55)}`).join('\n')
        : '_Guarda la canción actual con `/musica favorito guardar`._'}`));
    if (favorites.length) {
        const options = favorites.map((track) => ({
            label: truncate(track.title, 100),
            value: String(track.id),
            description: truncate(track.author, 100),
        }));
        container
            .addActionRowComponents(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`music:favorites:play:${guildId}:${userId}`).setPlaceholder('Añadir un favorito a la cola').addOptions(options)))
            .addActionRowComponents(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`music:favorites:remove:${guildId}:${userId}`).setPlaceholder('Quitar de favoritos').addOptions(options)));
    }
    return { components: [container], flags: ['IsComponentsV2', 'Ephemeral'] };
}
export function playlistsPanel(playlists) {
    const listing = playlists.length
        ? playlists.map((playlist) => `🎼 **${playlist.name}** · ${playlist.trackCount} canciones`).join('\n')
        : '_Todavía no has creado listas. Guarda una canción con `/musica lista guardar` y asígnale un nombre._';
    const container = new ContainerBuilder()
        .setAccentColor(colors.music)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🎶 MIS LISTAS\n${playlists.length}/3 listas guardadas\n\n${listing}\n\nAtajos: a!playlist now [N] nombre · a!play_playlist nombre · a!playlist delete nombre · a!shuffle playlist nombre. Máximo 3 playlists de 30 canciones.`));
    return { components: [container], flags: ['IsComponentsV2', 'Ephemeral'] };
}
export function playlistDetailPanel(name, trackCount, tracks) {
    const listing = tracks.length
        ? tracks.slice(0, 12).map((track, index) => `**${index + 1}.** ${truncate(track.title, 100)} · ${truncate(track.author, 65)}`).join('\n')
        : '_Lista vacía._';
    const remaining = trackCount > 12 ? `\n_y ${trackCount - 12} canciones más…_` : '';
    const container = new ContainerBuilder()
        .setAccentColor(colors.music)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🎼 ${truncate(name, 60)}\n${trackCount} canciones guardadas\n\n${listing}${remaining}`));
    return { components: [container], flags: ['IsComponentsV2', 'Ephemeral'] };
}
const QUEUE_PAGE_SIZE = 10;
export function queuePanel(player, page, guildId) {
    const saved = !player && guildId ? getPersistedMusicQueue(guildId) : undefined;
    const queue = player?.queue.tracks ?? saved?.tracks ?? [];
    const current = player?.queue.current ?? saved?.current;
    const pageCount = Math.max(1, Math.ceil(queue.length / QUEUE_PAGE_SIZE));
    const safePage = Math.min(Math.max(0, page), pageCount - 1);
    const start = safePage * QUEUE_PAGE_SIZE;
    const tracks = queue.slice(start, start + QUEUE_PAGE_SIZE);
    const listing = tracks.length
        ? tracks.map((track, index) => `**${start + index + 1}.** ${truncate(track.info.title, 120)} · ${truncate(track.info.author || 'Artista desconocido', 80)}`).join('\n')
        : '_No hay canciones esperando en la cola._';
    const container = new ContainerBuilder()
        .setAccentColor(colors.music)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 📜 COLA MUSICAL\n${current ? `Ahora: **${current.info.title}**\n\n` : ''}${!player && queue.length ? '🔌 Cola guardada; se retomará al volver a reproducir.\n\n' : ''}${listing}\n\nPágina **${safePage + 1}/${pageCount}** · ${queue.length} canciones en espera`))
        .addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`music:queue:page:${safePage - 1}`).setLabel('Anterior').setEmoji('◀️').setStyle(ButtonStyle.Secondary).setDisabled(safePage === 0), new ButtonBuilder().setCustomId(`music:queue:page:${safePage + 1}`).setLabel('Siguiente').setEmoji('▶️').setStyle(ButtonStyle.Secondary).setDisabled(safePage >= pageCount - 1), new ButtonBuilder().setCustomId(`music:queue:refresh:${safePage}`).setLabel('Actualizar').setEmoji('🔄').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('music:queue:close').setLabel('Cerrar').setEmoji('✖️').setStyle(ButtonStyle.Danger)));
    if (tracks.length)
        container.addActionRowComponents(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`music:queue:remove:${safePage}`).setPlaceholder('Quitar una canción de esta página').setDisabled(!tracks.length)
            .addOptions(tracks.map((track, index) => ({
            label: truncate(track.info.title, 100),
            value: String(start + index),
            description: `Quitar de la posición ${start + index + 1}`,
        })))));
    return { components: [container], flags: ['IsComponentsV2', 'Ephemeral'] };
}
function repeatLabel(mode) {
    if (mode === 'track')
        return 'Canción';
    if (mode === 'queue')
        return 'Cola';
    return 'No';
}
function truncate(value, limit) {
    return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}
function time(milliseconds) {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
