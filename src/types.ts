import type { ChatInputCommandInteraction, SlashCommandBuilder, SlashCommandOptionsOnlyBuilder, SlashCommandSubcommandsOnlyBuilder } from 'discord.js';
import type { Collection } from 'discord.js';
import type { LavalinkManager } from 'lavalink-client';

export interface BotCommand {
  data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder;
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
}

declare module 'discord.js' {
  interface Client {
    commands: Collection<string, BotCommand>;
    lavalink: LavalinkManager;
  }
}
