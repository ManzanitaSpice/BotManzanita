import { LabelBuilder, MessageFlags, ModalBuilder, TextDisplayBuilder, TextInputBuilder, TextInputStyle, } from 'discord.js';
import { bankInterestPanel, bankPanel, blackjackPanel, casinoPanel, componentUpdate, economyActionPanel, economyPanel, expeditionLogPanel, favoritesPanel, inventoryPanel, jobsPanel, musicPanel, personalLoanPanel, purchaseConfirmPanel, queuePanel, roosterDuelPanel, rpgAdoptionPanel, rpgBuildPanel, rpgCareResultPanel, rpgCombatPanel, rpgExplorePanel, rpgFeedPanel, rpgInventoryPanel, rpgManagePanel, rpgMenuPanel, rpgMissionsPanel, rpgPanel, rpgPvPHelpPanel, rpgPvpPanel, rpgRankingPanel, rpgShopPanel, storePanel } from '../ui/panels.js';
import { bankAction, buyBusinessLand, businessGoods, claimDaily, consumeBusinessGood, fish, formatCooldown, getInventory, getPersonalLoanOverview, hireBusinessNpc, payBusinessDebt, playBlackjackTurn, purchaseItem, repayPersonalLoan, requestPersonalLoan, removeBusinessNpc, respondBusinessEmployment, respondRoosterDuel, resolveBusinessEvent, selectJob, startBusinessConstruction, storeItems, upgradeBusiness, upgradeJobTool, useShopItem } from '../services/economy.js';
import { adoptRpgPet, battleRpg, buyRpgItem, careForRpgPet, claimRpgQuest, equipRpgMoves, exploreRpg, getRpgInventory, getRpgPet, getRpgQuests, learnRpgMove, playRpgPvpTurn, renameRpgPet, respondRpgPvpChallenge, rpgItems, rpgZones, trainRpgMove, trainRpgPet, useRpgItem } from '../services/rpg.js';
import { rpgEggOptions } from '../ui/rpg-art.js';
import { addSelectedTrack, addTrack, applyMusicEffect, disconnectPlayer, refreshMusicPanel, takeSearchTrack } from '../services/music.js';
import { getFavorite, getFavorites, removeFavorite } from '../services/music-library.js';
import { removePersistedMusicQueueTrack } from '../storage/music-queue-store.js';
import { ADMIN_OWNER_ID, adminAutocomplete } from '../commands/admin.js';
import { catalogPanel } from '../ui/catalog.js';
import { profileBackgroundsPanel, profileCardPanel, profileCustomizePanel, profileInventoryPanel, profileProgressPanel, profileShopPanel } from '../ui/profile.js';
import { assignProfileBackground, buyProfileItem, equipProfileItem, updateProfileField, unequipProfileType } from '../services/profile.js';
import { profileShopItems } from '../data/profile-shop.js';
import { findStoreProduct, purchaseStoreProduct } from '../services/store.js';
import { businessInviteResultPanel, businessPanel } from '../ui/business-panel.js';
export function registerInteractionHandler(client) {
    client.on('interactionCreate', async (interaction) => {
        try {
            if (interaction.isAutocomplete()) {
                if (interaction.commandName === 'admin') {
                    if (interaction.user.id !== ADMIN_OWNER_ID) {
                        await interaction.respond([]);
                        return;
                    }
                    const option = interaction.options.getFocused(true);
                    await interaction.respond(adminAutocomplete(option.value, option.name));
                }
                else if (interaction.commandName === 'rpg') {
                    const subcommand = interaction.options.getSubcommand();
                    const query = interaction.options.getFocused().toLocaleLowerCase();
                    const owned = subcommand === 'usar' || subcommand === 'alimentar' ? await getRpgInventory(interaction.guildId ?? '', interaction.user.id) : undefined;
                    const candidates = subcommand === 'usar'
                        ? (owned ?? []).flatMap((entry) => { const item = rpgItems.find((candidate) => candidate.id === entry.itemId); return item ? [{ name: `${item.emoji} ${item.name} ×${entry.quantity}`, value: item.id }] : []; })
                        : subcommand === 'alimentar'
                            ? (owned ?? []).flatMap((entry) => { const item = rpgItems.find((candidate) => candidate.id === entry.itemId && candidate.effect === 'snack'); return item ? [{ name: `${item.emoji} ${item.name} ×${entry.quantity}`, value: item.id }] : []; })
                            : rpgItems.map((item) => ({ name: `${item.emoji} ${item.name} · base ${item.cost} · ${item.rarity}`, value: item.id }));
                    await interaction.respond(candidates.filter((choice) => choice.name.toLocaleLowerCase().includes(query)).slice(0, 25));
                }
                else if (interaction.commandName === 'economia') {
                    const subcommand = interaction.options.getSubcommand();
                    const query = interaction.options.getFocused().toLocaleLowerCase();
                    const ownedItems = await getInventory(interaction.guildId ?? '', interaction.user.id);
                    const quantities = new Map(ownedItems.map((entry) => [entry.itemId, entry.quantity]));
                    const candidates = subcommand === 'vender_producto'
                        ? businessGoods.filter((item) => (quantities.get(item.id) ?? 0) > 0)
                            .map((item) => ({ name: `${item.emoji} ${item.name} ×${quantities.get(item.id)}`, value: item.id }))
                        : subcommand === 'usar'
                            ? [
                                ...storeItems.filter((item) => item.usable && (quantities.get(item.id) ?? 0) > 0)
                                    .map((item) => ({ name: `${item.emoji} ${item.name} ×${quantities.get(item.id)}`, value: item.id })),
                                ...businessGoods.filter((item) => item.usable && (quantities.get(item.id) ?? 0) > 0)
                                    .map((item) => ({ name: `${item.emoji} ${item.name} ×${quantities.get(item.id)}`, value: item.id })),
                            ]
                            : subcommand === 'apostar_objeto'
                                ? storeItems.filter((item) => item.usable && (quantities.get(item.id) ?? 0) > 0)
                                    .map((item) => ({ name: `${item.emoji} ${item.name} ×${quantities.get(item.id)}`, value: item.id }))
                                : [];
                    await interaction.respond(candidates.filter((choice) => choice.name.toLocaleLowerCase().includes(query) || choice.value.includes(query)).slice(0, 25));
                }
                else
                    await interaction.respond([]);
                return;
            }
            if (interaction.isChatInputCommand()) {
                const command = client.commands.get(interaction.commandName);
                if (command)
                    await command.execute(interaction);
                return;
            }
            if (await handleProfileInteraction(interaction))
                return;
            if (interaction.isModalSubmit() && interaction.customId === 'rpg:name:submit') {
                if (!interaction.guildId) {
                    await interaction.reply({ content: 'El RPG solo está disponible dentro de un servidor.', flags: MessageFlags.Ephemeral });
                    return;
                }
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
                }
                catch (error) {
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
            if (interaction.isModalSubmit() && interaction.customId.startsWith('eco:loan:modal:')) {
                if (!interaction.guildId) {
                    await interaction.reply({ content: 'Los préstamos solo están disponibles dentro de un servidor.', flags: MessageFlags.Ephemeral });
                    return;
                }
                const action = interaction.customId.slice('eco:loan:modal:'.length);
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const amount = Number(interaction.fields.getTextInputValue('amount').trim());
                let notice = '';
                if (action === 'request') {
                    const result = await requestPersonalLoan(interaction.guildId, interaction.user.id, amount, interaction.id);
                    notice = result.ok
                        ? `✅ Préstamo aprobado: **${result.loan.principal.toLocaleString('es-MX')} monedas** a tu billetera. Deberás **${result.loan.balanceDue.toLocaleString('es-MX')}** antes de <t:${result.loan.dueAt}:F> · ${result.loan.aprBps / 100}% APR fijo.`
                        : result.reason === 'active_loan' ? 'Ya tienes un préstamo activo; paga el saldo pendiente antes de solicitar otro.'
                            : result.reason === 'above_limit' ? `La cantidad supera tu límite de **${result.creditLimit.toLocaleString('es-MX')} monedas**.`
                                : 'Solicita una cantidad entera entre 100 monedas y tu límite disponible.';
                }
                else if (action === 'repay') {
                    const result = await repayPersonalLoan(interaction.guildId, interaction.user.id, amount, interaction.id);
                    notice = result.ok
                        ? result.cleared ? `✅ Préstamo liquidado. Abonaste **${result.paid.toLocaleString('es-MX')} monedas** desde tu billetera.`
                            : `💸 Abonaste **${result.paid.toLocaleString('es-MX')} monedas** desde tu billetera. Restan **${result.remaining.toLocaleString('es-MX')} monedas**.`
                        : result.reason === 'no_loan' ? 'No tienes un préstamo activo.'
                            : result.reason === 'insufficient_wallet' ? `Tu billetera tiene **${result.walletBalance.toLocaleString('es-MX')}**; no se retiró nada del banco.`
                                : result.amountDue > 0 ? `Escribe un abono entre 1 y **${result.amountDue.toLocaleString('es-MX')} monedas**.`
                                    : 'Escribe una cantidad entera mayor que cero.';
                }
                else {
                    notice = 'Esa operación de préstamo no es válida.';
                }
                await interaction.editReply(componentUpdate(await personalLoanPanel(interaction.guildId, interaction.user.id, notice)));
                return;
            }
            if (!interaction.isMessageComponent() || !interaction.guildId)
                return;
            if (interaction.isButton() && (interaction.customId.startsWith('rooster:accept:') || interaction.customId.startsWith('rooster:decline:'))) {
                const accepting = interaction.customId.startsWith('rooster:accept:');
                const [, , duelId = '', invitedUserId = ''] = interaction.customId.split(':');
                if (!duelId || !invitedUserId) {
                    await interaction.reply({ content: 'Este botón de duelo no es válido.', flags: MessageFlags.Ephemeral });
                    return;
                }
                if (interaction.user.id !== invitedUserId) {
                    await interaction.reply({ content: 'Solo la persona retada puede responder a este duelo.', flags: MessageFlags.Ephemeral });
                    return;
                }
                await interaction.deferUpdate();
                const result = await respondRoosterDuel(interaction.guildId, duelId, interaction.user.id, accepting);
                if (result.duel)
                    await interaction.editReply(componentUpdate(roosterDuelPanel(result.duel)));
                if (!result.ok && result.reason !== 'expired') {
                    const message = result.reason === 'insufficient_funds' ? `Ambos necesitan **${result.duel?.bet.toLocaleString('es-MX') ?? 'la apuesta'} monedas** disponibles para aceptar.`
                        : result.reason === 'loan_active' ? 'El banco bloqueó el duelo porque una de las cuentas tiene un préstamo pendiente. No se descontaron monedas.'
                            : result.reason === 'not_pending' ? 'Este reto ya fue respondido o terminó.'
                                : result.reason === 'not_invited' ? 'Este reto estaba dirigido a otra persona.' : 'No encontré ese reto.';
                    await interaction.followUp({ content: `🐓 ${message}`, flags: MessageFlags.Ephemeral });
                }
                else if (result.ok && result.duel.status === 'declined') {
                    await interaction.followUp({ content: 'Reto rechazado. No se descontaron monedas.', flags: MessageFlags.Ephemeral });
                }
                return;
            }
            if (interaction.customId.startsWith('biz:')) {
                if ((interaction.customId.startsWith('biz:accept:') || interaction.customId.startsWith('biz:decline:')) && interaction.isButton()) {
                    const [prefix, action, ownerId = '', employeeId = ''] = interaction.customId.split(':');
                    if (prefix !== 'biz' || !ownerId || !employeeId || interaction.user.id !== employeeId) {
                        await interaction.reply({ content: 'Esta invitación de empleo está dirigida a otra persona.', flags: MessageFlags.Ephemeral });
                        return;
                    }
                    await interaction.deferUpdate();
                    const result = await respondBusinessEmployment(interaction.guildId, ownerId, employeeId, action === 'accept');
                    const text = result.ok ? result.message ?? 'Contrato actualizado.'
                        : result.reason === 'wrong_job' ? 'Debes tener activo el oficio del negocio para aceptar.'
                            : result.reason === 'staff_limit' ? 'El negocio ya alcanzó su límite de personal.'
                                : result.reason === 'employee_busy' ? 'Solo puedes tener un contrato o negocio propio a la vez.'
                                    : 'La invitación ya no está pendiente o expiró.';
                    if (!result.ok && result.reason !== 'not_found') {
                        await interaction.followUp({ content: text, flags: MessageFlags.Ephemeral });
                        return;
                    }
                    await interaction.editReply(componentUpdate(businessInviteResultPanel(text)));
                    return;
                }
                if (interaction.customId.startsWith('biz:eco:') && interaction.isButton()) {
                    const ownerId = interaction.customId.slice('biz:eco:'.length);
                    if (interaction.user.id !== ownerId) {
                        await interaction.reply({ content: 'Este acceso a economía pertenece a otra persona.', flags: MessageFlags.Ephemeral });
                        return;
                    }
                    await interaction.deferUpdate();
                    await interaction.editReply(componentUpdate(await economyPanel(interaction.guildId, ownerId, interaction.user.username, interaction.user.displayAvatarURL({ extension: 'png', size: 256 }))));
                    return;
                }
                if (interaction.customId === 'biz:jobs' && interaction.isButton()) {
                    await interaction.deferUpdate();
                    await interaction.editReply(componentUpdate(await jobsPanel(interaction.guildId, interaction.user.id)));
                    return;
                }
                if (interaction.customId.startsWith('biz:job:') && interaction.isStringSelectMenu()) {
                    const ownerId = interaction.customId.slice('biz:job:'.length);
                    if (interaction.user.id !== ownerId) {
                        await interaction.reply({ content: 'Este selector de terreno pertenece a otra persona.', flags: MessageFlags.Ephemeral });
                        return;
                    }
                    await interaction.deferUpdate();
                    await interaction.editReply(componentUpdate(await businessPanel(interaction.guildId, ownerId, interaction.values[0])));
                    return;
                }
                if (interaction.isButton()) {
                    const [, action = '', ownerId = '', jobId = ''] = interaction.customId.split(':');
                    if (interaction.user.id !== ownerId) {
                        await interaction.reply({ content: 'Este panel de negocio pertenece a otra persona.', flags: MessageFlags.Ephemeral });
                        return;
                    }
                    await interaction.deferUpdate();
                    let result;
                    if (action === 'buy' && jobId)
                        result = await buyBusinessLand(interaction.guildId, ownerId, jobId, interaction.id);
                    else if (action === 'build')
                        result = await startBusinessConstruction(interaction.guildId, ownerId, interaction.id);
                    else if (action === 'upgrade')
                        result = await upgradeBusiness(interaction.guildId, ownerId, interaction.id);
                    else if (action === 'npc')
                        result = await hireBusinessNpc(interaction.guildId, ownerId, interaction.id);
                    else if (action === 'fire-npc')
                        result = await removeBusinessNpc(interaction.guildId, ownerId);
                    else if (action === 'debt')
                        result = await payBusinessDebt(interaction.guildId, ownerId, interaction.id);
                    else if (action === 'event' && (jobId === 'closure' || jobId === 'pest'))
                        result = await resolveBusinessEvent(interaction.guildId, ownerId, jobId, interaction.id);
                    const notice = action === 'refresh' ? '' : result?.ok ? result.message ?? 'La acción se completó.'
                        : result?.reason === 'no_job' ? 'Elige y activa el oficio correspondiente en a!jobs.'
                            : result?.reason === 'already_owned' ? 'Ya tienes un terreno o negocio.'
                                : action === 'fire-npc' && result?.reason === 'not_found' ? 'No hay un ayudante NPC contratado para retirar.'
                                    : result?.reason === 'not_found' ? 'Primero compra un terreno.'
                                        : result?.reason === 'not_ready' ? 'Esta acción todavía no está disponible; revisa el estado de la obra.'
                                            : result?.reason === 'mortgaged' ? 'La propiedad está hipotecada. Liquida primero el préstamo desde /economia prestamos antes de volver a invertir.'
                                                : result?.reason === 'bankrupt' ? 'No puedes comprar un terreno mientras sigas en bancarrota. Trabaja para abonar a la deuda y consulta /economia prestamos.'
                                                    : result?.reason === 'max_level' ? 'El negocio ya alcanzó el nivel 10.'
                                                        : result?.reason === 'staff_limit' ? 'El negocio llegó al límite de personal o de consumibles preparados.'
                                                            : result?.reason === 'insufficient_funds' ? result.debt ? `Necesitas **${result.debt.toLocaleString('es-MX')} monedas** para pagar este evento.` : 'No tienes monedas suficientes para cubrir esta inversión.'
                                                                : result?.reason === 'no_debt' ? 'Tu negocio no tiene facturas pendientes.'
                                                                    : result?.reason === 'no_event' ? 'Ese evento ya fue resuelto o no sigue pendiente.'
                                                                        : result ? 'No se pudo completar esa operación.' : 'Acción de negocio no reconocida.';
                    await interaction.editReply(componentUpdate(await businessPanel(interaction.guildId, ownerId, undefined, notice)));
                    return;
                }
            }
            if (interaction.customId.startsWith('jobs:shop:') && interaction.isButton()) {
                const ownerId = interaction.customId.slice('jobs:shop:'.length);
                if (interaction.user.id !== ownerId) {
                    await interaction.reply({ content: 'Este acceso a la tienda pertenece a otra persona.', flags: MessageFlags.Ephemeral });
                    return;
                }
                await interaction.deferUpdate();
                await interaction.editReply(componentUpdate(await storePanel(interaction.guildId, ownerId, 'economy', 0, undefined, '', undefined, interaction.user)));
                return;
            }
            if (interaction.customId.startsWith('jobs:tool-select:') && interaction.isStringSelectMenu()) {
                const ownerId = interaction.customId.slice('jobs:tool-select:'.length);
                if (interaction.user.id !== ownerId) {
                    await interaction.reply({ content: 'Este selector de herramientas pertenece a otra persona.', flags: MessageFlags.Ephemeral });
                    return;
                }
                await interaction.deferUpdate();
                await interaction.editReply(componentUpdate(await jobsPanel(interaction.guildId, ownerId, '', interaction.values[0])));
                return;
            }
            if (interaction.customId.startsWith('jobs:tool-upgrade:') && interaction.isButton()) {
                const [, , , ownerId = '', toolId = ''] = interaction.customId.split(':');
                if (interaction.user.id !== ownerId) {
                    await interaction.reply({ content: 'Estas mejoras de herramientas pertenecen a otra persona.', flags: MessageFlags.Ephemeral });
                    return;
                }
                await interaction.deferUpdate();
                const result = await upgradeJobTool(interaction.guildId, ownerId, toolId, interaction.id);
                const notice = result.ok ? `✅ Mejora de ${result.material} aplicada por ${result.price.toLocaleString('es-MX')} monedas. La herramienta volvió a **${result.status.durability}/${result.status.maxDurability}**. Saldo: ${result.balance.toLocaleString('es-MX')}.`
                    : result.reason === 'insufficient' ? `Te faltan monedas para la mejora. Saldo: ${result.balance.toLocaleString('es-MX')}.`
                        : result.reason === 'max_level' ? 'La herramienta ya alcanzó calidad oro.'
                            : result.reason === 'changed' ? 'La herramienta cambió mientras abrías la mejora; revisa la nueva cotización.' : 'Compra nuevamente la herramienta para poder mejorarla.';
                await interaction.editReply(componentUpdate(await jobsPanel(interaction.guildId, ownerId, notice, toolId)));
                return;
            }
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
                await interaction.deferUpdate();
                await interaction.editReply(componentUpdate(await jobsPanel(interaction.guildId, ownerId, notice)));
                return;
            }
            if (interaction.customId === 'catalog:category' && interaction.isStringSelectMenu()) {
                await interaction.update(componentUpdate(catalogPanel(interaction.values[0])));
                return;
            }
            if (interaction.customId.startsWith('shop:')) {
                if (interaction.customId === 'shop:category' && interaction.isStringSelectMenu()) {
                    await interaction.deferUpdate();
                    await interaction.editReply(componentUpdate(await storePanel(interaction.guildId, interaction.user.id, interaction.values[0] ?? 'all', 0, undefined, '', undefined, interaction.user)));
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
                    try {
                        category = decodeURIComponent(categoryValue);
                    }
                    catch {
                        category = 'all';
                    }
                    await interaction.deferUpdate();
                    await interaction.editReply(componentUpdate(await storePanel(interaction.guildId, interaction.user.id, category, Number(pageValue), itemId, '', kind, interaction.user)));
                    return;
                }
                if (interaction.customId.startsWith('shop:page:') && interaction.isButton()) {
                    const [, , pageValue = '0', categoryValue = 'all'] = interaction.customId.split(':');
                    let category = 'all';
                    try {
                        category = decodeURIComponent(categoryValue);
                    }
                    catch {
                        category = 'all';
                    }
                    await interaction.deferUpdate();
                    await interaction.editReply(componentUpdate(await storePanel(interaction.guildId, interaction.user.id, category, Number(pageValue), undefined, '', undefined, interaction.user)));
                    return;
                }
                if (interaction.customId.startsWith('shop:buy:') && interaction.isButton()) {
                    const [, , kindValue, itemId = '', categoryValue = 'all', pageValue = '0', currencyValue = 'coins'] = interaction.customId.split(':');
                    if ((kindValue !== 'profile' && kindValue !== 'economy' && kindValue !== 'rpg') || !itemId || (currencyValue !== 'coins' && currencyValue !== 'gems')) {
                        await interaction.reply({ content: 'Ese producto ya no está disponible.', flags: MessageFlags.Ephemeral });
                        return;
                    }
                    const kind = kindValue;
                    const currency = currencyValue;
                    const item = findStoreProduct(kind, itemId);
                    if (!item) {
                        await interaction.reply({ content: 'Ese producto ya no está disponible.', flags: MessageFlags.Ephemeral });
                        return;
                    }
                    await interaction.deferUpdate();
                    const result = await purchaseStoreProduct(interaction.guildId, interaction.user.id, kind, itemId, interaction.id, currency);
                    if (!result.ok) {
                        const currencyName = currency === 'gems' ? 'gemas' : 'monedas';
                        const message = result.reason === 'insufficient_funds' ? `No tienes ${currencyName} suficientes para **${item.name}**.`
                            : result.reason === 'already_owned' ? `Ya tienes **${item.name}**.`
                                : result.reason === 'currency_unavailable' ? 'Ese producto no se puede comprar con gemas.' : 'Ese producto ya no está disponible.';
                        await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral });
                        return;
                    }
                    let category = 'all';
                    try {
                        category = decodeURIComponent(categoryValue);
                    }
                    catch {
                        category = 'all';
                    }
                    const currencyName = result.currency === 'gems' ? 'gemas' : 'monedas';
                    await interaction.editReply(componentUpdate(await storePanel(interaction.guildId, interaction.user.id, category, Number(pageValue), itemId, `✅ Compraste **${item.name}** por ${result.price.toLocaleString('es-MX')} ${currencyName} · inventario x${result.quantity} · saldo ${result.balance.toLocaleString('es-MX')} ${currencyName}.`, kind, interaction.user)));
                    return;
                }
                if (interaction.customId.startsWith('shop:equip:') && interaction.isButton()) {
                    const [, , itemId = '', categoryValue = 'all', pageValue = '0'] = interaction.customId.split(':');
                    let category = 'all';
                    try {
                        category = decodeURIComponent(categoryValue);
                    }
                    catch {
                        category = 'all';
                    }
                    await interaction.deferUpdate();
                    const result = await equipProfileItem(interaction.guildId, interaction.user.id, itemId);
                    if (!result.ok) {
                        await interaction.followUp({ content: result.message, flags: MessageFlags.Ephemeral });
                        return;
                    }
                    await interaction.editReply(componentUpdate(await storePanel(interaction.guildId, interaction.user.id, category, Number(pageValue), itemId, result.message, 'profile', interaction.user)));
                    return;
                }
            }
            if (interaction.customId.startsWith('rpg:')) {
                const guildId = interaction.guildId;
                if (interaction.customId === 'rpg:ranking') {
                    await interaction.update(componentUpdate(await rpgRankingPanel(guildId)));
                    return;
                }
                if (interaction.customId === 'rpg:menu:home') {
                    await interaction.update(componentUpdate(await rpgMenuPanel(guildId, interaction.user.id)));
                    return;
                }
                if (interaction.customId === 'rpg:menu:category' && interaction.isStringSelectMenu()) {
                    const category = interaction.values[0];
                    if (category === 'pet') {
                        await interaction.update(componentUpdate(await rpgPanel(guildId, interaction.user.id, interaction.user.username)));
                        return;
                    }
                    if (category === 'explore') {
                        await interaction.update(componentUpdate(await expeditionLogPanel(guildId, interaction.user.id)));
                        return;
                    }
                    if (category === 'logs') {
                        await interaction.update(componentUpdate(await expeditionLogPanel(guildId, interaction.user.id)));
                        return;
                    }
                    if (category === 'care' || category === 'feed') {
                        await interaction.update(componentUpdate(await rpgFeedPanel(guildId, interaction.user.id)));
                        return;
                    }
                    if (category === 'battle') {
                        await interaction.update(componentUpdate(await rpgCombatPanel(guildId, interaction.user.id)));
                        return;
                    }
                    if (category === 'inventory') {
                        await interaction.update(componentUpdate(await rpgInventoryPanel(guildId, interaction.user.id)));
                        return;
                    }
                    if (category === 'missions') {
                        await interaction.update(componentUpdate(await rpgMissionsPanel(guildId, interaction.user.id)));
                        return;
                    }
                    if (category === 'shop') {
                        await interaction.update(componentUpdate(await rpgShopPanel(guildId, interaction.user.id)));
                        return;
                    }
                    if (category === 'manage') {
                        await interaction.update(componentUpdate(await rpgManagePanel(guildId, interaction.user.id)));
                        return;
                    }
                    if (category === 'pvp') {
                        await interaction.update(componentUpdate(await rpgPvPHelpPanel(guildId)));
                        return;
                    }
                    if (category === 'ranking') {
                        await interaction.update(componentUpdate(await rpgRankingPanel(guildId)));
                        return;
                    }
                    if (category === 'social') {
                        await interaction.update(componentUpdate(await rpgPvPHelpPanel(guildId)));
                        return;
                    }
                }
                if (interaction.customId === 'rpg:manage' && interaction.isStringSelectMenu()) {
                    const action = interaction.values[0];
                    if (action === 'inventory') {
                        await interaction.update(componentUpdate(await rpgInventoryPanel(guildId, interaction.user.id)));
                        return;
                    }
                    if (action === 'missions') {
                        await interaction.update(componentUpdate(await rpgMissionsPanel(guildId, interaction.user.id)));
                        return;
                    }
                    if (action === 'shop') {
                        await interaction.update(componentUpdate(await rpgShopPanel(guildId, interaction.user.id)));
                        return;
                    }
                    if (action === 'name') {
                        const pet = await getRpgPet(guildId, interaction.user.id);
                        if (!pet) {
                            await interaction.reply({ content: 'Primero adopta una mascota.', flags: MessageFlags.Ephemeral });
                            return;
                        }
                        if (pet.freeNameUsed) {
                            await interaction.reply({ content: 'Ya usaste el cambio gratuito de nombre.', flags: MessageFlags.Ephemeral });
                            return;
                        }
                        const modal = new ModalBuilder().setCustomId('rpg:name:submit').setTitle('Nombre gratuito de mascota')
                            .addLabelComponents(new LabelBuilder().setLabel('Nombre (2–24 caracteres)').setTextInputComponent(new TextInputBuilder().setCustomId('name').setStyle(TextInputStyle.Short).setRequired(true).setMinLength(2).setMaxLength(24).setPlaceholder('Ejemplo: Nube')));
                        await interaction.showModal(modal);
                        return;
                    }
                    const statByAction = {
                        train: 'strength',
                        'train:strength': 'strength',
                        'train:defense': 'defense',
                        'train:agility': 'agility',
                    };
                    const stat = statByAction[action ?? ''];
                    if (stat) {
                        const result = await trainRpgPet(guildId, interaction.user.id, stat, interaction.id);
                        await interaction.update(componentUpdate(await rpgManagePanel(guildId, interaction.user.id)));
                        const statLabel = { strength: 'Fuerza', defense: 'Defensa', agility: 'Agilidad' }[stat];
                        const message = result.ok ? `🏋️ ${statLabel} subió a **${result.pet[stat]}** · gastó ${result.xpSpent} XP y 15 de energía · saciedad ${result.pet.hunger}/100.`
                            : result.reason === 'no_pet' ? 'Primero adopta una mascota.'
                                : result.reason === 'cooldown' ? `Podrás entrenar de nuevo en ${formatCooldown(result.secondsRemaining ?? 0)}.`
                                    : result.reason === 'low_energy' ? 'Necesita al menos 15 de energía.'
                                        : result.reason === 'low_hunger' ? 'Necesita al menos 8 de saciedad; dale de comer antes de entrenar.'
                                            : result.reason === 'low_xp' ? `Necesita ${result.requiredXp} XP disponible para esa mejora.`
                                                : result.reason === 'level_required' ? `Esa mejora requiere nivel ${result.requiredLevel}.`
                                                    : result.reason === 'stat_cap' ? `Ese atributo ya alcanzó el límite actual (${result.statCap}); sube de nivel para ampliarlo.`
                                                        : 'Necesitas 180 monedas.';
                        await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral });
                        return;
                    }
                    if (action?.startsWith('skill:')) {
                        const moveId = action.slice('skill:'.length);
                        const result = await trainRpgMove(guildId, interaction.user.id, moveId);
                        await interaction.update(componentUpdate(await rpgManagePanel(guildId, interaction.user.id)));
                        const message = result.ok ? `✨ **${result.move.name}** subió al nivel ${result.pet.moveProgress[moveId]?.level ?? 1}. Gastó ${result.xpSpent} XP.`
                            : result.reason === 'no_pet' ? 'Primero adopta una mascota.'
                                : result.reason === 'not_known' ? 'Esa técnica todavía no está aprendida.'
                                    : result.reason === 'max_level' ? 'Esa técnica ya alcanzó el nivel máximo.'
                                        : result.reason === 'level_required' ? `Necesitas nivel ${result.requiredLevel} para mejorar esa técnica.`
                                            : result.reason === 'low_xp' ? `Necesitas ${result.requiredXp} XP disponible para mejorarla.` : 'Esa técnica ya no está disponible.';
                        await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral });
                        return;
                    }
                }
                if (interaction.customId === 'rpg:feed' && interaction.isButton()) {
                    await interaction.update(componentUpdate(await rpgFeedPanel(guildId, interaction.user.id)));
                    return;
                }
                if (interaction.customId.startsWith('rpg:feed:select') && interaction.isStringSelectMenu()) {
                    const [, , , source = 'profile', pageValue = '0'] = interaction.customId.split(':');
                    const parsedPage = Number(pageValue);
                    const currentPage = Number.isSafeInteger(parsedPage) && parsedPage >= 0 ? parsedPage : 0;
                    const selection = interaction.values[0] ?? '';
                    if (selection.startsWith('__page:')) {
                        const requestedPage = Number(selection.slice('__page:'.length));
                        const page = Number.isSafeInteger(requestedPage) && requestedPage >= 0 ? requestedPage : 0;
                        const panel = source === 'feed'
                            ? await rpgFeedPanel(guildId, interaction.user.id, page)
                            : await rpgPanel(guildId, interaction.user.id, interaction.user.username, page);
                        await interaction.update(componentUpdate(panel));
                        return;
                    }
                    const item = rpgItems.find((candidate) => candidate.id === selection && candidate.effect === 'snack');
                    if (!item) {
                        await interaction.reply({ content: 'Ese alimento ya no está disponible.', flags: MessageFlags.Ephemeral });
                        return;
                    }
                    const result = await useRpgItem(guildId, interaction.user.id, item.id, interaction.id);
                    const updatedPanel = source === 'feed'
                        ? await rpgFeedPanel(guildId, interaction.user.id, currentPage)
                        : await rpgPanel(guildId, interaction.user.id, interaction.user.username, currentPage);
                    await interaction.update(componentUpdate(updatedPanel));
                    await interaction.followUp({ content: result.ok ? result.message : result.reason === 'no_pet' ? 'Primero adopta una mascota.' : result.reason === 'missing_item' ? 'Ya no tienes ese alimento.' : 'Tu mascota ya está saciada y recuperada.', flags: MessageFlags.Ephemeral });
                    return;
                }
                if (interaction.customId === 'rpg:care' && interaction.isButton()) {
                    const result = await careForRpgPet(guildId, interaction.user.id);
                    if (!result.ok) {
                        const message = result.reason === 'no_pet' ? 'Primero adopta una mascota.' : result.reason === 'max_affection' ? 'El cariño de tu mascota ya está al máximo. Dale un poco de tiempo.' : `Podrás volver a acariciarla en ${formatCooldown(result.secondsRemaining ?? 0)}.`;
                        await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
                        return;
                    }
                    await interaction.update(componentUpdate(rpgCareResultPanel(result.pet, `Acariciaste a ${result.pet.name}. Su cariño aumentó **+${result.affectionGained}**.`)));
                    return;
                }
                if (interaction.customId === 'rpg:name' && interaction.isButton()) {
                    const modal = new ModalBuilder().setCustomId('rpg:name:submit').setTitle('Nombre gratuito de mascota')
                        .addLabelComponents(new LabelBuilder().setLabel('Nombre (2–24 caracteres)').setTextInputComponent(new TextInputBuilder().setCustomId('name').setStyle(TextInputStyle.Short).setRequired(true).setMinLength(2).setMaxLength(24).setPlaceholder('Ejemplo: Nube')));
                    await interaction.showModal(modal);
                    return;
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
                    if (!matchId || !moveId) {
                        await interaction.reply({ content: 'Ese movimiento no es válido.', flags: MessageFlags.Ephemeral });
                        return;
                    }
                    if (expectedTurnUserId && expectedTurnUserId !== interaction.user.id) {
                        await interaction.reply({ content: 'Este botón pertenece al turno de otra persona. El mismo panel se actualizará cuando llegue tu turno.', flags: MessageFlags.Ephemeral });
                        return;
                    }
                    const result = await playRpgPvpTurn(guildId, matchId, interaction.user.id, 'move', moveId);
                    if (!result.ok && result.reason === 'expired') {
                        await interaction.update(componentUpdate(await rpgPvpPanel(result.match)));
                        return;
                    }
                    if (!result.ok) {
                        const message = result.reason === 'not_your_turn' ? 'Todavía no es tu turno.' : result.reason === 'low_energy' ? 'No tienes energía suficiente para esa técnica.' : result.reason === 'move_not_equipped' ? 'Esa técnica no está elegida para este duelo.' : result.reason === 'not_participant' ? 'No participas en este duelo.' : result.reason === 'not_active' ? 'El duelo ya no está activo.' : 'No encontré ese duelo.';
                        await interaction.reply({ content: `⚔️ ${message}`, flags: MessageFlags.Ephemeral });
                        return;
                    }
                    await interaction.update(componentUpdate(await rpgPvpPanel(result.match)));
                    return;
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
                        await interaction.reply({ content: `⚔️ ${message}`, flags: MessageFlags.Ephemeral });
                        return;
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
                        await interaction.reply({ content: 'Esa acción de duelo no es válida.', flags: MessageFlags.Ephemeral });
                        return;
                    }
                    if (expectedTurnUserId && expectedTurnUserId !== interaction.user.id) {
                        await interaction.reply({ content: 'Este botón pertenece al turno de otra persona. El mismo panel se actualizará cuando llegue tu turno.', flags: MessageFlags.Ephemeral });
                        return;
                    }
                    const result = await playRpgPvpTurn(guildId, matchId, interaction.user.id, action);
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
                        await interaction.reply({ content: `⚔️ ${message}`, flags: MessageFlags.Ephemeral });
                        return;
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
                    const page = Number(interaction.customId.split(':').at(-1));
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
                    await interaction.followUp({ content: result.ok ? `⚔️ Quedaron equipadas ${result.pet.equippedMoves.length} técnicas para combate y expediciones.` : result.reason === 'no_pet' ? 'Primero adopta una mascota.' : 'Equipa las cuatro técnicas disponibles (o todas las que conozca si aún son menos).', flags: MessageFlags.Ephemeral });
                    return;
                }
                if (interaction.customId === 'rpg:egg:element' && interaction.isStringSelectMenu()) {
                    const selected = rpgEggOptions.find((entry) => entry.element === interaction.values[0]);
                    await interaction.update(componentUpdate(await rpgAdoptionPanel(interaction.user.username, selected?.element ?? 'Fuego')));
                    return;
                }
                if (interaction.customId.startsWith('rpg:hatch:') && interaction.isButton()) {
                    const element = interaction.customId.slice('rpg:hatch:'.length);
                    if (!rpgEggOptions.some((entry) => entry.element === element)) {
                        await interaction.reply({ content: 'Ese huevo no existe.', flags: MessageFlags.Ephemeral });
                        return;
                    }
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
                    const page = Number(pageValue);
                    let category = 'all';
                    try {
                        category = decodeURIComponent(categoryValue);
                    }
                    catch {
                        category = 'all';
                    }
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
                                : result.reason === 'low_energy' ? 'Le falta energía. Usa éter o bayas.' : result.reason === 'low_hunger' ? 'Dale de comer antes de enviarla.' : `Está descansando; vuelve en ${formatCooldown(result.secondsRemaining ?? 0)}.`;
                        await interaction.update(componentUpdate(await rpgExplorePanel(guildId, interaction.user.id, interaction.user.username, zoneId)));
                        await interaction.followUp({ content: `🧭 ${message}`, flags: MessageFlags.Ephemeral });
                        return;
                    }
                    await interaction.update(componentUpdate(await expeditionLogPanel(guildId, interaction.user.id)));
                    return;
                }
                if (interaction.customId === 'rpg:battle:move' && interaction.isStringSelectMenu()) {
                    const result = await battleRpg(guildId, interaction.user.id, interaction.id, interaction.values[0]);
                    const message = result.ok ? `${result.message}\n❤️ ${result.pet.hp}/${result.pet.maxHp} PV · ⚡ ${result.pet.energy}/${result.pet.maxEnergy} energía.`
                        : result.reason === 'no_pet' ? 'Primero adopta una mascota.'
                            : result.reason === 'cooldown' ? `Tu mascota necesita descansar ${formatCooldown(result.secondsRemaining ?? 0)}.`
                                : result.reason === 'low_energy' ? 'No tiene energía suficiente para esa técnica.'
                                    : result.reason === 'invalid_move' ? 'Esa técnica ya no está equipada. Elige otra de tus cuatro técnicas.' : 'Está debilitada; usa polvo de renacer.';
                    await interaction.update(componentUpdate(await rpgCombatPanel(guildId, interaction.user.id)));
                    await interaction.followUp({ content: `⚔️ ${message}`, flags: MessageFlags.Ephemeral });
                    return;
                }
                if (interaction.customId === 'rpg:battle' && interaction.isButton()) {
                    const result = await battleRpg(guildId, interaction.user.id, interaction.id);
                    const message = result.ok ? `${result.message}\n❤️ ${result.pet.hp}/${result.pet.maxHp} PV · ⚡ ${result.pet.energy}/${result.pet.maxEnergy} energía.`
                        : result.reason === 'no_pet' ? 'Primero adopta una mascota.' : result.reason === 'cooldown' ? `Tu mascota necesita descansar ${formatCooldown(result.secondsRemaining ?? 0)}.` : result.reason === 'low_energy' ? 'Necesita más energía.' : result.reason === 'invalid_move' ? 'No tiene una técnica equipada disponible.' : 'Está debilitada; usa polvo de renacer.';
                    await interaction.update(componentUpdate(await rpgCombatPanel(guildId, interaction.user.id)));
                    await interaction.followUp({ content: `⚔️ ${message}`, flags: MessageFlags.Ephemeral });
                    return;
                }
                if (interaction.customId === 'rpg:train' && interaction.isButton()) {
                    const result = await trainRpgPet(guildId, interaction.user.id, 'strength', interaction.id);
                    const message = result.ok ? `🏋️ Fuerza mejorada a **${result.pet.strength}**. Gastó ${result.xpSpent} XP. Saldo: **${result.balance} monedas**.`
                        : result.reason === 'no_pet' ? 'Primero adopta una mascota.' : result.reason === 'cooldown' ? `Tu mascota necesita descansar ${formatCooldown(result.secondsRemaining ?? 0)}.` : result.reason === 'low_energy' ? 'Necesita al menos 15 de energía para entrenar.' : result.reason === 'low_hunger' ? 'Necesita al menos 8 de saciedad; dale de comer antes de entrenar.' : result.reason === 'low_xp' ? `Necesita ${result.requiredXp} XP para esa mejora.` : result.reason === 'level_required' ? `Esa mejora requiere nivel ${result.requiredLevel}.` : result.reason === 'stat_cap' ? `Ese atributo llegó a su límite actual (${result.statCap}). Sube de nivel primero.` : 'Necesitas 180 monedas.';
                    await interaction.update(componentUpdate(await rpgPanel(guildId, interaction.user.id, interaction.user.username)));
                    await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral });
                    return;
                }
                if (interaction.customId.startsWith('rpg:use') && interaction.isStringSelectMenu()) {
                    const [, , pageValue = '0'] = interaction.customId.split(':');
                    const parsedPage = Number(pageValue);
                    const currentPage = Number.isSafeInteger(parsedPage) && parsedPage >= 0 ? parsedPage : 0;
                    const selection = interaction.values[0] ?? '';
                    if (selection.startsWith('__page:')) {
                        const requestedPage = Number(selection.slice('__page:'.length));
                        const page = Number.isSafeInteger(requestedPage) && requestedPage >= 0 ? requestedPage : 0;
                        await interaction.update(componentUpdate(await rpgInventoryPanel(guildId, interaction.user.id, page)));
                        return;
                    }
                    const result = await useRpgItem(guildId, interaction.user.id, selection, interaction.id);
                    const message = result.ok ? result.message : result.reason === 'no_pet' ? 'Primero adopta una mascota.' : result.reason === 'missing_item' ? 'Ese artículo ya no está en tu mochila.' : rpgItems.find((item) => item.id === selection)?.effect === 'xp' ? 'Ya alcanzaste el límite de XP de hoy. El manual sigue en tu mochila.' : 'No hay PV, energía ni tiempo de espera que este artículo pueda recuperar ahora.';
                    await interaction.update(componentUpdate(await rpgInventoryPanel(guildId, interaction.user.id, currentPage)));
                    await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral });
                    return;
                }
                if (interaction.customId.startsWith('rpg:buy:') && interaction.isStringSelectMenu()) {
                    const [, , pageValue = '0', categoryValue = 'all'] = interaction.customId.split(':');
                    const page = Number(pageValue);
                    let category = 'all';
                    try {
                        category = decodeURIComponent(categoryValue);
                    }
                    catch {
                        category = 'all';
                    }
                    const item = rpgItems.find((candidate) => candidate.id === interaction.values[0]);
                    if (!item) {
                        await interaction.reply({ content: 'Ese artículo ya no está disponible.', flags: MessageFlags.Ephemeral });
                        return;
                    }
                    const result = await buyRpgItem(guildId, interaction.user.id, item.id, interaction.id);
                    await interaction.update(componentUpdate(await rpgShopPanel(guildId, interaction.user.id, Number.isSafeInteger(page) ? page : 0, category)));
                    await interaction.followUp({ content: result.ok ? `✅ Compraste ${item.emoji} **${item.name}** por ${result.price} monedas · mochila x${result.quantity} · saldo ${result.balance}.` : 'No tienes suficientes monedas.', flags: MessageFlags.Ephemeral });
                    return;
                }
            }
            if (interaction.customId.startsWith('eco:')) {
                if (interaction.customId === 'eco:section' && interaction.isStringSelectMenu()) {
                    const section = interaction.values[0];
                    await interaction.deferUpdate();
                    const panel = section === 'inventory' ? await inventoryPanel(interaction.guildId, interaction.user.id)
                        : section === 'bank' ? await bankPanel(interaction.guildId, interaction.user.id)
                            : section === 'loans' ? await personalLoanPanel(interaction.guildId, interaction.user.id)
                                : section === 'casino' ? await casinoPanel(interaction.guildId, interaction.user.id)
                                    : section === 'business' ? await businessPanel(interaction.guildId, interaction.user.id)
                                        : section === 'store' || section === 'premium' ? await storePanel(interaction.guildId, interaction.user.id, 'all', 0, undefined, '', undefined, interaction.user) : undefined;
                    if (!panel) {
                        await interaction.followUp({ content: 'Esa sección ya no está disponible.', flags: MessageFlags.Ephemeral });
                        return;
                    }
                    await interaction.editReply(componentUpdate(panel));
                    return;
                }
                if (interaction.customId === 'eco:bank' || interaction.customId === 'eco:bank:refresh') {
                    await interaction.deferUpdate();
                    const result = await bankAction(interaction.guildId, interaction.user.id, 'view');
                    await interaction.editReply(componentUpdate(await bankPanel(interaction.guildId, interaction.user.id, result)));
                    if (interaction.customId === 'eco:bank:refresh') {
                        const message = result.interestEarned
                            ? `💹 Se acreditaron **${result.interestEarned} monedas de interés** a tu ahorro.`
                            : `🏦 Aún no hay monedas enteras de interés que abonar. Las fracciones se conservan en los cálculos de 5 horas. Tasa actual: **${(result.interestRateBps / 100).toFixed(2)}% APR anual**.`;
                        await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral });
                    }
                    return;
                }
                if ((interaction.customId === 'eco:bank:interest' || interaction.customId === 'eco:bank:interest:refresh') && interaction.isButton()) {
                    await interaction.deferUpdate();
                    await interaction.editReply(componentUpdate(await bankInterestPanel(interaction.guildId, interaction.user.id)));
                    return;
                }
                if ((interaction.customId === 'eco:bank:deposit' || interaction.customId === 'eco:bank:withdraw') && interaction.isButton()) {
                    const action = interaction.customId.endsWith('deposit') ? 'deposit' : 'withdraw';
                    const modal = new ModalBuilder()
                        .setCustomId(`eco:bank:modal:${action}`)
                        .setTitle(action === 'deposit' ? 'Depositar monedas' : 'Retirar monedas')
                        .addLabelComponents(new LabelBuilder().setLabel('Cantidad de monedas').setTextInputComponent(new TextInputBuilder().setCustomId('amount').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(16).setPlaceholder('Ejemplo: 500')));
                    await interaction.showModal(modal);
                    return;
                }
                if (interaction.customId === 'eco:loan:open' || interaction.customId === 'eco:loan:refresh') {
                    await interaction.deferUpdate();
                    await interaction.editReply(componentUpdate(await personalLoanPanel(interaction.guildId, interaction.user.id)));
                    return;
                }
                if (interaction.customId === 'eco:loan:bank') {
                    await interaction.deferUpdate();
                    await interaction.editReply(componentUpdate(await bankPanel(interaction.guildId, interaction.user.id)));
                    return;
                }
                if (interaction.customId === 'eco:loan:request' && interaction.isButton()) {
                    const modal = new ModalBuilder().setCustomId('eco:loan:modal:request').setTitle('Solicitar préstamo')
                        .addLabelComponents(new LabelBuilder().setLabel('Cantidad de monedas').setTextInputComponent(new TextInputBuilder().setCustomId('amount').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(12).setPlaceholder('Ejemplo: 500')));
                    await interaction.showModal(modal);
                    return;
                }
                if (interaction.customId === 'eco:loan:pay' && interaction.isButton()) {
                    const modal = new ModalBuilder().setCustomId('eco:loan:modal:repay').setTitle('Abonar al préstamo')
                        .addLabelComponents(new LabelBuilder().setLabel('Cantidad de monedas').setTextInputComponent(new TextInputBuilder().setCustomId('amount').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(12).setPlaceholder('Ejemplo: 250')));
                    await interaction.showModal(modal);
                    return;
                }
                if (interaction.customId === 'eco:loan:payall' && interaction.isButton()) {
                    await interaction.deferUpdate();
                    const overview = await getPersonalLoanOverview(interaction.guildId, interaction.user.id);
                    const result = overview.loan
                        ? await repayPersonalLoan(interaction.guildId, interaction.user.id, overview.loan.balanceDue, interaction.id)
                        : undefined;
                    const notice = result?.ok ? `✅ Préstamo liquidado. Abonaste **${result.paid.toLocaleString('es-MX')} monedas** desde tu billetera.`
                        : result && !result.ok && result.reason === 'insufficient_wallet' ? 'No tienes suficiente en la billetera; no se tocó tu saldo bancario.'
                            : 'No tienes un préstamo activo.';
                    await interaction.editReply(componentUpdate(await personalLoanPanel(interaction.guildId, interaction.user.id, notice)));
                    return;
                }
                if (interaction.customId === 'eco:daily') {
                    const result = await claimDaily(interaction.guildId, interaction.user.id, interaction.id);
                    const message = result.ok
                        ? economyActionPanel('🎁 Recompensa diaria', 'Tu recompensa de hoy ya está en tu billetera.', result.amount, result.balance)
                        : { content: result.reason === 'bankrupt' ? 'Mientras sigas en bancarrota, solo puedes generar ingresos con el trabajo.' : `⏳ Ya reclamaste tu recompensa. Vuelve en **${formatCooldown(result.secondsRemaining)}**.`, flags: ['Ephemeral'] };
                    await interaction.update(componentUpdate(await economyPanel(interaction.guildId, interaction.user.id, interaction.user.username, interaction.user.displayAvatarURL({ extension: 'png', size: 256 }))));
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
                        : { content: result.reason === 'missing_rod' ? 'Necesitas una **Caña de pescar**. Cómprala en `/shop` o `a!shop`.' : result.reason === 'bankrupt' ? 'Mientras sigas en bancarrota, solo puedes generar ingresos con el trabajo.' : `🎣 Ya saliste a pescar. Vuelve en **${formatCooldown(result.secondsRemaining ?? 0)}**.`, flags: ['Ephemeral'] };
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
                        ? { content: result.reason === 'bankrupt' ? 'Mientras sigas en bancarrota, solo puedes generar ingresos trabajando. El cebo no está disponible hasta liquidar la deuda.' : result.reason === 'missing_rod' ? 'Necesitas una Caña de pescar para usar cebo.' : result.reason === 'cooldown' ? `⏳ Espera **${formatCooldown(result.secondsRemaining ?? 0)}** para volver a pescar.` : result.reason === 'no_job' ? 'Primero elige un oficio con `/economia empleo`.' : result.reason === 'missing_tool' ? 'Necesitas tener la herramienta de tu oficio para usar este artículo.' : result.reason === 'not_needed' ? itemId === 'manual_oficio' ? 'Este oficio ya alcanzó el nivel máximo.' : 'Tu herramienta ya está completamente reparada.' : 'No tienes ese consumible o ya no está disponible.', flags: ['Ephemeral'] }
                        : result.kind === 'fish' ? economyActionPanel('🎣 Cebo utilizado', result.message, result.amount, result.balance) : { content: result.message, flags: ['Ephemeral'] };
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
                        const loanOverview = await getPersonalLoanOverview(interaction.guildId, interaction.user.id);
                        await interaction.reply({ content: loanOverview.loan?.bankruptAt !== null && loanOverview.loan
                                ? 'Mientras sigas en bancarrota, solo puedes generar ingresos con el trabajo.'
                                : 'Esta partida no existe o no te pertenece.', flags: MessageFlags.Ephemeral });
                        return;
                    }
                    await interaction.update(componentUpdate(blackjackPanel(view)));
                    return;
                }
                if (interaction.customId === 'eco:business') {
                    await interaction.deferUpdate();
                    await interaction.editReply(componentUpdate(await businessPanel(interaction.guildId, interaction.user.id)));
                    return;
                }
                if (interaction.customId === 'eco:store') {
                    await interaction.deferUpdate();
                    await interaction.editReply(componentUpdate(await storePanel(interaction.guildId, interaction.user.id, 'all', 0, undefined, '', undefined, interaction.user)));
                    return;
                }
                if (interaction.customId === 'eco:premium-store') {
                    await interaction.deferUpdate();
                    await interaction.editReply(componentUpdate(await storePanel(interaction.guildId, interaction.user.id, 'all', 0, undefined, '', undefined, interaction.user)));
                    return;
                }
                if (interaction.customId === 'eco:inventory:category' && interaction.isStringSelectMenu()) {
                    const selected = interaction.values[0] ?? 'all';
                    const category = ['all', 'food', 'rpg', 'economy', 'profile'].includes(selected) ? selected : 'all';
                    await interaction.update(componentUpdate(await inventoryPanel(interaction.guildId, interaction.user.id, 0, category)));
                    return;
                }
                if (interaction.customId.startsWith('eco:inventory:page:') && interaction.isButton()) {
                    const [, , , pageValue = '0', categoryValue = 'all'] = interaction.customId.split(':');
                    const page = Number(pageValue);
                    const category = ['all', 'food', 'rpg', 'economy', 'profile'].includes(categoryValue) ? categoryValue : 'all';
                    await interaction.update(componentUpdate(await inventoryPanel(interaction.guildId, interaction.user.id, Number.isSafeInteger(page) ? page : 0, category)));
                    return;
                }
                if (interaction.customId.startsWith('eco:inventory:use:') && interaction.isStringSelectMenu()) {
                    const [, , , pageValue = '0', categoryValue = 'all'] = interaction.customId.split(':');
                    const parsedPage = Number(pageValue);
                    const page = Number.isSafeInteger(parsedPage) && parsedPage >= 0 ? parsedPage : 0;
                    const category = ['all', 'food', 'rpg', 'economy', 'profile'].includes(categoryValue) ? categoryValue : 'all';
                    const [kind, ...itemParts] = (interaction.values[0] ?? '').split(':');
                    const itemId = itemParts.join(':');
                    if (!itemId || (kind !== 'rpg' && kind !== 'economy')) {
                        await interaction.reply({ content: 'Selecciona un artículo válido.', flags: MessageFlags.Ephemeral });
                        return;
                    }
                    let response;
                    if (kind === 'rpg') {
                        const result = await useRpgItem(interaction.guildId, interaction.user.id, itemId, interaction.id);
                        const message = result.ok ? result.message
                            : result.reason === 'no_pet' ? 'Primero adopta una mascota.'
                                : result.reason === 'missing_item' ? 'Ese artículo ya no está en tu mochila.'
                                    : rpgItems.find((item) => item.id === itemId)?.effect === 'xp' ? 'Ya alcanzaste el límite de XP de hoy. El manual sigue en tu mochila.'
                                        : 'No hay PV, energía ni tiempo de espera que este artículo pueda recuperar ahora.';
                        response = { content: message, flags: ['Ephemeral'] };
                    }
                    else if (businessGoods.some((item) => item.id === itemId && item.usable)) {
                        const result = await consumeBusinessGood(interaction.guildId, interaction.user.id, itemId, interaction.id);
                        response = { content: result.ok ? result.message ?? 'Consumible preparado.'
                                : result.reason === 'not_ready' ? 'Necesitas tener construido el negocio de este oficio.'
                                    : result.reason === 'staff_limit' ? 'Ya tienes dos consumibles de negocio preparados.'
                                        : 'No tienes ese producto en el inventario.', flags: ['Ephemeral'] };
                    }
                    else {
                        const result = await useShopItem(interaction.guildId, interaction.user.id, itemId, interaction.id);
                        const message = result.ok ? result.message
                            : result.reason === 'missing_rod' ? 'Necesitas una Caña de pescar para usar cebo.'
                                : result.reason === 'cooldown' ? `⏳ Espera **${formatCooldown(result.secondsRemaining ?? 0)}** para volver a pescar.`
                                    : result.reason === 'no_job' ? 'Primero elige un oficio con `/economia empleo`.'
                                        : result.reason === 'missing_tool' ? 'Necesitas tener la herramienta de tu oficio para usar este artículo.'
                                            : result.reason === 'not_needed' ? itemId === 'manual_oficio' ? 'Este oficio ya alcanzó el nivel máximo.' : 'Tu herramienta ya está completamente reparada.'
                                                : 'No tienes ese consumible o ya no está disponible.';
                        response = result.ok && result.kind === 'fish' ? economyActionPanel('🎣 Cebo utilizado', result.message, result.amount, result.balance) : { content: message, flags: ['Ephemeral'] };
                    }
                    await interaction.update(componentUpdate(await inventoryPanel(interaction.guildId, interaction.user.id, page, category)));
                    await interaction.followUp(response);
                    return;
                }
                if (interaction.customId === 'eco:inventory') {
                    await interaction.update(componentUpdate(await inventoryPanel(interaction.guildId, interaction.user.id)));
                    return;
                }
                if (interaction.customId === 'eco:back' || interaction.customId === 'eco:refresh') {
                    await interaction.deferUpdate();
                    const panel = await economyPanel(interaction.guildId, interaction.user.id, interaction.user.username, interaction.user.displayAvatarURL({ extension: 'png', size: 256 }));
                    await interaction.editReply(componentUpdate(panel));
                    return;
                }
                if (interaction.customId === 'eco:buy' && interaction.isStringSelectMenu()) {
                    const item = storeItems.find((candidate) => candidate.id === interaction.values[0]);
                    if (!item) {
                        await interaction.reply({ content: 'Ese artículo ya no está disponible.', flags: MessageFlags.Ephemeral });
                        return;
                    }
                    await interaction.update(componentUpdate(await purchaseConfirmPanel(item.id)));
                    return;
                }
                if (interaction.customId.startsWith('eco:confirm:')) {
                    const item = storeItems.find((candidate) => candidate.id === interaction.customId.slice('eco:confirm:'.length));
                    if (!item) {
                        await interaction.reply({ content: 'Ese artículo ya no está disponible.', flags: MessageFlags.Ephemeral });
                        return;
                    }
                    await interaction.deferUpdate();
                    const result = await purchaseItem(interaction.guildId, interaction.user.id, item.id, interaction.id);
                    const content = result.ok
                        ? `✅ Compraste **${item.name}** por ${result.price} monedas. Ahora tienes **x${result.quantity}**. Te quedan **${result.balance}**.`
                        : result.reason === 'invalid_item' ? 'Ese artículo ya no está disponible.'
                            : result.reason === 'already_owned' ? `Ya tienes **${item.name}**.`
                                : `Te faltan monedas para **${item.name}**. Saldo actual: **${result.balance}**.`;
                    await interaction.editReply(componentUpdate(await storePanel(interaction.guildId, interaction.user.id, 'all', 0, undefined, '', undefined, interaction.user)));
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
                        }
                        catch (error) {
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
                        .addLabelComponents(new LabelBuilder().setLabel('Nombre de canción o enlace').setTextInputComponent(new TextInputBuilder()
                        .setCustomId('query')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setMaxLength(200)));
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
                    }
                    catch (error) {
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
                        if (removed)
                            await interaction.followUp({ content: `🗑️ Quité **${removed.info.title}** de la cola guardada.`, flags: MessageFlags.Ephemeral });
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
                    }
                    catch (error) {
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
                    const effect = interaction.values[0];
                    const effects = ['normal', 'bass', 'rock', 'pop', 'nightcore', 'vaporwave'];
                    if (!effect || !effects.includes(effect)) {
                        await interaction.reply({ content: 'Ese efecto no está disponible.', flags: MessageFlags.Ephemeral });
                        return;
                    }
                    await interaction.deferUpdate();
                    try {
                        await applyMusicEffect(player, effect);
                        await interaction.editReply(musicPanel(interaction.guildId, player));
                    }
                    catch (error) {
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
                    }
                    catch (error) {
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
                        if (player.paused)
                            await player.resume();
                        else
                            await player.pause();
                    }
                    else if (interaction.customId === 'music:skip') {
                        await player.skip();
                    }
                    else if (interaction.customId === 'music:previous') {
                        const previous = await player.queue.shiftPrevious();
                        if (previous)
                            await player.play({ clientTrack: previous });
                    }
                    else if (interaction.customId === 'music:repeat') {
                        const nextMode = player.repeatMode === 'off' ? 'track' : player.repeatMode === 'track' ? 'queue' : 'off';
                        await player.setRepeatMode(nextMode);
                    }
                    else if (interaction.customId === 'music:shuffle') {
                        await player.queue.shuffle();
                    }
                    else if (interaction.customId === 'music:stop') {
                        await player.stopPlaying(true);
                    }
                    else if (interaction.customId === 'music:leave') {
                        await disconnectPlayer(player);
                    }
                    else if (interaction.customId === 'music:volume:down') {
                        await player.setVolume(Math.max(0, player.volume - 10));
                    }
                    else if (interaction.customId === 'music:volume:up') {
                        await player.setVolume(Math.min(100, player.volume + 10));
                    }
                    await interaction.editReply(musicPanel(interaction.guildId, interaction.client.lavalink.getPlayer(interaction.guildId)));
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : 'No pude completar esa acción.';
                    await interaction.followUp({ content: `⚠️ ${message}`, flags: MessageFlags.Ephemeral });
                }
            }
        }
        catch (error) {
            console.error('Error procesando interacción:', error);
            if (interaction.isRepliable()) {
                const payload = { content: 'Ocurrió un error al procesar esta acción. Inténtalo de nuevo.', flags: MessageFlags.Ephemeral };
                if (interaction.deferred || interaction.replied)
                    await interaction.followUp(payload).catch(() => undefined);
                else
                    await interaction.reply(payload).catch(() => undefined);
            }
        }
    });
}
async function handleProfileInteraction(interaction) {
    if (!interaction.isModalSubmit() && !interaction.isMessageComponent())
        return false;
    if (!interaction.customId.startsWith('profile:'))
        return false;
    const [prefix, ownerId, ...parts] = interaction.customId.split(':');
    if (prefix !== 'profile' || !ownerId)
        return false;
    if (ownerId !== interaction.user.id) {
        if (interaction.isRepliable())
            await interaction.reply({ content: 'Este panel de perfil pertenece a otra persona.', flags: MessageFlags.Ephemeral });
        return true;
    }
    const action = parts[0] ?? '';
    const guildId = interaction.guildId;
    if (!guildId) {
        if (interaction.isRepliable())
            await interaction.reply({ content: 'Este panel solo funciona dentro de un servidor.', flags: MessageFlags.Ephemeral });
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
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            await interaction.editReply(componentUpdate(await profileShopPanel(guildId, ownerId, 'all', query, undefined, '', interaction.user)));
            return true;
        }
        return false;
    }
    if (!interaction.isMessageComponent())
        return false;
    if (interaction.isStringSelectMenu()) {
        if (action === 'background-target') {
            const value = interaction.values[0] ?? '';
            if (!['profile', 'rank', 'wallet', 'levelup', 'all'].includes(value)) {
                await interaction.reply({ content: 'Esa tarjeta no está disponible.', flags: MessageFlags.Ephemeral });
                return true;
            }
            const target = value;
            const selectedId = parts[1] || undefined;
            await interaction.deferUpdate();
            await interaction.editReply(componentUpdate(await profileBackgroundsPanel(guildId, ownerId, target, selectedId, '', interaction.user)));
            return true;
        }
        if (action === 'background-item') {
            const value = interaction.values[0] ?? '';
            const targetValue = parts[1] ?? '';
            if (!['profile', 'rank', 'wallet', 'levelup', 'all'].includes(targetValue)) {
                await interaction.reply({ content: 'El destino de ese fondo no es válido.', flags: MessageFlags.Ephemeral });
                return true;
            }
            await interaction.deferUpdate();
            await interaction.editReply(componentUpdate(await profileBackgroundsPanel(guildId, ownerId, targetValue, value, '', interaction.user)));
            return true;
        }
        if (action === 'accent') {
            const accent = (interaction.values[0] ?? '#8b75dc').toLocaleLowerCase();
            if (accent === '#8b75dc')
                await unequipProfileType(ownerId, 'accent');
            else {
                const item = profileShopItems.find((entry) => entry.type === 'accent' && entry.color.toLocaleLowerCase() === accent);
                if (!item) {
                    await interaction.reply({ content: 'Ese estilo ya no está disponible. Abre la tienda para ver los estilos actuales.', flags: MessageFlags.Ephemeral });
                    return true;
                }
                const result = await equipProfileItem(guildId, ownerId, item.id);
                if (!result.ok) {
                    await interaction.reply({ content: result.message, flags: MessageFlags.Ephemeral });
                    return true;
                }
            }
            await interaction.update(componentUpdate(await profileCustomizePanel(guildId, ownerId, interaction.user)));
            return true;
        }
        if (action === 'shop-category') {
            await interaction.deferUpdate();
            await interaction.editReply(componentUpdate(await profileShopPanel(guildId, ownerId, interaction.values[0] ?? 'all', '', undefined, '', interaction.user)));
            return true;
        }
        if (action === 'shop-item') {
            const category = parts[1] ?? 'all';
            const query = decodeURIComponent(parts.slice(2).join(':') ?? '');
            await interaction.deferUpdate();
            await interaction.editReply(componentUpdate(await profileShopPanel(guildId, ownerId, category, query, interaction.values[0], '', interaction.user)));
            return true;
        }
        if (action === 'inventory-category') {
            await interaction.update(componentUpdate(await profileInventoryPanel(guildId, ownerId, interaction.values[0] ?? 'all')));
            return true;
        }
        if (action === 'inventory-item') {
            await interaction.update(componentUpdate(await profileInventoryPanel(guildId, ownerId, parts[1] ?? 'all', interaction.values[0])));
            return true;
        }
        return false;
    }
    if (!interaction.isButton())
        return false;
    if (action === 'edit' && (parts[1] === 'about' || parts[1] === 'title')) {
        const field = parts[1];
        const about = field === 'about';
        const modal = new ModalBuilder().setCustomId(`profile:${ownerId}:edit:${field}`).setTitle(about ? 'Editar about' : 'Cambiar título')
            .addLabelComponents(new LabelBuilder().setLabel(about ? 'Sobre ti (máximo 180 caracteres)' : 'Título (máximo 40 caracteres)').setTextInputComponent(new TextInputBuilder().setCustomId(field).setStyle(about ? TextInputStyle.Paragraph : TextInputStyle.Short).setRequired(!about).setMaxLength(about ? 180 : 40).setPlaceholder(about ? 'Cuéntale algo a la comunidad…' : 'Explorador/a')));
        await interaction.showModal(modal);
        return true;
    }
    if (action === 'search') {
        const modal = new ModalBuilder().setCustomId(`profile:${ownerId}:search-submit`).setTitle('Búsqueda avanzada de la tienda')
            .addLabelComponents(new LabelBuilder().setLabel('Buscar por nombre, rareza o descripción').setTextInputComponent(new TextInputBuilder().setCustomId('query').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(64).setPlaceholder('ej. sakura, raro, marco')));
        await interaction.showModal(modal);
        return true;
    }
    if (action === 'buy') {
        const itemId = parts[1] ?? '';
        const item = profileShopItems.find((entry) => entry.id === itemId);
        const result = await buyProfileItem(guildId, ownerId, itemId, interaction.id);
        if (result.ok) {
            await interaction.update(componentUpdate(await profileShopPanel(guildId, ownerId, item?.category ?? 'all', '', itemId, `✅ Compraste **${item?.name ?? itemId}** por **${result.price.toLocaleString('es-MX')} monedas** · saldo restante: **${result.balance.toLocaleString('es-MX')} monedas**.`, interaction.user)));
            return true;
        }
        const response = result.reason === 'insufficient' ? `Te faltan monedas. Saldo: **${result.balance.toLocaleString('es-MX')}**.` : result.reason === 'already_owned' ? 'Ya tienes ese artículo.' : 'Ese artículo no se puede comprar.';
        await interaction.reply({ content: response, flags: MessageFlags.Ephemeral });
        return true;
    }
    if (action === 'equip') {
        const itemId = parts[1] ?? '';
        const result = await equipProfileItem(guildId, ownerId, itemId);
        if (result.ok) {
            await interaction.update(componentUpdate(await profileInventoryPanel(guildId, ownerId, profileShopItems.find((item) => item.id === itemId)?.category ?? 'all', itemId)));
            return true;
        }
        await interaction.reply({ content: result.message, flags: MessageFlags.Ephemeral });
        return true;
    }
    if (action === 'unequip') {
        const result = await unequipProfileType(ownerId, parts[1] ?? '');
        if (result.ok) {
            await interaction.update(componentUpdate(await profileInventoryPanel(guildId, ownerId, 'all')));
            return true;
        }
        await interaction.reply({ content: result.message, flags: MessageFlags.Ephemeral });
        return true;
    }
    if (action === 'background-apply' || action === 'background-clear') {
        const targetValue = parts[1] ?? '';
        const itemId = action === 'background-apply' ? (parts[2] ?? '') : null;
        if (!['profile', 'rank', 'wallet', 'levelup', 'all'].includes(targetValue)) {
            await interaction.reply({ content: 'El destino de ese fondo no es válido.', flags: MessageFlags.Ephemeral });
            return true;
        }
        await interaction.deferUpdate();
        const result = await assignProfileBackground(guildId, ownerId, targetValue, itemId);
        await interaction.editReply(componentUpdate(await profileBackgroundsPanel(guildId, ownerId, targetValue, itemId || undefined, result.message, interaction.user)));
        return true;
    }
    if (action === 'home') {
        await interaction.reply(await profileCardPanel(guildId, interaction.user));
        return true;
    }
    if (action === 'wallet') {
        await interaction.reply(await economyPanel(guildId, ownerId, interaction.user.username, interaction.user.displayAvatarURL({ extension: 'png', size: 256 })));
        return true;
    }
    if (action === 'rank') {
        await interaction.reply(await profileCardPanel(guildId, interaction.user, ownerId, 'rank'));
        return true;
    }
    if (action === 'customize') {
        await interaction.reply(await profileCustomizePanel(guildId, ownerId, interaction.user));
        return true;
    }
    if (action === 'backgrounds') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await interaction.editReply(componentUpdate(await profileBackgroundsPanel(guildId, ownerId, 'profile', undefined, '', interaction.user)));
        return true;
    }
    if (action === 'inventory') {
        await interaction.reply(await profileInventoryPanel(guildId, ownerId, 'all'));
        return true;
    }
    if (action === 'shop') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await interaction.editReply(componentUpdate(await storePanel(guildId, ownerId, 'all', 0, undefined, '', undefined, interaction.user)));
        return true;
    }
    if (action === 'progress') {
        await interaction.reply(await profileProgressPanel(guildId, interaction.user));
        return true;
    }
    if (action === 'rpg') {
        await interaction.reply(await rpgPanel(guildId, ownerId, interaction.user.username));
        return true;
    }
    return false;
}
