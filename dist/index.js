import { Client, Collection, GatewayIntentBits } from 'discord.js';
import { LavalinkManager } from 'lavalink-client';
import { config } from './config.js';
import { economyCommand } from './commands/economy.js';
import { musicCommand } from './commands/music.js';
import { musicShortcutCommands } from './commands/music-shortcuts.js';
import { registerInteractionHandler } from './events/interaction-create.js';
import './storage/database.js';
import { refreshActiveMusicPanels, refreshMusicPanel } from './services/music.js';
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
const commands = [economyCommand, musicCommand, ...musicShortcutCommands];
client.commands = new Collection(commands.map((command) => [command.data.name, command]));
client.lavalink = new LavalinkManager({
    nodes: [{
            id: 'manzanita-local',
            host: config.lavalink.host,
            port: config.lavalink.port,
            authorization: config.lavalink.password,
            secure: config.lavalink.secure,
            retryAmount: 5,
            retryDelay: 5_000,
        }],
    sendToShard: (guildId, payload) => client.guilds.cache.get(guildId)?.shard.send(payload),
    autoSkip: true,
    client: { id: config.clientId, username: 'Bot Manzanita' },
    playerOptions: {
        defaultSearchPlatform: 'ytmsearch',
        onDisconnect: { autoReconnect: true, destroyPlayer: false },
        onEmptyQueue: { destroyAfterMs: 30_000 },
    },
});
registerInteractionHandler(client);
client.on('raw', ((packet) => client.lavalink.sendRawData(packet)));
client.once('clientReady', async (readyClient) => {
    console.log(`Conectado como ${readyClient.user.tag}.`);
    client.lavalink.on('trackStart', (player) => void refreshMusicPanel(client, player.guildId));
    client.lavalink.on('trackEnd', (player) => void refreshMusicPanel(client, player.guildId));
    client.lavalink.on('trackError', (player) => void refreshMusicPanel(client, player.guildId));
    client.lavalink.on('queueEnd', (player) => void refreshMusicPanel(client, player.guildId));
    client.lavalink.on('playerDestroy', (player) => void refreshMusicPanel(client, player.guildId));
    client.lavalink.nodeManager.on('connect', (node) => console.log(`Nodo de audio conectado: ${node.id}`));
    client.lavalink.nodeManager.on('error', (node, error) => console.error(`Nodo de audio ${node.id}:`, error.message));
    await client.lavalink.init({ id: readyClient.user.id, username: readyClient.user.username });
    const panelRefreshTimer = setInterval(() => void refreshActiveMusicPanels(client), 15_000);
    panelRefreshTimer.unref();
});
process.on('unhandledRejection', (error) => console.error('Promesa rechazada sin manejar:', error));
process.on('uncaughtException', (error) => {
    console.error('Error no capturado:', error);
    process.exitCode = 1;
});
await client.login(config.token);
