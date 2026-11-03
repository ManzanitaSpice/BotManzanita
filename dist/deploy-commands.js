import { REST, Routes } from 'discord.js';
import { config } from './config.js';
import { economyCommand } from './commands/economy.js';
import { musicCommand } from './commands/music.js';
const rest = new REST({ version: '10' }).setToken(config.token);
const commands = [economyCommand.data.toJSON(), musicCommand.data.toJSON()];
if (config.devGuildId) {
    await rest.put(Routes.applicationGuildCommands(config.clientId, config.devGuildId), { body: commands });
    console.log(`Comandos registrados en el servidor de desarrollo ${config.devGuildId}.`);
}
else {
    await rest.put(Routes.applicationCommands(config.clientId), { body: commands });
    console.log('Comandos globales registrados. La propagación puede tardar un poco.');
}
