import { ActionRowBuilder, ContainerBuilder, StringSelectMenuBuilder, TextDisplayBuilder } from 'discord.js';

const categories = {
  inicio: {
    label: 'Inicio', description: 'Ayuda rápida y paneles', emoji: '🏠',
    body: '# 📚 CENTRO DE COMANDOS\nExplora una categoría con el menú de abajo. Los comandos funcionan con **a!** y también puedes usar los comandos slash.\n\n## ⚡ Atajos populares\n• `a!p canción` · reproducir música\n• `a!bal` · consultar saldo\n• `a!perfil` · abrir tu tarjeta\n• `a!rpg` · ver tu mascota\n• `a!happy` · compartir una expresión\n\nLos paneles incluyen botones y menús para controlar cada función desde Discord.',
  },
  expresiones: {
    label: 'Expresiones', description: 'Gestos e interacciones en GIF con frases divertidas', emoji: '✨',
    body: '# ✨ EXPRESIONES\n**59 gestos e interacciones** · GIF aleatorio · frases variadas y divertidas.\nMenciona a alguien para compartir una acción; las que requieren objetivo lo indican con `@persona`.\n\n## ☀️ Gestos y estados\n`a!happy` · `a!sip` · `a!angry` · `a!baka` · `a!bleh` · `a!blush`\n`a!pout` · `a!facepalm` · `a!shocked` · `a!confused` · `a!bored` · `a!smug`\n`a!think` · `a!shrug` · `a!nod` · `a!salute` · `a!cry` · `a!dance`\n`a!wave` · `a!wink` · `a!laugh` · `a!nom` · `a!clap` · `a!run` · `a!spin`\n`a!sleep` · `a!smile` · `a!yawn` · `a!stare` · `a!lurk` · `a!nope` · `a!nya`\n`a!teehee` · `a!thumbsup`\n\n## 🤝 Gestos para compartir\n`a!hug @persona` · `a!pat @persona` · `a!cuddle @persona` · `a!carry @persona`\n`a!handhold @persona` · `a!handshake @persona` · `a!highfive @persona`\n`a!feed @persona` · `a!lappillow @persona` · `a!kiss @persona` · `a!peck @persona`\n`a!blowkiss @persona` · `a!sip @persona` · `a!tickle @persona` · `a!wag`\n\n## 💥 Travesuras\n`a!slap @persona` · `a!punch @persona` · `a!kick @persona` · `a!bonk @persona`\n`a!bite @persona` · `a!poke @persona` · `a!yeet @persona` · `a!kabedon @persona`\n`a!shoot @persona` · `a!tableflip` · `a!shake @persona`\n\n## 🇲🇽 Alias en español\n`a!feliz` · `a!te` · `a!enojado` · `a!abrazar` · `a!acariciar` · `a!golpear`\n`a!aplaudir` · `a!sorprendido` · `a!pensar` y más.\n\n**Prueba:** `a!sip @persona` para compartir un té o `a!slap @persona` para iniciar el caos.',
  },
  musica: {
    label: 'Música', description: 'Buscar, reproducir y controlar', emoji: '🎵',
    body: '# 🎵 MÚSICA\nBusca canciones, arma la cola y controla el reproductor con botones.\n\n## 🔎 Buscar y reproducir\n• `a!play` / `a!p` **canción o URL** · reproduce o añade a la cola\n• `a!search` / `a!s` **consulta** · elige entre resultados\n• `a!np` · abre el reproductor\n• `a!queue` / `a!q` · revisa y edita la cola\n\n## 🎛️ Controles\n`a!pause` · `a!resume` · `a!skip` · `a!prev` · `a!stop` · `a!leave`\n`a!shuffle` · `a!repeat track|queue|off` · `a!vol 0-100`\n`a!fx normal|bass|rock|pop|nightcore|vaporwave`\n\n## 💜 Tu biblioteca\n• `a!fav` · guardar la canción actual\n• `a!fav list` · ver y reproducir favoritos\n• `a!lists` · explorar listas\n• `a!lists save NOMBRE` · guardar la canción actual\n• `a!lists play NOMBRE` · reproducir una lista\n\nTambién están `/play`, `/search`, `/queue` y `/musica`.',
  },
  economia: {
    label: 'Economía', description: 'Saldo, banco, tienda y juegos', emoji: '💰',
    body: '# 💰 ECONOMÍA Y PERFIL\nConsulta tu progreso, gana monedas y administra tu colección. Tus datos y el ranking se comparten en todos los servidores.\n\n## 👛 Saldo y progreso\n• `a!bal` / `a!b` / `a!balance @persona` · billetera y banco\n• `a!top` / `a!baltop` · ranking global\n• `a!perfil @persona` / `a!profile` · tarjeta de perfil\n• `a!wallet` · tarjeta de billetera · `a!rankcard` · rango global\n• `a!rep @persona` · dar reputación una vez al día\n\n## 🪙 Ganar monedas\n`a!daily` / `a!d` · `a!work` / `a!w` · `a!fish` / `a!f`\n`a!crime` / `a!c` · `a!rob @persona` / `a!r @persona`\n\n## 🎰 Juegos y banco\n• `a!roulette cantidad rojo|negro|verde` · `a!itembet ARTÍCULO COLOR`\n• `a!21 apuesta` / `a!bj apuesta` · blackjack con controles\n• `a!bank` · abrir banco · `a!bank deposit|withdraw cantidad`\n• `a!pay @persona cantidad` · transferir monedas\n\n## 🛍️ Colección\n`a!shop` tienda · `a!inv` inventario · `a!use ARTÍCULO` usar objeto\n`a!casino` panel de juegos · `a!premium` tienda de gemas administradas\n\nEn `/perfil` puedes personalizar tu tarjeta, ver artículos y visitar la tienda.',
  },
  rpg: {
    label: 'RPG', description: 'Mascotas, expediciones y combate', emoji: '🐾',
    body: '# 🐾 AVENTURAS RPG\nAdopta una mascota, prepara su build y llévala de expedición.\n\n## 🥚 Elige un huevo\n• `a!rpg` · abre la incubadora y elige una afinidad\n• `a!adopt HIELO [nombre]` · eclosiona una mascota aleatoria de hielo\n• `a!name NOMBRE` · nombrar gratis una vez\n• `a!attacks` · técnicas y build de combate\n\n## 🗺️ Aventura y combate\n`a!explore ZONA` · `a!fight` · `a!challenge @persona`\n`a!train fuerza|defensa|agilidad` · entrenar atributos\n\n## 🎒 Equipo y progreso\n`a!rpgshop` bazar · `a!buy ARTÍCULO` comprar · `a!item ARTÍCULO` usar/equipar\n`a!quests` misiones · `a!rank` ranking de mascotas\n\nLa especie y rareza salen al azar dentro del elemento elegido. Slash: `/rpg adoptar elemento:`.',
  },
  utilidades: {
    label: 'Utilidades', description: 'Juegos rápidos, perfiles e información', emoji: '🧰',
    body: '# 🧰 UTILIDADES\nAtajos prácticos para decisiones rápidas y datos del servidor.\n\n## 🎲 Decidir y jugar\n`a!roll [caras]` / `a!dado [caras]` · tira de 2 a 1,000,000 caras\n`a!coin` / `a!moneda` · lanza una moneda\n`a!choose opción 1, opción 2` · elige al azar entre tus opciones\n`a!8ball pregunta` / `a!bola pregunta` · respuesta aleatoria\n\n## 👤 Información\n`a!avatar [@persona]` · avatar en tamaño grande\n`a!userinfo [@persona]` · fecha de cuenta, ingreso e ID\n`a!serverinfo` · miembros y canales del servidor\n`a!ping` · latencia del bot y Discord\n\nTambién puedes usar `/utilidad` y elegir la herramienta desde el menú de comandos.',
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
