import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { adoptRpgPet, battleRpg, buyRpgItem, careForRpgPet, createRpgPvpChallenge, exploreRpg, renameRpgPet, rpgItems, rpgZones, trainRpgPet, useRpgItem } from '../services/rpg.js';
import { expeditionLogPanel, rpgBuildPanel, rpgCareResultPanel, rpgExplorePanel, rpgFeedPanel, rpgInventoryPanel, rpgMenuPanel, rpgMissionsPanel, rpgPanel, rpgPvpPanel, rpgRankingPanel } from '../ui/panels.js';
import { rpgEggOptions } from '../ui/rpg-art.js';
export const rpgCommand = {
    data: new SlashCommandBuilder().setName('rpg').setDescription('Mascotas, aventuras, combate y recompensas RPG')
        .addSubcommand((sub) => sub.setName('menu').setDescription('Abre el menú de categorías del RPG'))
        .addSubcommand((sub) => sub.setName('panel').setDescription('Abre la ficha visual de tu mascota'))
        .addSubcommand((sub) => sub.setName('mochila').setDescription('Consulta y usa tus objetos RPG'))
        .addSubcommand((sub) => sub.setName('alimentar').setDescription('Alimenta a tu mascota con comida de la mochila')
        .addStringOption((option) => option.setName('alimento').setDescription('Comida disponible').setAutocomplete(true)))
        .addSubcommand((sub) => sub.setName('cuidar').setDescription('Pasa tiempo con tu mascota para aumentar el vínculo'))
        .addSubcommand((sub) => sub.setName('ataques').setDescription('Aprende técnicas y prepara la build de combate'))
        .addSubcommand((sub) => sub.setName('nombrar').setDescription('Usa el nombre gratuito de tu mascota una sola vez')
        .addStringOption((option) => option.setName('nombre').setDescription('Nombre nuevo (2–24 caracteres)').setRequired(true).setMinLength(2).setMaxLength(24)))
        .addSubcommand((sub) => sub.setName('adoptar').setDescription('Adopta una mascota aleatoria')
        .addStringOption((option) => option.setName('elemento').setDescription('Huevo elemental: la especie aleatoria respetará esta afinidad').setRequired(true).addChoices(...rpgEggOptions.map((entry) => ({ name: `${entry.emoji} ${entry.title}`, value: entry.element }))))
        .addStringOption((option) => option.setName('nombre').setDescription('Nombre para tu mascota').setMaxLength(24)))
        .addSubcommand((sub) => sub.setName('explorar').setDescription('Explora: dificultad, botín regional y posibles jefes')
        .addStringOption((option) => option.setName('zona').setDescription('Zona para explorar; si se omite, abre el panel de selección').setRequired(false).addChoices(...rpgZones.map((zone) => ({ name: `${zone.emoji} ${zone.name} · Nv. ${zone.minLevel}+`, value: zone.id })))))
        .addSubcommand((sub) => sub.setName('bitacora').setDescription('Consulta el historial de tus expediciones'))
        .addSubcommand((sub) => sub.setName('combatir').setDescription('Enfrenta enemigos PvE y gana experiencia'))
        .addSubcommand((sub) => sub.setName('retar').setDescription('Reta a otra persona a un duelo RPG por turnos')
        .addUserOption((option) => option.setName('oponente').setDescription('Persona a quien quieres retar').setRequired(true)))
        .addSubcommand((sub) => sub.setName('entrenar').setDescription('Mejora un atributo por 180 monedas y 15 de energía')
        .addStringOption((option) => option.setName('atributo').setDescription('Atributo que quieres mejorar').setRequired(true)
        .addChoices({ name: '⚔️ Fuerza', value: 'strength' }, { name: '🛡️ Defensa', value: 'defense' }, { name: '💨 Agilidad', value: 'agility' })))
        .addSubcommand((sub) => sub.setName('comprar').setDescription('Compra un artículo RPG con monedas de tu billetera')
        .addStringOption((option) => option.setName('articulo').setDescription('Artículo que quieres comprar').setRequired(true).setAutocomplete(true)))
        .addSubcommand((sub) => sub.setName('usar').setDescription('Usa un consumible o equipa un objeto RPG')
        .addStringOption((option) => option.setName('articulo').setDescription('Artículo de tu mochila').setRequired(true).setAutocomplete(true)))
        .addSubcommand((sub) => sub.setName('misiones').setDescription('Consulta y cobra tus encargos diarios'))
        .addSubcommand((sub) => sub.setName('ranking').setDescription('Muestra las mascotas con más nivel global')),
    async execute(interaction) {
        if (!interaction.guildId) {
            await interaction.reply({ content: 'El RPG está disponible dentro de un servidor.', flags: MessageFlags.Ephemeral });
            return;
        }
        const guildId = interaction.guildId;
        const userId = interaction.user.id;
        const action = interaction.options.getSubcommand();
        if (action === 'menu') {
            await interaction.reply(await rpgMenuPanel(guildId, userId));
            return;
        }
        if (action === 'retar') {
            const opponent = interaction.options.getUser('oponente', true);
            if (opponent.bot) {
                await interaction.reply({ content: 'Solo puedes retar a una persona, no a un bot.', flags: MessageFlags.Ephemeral });
                return;
            }
            const result = await createRpgPvpChallenge(guildId, userId, interaction.user.username, opponent.id, opponent.username, interaction.id);
            if (!result.ok) {
                const message = result.reason === 'self' ? 'No puedes retarte a ti mismo.'
                    : result.reason === 'no_challenger_pet' ? 'Primero elige un huevo desde `/rpg panel`.'
                        : result.reason === 'no_defender_pet' ? `${opponent} necesita adoptar una mascota RPG antes de aceptar.`
                            : 'Tú o esa persona ya tienen un desafío o duelo RPG activo.';
                await interaction.reply({ content: `⚔️ ${message}`, flags: MessageFlags.Ephemeral });
                return;
            }
            await interaction.reply(await rpgPvpPanel(result.match));
            return;
        }
        if (action === 'misiones') {
            await interaction.reply(await rpgMissionsPanel(guildId, userId));
            return;
        }
        if (action === 'panel') {
            await interaction.reply(await rpgPanel(guildId, userId, interaction.user.username));
            return;
        }
        if (action === 'bitacora') {
            await interaction.reply(await expeditionLogPanel(guildId, userId));
            return;
        }
        if (action === 'mochila') {
            await interaction.reply(await rpgInventoryPanel(guildId, userId));
            return;
        }
        if (action === 'alimentar') {
            const itemId = interaction.options.getString('alimento');
            if (!itemId) {
                await interaction.reply(await rpgFeedPanel(guildId, userId));
                return;
            }
            const item = rpgItems.find((candidate) => candidate.id === itemId && candidate.effect === 'snack');
            if (!item) {
                await interaction.reply({ content: 'Elige un alimento registrado.', flags: MessageFlags.Ephemeral });
                return;
            }
            const result = await useRpgItem(guildId, userId, item.id, interaction.id);
            if (!result.ok) {
                await interaction.reply({ content: result.reason === 'no_pet' ? 'Primero adopta una mascota.' : result.reason === 'missing_item' ? 'No tienes ese alimento.' : 'Tu mascota ya está saciada y recuperada.', flags: MessageFlags.Ephemeral });
                return;
            }
            await interaction.reply(await rpgCareResultPanel(result.pet, result.message));
            return;
        }
        if (action === 'cuidar') {
            const result = await careForRpgPet(guildId, userId);
            if (!result.ok) {
                await interaction.reply({ content: result.reason === 'no_pet' ? 'Primero adopta una mascota.' : result.reason === 'max_affection' ? 'El vínculo ya está al máximo.' : `Podrás volver a cuidarla en ${Math.ceil((result.secondsRemaining ?? 0) / 60)} minutos.`, flags: MessageFlags.Ephemeral });
                return;
            }
            await interaction.reply(rpgCareResultPanel(result.pet, `Acariciaste a ${result.pet.name}. Su vínculo aumentó **+${result.affectionGained}**.`));
            return;
        }
        if (action === 'ataques') {
            await interaction.reply(await rpgBuildPanel(guildId, userId));
            return;
        }
        if (action === 'nombrar') {
            const result = await renameRpgPet(guildId, userId, interaction.options.getString('nombre', true));
            const message = result.ok ? `🐾 Tu mascota ahora se llama **${result.pet.name}**. El nombre gratuito ya fue usado.` : result.reason === 'no_pet' ? 'Primero elige un huevo desde `/rpg panel`.' : result.reason === 'already_used' ? 'Ya usaste el cambio de nombre gratuito de esta mascota.' : 'Usa un nombre de 2 a 24 caracteres; evita menciones y formato de Discord.';
            await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
            return;
        }
        if (action === 'adoptar') {
            const element = interaction.options.getString('elemento', true);
            const result = await adoptRpgPet(guildId, userId, interaction.options.getString('nombre') ?? '', element);
            if (result.ok)
                await interaction.reply(await rpgPanel(guildId, userId, interaction.user.username));
            else
                await interaction.reply({ content: result.reason === 'invalid_name' ? 'El nombre debe tener de 2 a 24 caracteres y no puede incluir menciones ni formato de Discord.' : 'Ya tienes una mascota. Puedes verla con `/rpg panel` desde cualquier servidor.', flags: MessageFlags.Ephemeral });
            return;
        }
        if (action === 'explorar') {
            const zoneId = interaction.options.getString('zona');
            if (!zoneId) {
                await interaction.reply(await rpgExplorePanel(guildId, userId, interaction.user.username));
                return;
            }
            const result = await exploreRpg(guildId, userId, zoneId, interaction.id);
            if (!result.ok) {
                const message = result.reason === 'no_pet' ? 'Primero elige un huevo desde `/rpg panel`.'
                    : result.reason === 'zone_locked' ? 'Tu mascota todavía no tiene nivel suficiente para esa zona.'
                        : result.reason === 'low_energy' ? 'Tu mascota necesita energía. Busca éter o bayas en el bazar.'
                            : result.reason === 'low_hunger' ? 'Tu mascota necesita comer. Usa `/rpg alimentar` antes de explorar.'
                                : `Tu mascota está descansando. Prueba en **${Math.ceil((result.secondsRemaining ?? 0) / 60)} minutos**.`;
                await interaction.reply({ content: `🧭 ${message}`, flags: MessageFlags.Ephemeral });
                return;
            }
            await interaction.reply(await expeditionLogPanel(guildId, userId));
            return;
        }
        if (action === 'combatir') {
            const result = await battleRpg(guildId, userId, interaction.id);
            if (!result.ok) {
                const message = result.reason === 'no_pet' ? 'Primero elige un huevo desde `/rpg panel`.'
                    : result.reason === 'cooldown' ? `Tu mascota necesita descansar ${Math.ceil((result.secondsRemaining ?? 0) / 60)} min antes de otro combate.`
                        : result.reason === 'low_energy' ? 'Te falta energía para combatir. Usa un artículo de recuperación.' : 'Tu mascota quedó debilitada. Usa polvo de renacer en `/rpg usar`.';
                await interaction.reply({ content: `⚔️ ${message}`, flags: MessageFlags.Ephemeral });
                return;
            }
            await interaction.reply({ content: `${result.message}\n❤️ ${result.pet.hp}/${result.pet.maxHp} PV · ⚡ ${result.pet.energy}/${result.pet.maxEnergy} energía.`, flags: MessageFlags.Ephemeral });
            return;
        }
        if (action === 'entrenar') {
            const stat = interaction.options.getString('atributo', true);
            const result = await trainRpgPet(guildId, userId, stat, interaction.id);
            const message = result.ok ? `🏋️ Entrenamiento completado. ${stat === 'strength' ? 'Fuerza' : stat === 'defense' ? 'Defensa' : 'Agilidad'} ahora es **${result.pet[stat]}**. Saldo: **${result.balance} monedas**.`
                : result.reason === 'no_pet' ? 'Primero elige un huevo desde `/rpg panel`.' : result.reason === 'cooldown' ? `Tu mascota necesita descansar ${Math.ceil((result.secondsRemaining ?? 0) / 3600)} h antes de entrenar otra vez.` : result.reason === 'low_energy' ? 'Necesita 15 de energía para entrenar.' : result.reason === 'low_hunger' ? 'Dale de comer antes de entrenar.' : 'No tienes las 180 monedas necesarias.';
            await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
            return;
        }
        if (action === 'comprar') {
            const item = rpgItems.find((candidate) => candidate.id === interaction.options.getString('articulo', true));
            const result = await buyRpgItem(guildId, userId, item.id, interaction.id);
            await interaction.reply({ content: result.ok ? `${item.emoji} Compraste **${item.name}**. Mochila: x${result.quantity} · saldo: **${result.balance} monedas**.` : 'No tienes suficiente saldo para esa compra.', flags: MessageFlags.Ephemeral });
            return;
        }
        if (action === 'usar') {
            const result = await useRpgItem(guildId, userId, interaction.options.getString('articulo', true), interaction.id);
            const message = result.ok ? result.message : result.reason === 'no_pet' ? 'Primero adopta una mascota.' : result.reason === 'missing_item' ? 'No tienes ese artículo en tu mochila.' : rpgItems.find((item) => item.id === interaction.options.getString('articulo', true))?.effect === 'xp' ? 'Ya alcanzaste el límite de XP de hoy. El manual sigue en tu mochila.' : 'No hay PV, energía ni tiempo de espera que este artículo pueda recuperar ahora.';
            await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
            return;
        }
        if (action === 'ranking') {
            await interaction.reply({ ...await rpgRankingPanel(guildId), allowedMentions: { parse: [] } });
        }
    },
};
