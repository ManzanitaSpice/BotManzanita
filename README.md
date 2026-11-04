# Bot Manzanita

Versión **1.17.0**.

Bot multiusos para Discord con economía persistente, paneles Components V2 y música en canales de voz mediante Lavalink.

La estructura del proyecto y el orden de configuración están resumidos en [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Requisitos

- Node.js 20 o superior y Docker Desktop con Docker Compose.
- Una aplicación y un bot creados en el [Discord Developer Portal](https://discord.com/developers/applications).
- Para comandos `a!`, activa **Bot → Privileged Gateway Intents → Message Content Intent** en el portal. Sin eso, Discord no entrega el contenido de mensajes de servidores al bot.
- Permisos `applications.commands`, ver/enviar mensajes y conectarse/hablar en canales de voz.

## Preparación

1. Completa `DISCORD_TOKEN` y `DISCORD_CLIENT_ID` en `.env` o en las variables del host. Si usarás música, define también `LAVALINK_HOST`, `LAVALINK_PORT` y `LAVALINK_PASSWORD`; si dejas la contraseña vacía, el bot inicia con economía y RPG mientras música queda desactivada. Para una copia nueva, parte de `.env.example` y usa contraseñas propias.
2. En el [Portal de desarrolladores de Discord](https://discord.com/developers/applications), crea una aplicación y añade su usuario bot. Copia el token que muestra la sección **Bot**. Si ya no puedes verlo, **Reset Token** genera uno nuevo e invalida el anterior. El `DISCORD_CLIENT_ID` es el **Application ID** de **General Information**. Este bot no usa `Client Secret` ni `Public Key`; no los guardes aquí. No compartas credenciales en chats o commits; `.env` está excluido de Git.
3. Invita el bot desde **OAuth2 → URL Generator**, seleccionando los scopes `bot` y `applications.commands`, y los permisos mínimos `View Channels`, `Send Messages`, `Connect` y `Speak`. Discord incluye `applications.commands` al seleccionar el scope `bot`.
4. Instala dependencias con `npm install`. Para música local, inicia Lavalink con `docker compose up -d`; en Pterodactyl, el nodo Lavalink es un servicio separado.
5. Registra comandos con `npm run commands:deploy`. Para desarrollo, completa opcionalmente `DISCORD_DEV_GUILD_ID` con el ID del servidor.
6. Inicia el bot con `npm run dev`.

## Comandos incluidos

`a!catalog`, `a!help` o `/catalogo` abre el catálogo interactivo de todo el bot, organizado por música, economía, RPG, expresiones y administración. Hay 79 expresiones anime, incluidas `a!hello`, `a!hi`, `a!bye`, `a!goodbye`, `a!goodmorning`, `a!goodnight`, `a!welcome`, `a!congrats`, `a!celebrate`, `a!sorry`, `a!comfort`, `a!love`, `a!missyou`, `a!goodluck`, `a!cheer`, `a!yay`, `a!proud`, `a!relax`, `a!excited` y `a!thanks`. Cada expresión incluye un GIF SFW aleatorio y alias disponibles en español.

Los comandos también aceptan prefijo `a!` como alternativa al slash. Atajos comunes: `a!p`/`a!play`, `a!s`/`a!search`, `a!q`/`a!queue`, `a!bal`/`a!b`, `a!d`/`a!daily`, `a!w`/`a!work`, `a!f`/`a!fish`, `a!c`/`a!crime`, `a!r`/`a!rob`, `a!rl`/`a!roulette`, `a!bj`/`a!21`. Los paneles conservan sus botones; música, economía y RPG usan las mismas reglas y datos que los slash. Por ser mensajes normales, las respuestas `a!` aparecen en el canal. Las acciones `a!admin` solo se aceptan en DM desde el ID propietario; ahí debes indicar el ID del servidor y del usuario.

Los GIFs de expresiones se solicitan a NEKOS.BEST, que publica endpoints SFW sin API key y requiere un encabezado User-Agent válido. Todas aceptan `@persona` para una escena compartida; `sip`, `slap`, `punch`, `kick` y `bite` tienen textos especiales aleatorios en esa modalidad. Hay un cooldown por persona y límite compartido local para respetar su cuota; si el servicio no responde, el bot avisa para reintentar. La imagen incluye la fuente y el anime cuando los metadatos lo proporcionan.

### Perfil, progreso y cosméticos

`/perfil [usuario]` o `a!perfil [@persona]` muestra una Profile Card PNG global con nivel, rango, XP, actividad, reputación, about, badges, mascota RPG y tema equipado. Sus botones abren personalización, inventario, tienda, progreso, Wallet Card, Rank Card y Room Card. `/wallet` muestra la tarjeta de billetera; el XP de chat se acredita como máximo una vez por minuto por usuario y servidor, y el aviso de nivel incluye su propia Level-up Card.

La tienda de perfil tiene búsqueda avanzada y categorías de fondos de perfil, mascotas RPG, housing, fondos de rank, level-up y wallet, badges, tags, marcos y stickers. Puedes previsualizar, comprar con monedas, equipar y retirar decoración desde los paneles. `/rep @persona` concede un punto de reputación al día. El esquema de perfil e inventario se crea automáticamente en SQLite o en la base MySQL configurada; no hay que subir secretos ni ejecutar una migración manual.

- Atajos de economía: `/bal` y `/balance` muestran billetera, banco y patrimonio; `/top` y `/baltop` muestran el ranking; `/profile` abre tu perfil y `/eco` el panel rápido.
- Acciones directas: `/fish`, `/21` o `/bj`, `/daily`, `/work`, `/crime`, `/rob`, `/roulette`, `/bank`, `/shop`, `/inventory` y `/pay` evitan escribir `/economia`.
- Los atajos comparten las mismas cuentas, cooldowns, pagos e inventario que los comandos `/economia`; no crean una economía paralela.
- Atajos directos: `/play`, `/p`, `/search`, `/buscar`, `/queue`, `/q`, `/pause`, `/resume`, `/skip`, `/prev`, `/stop`, `/leave` y `/np`. Así no hace falta escribir `/musica` para las acciones comunes.
- Dos monedas: **monedas** ganables en diaria, trabajo, pesca y juegos; **gemas premium** que solo se otorgan o retiran con `/economia admin_moneda` y permiso **Gestionar servidor**. La tienda premium aparece vacía hasta cargar artículos.
- `/economia tienda_premium`: abre el catálogo premium, que por ahora está vacío.
- La búsqueda de texto prueba YouTube Music, YouTube y SoundCloud en ese orden. Los enlaces de video de YouTube buscan primero el ID exacto para evitar cargar directamente un video restringido; también acepta enlaces de Spotify y `spsearch: artista canción`.
- `/economia panel`: abre el panel privado de economía.
- `/economia admin_moneda usuario cantidad`: un administrador otorga una cantidad positiva o retira una negativa de gemas premium; deja registro del movimiento.
- `/economia saldo`: consulta el saldo.
- `/economia diaria`: reclama 75 monedas cada 24 horas.
- `/economia trabajar`: gana entre 15 y 30 monedas cada hora.
- `/economia crimen` o `/crime`: intenta un golpe cada 4 horas; hay 40% de éxito, botín de 40 a 80 monedas o una multa de 10 a 30.
- `/economia pescar`: consigue una captura común o rara; hay enfriamiento de una hora y resultados variados.
- `/economia robar usuario`: tiene 40% de éxito, transfiere hasta 15% del saldo de la otra persona (máximo 200) y puede hacerte perder 5% del tuyo; enfriamiento de dos horas.
- `/economia ruleta cantidad color`: apuesta al rojo, negro o verde en una ruleta de monedas virtuales.
- `/economia blackjack apuesta`: juega veintiuno con panel interactivo para pedir carta o plantarse.
- `/economia casino`: abre el panel del casino con saldo y acceso a pesca.
- `/economia banco`: abre el panel para depositar y retirar monedas; el ahorro gana 0.01% de interés por día completo.
- `/economia usar articulo`: consume un artículo del inventario. El cebo duplica la próxima pesca al usarlo; el escudo bloquea robos durante 24 horas.
- `/economia apostar_objeto articulo color`: arriesga una unidad de un consumible en la ruleta; si gana, recibe monedas según su precio en tienda; si pierde, el artículo se consume.
- `/rpg panel`: ficha visual interactiva con rareza, nivel, atributos, equipo, mochila, encargos y bitácora persistente de la última expedición. Muestra las decisiones, encuentros, hallazgos y regreso; también aparece enlazada desde `/profile`.
- `/rpg nombrar nombre`: permite cambiar gratis el nombre de la mascota una sola vez. Una mascota adoptada con nombre personalizado ya usó esa opción.
- `/rpg bestiario`: atlas navegable de 48 especies, con rareza, elemento, especialidad y atributos base, acompañado por los dos atlas pixel art.
- `/rpg adoptar nombre`: adopta una de 48 especies. Las rarezas se distribuyen en 58% común, 25% poco común, 11% rara, 5% épica y 1% legendaria; cada especie pertenece a un tier y la rareza mejora atributos, combate y exploración.
- `/rpg explorar zona`: cinco zonas con dificultad, riesgo, rango de monedas, probabilidad de botín y tabla de rarezas propia. Cada región tiene un jefe con probabilidad de aparición, poder, recompensa y posibilidad de botín especial. El panel muestra el fondo, las probabilidades y el jefe antes de partir.
- `/rpg ataques`: escuela de combate para aprender técnicas gastando puntos que se obtienen al subir de nivel y equipar hasta cuatro ataques. Cada movimiento define elemento, precisión, coste de energía y efectos como daño, curación, drenaje, guardia o debilitamiento.
- `/rpg combatir`: pelea PvE contra enemigos escalados por nivel; la mascota usa su ataque equipado más fuerte que pueda pagar. Ganar da monedas y XP; perder puede dejarla debilitada.
- `/rpg retar oponente`: publica un desafío PvP en el chat; la persona retada acepta o rechaza y ambos juegan por turnos eligiendo sus movimientos equipados, además de defenderse, usar su técnica especial o rendirse. Los elementos tienen ventajas y resistencias; el duelo usa PV y energía simulados para no alterar la mascota normal.
- `/rpg entrenar atributo`: mejora fuerza, defensa o agilidad por 180 monedas y 15 de energía. La experiencia da niveles y sube atributos automáticamente.
- `/rpg tienda`, `/rpg comprar articulo` y `/rpg usar articulo`: bazar paginado de 80 artículos: 10 iniciales y 70 nuevos de curación, energía, experiencia, mejoras permanentes, equipo y preparación para expediciones.
- `/rpg misiones`: consulta y cobra encargos diarios de exploración, combate y entrenamiento.
- `/rpg ranking`: clasificación de mascotas por nivel y experiencia dentro del servidor.
- `/admin`: herramientas privadas del propietario para administrar billetera, banco, gemas, mascotas RPG, artículos, enfriamientos y protección; las acciones quedan auditadas y los ajustes de moneda se pueden revertir.
- La energía se regenera pasivamente; mascotas, movimientos aprendidos y equipados, puntos de aprendizaje, mochila, misiones y actividad persisten en la base de economía SQLite o MySQL.
- `/economia transferir usuario cantidad`: envía monedas a otra persona.
- `/economia inventario`: consulta los artículos comprados.
- `/economia ranking`: muestra las cuentas con más monedas.
- `/musica panel`: publica el panel de controles en el canal; incluye botón para desconectar y enlace a la canción actual cuando la fuente lo proporciona.
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

La reproducción usa un nodo Lavalink v4. `lavalink/application.yml` configura YouTube Source y LavaSrc 4.8.3 para resolver enlaces de Spotify usando el audio de YouTube. Para activar Spotify, define `SPOTIFY_CLIENT_ID` y `SPOTIFY_CLIENT_SECRET` en el entorno del proceso Lavalink o en el YAML privado del nodo. El panel público muestra progreso, carátula, cola, volumen y repetición; también ofrece pausa, salto, historial, mezcla, volumen, búsqueda de ±15 segundos, efectos, desconexión y enlace a la canción actual. La cola tiene vista paginada con opción para quitar canciones. Favoritos y listas se guardan en SQLite y sobreviven reinicios; el estado de reproducción permanece en Lavalink. El panel actualiza el progreso cada 15 segundos y al cambiar el estado del reproductor. Los controles de voz solo funcionan para miembros que estén en el mismo canal que el bot. No publiques credenciales ni el puerto del nodo sin configurar autenticación y red segura.

## Diseño

- `src/commands`: definición y lógica de comandos.
- `src/ui`: renderizado de paneles Discord.
- `src/services`: reglas de economía y conexión/control del reproductor.
- `src/storage`: SQLite, transacciones, inventario y ledger de monedas.
- `src/services/rpg.ts`: mascotas, progresión, expediciones, PvE, tienda, equipo y misiones enlazados a la economía.
- `assets/rpg`: ilustraciones pixel art de mascotas, huevos de rareza y mapa de zonas; `assets/reactions` contiene GIFs usados por expresiones locales como `a!cacawe`. El paquete del host debe conservar ambas carpetas junto a `dist/`.
- `src/events`: despacho de interacciones.

La economía se separa por servidor y usuario. El banco guarda una billetera y ahorro separados, acredita interés compuesto de 0.01% por día completo y limita cada actualización a 30 días de cálculo. Por defecto usa SQLite; en producción puedes elegir MySQL/MariaDB mediante `ECONOMY_DB_DRIVER=mysql` y las variables `ECONOMY_DB_*`. Apuestas, premios, robos, transferencias, compras y consumos usan transacciones y un ledger. El ranking suma billetera y banco. La tienda vende consumibles acumulables con efectos que se aplican al usarlos; la ruleta de artículos consume una unidad incluso al perder. Consulta [HOSTING.md](HOSTING.md) para configurar el panel y migrar saldos existentes. Favoritos y listas de música permanecen en SQLite. Lavalink mantiene el estado de la cola por servidor mientras el bot está activo.

### Comandos privados de administración

`/admin` está bloqueado por defecto y el código solo acepta el ID propietario `931978822323159111`; todas las respuestas son efímeras. Para que aparezca en el selector, permite ese usuario en cada servidor desde **Ajustes del servidor → Integraciones → Bot Manzanita → Comandos**. Discord puede seguir mostrando el comando a miembros con permiso Administrador, pero el bot les rechaza cualquier acción si su ID no coincide. Incluye saldo de billetera/banco/gemas, rollback de movimientos administrativos, entrega y retiro de mascotas/artículos, curación, XP, atributos, nombre, enfriamientos, escudo antirobo, inspección y auditoría.

En DM, los comandos administrativos por texto aceptan alias cortos: `a!mq <guildID> <userID>` retira la mascota; también están `md` (dar), `mc` (curar), `mxp` (XP), `mn` (nombre), `ma` (atributo), `rt` (enfriamiento), `i` (inspeccionar), `pr` (protección) y `rb` (rollback). Se puede anteponer `a!admin` a cualquiera, por ejemplo `a!admin mq <guildID> <userID>`. Los comandos slash conservan sus nombres actuales.
