import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { BotCommand } from '../types.js';
import { adjustPremiumCurrency, businessGoods, claimDaily, consumeBusinessGood, createRoosterDuel, crime, economyJobs, fish, formatCooldown, getAccountBalances, getActiveJob, getBusinessOverview, getLeaderboard, MAX_JOB_LEVEL, payBusinessDebt, playItemRoulette, playRoulette, removeBusinessEmployee, requestBusinessEmployee, robPlayer, selectJob, sellBusinessGood, startBlackjack, storeItems, transferCoins, useShopItem, work } from '../services/economy.js';
import { balancePanel, bankPanel, blackjackPanel, casinoPanel, componentUpdate, economyActionPanel, economyPanel, inventoryPanel, leaderboardPanel, roosterDuelPanel } from '../ui/panels.js';
import { businessInvitePanel, businessPanel } from '../ui/business-panel.js';

export const economyCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('economia')
    .setDescription('Tu economía y recompensas globales')
    .addSubcommand((subcommand) => subcommand.setName('panel').setDescription('Abre tu panel privado de economía'))
    .addSubcommand((subcommand) => subcommand.setName('terreno').setDescription('Abre el panel de terreno, negocio y personal'))
    .addSubcommand((subcommand) => subcommand.setName('contratar').setDescription('Invita a una persona a trabajar en tu negocio')
      .addUserOption((option) => option.setName('usuario').setDescription('Persona con el mismo oficio activo').setRequired(true)))
    .addSubcommand((subcommand) => subcommand.setName('despedir').setDescription('Termina el contrato de una persona de tu negocio')
      .addUserOption((option) => option.setName('usuario').setDescription('Persona que quieres despedir').setRequired(true)))
    .addSubcommand((subcommand) => subcommand.setName('pagar_deuda').setDescription('Paga facturas pendientes de tu negocio'))
    .addSubcommand((subcommand) => subcommand.setName('vender_producto').setDescription('Vende productos obtenidos en tu negocio')
      .addStringOption((option) => option.setName('producto').setDescription('Producto de negocio que tienes en tu inventario').setRequired(true).setAutocomplete(true))
      .addIntegerOption((option) => option.setName('cantidad').setDescription('Unidades a vender').setMinValue(1).setMaxValue(1000)))
    .addSubcommand((subcommand) => subcommand.setName('casino').setDescription('Abre el casino de monedas virtuales'))
    .addSubcommand((subcommand) => subcommand.setName('banco').setDescription('Abre tu banco y gestiona tus ahorros'))
    .addSubcommand((subcommand) => subcommand.setName('saldo').setDescription('Consulta tu saldo'))
    .addSubcommand((subcommand) => subcommand.setName('admin_moneda').setDescription('Administra gemas premium de una persona (requiere Gestionar servidor)')
      .addUserOption((option) => option.setName('usuario').setDescription('Persona que recibirá o perderá gemas').setRequired(true))
      .addIntegerOption((option) => option.setName('cantidad').setDescription('Positivo para otorgar; negativo para retirar').setRequired(true).setMinValue(-1_000_000).setMaxValue(1_000_000)))
    .addSubcommand((subcommand) => subcommand.setName('diaria').setDescription('Reclama 75 monedas cada 24 horas'))
    .addSubcommand((subcommand) => subcommand.setName('trabajar').setDescription('Trabaja con tu oficio; los negocios pagan más y aplican otro cooldown'))
    .addSubcommand((subcommand) => subcommand.setName('empleo').setDescription('Consulta o elige tu oficio')
      .addStringOption((option) => option.setName('trabajo').setDescription('Oficio que quieres elegir')
        .addChoices(...economyJobs.map((job) => ({ name: `${job.emoji} ${job.name}`, value: job.id })))))
    .addSubcommand((subcommand) => subcommand.setName('crimen').setDescription('Intenta un golpe cada 4 horas: puedes ganar o pagar una multa'))
    .addSubcommand((subcommand) => subcommand.setName('pescar').setDescription('Pesca cada hora; necesitas una caña de pescar'))
    .addSubcommand((subcommand) => subcommand.setName('robar').setDescription('Intenta robar monedas o un artículo no cosmético; puede salir mal')
      .addUserOption((option) => option.setName('usuario').setDescription('A quién intentar robar').setRequired(true)))
    .addSubcommand((subcommand) => subcommand.setName('duelo_gallos').setDescription('Reta a alguien a un duelo de gallos con una apuesta para ambos')
      .addUserOption((option) => option.setName('usuario').setDescription('Persona a quien retas').setRequired(true))
      .addIntegerOption((option) => option.setName('apuesta').setDescription('Cada participante arriesga esta cantidad').setRequired(true).setMinValue(1).setMaxValue(100000)))
    .addSubcommand((subcommand) => subcommand.setName('ruleta').setDescription('Apuesta monedas en la ruleta')
      .addIntegerOption((option) => option.setName('cantidad').setDescription('Apuesta, máximo 100000').setRequired(true).setMinValue(1).setMaxValue(100000))
      .addStringOption((option) => option.setName('color').setDescription('Color al que apuestas').setRequired(true)
        .addChoices({ name: 'Rojo (2×)', value: 'rojo' }, { name: 'Negro (2×)', value: 'negro' }, { name: 'Verde / cero (36×)', value: 'verde' })))
    .addSubcommand((subcommand) => subcommand.setName('apostar_objeto').setDescription('Apuesta un artículo de tu inventario en la ruleta')
      .addStringOption((option) => option.setName('articulo').setDescription('Consumible que tienes y quieres arriesgar').setRequired(true).setAutocomplete(true))
      .addStringOption((option) => option.setName('color').setDescription('El color al que apuestas').setRequired(true)
        .addChoices({ name: 'Rojo (premio 2× valor)', value: 'rojo' }, { name: 'Negro (premio 2× valor)', value: 'negro' }, { name: 'Verde / cero (premio 36× valor)', value: 'verde' })))
    .addSubcommand((subcommand) => subcommand.setName('usar').setDescription('Usa un artículo consumible de tu inventario')
      .addStringOption((option) => option.setName('articulo').setDescription('Consumible de tu inventario').setRequired(true).setAutocomplete(true)))
    .addSubcommand((subcommand) => subcommand.setName('blackjack').setDescription('Juega veintiuno contra el crupier')
      .addIntegerOption((option) => option.setName('apuesta').setDescription('Apuesta, máximo 100000').setRequired(true).setMinValue(1).setMaxValue(100000)))
    .addSubcommand((subcommand) => subcommand.setName('transferir').setDescription('Envía monedas a otra persona')
      .addUserOption((option) => option.setName('usuario').setDescription('Quién recibirá las monedas').setRequired(true))
      .addIntegerOption((option) => option.setName('cantidad').setDescription('Cantidad de monedas').setRequired(true).setMinValue(1)))
    .addSubcommand((subcommand) => subcommand.setName('inventario').setDescription('Consulta los artículos que tienes'))
    .addSubcommand((subcommand) => subcommand.setName('ranking').setDescription('Muestra a quienes tienen más monedas')),
  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({ content: 'La economía solo está disponible dentro de un servidor.', flags: MessageFlags.Ephemeral });
      return;
    }
    const action = interaction.options.getSubcommand();
    if (action === 'admin_moneda') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({ content: 'Necesitas el permiso **Gestionar servidor** para administrar gemas premium.', flags: MessageFlags.Ephemeral });
        return;
      }
      const target = interaction.options.getUser('usuario', true);
      const amount = interaction.options.getInteger('cantidad', true);
      const result = await adjustPremiumCurrency(interaction.guildId, target.id, amount, interaction.user.id, interaction.id);
      const content = result.ok ? `💎 ${amount > 0 ? 'Otorgaste' : 'Retiraste'} **${Math.abs(amount).toLocaleString('es-MX')} gemas premium** ${amount > 0 ? 'a' : 'de'} ${target}. Saldo premium: **${result.balance.toLocaleString('es-MX')}**.`
        : result.reason === 'invalid_amount' ? 'La cantidad debe ser distinta de cero y no superar 1,000,000 en valor absoluto.' : `${target} solo tiene **${result.balance.toLocaleString('es-MX')} gemas premium**.`;
      await interaction.reply({ content, flags: MessageFlags.Ephemeral });
      return;
    }
    if (action === 'panel') {
      await interaction.reply(await economyPanel(interaction.guildId, interaction.user.id, interaction.user.username, interaction.user.displayAvatarURL({extension:'png',size:256})));
      return;
    }
    if (action === 'terreno') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await interaction.editReply(componentUpdate(await businessPanel(interaction.guildId, interaction.user.id)));
      return;
    }
    if (action === 'pagar_deuda') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const result = await payBusinessDebt(interaction.guildId, interaction.user.id, interaction.id);
      const notice = result.ok ? result.message ?? 'La operación se completó.'
        : result.reason === 'not_found' ? 'Primero compra un terreno desde /economia terreno.'
          : result.reason === 'no_debt' ? 'Tu negocio no tiene facturas pendientes.'
            : result.reason === 'insufficient_funds' ? 'No tienes monedas suficientes para cubrir esta operación.'
              : 'No se pudo completar la operación.';
      await interaction.editReply(componentUpdate(await businessPanel(interaction.guildId, interaction.user.id, undefined, notice)));
      return;
    }
    if (action === 'contratar') {
      const target = interaction.options.getUser('usuario', true);
      if (target.bot || target.id === interaction.user.id) {
        await interaction.reply({ content: 'Elige a otra persona; no se puede contratar a bots ni a ti mismo.', flags: MessageFlags.Ephemeral });
        return;
      }
      const result = await requestBusinessEmployee(interaction.guildId, interaction.user.id, target.id, target.username);
      if (!result.ok) {
        const reason = result.reason === 'not_found' ? 'Primero compra y construye un terreno.'
          : result.reason === 'not_ready' ? 'Tu negocio todavía no está abierto.'
            : result.reason === 'wrong_job' ? 'La persona debe tener activo el mismo oficio que tu negocio.'
              : result.reason === 'staff_limit' ? 'Tu negocio ya alcanzó el límite de personal.'
                : 'Esa persona ya tiene un contrato o invitación pendiente.';
        await interaction.reply({ content: '💼 ' + reason, flags: MessageFlags.Ephemeral });
        return;
      }
      const jobName = (await getBusinessOverview(interaction.guildId, interaction.user.id))?.job.name ?? 'tu oficio';
      await interaction.reply({ ...businessInvitePanel(interaction.user.id, target.id, interaction.user.username, jobName), allowedMentions: { users: [target.id], parse: [] } });
      return;
    }
    if (action === 'despedir') {
      const target = interaction.options.getUser('usuario', true);
      const result = await removeBusinessEmployee(interaction.guildId, interaction.user.id, target.id);
      await interaction.reply({ content: result.ok ? result.message ?? 'Contrato terminado.' : 'No tienes a esa persona contratada en tu negocio.', flags: MessageFlags.Ephemeral });
      return;
    }
    if (action === 'vender_producto') {
      const itemId = interaction.options.getString('producto', true);
      const quantity = interaction.options.getInteger('cantidad') ?? 1;
      const result = await sellBusinessGood(interaction.guildId, interaction.user.id, itemId, quantity, interaction.id);
      const text = result.ok ? result.message ?? 'Venta completada.'
        : result.reason === 'no_items' ? 'No tienes esa cantidad en el inventario.'
          : result.reason === 'quantity' ? 'La cantidad debe estar entre 1 y 1000.'
            : 'Ese producto no está disponible para vender.';
      await interaction.reply({ content: '🏪 ' + text, flags: MessageFlags.Ephemeral });
      return;
    }
    if (action === 'casino') {
      await interaction.reply(await casinoPanel(interaction.guildId, interaction.user.id));
      return;
    }
    if (action === 'banco') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await interaction.editReply(componentUpdate(await bankPanel(interaction.guildId, interaction.user.id)));
      return;
    }
    if (action === 'saldo') {
      const balance = await getAccountBalances(interaction.guildId, interaction.user.id);
      await interaction.reply(balancePanel(interaction.user.username, balance));
      return;
    }
    if (action === 'empleo') {
      const jobId = interaction.options.getString('trabajo');
      if (jobId) {
        const result = await selectJob(interaction.guildId, interaction.user.id, jobId);
        if (!result.ok) { await interaction.reply({ content: 'Ese trabajo no está disponible.', flags: MessageFlags.Ephemeral }); return; }
        await interaction.reply({ content: `✅ Elegiste **${result.progress.job.name}** · nivel ${result.progress.level}. Necesitas **${result.progress.job.toolName}** para trabajar; cómpralo en /shop o a!shop. Cada turno de trabajo da experiencia y puede subir el nivel.`, flags: MessageFlags.Ephemeral });
        return;
      }
      const active = await getActiveJob(interaction.guildId, interaction.user.id);
      const status = active
        ? `Tu oficio actual es **${active.job.name} · nivel ${active.level}**${active.level >= MAX_JOB_LEVEL ? ' (nivel máximo)' : ` · ${active.xp}/${active.xpToNext} XP`}.`
        : 'Todavía no elegiste un oficio.';
      await interaction.reply({ content: `${status} Elige uno en la opción **trabajo** de este comando. Cada oficio requiere comprar su herramienta en la tienda.`, flags: MessageFlags.Ephemeral });
      return;
    }
    if (action === 'trabajar') {
      const result = await work(interaction.guildId, interaction.user.id, interaction.id);
      if (!result.ok) {
        const content = result.reason === 'no_job' ? 'Primero elige un oficio con `/economia empleo` o `a!jobs`.'
          : result.reason === 'missing_tool' ? `Para trabajar como **${result.job?.name ?? 'este oficio'}** necesitas **${result.job?.toolName ?? 'su herramienta'}**. Cómprala en /shop o a!shop.`
            : result.reason === 'business_funds' ? '💼 Las ventas no cubren toda la nómina de este turno. Reduce personal o mejora el negocio; no se descontó dinero.'
            : result.reason === 'business_closed' ? '🚫 Tu negocio fue clausurado por inactividad. Abre `/economia terreno` y paga la multa para reabrirlo.'
              : result.reason === 'business_pest' ? '🐀 Hay una plaga activa. Abre `/economia terreno` y paga el exterminio antes de trabajar.'
              : `🧰 Ya trabajaste recientemente. Puedes volver en **${formatCooldown(result.secondsRemaining ?? 0)}**.`;
        await interaction.reply({ content, flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.reply(economyActionPanel('🧰 Trabajo completado', result.message, result.amount, result.balance));
      return;
    }
    if (action === 'crimen') {
      const result = await crime(interaction.guildId, interaction.user.id, interaction.id);
      if (!result.ok) {
        await interaction.reply({ content: `🚨 Ya lo intentaste hace poco. Vuelve en **${formatCooldown(result.secondsRemaining)}**.`, flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.reply(economyActionPanel(result.success ? '🕶️ Golpe exitoso' : '🚨 Golpe fallido', result.message, result.success ? result.amount : -result.amount, result.balance));
      return;
    }
    if (action === 'pescar') {
      const result = await fish(interaction.guildId, interaction.user.id, interaction.id);
      if (!result.ok) {
        const content = result.reason === 'missing_rod' ? 'Necesitas una **Caña de pescar**. Cómprala en `/shop` o `a!shop`.'
          : `🎣 Ya saliste a pescar. Vuelve en **${formatCooldown(result.secondsRemaining ?? 0)}**.`;
        await interaction.reply({ content, flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.reply(economyActionPanel('🎣 Pesca', result.message, result.amount, result.balance));
      return;
    }
    if (action === 'robar') {
      const target = interaction.options.getUser('usuario', true);
      if (target.bot) {
        await interaction.reply({ content: 'No puedes robarle a un bot.', flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const result = await robPlayer(interaction.guildId, interaction.user.id, target.id, target.username, interaction.id);
      if (!result.ok) {
        const message = result.reason === 'self' ? 'No puedes robarte a ti mismo.'
          : result.reason === 'target_empty' ? `${target.username} no tiene monedas ni artículos robables.`
            : `Ya intentaste robar recientemente. Espera **${formatCooldown(result.secondsRemaining ?? 0)}**.`;
        await interaction.editReply({ content: `🕵️ ${message}` });
        return;
      }
      if (result.stolenItem) { await interaction.editReply({ content: result.message }); return; }
      await interaction.editReply(componentUpdate(economyActionPanel(result.success ? '🕵️ Robo exitoso' : result.protected ? '🛡️ Robo bloqueado' : '🕵️ Robo fallido', result.message, result.success ? result.amount : -result.amount, result.balance)));
      return;
    }
    if (action === 'duelo_gallos') {
      const opponent = interaction.options.getUser('usuario', true);
      if (opponent.bot) { await interaction.reply({ content: 'Solo puedes retar a otra persona, no a un bot.', flags: MessageFlags.Ephemeral }); return; }
      await interaction.deferReply();
      const result = await createRoosterDuel(interaction.guildId, interaction.user.id, interaction.user.username, opponent.id, opponent.username, interaction.options.getInteger('apuesta', true));
      if (!result.ok) {
        const message = result.reason === 'self' ? 'No puedes retarte a ti mismo.'
          : result.reason === 'invalid_bet' ? 'La apuesta debe estar entre 1 y 100000 monedas.'
            : result.reason === 'insufficient_funds' ? 'No tienes saldo suficiente para cubrir tu parte de la apuesta.'
              : 'Tú o esa persona ya tienen un reto de gallos pendiente.';
        await interaction.editReply({ content: `🐓 ${message}` });
        return;
      }
      await interaction.editReply(roosterDuelPanel(result.duel));
      return;
    }
    if (action === 'ruleta') {
      const result = await playRoulette(
        interaction.guildId,
        interaction.user.id,
        interaction.options.getInteger('cantidad', true),
        interaction.options.getString('color', true) as 'rojo' | 'negro' | 'verde',
        interaction.id,
      );
      if (!result.ok) {
        const message = result.reason === 'invalid_bet' ? 'La apuesta debe estar entre 1 y 100000 monedas.' : 'No tienes suficientes monedas para esa apuesta.';
        await interaction.reply({ content: `🎰 ${message}`, flags: MessageFlags.Ephemeral });
        return;
      }
      const ball = result.result === 'rojo' ? '🔴 rojo' : result.result === 'negro' ? '⚫ negro' : '🟢 verde';
      await interaction.reply(economyActionPanel('🎰 Ruleta', `La bola cayó en **${result.number} ${ball}**. ${result.message}`, result.payout - result.bet, result.balance));
      return;
    }
    if (action === 'apostar_objeto') {
      const result = await playItemRoulette(
        interaction.guildId,
        interaction.user.id,
        interaction.options.getString('articulo', true),
        interaction.options.getString('color', true) as 'rojo' | 'negro' | 'verde',
        interaction.id,
      );
      if (!result.ok) {
        const message = result.reason === 'missing_item' ? 'No tienes una unidad de ese artículo para apostar.' : 'Ese artículo no se puede apostar.';
        await interaction.reply({ content: `🎒 ${message}`, flags: MessageFlags.Ephemeral });
        return;
      }
      const itemCost = storeItems.find((item) => item.name === result.itemName)?.cost ?? 0;
      await interaction.reply(economyActionPanel('🎒 Apuesta de objeto', result.message, result.payout ? result.payout : -itemCost, result.balance));
      return;
    }
    if (action === 'usar') {
      const itemId = interaction.options.getString('articulo', true);
      if (businessGoods.some((item) => item.id === itemId && item.usable)) {
        const result = await consumeBusinessGood(interaction.guildId, interaction.user.id, itemId, interaction.id);
        const message = result.ok ? result.message ?? 'Consumible utilizado.'
          : result.reason === 'no_items' ? 'No tienes ese producto en tu inventario.'
            : result.reason === 'staff_limit' ? 'Ya tienes dos turnos de negocio potenciados pendientes.'
              : result.reason === 'not_ready' ? 'Ese consumible requiere un negocio activo de su oficio.'
                : 'Ese producto no se puede usar en tu negocio.';
        await interaction.reply({ content: `🏪 ${message}`, flags: MessageFlags.Ephemeral });
        return;
      }
      const result = await useShopItem(interaction.guildId, interaction.user.id, itemId, interaction.id);
      if (!result.ok) {
        const message = result.reason === 'missing_item' ? 'No tienes ese artículo en tu inventario.'
          : result.reason === 'missing_rod' ? 'Necesitas una Caña de pescar para usar cebo.'
          : result.reason === 'cooldown' ? `Espera **${formatCooldown(result.secondsRemaining ?? 0)}** para volver a pescar.`
          : result.reason === 'no_job' ? 'Primero elige un oficio con `/economia empleo`.'
          : result.reason === 'missing_tool' ? 'Necesitas tener la herramienta de tu oficio para usar este artículo.'
          : result.reason === 'not_needed' ? itemId === 'manual_oficio' ? 'Este oficio ya alcanzó el nivel máximo.' : 'Tu herramienta ya está completamente reparada.'
            : 'Ese artículo no se puede usar.';
        await interaction.reply({ content: `🎒 ${message}`, flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.reply(result.kind === 'fish' ? economyActionPanel('🎣 Cebo utilizado', result.message, result.amount, result.balance) : { content: result.message, flags: MessageFlags.Ephemeral });
      return;
    }
    if (action === 'blackjack') {
      const result = await startBlackjack(interaction.guildId, interaction.user.id, interaction.options.getInteger('apuesta', true), interaction.id);
      if (!result.ok) {
        const message = result.reason === 'invalid_bet' ? 'La apuesta debe estar entre 1 y 100000 monedas.' : 'No tienes suficientes monedas para esa apuesta.';
        await interaction.reply({ content: `🃏 ${message}`, flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.reply(blackjackPanel(result.view));
      return;
    }
    if (action === 'transferir') {
      const recipient = interaction.options.getUser('usuario', true);
      if (recipient.bot) {
        await interaction.reply({ content: 'No puedes transferir monedas a un bot.', flags: MessageFlags.Ephemeral });
        return;
      }
      const amount = interaction.options.getInteger('cantidad', true);
      const result = await transferCoins(interaction.guildId, interaction.user.id, recipient.id, amount, interaction.id);
      if (!result.ok) {
        const message = result.reason === 'self' ? 'No puedes enviarte monedas a ti mismo.'
          : result.reason === 'insufficient_funds' ? 'No tienes suficientes monedas para esa transferencia.'
            : 'La cantidad no es válida.';
        await interaction.reply({ content: `❌ ${message}`, flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.reply({ content: `💸 Enviaste **${amount} monedas** a ${recipient}. Te quedan **${result.fromBalance}**.`, flags: MessageFlags.Ephemeral });
      return;
    }
    if (action === 'inventario') {
      await interaction.reply({ ...(await inventoryPanel(interaction.guildId, interaction.user.id)), flags: ['IsComponentsV2', 'Ephemeral'] });
      return;
    }
    if (action === 'ranking') {
      const ranking = await getLeaderboard(interaction.guildId);
      const listing = ranking.map((account) => `<@${account.userId}>  ·  **${new Intl.NumberFormat('es-MX').format(account.balance)}** monedas`);
      await interaction.reply({ ...leaderboardPanel('🏆 TOP DE ECONOMÍA', 'Las mayores fortunas globales', listing, 0x22c55e, 'Aún no hay cuentas registradas.'), allowedMentions: { parse: [] } });
      return;
    }
    const result = await claimDaily(interaction.guildId, interaction.user.id, interaction.id);
    if (!result.ok) {
      await interaction.reply({ content: `⏳ Ya reclamaste tu recompensa. Vuelve en **${formatCooldown(result.secondsRemaining)}**.`, flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply(economyActionPanel('🎁 Recompensa diaria', 'Tu recompensa de hoy ya está en tu billetera.', result.amount, result.balance));
  },
};
