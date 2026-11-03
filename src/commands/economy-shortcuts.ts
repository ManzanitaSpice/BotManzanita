import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { BotCommand } from '../types.js';
import { balancePanel, economyActionPanel, leaderboardPanel } from '../ui/panels.js';
import {
  claimDaily,
  crime,
  fish,
  formatCooldown,
  getAccountBalances,
  getLeaderboard,
  playRoulette,
  robPlayer,
  startBlackjack,
  transferCoins,
  work,
} from '../services/economy.js';
import {
  bankPanel,
  blackjackPanel,
  economyPanel,
  inventoryPanel,
  storePanel,
} from '../ui/panels.js';
import { profileCardPanel } from '../ui/profile.js';
import { giveReputation } from '../services/profile.js';

export const economyShortcutCommands: BotCommand[] = [
  createBalanceCommand('bal'),
  createBalanceCommand('balance'),
  createTopCommand('top'),
  createTopCommand('baltop'),
  createProfileCommand('profile'),
  createProfileCommand('perfil'),
  createWalletCommand(),
  createRankCardCommand(),
  createReputationCommand(),
  createEconomyPanelCommand(),
  createFishCommand(),
  createBlackjackCommand('21'),
  createBlackjackCommand('bj'),
  createDailyCommand(),
  createWorkCommand(),
  createCrimeCommand(),
  createRobCommand(),
  createRouletteCommand(),
  createBankCommand(),
  createStoreCommand(),
  createInventoryCommand(),
  createPayCommand(),
];

function createBalanceCommand(name: 'bal' | 'balance'): BotCommand {
  return {
    data: new SlashCommandBuilder()
      .setName(name)
      .setDescription('Consulta billetera, banco y patrimonio total.')
      .addUserOption((option) => option.setName('usuario').setDescription('Miembro que quieres consultar')),
    async execute(interaction) {
      if (!interaction.guildId) {
        await interaction.reply({ content: 'La economía solo está disponible dentro de un servidor.', flags: MessageFlags.Ephemeral });
        return;
      }
      const target = interaction.options.getUser('usuario') ?? interaction.user;
      const account = await getAccountBalances(interaction.guildId, target.id);
      await interaction.reply(balancePanel(target.username, account));
    },
  };
}

function createTopCommand(name: 'top' | 'baltop'): BotCommand {
  return {
    data: new SlashCommandBuilder().setName(name).setDescription('Muestra el ranking económico global.'),
    async execute(interaction) {
      if (!interaction.guildId) {
        await interaction.reply({ content: 'El ranking solo está disponible dentro de un servidor.', flags: MessageFlags.Ephemeral });
        return;
      }
      const ranking = await getLeaderboard(interaction.guildId);
      const listing = ranking.map((account) => `<@${account.userId}>  ·  **${new Intl.NumberFormat('es-MX').format(account.balance)}** monedas`);
      await interaction.reply({ ...leaderboardPanel('🏆 TOP DE ECONOMÍA', 'Las mayores fortunas globales', listing, 0x22c55e, 'Todavía no hay balances registrados.'), allowedMentions: { parse: [] } });
    },
  };
}

function createProfileCommand(name: 'profile' | 'perfil'): BotCommand {
  return {
    data: new SlashCommandBuilder().setName(name).setDescription('Abre tu tarjeta global de perfil.').addUserOption((option) => option.setName('usuario').setDescription('Perfil que quieres visitar')),
    async execute(interaction) {
      if (!interaction.guildId) {
        await interaction.reply({ content: 'El perfil solo está disponible dentro de un servidor.', flags: MessageFlags.Ephemeral });
        return;
      }
      const target = interaction.options.getUser('usuario') ?? interaction.user;
      await interaction.reply(await profileCardPanel(interaction.guildId, target, interaction.user.id));
    },
  };
}

function createWalletCommand(): BotCommand {
  return {
    data: new SlashCommandBuilder().setName('wallet').setDescription('Muestra tu tarjeta visual de billetera.'),
    async execute(interaction) {
      if (!interaction.guildId) { await interaction.reply({ content: 'La cartera solo está disponible dentro de un servidor.', flags: MessageFlags.Ephemeral }); return; }
      await interaction.reply(await profileCardPanel(interaction.guildId, interaction.user, interaction.user.id, 'wallet'));
    },
  };
}

function createRankCardCommand():BotCommand{
  return {data:new SlashCommandBuilder().setName('rank').setDescription('Muestra tu tarjeta de rango global.'),async execute(interaction){if(!interaction.guildId){await interaction.reply({content:'La tarjeta de rango solo funciona dentro de un servidor.',flags:MessageFlags.Ephemeral});return;}await interaction.reply(await profileCardPanel(interaction.guildId,interaction.user,interaction.user.id,'rank'));}};
}

function createReputationCommand():BotCommand{
  return {data:new SlashCommandBuilder().setName('rep').setDescription('Reconoce a otra persona con reputación.').addUserOption((option)=>option.setName('usuario').setDescription('Persona a reconocer').setRequired(true)),async execute(interaction){const target=interaction.options.getUser('usuario',true);const result=await giveReputation(interaction.user.id,target.id);await interaction.reply({content:result.ok?`✨ Le diste reputación a **${target.username}**. Ahora tiene **${result.reputation}**.`:target.id===interaction.user.id?'No puedes darte reputación a ti.':'Ya reconociste a esa persona hoy.',flags:MessageFlags.Ephemeral});}};
}

function createEconomyPanelCommand(): BotCommand {
  return {
    data: new SlashCommandBuilder().setName('eco').setDescription('Abre el panel rápido de economía.'),
    async execute(interaction) {
      if (!interaction.guildId) {
        await interaction.reply({ content: 'La economía solo está disponible dentro de un servidor.', flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.reply(await economyPanel(interaction.guildId, interaction.user.id, interaction.user.username));
    },
  };
}

function createFishCommand(): BotCommand {
  return {
    data: new SlashCommandBuilder().setName('fish').setDescription('Pesca para ganar monedas cada 30 minutos.'),
    async execute(interaction) {
      if (!interaction.guildId) {
        await interaction.reply({ content: 'La pesca solo está disponible dentro de un servidor.', flags: MessageFlags.Ephemeral });
        return;
      }
      const result = await fish(interaction.guildId, interaction.user.id, interaction.id);
      if (!result.ok) { await interaction.reply({ content: `🎣 Ya saliste a pescar. Vuelve en **${formatCooldown(result.secondsRemaining)}**.`, flags: MessageFlags.Ephemeral }); return; }
      await interaction.reply(economyActionPanel('🎣 Pesca', result.message, result.amount, result.balance));
    },
  };
}

function createBlackjackCommand(name: '21' | 'bj'): BotCommand {
  return {
    data: new SlashCommandBuilder().setName(name).setDescription('Juega veintiuno contra el crupier.')
      .addIntegerOption((option) => option.setName('apuesta').setDescription('Cantidad de monedas, máximo 100000').setRequired(true).setMinValue(1).setMaxValue(100_000)),
    async execute(interaction) {
      if (!interaction.guildId) {
        await interaction.reply({ content: 'Veintiuno solo está disponible dentro de un servidor.', flags: MessageFlags.Ephemeral });
        return;
      }
      const result = await startBlackjack(interaction.guildId, interaction.user.id, interaction.options.getInteger('apuesta', true), interaction.id);
      if (!result.ok) {
        const message = result.reason === 'invalid_bet' ? 'La apuesta debe ser de 1 a 100000 monedas.' : 'No tienes suficientes monedas para esa apuesta.';
        await interaction.reply({ content: `🃏 ${message}`, flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.reply(blackjackPanel(result.view));
    },
  };
}

function createDailyCommand(): BotCommand {
  return {
    data: new SlashCommandBuilder().setName('daily').setDescription('Reclama tu recompensa diaria de monedas.'),
    async execute(interaction) {
      if (!interaction.guildId) {
        await interaction.reply({ content: 'La economía solo está disponible dentro de un servidor.', flags: MessageFlags.Ephemeral });
        return;
      }
      const result = await claimDaily(interaction.guildId, interaction.user.id, interaction.id);
      if (!result.ok) { await interaction.reply({ content: `⏳ Ya reclamaste tu diaria. Vuelve en **${formatCooldown(result.secondsRemaining)}**.`, flags: MessageFlags.Ephemeral }); return; }
      await interaction.reply(economyActionPanel('🎁 Recompensa diaria', 'Tu recompensa de hoy ya está en tu billetera.', result.amount, result.balance));
    },
  };
}

function createWorkCommand(): BotCommand {
  return {
    data: new SlashCommandBuilder().setName('work').setDescription('Trabaja para ganar monedas cada 45 minutos.'),
    async execute(interaction) {
      if (!interaction.guildId) {
        await interaction.reply({ content: 'La economía solo está disponible dentro de un servidor.', flags: MessageFlags.Ephemeral });
        return;
      }
      const result = await work(interaction.guildId, interaction.user.id, interaction.id);
      if (!result.ok) { await interaction.reply({ content: `🧰 Ya trabajaste. Vuelve en **${formatCooldown(result.secondsRemaining)}**.`, flags: MessageFlags.Ephemeral }); return; }
      await interaction.reply(economyActionPanel('🧰 Trabajo completado', result.message, result.amount, result.balance));
    },
  };
}

function createCrimeCommand(): BotCommand {
  return {
    data: new SlashCommandBuilder().setName('crime').setDescription('Intenta un golpe: puedes ganar botín o pagar una multa.'),
    async execute(interaction) {
      if (!interaction.guildId) {
        await interaction.reply({ content: 'La economía solo está disponible dentro de un servidor.', flags: MessageFlags.Ephemeral });
        return;
      }
      const result = await crime(interaction.guildId, interaction.user.id, interaction.id);
      if (!result.ok) { await interaction.reply({ content: `🚨 Ya lo intentaste hace poco. Vuelve en **${formatCooldown(result.secondsRemaining)}**.`, flags: MessageFlags.Ephemeral }); return; }
      await interaction.reply(economyActionPanel(result.success ? '🕶️ Golpe exitoso' : '🚨 Golpe fallido', result.message, result.success ? result.amount : -result.amount, result.balance));
    },
  };
}

function createRobCommand(): BotCommand {
  return {
    data: new SlashCommandBuilder().setName('rob').setDescription('Intenta robar monedas a otro miembro; puede salir mal.')
      .addUserOption((option) => option.setName('usuario').setDescription('Miembro al que intentar robar').setRequired(true)),
    async execute(interaction) {
      if (!interaction.guildId) {
        await interaction.reply({ content: 'El robo solo está disponible dentro de un servidor.', flags: MessageFlags.Ephemeral });
        return;
      }
      const target = interaction.options.getUser('usuario', true);
      if (target.bot) {
        await interaction.reply({ content: 'No puedes robarle a un bot.', flags: MessageFlags.Ephemeral });
        return;
      }
      const result = await robPlayer(interaction.guildId, interaction.user.id, target.id, target.username, interaction.id);
      if (!result.ok) {
        const message = result.reason === 'self' ? 'No puedes robarte a ti mismo.'
          : result.reason === 'target_empty' ? `${target.username} no tiene monedas para robar.`
            : `Ya intentaste robar. Espera **${formatCooldown(result.secondsRemaining ?? 0)}**.`;
        await interaction.reply({ content: `🕵️ ${message}`, flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.reply(economyActionPanel(result.success ? '🕵️ Robo exitoso' : result.protected ? '🛡️ Robo bloqueado' : '🕵️ Robo fallido', result.message, result.success ? result.amount : -result.amount, result.balance));
    },
  };
}

function createRouletteCommand(): BotCommand {
  return {
    data: new SlashCommandBuilder().setName('roulette').setDescription('Apuesta monedas en la ruleta.')
      .addIntegerOption((option) => option.setName('cantidad').setDescription('Cantidad, máximo 100000').setRequired(true).setMinValue(1).setMaxValue(100_000))
      .addStringOption((option) => option.setName('color').setDescription('Color al que apuestas').setRequired(true)
        .addChoices({ name: 'Rojo (2×)', value: 'rojo' }, { name: 'Negro (2×)', value: 'negro' }, { name: 'Verde (36×)', value: 'verde' })),
    async execute(interaction) {
      if (!interaction.guildId) {
        await interaction.reply({ content: 'La ruleta solo está disponible dentro de un servidor.', flags: MessageFlags.Ephemeral });
        return;
      }
      const result = await playRoulette(interaction.guildId, interaction.user.id,
        interaction.options.getInteger('cantidad', true),
        interaction.options.getString('color', true) as 'rojo' | 'negro' | 'verde', interaction.id);
      if (!result.ok) {
        const message = result.reason === 'invalid_bet' ? 'La apuesta debe ser de 1 a 100000 monedas.' : 'No tienes suficiente balance.';
        await interaction.reply({ content: `🎰 ${message}`, flags: MessageFlags.Ephemeral });
        return;
      }
      const ball = result.result === 'rojo' ? '🔴 rojo' : result.result === 'negro' ? '⚫ negro' : '🟢 verde';
      await interaction.reply(economyActionPanel('🎰 Ruleta', `La bola cayó en **${result.number} ${ball}**. ${result.message}`, result.payout - result.bet, result.balance));
    },
  };
}

function createBankCommand(): BotCommand {
  return {
    data: new SlashCommandBuilder().setName('bank').setDescription('Abre el banco para administrar tus ahorros.'),
    async execute(interaction) {
      if (!interaction.guildId) {
        await interaction.reply({ content: 'El banco solo está disponible dentro de un servidor.', flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.reply(await bankPanel(interaction.guildId, interaction.user.id));
    },
  };
}

function createStoreCommand(): BotCommand {
  return {
    data: new SlashCommandBuilder().setName('shop').setDescription('Abre la tienda de artículos utilizables.'),
    async execute(interaction) {
      if (!interaction.guildId) {
        await interaction.reply({ content: 'La tienda solo está disponible dentro de un servidor.', flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.reply(await storePanel(interaction.guildId, interaction.user.id));
    },
  };
}

function createInventoryCommand(): BotCommand {
  return {
    data: new SlashCommandBuilder().setName('inventory').setDescription('Abre tu inventario para usar artículos.'),
    async execute(interaction) {
      if (!interaction.guildId) {
        await interaction.reply({ content: 'El inventario solo está disponible dentro de un servidor.', flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.reply(await inventoryPanel(interaction.guildId, interaction.user.id));
    },
  };
}

function createPayCommand(): BotCommand {
  return {
    data: new SlashCommandBuilder().setName('pay').setDescription('Transfiere monedas a otro miembro.')
      .addUserOption((option) => option.setName('usuario').setDescription('Quién recibirá las monedas').setRequired(true))
      .addIntegerOption((option) => option.setName('cantidad').setDescription('Cantidad de monedas').setRequired(true).setMinValue(1)),
    async execute(interaction) {
      if (!interaction.guildId) {
        await interaction.reply({ content: 'Las transferencias solo están disponibles dentro de un servidor.', flags: MessageFlags.Ephemeral });
        return;
      }
      const target = interaction.options.getUser('usuario', true);
      if (target.bot) {
        await interaction.reply({ content: 'No puedes transferir monedas a un bot.', flags: MessageFlags.Ephemeral });
        return;
      }
      const amount = interaction.options.getInteger('cantidad', true);
      const result = await transferCoins(interaction.guildId, interaction.user.id, target.id, amount, interaction.id);
      if (!result.ok) {
        const message = result.reason === 'self' ? 'No puedes enviarte monedas a ti mismo.'
          : result.reason === 'insufficient_funds' ? 'No tienes suficiente balance.' : 'La cantidad no es válida.';
        await interaction.reply({ content: `💸 ${message}`, flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.reply({ content: `💸 Enviaste **${amount} monedas** a ${target}. Te quedan **${result.fromBalance}**.`, flags: MessageFlags.Ephemeral });
    },
  };
}
