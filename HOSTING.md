# Despliegue en host Node.js

Paquete preparado para Node.js 20 o superior. El ZIP incluye el JavaScript ya compilado en `dist/`, fuente TypeScript, `package.json`, `package-lock.json` y este instructivo. No incluye `.env`, `data/` ni `node_modules/`.

## Instalación

1. Sube y extrae el ZIP en la raíz del servidor. `package.json` debe quedar en la carpeta de inicio.
2. Configura Node.js 20 o superior en el egg del host.
3. Usa `npm ci --omit=dev` como comando de instalación si el panel permite configurarlo. No hace falta compilar en el host porque el paquete ya incluye `dist/`.
4. Configura `npm start` como comando de inicio.
5. Define las variables de entorno del panel:

| Variable | Valor |
| --- | --- |
| `DISCORD_TOKEN` | Token del usuario bot de Discord. No usar el Client Secret. |
| `DISCORD_CLIENT_ID` | Application ID de la aplicación. |
| `LAVALINK_HOST` | Host o IP del nodo Lavalink, sin `http://`. |
| `LAVALINK_PORT` | Puerto del nodo Lavalink. |
| `LAVALINK_PASSWORD` | Contraseña configurada en el nodo Lavalink. |
| `LAVALINK_SECURE` | `true` si Lavalink usa TLS; de lo contrario `false`. |
| `DATABASE_PATH` | Opcional. Por defecto `./data/bot.sqlite`; conserva esta carpeta entre reinicios. |

No configures `DISCORD_DEV_GUILD_ID` en producción salvo que quieras registrar los comandos únicamente en ese servidor de pruebas.

### Egg Generic Discord.js con instalación desde Git

Este egg ejecuta `npm install` y luego `node /home/container/${BOT_JS_FILE}`; no ejecuta automáticamente el script de compilación de TypeScript. El repositorio incluye `dist/` para este flujo. Configura `BOT_JS_FILE=dist/index.js`. Cuando actualices el código fuente, vuelve a compilar con `npm run build` y sube juntos `src/` y `dist/`.

Si `USER UPLOADED FILES=1`, el instalador omite la clonación y el servidor puede no tener `.git`; en ese caso `AUTO_UPDATE=1` no tiene nada que actualizar. Instala una nueva versión extrayendo el ZIP de release en la raíz del servidor. El ZIP no incluye `.env` ni `data/`; conserva ambos en el servidor.

## Lavalink

El bot y Lavalink son procesos separados. El egg **Generic Discord.js** ejecuta el bot Node.js y no inicia automáticamente el servicio Lavalink de `docker-compose.yml`. Para que Música funcione, contrata o despliega un nodo Lavalink v4 por separado y configura sus valores de conexión en el panel. Sin Lavalink, Discord y Economía pueden iniciar, pero los comandos de reproducción responderán que el nodo no está disponible.

El archivo `lavalink/application.yml` se incluye como referencia para un servidor Lavalink propio. Usa la misma contraseña en `LAVALINK_PASSWORD` del bot y `LAVALINK_SERVER_PASSWORD` del nodo. No expongas un nodo Lavalink público sin protegerlo.

## Comandos de aplicación

Para publicar nuevos comandos desde un paquete compilado, configura las variables de entorno y ejecuta `npm run commands:deploy:built` una vez. Esto registra los atajos globales (`/play`, `/p`, `/q`, etc.) en Discord. Si `DISCORD_DEV_GUILD_ID` está configurado, los registra únicamente en ese servidor de desarrollo.
