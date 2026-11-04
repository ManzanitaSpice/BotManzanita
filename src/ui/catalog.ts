import { ActionRowBuilder, ContainerBuilder, StringSelectMenuBuilder, TextDisplayBuilder } from 'discord.js';

const categories = {
  inicio: {
    label: 'Inicio', description: 'Ayuda rápida y paneles', emoji: '🏠',
    body: '# 📚 CENTRO DE COMANDOS\nExplora una categoría con el menú de abajo. Los comandos funcionan con **a!** y también puedes usar los comandos slash.\n\n## ⚡ Atajos populares\n• `a!p canción` · reproducir música\n• `a!bal` · consultar saldo\n• `a!perfil` · abrir tu tarjeta\n• `a!rpg` · ver tu mascota\n• `a!happy` · compartir una expresión\n\nLos paneles incluyen botones y menús para controlar cada función desde Discord.',
  },
  expresiones: {
    label: 'Expresiones', description: 'Gestos e interacciones en GIF con frases divertidas', emoji: '✨',
    body: '# ✨ EXPRESIONES\n**90 gestos e interacciones** · GIF aleatorio · frases variadas y divertidas.\nMenciona a alguien para compartir una acción; las que requieren objetivo lo indican con `@persona`.\n\n## 👋 Saludos y despedidas\n`a!hello` · `a!hi` · `a!bye` · `a!goodbye` · `a!goodmorning` · `a!goodnight` · `a!welcome` · `a!wave`\n\n## 🎉 Apoyo y celebración\n`a!congrats` · `a!celebrate` · `a!sorry` · `a!comfort` · `a!love` · `a!missyou`\n`a!goodluck` · `a!cheer` · `a!cheerup @persona` · `a!yay` · `a!proud` · `a!thanks`\n\n## ☀️ Gestos y estados\n`a!happy` · `a!sip` · `a!angry` · `a!baka` · `a!bleh` · `a!blush` · `a!cry`\n`a!pout` · `a!facepalm` · `a!shocked` · `a!gasp` · `a!confused` · `a!bored` · `a!smug`\n`a!think` · `a!shrug` · `a!nod` · `a!salute` · `a!dance` · `a!clap` · `a!run` · `a!panic`\n`a!wink` · `a!laugh` · `a!giggle` · `a!teehee` · `a!smile` · `a!grin` · `a!nom` · `a!thumbsup`\n`a!spin` · `a!sleep` · `a!snooze` · `a!yawn` · `a!stretch` · `a!stare` · `a!lurk` · `a!peek` · `a!nope` · `a!nya`\n`a!relax` · `a!excited` · `a!cacawe` · `a!wag` · `a!tableflip`\n\n## 🤝 Gestos para compartir\n`a!hug @persona` · `a!pat @persona` · `a!headpat @persona` · `a!boop @persona` · `a!cuddle @persona` · `a!carry @persona`\n`a!handhold @persona` · `a!handshake @persona` · `a!highfive @persona` · `a!feed @persona` · `a!lappillow @persona`\n`a!kiss @persona` · `a!peck @persona` · `a!blowkiss @persona` · `a!tickle @persona`\n\n## 💥 Travesuras\n`a!slap @persona` · `a!punch @persona` · `a!kick @persona` · `a!bonk @persona` · `a!bite @persona`\n`a!poke @persona` · `a!yeet @persona` · `a!kabedon @persona` · `a!shoot @persona` · `a!shake @persona`\n\n**Alias en español:** `a!feliz`, `a!hola`, `a!abrazar`, `a!acariciar`, `a!golpear`, `a!aplaudir`, `a!sorprendido`, `a!pensar`, `a!adiós`, `a!buenos_dias`, `a!gracias` y muchos más.',
  },
  musica: {
    label: 'Música', description: 'Buscar, reproducir y controlar', emoji: '🎵',
    body: '# 🎵 MÚSICA\nBusca canciones, arma la cola y controla el reproductor con botones. Debes estar en un canal de voz.\n\n## 🔎 Buscar y reproducir\n• `a!play` / `a!p` / `a!add` **canción o URL** · reproduce o añade a la cola\n• `a!search` / `a!s` **consulta** · elige entre resultados\n• `a!np` / `a!panel` · abre el reproductor\n• `a!queue` / `a!q` · revisa y edita la cola\n\n## 🎛️ Controles\n`a!pause` · `a!resume` · `a!skip` · `a!prev` · `a!stop` · `a!leave` · `a!shuffle`\n`a!repeat track|queue|off` · `a!vol 0-100` · `a!fx normal|bass|rock|pop|nightcore|vaporwave`\n`a!resume` recupera la cola del canal después de un reinicio durante 1 hora.\n\n## 💜 Favoritos y listas\n`a!fav` guarda la canción actual · `a!fav list` abre favoritos · `a!fav remove POSICIÓN` elimina uno\n`a!lists` muestra tus listas · `a!lists save NOMBRE` guarda la canción actual · `a!lists play NOMBRE` reproduce la lista\nUsa los botones de cada panel para reproducir, quitar canciones y administrar listas.\n\nSlash: `/musica buscar`, `/musica agregar`, `/musica cola`, `/musica favorito` y `/musica lista`.',
  },
  economia: {
    label: 'Economía', description: 'Saldo, banco, tienda y juegos', emoji: '💰',
    body: '# 💰 ECONOMÍA Y PERFIL\nConsulta tu progreso, gana monedas y administra tu colección.\n\n## 👛 Saldo y progreso\n`a!bal` / `a!b` / `a!balance [@persona]` · billetera y banco\n`a!top` / `a!baltop` / `a!rich` · ranking · `a!eco` · panel económico\n`a!perfil [@persona]` / `a!profile` · tarjeta · `a!wallet` · billetera · `a!rankcard` · rango\n`a!rep @persona` · dar reputación una vez al día\n\n## 🪙 Ganar monedas\n`a!daily` / `a!d` · `a!work` / `a!w` · `a!fish` / `a!f`\n`a!crime` / `a!c` · `a!rob @persona` / `a!r @persona`\n\n## 🎰 Juegos y banco\n`a!roulette` / `a!rl` **cantidad color** · `a!itembet ARTÍCULO color`\n`a!21` / `a!bj` **apuesta** · blackjack · `a!bank deposit|withdraw cantidad`\n`a!pay @persona cantidad` · transferir monedas\n\n## 🛍️ Colección\n`a!shop` / `a!tienda` · tienda · `a!inv` / `a!inventory` · inventario\n`a!use ARTÍCULO` · usar objeto · `a!premium` · tienda premium · `a!casino` · juegos\n\nLos botones de `/perfil`, banco, inventario y casino muestran más opciones.',
  },
  rpg: {
    label: 'RPG', description: 'Mascotas, expediciones y combate', emoji: '🐾',
    body: '# 🐾 AVENTURAS RPG\nAdopta una mascota, cuídala y llévala de expedición. Puedes usar `a!rpg ACCIÓN` o los atajos indicados.\n\n## 🥚 Mascota y cuidados\n`a!rpg` / `a!pet` · menú · `a!pet panel` · ficha · `a!adopt ELEMENTO [nombre]` · adoptar\n`a!name NOMBRE` · renombrar · `a!rpg cuidar` · aumentar vínculo\n`a!rpg alimentar [COMIDA]` · alimentar · `a!rpg mochila` · ver objetos\n\n## 🗺️ Aventura y combate\n`a!explore ZONA` · explorar · `a!fight` · combate contra enemigo\n`a!challenge @persona` · duelo PvP por turnos · `a!attacks` · técnicas y build\n`a!train fuerza|defensa|agilidad` · entrenar atributos\n\n## 🎒 Progreso\n`a!rpgshop` / `a!rpg shop` · bazar · `a!buy OBJETO` · comprar · `a!item OBJETO` · usar/equipar\n`a!quests` · misiones · `a!quests claim MISIÓN` · cobrar recompensa · `a!rank` · ranking\n\nSlash: `/rpg` abre las mismas funciones desde subcomandos y paneles.',
  },
  utilidades: {
    label: 'Utilidades', description: 'Juegos rápidos, perfiles e información', emoji: '🧰',
    body: '# 🧰 UTILIDADES\nAtajos para publicar, decidir y consultar información.\n\n## 📝 Publicar como bot\n`a!say texto` · publica el texto y borra el comando; también acepta archivos e imágenes\n`a!embed título | descripción | #color` · crea un embed con imagen opcional\n\n## 🎲 Decidir y jugar\n`a!roll [caras]` / `a!dado [caras]` · dado · `a!coin` / `a!moneda` · volado\n`a!choose OPCIÓN 1, OPCIÓN 2` · elegir al azar · `a!8ball pregunta` / `a!bola` · bola de cristal\n`a!hack [@persona]` / `a!hackear` · animación de terminal\n\n## 👤 Información\n`a!avatar [@persona]` / `a!av` · avatar · `a!userinfo [@persona]` / `a!whois` · información de usuario\n`a!serverinfo` / `a!server` · datos del servidor · `a!ping` · latencia\n\nSlash: `/utilidad dado`, `moneda`, `elegir`, `bola`, `avatar`, `usuario`, `servidor` o `ping`.',
  },
  admin: {
    label: 'Admin', description: 'Herramientas privadas del propietario', emoji: '🛡️',
    body: '# 🛡️ ADMINISTRACIÓN\nComandos privados del propietario. Úsalos por DM con `a!admin ACCIÓN SERVIDOR USUARIO ...`.\n\n## 💰 Cuentas y auditoría\n`wallet|bank|premium ±cantidad` · `inspect` · `history` · `rollback LEDGER_ID`\n\n## 🐾 Mascotas y objetos\n`pet ESPECIE` · `remove` · `heal` · `xp cantidad`\n`stat fuerza|defensa|agilidad cantidad` · `rename NOMBRE` · `item ID cantidad`\n\n## 🧰 Herramientas\n`cooldown all|daily|work|fish|rob|crime|explore` · `shield horas`\n\nCada cambio administrativo queda registrado en la auditoría.',
  },
} as const;

export type CatalogCategory = keyof typeof categories;
export function catalogPanel(selected: string = 'inicio') {
  const key: CatalogCategory = selected in categories ? selected as CatalogCategory : 'inicio';
  const category = categories[key];
  const container = new ContainerBuilder().setAccentColor(0x8b75dc)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(category.body))
    .addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder().setCustomId('catalog:category').setPlaceholder('📚 Explorar categorías').setOptions(
        ...Object.entries(categories).map(([value, entry]) => ({ label: entry.label, description: entry.description, value, emoji: entry.emoji, default: value === key })),
      ),
    ));
  return { components: [container], flags: ['IsComponentsV2'] as const };
}
