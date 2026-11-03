# Bot Manzanita

Versión **1.0.1**.

Bot multiusos para Discord con economía persistente, paneles Components V2 y música en canales de voz mediante Lavalink.

## Requisitos

- Node.js 20 o superior y Docker Desktop con Docker Compose.
- Una aplicación y un bot creados en el [Discord Developer Portal](https://discord.com/developers/applications).
- Permisos `applications.commands`, ver/enviar mensajes y conectarse/hablar en canales de voz.

## Preparación

1. `.env` ya se inicializó en esta copia con una contraseña aleatoria para Lavalink. Completa `DISCORD_TOKEN` y `DISCORD_CLIENT_ID` directamente en ese archivo. Si preparas otra copia, crea `.env` desde `.env.example` y genera una contraseña propia para `LAVALINK_PASSWORD`.
2. En el [Portal de desarrolladores de Discord](https://discord.com/developers/applications), crea una aplicación y añade su usuario bot. Copia el token que muestra la sección **Bot**. Si ya no puedes verlo, **Reset Token** genera uno nuevo e invalida el anterior. El `DISCORD_CLIENT_ID` es el **Application ID** de **General Information**. Este bot no usa `Client Secret` ni `Public Key`; no los guardes aquí. No compartas credenciales en chats o commits; `.env` está excluido de Git.
3. Invita el bot desde **OAuth2 → URL Generator**, seleccionando los scopes `bot` y `applications.commands`, y los permisos mínimos `View Channels`, `Send Messages`, `Connect` y `Speak`. Discord incluye `applications.commands` al seleccionar el scope `bot`.
4. Instala dependencias con `npm install` e inicia Lavalink con `docker compose up -d`.
5. Registra comandos con `npm run commands:deploy`. Para desarrollo, completa opcionalmente `DISCORD_DEV_GUILD_ID` con el ID del servidor.
6. Inicia el bot con `npm run dev`.

## Comandos incluidos

- `/economia panel`: abre el panel privado de economía.
- `/economia saldo`: consulta el saldo.
- `/economia diaria`: reclama la recompensa diaria (una vez cada 24 horas).
- `/economia trabajar`: gana entre 35 y 80 monedas cada 30 minutos.
- `/economia transferir usuario cantidad`: envía monedas a otra persona.
- `/economia inventario`: consulta los artículos comprados.
- `/economia ranking`: muestra las cuentas con más monedas.
- `/musica panel`: publica el panel de controles en el canal.
- `/musica buscar consulta`: presenta resultados para elegir una canción.
- `/musica agregar consulta`: busca una canción/lista, conecta al canal de voz y la añade a la cola.
- `/musica cola`: abre y permite administrar la cola.
- `/musica pausar`, `/musica reanudar`, `/musica saltar`, `/musica anterior`.
- `/musica detener`, `/musica desconectar`, `/musica mezclar`.
- `/musica repetir modo`, `/musica volumen porcentaje`, `/musica quitar posicion`.
- `/musica efecto modo`: sonido normal, graves, rock, pop, nightcore o vaporwave.
- `/musica favorito guardar|ver|quitar`: favoritos persistentes con controles para reproducir o eliminar.
- `/musica lista mislistas|guardar|ver|reproducir|quitar|eliminar`: listas personales persistentes; hasta 20 listas de 100 canciones por usuario y servidor.

## Estado de música

La reproducción usa un nodo Lavalink v4. `docker-compose.yml` levanta el nodo local y `lavalink/application.yml` activa el plugin oficial de YouTube Source junto con Bandcamp y SoundCloud. El panel público muestra progreso, carátula, cola, volumen y repetición; también ofrece pausa, salto, historial, mezcla, volumen, búsqueda de ±15 segundos y efectos de audio. La cola tiene vista paginada con opción para quitar canciones. Favoritos y listas se guardan en SQLite y sobreviven reinicios; el estado de reproducción permanece en Lavalink. El panel actualiza el progreso cada 15 segundos y al cambiar el estado del reproductor. Los controles de voz solo funcionan para miembros que estén en el mismo canal que el bot. `.env` contiene el secreto de Lavalink generado localmente; no publiques el puerto del nodo fuera del equipo sin configurar autenticación y red segura.

## Diseño

- `src/commands`: definición y lógica de comandos.
- `src/ui`: renderizado de paneles Discord.
- `src/services`: reglas de economía y conexión/control del reproductor.
- `src/storage`: SQLite, transacciones, inventario y ledger de monedas.
- `src/events`: despacho de interacciones.

La economía se separa por servidor y usuario. Recompensas, trabajo, transferencias y compras se procesan en transacciones SQLite; cada movimiento queda en un ledger y cada compra desbloquea un artículo de inventario. Lavalink mantiene el estado de la cola en memoria por servidor mientras el bot está activo.
