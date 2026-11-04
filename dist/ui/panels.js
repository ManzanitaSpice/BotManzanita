import { AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, SeparatorBuilder, SeparatorSpacingSize, StringSelectMenuBuilder, TextDisplayBuilder, ThumbnailBuilder, } from 'discord.js';
import { bankAction, getAccountBalances, getBalance, getInventory, storeItems } from '../services/economy.js';
import { getLearnableRpgMoves, getRpgInventory, getRpgLeaderboard, getRpgMove, getRpgPet, getRpgQuests, RPG_DAILY_XP_CAP, RPG_EXPLORE_COOLDOWN, rpgItems, rpgZones } from '../services/rpg.js';
import { renderEggCard, renderPetCard, rpgEggOptions } from './rpg-art.js';
import { renderProfileCard } from './profile-cards.js';
import { equippedProfileBadges, getProfileProgress, getProfileSettings } from '../services/profile.js';
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
export async function economyPanel(guildId, userId, username = `Usuario ${userId.slice(-4)}`) {
    const [account, settings, progress, badges] = await Promise.all([
        getAccountBalances(guildId, userId), getProfileSettings(userId), getProfileProgress(guildId, userId), equippedProfileBadges(userId),
    ]);
    const walletCard = await renderProfileCard({ mode: 'wallet', userId, username, avatarUrl: '', settings, progress,
        wallet: account.wallet, bank: account.bank, premium: account.premium, badges });
    const container = new ContainerBuilder()
        .setAccentColor(colors.economy)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 💳 ECONOMÍA\nBilletera · banco · gemas premium\n🎁 Diaria: **+100 monedas**`))
        .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://economy-wallet.png').setDescription(`Wallet de ${username}`)))
        .addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('eco:daily').setLabel('Reclamar diaria').setEmoji('🎁').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('eco:store').setLabel('Tienda').setEmoji('🛍️').setStyle(ButtonStyle.Primary)))
        .addActionRowComponents(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('eco:section').setPlaceholder('Más de economía').addOptions({ label: 'Inventario', value: 'inventory', emoji: '🎒', description: 'Revisar y usar tus objetos' }, { label: 'Banco', value: 'bank', emoji: '🏦', description: 'Ahorrar y retirar monedas' }, { label: 'Casino', value: 'casino', emoji: '🎰', description: 'Juegos y apuestas' }, { label: 'Tienda premium', value: 'premium', emoji: '💎', description: 'Artículos de moneda premium' })));
    return { components: [container], files: [new AttachmentBuilder(walletCard).setName('economy-wallet.png')], flags: ['IsComponentsV2', 'Ephemeral'] };
}
function statBar(value, max, width = 10) {
    const filled = Math.max(0, Math.min(width, Math.round((value / Math.max(1, max)) * width)));
    return `${'▰'.repeat(filled)}${'▱'.repeat(width - filled)}`;
}
export async function rpgPanel(guildId, userId, username, requestedZoneId) {
    const pet = await getRpgPet(guildId, userId);
    const container = new ContainerBuilder().setAccentColor(pet ? { 'Común': 0x94a3b8, 'Poco común': 0x22c55e, 'Raro': 0x3b82f6, 'Épico': 0xa855f7, 'Legendario': 0xf59e0b }[pet.rarity] : 0x14b8a6);
    if (!pet)
        return rpgAdoptionPanel(username, 'Fuego');
    const xpNext = 100 + (pet.level - 1) * 45;
    const selectedZone = rpgZones.find((zone) => zone.id === requestedZoneId) ?? rpgZones[0];
    const currentTime = Math.floor(Date.now() / 1000);
    const exploreReady = !pet.lastExploreAt || pet.lastExploreAt + RPG_EXPLORE_COOLDOWN <= currentTime;
    const cooldownSeconds = pet.lastExploreAt ? Math.max(0, pet.lastExploreAt + RPG_EXPLORE_COOLDOWN - currentTime) : 0;
    const exploreState = pet.level < selectedZone.minLevel ? `🔒 Requiere nivel ${selectedZone.minLevel}`
        : pet.energy < 20 ? '⚡ Necesita 20 de energía'
            : pet.hunger < 15 ? '🍖 Necesita comer antes de salir'
                : exploreReady ? '🟢 Lista para salir' : `🕒 Descanso · ${Math.ceil(cooldownSeconds / 60)} min`;
    const petCard = await renderPetCard(pet, selectedZone.background, selectedZone, xpNext);
    container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://rpg-pet-card.png').setDescription(`${pet.name}, ${pet.species} · tarjeta de mascota`)))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🧭 ${selectedZone.emoji} ${selectedZone.name}\n${selectedZone.difficulty} · Nv. ${selectedZone.minLevel}+ · riesgo ${selectedZone.danger}% · botín ${selectedZone.reward[0]}–${selectedZone.reward[1]} monedas\n👑 ${selectedZone.boss.name} · aparición ${selectedZone.boss.spawnChance}%\n${exploreState} · 📘 XP hoy ${pet.dailyXp}/${RPG_DAILY_XP_CAP}`))
        .addActionRowComponents(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('rpg:zone:preview').setPlaceholder('Elegir zona').addOptions(rpgZones.map((zone) => ({ label: `${zone.name} · Nv. ${zone.minLevel}+`, value: zone.id, emoji: zone.emoji, description: `${zone.difficulty} · botín ${zone.lootChance}% · jefe ${zone.boss.spawnChance}%` })))));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`rpg:explore:${selectedZone.id}`).setLabel(pet.hunger < 15 ? 'Necesita comer' : exploreReady ? 'Explorar' : 'Descansando').setEmoji('🧭').setStyle(ButtonStyle.Success).setDisabled(!exploreReady || pet.level < selectedZone.minLevel || pet.energy < 20 || pet.hunger < 15), new ButtonBuilder().setCustomId('rpg:menu:home').setLabel('Menú RPG').setEmoji('📋').setStyle(ButtonStyle.Secondary)));
    return { components: [container], files: [petCard], flags: ['IsComponentsV2', 'Ephemeral'] };
}
export async function rpgMenuPanel(guildId, userId) {
    const pet = await getRpgPet(guildId, userId);
    const status = pet ? `🐾 **${pet.name}** · Nv. ${pet.level} · 🍖 ${pet.hunger}/100 · 🫶 ${pet.affection}/100` : '🥚 Aún no tienes mascota. Adopta una desde **Mascota y stats**.';
    const container = new ContainerBuilder().setAccentColor(0x8b5cf6)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🐾 GREMIO RPG\n${status}\n\nElige una sección para continuar.`))
        .addActionRowComponents(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('rpg:menu:category').setPlaceholder('Abrir una categoría').addOptions({ label: 'Mascota', value: 'pet', emoji: '🐾', description: 'Tarjeta, nivel y estadísticas' }, { label: 'Aventura', value: 'explore', emoji: '🧭', description: 'Elegir zona y explorar' }, { label: 'Cuidados', value: 'care', emoji: '🫶', description: 'Alimentación y vínculo' }, { label: 'Combate', value: 'battle', emoji: '⚔️', description: 'PvE y build de ataques' }, { label: 'Mochila', value: 'inventory', emoji: '🎒', description: 'Objetos y equipo' }, { label: 'Bazar RPG', value: 'shop', emoji: '🛍️', description: 'Comida, equipo y consumibles' }, { label: 'Misiones', value: 'missions', emoji: '📜', description: 'Encargos diarios y recompensas' }, { label: 'Gestión', value: 'manage', emoji: '⚙️', description: 'Entrenamiento y nombre de mascota' }, { label: 'PvP y ranking', value: 'social', emoji: '🏆', description: 'Retos y clasificación global' })));
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
    container.addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('rpg:care').setLabel('Pasar tiempo').setEmoji('🫶').setStyle(ButtonStyle.Secondary).setDisabled(!pet), new ButtonBuilder().setCustomId('rpg:shop').setLabel('Tienda RPG').setEmoji('🛍️').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('rpg:panel').setLabel('Mi mascota').setEmoji('🐾').setStyle(ButtonStyle.Secondary)));
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
export async function rpgAdoptionPanel(username, selectedElement = 'Fuego') {
    const option = rpgEggOptions.find((entry) => entry.element === selectedElement) ?? rpgEggOptions[0];
    const card = await renderEggCard(username, option.element);
    const container = new ContainerBuilder().setAccentColor(0x14b8a6)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🥚 INCUBADORA DEL GREMIO\nElige una afinidad. La mascota sale al azar entre las especies de ese elemento.`))
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
function pvpFighterCard(match, fighter) {
    const active = match.turnUserId === fighter.userId && match.status === 'active';
    return `### ${active ? '▶️ ' : ''}<@${fighter.userId}> · ${fighter.petName}\n${fighter.species} · ${fighter.rarity} · Nv. ${fighter.level} · ${fighter.element} ${fighter.specialization}\n❤️ ${statBar(fighter.hp, fighter.maxHp, 12)} **${fighter.hp}/${fighter.maxHp}** · ⚡ ${statBar(fighter.energy, fighter.maxEnergy, 8)} **${fighter.energy}/${fighter.maxEnergy}**\n⚔️${fighter.strength} 🛡️${fighter.defense} 💨${fighter.agility}${fighter.guarding ? ' · 🛡️ Guardia' : ''}${fighter.weakened ? ' · 🌀 Debilitado' : ''}${fighter.specialUsed ? ' · ✨ Técnica usada' : ''}`;
}
export function rpgPvpPanel(match) {
    const [challenger, defender] = match.fighters;
    const status = match.status === 'pending' ? 'DESAFÍO PENDIENTE · vence en 5 minutos'
        : match.status === 'active' ? `COMBATE · RONDA ${match.round} · turno de <@${match.turnUserId}>`
            : match.status === 'finished' ? `COMBATE TERMINADO · ${match.winnerId ? `gana <@${match.winnerId}>` : 'sin ganador'}`
                : match.status === 'declined' ? 'DESAFÍO RECHAZADO' : 'DESAFÍO VENCIDO';
    const container = new ContainerBuilder().setAccentColor(match.status === 'active' ? 0xef4444 : 0x8b5cf6)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ⚔️ DUELO DE MASCOTAS · ${status}\n${pvpFighterCard(match, challenger)}\n\n**VS**\n\n${pvpFighterCard(match, defender)}\n\n_Duelo amistoso: la vida se simula en esta partida; no consume energía ni altera los PV normales._`));
    if (match.status === 'pending') {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`La invitación es para <@${match.defenderId}>. Al aceptar, el combate comienza con ${challenger.petName}; quien lanzó el desafío toma el primer turno.`))
            .addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`rpg:pvp:accept:${match.id}`).setLabel('Aceptar duelo').setEmoji('⚔️').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId(`rpg:pvp:decline:${match.id}`).setLabel('Rechazar').setEmoji('🚫').setStyle(ButtonStyle.Secondary)));
    }
    else if (match.status === 'active') {
        const recentLog = match.log.slice(-6).map((line) => `• ${line}`).join('\n');
        const turnFighter = match.fighters.find((fighter) => fighter.userId === match.turnUserId);
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 📜 Bitácora del duelo\n${recentLog || 'El duelo está por comenzar.'}\n\n**Turno actual:** <@${match.turnUserId}>`))
            .addActionRowComponents(new ActionRowBuilder().addComponents((turnFighter?.equippedMoves ?? ['quick_tackle']).slice(0, 4).map((id) => { const move = getRpgMove(id); return new ButtonBuilder().setCustomId(`rpg:pvp:move:${match.id}:${id}`).setLabel(move?.name ?? 'Placaje').setEmoji(move?.element === 'Neutral' ? '⚪' : '✨').setStyle(ButtonStyle.Danger).setDisabled((turnFighter?.energy ?? 0) < (move?.energy ?? 0)); })))
            .addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`rpg:pvp:turn:${match.id}:guard`).setLabel('Defender').setEmoji('🛡️').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId(`rpg:pvp:turn:${match.id}:special`).setLabel('Técnica especial').setEmoji('✨').setStyle(ButtonStyle.Success).setDisabled(match.fighters.find((fighter) => fighter.userId === match.turnUserId)?.specialUsed ?? false), new ButtonBuilder().setCustomId(`rpg:pvp:turn:${match.id}:surrender`).setLabel('Rendirse').setEmoji('🏳️').setStyle(ButtonStyle.Secondary)));
    }
    else {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 📜 Resultado\n${match.log.slice(-4).map((line) => `• ${line}`).join('\n')}`))
            .addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('rpg:pvp:panel').setLabel('Ver mi panel RPG').setEmoji('↩️').setStyle(ButtonStyle.Secondary)));
    }
    return { components: [container], flags: ['IsComponentsV2'] };
}
export async function rpgShopPanel(guildId, userId, requestedPage = 0, requestedCategory = 'all') {
    const balance = await getBalance(guildId, userId);
    const categories = [...new Set(rpgItems.map((item) => item.category))].sort((a, b) => a.localeCompare(b, 'es'));
    const category = requestedCategory === 'all' || categories.includes(requestedCategory) ? requestedCategory : 'all';
    const filteredItems = category === 'all' ? rpgItems : rpgItems.filter((item) => item.category === category);
    const pageSize = 6;
    const pageCount = Math.max(1, Math.ceil(filteredItems.length / pageSize));
    const page = Math.max(0, Math.min(pageCount - 1, Math.floor(requestedPage)));
    const pageItems = filteredItems.slice(page * pageSize, (page + 1) * pageSize);
    const listing = pageItems.map((item) => `${item.emoji} **${item.name}**  ·  ${item.rarity}\n${item.description}\n🪙 **${money.format(item.cost)}**`).join('\n\n');
    const container = new ContainerBuilder().setAccentColor(0x8b5cf6)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🛍️ BAZAR DEL GREMIO\n👛 ${money.format(balance)} monedas · ${category === 'all' ? 'Todos los artículos' : category}\n${filteredItems.length} artículos · página ${page + 1} de ${pageCount}`))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(listing || '_No hay artículos en esta categoría._'))
        .addActionRowComponents(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('rpg:shop:category').setPlaceholder('Filtrar por categoría')
        .addOptions([{ label: 'Todas las categorías', value: 'all', emoji: '✨', default: category === 'all' }, ...categories.map((name) => ({ label: name, value: name, emoji: rpgItems.find((item) => item.category === name)?.emoji ?? '📦', default: category === name }))])))
        .addActionRowComponents(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`rpg:buy:${page}:${encodeURIComponent(category)}`).setPlaceholder('Elegir un artículo para comprar')
        .addOptions(pageItems.map((item) => ({ label: `${item.name} · ${money.format(item.cost)}`, value: item.id, emoji: item.emoji, description: `${item.rarity} · ${item.description}`.slice(0, 100) })))))
        .addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`rpg:shop:page:${Math.max(0, page - 1)}:${encodeURIComponent(category)}`).setLabel('Anterior').setEmoji('◀️').setStyle(ButtonStyle.Secondary).setDisabled(page === 0), new ButtonBuilder().setCustomId(`rpg:shop:page:${Math.min(pageCount - 1, page + 1)}:${encodeURIComponent(category)}`).setLabel('Siguiente').setEmoji('▶️').setStyle(ButtonStyle.Secondary).setDisabled(page + 1 >= pageCount), new ButtonBuilder().setCustomId('rpg:menu:home').setLabel('Menú RPG').setEmoji('↩️').setStyle(ButtonStyle.Secondary)));
    return { components: [container], flags: ['IsComponentsV2', 'Ephemeral'] };
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
export async function storePanel(guildId, userId) {
    const [balance, inventory] = await Promise.all([getBalance(guildId, userId), getInventory(guildId, userId)]);
    const quantities = new Map(inventory.map((entry) => [entry.itemId, entry.quantity]));
    const container = new ContainerBuilder()
        .setAccentColor(colors.economy)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🛍️ TIENDA DE ECONOMÍA\n**Saldo:** ${money.format(balance)} monedas  ·  **${storeItems.length}** artículos disponibles`))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(...storeItems.map((item) => new TextDisplayBuilder().setContent(`### ${item.emoji} ${item.name}\n**${money.format(item.cost)} monedas**  ·  En tu inventario: **x${quantities.get(item.id) ?? 0}**\n${item.description}`)))
        .addActionRowComponents(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('eco:buy').setPlaceholder('Selecciona un artículo para comprar')
        .addOptions(storeItems.map((item) => ({ label: item.name, value: item.id, description: `${money.format(item.cost)} monedas · ${item.description}`.slice(0, 100), emoji: item.emoji })))))
        .addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('eco:back').setLabel('Volver a mi bóveda').setEmoji('↩️').setStyle(ButtonStyle.Secondary)));
    return { components: [container], flags: ['IsComponentsV2', 'Ephemeral'] };
}
export async function premiumStorePanel(guildId, userId) {
    const account = await getAccountBalances(guildId, userId);
    const container = new ContainerBuilder().setAccentColor(0x8b5cf6)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 💎 TIENDA PREMIUM\nSaldo: **${money.format(account.premium)} gemas admin**\n\nMoneda asignada por el staff.\n_El catálogo todavía está vacío._`))
        .addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('eco:back').setLabel('Volver a economía').setEmoji('↩️').setStyle(ButtonStyle.Secondary)));
    return { components: [container], flags: ['IsComponentsV2', 'Ephemeral'] };
}
export async function casinoPanel(guildId, userId) {
    const balance = await getBalance(guildId, userId);
    const container = new ContainerBuilder()
        .setAccentColor(0xf59e0b)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🎰 CASINO\n💰 ${money.format(balance)} monedas`))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('🎣 Pesca · 🔴 Ruleta · 🎒 Apuesta de objetos · 🃏 21 · 🕵️ Robo\nUsa los comandos `/roulette`, `/21`, `/fish` o `/rob` para jugar.'))
        .addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('eco:casino:fish').setLabel('Ir a pescar').setEmoji('🎣').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('eco:casino:refresh').setLabel('Actualizar').setEmoji('🔄').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('eco:back').setLabel('Volver').setEmoji('↩️').setStyle(ButtonStyle.Secondary)));
    return { components: [container], flags: ['IsComponentsV2', 'Ephemeral'] };
}
export async function bankPanel(guildId, userId) {
    const bank = await bankAction(guildId, userId, 'view');
    const next = Math.floor(bank.nextInterestAt / 1000);
    const earned = bank.interestEarned ? `\n\nInterés acreditado al abrir el banco: **${money.format(bank.interestEarned)} monedas**.` : '';
    const container = new ContainerBuilder()
        .setAccentColor(0x0ea5e9)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🏦 BANCO\n💰 Billetera **${money.format(bank.balance)}** · 🏦 Ahorro **${money.format(bank.bankBalance)}**\n📈 0.1% por día completo · siguiente interés <t:${next}:R>${earned}`))
        .addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('eco:bank:deposit').setLabel('Depositar').setEmoji('📥').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('eco:bank:withdraw').setLabel('Retirar').setEmoji('📤').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('eco:bank:refresh').setLabel('Actualizar').setEmoji('💹').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('eco:back').setLabel('Volver').setEmoji('↩️').setStyle(ButtonStyle.Secondary)));
    return { components: [container], flags: ['IsComponentsV2', 'Ephemeral'] };
}
export function blackjackPanel(game) {
    const active = game.status === 'active';
    const dealerTotal = game.dealerTotal === undefined ? '' : ` · **${game.dealerTotal}**`;
    const status = active
        ? 'Elige si quieres pedir carta o plantarte.'
        : `${game.resultText ?? 'Partida terminada'}\n${game.payout > 0 ? `Premio acreditado: **${money.format(game.payout)} monedas**.` : ''}\nSaldo: **${money.format(game.balance)} monedas**.`;
    const container = new ContainerBuilder()
        .setAccentColor(active ? 0x7c3aed : 0x22c55e)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🃏 VEINTIUNO\nApuesta: **${money.format(game.bet)} monedas** · Saldo: **${money.format(game.balance)}**\n\n**Tu mano** · ${game.playerCards.join('  ')} · **${game.playerTotal}**\n**Crupier** · ${game.dealerCards.join('  ')}${dealerTotal}\n\n${status}`))
        .addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`eco:blackjack:hit:${game.gameId}`).setLabel('Pedir carta').setEmoji('🂠').setStyle(ButtonStyle.Primary).setDisabled(!active), new ButtonBuilder().setCustomId(`eco:blackjack:stand:${game.gameId}`).setLabel('Plantarse').setEmoji('✋').setStyle(ButtonStyle.Success).setDisabled(!active)));
    return { components: [container], flags: ['IsComponentsV2', 'Ephemeral'] };
}
export function purchaseConfirmPanel(itemId) {
    const item = storeItems.find((candidate) => candidate.id === itemId);
    if (!item)
        throw new Error('Artículo de tienda inválido.');
    const container = new ContainerBuilder()
        .setAccentColor(colors.economy)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🛒 CONFIRMAR COMPRA\n## ${item.emoji} ${item.name}\n${item.description}\n\nPrecio: **${money.format(item.cost)} monedas**\nSe descontará el precio y se añadirá una unidad a tu inventario. Puedes acumular unidades.`))
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
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 💜 MIS FAVORITOS\n${favorites.length}/25 canciones guardadas\n\n${favorites.length
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
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🎶 MIS LISTAS\n${playlists.length}/20 listas guardadas\n\n${listing}\n\nUsa /musica lista ver para explorar o /musica lista reproducir para añadir una lista a la cola.`));
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
export function queuePanel(player, page) {
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
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 📜 COLA MUSICAL\n${player?.queue.current ? `Ahora: **${player.queue.current.info.title}**\n\n` : ''}${listing}\n\nPágina **${safePage + 1}/${pageCount}** · ${queue.length} canciones en espera`))
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
