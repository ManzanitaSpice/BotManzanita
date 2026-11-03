import 'dotenv/config';
function required(name) {
    const value = process.env[name]?.trim();
    if (!value)
        throw new Error(`Falta configurar ${name} en el archivo .env`);
    return value;
}
export const config = {
    token: required('DISCORD_TOKEN'),
    clientId: required('DISCORD_CLIENT_ID'),
    devGuildId: process.env.DISCORD_DEV_GUILD_ID?.trim() || undefined,
    databasePath: process.env.DATABASE_PATH?.trim() || './data/bot.sqlite',
    lavalink: {
        host: process.env.LAVALINK_HOST?.trim() || '127.0.0.1',
        port: readPort(),
        password: required('LAVALINK_PASSWORD'),
        secure: process.env.LAVALINK_SECURE === 'true',
    },
};
function readPort() {
    const port = Number(process.env.LAVALINK_PORT || 2333);
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
        throw new Error('LAVALINK_PORT debe ser un número entre 1 y 65535.');
    }
    return port;
}
