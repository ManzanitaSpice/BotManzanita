import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { BotCommand } from '../types.js';
import { adjustPremiumCurrency, claimDaily, crime, fish, formatCooldown, getBalance, getInventory, getLeaderboard, playItemRoulette, playRoulette, robPlayer, startBlackjack, storeItems, transferCoins, useShopItem, work } from '../services/economy.js';
import { bankPanel, blackjackPanel, casinoPanel, economyPanel, premiumStorePanel } from '../ui/panels.js';

export const economyCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('economia')
    .setDescription('Tu economía y recompensas del servidor')
    .addSubcommand((subcommand) => subcommand.setName('panel').setDescription('Abre tu panel privado de economía'))
    .addSubcommand((subcommand) => subcommand.setName('tienda_premium').setDescription('Abre la tienda de gemas administradas'))
    .addSubcommand((subcommand) => subcommand.setName('casino').setDescription('Abre el casino de monedas virtuales'))
    .addSubcommand((subcommand) => subcommand.setName('banco').setDescription('Abre tu banco y gestiona tus ahorros'))
    .addSubcommand((subcommand) => subcommand.setName('saldo').setDescription('Consulta tu saldo'))
    .addSubcommand((subcommand) => subcommand.setName('admin_moneda').setDescription('Administra gemas premium de una persona (requiere Gestionar servidor)')
      .addUserOption((option) => option.setName('usuario').setDescription('Persona que recibirá o perderá gemas').setRequired(true))
      .addIntegerOption((option) => option.setName('cantidad').setDescription('Positivo para otorgar; negativo para retirar').setRequired(true).setMinValue(-1_000_000).setMaxValue(1_000_000)))
    .addSubcommand((subcommand) => subcommand.setName('diaria').setDescription('Reclama tus monedas diarias'))
    .addSubcommand((subcommand) => subcommand.setName('trabajar').setDescription('Trabaja para ganar entre 35 y 80 monedas'))
    .addSubcommand((subcommand) => subcommand.setName('crimen').setDescription('Intenta un golpe: puedes ganar botín o pagar una multa'))
    .addSubcommand((subcommand) => subcommand.setName('pescar').setDescription('Pesca para ganar monedas cada 15 minutos'))
    .addSubcommand((subcommand) => subcommand.setName('robar').setDescription('Intenta robar monedas; puede salir mal')
      .addUserOption((option) => option.setName('usuario').setDescription('A quién intentar robar').setRequired(true)))
    .addSubcommand((subcommand) => subcommand.setName('ruleta').setDescription('Apuesta monedas en la ruleta')
      .addIntegerOption((option) => option.setName('cantidad').setDescription('Apuesta, máximo 100000').setRequired(true).setMinValue(1).setMaxValue(100000))
      .addStringOption((option) => option.setName('color').setDescription('Color al que apuestas').setRequired(true)
        .addChoices({ name: 'Rojo (2×)', value: 'rojo' }, { name: 'Negro (2×)', value: 'negro' }, { name: 'Verde / cero (36×)', value: 'verde' })))
    .addSubcommand((subcommand) => subcommand.setName('apostar_objeto').setDescription('Apuesta un artículo de tu inventario en la ruleta')
      .addStringOption((option) => option.setName('articulo').setDescription('Artículo consumible que arriesgarás').setRequired(true)
        .addChoices(...storeItems.map((item) => ({ name: `${item.emoji} ${item.name}`, value: item.id }))))
      .addStringOption((option) => option.setName('color').setDescription('El color al que apuestas').setRequired(true)
        .addChoices({ name: 'Rojo (premio 2× valor)', value: 'rojo' }, { name: 'Negro (premio 2× valor)', value: 'negro' }, { name: 'Verde / cero (premio 36× valor)', value: 'verde' })))
    .addSubcommand((subcommand) => subcommand.setName('usar').setDescription('Usa un artículo consumible de tu inventario')
      .addStringOption((option) => option.setName('articulo').setDescription('Artículo que quieres usar').setRequired(true)
        .addChoices(...storeItems.filter((item) => item.usable).map((item) => ({ name: `${item.emoji} ${item.name}`, value: item.id })))))
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
      await interaction.reply(await economyPanel(interaction.guildId, interaction.user.id));
      return;
    }
    if (action === 'tienda_premium') {
      await interaction.reply(await premiumStorePanel(interaction.guildId, interaction.user.id));
      return;
    }
    if (action === 'casino') {
      await interaction.reply(await casinoPanel(interaction.guildId, interaction.user.id));
      return;
    }
    if (action === 'banco') {
      await interaction.reply(await bankPanel(interaction.guildId, interaction.user.id));
      return;
    }
    if (action === 'saldo') {
      const balance = await getBalance(interaction.guildId, interaction.user.id);
      await interaction.reply({ content: `💰 Tienes **${new Intl.NumberFormat('es-MX').format(balance)} monedas**.`, flags: MessageFlags.Ephemeral });
      return;
    }
    if (action === 'trabajar') {
      const result = await work(interaction.guildId, interaction.user.id, interaction.id);
      if (!result.ok) {
        await interaction.reply({ content: `🧰 Ya trabajaste recientemente. Puedes volver en **${formatCooldown(result.secondsRemaining)}**.`, flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.reply({ content: `${result.message}\nSaldo: **${result.balance} monedas**.`, flags: MessageFlags.Ephemeral });
      return;
    }
    if (action === 'crimen') {
      const result = await crime(interaction.guildId, interaction.user.id, interaction.id);
      if (!result.ok) {
        await interaction.reply({ content: `🚨 Ya lo intentaste hace poco. Vuelve en **${formatCooldown(result.secondsRemaining)}**.`, flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.reply({ content: `${result.message}\nSaldo: **${new Intl.NumberFormat('es-MX').format(result.balance)} monedas**.`, flags: MessageFlags.Ephemeral });
      return;
    }
    if (action === 'pescar') {
      const result = await fish(interaction.guildId, interaction.user.id, interaction.id);
      if (!result.ok) {
        await interaction.reply({ content: `🎣 Ya saliste a pescar. Vuelve en **${formatCooldown(result.secondsRemaining)}**.`, flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.reply({ content: `${result.message}\nSaldo: **${result.balance} monedas**.`, flags: MessageFlags.Ephemeral });
      return;
    }
    if (action === 'robar') {
      const target = interaction.options.getUser('usuario', true);
      if (target.bot) {
        await interaction.reply({ content: 'No puedes robarle a un bot.', flags: MessageFlags.Ephemeral });
        return;
      }
      const result = await robPlayer(interaction.guildId, interaction.user.id, target.id, target.username, interaction.id);
      if (!result.ok) {
        const message = result.reason === 'self' ? 'No puedes robarte a ti mismo.'
          : result.reason === 'target_empty' ? `${target.username} no tiene monedas para robar.`
            : `Ya intentaste robar recientemente. Espera **${formatCooldown(result.secondsRemaining ?? 0)}**.`;
        await interaction.reply({ content: `🕵️ ${message}`, flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.reply({ content: `${result.message}\nTu saldo: **${result.balance} monedas**.`, flags: MessageFlags.Ephemeral });
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
      const colorEmoji = result.result === 'rojo' ? '🔴' : result.result === 'negro' ? '⚫' : '🟢';
      await interaction.reply({ content: `🎰 Salió **${result.number} ${colorEmoji} ${result.result}**.\n${result.message}\nSaldo: **${result.balance} monedas**.`, flags: MessageFlags.Ephemeral });
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
      await interaction.reply({ content: `🎰 ${result.message}\nTu saldo: **${result.balance} monedas**.`, flags: MessageFlags.Ephemeral });
      return;
    }
    if (action === 'usar') {
      const itemId = interaction.options.getString('articulo', true);
      const result = await useShopItem(interaction.guildId, interaction.user.id, itemId, interaction.id);
      if (!result.ok) {
        const message = result.reason === 'missing_item' ? 'No tienes ese artículo en tu inventario.'
          : result.reason === 'cooldown' ? `Espera **${formatCooldown(result.secondsRemaining ?? 0)}** para volver a pescar.`
            : 'Ese artículo no se puede usar.';
        await interaction.reply({ content: `🎒 ${message}`, flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.reply({ content: result.kind === 'fish' ? `${result.message}\nSaldo: **${result.balance} monedas**.` : result.message, flags: MessageFlags.Ephemeral });
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
      const inventory = await getInventory(interaction.guildId, interaction.user.id);
      const names = new Map<string, string>(storeItems.map((item) => [item.id, `${item.emoji} ${item.name}`]));
      const listing = inventory.length ? inventory.map((item) => `${names.get(item.itemId) ?? item.itemId}${item.quantity > 1 ? ` ×${item.quantity}` : ''}`).join('\n') : 'Tu inventario está vacío.';
      await interaction.reply({ content: `🎒 **Inventario de ${interaction.user.username}**\n${listing}`, flags: MessageFlags.Ephemeral });
      return;
    }
    if (action === 'ranking') {
      const ranking = await getLeaderboard(interaction.guildId);
      const listing = ranking.length
        ? ranking.map((account, index) => `**${index + 1}.** <@${account.userId}> · ${new Intl.NumberFormat('es-MX').format(account.balance)} monedas`).join('\n')
        : 'Aún no hay cuentas en este servidor.';
      await interaction.reply({ content: `# 🏆 TOP DE ECONOMÍA\n${listing}` });
      return;
    }
    const result = await claimDaily(interaction.guildId, interaction.user.id, interaction.id);
    if (!result.ok) {
      await interaction.reply({ content: `⏳ Ya reclamaste tu recompensa. Vuelve en **${formatCooldown(result.secondsRemaining)}**.`, flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({ content: `🎁 Reclamaste **${result.amount} monedas**. Tu saldo es **${result.balance}**.`, flags: MessageFlags.Ephemeral });
  },
};
