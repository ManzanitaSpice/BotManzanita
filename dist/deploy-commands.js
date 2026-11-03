import { REST, Routes } from 'discord.js';
import { config } from './config.js';
import { commands } from './commands/registry.js';
const rest = new REST({ version: '10' }).setToken(config.token);
const serializedCommands = commands.map((command) => command.data.toJSON());
if (config.devGuildId) {
    await rest.put(Routes.applicationGuildCommands(config.clientId, config.devGuildId), { body: serializedCommands });
    console.log(`Comandos registrados en el servidor de desarrollo ${config.devGuildId}.`);
}
else {
    await rest.put(Routes.applicationCommands(config.clientId), { body: serializedCommands });
    console.log('Comandos globales registrados. La propagación puede tardar un poco.');
}
