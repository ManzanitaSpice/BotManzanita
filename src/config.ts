import { readFileSync } from 'node:fs';
import dotenv from 'dotenv';

// Non-empty host variables win; files fill missing or blank host variables.
// Load .env first so it has precedence over the optional economy-only file.
for (const filename of ['.env', 'ECONOMY-MYSQL.env']) {
  try {
    const values = dotenv.parse(readFileSync(filename, 'utf8'));
    for (const [key, value] of Object.entries(values)) {
      if (!process.env[key]?.trim()) process.env[key] = value;
    }
  } catch (error) {
    if (typeof error !== 'object' || error === null || !('code' in error) || error.code !== 'ENOENT') throw error;
  }
}

function env(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return '';
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta configurar ${name} en el archivo .env`);
  return value;
}

export const config = {
  token: required('DISCORD_TOKEN'),
  clientId: required('DISCORD_CLIENT_ID'),
  devGuildId: process.env.DISCORD_DEV_GUILD_ID?.trim() || undefined,
  databasePath: process.env.DATABASE_PATH?.trim() || './data/bot.sqlite',
  economyDatabase: readEconomyDatabaseConfig(),
  lavalink: {
    host: process.env.LAVALINK_HOST?.trim() || '127.0.0.1',
    port: readPort(),
    // Audio is optional: economy, RPG and command deployment still work without a node.
    password: process.env.LAVALINK_PASSWORD?.trim() || '',
    secure: process.env.LAVALINK_SECURE === 'true',
    enabled: Boolean(process.env.LAVALINK_PASSWORD?.trim()),
  },
};

function parseHostAndPort(value: string): { host: string; port?: number } {
  const match = value.match(/^\[([^\]]+)\](?::(\d+))?$|^([^:\s/]+)(?::(\d+))?$/);
  if (!match) throw new Error('ECONOMY_DB_ENDPOINT debe tener formato servidor:puerto.');
  const host = match[1] ?? match[3];
  const portValue = match[2] ?? match[4];
  const port = portValue ? Number(portValue) : undefined;
  if (!host || (port !== undefined && (!Number.isInteger(port) || port < 1 || port > 65_535))) {
    throw new Error('El endpoint MySQL o su puerto no son válidos.');
  }
  return { host, ...(port !== undefined ? { port } : {}) };
}

function readEconomyDatabaseConfig() {
  const rawEndpoint = env('ECONOMY_DB_ENDPOINT', 'MYSQL_ENDPOINT');
  const rawHost = env('ECONOMY_DB_HOST', 'MYSQL_HOST');
  const parsedEndpoint = rawEndpoint ? parseHostAndPort(rawEndpoint) : undefined;
  const parsedHost = rawHost ? parseHostAndPort(rawHost) : undefined;
  const host = parsedHost?.host ?? parsedEndpoint?.host ?? '';
  const port = readEconomyDatabasePort(parsedHost?.port ?? parsedEndpoint?.port);
  const user = env('ECONOMY_DB_USER', 'MYSQL_USER');
  const password = process.env.ECONOMY_DB_PASSWORD || process.env.MYSQL_PASSWORD || '';
  const name = env('ECONOMY_DB_NAME', 'MYSQL_DATABASE');
  const configuredDriver = env('ECONOMY_DB_DRIVER').toLowerCase();
  const driver = configuredDriver || (host || user || password || name ? 'mysql' : 'sqlite');
  if (driver !== 'sqlite' && driver !== 'mysql') {
    throw new Error('ECONOMY_DB_DRIVER debe ser sqlite o mysql.');
  }
  return { driver, host, port, user, password, name } as const;
}

function readEconomyDatabasePort(endpointPort?: number): number {
  const port = Number(env('ECONOMY_DB_PORT', 'MYSQL_PORT') || endpointPort || 3306);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('ECONOMY_DB_PORT debe ser un número entre 1 y 65535.');
  }
  return port;
}

function readPort(): number {
  const port = Number(process.env.LAVALINK_PORT || 2333);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('LAVALINK_PORT debe ser un número entre 1 y 65535.');
  }
  return port;
}
