# Arquitectura del bot

El proyecto está organizado por responsabilidades para poder añadir funciones sin duplicar el arranque ni la publicación de comandos.

## Código

- `src/commands/` define comandos de Discord. `registry.ts` es la única lista: la usan el proceso del bot y `deploy-commands.ts` para que los comandos disponibles coincidan con los publicados.
- `src/events/interaction-create.ts` enruta comandos, autocompletado, formularios y controles de panel. `src/events/message-create.ts` traduce `a!` y sus abreviaturas a los mismos servicios, incluidos los paneles existentes. Mantén reglas de negocio en el servicio de su función.
- `src/services/` contiene reglas de negocio. Música administra Lavalink y sus búsquedas; economía y RPG validan operaciones antes de guardarlas; la biblioteca musical administra listas y favoritos.
- `src/services/reactions.ts` obtiene GIFs SFW del catálogo de NEKOS.BEST, limita frecuencia y valida URLs antes de publicarlas. `src/ui/catalog.ts` describe las categorías y arma el panel interactivo de ayuda.
- `src/services/profile.ts` mantiene perfiles globales, XP global y por servidor, reputación, inventario de cosméticos y compras; `src/data/profile-shop.ts` es el catálogo declarativo de categorías y artículos.
- `src/ui/profile.ts` arma los paneles de Profile, Wallet, Rank, progreso, tienda, inventario y Room; `src/ui/profile-cards.ts` renderiza las tarjetas PNG y conserva un cache corto en memoria.
- `src/ui/panels.ts` construye vistas de Discord. Debe presentar datos y controles; los cambios persistentes pasan por servicios.
- `src/storage/database.ts` mantiene SQLite local para la biblioteca musical y economía/RPG en modo local. `src/storage/economy-database.ts` crea y actualiza el esquema MySQL opcional de economía y RPG.
- `src/config.ts` carga configuración y valida puertos y opciones. `src/scripts/migrate-economy.ts` migra saldos e inventario SQLite existentes a MySQL.
- `initializeProfileStorage()` crea tablas sociales/cosméticas e inserta categorías y catálogo al iniciar; usa SQLite en local y MySQL cuando `ECONOMY_DB_DRIVER=mysql`. No requiere Redis ni un job worker externo.
- `assets/rpg/` contiene ilustraciones del RPG. `lavalink/application.yml` configura el proceso Lavalink independiente.

## Configuración

Prioridad de valores: variables no vacías del host, después `.env`, y finalmente `ECONOMY-MYSQL.env` para completar campos aún vacíos. No guardes claves en Git. Los archivos de entorno privados y `data/` están excluidos por `.gitignore` y no se incluyen en los paquetes de host.

**Obligatorio para el bot:** `DISCORD_TOKEN` y `DISCORD_CLIENT_ID`.

**Opcional para música:** `LAVALINK_HOST`, `LAVALINK_PORT`, `LAVALINK_PASSWORD` y `LAVALINK_SECURE`. Al dejar la contraseña vacía, el bot no intenta conectar Lavalink y economía/RPG pueden funcionar. Spotify se configura en el entorno del proceso Lavalink (`SPOTIFY_CLIENT_ID` y `SPOTIFY_CLIENT_SECRET`), no es requisito para iniciar el bot.

**Prefijo `a!`:** requiere `MessageContent` activado en **Discord Developer Portal → Bot → Privileged Gateway Intents**. El grupo administrativo por prefijo funciona solo por DM para no publicar operaciones privadas.

**Economía persistente:** SQLite es el valor predeterminado. Para usar MySQL/MariaDB, establece `ECONOMY_DB_DRIVER=mysql` y los campos `ECONOMY_DB_ENDPOINT`, `ECONOMY_DB_USER`, `ECONOMY_DB_PASSWORD` y `ECONOMY_DB_NAME`. La biblioteca musical sigue usando SQLite y requiere conservar `data/` al actualizar.

La economía separa las monedas ganables de las gemas premium. Solo miembros con **Gestionar servidor** pueden ajustar gemas mediante `/economia admin_moneda`; el registro conserva usuario afectado, administrador, cantidad y referencia. La tienda premium permanece sin artículos hasta definir su catálogo. Cada mascota tiene un indicador persistente para su único cambio de nombre gratuito; las mascotas antiguas reciben esa oportunidad al migrar el esquema.

`/admin` está bloqueado por defecto con `default_member_permissions=0`, valida el ID propietario `931978822323159111` en runtime y responde de forma efímera. Los permisos de visibilidad de Discord se habilitan por servidor desde Integraciones; el bot token no permite automatizar sobreescrituras individuales. Discord aún muestra comandos a administradores del servidor; la guardia del bot les deniega cualquier operación si no son la cuenta autorizada. Las acciones generan historial en `admin_audit_log`; cambios de moneda administrativos también guardan movimientos en `economy_ledger` con referencia idempotente para permitir rollback.

## Flujo para publicar

1. Ejecuta `npm ci` y `npm run build`.
2. Despliega el ZIP `releases/vX.Y.Z/BotManzanita-vX.Y.Z.zip` en la raíz del host, conservando `.env`, `ECONOMY-MYSQL.env` y `data/`.
3. Ejecuta una vez `dist/deploy-commands.js` para sincronizar comandos y vuelve a `dist/index.js` como archivo de inicio.

TypeScript compila en modo estricto y falla si una variable local o parámetro no se usa. La compilación verifica tipos; no reemplaza una revisión visual ni una prueba conectada a Discord, MySQL o Lavalink.
