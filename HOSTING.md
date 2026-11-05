# Despliegue en host Node.js

Paquete preparado para Node.js 20 o superior. El ZIP incluye el JavaScript ya compilado en `dist/`, fuente TypeScript, `assets/rpg/` y `assets/reactions/` con los recursos locales del bot, `package.json`, `package-lock.json`, la plantilla [`ECONOMY-MYSQL.env.example`](ECONOMY-MYSQL.env.example) y este instructivo. No incluye `.env`, `ECONOMY-MYSQL.env`, `data/` ni `node_modules/`.

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
| `LAVALINK_PASSWORD` | Contraseña configurada en el nodo Lavalink. Si está vacía, música se desactiva y economía/RPG siguen funcionando. |
| `LAVALINK_SECURE` | `true` si Lavalink usa TLS; de lo contrario `false`. |
| `DATABASE_PATH` | Opcional. Por defecto `./data/bot.sqlite`; conserva esta carpeta entre reinicios. |
| `ECONOMY_DB_DRIVER` | `sqlite` para el modo local o `mysql` para guardar la economía en MySQL/MariaDB. |
| `ECONOMY_DB_ENDPOINT` | Endpoint completo que muestra la base, por ejemplo `servidor:3306`. También acepta `ECONOMY_DB_HOST` y `ECONOMY_DB_PORT` separados. |
| `ECONOMY_DB_USER` | Usuario de la base de datos. |
| `ECONOMY_DB_PASSWORD` | Contraseña nueva de la base. Guárdala solo como variable privada del host. |
| `ECONOMY_DB_NAME` | Nombre de la base/esquema, no el usuario. |

El bot añade automáticamente las columnas de gemas premium y nombre gratuito al esquema SQLite o MySQL existente. No borres la base para actualizar. `/economia admin_moneda` exige **Gestionar servidor** y deja registro de cada ajuste; las monedas normales siguen siendo las que se obtienen jugando. `/admin` está bloqueado por defecto y solo ejecuta acciones si quien lo invoca tiene el ID propietario `931978822323159111`. Tras registrar los comandos, permite esa cuenta en cada servidor desde **Ajustes del servidor → Integraciones → Bot Manzanita → Comandos**. Discord puede seguir mostrando el comando a miembros con permiso Administrador, pero el bot rechaza sus acciones si el ID no coincide. Todas las acciones quedan en `admin_audit_log`; los ajustes administrativos de moneda muestran un ID que puede usarse con `/admin rollback`. La tienda premium se muestra vacía hasta que se publiquen productos.

### Datos globales de jugador

Las monedas, banco, inventario, mascotas RPG, misiones, progreso, perfil, cosméticos, reputación, favoritos y listas guardadas de música usan un único espacio global por ID de Discord. En el primer arranque de esta versión, la base suma los saldos e inventarios que antes estaban separados, conserva el progreso acumulado y elige la mascota activa más recientemente actualizada si una cuenta tenía mascotas en varios servidores. La migración se marca y no se repite. Las colas/reproductores de voz y sus paneles activos siguen siendo propios de cada servidor porque Discord los mantiene en canales de voz distintos.

No configures `DISCORD_DEV_GUILD_ID` en producción salvo que quieras registrar los comandos únicamente en ese servidor de pruebas.

### Activar MySQL/MariaDB para la economía

En Pterodactyl, detén el **servidor del bot** y abre **Files** en la raíz del servidor. Puedes crear `.env` o dejar el archivo dedicado con el nombre exacto `ECONOMY-MYSQL.env`; el bot carga ambos. Usa el contenido de [`ECONOMY-MYSQL.env.example`](ECONOMY-MYSQL.env.example) y completa los datos con **Database connection details**:

```dotenv
ECONOMY_DB_DRIVER=mysql
ECONOMY_DB_ENDPOINT=servidor:3306
ECONOMY_DB_USER=usuario-de-tu-base
ECONOMY_DB_PASSWORD=tu-clave-nueva
ECONOMY_DB_NAME=nombre-de-tu-base
```

`ECONOMY_DB_ENDPOINT` recibe el campo **Endpoint completo**, incluido el puerto. `ECONOMY_DB_USER` recibe **Username** y `ECONOMY_DB_NAME` el nombre del esquema/base que te asignó el host. `ECONOMY_DB_PASSWORD` debe ser la contraseña nueva. No cambies ni borres las variables de Discord/Lavalink que ya están en **Startup**: el `.env` de economía se suma a ellas sin reemplazarlas. También puedes configurar estas cinco variables directamente en **Startup** si tu egg permite agregarlas. La contraseña que se compartió en una captura debe rotarse antes de usar la conexión; no la copies al repositorio ni a mensajes.

Guarda el archivo, vuelve a **Startup** y comprueba que `BOT_JS_FILE=dist/index.js`; inicia el servidor. En la consola debe aparecer `Base de economía MySQL conectada: servidor:3306/base.`. Al iniciar, el bot crea y actualiza sus tablas de economía, incluyendo banco, inventario apilable y registro de artículos. Si la consola muestra un error de conexión, revisa endpoint, puerto, usuario, contraseña nueva y permisos del usuario de la base. Las listas y favoritos de música siguen usando SQLite en `DATABASE_PATH`, por lo que conserva `data/` al reemplazar el ZIP.

Si ya tienes saldos o inventario en el SQLite del servidor, migra una sola vez antes de volver a encender el bot:

1. Detén el servidor del bot y conserva una copia del archivo configurado en `DATABASE_PATH` (por defecto `data/bot.sqlite`).
2. En **Startup**, establece las variables MySQL anteriores y cambia temporalmente `BOT_JS_FILE` a `dist/scripts/migrate-economy.js`.
3. Inicia el servidor una vez. En la consola debe aparecer `Migración idempotente terminada` y un conteo de cuentas, movimientos y artículos.
4. Detén el proceso, restaura `BOT_JS_FILE=dist/index.js` y arranca el bot.
5. Cambia temporalmente `BOT_JS_FILE` a `dist/deploy-commands.js`, inicia una vez y confirma en la consola `Comandos globales registrados`. Detén el proceso y vuelve a poner `BOT_JS_FILE=dist/index.js`.

La migración se puede repetir sin insertar dos veces movimientos o artículos; las cuentas que ya existan en MySQL se conservan. Si la economía empieza desde cero, omite los pasos de migración. No arranques bot y migrador simultáneamente.

### Egg Generic Discord.js con instalación desde Git

Este egg ejecuta `npm install` y luego `node /home/container/${BOT_JS_FILE}`; no ejecuta automáticamente el script de compilación de TypeScript. Configura `BOT_JS_FILE=dist/index.js`. Las actualizaciones deben incluir el `dist/` ya compilado: si Pterodactyl tiene `.git`, actualiza desde el commit que contiene `src/` y `dist/`; si subes archivos manualmente, compila localmente con `npm run build` y sube ambos directorios. El servidor solo necesita ejecutar `npm install` e iniciar `dist/index.js`.

Si `USER UPLOADED FILES=1`, el instalador omite la clonación y el servidor puede no tener `.git`; en ese caso `AUTO_UPDATE=1` no tiene nada que actualizar. Instala una nueva versión extrayendo el ZIP de release en la raíz del servidor y verifica que incluya el `dist/` compilado. El ZIP no incluye `.env`, `ECONOMY-MYSQL.env` ni `data/`; conserva los archivos de configuración y datos del servidor.

## Lavalink y Spotify

El bot y Lavalink son procesos separados. El egg **Generic Discord.js** ejecuta el bot Node.js y no inicia automáticamente el servicio Lavalink de `docker-compose.yml`. Para que Música funcione, contrata o despliega un nodo Lavalink v4 por separado y configura sus valores de conexión en el panel. Sin `LAVALINK_PASSWORD`, el bot omite la conexión al nodo y deja disponibles Discord, economía y RPG; con una clave configurada pero un nodo inaccesible, música permanece sin servicio hasta que el host lo conecte.

El archivo `lavalink/application.yml` se incluye como referencia para un servidor Lavalink propio. Usa la misma contraseña en `LAVALINK_PASSWORD` del bot y `LAVALINK_SERVER_PASSWORD` del nodo. `youtubePlaylistLoadLimit: 10` permite al nodo cargar hasta 1,000 canciones por playlist (10 páginas de 100); el bot agrega a la cola todas las canciones devueltas, hasta el límite de 1,000 pistas de la cola. En Pterodactyl, aplica también ese valor al `application.yml` real del nodo y reinícialo; actualizar solo el bot no cambia la configuración del proceso Lavalink. El YAML instala LavaSrc 4.8.3 y admite Spotify. En Docker Compose, agrega `SPOTIFY_CLIENT_ID` y `SPOTIFY_CLIENT_SECRET` al `.env` privado del proyecto. En Pterodactyl, configura esas variables para el proceso Lavalink o reemplaza los dos valores `${SPOTIFY_CLIENT_ID:}` y `${SPOTIFY_CLIENT_SECRET:}` en el `application.yml` de Lavalink con tus credenciales privadas. No pegues esos valores en Discord, Git o `.env` del bot de música. Spotify aporta metadatos; LavaSrc encuentra el audio en YouTube, por lo que una pista puede no estar disponible si no existe una coincidencia reproducible. No expongas un nodo Lavalink público sin protegerlo.

## Comandos de aplicación

Para publicar comandos nuevos o actualizados desde un paquete compilado, configura las variables de entorno y ejecuta `dist/deploy-commands.js` una vez (en Pterodactyl, cambia temporalmente `BOT_JS_FILE` a esa ruta, inicia y después restaura `dist/index.js`). Esto registra `/admin` junto con los comandos RPG, atajos de economía y música. En cada servidor, permite la cuenta propietaria desde **Ajustes del servidor → Integraciones → Bot Manzanita → Comandos** para que los miembros sin Administrador no vean `/admin`. Discord mantiene acceso visual para administradores del servidor; el guard del bot impide que cualquiera salvo la cuenta propietaria ejecute acciones. Si `DISCORD_DEV_GUILD_ID` está configurado, los registra solo en ese servidor de desarrollo.

## Tarjetas de perfil y cosméticos (1.17.0)

El perfil renderiza imágenes PNG con `@napi-rs/canvas`; `npm install` instala el binario nativo correspondiente al sistema del host. No requiere ImageMagick, fuentes subidas ni servicio externo de renderizado. Al primer arranque crea las tablas `user_profiles`, `user_progress`, `user_server_progress`, `items`, `shop_categories`, `user_inventory`, `user_equipped_badges` y `user_reputation_log`, tanto en SQLite como en la base MySQL de economía. No cambies ni migres el esquema a mano.

`/perfil [usuario]` muestra la tarjeta global; `/wallet` y `/rank` muestran tarjetas separadas. La actividad de mensajes suma XP con un límite de una concesión por minuto por usuario y servidor. Los botones del perfil abren personalización, inventario, tienda con preview y progreso; about, título, acento y equipamiento se guardan en la base. El comando `rep` permite dar un reconocimiento diario por persona. En el paquete Pterodactyl conserva `BOT JS FILE=dist/index.js` y deja que el arranque ejecute `npm install` para instalar el renderizador.

### Prefijo alternativo `a!`

El paquete activa `GuildMessages`, `DirectMessages` y el intent privilegiado `MessageContent`. En [Discord Developer Portal → aplicación → Bot](https://discord.com/developers/applications), activa **Privileged Gateway Intents → Message Content Intent** y guarda el cambio; si falta, los comandos con prefijo no podrán leer el texto aunque el bot aparezca conectado. Reinicia el proceso después de actualizar el ZIP. Usa `a!help` en un servidor para ver los alias. El grupo `a!admin` requiere DM, ID de servidor e ID de usuario, y se valida contra el ID propietario configurado en el código.

`a!happy`, `a!sip`, `a!slap @persona` y expresiones relacionadas obtienen GIFs SFW desde `https://nekos.best/api/v2/<categoria>`. No requieren otra variable secreta; cada solicitud envía un User-Agent de Bot Manzanita, limita repeticiones y valida el dominio/GIF antes de publicar. `/catalogo`, `a!catalog` y `a!help` muestran el catálogo por secciones y el selector funciona en el propio mensaje.
