import { Client, Collection, GatewayIntentBits, Partials } from 'discord.js';
import { LavalinkManager } from 'lavalink-client';
import { config } from './config.js';
import { commands } from './commands/registry.js';
import { registerInteractionHandler } from './events/interaction-create.js';
import { registerMessageCommandHandler } from './events/message-create.js';
import type { BotCommand } from './types.js';
import './storage/database.js';
import { initializeEconomyDatabase } from './storage/economy-database.js';
import { refreshActiveMusicPanels, refreshMusicPanel } from './services/music.js';
import { initializeProfileStorage } from './services/profile.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages, GatewayIntentBits.DirectMessages, GatewayIntentBits.MessageContent], partials: [Partials.Channel] });
client.commands = new Collection<string, BotCommand>(commands.map((command) => [command.data.name, command]));
client.lavalink = new LavalinkManager({
  nodes: config.lavalink.enabled ? [{
    id: 'manzanita-local',
    host: config.lavalink.host,
    port: config.lavalink.port,
    authorization: config.lavalink.password,
    secure: config.lavalink.secure,
    retryAmount: 5,
    retryDelay: 5_000,
  }] : [],
  sendToShard: (guildId, payload) => client.guilds.cache.get(guildId)?.shard.send(payload),
  autoSkip: true,
  client: { id: config.clientId, username: 'Bot Manzanita' },
  playerOptions: {
    defaultSearchPlatform: 'ytmsearch',
    // A manual or unexpected voice disconnect must not pull the bot back in.
    onDisconnect: { autoReconnect: false, destroyPlayer: true },
    onEmptyQueue: { destroyAfterMs: 30_000 },
  },
});

registerInteractionHandler(client);
registerMessageCommandHandler(client);
if (config.lavalink.enabled) client.on('raw' as never, ((packet: unknown) => client.lavalink.sendRawData(packet as never)) as never);
client.once('clientReady', async (readyClient) => {
  console.log(`Conectado como ${readyClient.user.tag}.`);
  if (!config.lavalink.enabled) {
    console.log('Música desactivada: configura LAVALINK_PASSWORD y la conexión del nodo para habilitarla.');
    return;
  }
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

process.on('unhandledRejection', (error) => {
  console.error('Promesa rechazada sin manejar; el host deberá reiniciar el bot:', error);
  process.exit(1);
});
process.on('uncaughtException', (error) => {
  console.error('Error no capturado:', error);
  process.exit(1);
});

await initializeEconomyDatabase();
await initializeProfileStorage();
if (config.economyDatabase.driver === 'mysql') {
  console.log(`Base de economía MySQL conectada: ${config.economyDatabase.host}:${config.economyDatabase.port}/${config.economyDatabase.name}.`);
} else {
  console.log('Base de economía SQLite activa.');
}
await client.login(config.token);
