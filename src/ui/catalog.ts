import { ActionRowBuilder, ContainerBuilder, StringSelectMenuBuilder, TextDisplayBuilder } from 'discord.js';

const categories = {
  inicio: {
    label: 'Inicio', description: 'Ayuda rápida y paneles', emoji: '🏠',
    body: '# 📚 CATÁLOGO MANZANITA\n`a!help` o `a!catalog` abre este catálogo. Elige una sección para ver sus comandos; todos aceptan prefijo **a!**.\n\n**Atajos:** `a!p` música · `a!bal` saldo · `a!rpg` mascota · `a!happy` expresión.\n\nLos comandos slash siguen disponibles. Si una función tiene panel, el prefijo también abre sus controles interactivos.',
  },
  expresiones: {
    label: 'Expresiones', description: 'Reacciones anime en GIF', emoji: '✨',
    body: '# ✨ EXPRESIONES ANIME\n45 acciones con GIF SFW aleatorio y **10 textos rotativos por acción**. Añade `@persona` para una escena compartida; algunas acciones lo requieren.\n\n**Ejemplos:** `a!sip @persona` comparte un té · `a!happy @persona` celebra con alguien · `a!slap @persona` · `a!punch @persona` · `a!hug @persona`\n\n**Gestos:** `a!happy`, `a!sip`, `a!angry`, `a!baka`, `a!bleh`, `a!blush`, `a!pout`, `a!facepalm`, `a!shocked`, `a!confused`, `a!bored`, `a!smug`, `a!think`, `a!shrug`, `a!nod`, `a!salute`\n**Sociales:** `a!hug @persona`, `a!pat @persona`, `a!cuddle @persona`, `a!carry @persona`, `a!handhold @persona`, `a!handshake @persona`, `a!highfive @persona`, `a!feed @persona`, `a!lappillow @persona`\n**Acciones:** `a!slap @persona`, `a!punch @persona`, `a!kick @persona`, `a!bonk @persona`, `a!bite @persona`, `a!poke @persona`, `a!yeet @persona`, `a!kiss @persona`, `a!peck @persona`, `a!blowkiss @persona`, `a!kabedon @persona`\n**Reacciones:** `a!cry`, `a!dance`, `a!wave`, `a!wink`, `a!laugh`, `a!nom`, `a!clap`, `a!run`, `a!spin`\n\nAlias en español: `a!feliz`, `a!te`, `a!enojado`, `a!abrazar`, `a!acariciar`, `a!golpear`, `a!aplaudir`, `a!sorprendido`, `a!pensar` y más.',
  },
  musica: {
    label: 'Música', description: 'Buscar, reproducir y controlar', emoji: '🎵',
    body: '# 🎵 MÚSICA\n`a!play` / `a!p` canción o URL · `a!search` / `a!s` consulta · `a!queue` / `a!q` cola · `a!np` panel\n`a!pause` · `a!resume` · `a!skip` · `a!prev` · `a!stop` · `a!leave` · `a!shuffle`\n`a!repeat track|queue|off` · `a!vol 0-100` · `a!fx normal|bass|rock|pop|nightcore|vaporwave`\n`a!fav` guardar actual · `a!fav list` ver · `a!fav remove ID` quitar\n`a!lists` listar · `a!lists save NOMBRE` guardar canción actual · `a!lists play NOMBRE` reproducir lista\n\nTambién existen slash directos: `/play`, `/search`, `/queue`, `/pause`, `/resume`, `/skip`, `/prev`, `/stop`, `/leave`, `/np` y `/musica`.',
  },
  economia: {
    label: 'Economía', description: 'Saldo, banco, tienda y juegos', emoji: '💰',
    body: '# 💰 ECONOMÍA\n`a!bal` / `a!b` / `a!balance [@persona]` · `a!top` / `a!baltop` · `a!profile` · `a!eco` panel\n`a!daily` / `a!d` · `a!work` / `a!w` · `a!fish` / `a!f` · `a!crime` / `a!c` · `a!rob` / `a!r @persona`\n`a!roulette` / `a!rl cantidad rojo|negro|verde` · `a!itembet ITEM COLOR` · `a!21` / `a!bj apuesta`\n`a!pay @persona cantidad` · `a!bank` · `a!bank deposit cantidad` · `a!bank withdraw cantidad`\n`a!shop` · `a!inv` · `a!use ITEM` · `a!casino` · `a!premium`\n\nAtajos slash: `/bal`, `/balance`, `/top`, `/baltop`, `/profile`, `/eco`, `/daily`, `/work`, `/fish`, `/crime`, `/rob`, `/roulette`, `/21`, `/bj`, `/pay`, `/bank`, `/shop`, `/inventory`.',
  },
  rpg: {
    label: 'RPG', description: 'Mascotas, expediciones y combate', emoji: '🐾',
    body: '# 🐾 RPG\n`a!rpg` panel · `a!adopt [nombre]` · `a!name NOMBRE` · `a!bestiary` · `a!attacks`\n`a!explore ZONA` · `a!fight` · `a!challenge @persona` · `a!train fuerza|defensa|agilidad`\n`a!rpgshop` · `a!buy ARTÍCULO` · `a!item ARTÍCULO` · `a!rpg inventory`\n`a!quests` · `a!quests claim ID` · `a!rank`\n\nSlash: `/rpg panel`, `adoptar`, `explorar`, `combatir`, `retar`, `entrenar`, `tienda`, `comprar`, `usar`, `misiones`, `ranking`, `ataques`.',
  },
  admin: {
    label: 'Admin', description: 'Herramientas privadas del propietario', emoji: '🛡️',
    body: '# 🛡️ ADMINISTRACIÓN PRIVADA\nSolo se aceptan tus comandos desde DM con ID propietario. Sintaxis: `a!admin ACCIÓN ID_SERVIDOR ID_USUARIO ...`\n\n`wallet|bank|premium ±cantidad` · `pet ESPECIE` · `remove` · `heal` · `xp cantidad` · `stat fuerza|defensa|agilidad cantidad` · `rename nombre` · `item ITEM_ID cantidad`\n`cooldown all|daily|work|fish|rob|crime|explore` · `shield horas` · `inspect` · `rollback LEDGER_ID` · `history`\n\nEjemplo: `a!admin wallet 111111111111111111 222222222222222222 5000`. Las acciones quedan registradas.',
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
