import { SlashCommandBuilder } from 'discord.js';
import type { BotCommand } from '../types.js';
import { catalogPanel } from '../ui/catalog.js';

export const catalogCommand: BotCommand = {
  data: new SlashCommandBuilder().setName('catalogo').setDescription('Explora por categorías todos los comandos de Manzanita.'),
  async execute(interaction) { await interaction.reply(catalogPanel()); },
};
