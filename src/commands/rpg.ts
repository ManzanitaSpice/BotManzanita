import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { BotCommand } from '../types.js';
import { adoptRpgPet, battleRpg, buyRpgItem, createRpgPvpChallenge, exploreRpg, getRpgLeaderboard, renameRpgPet, rpgItems, rpgZones, trainRpgPet, useRpgItem } from '../services/rpg.js';
import { rpgBestiaryPanel, rpgBuildPanel, rpgPanel, rpgPvpPanel, rpgShopPanel } from '../ui/panels.js';

export const rpgCommand: BotCommand = {
  data: new SlashCommandBuilder().setName('rpg').setDescription('Mascotas, aventuras, combate y recompensas RPG')
    .addSubcommand((sub) => sub.setName('panel').setDescription('Abre la ficha visual de tu mascota'))
    .addSubcommand((sub) => sub.setName('ataques').setDescription('Aprende técnicas y prepara la build de combate'))
    .addSubcommand((sub) => sub.setName('nombrar').setDescription('Usa el nombre gratuito de tu mascota una sola vez')
      .addStringOption((option) => option.setName('nombre').setDescription('Nombre nuevo (2–24 caracteres)').setRequired(true).setMinLength(2).setMaxLength(24)))
    .addSubcommand((sub) => sub.setName('bestiario').setDescription('Explora las 48 especies, sus rarezas, elementos y especialidades'))
    .addSubcommand((sub) => sub.setName('adoptar').setDescription('Adopta una mascota aleatoria')
      .addStringOption((option) => option.setName('nombre').setDescription('Nombre para tu mascota').setMaxLength(24)))
    .addSubcommand((sub) => sub.setName('explorar').setDescription('Explora: dificultad, botín regional y posibles jefes')
      .addStringOption((option) => option.setName('zona').setDescription('Zona para explorar').setRequired(true).addChoices(...rpgZones.map((zone) => ({ name: `${zone.emoji} ${zone.name} · Nv. ${zone.minLevel}+`, value: zone.id })))))
    .addSubcommand((sub) => sub.setName('combatir').setDescription('Enfrenta enemigos PvE y gana experiencia'))
    .addSubcommand((sub) => sub.setName('retar').setDescription('Reta a otra persona a un duelo RPG por turnos')
      .addUserOption((option) => option.setName('oponente').setDescription('Persona a quien quieres retar').setRequired(true)))
    .addSubcommand((sub) => sub.setName('entrenar').setDescription('Mejora un atributo por 180 monedas y 15 de energía')
      .addStringOption((option) => option.setName('atributo').setDescription('Atributo que quieres mejorar').setRequired(true)
        .addChoices({ name: '⚔️ Fuerza', value: 'strength' }, { name: '🛡️ Defensa', value: 'defense' }, { name: '💨 Agilidad', value: 'agility' })))
    .addSubcommand((sub) => sub.setName('tienda').setDescription('Abre el bazar de artículos RPG'))
    .addSubcommand((sub) => sub.setName('comprar').setDescription('Compra un artículo RPG con monedas de tu billetera')
      .addStringOption((option) => option.setName('articulo').setDescription('Artículo que quieres comprar').setRequired(true).setAutocomplete(true)))
    .addSubcommand((sub) => sub.setName('usar').setDescription('Usa un consumible o equipa un objeto RPG')
      .addStringOption((option) => option.setName('articulo').setDescription('Artículo de tu mochila').setRequired(true).setAutocomplete(true)))
    .addSubcommand((sub) => sub.setName('misiones').setDescription('Consulta y cobra tus encargos diarios'))
    .addSubcommand((sub) => sub.setName('ranking').setDescription('Muestra las mascotas con más nivel del servidor')),
  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({ content: 'El RPG está disponible dentro de un servidor.', flags: MessageFlags.Ephemeral });
      return;
    }
    const guildId = interaction.guildId; const userId = interaction.user.id; const action = interaction.options.getSubcommand();
    if (action === 'retar') {
      const opponent = interaction.options.getUser('oponente', true);
      if (opponent.bot) { await interaction.reply({ content: 'Solo puedes retar a una persona, no a un bot.', flags: MessageFlags.Ephemeral }); return; }
      const result = await createRpgPvpChallenge(guildId, userId, interaction.user.username, opponent.id, opponent.username, interaction.id);
      if (!result.ok) {
        const message = result.reason === 'self' ? 'No puedes retarte a ti mismo.'
          : result.reason === 'no_challenger_pet' ? 'Primero adopta una mascota con `/rpg adoptar`.'
            : result.reason === 'no_defender_pet' ? `${opponent} necesita adoptar una mascota RPG antes de aceptar.`
              : 'Tú o esa persona ya tienen un desafío o duelo RPG activo.';
        await interaction.reply({ content: `⚔️ ${message}`, flags: MessageFlags.Ephemeral }); return;
      }
      await interaction.reply(rpgPvpPanel(result.match));
      return;
    }
    if (action === 'panel' || action === 'misiones') {
      await interaction.reply(await rpgPanel(guildId, userId, interaction.user.username));
      return;
    }
    if (action === 'ataques') { await interaction.reply(await rpgBuildPanel(guildId, userId)); return; }
    if (action === 'nombrar') {
      const result = await renameRpgPet(guildId, userId, interaction.options.getString('nombre', true));
      const message = result.ok ? `🐾 Tu mascota ahora se llama **${result.pet.name}**. El nombre gratuito ya fue usado.` : result.reason === 'no_pet' ? 'Primero adopta una mascota con `/rpg adoptar`.' : result.reason === 'already_used' ? 'Ya usaste el cambio de nombre gratuito de esta mascota.' : 'Usa un nombre de 2 a 24 caracteres; evita menciones y formato de Discord.';
      await interaction.reply({ content: message, flags: MessageFlags.Ephemeral }); return;
    }
    if (action === 'bestiario') { await interaction.reply(rpgBestiaryPanel()); return; }
    if (action === 'tienda') { await interaction.reply(await rpgShopPanel(guildId, userId)); return; }
    if (action === 'adoptar') {
      const result = await adoptRpgPet(guildId, userId, interaction.options.getString('nombre') ?? '');
      await interaction.reply(result.ok
        ? { content: `🐾 ¡Llegó **${result.pet.name}**, tu ${result.pet.rarity.toLowerCase()} **${result.pet.species}**! Fuerza ${result.pet.strength} · Defensa ${result.pet.defense} · Agilidad ${result.pet.agility}. Abre /rpg panel para conocerla.`, flags: MessageFlags.Ephemeral }
        : { content: result.reason === 'invalid_name' ? 'El nombre debe tener de 2 a 24 caracteres y no puede incluir menciones ni formato de Discord.' : 'Ya tienes una mascota en este servidor. Puedes verla con `/rpg panel`.', flags: MessageFlags.Ephemeral });
      return;
    }
    if (action === 'explorar') {
      const result = await exploreRpg(guildId, userId, interaction.options.getString('zona', true), interaction.id);
      if (!result.ok) {
        const message = result.reason === 'no_pet' ? 'Primero adopta una mascota con `/rpg adoptar`.'
          : result.reason === 'zone_locked' ? 'Tu mascota todavía no tiene nivel suficiente para esa zona.'
            : result.reason === 'low_energy' ? 'Tu mascota necesita energía. Busca éter o bayas en el bazar.'
              : `Tu mascota está descansando. Prueba en **${Math.ceil((result.secondsRemaining ?? 0) / 60)} minutos**.`;
        await interaction.reply({ content: `🧭 ${message}`, flags: MessageFlags.Ephemeral }); return;
      }
      const story = result.events.map((event) => `${event.emoji} **${event.title}:** ${event.detail}`).join('\n');
      await interaction.reply({ content: `# 🧭 BITÁCORA DE EXPEDICIÓN\n${story}\n\n${result.message}\n❤️ ${result.pet.hp}/${result.pet.maxHp} PV · ⚡ ${result.pet.energy}/${result.pet.maxEnergy} energía.`, flags: MessageFlags.Ephemeral }); return;
    }
    if (action === 'combatir') {
      const result = await battleRpg(guildId, userId, interaction.id);
      if (!result.ok) {
        const message = result.reason === 'no_pet' ? 'Primero adopta una mascota con `/rpg adoptar`.'
          : result.reason === 'low_energy' ? 'Te falta energía para combatir. Usa un artículo de recuperación.' : 'Tu mascota quedó debilitada. Usa polvo de renacer en `/rpg usar`.';
        await interaction.reply({ content: `⚔️ ${message}`, flags: MessageFlags.Ephemeral }); return;
      }
      await interaction.reply({ content: `${result.message}\n❤️ ${result.pet.hp}/${result.pet.maxHp} PV · ⚡ ${result.pet.energy}/${result.pet.maxEnergy} energía.`, flags: MessageFlags.Ephemeral }); return;
    }
    if (action === 'entrenar') {
      const stat = interaction.options.getString('atributo', true) as 'strength' | 'defense' | 'agility';
      const result = await trainRpgPet(guildId, userId, stat, interaction.id);
      const message = result.ok ? `🏋️ Entrenamiento completado. ${stat === 'strength' ? 'Fuerza' : stat === 'defense' ? 'Defensa' : 'Agilidad'} ahora es **${result.pet[stat]}**. Saldo: **${result.balance} monedas**.`
        : result.reason === 'no_pet' ? 'Primero adopta una mascota con `/rpg adoptar`.' : result.reason === 'low_energy' ? 'Necesita 15 de energía para entrenar.' : 'No tienes las 180 monedas necesarias.';
      await interaction.reply({ content: message, flags: MessageFlags.Ephemeral }); return;
    }
    if (action === 'comprar') {
      const item = rpgItems.find((candidate) => candidate.id === interaction.options.getString('articulo', true))!;
      const result = await buyRpgItem(guildId, userId, item.id, interaction.id);
      await interaction.reply({ content: result.ok ? `${item.emoji} Compraste **${item.name}**. Mochila: x${result.quantity} · saldo: **${result.balance} monedas**.` : 'No tienes suficiente saldo para esa compra.', flags: MessageFlags.Ephemeral }); return;
    }
    if (action === 'usar') {
      const result = await useRpgItem(guildId, userId, interaction.options.getString('articulo', true), interaction.id);
      const message = result.ok ? result.message : result.reason === 'no_pet' ? 'Primero adopta una mascota.' : result.reason === 'missing_item' ? 'No tienes ese artículo en tu mochila.' : 'Ese objeto no se puede usar ahora; revisa los PV, energía o equipo.';
      await interaction.reply({ content: message, flags: MessageFlags.Ephemeral }); return;
    }
    if (action === 'ranking') {
      const ranking = await getRpgLeaderboard(guildId);
      const listing = ranking.length ? ranking.map((pet, index) => `**${index + 1}.** <@${pet.userId}> · **${pet.name}** (${pet.rarity}) · Nv. ${pet.level}`).join('\n') : 'Aún no hay mascotas en este servidor.';
      await interaction.reply({ content: `# 🏆 GREMIO · RANKING RPG\n${listing}`, flags: MessageFlags.Ephemeral });
    }
  },
};
