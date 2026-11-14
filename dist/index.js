import { Client, Collection, GatewayIntentBits, Partials } from 'discord.js';
import { LavalinkManager } from 'lavalink-client';
import { config } from './config.js';
import { commands } from './commands/registry.js';
import { registerInteractionHandler } from './events/interaction-create.js';
import { registerMessageCommandHandler } from './events/message-create.js';
import './storage/database.js';
import { initializeEconomyDatabase } from './storage/economy-database.js';
import { accrueMaturedBankInterest, rebalanceBankInterest, reconcilePersonalLoans } from './services/economy.js';
import { refreshActiveMusicPanels, refreshMusicPanel } from './services/music.js';
import { initializeProfileStorage } from './services/profile.js';
import { pruneExpiredFavorites, pruneExpiredMusicHistory, recordMusicHistory } from './services/music-library.js';
import { musicQueueStoreManager } from './storage/music-queue-store.js';
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages, GatewayIntentBits.DirectMessages, GatewayIntentBits.MessageContent], partials: [Partials.Channel] });
client.commands = new Collection(commands.map((command) => [command.data.name, command]));
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
    queueOptions: {
        maxPreviousTracks: 25,
        queueStore: musicQueueStoreManager(),
    },
});
registerInteractionHandler(client);
registerMessageCommandHandler(client);
if (config.lavalink.enabled)
    client.on('raw', ((packet) => client.lavalink.sendRawData(packet)));
client.once('clientReady', async (readyClient) => {
    console.log(`Conectado como ${readyClient.user.tag}.`);
    if (!config.lavalink.enabled) {
        console.log('Música desactivada: configura LAVALINK_PASSWORD y la conexión del nodo para habilitarla.');
        return;
    }
    client.lavalink.on('trackStart', (player, eventTrack) => {
        const track = eventTrack ?? player.queue.current;
        const requesterId = track?.requester?.id;
        if (track && typeof requesterId === 'string' && requesterId.length > 0) {
            try {
                recordMusicHistory(player.guildId, requesterId, track);
            }
            catch (error) {
                console.error(`No se pudo guardar el historial musical de ${requesterId}:`, error);
            }
        }
        void refreshMusicPanel(client, player.guildId);
    });
    client.lavalink.on('trackEnd', (player) => void refreshMusicPanel(client, player.guildId));
    client.lavalink.on('trackError', (player) => void refreshMusicPanel(client, player.guildId));
    client.lavalink.on('queueEnd', (player) => void refreshMusicPanel(client, player.guildId));
    client.lavalink.on('playerDestroy', (player) => void refreshMusicPanel(client, player.guildId));
    client.lavalink.nodeManager.on('connect', (node) => console.log(`Nodo de audio conectado: ${node.id}`));
    client.lavalink.nodeManager.on('error', (node, error) => console.error(`Nodo de audio ${node.id}:`, error.message));
    await client.lavalink.init({ id: readyClient.user.id, username: readyClient.user.username });
    const panelRefreshTimer = setInterval(() => void refreshActiveMusicPanels(client), 15_000);
    panelRefreshTimer.unref();
    const queueSnapshotTimer = setInterval(() => {
        for (const guild of client.guilds.cache.values()) {
            const player = client.lavalink.getPlayer(guild.id);
            if (!player || (!player.queue.current && !player.queue.tracks.length))
                continue;
            void player.queue.utils.save().catch((error) => console.error(`No se pudo renovar la cola de ${guild.id}:`, error));
        }
    }, 5 * 60_000);
    queueSnapshotTimer.unref();
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
const scheduleBankInterestRebalance = async () => {
    try {
        const policy = await rebalanceBankInterest();
        const delay = Math.max(1_000, (policy.nextRebalanceAt - Math.floor(Date.now() / 1000)) * 1000);
        const timer = setTimeout(() => void scheduleBankInterestRebalance(), delay);
        timer.unref();
    }
    catch (error) {
        console.error('No se pudo reajustar la tasa global del banco; se reintentará en 5 minutos:', error);
        const retryTimer = setTimeout(() => void scheduleBankInterestRebalance(), 5 * 60_000);
        retryTimer.unref();
    }
};
void scheduleBankInterestRebalance();
const scheduleBankInterestPayouts = async () => {
    try {
        const result = await accrueMaturedBankInterest();
        if (result.totalInterest > 0)
            console.log(`Interés bancario acreditado automáticamente: ${result.totalInterest} monedas.`);
        // Check each user's own 5-hour maturity instead of anchoring payouts to bot uptime.
        const timer = setTimeout(() => void scheduleBankInterestPayouts(), 15 * 60_000);
        timer.unref();
    }
    catch (error) {
        console.error('No se pudieron acreditar los intereses bancarios; se reintentará en 5 minutos:', error);
        const retryTimer = setTimeout(() => void scheduleBankInterestPayouts(), 5 * 60_000);
        retryTimer.unref();
    }
};
void scheduleBankInterestPayouts();
const schedulePersonalLoanReviews = async () => {
    try {
        const result = await reconcilePersonalLoans();
        if (result.bankruptcies || result.foreclosures) {
            console.log(`Revisión de préstamos: ${result.bankruptcies} bancarrota(s) nueva(s), ${result.foreclosures} ejecución(es) de garantía.`);
        }
        const timer = setTimeout(() => void schedulePersonalLoanReviews(), 15 * 60_000);
        timer.unref();
    }
    catch (error) {
        console.error('No se pudo revisar la mora de los préstamos; se reintentará en 5 minutos:', error);
        const retryTimer = setTimeout(() => void schedulePersonalLoanReviews(), 5 * 60_000);
        retryTimer.unref();
    }
};
void schedulePersonalLoanReviews();
await initializeProfileStorage();
pruneExpiredFavorites();
pruneExpiredMusicHistory();
const favoriteCleanupTimer = setInterval(() => {
    try {
        pruneExpiredFavorites();
    }
    catch (error) {
        console.error('No se pudieron limpiar favoritos vencidos:', error);
    }
}, 12 * 60 * 60 * 1000);
favoriteCleanupTimer.unref();
const musicHistoryCleanupTimer = setInterval(() => {
    try {
        pruneExpiredMusicHistory();
    }
    catch (error) {
        console.error('No se pudo limpiar el historial musical vencido:', error);
    }
}, 60_000);
musicHistoryCleanupTimer.unref();
if (config.economyDatabase.driver === 'mysql') {
    console.log(`Base de economía MySQL conectada: ${config.economyDatabase.host}:${config.economyDatabase.port}/${config.economyDatabase.name}.`);
}
else {
    console.log('Base de economía SQLite activa.');
}
await client.login(config.token);
