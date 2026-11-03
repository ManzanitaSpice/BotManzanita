import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { BotCommand } from '../types.js';
import { claimDaily, formatCooldown, getBalance, getInventory, getLeaderboard, storeItems, transferCoins, work } from '../services/economy.js';
import { economyPanel } from '../ui/panels.js';

export const economyCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('economia')
    .setDescription('Tu economía y recompensas del servidor')
    .addSubcommand((subcommand) => subcommand.setName('panel').setDescription('Abre tu panel privado de economía'))
    .addSubcommand((subcommand) => subcommand.setName('saldo').setDescription('Consulta tu saldo'))
    .addSubcommand((subcommand) => subcommand.setName('diaria').setDescription('Reclama tus monedas diarias'))
    .addSubcommand((subcommand) => subcommand.setName('trabajar').setDescription('Trabaja para ganar entre 35 y 80 monedas'))
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
    if (action === 'panel') {
      await interaction.reply(economyPanel(interaction.guildId, interaction.user.id));
      return;
    }
    if (action === 'saldo') {
      const balance = getBalance(interaction.guildId, interaction.user.id);
      await interaction.reply({ content: `💰 Tienes **${new Intl.NumberFormat('es-MX').format(balance)} monedas**.`, flags: MessageFlags.Ephemeral });
      return;
    }
    if (action === 'trabajar') {
      const result = work(interaction.guildId, interaction.user.id, interaction.id);
      if (!result.ok) {
        await interaction.reply({ content: `🧰 Ya trabajaste recientemente. Puedes volver en **${formatCooldown(result.secondsRemaining)}**.`, flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.reply({ content: `🪙 Terminaste tu turno y ganaste **${result.amount} monedas**. Saldo: **${result.balance}**.`, flags: MessageFlags.Ephemeral });
      return;
    }
    if (action === 'transferir') {
      const recipient = interaction.options.getUser('usuario', true);
      if (recipient.bot) {
        await interaction.reply({ content: 'No puedes transferir monedas a un bot.', flags: MessageFlags.Ephemeral });
        return;
      }
      const amount = interaction.options.getInteger('cantidad', true);
      const result = transferCoins(interaction.guildId, interaction.user.id, recipient.id, amount, interaction.id);
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
      const inventory = getInventory(interaction.guildId, interaction.user.id);
      const names = new Map<string, string>(storeItems.map((item) => [item.id, `${item.emoji} ${item.name}`]));
      const listing = inventory.length ? inventory.map((item) => names.get(item.itemId) ?? item.itemId).join('\n') : 'Tu inventario está vacío.';
      await interaction.reply({ content: `🎒 **Inventario de ${interaction.user.username}**\n${listing}`, flags: MessageFlags.Ephemeral });
      return;
    }
    if (action === 'ranking') {
      const ranking = getLeaderboard(interaction.guildId);
      const listing = ranking.length
        ? ranking.map((account, index) => `**${index + 1}.** <@${account.userId}> · ${new Intl.NumberFormat('es-MX').format(account.balance)} monedas`).join('\n')
        : 'Aún no hay cuentas en este servidor.';
      await interaction.reply({ content: `# 🏆 TOP DE ECONOMÍA\n${listing}` });
      return;
    }
    const result = claimDaily(interaction.guildId, interaction.user.id, interaction.id);
    if (!result.ok) {
      await interaction.reply({ content: `⏳ Ya reclamaste tu recompensa. Vuelve en **${formatCooldown(result.secondsRemaining)}**.`, flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({ content: `🎁 Reclamaste **${result.amount} monedas**. Tu saldo es **${result.balance}**.`, flags: MessageFlags.Ephemeral });
  },
};
