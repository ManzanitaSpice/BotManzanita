import { GLOBAL_SCOPE_ID } from '../storage/global-scope.js';
import { randomInt } from 'node:crypto';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { db } from '../storage/database.js';
import { economyPool, insertLedger, withEconomyTransaction } from '../storage/economy-database.js';

export type PetRarity = 'Común' | 'Poco común' | 'Raro' | 'Épico' | 'Legendario';
export type PetElement = 'Fuego' | 'Agua' | 'Naturaleza' | 'Viento' | 'Hielo' | 'Luz' | 'Sombra' | 'Tierra' | 'Rayo' | 'Astral';
export type PetSpecialization = 'Atacante' | 'Guardián' | 'Explorador' | 'Místico' | 'Apoyo';
export type RpgPet = {
  name: string; species: string; rarity: PetRarity; element: PetElement | 'Neutral'; specialization: PetSpecialization; level: number; xp: number;
  strength: number; defense: number; agility: number; hp: number; maxHp: number;
  energy: number; maxEnergy: number; hunger: number; affection: number; needsUpdatedAt: number; lastCareAt: number | null;
  lastExploreAt: number | null; lastBattleAt: number | null; lastTrainAt: number | null; dailyXp: number; dailyXpDate: string;
  equipment: Record<string, string>; expeditionEffects: { safety: number; luck: number };
  knownMoves: string[]; equippedMoves: string[]; movePoints: number; freeNameUsed: boolean;
};
type PetData = {
  name: string; species: string; rarity: PetRarity; element: PetElement | 'Neutral'; specialization: PetSpecialization; level: number; xp: number;
  strength: number; defense: number; agility: number; hp: number; maxHp: number;
  energy: number; maxEnergy: number; hunger: number; affection: number; needsUpdatedAt: number; lastCareAt: number | null;
  lastExploreAt: number | null; lastBattleAt: number | null; lastTrainAt: number | null; dailyXp: number; dailyXpDate: string;
  equipment: string; expeditionEffects: string; knownMoves: string; equippedMoves: string; movePoints: number; freeNameUsed: number | boolean;
  updatedAt: number;
};
type PetRow = RowDataPacket & PetData;
export type RpgMoveEffect = 'damage' | 'drain' | 'heal' | 'guard' | 'weaken';
export type RpgMove = { id: string; name: string; element: PetElement | 'Neutral'; minLevel: number; power: number; accuracy: number; energy: number; effect: RpgMoveEffect; description: string; specialization?: PetSpecialization };
type LootWeights = Array<[PetRarity, number]>;
type ZoneBoss = { name: string; emoji: string; spawnChance: number; power: number; reward: [number, number]; xp: [number, number]; dropChance: number; drops: string[] };
type Zone = { id: string; name: string; emoji: string; background: string; difficulty: string; minLevel: number; danger: number; reward: [number, number]; lootChance: number; lootWeights: LootWeights; drops: string[]; boss: ZoneBoss };
export type ExpeditionEvent = { emoji: string; title: string; detail: string };
export type ExpeditionLog = { id: string; zoneId: string; zoneName: string; events: ExpeditionEvent[]; coins: number; xp: number; itemId: string | null; createdAt: number };

type RpgItemEffect = 'heal' | 'energy' | 'snack' | 'full_energy' | 'revive' | 'xp' | 'equip_strength' | 'equip_defense' | 'equip_agility' | 'equip_all' | 'stat_strength' | 'stat_defense' | 'stat_agility' | 'expedition_safety' | 'expedition_luck';
type RpgItem = { id: string; name: string; emoji: string; rarity: PetRarity; category: string; cost: number; description: string; effect: RpgItemEffect; power: number };
const coreRpgItems: RpgItem[] = [
  { id: 'rpg_potion', name: 'Poción menor', emoji: '🧪', rarity: 'Común', category: 'Curación', cost: 100, description: 'Recupera 30 PV.', effect: 'heal', power: 30 },
  { id: 'rpg_ether', name: 'Éter de viaje', emoji: '🔹', rarity: 'Común', category: 'Energía', cost: 85, description: 'Recupera 35 de energía.', effect: 'energy', power: 35 },
  { id: 'rpg_berries', name: 'Bayas silvestres', emoji: '🫐', rarity: 'Común', category: 'Alimento', cost: 60, description: 'Recupera 15 PV y energía, +35 saciedad y cariño.', effect: 'snack', power: 15 },
  { id: 'rpg_super_potion', name: 'Poción solar', emoji: '☀️', rarity: 'Poco común', category: 'Curación', cost: 240, description: 'Recupera 75 PV.', effect: 'heal', power: 75 },
  { id: 'rpg_energy_crystal', name: 'Cristal de energía', emoji: '💠', rarity: 'Poco común', category: 'Energía', cost: 220, description: 'Restaura toda la energía.', effect: 'full_energy', power: 100 },
  { id: 'rpg_revive', name: 'Polvo de renacer', emoji: '✨', rarity: 'Raro', category: 'Reanimación', cost: 480, description: 'Levanta a una mascota debilitada con 35 PV.', effect: 'revive', power: 35 },
  { id: 'rpg_training_manual', name: 'Manual de campo', emoji: '📘', rarity: 'Raro', category: 'Experiencia', cost: 430, description: 'Otorga 60 XP.', effect: 'xp', power: 60 },
  { id: 'rpg_iron_charm', name: 'Amuleto de hierro', emoji: '🧿', rarity: 'Épico', category: 'Equipo', cost: 1000, description: 'Equipo: +4 defensa.', effect: 'equip_defense', power: 4 },
  { id: 'rpg_swift_boots', name: 'Botas del viento', emoji: '🥾', rarity: 'Épico', category: 'Equipo', cost: 1000, description: 'Equipo: +4 agilidad.', effect: 'equip_agility', power: 4 },
  { id: 'rpg_star_collar', name: 'Collar estelar', emoji: '🌟', rarity: 'Legendario', category: 'Equipo', cost: 2200, description: 'Equipo: +3 fuerza, defensa y agilidad.', effect: 'equip_all', power: 3 },
];

const raritySets = [
  { rarity: 'Común' as const, key: 'comun', emoji: '🟤', price: 110, labels: ['silvestre', 'del aprendiz'] },
  { rarity: 'Poco común' as const, key: 'inusual', emoji: '🟢', price: 250, labels: ['del rocío', 'de hoja viva'] },
  { rarity: 'Raro' as const, key: 'raro', emoji: '🔵', price: 575, labels: ['rúnico', 'de cristal'] },
  { rarity: 'Épico' as const, key: 'epico', emoji: '🟣', price: 1250, labels: ['ancestral', 'del eclipse'] },
  { rarity: 'Legendario' as const, key: 'legendario', emoji: '🟠', price: 2800, labels: ['celestial', 'primordial'] },
];
const itemNames = [
  { category: 'Curación', emoji: '🧪', names: [['Ungüento de musgo', 'Sopa de hierbas'], ['Bálsamo de rocío', 'Tónico de brote'], ['Suero del corazón', 'Poción de zafiro'], ['Elixir del guardián', 'Poción de aurora'], ['Lágrima del fénix', 'Elixir de vida eterna']] },
  { category: 'Energía', emoji: '⚡', names: [['Té del caminante', 'Fruta del alba'], ['Néctar verde', 'Café de aventurero'], ['Gema de pulso', 'Brebaje de centella'], ['Esencia inagotable', 'Núcleo de tormenta'], ['Ambrosía astral', 'Corazón de cometa']] },
  { category: 'Experiencia', emoji: '📘', names: [['Notas de campo', 'Cuento de fogata'], ['Cuaderno del bosque', 'Mapa anotado'], ['Crónica de héroes', 'Tomo de secretos'], ['Grimorio de batalla', 'Atlas del sabio'], ['Memoria de los ancestros', 'Libro de las estrellas']] },
  { category: 'Mejora', emoji: '🔮', names: [['Semilla de vigor', 'Piedra firme', 'Pluma ligera'], ['Brote de fuerza', 'Coraza de savia', 'Amuleto veloz'], ['Runa de poder', 'Sello guardián', 'Cristal de agilidad'], ['Núcleo titánico', 'Égida imperial', 'Viento encarnado'], ['Corazón volcánico', 'Bastión eterno', 'Paso del cometa']] },
  { category: 'Equipo', emoji: '🛡️', names: [['Daga de cobre', 'Chaleco de cuero', 'Grebas usadas'], ['Sable de roble', 'Manto de hojas', 'Botas de cazador'], ['Espada lunar', 'Armadura de coral', 'Grebas de zafiro'], ['Filo del eclipse', 'Égida ancestral', 'Botas del fénix'], ['Colmillo del dragón', 'Armadura celestial', 'Sandalias del vacío']] },
  { category: 'Exploración', emoji: '🧭', names: [['Tiza de senderos', 'Brújula de cobre'], ['Capa de caminante', 'Lente de buscador'], ['Mapa de explorador', 'Farol de plata'], ['Amuleto de ruta', 'Catalejo arcano'], ['Carta del destino', 'Compás de estrellas']] },
] as const;

const additionalRpgItems: RpgItem[] = [];
for (let tier = 0; tier < raritySets.length; tier++) {
  const rarity = raritySets[tier]!;
  const heal = 40 + tier * 28;
  const energy = 35 + tier * 13;
  const xp = 80 + tier * 90;
  const statPower = tier < 2 ? 1 : tier < 4 ? 2 : 3;
  const gearPower = 2 + Math.floor(tier / 2);
  const safety = 8 + tier * 6;
  const luck = 10 + tier * 7;
  const add = (suffix: string, category: string, name: string, emoji: string, effect: RpgItemEffect, power: number, multiplier = 1) => {
    additionalRpgItems.push({ id: `rpg_${rarity.key}_${suffix}`, name, emoji, rarity: rarity.rarity, category, cost: Math.round(rarity.price * multiplier),
      description: itemDescription(effect, power), effect, power });
  };
  const suffixes = ['parche', 'caldo', 'infusion', 'dulce', 'manual', 'cronica', 'fuerza', 'defensa', 'agilidad', 'arma', 'armadura', 'botas', 'resguardo', 'hallazgo'];
  itemNames.forEach((group, groupIndex) => group.names[tier]!.forEach((baseName, position) => {
    const suffix = suffixes[groupIndex === 0 ? position : groupIndex === 1 ? 2 + position : groupIndex === 2 ? 4 + position : groupIndex === 3 ? 6 + position : groupIndex === 4 ? 9 + position : 12 + position]!;
    const name = `${baseName} ${rarity.labels[position % rarity.labels.length]}`;
    const category = group.category;
    if (groupIndex === 0) add(suffix, category, name, group.emoji, 'heal', heal + position * 12, 1 + position * 0.35);
    else if (groupIndex === 1) add(suffix, category, name, group.emoji, position ? 'snack' : 'energy', position ? 12 + tier * 4 : energy, 0.9 + position * 0.2);
    else if (groupIndex === 2) add(suffix, category, name, group.emoji, 'xp', xp + position * 45, 1.1 + position * 0.4);
    else if (groupIndex === 3) add(suffix, category, name, group.emoji, (['stat_strength', 'stat_defense', 'stat_agility'] as const)[position]!, statPower, 1.2);
    else if (groupIndex === 4) add(suffix, category, name, group.emoji, (['equip_strength', 'equip_defense', 'equip_agility'] as const)[position]!, gearPower, 2.1);
    else add(suffix, category, name, group.emoji, position ? 'expedition_luck' : 'expedition_safety', position ? luck : safety, 1.25 + position * 0.25);
  }));
}
export const rpgItems: RpgItem[] = [...coreRpgItems, ...additionalRpgItems];
if (additionalRpgItems.length !== 70) throw new Error(`El catálogo extra RPG debe contener 70 artículos; contiene ${additionalRpgItems.length}.`);

function itemDescription(effect: RpgItemEffect, power: number): string {
  if (effect === 'heal') return `Recupera ${power} PV.`;
  if (effect === 'energy') return `Recupera ${power} de energía.`;
  if (effect === 'snack') return `Recupera ${power} PV y energía, +${Math.min(45, 20 + power)} saciedad y cariño.`;
  if (effect === 'xp') return `Otorga ${power} XP.`;
  if (effect.startsWith('stat_')) return `Mejora permanentemente ${effect.slice(5)} en +${power}.`;
  if (effect.startsWith('equip_')) return `Equipo permanente: mejora ${effect.slice(6)} en +${power}.`;
  if (effect === 'expedition_safety') return `Protege la siguiente salida: reduce el peligro en ${power} puntos.`;
  return `Mejora la siguiente salida: aumenta en ${power}% la oportunidad de hallar objetos.`;
}

export const rpgZones: Zone[] = [
  { id: 'bosque', name: 'Bosque Susurrante', emoji: '🌲', background: 'zone-bosque.png', difficulty: 'Tranquila', minLevel: 1, danger: 18, reward: [45, 95], lootChance: 34, lootWeights: [['Común', 66], ['Poco común', 26], ['Raro', 7], ['Épico', 1], ['Legendario', 0]], drops: ['rpg_berries', 'rpg_potion', 'rpg_ether', 'rpg_comun_parche', 'rpg_comun_caldo', 'rpg_comun_resguardo'], boss: { name: 'Ciervo Zarzal', emoji: '🦌', spawnChance: 6, power: 24, reward: [90, 150], xp: [35, 55], dropChance: 38, drops: ['rpg_comun_armadura', 'rpg_comun_agilidad', 'rpg_inusual_parche'] } },
  { id: 'cumbres', name: 'Cumbres de Bruma', emoji: '🏔️', background: 'zone-cumbres.png', difficulty: 'Moderada', minLevel: 3, danger: 32, reward: [90, 165], lootChance: 39, lootWeights: [['Común', 35], ['Poco común', 40], ['Raro', 20], ['Épico', 5], ['Legendario', 0]], drops: ['rpg_super_potion', 'rpg_energy_crystal', 'rpg_training_manual', 'rpg_inusual_manual', 'rpg_raro_manual', 'rpg_raro_armadura'], boss: { name: 'Yeti de la Cumbre', emoji: '❄️', spawnChance: 9, power: 36, reward: [170, 270], xp: [55, 80], dropChance: 48, drops: ['rpg_inusual_defensa', 'rpg_raro_parche', 'rpg_raro_botas'] } },
  { id: 'ruinas', name: 'Ruinas Antiguas', emoji: '🏛️', background: 'zone-ruinas.png', difficulty: 'Difícil', minLevel: 6, danger: 48, reward: [140, 250], lootChance: 44, lootWeights: [['Común', 15], ['Poco común', 35], ['Raro', 35], ['Épico', 13], ['Legendario', 2]], drops: ['rpg_revive', 'rpg_iron_charm', 'rpg_swift_boots', 'rpg_raro_cronica', 'rpg_epico_manual', 'rpg_raro_agilidad'], boss: { name: 'Coloso del Archivo', emoji: '🗿', spawnChance: 12, power: 50, reward: [260, 400], xp: [85, 120], dropChance: 58, drops: ['rpg_raro_defensa', 'rpg_epico_agilidad', 'rpg_epico_armadura'] } },
  { id: 'dunas', name: 'Dunas de Cristal', emoji: '🏜️', background: 'zone-dunas.png', difficulty: 'Élite', minLevel: 8, danger: 54, reward: [180, 300], lootChance: 48, lootWeights: [['Común', 10], ['Poco común', 30], ['Raro', 38], ['Épico', 18], ['Legendario', 4]], drops: ['rpg_training_manual', 'rpg_iron_charm', 'rpg_star_collar', 'rpg_raro_hallazgo', 'rpg_epico_hallazgo', 'rpg_legendario_hallazgo'], boss: { name: 'Dragón Espejismo', emoji: '🐲', spawnChance: 14, power: 58, reward: [350, 520], xp: [110, 155], dropChance: 65, drops: ['rpg_epico_fuerza', 'rpg_epico_armadura', 'rpg_legendario_parche'] } },
  { id: 'astral', name: 'Mar Astral', emoji: '🌌', background: 'zone-astral.png', difficulty: 'Mítica', minLevel: 10, danger: 60, reward: [220, 360], lootChance: 52, lootWeights: [['Común', 5], ['Poco común', 20], ['Raro', 35], ['Épico', 30], ['Legendario', 10]], drops: ['rpg_star_collar', 'rpg_revive', 'rpg_training_manual', 'rpg_epico_cronica', 'rpg_legendario_hallazgo', 'rpg_legendario_botas'], boss: { name: 'Leviatán de las Estrellas', emoji: '🐋', spawnChance: 18, power: 70, reward: [500, 750], xp: [150, 220], dropChance: 72, drops: ['rpg_epico_agilidad', 'rpg_legendario_armadura', 'rpg_legendario_cronica'] } },
];
for (const zone of rpgZones) {
  for (const itemId of [...zone.drops, ...zone.boss.drops]) {
    if (!rpgItems.some((item) => item.id === itemId)) throw new Error(`El botín RPG ${itemId} de ${zone.id} no existe en el catálogo.`);
  }
}

const zoneStories: Record<string, { arrival: string[]; decisions: Record<PetSpecialization, string[]>; threats: string[]; safeFinds: string[] }> = {
  bosque: {
    arrival: ['El rocío cubre las hojas y deja un rastro brillante.', 'Una bandada levanta el vuelo entre los árboles.', 'El aroma a bayas guía los primeros pasos.', 'Un arroyo divide el sendero y refleja el sol.', 'Las setas luminosas marcan un camino entre raíces.'],
    decisions: { Atacante: ['se adelanta para ahuyentar a la criatura del sendero', 'protege el paso enfrentando los gruñidos entre los matorrales', 'rompe una rama caída y abre camino al claro'], Guardián: ['revisa el terreno y escoge la ruta más protegida', 'camina delante para cubrir el cruce del arroyo', 'busca un refugio antes de que cambie el tiempo'], Explorador: ['sigue unas huellas pequeñas hasta una zona escondida', 'trepa una roca para observar el bosque desde arriba', 'marca el camino con hojas para no perderse'], Místico: ['escucha el murmullo de las setas luminosas', 'interpreta unas marcas antiguas en la corteza', 'sigue una chispa de magia entre los helechos'], Apoyo: ['reúne hierbas y ayuda a un pajarillo herido', 'comparte bayas con una familia de ratones', 'deja agua junto al sendero para los animales'] },
    threats: ['un jabalí de zarzas', 'un enjambre territorial', 'un slime verde', 'un cuervo ladrón', 'una raíz que se mueve'],
    safeFinds: ['una bolsa olvidada junto al tronco', 'monedas bajo un puente de madera', 'un nido de objetos brillantes', 'una vieja caja de guardabosques'],
  },
  cumbres: {
    arrival: ['La niebla tapa el camino y el viento silba entre los pinos.', 'El sendero asciende hacia una cascada helada.', 'Una corriente de aire trae olor a nieve.', 'Unas huellas cruzan la ladera hacia una cueva.', 'El sol ilumina un paso estrecho sobre las nubes.'],
    decisions: { Atacante: ['se planta ante un desprendimiento y aparta las rocas', 'ahuyenta a una bestia que bloquea el paso', 'cruza primero para asegurar el puente de hielo'], Guardián: ['busca una cornisa firme y cubre la subida', 'guía el paso lejos del borde de la montaña', 'se refugia detrás de una pared de piedra'], Explorador: ['lee las corrientes de viento para encontrar un atajo', 'sigue las huellas hasta un mirador escondido', 'marca con tiza el tramo más seguro'], Místico: ['descifra runas cubiertas de escarcha', 'sigue un brillo azul bajo la nieve', 'escucha ecos que señalan una cueva cercana'], Apoyo: ['comparte una fruta caliente y recupera el ánimo', 'ayuda a un pichón a volver a su nido', 'limpia la nieve de las señales del camino'] },
    threats: ['un gólem de hielo', 'un grifo joven', 'una avalancha repentina', 'un lobo de la cumbre', 'un puente que cruje'],
    safeFinds: ['un alijo de montañistas', 'monedas atrapadas en el hielo', 'un campamento abandonado', 'una veta de cristales azules'],
  },
  ruinas: {
    arrival: ['Las columnas cubiertas de musgo forman un corredor silencioso.', 'Una runa turquesa parpadea en la pared.', 'El polvo se levanta al cruzar una sala antigua.', 'Un mosaico señala dos caminos distintos.', 'La luz entra por una cúpula rota.'],
    decisions: { Atacante: ['activa la trampa antes de que cierre el pasillo', 'despeja una puerta bloqueada por escombros', 'se interpone entre el grupo y una estatua animada'], Guardián: ['prueba cada baldosa antes de avanzar', 'sostiene un arco de piedra mientras cruza', 'protege el regreso con una ruta fácil de reconocer'], Explorador: ['detecta marcas casi invisibles en el suelo', 'abre un compartimento oculto tras un relieve', 'se desliza por un corredor lateral sin ruido'], Místico: ['compara las runas y resuelve un acertijo', 'canaliza la energía de un obelisco', 'lee un mapa celeste tallado en mármol'], Apoyo: ['ordena los fragmentos de una inscripción', 'calma a un espíritu perdido con una luz suave', 'limpia el polvo de una palanca antigua'] },
    threats: ['un guardián de piedra', 'una sombra del archivo', 'una trampa de dardos', 'un escarabajo de bronce', 'un pasillo que se derrumba'],
    safeFinds: ['un cofre de la antigua guardia', 'una cámara secreta de ofrendas', 'un depósito de monedas reales', 'un altar con objetos intactos'],
  },
  dunas: {
    arrival: ['El sol poniente enciende las dunas de cobre.', 'Unas agujas de cristal sobresalen de la arena.', 'Las huellas se borran detrás de cada ráfaga.', 'Una torre astronómica aparece entre los espejismos.', 'La arena canta alrededor de un arco enterrado.'],
    decisions: { Atacante: ['rompe una formación cristalina que bloquea la ruta', 'ahuyenta a un escorpión de arena', 'se enfrenta a una ráfaga cargada de fragmentos'], Guardián: ['protege el paso detrás de una roca', 'busca sombra y espera a que pase el viento', 'cubre el cruce de una quebrada estrecha'], Explorador: ['sigue unas marcas hasta un observatorio sepultado', 'busca una ruta firme entre las dunas', 'usa las estrellas para orientarse en el espejismo'], Místico: ['lee el brillo de las vetas de cristal', 'activa un reloj de sol cubierto por la arena', 'sigue un pulso mágico bajo el suelo'], Apoyo: ['comparte agua con un pequeño viajero', 'despeja un nido de las arenas movedizas', 'reúne hierbas que crecen junto a los cristales'] },
    threats: ['un escorpión de cristal', 'una ráfaga de arena cortante', 'un espejismo que oculta el sendero', 'un gólem de cuarzo', 'un enjambre de polillas del desierto'],
    safeFinds: ['un alijo oculto bajo un mojón', 'un cofre del observatorio', 'un campamento de caravanas', 'una veta de gemas junto a una duna'],
  },
  astral: {
    arrival: ['El mar brilla como un cielo lleno de estrellas.', 'Una isla flotante cruza lentamente sobre la ruta.', 'Las olas dejan pequeñas luces en la orilla.', 'Un arco de constelaciones aparece en el horizonte.', 'La luna dibuja un camino plateado sobre el agua.'],
    decisions: { Atacante: ['salta a una plataforma para frenar una sombra errante', 'abre paso entre cristales que vibran con energía', 'se enfrenta a un guardián hecho de luz'], Guardián: ['ancla una plataforma flotante antes de cruzar', 'forma un refugio contra la marea astral', 'cubre la retirada cuando cambia la corriente'], Explorador: ['salta entre islas siguiendo una constelación', 'busca una ruta escondida en la espuma luminosa', 'observa el horizonte para anticipar la marea'], Místico: ['traza un símbolo y abre una brecha segura', 'conversa con una estrella fugaz', 'descifra el pulso de un monolito celeste'], Apoyo: ['devuelve una pequeña estrella al cielo', 'cura una medusa de luz varada en la playa', 'comparte energía con un espíritu cansado'] },
    threats: ['una mantarraya de sombra', 'un centinela astral', 'un remolino de luz', 'un fragmento de cometa', 'una isla que pierde estabilidad'],
    safeFinds: ['un cofre de navegante estelar', 'monedas de una isla flotante', 'un observatorio olvidado', 'una cápsula llegada en un cometa'],
  },
};
const decisionsBySpecialization: Record<PetSpecialization, string[]> = {
  Atacante: ['La mascota decide actuar con valentía: {decision}.', 'Su instinto de combate la lleva a {decision}.', 'Sin dudarlo, {name} elige {decision}.'],
  Guardián: ['Prioriza la seguridad y {decision}.', 'La mascota evalúa el riesgo y {decision}.', '{name} protege el camino mientras {decision}.'],
  Explorador: ['Prefiere investigar antes de avanzar: {decision}.', 'Su curiosidad la guía; decide {decision}.', '{name} examina las señales y {decision}.'],
  Místico: ['Percibe una corriente de energía y {decision}.', 'La intuición mágica le indica {decision}.', '{name} interpreta las señales y decide {decision}.'],
  Apoyo: ['Primero piensa en los demás y {decision}.', 'La mascota se detiene a ayudar: {decision}.', '{name} elige una ruta amable y {decision}.'],
};

export type PetSpecies = { name: string; emoji: string; base: [number, number, number]; rarity: PetRarity; element: PetElement; specialization: PetSpecialization };
const species: PetSpecies[] = [
  { name: 'Zorrito de brasa', emoji: '🦊', base: [9, 5, 9], element: 'Fuego', specialization: 'Atacante' },
  { name: 'Lunagato', emoji: '🐈', base: [7, 7, 10], element: 'Sombra', specialization: 'Explorador' },
  { name: 'Dracón de musgo', emoji: '🐉', base: [10, 9, 5], element: 'Naturaleza', specialization: 'Guardián' },
  { name: 'Ajolote astral', emoji: '🦎', base: [6, 10, 8], element: 'Agua', specialization: 'Apoyo' },
  { name: 'Cuervo de cristal', emoji: '🐦‍⬛', base: [8, 6, 10], element: 'Viento', specialization: 'Explorador' },
  { name: 'Osito trueno', emoji: '🐻', base: [10, 10, 4], element: 'Rayo', specialization: 'Guardián' },
  { name: 'Cierva lunar', emoji: '🦌', base: [7, 8, 9], element: 'Luz', specialization: 'Apoyo' },
  { name: 'Tortuga nube', emoji: '🐢', base: [5, 12, 5], element: 'Tierra', specialization: 'Guardián' },
  { name: 'Fénix diminuto', emoji: '🔥', base: [10, 6, 8], element: 'Fuego', specialization: 'Místico' },
  { name: 'Lobo de escarcha', emoji: '🐺', base: [9, 7, 8], element: 'Hielo', specialization: 'Atacante' },
  { name: 'Conejo champiñón', emoji: '🐇', base: [7, 8, 9], element: 'Naturaleza', specialization: 'Apoyo' },
  { name: 'Oveja de nube', emoji: '🐑', base: [6, 11, 6], element: 'Viento', specialization: 'Guardián' },
  { name: 'Rana de cristal', emoji: '🐸', base: [8, 7, 10], element: 'Agua', specialization: 'Explorador' },
  { name: 'Gólemito', emoji: '🗿', base: [7, 12, 5], element: 'Tierra', specialization: 'Guardián' },
  { name: 'Espíritu koi', emoji: '🐟', base: [9, 7, 8], element: 'Agua', specialization: 'Místico' },
  { name: 'Murciélago de sombra', emoji: '🦇', base: [8, 6, 11], element: 'Sombra', specialization: 'Explorador' },
  { name: 'Erizo de baya', emoji: '🦔', base: [7, 10, 7], element: 'Naturaleza', specialization: 'Guardián' },
  { name: 'Búho lunar', emoji: '🦉', base: [8, 8, 9], element: 'Astral', specialization: 'Místico' },
  { name: 'Caracol jardín', emoji: '🐌', base: [5, 12, 5], element: 'Tierra', specialization: 'Apoyo' },
  { name: 'Abeja dorada', emoji: '🐝', base: [9, 6, 10], element: 'Luz', specialization: 'Apoyo' },
  { name: 'Pingüino viajero', emoji: '🐧', base: [7, 10, 7], element: 'Hielo', specialization: 'Explorador' },
  { name: 'Polilla arcoíris', emoji: '🦋', base: [7, 6, 12], element: 'Luz', specialization: 'Místico' },
  { name: 'Grifo miniatura', emoji: '🦅', base: [11, 8, 7], element: 'Viento', specialization: 'Atacante' },
  { name: 'Serpiente estelar', emoji: '🐍', base: [10, 7, 9], element: 'Astral', specialization: 'Atacante' },
  { name: 'Salamandra de ceniza', emoji: '🦎', base: [10, 6, 8], element: 'Fuego', specialization: 'Atacante' },
  { name: 'Cangrejo coral', emoji: '🦀', base: [7, 12, 5], element: 'Agua', specialization: 'Guardián' },
  { name: 'Yak musgoso', emoji: '🐃', base: [8, 12, 4], element: 'Naturaleza', specialization: 'Guardián' },
  { name: 'Pavo real prisma', emoji: '🦚', base: [7, 7, 10], element: 'Luz', specialization: 'Apoyo' },
  { name: 'Lagartija cactus', emoji: '🦎', base: [8, 9, 8], element: 'Tierra', specialization: 'Explorador' },
  { name: 'Medusa burbuja', emoji: '🪼', base: [6, 8, 10], element: 'Agua', specialization: 'Místico' },
  { name: 'Lince lavanda', emoji: '🐈', base: [9, 6, 10], element: 'Sombra', specialization: 'Explorador' },
  { name: 'Ratón autómata', emoji: '🐭', base: [8, 7, 10], element: 'Rayo', specialization: 'Apoyo' },
  { name: 'Liebre de nieve', emoji: '🐇', base: [7, 7, 12], element: 'Hielo', specialization: 'Explorador' },
  { name: 'Carnero trueno', emoji: '🐏', base: [11, 8, 6], element: 'Rayo', specialization: 'Atacante' },
  { name: 'Luciérnaga farol', emoji: '🪲', base: [6, 8, 11], element: 'Luz', specialization: 'Apoyo' },
  { name: 'Pulpo de tinta', emoji: '🐙', base: [8, 9, 8], element: 'Sombra', specialization: 'Místico' },
  { name: 'Foca aurora', emoji: '🦭', base: [7, 11, 7], element: 'Hielo', specialization: 'Guardián' },
  { name: 'Pangolín de jade', emoji: '🦔', base: [7, 12, 6], element: 'Tierra', specialization: 'Guardián' },
  { name: 'Fénec del desierto', emoji: '🦊', base: [8, 6, 12], element: 'Fuego', specialization: 'Explorador' },
  { name: 'Grulla de papel', emoji: '🕊️', base: [6, 7, 12], element: 'Viento', specialization: 'Apoyo' },
  { name: 'Medusa lunar', emoji: '🪼', base: [7, 8, 10], element: 'Astral', specialization: 'Místico' },
  { name: 'Cachorro girasol', emoji: '🐕', base: [8, 8, 8], element: 'Naturaleza', specialization: 'Apoyo' },
  { name: 'Escarabajo basalto', emoji: '🪲', base: [7, 12, 5], element: 'Tierra', specialization: 'Guardián' },
  { name: 'Camaleón del viento', emoji: '🦎', base: [7, 8, 11], element: 'Viento', specialization: 'Explorador' },
  { name: 'Basilisco pequeño', emoji: '🐍', base: [11, 7, 7], element: 'Sombra', specialization: 'Atacante' },
  { name: 'Cisne de loto', emoji: '🦢', base: [7, 9, 9], element: 'Agua', specialization: 'Místico' },
  { name: 'Ardilla cometa', emoji: '🐿️', base: [8, 6, 12], element: 'Astral', specialization: 'Explorador' },
  { name: 'Manta de ópalo', emoji: '🪽', base: [8, 11, 7], element: 'Astral', specialization: 'Guardián' },
].map((entry, index) => ({ ...entry, rarity: index < 28 ? 'Común' : index < 40 ? 'Poco común' : index < 45 ? 'Raro' : index < 47 ? 'Épico' : 'Legendario' } as PetSpecies));
export function getPetSpeciesMetadata(name: string): PetSpecies | undefined {
  return species.find((candidate) => candidate.name === name);
}
export function getSpeciesCatalog(): ReadonlyArray<PetSpecies> { return species; }
export const rpgMoves: RpgMove[] = [
  { id: 'quick_tackle', name: 'Placaje', element: 'Neutral', minLevel: 1, power: 10, accuracy: 100, energy: 0, effect: 'damage', description: 'Ataque fiable, sin coste de energía.' },
  { id: 'flame_flick', name: 'Chispa ígnea', element: 'Fuego', minLevel: 1, power: 12, accuracy: 100, energy: 0, effect: 'damage', description: 'Golpe de fuego preciso.' },
  { id: 'ember_burst', name: 'Estallido de brasas', element: 'Fuego', minLevel: 5, power: 22, accuracy: 88, energy: 17, effect: 'weaken', description: 'Daño alto y debilita el próximo golpe rival.' },
  { id: 'bubble_shot', name: 'Burbuja veloz', element: 'Agua', minLevel: 1, power: 11, accuracy: 100, energy: 0, effect: 'damage', description: 'Ataque de agua rápido y preciso.' },
  { id: 'tidal_drain', name: 'Drenaje de marea', element: 'Agua', minLevel: 5, power: 18, accuracy: 92, energy: 15, effect: 'drain', description: 'Daña y recupera PV según el golpe.' },
  { id: 'thorn_whip', name: 'Látigo de espinas', element: 'Naturaleza', minLevel: 1, power: 12, accuracy: 96, energy: 0, effect: 'damage', description: 'Ataque vegetal equilibrado.' },
  { id: 'bloom_mend', name: 'Brote sanador', element: 'Naturaleza', minLevel: 5, power: 24, accuracy: 100, energy: 19, effect: 'heal', description: 'Recupera PV en vez de atacar.' },
  { id: 'gust_cut', name: 'Corte de vendaval', element: 'Viento', minLevel: 1, power: 11, accuracy: 100, energy: 0, effect: 'damage', description: 'Ataque veloz de viento.' },
  { id: 'tailwind_guard', name: 'Guardia de cola', element: 'Viento', minLevel: 5, power: 0, accuracy: 100, energy: 14, effect: 'guard', description: 'Reduce mucho el próximo daño recibido.' },
  { id: 'snow_shard', name: 'Esquirla de nieve', element: 'Hielo', minLevel: 1, power: 13, accuracy: 94, energy: 0, effect: 'damage', description: 'Golpe de hielo de potencia media.' },
  { id: 'frost_break', name: 'Ruptura glacial', element: 'Hielo', minLevel: 5, power: 20, accuracy: 88, energy: 16, effect: 'weaken', description: 'Daña y reduce la fuerza del siguiente ataque rival.' },
  { id: 'gleam_pulse', name: 'Pulso brillante', element: 'Luz', minLevel: 1, power: 11, accuracy: 100, energy: 0, effect: 'damage', description: 'Ataque luminoso fiable.' },
  { id: 'renewing_ray', name: 'Rayo renovador', element: 'Luz', minLevel: 5, power: 23, accuracy: 100, energy: 18, effect: 'heal', description: 'Recupera PV con energía luminosa.' },
  { id: 'night_claw', name: 'Garra nocturna', element: 'Sombra', minLevel: 1, power: 13, accuracy: 92, energy: 0, effect: 'damage', description: 'Golpe de sombra con probabilidad crítica alta.' },
  { id: 'umbral_drain', name: 'Drenaje umbrío', element: 'Sombra', minLevel: 5, power: 18, accuracy: 92, energy: 15, effect: 'drain', description: 'Roba vitalidad al rival.' },
  { id: 'pebble_bash', name: 'Golpe de guijarro', element: 'Tierra', minLevel: 1, power: 13, accuracy: 94, energy: 0, effect: 'damage', description: 'Ataque de tierra contundente.' },
  { id: 'stone_wall', name: 'Muro de piedra', element: 'Tierra', minLevel: 5, power: 0, accuracy: 100, energy: 14, effect: 'guard', description: 'Levanta una defensa reforzada.' },
  { id: 'spark_bolt', name: 'Chispa eléctrica', element: 'Rayo', minLevel: 1, power: 12, accuracy: 98, energy: 0, effect: 'damage', description: 'Descarga eléctrica rápida.' },
  { id: 'thunder_lance', name: 'Lanza de trueno', element: 'Rayo', minLevel: 5, power: 25, accuracy: 82, energy: 19, effect: 'damage', description: 'Gran potencia, pero puede fallar.' },
  { id: 'stardust', name: 'Polvo estelar', element: 'Astral', minLevel: 1, power: 12, accuracy: 98, energy: 0, effect: 'damage', description: 'Proyectil astral estable.' },
  { id: 'comet_well', name: 'Pozo de cometa', element: 'Astral', minLevel: 5, power: 20, accuracy: 90, energy: 17, effect: 'drain', description: 'Drena energía vital con fuerza astral.' },
  { id: 'reckless_charge', name: 'Carga temeraria', element: 'Neutral', minLevel: 4, power: 27, accuracy: 84, energy: 19, effect: 'damage', description: 'Ataque muy potente y arriesgado.', specialization: 'Atacante' },
  { id: 'iron_counter', name: 'Contraataque férreo', element: 'Neutral', minLevel: 4, power: 17, accuracy: 96, energy: 15, effect: 'damage', description: 'Golpea y prepara una guardia.', specialization: 'Guardián' },
  { id: 'precision_feint', name: 'Finta precisa', element: 'Neutral', minLevel: 4, power: 19, accuracy: 100, energy: 14, effect: 'damage', description: 'Ataque preciso con crítico mejorado.', specialization: 'Explorador' },
  { id: 'arcane_focus', name: 'Enfoque arcano', element: 'Neutral', minLevel: 4, power: 23, accuracy: 90, energy: 18, effect: 'weaken', description: 'Daña y debilita el siguiente golpe rival.', specialization: 'Místico' },
  { id: 'mending_song', name: 'Canto reparador', element: 'Neutral', minLevel: 4, power: 29, accuracy: 100, energy: 21, effect: 'heal', description: 'Una gran curación sin atacar.', specialization: 'Apoyo' },
];
const starterMoveByElement: Record<PetElement, string> = {
  Fuego: 'flame_flick', Agua: 'bubble_shot', Naturaleza: 'thorn_whip', Viento: 'gust_cut', Hielo: 'snow_shard',
  Luz: 'gleam_pulse', Sombra: 'night_claw', Tierra: 'pebble_bash', Rayo: 'spark_bolt', Astral: 'stardust',
};
export function getRpgMove(moveId: string): RpgMove | undefined { return rpgMoves.find((move) => move.id === moveId); }
export function getLearnableRpgMoves(pet: RpgPet): RpgMove[] {
  return rpgMoves.filter((move) => !pet.knownMoves.includes(move.id) && move.minLevel <= pet.level
    && (move.element === 'Neutral' || move.element === pet.element || (move.specialization && move.specialization === pet.specialization)));
}
export async function learnRpgMove(guildId: string, userId: string, moveId: string): Promise<{ ok: true; pet: RpgPet; move: RpgMove } | { ok: false; reason: 'no_pet' | 'locked' | 'already_known' | 'no_points' }> {
  guildId = GLOBAL_SCOPE_ID;
  const move = getRpgMove(moveId); if (!move) return { ok: false, reason: 'locked' };
  const learn = (pet: RpgPet) => {
    if (pet.knownMoves.includes(moveId)) return { ok: false as const, reason: 'already_known' as const };
    if (!getLearnableRpgMoves(pet).some((candidate) => candidate.id === moveId)) return { ok: false as const, reason: 'locked' as const };
    if (pet.movePoints < 1) return { ok: false as const, reason: 'no_points' as const };
    const updated = { ...pet, knownMoves: [...pet.knownMoves, moveId], equippedMoves: pet.equippedMoves.length < 4 ? [...pet.equippedMoves, moveId] : pet.equippedMoves, movePoints: pet.movePoints - 1 };
    return { ok: true as const, pet: updated, move };
  };
  const at = now();
  if (economyPool) return withEconomyTransaction(async (connection) => { const pet = await mysqlPet(connection, guildId, userId, true); if (!pet) return { ok: false as const, reason: 'no_pet' as const }; const result = learn(pet); if (result.ok) await savePetMysql(connection, guildId, userId, result.pet, at); return result; });
  const run = db.transaction(() => { const pet = sqlitePet(guildId, userId); if (!pet) return { ok: false as const, reason: 'no_pet' as const }; const result = learn(pet); if (result.ok) savePetSqlite(guildId, userId, result.pet, at); return result; });
  return run.immediate();
}
export async function equipRpgMoves(guildId: string, userId: string, moveIds: string[]): Promise<{ ok: true; pet: RpgPet } | { ok: false; reason: 'no_pet' | 'invalid_build' }> {
  guildId = GLOBAL_SCOPE_ID;
  const equip = (pet: RpgPet) => {
    const unique = [...new Set(moveIds)];
    if (unique.length < 1 || unique.length > 4 || unique.some((id) => !pet.knownMoves.includes(id))) return { ok: false as const, reason: 'invalid_build' as const };
    return { ok: true as const, pet: { ...pet, equippedMoves: unique } };
  };
  const at = now();
  if (economyPool) return withEconomyTransaction(async (connection) => { const pet = await mysqlPet(connection, guildId, userId, true); if (!pet) return { ok: false as const, reason: 'no_pet' as const }; const result = equip(pet); if (result.ok) await savePetMysql(connection, guildId, userId, result.pet, at); return result; });
  const run = db.transaction(() => { const pet = sqlitePet(guildId, userId); if (!pet) return { ok: false as const, reason: 'no_pet' as const }; const result = equip(pet); if (result.ok) savePetSqlite(guildId, userId, result.pet, at); return result; });
  return run.immediate();
}
const rarityWeights: Array<[PetRarity, number, number]> = [
  ['Común', 58, 0], ['Poco común', 25, 1], ['Raro', 11, 2], ['Épico', 5, 3], ['Legendario', 1, 4],
];
function rarityWeightsForElement(element?: PetElement): Array<[PetRarity, number, number]> {
  return element ? rarityWeights.filter(([rarity]) => species.some((candidate) => candidate.element === element && candidate.rarity === rarity)) : rarityWeights;
}
export function getPetRarityOdds(element: PetElement): Array<{ rarity: PetRarity; odds: number }> {
  const available = rarityWeightsForElement(element);
  const total = available.reduce((sum, [, weight]) => sum + weight, 0);
  const values = available.map(([rarity, weight]) => ({ rarity, odds: Math.round((weight / total) * 100) }));
  const roundedTotal = values.reduce((sum, entry) => sum + entry.odds, 0);
  if (values.length) values[0]!.odds += 100 - roundedTotal;
  return values;
}
const rarityRank: Record<PetRarity, number> = { 'Común': 0, 'Poco común': 1, 'Raro': 2, 'Épico': 3, 'Legendario': 4 };
export const RPG_DAILY_XP_CAP = 650;
export const RPG_EXPLORE_COOLDOWN = 4 * 60 * 60;
export const RPG_BATTLE_COOLDOWN = 3 * 60 * 60;
export const RPG_TRAIN_COOLDOWN = 8 * 60 * 60;
export const RPG_COIN_REWARD_SCALE = 0.5;
const EXPLORE_COOLDOWN = RPG_EXPLORE_COOLDOWN;
const CARE_COOLDOWN = 6 * 60 * 60;
const quests = [
  { id: 'explore', title: 'Cartógrafo', description: 'Completa 1 exploración', target: 1, reward: 40 },
  { id: 'battle', title: 'Guardián', description: 'Gana 1 combate PvE', target: 1, reward: 50 },
  { id: 'train', title: 'Disciplina', description: 'Entrena a tu mascota 1 vez', target: 1, reward: 30 },
] as const;

function now(): number { return Math.floor(Date.now() / 1000); }
function utcDate(at = now()): string { return new Date(at * 1000).toISOString().slice(0, 10); }
function pick<T>(items: readonly T[]): T { return items[randomInt(items.length)]!; }
function starterMoves(element: PetElement | 'Neutral'): string[] {
  const elemental = element === 'Neutral' ? undefined : starterMoveByElement[element];
  return elemental ? ['quick_tackle', elemental] : ['quick_tackle'];
}
function parseMoveList(value: string | undefined): string[] {
  try { const parsed = JSON.parse(value ?? '[]') as unknown; return Array.isArray(parsed) ? [...new Set(parsed.filter((id): id is string => typeof id === 'string' && Boolean(getRpgMove(id))))] : []; }
  catch { return []; }
}
function petFromRow(row: PetData | undefined): RpgPet | undefined {
  if (!row) return undefined;
  let equipment: Record<string, string> = {};
  try { equipment = JSON.parse(row.equipment ?? '{}') as Record<string, string>; } catch { equipment = {}; }
  let expeditionEffects = { safety: 0, luck: 0 };
  try { expeditionEffects = { ...expeditionEffects, ...JSON.parse(row.expeditionEffects ?? '{}') as Partial<typeof expeditionEffects> }; } catch { expeditionEffects = { safety: 0, luck: 0 }; }
  const lineage = species.find((candidate) => candidate.name === row.species);
  const element = row.element === 'Neutral' && lineage ? lineage.element : row.element;
  const specialization = row.specialization === 'Explorador' && lineage ? lineage.specialization : row.specialization;
  const knownMoves = parseMoveList(row.knownMoves);
  const resolvedKnownMoves = knownMoves.length ? knownMoves : starterMoves(element);
  const equippedMoves = parseMoveList(row.equippedMoves).filter((id) => resolvedKnownMoves.includes(id)).slice(0, 4);
  const level = Number(row.level);
  const maxEnergy = Number(row.maxEnergy);
  const currentTime = now();
  const needsUpdatedAt = Number(row.needsUpdatedAt || row.updatedAt || currentTime);
  const elapsedNeeds = Math.max(0, currentTime - needsUpdatedAt);
  const storedHunger = Number(row.hunger ?? 80);
  const hunger = Math.max(0, storedHunger - Math.floor(elapsedNeeds / 1800));
  const starvationSeconds = Math.max(0, elapsedNeeds - storedHunger * 1800);
  const affection = Math.max(0, Number(row.affection ?? 60) - Math.floor(starvationSeconds / 86400));
  const passiveEnergy = Math.floor(Math.max(0, currentTime - Number(row.updatedAt ?? currentTime)) / 90);
  return { name: row.name, species: row.species, rarity: row.rarity, element, specialization,
    level, xp: Number(row.xp),
    strength: Number(row.strength), defense: Number(row.defense), agility: Number(row.agility), hp: Number(row.hp), maxHp: Number(row.maxHp),
    energy: Math.min(maxEnergy, Number(row.energy) + passiveEnergy), maxEnergy, hunger, affection, needsUpdatedAt,
    lastCareAt: row.lastCareAt == null ? null : Number(row.lastCareAt),
    lastExploreAt: row.lastExploreAt == null ? null : Number(row.lastExploreAt),
    lastBattleAt: row.lastBattleAt == null ? null : Number(row.lastBattleAt), lastTrainAt: row.lastTrainAt == null ? null : Number(row.lastTrainAt),
    dailyXp: String(row.dailyXpDate ?? '') === utcDate() ? Number(row.dailyXp ?? 0) : 0, dailyXpDate: utcDate(), equipment, expeditionEffects,
    knownMoves: resolvedKnownMoves, equippedMoves: equippedMoves.length ? equippedMoves : resolvedKnownMoves.slice(0, 4), movePoints: Number(row.movePoints ?? Math.max(0, level - 1)), freeNameUsed: Boolean(row.freeNameUsed) };
}
function sqlitePet(guildId: string, userId: string): RpgPet | undefined {
  const row = db.prepare(`SELECT name, species, rarity, element, specialization, level, xp, strength, defense, agility, hp, max_hp AS maxHp,
    energy, max_energy AS maxEnergy, hunger, affection, needs_updated_at AS needsUpdatedAt, last_care_at AS lastCareAt,
    last_explore_at AS lastExploreAt,last_battle_at AS lastBattleAt,last_train_at AS lastTrainAt,daily_xp AS dailyXp,daily_xp_date AS dailyXpDate, equipment_json AS equipment, expedition_effects_json AS expeditionEffects,
    known_moves_json AS knownMoves,equipped_moves_json AS equippedMoves,move_points AS movePoints,free_name_used AS freeNameUsed,updated_at AS updatedAt
    FROM rpg_pets WHERE guild_id = ? AND user_id = ?`).get(guildId, userId) as PetData | undefined;
  return petFromRow(row);
}
async function mysqlPet(connection: PoolConnection, guildId: string, userId: string, lock = false): Promise<RpgPet | undefined> {
  const [rows] = await connection.execute<PetRow[]>(`SELECT name, species, rarity, element, specialization, level, xp, strength, defense, agility, hp,
    max_hp AS maxHp, energy, max_energy AS maxEnergy, hunger, affection, needs_updated_at AS needsUpdatedAt, last_care_at AS lastCareAt,
    last_explore_at AS lastExploreAt,last_battle_at AS lastBattleAt,last_train_at AS lastTrainAt,daily_xp AS dailyXp,daily_xp_date AS dailyXpDate, equipment_json AS equipment, expedition_effects_json AS expeditionEffects,
    known_moves_json AS knownMoves,equipped_moves_json AS equippedMoves,move_points AS movePoints,free_name_used AS freeNameUsed,updated_at AS updatedAt
    FROM rpg_pets WHERE guild_id = ? AND user_id = ?${lock ? ' FOR UPDATE' : ''}`, [guildId, userId]);
  return petFromRow(rows[0]);
}
function findRarity(element?: PetElement): { rarity: PetRarity; bonus: number } {
  const weights = rarityWeightsForElement(element);
  const totalWeight = weights.reduce((sum, [, weight]) => sum + weight, 0);
  const roll = randomInt(totalWeight);
  let total = 0;
  for (const entry of weights) { total += entry[1]; if (roll < total) return { rarity: entry[0], bonus: entry[2] }; }
  return { rarity: 'Común', bonus: 0 };
}
function xpNeeded(level: number): number { return 100 + (level - 1) * 45; }
function applyXp(pet: RpgPet, xpGain: number, enforceDailyCap = true, at = now()): { levels: number; pet: RpgPet; gained: number } {
  const day = utcDate(at);
  const dailyXp = pet.dailyXpDate === day ? pet.dailyXp : 0;
  const gained = Math.max(0, Math.min(Math.floor(xpGain), enforceDailyCap ? RPG_DAILY_XP_CAP - dailyXp : Math.floor(xpGain)));
  let xp = pet.xp + gained;
  let level = pet.level;
  let strength = pet.strength; let defense = pet.defense; let agility = pet.agility; let maxHp = pet.maxHp;
  let levels = 0;
  while (xp >= xpNeeded(level)) {
    xp -= xpNeeded(level); level++; levels++;
    strength += 2; defense += 2; agility += 1; maxHp += 8;
  }
  return { levels, gained, pet: { ...pet, level, xp, dailyXp: enforceDailyCap ? dailyXp + gained : dailyXp, dailyXpDate: day, strength, defense, agility, maxHp, hp: Math.min(maxHp, pet.hp + levels * 8), movePoints: pet.movePoints + levels } };
}
async function savePetMysql(connection: PoolConnection, guildId: string, userId: string, pet: RpgPet, updated = now()) {
  await connection.execute(`UPDATE rpg_pets SET name=?, element=?, specialization=?, level=?, xp=?, strength=?, defense=?, agility=?, hp=?, max_hp=?, energy=?, max_energy=?,
    hunger=?, affection=?, needs_updated_at=?, last_care_at=?, last_explore_at=?,last_battle_at=?,last_train_at=?,daily_xp=?,daily_xp_date=?, equipment_json=?, expedition_effects_json=?,known_moves_json=?,equipped_moves_json=?,move_points=?,free_name_used=?,updated_at=? WHERE guild_id=? AND user_id=?`,
  [pet.name, pet.element, pet.specialization, pet.level, pet.xp, pet.strength, pet.defense, pet.agility, pet.hp, pet.maxHp, pet.energy, pet.maxEnergy,
    pet.hunger, pet.affection, updated, pet.lastCareAt, pet.lastExploreAt,pet.lastBattleAt,pet.lastTrainAt,pet.dailyXp,pet.dailyXpDate, JSON.stringify(pet.equipment), JSON.stringify(pet.expeditionEffects), JSON.stringify(pet.knownMoves),JSON.stringify(pet.equippedMoves),pet.movePoints,Number(pet.freeNameUsed),updated, guildId, userId]);
}
function savePetSqlite(guildId: string, userId: string, pet: RpgPet, updated = now()) {
  db.prepare(`UPDATE rpg_pets SET name=?, element=?, specialization=?, level=?, xp=?, strength=?, defense=?, agility=?, hp=?, max_hp=?, energy=?, max_energy=?,
    hunger=?, affection=?, needs_updated_at=?, last_care_at=?, last_explore_at=?,last_battle_at=?,last_train_at=?,daily_xp=?,daily_xp_date=?, equipment_json=?, expedition_effects_json=?,known_moves_json=?,equipped_moves_json=?,move_points=?,free_name_used=?,updated_at=? WHERE guild_id=? AND user_id=?`).run(
    pet.name, pet.element, pet.specialization, pet.level, pet.xp, pet.strength, pet.defense, pet.agility, pet.hp, pet.maxHp, pet.energy, pet.maxEnergy,
    pet.hunger, pet.affection, updated, pet.lastCareAt, pet.lastExploreAt,pet.lastBattleAt,pet.lastTrainAt,pet.dailyXp,pet.dailyXpDate, JSON.stringify(pet.equipment), JSON.stringify(pet.expeditionEffects),JSON.stringify(pet.knownMoves),JSON.stringify(pet.equippedMoves),pet.movePoints,Number(pet.freeNameUsed),updated, guildId, userId);
}
async function changeBalanceMysql(connection: PoolConnection, guildId: string, userId: string, amount: number, reason: string, ref: string, at = now()) {
  await connection.execute('INSERT IGNORE INTO economy_accounts (guild_id,user_id,created_at,updated_at) VALUES (?,?,?,?)', [guildId, userId, at, at]);
  const [rows] = await connection.execute<RowDataPacket[]>('SELECT balance FROM economy_accounts WHERE guild_id=? AND user_id=? FOR UPDATE', [guildId, userId]);
  const balance = Number(rows[0]?.balance ?? 0);
  if (amount < 0 && balance < -amount) return { ok: false as const, balance };
  await connection.execute('UPDATE economy_accounts SET balance=balance+?,updated_at=? WHERE guild_id=? AND user_id=?', [amount, at, guildId, userId]);
  if (amount) await insertLedger(connection, { guildId, userId, amount, reason, reference: ref, createdAt: at });
  return { ok: true as const, balance: balance + amount };
}
function changeBalanceSqlite(guildId: string, userId: string, amount: number, reason: string, ref: string, at = now()) {
  db.prepare('INSERT OR IGNORE INTO economy_accounts (guild_id,user_id,created_at,updated_at) VALUES (?,?,?,?)').run(guildId, userId, at, at);
  const account = db.prepare('SELECT balance FROM economy_accounts WHERE guild_id=? AND user_id=?').get(guildId, userId) as { balance: number };
  if (amount < 0 && account.balance < -amount) return { ok: false as const, balance: account.balance };
  db.prepare('UPDATE economy_accounts SET balance=balance+?,updated_at=? WHERE guild_id=? AND user_id=?').run(amount, at, guildId, userId);
  if (amount) db.prepare('INSERT INTO economy_ledger (guild_id,user_id,amount,reason,reference,created_at) VALUES (?,?,?,?,?,?)').run(guildId, userId, amount, reason, ref, at);
  return { ok: true as const, balance: account.balance + amount };
}
async function updateQuestMysql(connection: PoolConnection, guildId: string, userId: string, questId: string, at = now()) {
  const date = new Date(at * 1000).toISOString().slice(0, 10);
  await connection.execute(`INSERT INTO rpg_quests (guild_id,user_id,quest_date,quest_id,progress,claimed) VALUES (?,?,?,?,1,0)
    ON DUPLICATE KEY UPDATE progress=LEAST(progress+1,1)`, [guildId, userId, date, questId]);
}
function updateQuestSqlite(guildId: string, userId: string, questId: string, at = now()) {
  const date = new Date(at * 1000).toISOString().slice(0, 10);
  db.prepare(`INSERT INTO rpg_quests (guild_id,user_id,quest_date,quest_id,progress,claimed) VALUES (?,?,?, ?,1,0)
    ON CONFLICT(guild_id,user_id,quest_date,quest_id) DO UPDATE SET progress=MIN(progress+1,1)`).run(guildId, userId, date, questId);
}

export async function getRpgPet(guildId: string, userId: string): Promise<RpgPet | undefined> {
  guildId = GLOBAL_SCOPE_ID;
  if (economyPool) { const connection = await economyPool.getConnection(); try { return await mysqlPet(connection, guildId, userId); } finally { connection.release(); } }
  return sqlitePet(guildId, userId);
}
export async function renameRpgPet(guildId: string, userId: string, requestedName: string): Promise<
  | { ok: true; pet: RpgPet }
  | { ok: false; reason: 'no_pet' | 'already_used' | 'invalid_name' }
> {
  guildId = GLOBAL_SCOPE_ID;
  const name = requestedName.trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 24 || /[\r\n@<>`*_~|]/.test(name)) return { ok: false, reason: 'invalid_name' };
  const at = now();
  const apply = (pet: RpgPet) => pet.freeNameUsed
    ? { ok: false as const, reason: 'already_used' as const }
    : { ok: true as const, pet: { ...pet, name, freeNameUsed: true } };
  if (economyPool) return withEconomyTransaction(async (connection) => {
    const pet = await mysqlPet(connection, guildId, userId, true); if (!pet) return { ok: false as const, reason: 'no_pet' as const };
    const result = apply(pet); if (result.ok) await savePetMysql(connection, guildId, userId, result.pet, at); return result;
  });
  const run = db.transaction(() => {
    const pet = sqlitePet(guildId, userId); if (!pet) return { ok: false as const, reason: 'no_pet' as const };
    const result = apply(pet); if (result.ok) savePetSqlite(guildId, userId, result.pet, at); return result;
  });
  return run.immediate();
}

export async function careForRpgPet(guildId: string, userId: string): Promise<
  | { ok: true; pet: RpgPet; affectionGained: number }
  | { ok: false; reason: 'no_pet' | 'cooldown' | 'max_affection'; secondsRemaining?: number }
> {
  guildId = GLOBAL_SCOPE_ID;
  const at = now();
  const care = (pet: RpgPet) => {
    if (pet.affection >= 100) return { ok: false as const, reason: 'max_affection' as const };
    const remaining = (pet.lastCareAt ?? 0) + CARE_COOLDOWN - at;
    if (remaining > 0) return { ok: false as const, reason: 'cooldown' as const, secondsRemaining: remaining };
    const affectionGained = pet.hunger < 30 ? 4 : pet.hunger < 60 ? 6 : 8;
    return { ok: true as const, affectionGained, pet: { ...pet, affection: Math.min(100, pet.affection + affectionGained), lastCareAt: at } };
  };
  if (economyPool) return withEconomyTransaction(async (connection) => {
    const pet = await mysqlPet(connection, guildId, userId, true); if (!pet) return { ok: false as const, reason: 'no_pet' as const };
    const result = care(pet); if (result.ok) await savePetMysql(connection, guildId, userId, result.pet, at); return result;
  });
  const run = db.transaction(() => {
    const pet = sqlitePet(guildId, userId); if (!pet) return { ok: false as const, reason: 'no_pet' as const };
    const result = care(pet); if (result.ok) savePetSqlite(guildId, userId, result.pet, at); return result;
  });
  return run.immediate();
}

export async function adoptRpgPet(guildId: string, userId: string, name: string, element?: PetElement): Promise<{ ok: true; pet: RpgPet } | { ok: false; reason: 'already_has_pet' | 'invalid_name' }> {
  guildId = GLOBAL_SCOPE_ID;
  const normalizedName = name.trim().replace(/\s+/g, ' ');
  if (normalizedName && (normalizedName.length < 2 || normalizedName.length > 24 || /[\r\n@<>`*_~|]/.test(normalizedName))) return { ok: false, reason: 'invalid_name' };
  const rarity = findRarity(element);
  const eligibleSpecies = species.filter((candidate) => candidate.rarity === rarity.rarity && (!element || candidate.element === element));
  const chosen = pick(eligibleSpecies);
  const stats = chosen.base.map((n) => n + randomInt(4) + rarity.bonus);
  const pet: RpgPet = { name: normalizedName || chosen.name, species: chosen.name, rarity: rarity.rarity, element: chosen.element, specialization: chosen.specialization, level: 1, xp: 0,
    strength: stats[0]!, defense: stats[1]!, agility: stats[2]!, hp: 70 + rarity.bonus * 2, maxHp: 70 + rarity.bonus * 2,
  energy: 100, maxEnergy: 100, hunger: 80, affection: 60, needsUpdatedAt: now(), lastCareAt: null, lastExploreAt: null, lastBattleAt: null, lastTrainAt: null, dailyXp: 0, dailyXpDate: utcDate(), equipment: {}, expeditionEffects: { safety: 0, luck: 0 },
    knownMoves: starterMoves(chosen.element), equippedMoves: starterMoves(chosen.element), movePoints: 0, freeNameUsed: Boolean(normalizedName) };
  const at = now();
  if (economyPool) return withEconomyTransaction(async (connection) => {
    const [result] = await connection.execute('INSERT IGNORE INTO rpg_pets (guild_id,user_id,name,species,rarity,element,specialization,level,xp,strength,defense,agility,hp,max_hp,energy,max_energy,last_explore_at,equipment_json,expedition_effects_json,known_moves_json,equipped_moves_json,move_points,free_name_used,created_at,updated_at) VALUES (?,?,?,?,?,?,?,1,0,?,?,?,?,?,100,100,NULL,?,?,?,?,0,?,?,?)',
      [guildId, userId, pet.name, pet.species, pet.rarity, pet.element, pet.specialization, pet.strength, pet.defense, pet.agility, pet.hp, pet.maxHp, '{}', '{}', JSON.stringify(pet.knownMoves), JSON.stringify(pet.equippedMoves), Number(pet.freeNameUsed), at, at]);
    if ((result as { affectedRows: number }).affectedRows === 0) return { ok: false as const, reason: 'already_has_pet' as const };
    return { ok: true as const, pet };
  });
  const adopt = db.transaction(() => {
    const result = db.prepare(`INSERT OR IGNORE INTO rpg_pets (guild_id,user_id,name,species,rarity,element,specialization,level,xp,strength,defense,agility,hp,max_hp,energy,max_energy,equipment_json,expedition_effects_json,known_moves_json,equipped_moves_json,move_points,free_name_used,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,1,0,?,?,?,?,?,100,100,'{}','{}',?,?,0,?,?,?)`).run(guildId, userId, pet.name, pet.species, pet.rarity, pet.element, pet.specialization, pet.strength, pet.defense, pet.agility, pet.hp, pet.maxHp, JSON.stringify(pet.knownMoves), JSON.stringify(pet.equippedMoves), Number(pet.freeNameUsed), at, at);
    return result.changes ? { ok: true as const, pet } : { ok: false as const, reason: 'already_has_pet' as const };
  });
  return adopt.immediate();
}

export async function adminGrantRpgPet(guildId: string, userId: string, speciesName: string, name = ''): Promise<
  { ok: true; pet: RpgPet } | { ok: false; reason: 'already_has_pet' | 'unknown_species' | 'invalid_name' }
> {
  guildId = GLOBAL_SCOPE_ID;
  const lineage = getPetSpeciesMetadata(speciesName);
  if (!lineage) return { ok: false, reason: 'unknown_species' };
  const normalizedName = name.trim().replace(/\s+/g, ' ');
  if (normalizedName && (normalizedName.length < 2 || normalizedName.length > 24 || /[\r\n@<>`*_~|]/.test(normalizedName))) return { ok: false, reason: 'invalid_name' };
  const bonus = rarityWeights.find(([rarity]) => rarity === lineage.rarity)?.[2] ?? 0;
  const stats = lineage.base.map((value) => value + bonus);
  const pet: RpgPet = {
    name: normalizedName || lineage.name, species: lineage.name, rarity: lineage.rarity, element: lineage.element,
    specialization: lineage.specialization, level: 1, xp: 0, strength: stats[0]!, defense: stats[1]!, agility: stats[2]!,
    hp: 70 + bonus * 2, maxHp: 70 + bonus * 2, energy: 100, maxEnergy: 100, hunger: 80, affection: 60, needsUpdatedAt: now(), lastCareAt: null, lastExploreAt: null, lastBattleAt: null, lastTrainAt: null, dailyXp: 0, dailyXpDate: utcDate(),
    equipment: {}, expeditionEffects: { safety: 0, luck: 0 }, knownMoves: starterMoves(lineage.element),
    equippedMoves: starterMoves(lineage.element), movePoints: 0, freeNameUsed: Boolean(normalizedName),
  };
  const at = now();
  if (economyPool) return withEconomyTransaction(async (connection) => {
    const [result] = await connection.execute('INSERT IGNORE INTO rpg_pets (guild_id,user_id,name,species,rarity,element,specialization,level,xp,strength,defense,agility,hp,max_hp,energy,max_energy,last_explore_at,equipment_json,expedition_effects_json,known_moves_json,equipped_moves_json,move_points,free_name_used,created_at,updated_at) VALUES (?,?,?,?,?,?,?,1,0,?,?,?,?,?,100,100,NULL,?,?,?,?,0,?,?,?)',
      [guildId, userId, pet.name, pet.species, pet.rarity, pet.element, pet.specialization, pet.strength, pet.defense, pet.agility, pet.hp, pet.maxHp, '{}', '{}', JSON.stringify(pet.knownMoves), JSON.stringify(pet.equippedMoves), Number(pet.freeNameUsed), at, at]);
    if ((result as { affectedRows: number }).affectedRows === 0) return { ok: false as const, reason: 'already_has_pet' as const };
    return { ok: true as const, pet };
  });
  const adopt = db.transaction(() => {
    const result = db.prepare(`INSERT OR IGNORE INTO rpg_pets (guild_id,user_id,name,species,rarity,element,specialization,level,xp,strength,defense,agility,hp,max_hp,energy,max_energy,equipment_json,expedition_effects_json,known_moves_json,equipped_moves_json,move_points,free_name_used,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,1,0,?,?,?,?,?,100,100,'{}','{}',?,?,0,?,?,?)`).run(guildId, userId, pet.name, pet.species, pet.rarity, pet.element, pet.specialization, pet.strength, pet.defense, pet.agility, pet.hp, pet.maxHp, JSON.stringify(pet.knownMoves), JSON.stringify(pet.equippedMoves), Number(pet.freeNameUsed), at, at);
    return result.changes ? { ok: true as const, pet } : { ok: false as const, reason: 'already_has_pet' as const };
  });
  return adopt.immediate();
}

export async function adminEditRpgPet(
  guildId: string,
  userId: string,
  edit: { type: 'restore' | 'heal' | 'energy' } | { type: 'xp'; amount: number } | { type: 'stat'; stat: 'strength' | 'defense' | 'agility'; amount: number } | { type: 'rename'; name: string },
): Promise<{ ok: true; pet: RpgPet; levels?: number } | { ok: false; reason: 'no_pet' | 'invalid_value' }> {
  guildId = GLOBAL_SCOPE_ID;
  if (edit.type === 'xp' && (!Number.isInteger(edit.amount) || edit.amount < 1 || edit.amount > 100_000)) return { ok: false, reason: 'invalid_value' };
  if (edit.type === 'stat' && (!Number.isInteger(edit.amount) || edit.amount === 0 || Math.abs(edit.amount) > 1_000)) return { ok: false, reason: 'invalid_value' };
  if (edit.type === 'rename' && (edit.name.trim().replace(/\s+/g, ' ').length < 2 || edit.name.trim().replace(/\s+/g, ' ').length > 24 || /[\r\n@<>`*_~|]/.test(edit.name))) return { ok: false, reason: 'invalid_value' };
  const change = (pet: RpgPet) => {
    let updated = { ...pet };
    let levels: number | undefined;
    if (edit.type === 'restore') { updated.hp = pet.maxHp; updated.energy = pet.maxEnergy; }
    else if (edit.type === 'heal') updated.hp = pet.maxHp;
    else if (edit.type === 'energy') updated.energy = pet.maxEnergy;
    else if (edit.type === 'xp') { const gained = applyXp(pet, edit.amount, false, at); updated = gained.pet; levels = gained.levels; }
    else if (edit.type === 'stat') {
      if (pet[edit.stat] + edit.amount < 1 || pet[edit.stat] + edit.amount > 10_000) return { ok: false as const, reason: 'invalid_value' as const };
      updated[edit.stat] = pet[edit.stat] + edit.amount;
    } else if (edit.type === 'rename') { updated.name = edit.name.trim().replace(/\s+/g, ' '); updated.freeNameUsed = true; }
    return { ok: true as const, pet: updated, ...(levels !== undefined ? { levels } : {}) };
  };
  const at = now();
  if (economyPool) return withEconomyTransaction(async (connection) => {
    const pet = await mysqlPet(connection, guildId, userId, true); if (!pet) return { ok: false as const, reason: 'no_pet' as const };
    const result = change(pet); if (result.ok) await savePetMysql(connection, guildId, userId, result.pet, at); return result;
  });
  const run = db.transaction(() => {
    const pet = sqlitePet(guildId, userId); if (!pet) return { ok: false as const, reason: 'no_pet' as const };
    const result = change(pet); if (result.ok) savePetSqlite(guildId, userId, result.pet, at); return result;
  });
  return run.immediate();
}

export async function releaseRpgPet(guildId: string, userId: string): Promise<boolean> {
  guildId = GLOBAL_SCOPE_ID;
  if (economyPool) return withEconomyTransaction(async (connection) => {
    const [result] = await connection.execute('DELETE FROM rpg_pets WHERE guild_id=? AND user_id=?', [guildId, userId]);
    return Number((result as { affectedRows: number }).affectedRows) > 0;
  });
  return db.prepare('DELETE FROM rpg_pets WHERE guild_id=? AND user_id=?').run(guildId, userId).changes > 0;
}

export async function adminRemoveRpgPet(guildId: string, userId: string): Promise<boolean> {
  return releaseRpgPet(guildId, userId);
}

export async function exploreRpg(guildId: string, userId: string, zoneId: string, reference: string): Promise<
  | { ok: true; pet: RpgPet; zone: Zone; coins: number; xp: number; damage: number; item: RpgItem | undefined; bossItem: RpgItem | undefined; boss?: { name: string; won: boolean }; levelUps: number; events: ExpeditionEvent[]; message: string }
  | { ok: false; reason: 'no_pet' | 'zone_locked' | 'cooldown' | 'low_energy' | 'low_hunger'; secondsRemaining?: number }
> {
  guildId = GLOBAL_SCOPE_ID;
  const zone = rpgZones.find((candidate) => candidate.id === zoneId);
  if (!zone) return { ok: false, reason: 'zone_locked' };
  const at = now();
  const resolve = (pet: RpgPet) => {
    if (pet.level < zone.minLevel) return { ok: false as const, reason: 'zone_locked' as const };
    const remaining = (pet.lastExploreAt ?? 0) + EXPLORE_COOLDOWN - at;
    if (remaining > 0) return { ok: false as const, reason: 'cooldown' as const, secondsRemaining: remaining };
    if (pet.energy < 20) return { ok: false as const, reason: 'low_energy' as const };
    if (pet.hunger < 15) return { ok: false as const, reason: 'low_hunger' as const };
    const story = zoneStories[zone.id]!;
    const affinity = pet.element !== 'Neutral' && zoneAffinity[zone.id]!.includes(pet.element) ? 7 : 0;
    const roleBonus = pet.specialization === 'Explorador' ? 7 : pet.specialization === 'Atacante' ? 4 : 0;
    const petRarity = rarityRank[pet.rarity];
    const bondBonus = pet.affection >= 75 ? 5 : pet.affection < 25 ? -8 : 0;
    const hungerPenalty = pet.hunger < 35 ? 12 : pet.hunger < 60 ? 5 : 0;
    const effectiveDanger = Math.max(5, Math.min(85, zone.danger - Math.floor(pet.agility / 5) - affinity - roleBonus - pet.expeditionEffects.safety - petRarity * 2 - bondBonus + hungerPenalty));
    const success = randomInt(100) >= effectiveDanger;
    let coins = success ? Math.floor((zone.reward[0] + randomInt(zone.reward[1] - zone.reward[0] + 1)) * RPG_COIN_REWARD_SCALE) : 0;
    const xpRaw = success ? 32 + randomInt(34) : 14 + randomInt(18);
    let xp = pet.specialization === 'Místico' ? Math.floor(xpRaw * 1.15) : xpRaw;
    const baseDamage = success ? randomInt(6) : 9 + randomInt(19);
    let damage = Math.max(0, baseDamage - (pet.specialization === 'Guardián' ? Math.floor(pet.defense / 5) : 0) - Math.floor(pet.expeditionEffects.safety / 20));
    const bondLoot = pet.affection >= 75 ? 4 : pet.affection < 25 ? -5 : 0;
    const dropChance = Math.max(5, Math.min(80, zone.lootChance + pet.expeditionEffects.luck + (pet.specialization === 'Explorador' ? 8 : 0) + petRarity * 3 + bondLoot - (pet.hunger < 35 ? 8 : 0)));
    const dropped = success && randomInt(100) < dropChance ? rollExpeditionDrop(zone) : undefined;
    const chosenDecision = pick(story.decisions[pet.specialization]);
    const threat = pick(story.threats);
    let boss: { name: string; won: boolean; rewardCoins: number; rewardXp: number } | undefined;
    let bossItem: RpgItem | undefined;
    if (success && randomInt(100) < zone.boss.spawnChance) {
      const bossPower = pet.strength + Math.floor(pet.defense / 2) + Math.floor(pet.agility / 2) + pet.level * 3 + petRarity * 2
        + (pet.specialization === 'Atacante' ? 5 : pet.specialization === 'Guardián' ? 3 : 0) + randomInt(12);
      const bossTarget = zone.boss.power + randomInt(12);
      const won = bossPower >= bossTarget;
      boss = { name: zone.boss.name, won, rewardCoins: 0, rewardXp: 0 };
      if (won) {
        const bonusCoins = Math.floor((zone.boss.reward[0] + randomInt(zone.boss.reward[1] - zone.boss.reward[0] + 1)) * RPG_COIN_REWARD_SCALE);
        const bonusXp = zone.boss.xp[0] + randomInt(zone.boss.xp[1] - zone.boss.xp[0] + 1);
        coins += bonusCoins;
        xp += bonusXp;
        boss.rewardCoins = bonusCoins;
        boss.rewardXp = bonusXp;
        if (randomInt(100) < zone.boss.dropChance) bossItem = pick(zone.boss.drops.map((id) => rpgItems.find((item) => item.id === id)!).filter(Boolean));
      } else {
        damage += Math.max(6, 14 + randomInt(15) - Math.floor(pet.defense / 4));
        xp += 12;
      }
    }
    const leveled = applyXp(pet, xp, true, at);
    xp = leveled.gained;
    const events: ExpeditionEvent[] = [
      { emoji: zone.emoji, title: `Llegada a ${zone.name}`, detail: pick(story.arrival) },
      { emoji: '🧠', title: 'Decisión de la mascota', detail: pick(decisionsBySpecialization[pet.specialization]).replace('{decision}', chosenDecision).replace('{name}', pet.name) },
      { emoji: success ? '⚔️' : '⚠️', title: success ? 'Superó el encuentro' : 'Un contratiempo', detail: success ? `${pet.name} encontró a ${threat} y lo resolvió con su especialidad ${pet.specialization.toLowerCase()}.` : `${threat} sorprendió a ${pet.name}; usó ${pet.element.toLowerCase()} para retirarse, pero recibió ${damage} de daño.` },
      { emoji: dropped ? dropped.emoji : success ? '🪙' : '🔎', title: dropped ? 'Hallazgo' : success ? 'Recompensa' : 'Búsqueda', detail: dropped ? `Exploró ${pick(story.safeFinds)} y encontró **${dropped.name}** (${dropped.rarity}).` : success ? `${pick(story.safeFinds)}: recuperó **${coins} monedas**.` : 'Revisó el área después del incidente; no encontró objetos esta vez.' },
    ];
    if (boss) events.push({ emoji: zone.boss.emoji, title: boss.won ? `Jefe derrotado: ${boss.name}` : `Jefe avistado: ${boss.name}`, detail: boss.won
      ? `Ganó el combate y recibió **${boss.rewardCoins} monedas**; la XP total se muestra al volver${bossItem ? `; encontró **${bossItem.name}** (${bossItem.rarity})` : `; no cayó botín especial (${zone.boss.dropChance}% de probabilidad)`}.`
      : `No logró vencerlo; recibió daño adicional y volvió con 12 XP de supervivencia.` });
    events.push({ emoji: '🏕️', title: 'Regreso al gremio', detail: `${pet.name} vuelve con ${xp} XP${damage ? ` y ${damage} PV de daño` : ' ilesa'}${coins ? `, ${coins} monedas` : ''}${boss ? `; ${boss.won ? 'derrotó' : 'se enfrentó a'} al jefe ${boss.name}` : ''}.` });
    const recoveredHp = pet.specialization === 'Apoyo' && success ? 5 : 0;
    const hungerCost = Math.min(pet.hunger, 20 + Math.floor(zone.minLevel / 2));
    const updated = { ...leveled.pet, hp: Math.max(1, Math.min(leveled.pet.maxHp, leveled.pet.hp - damage + recoveredHp)), energy: pet.energy - 20,
      hunger: pet.hunger - hungerCost, affection: Math.min(100, pet.affection + (success ? 2 : 1)), needsUpdatedAt: at, lastExploreAt: at,
      expeditionEffects: { safety: 0, luck: 0 } };
    return { ok: true as const, pet: updated, zone, coins, xp, damage, item: dropped, bossItem, ...(boss ? { boss } : {}), levelUps: leveled.levels, events,
      message: `${zone.emoji} ${success ? 'Expedición completada' : 'Expedición difícil'} en **${zone.name}**. ${boss ? `${zone.boss.emoji} ${boss.won ? `Derrotó a ${boss.name}` : `Perdió contra ${boss.name}`}. ` : ''}${dropped ? `Hallazgo: ${dropped.emoji} **${dropped.name}**. ` : ''}${bossItem ? `Botín de jefe: ${bossItem.emoji} **${bossItem.name}**. ` : ''}${coins ? `Botín: **${coins} monedas**. ` : ''}${leveled.levels ? `¡Subió ${leveled.levels} nivel(es)!` : ''}` };
  };
  if (economyPool) return withEconomyTransaction(async (connection) => {
    const pet = await mysqlPet(connection, guildId, userId, true); if (!pet) return { ok: false as const, reason: 'no_pet' as const };
    const result = resolve(pet); if (!result.ok) return result;
    await savePetMysql(connection, guildId, userId, result.pet, at);
    if (result.coins) await changeBalanceMysql(connection, guildId, userId, result.coins, 'rpg_explore', `${reference}:coins`, at);
    for (const item of [result.item, result.bossItem]) if (item) await connection.execute('INSERT INTO rpg_inventory (guild_id,user_id,item_id,quantity) VALUES (?,?,?,1) ON DUPLICATE KEY UPDATE quantity=quantity+1', [guildId, userId, item.id]);
    await connection.execute('INSERT INTO rpg_expedition_logs (id,guild_id,user_id,zone_id,events_json,coins,xp,item_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      [reference, guildId, userId, zone.id, JSON.stringify(result.events), result.coins, result.xp, result.bossItem?.id ?? result.item?.id ?? null, at]);
    await updateQuestMysql(connection, guildId, userId, 'explore', at);
    return result;
  });
  const run = db.transaction(() => {
    const pet = sqlitePet(guildId, userId); if (!pet) return { ok: false as const, reason: 'no_pet' as const };
    const result = resolve(pet); if (!result.ok) return result;
    savePetSqlite(guildId, userId, result.pet, at);
    if (result.coins) changeBalanceSqlite(guildId, userId, result.coins, 'rpg_explore', `${reference}:coins`, at);
    for (const item of [result.item, result.bossItem]) if (item) db.prepare('INSERT INTO rpg_inventory (guild_id,user_id,item_id,quantity) VALUES (?,?,?,1) ON CONFLICT(guild_id,user_id,item_id) DO UPDATE SET quantity=quantity+1').run(guildId, userId, item.id);
    db.prepare('INSERT INTO rpg_expedition_logs (id,guild_id,user_id,zone_id,events_json,coins,xp,item_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(reference, guildId, userId, zone.id, JSON.stringify(result.events), result.coins, result.xp, result.bossItem?.id ?? result.item?.id ?? null, at);
    updateQuestSqlite(guildId, userId, 'explore', at);
    return result;
  });
  return run.immediate();
}

const zoneAffinity: Record<string, PetElement[]> = {
  bosque: ['Naturaleza', 'Agua', 'Luz'], cumbres: ['Hielo', 'Viento', 'Rayo'], ruinas: ['Tierra', 'Sombra', 'Fuego'], dunas: ['Tierra', 'Fuego', 'Viento'], astral: ['Astral', 'Luz', 'Viento'],
};
function rollExpeditionDrop(zone: Zone): RpgItem | undefined {
  const roll = randomInt(100); let total = 0; let rarity: PetRarity = 'Común';
  for (const [tier, weight] of zone.lootWeights) { total += weight; if (roll < total) { rarity = tier; break; } }
  const regionalPool = zone.drops.map((id) => rpgItems.find((item) => item.id === id)).filter((item): item is RpgItem => Boolean(item && item.rarity === rarity));
  const pool = regionalPool.length ? regionalPool : rpgItems.filter((item) => item.rarity === rarity);
  return pool.length ? pick(pool) : undefined;
}

export async function getExpeditionLogPage(guildId: string, userId: string, limit = 5, offset = 0): Promise<{ logs: ExpeditionLog[]; total: number }> {
  guildId = GLOBAL_SCOPE_ID;
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(10, Math.floor(limit))) : 5;
  const safeOffset = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0;
  if (economyPool) {
    const connection = await economyPool.getConnection();
    try {
      const [countRows] = await connection.execute<RowDataPacket[]>('SELECT COUNT(*) AS total FROM rpg_expedition_logs WHERE guild_id=? AND user_id=?', [guildId, userId]);
      const [rows] = await connection.execute<RowDataPacket[]>(
        'SELECT id,zone_id AS zoneId,events_json AS events,coins,xp,item_id AS itemId,created_at AS createdAt FROM rpg_expedition_logs WHERE guild_id=? AND user_id=? ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?',
        [guildId, userId, safeLimit, safeOffset],
      );
      return { logs: rows.map((row) => expeditionLogFromRow(row)).filter((log): log is ExpeditionLog => Boolean(log)), total: Number(countRows[0]?.total ?? 0) };
    } finally { connection.release(); }
  }
  const totalRow = db.prepare('SELECT COUNT(*) AS total FROM rpg_expedition_logs WHERE guild_id=? AND user_id=?').get(guildId, userId) as { total: number };
  const rows = db.prepare('SELECT id,zone_id AS zoneId,events_json AS events,coins,xp,item_id AS itemId,created_at AS createdAt FROM rpg_expedition_logs WHERE guild_id=? AND user_id=? ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?')
    .all(guildId, userId, safeLimit, safeOffset) as RowDataPacket[];
  return { logs: rows.map((row) => expeditionLogFromRow(row)).filter((log): log is ExpeditionLog => Boolean(log)), total: Number(totalRow.total) };
}

export async function getLatestExpeditionLog(guildId: string, userId: string): Promise<ExpeditionLog | undefined> {
  return (await getExpeditionLogPage(guildId, userId, 1, 0)).logs[0];
}
function expeditionLogFromRow(row: RowDataPacket | undefined): ExpeditionLog | undefined {
  if (!row) return undefined;
  let events: ExpeditionEvent[] = [];
  try { events = JSON.parse(String(row.events)) as ExpeditionEvent[]; } catch { events = []; }
  const zone = rpgZones.find((candidate) => candidate.id === String(row.zoneId));
  return { id: String(row.id), zoneId: String(row.zoneId), zoneName: zone?.name ?? String(row.zoneId), events,
    coins: Number(row.coins), xp: Number(row.xp), itemId: row.itemId == null ? null : String(row.itemId), createdAt: Number(row.createdAt) };
}

export async function battleRpg(guildId: string, userId: string, reference: string): Promise<
  | { ok: true; pet: RpgPet; won: boolean; enemy: string; coins: number; xp: number; damage: number; levelUps: number; message: string }
  | { ok: false; reason: 'no_pet' | 'low_energy' | 'knocked_out' | 'cooldown'; secondsRemaining?: number }
> {
  guildId = GLOBAL_SCOPE_ID;
  const enemies = [{ name: 'Slime de bosque', minLevel: 1, power: 8, reward: [20, 35] }, { name: 'Ladrón de ruinas', minLevel: 3, power: 17, reward: [40, 65] }, { name: 'Gólem de obsidiana', minLevel: 6, power: 28, reward: [75, 110] }];
  const at = now();
  const resolve = (pet: RpgPet) => {
    if (pet.hp <= 0) return { ok: false as const, reason: 'knocked_out' as const };
    const remaining = (pet.lastBattleAt ?? 0) + RPG_BATTLE_COOLDOWN - at;
    if (remaining > 0) return { ok: false as const, reason: 'cooldown' as const, secondsRemaining: remaining };
    if (pet.energy < 10) return { ok: false as const, reason: 'low_energy' as const };
    const eligible = enemies.filter((candidate) => candidate.minLevel <= pet.level);
    const enemy = eligible[randomInt(eligible.length)]!;
    const combatMoves = pet.equippedMoves.map(getRpgMove).filter((move): move is RpgMove => Boolean(move && ['damage', 'drain', 'weaken'].includes(move.effect) && move.energy <= pet.energy));
    const chosenMove = combatMoves.sort((a, b) => (b.power * b.accuracy) - (a.power * a.accuracy))[0] ?? getRpgMove('quick_tackle')!;
    const moveHit = randomInt(100) < chosenMove.accuracy;
    const elementalBonus = chosenMove.element === pet.element && pet.specialization === 'Místico' ? 5 : 0;
    const conditionBonus = pet.affection >= 75 ? 3 : 0;
    const hungerPenalty = pet.hunger < 30 ? 5 : pet.hunger < 55 ? 2 : 0;
    const power = pet.strength + Math.floor(pet.agility / 2) + pet.level * 3 + rarityRank[pet.rarity] * 2 + chosenMove.power * 0.65 + elementalBonus + conditionBonus - hungerPenalty + randomInt(12) + (moveHit ? 0 : -chosenMove.power);
    const won = power >= enemy.power + randomInt(18);
    const damage = won ? Math.max(1, enemy.power - Math.floor(pet.defense / 3) - randomInt(4)) : 12 + randomInt(18);
    let xp = won ? 35 + randomInt(26) : 15;
    const coins = won ? enemy.reward[0]! + randomInt(enemy.reward[1]! - enemy.reward[0]! + 1) : 0;
    const level = applyXp(pet, xp, true, at); xp = level.gained; const healing = chosenMove.effect === 'drain' && moveHit ? Math.max(0, Math.floor(chosenMove.power * 0.15)) : 0;
    const updated = { ...level.pet, hp: Math.min(level.pet.maxHp, Math.max(0, level.pet.hp - damage + healing)), energy: pet.energy - Math.max(10, chosenMove.energy),
      hunger: Math.max(0, pet.hunger - 7), affection: Math.min(100, pet.affection + (won ? 1 : 0)), needsUpdatedAt: at, lastBattleAt: at };
    
    return { ok: true as const, pet: updated, won, enemy: enemy.name, coins, xp, damage, levelUps: level.levels,
      message: `${won ? '🏆 Victoria' : '💫 Retirada'} contra **${enemy.name}**. ${updated.name} usó **${chosenMove.name}**${moveHit ? '' : ', pero falló'} y ganó **${xp} XP**; recibió **${damage} de daño**.${healing ? ` Recuperó ${healing} PV al absorber energía.` : ''}${coins ? ` Botín: **${coins} monedas**.` : ''}${level.levels ? ` ¡Subió ${level.levels} nivel(es) y obtuvo ${level.levels} punto(s) de aprendizaje!` : ''}${updated.hp === 0 ? ' Quedó debilitada; usa polvo de renacer.' : ''}` };
  };
  if (economyPool) return withEconomyTransaction(async (connection) => { const pet = await mysqlPet(connection, guildId, userId, true); if (!pet) return { ok: false as const, reason: 'no_pet' as const }; const result = resolve(pet); if (!result.ok) return result; await savePetMysql(connection, guildId, userId, result.pet, at); if (result.coins) await changeBalanceMysql(connection, guildId, userId, result.coins, 'rpg_battle', `${reference}:coins`, at); if (result.won) await updateQuestMysql(connection, guildId, userId, 'battle', at); return result; });
  const run = db.transaction(() => { const pet = sqlitePet(guildId, userId); if (!pet) return { ok: false as const, reason: 'no_pet' as const }; const result = resolve(pet); if (!result.ok) return result; savePetSqlite(guildId, userId, result.pet, at); if (result.coins) changeBalanceSqlite(guildId, userId, result.coins, 'rpg_battle', `${reference}:coins`, at); if (result.won) updateQuestSqlite(guildId, userId, 'battle', at); return result; });
  return run.immediate();
}

export async function trainRpgPet(guildId: string, userId: string, stat: 'strength' | 'defense' | 'agility', reference: string): Promise<{ ok: true; pet: RpgPet; balance: number } | { ok: false; reason: 'no_pet' | 'low_energy' | 'low_hunger' | 'funds' | 'cooldown'; secondsRemaining?: number }> {
  guildId = GLOBAL_SCOPE_ID;
  const cost = 180; const at = now();
  const levelPet = (pet: RpgPet): RpgPet => ({ ...pet, [stat]: pet[stat] + 1, energy: pet.energy - 15, hunger: Math.max(0, pet.hunger - 6), needsUpdatedAt: at, lastTrainAt: at });
  if (economyPool) return withEconomyTransaction(async (connection) => {
    const pet = await mysqlPet(connection, guildId, userId, true); if (!pet) return { ok: false as const, reason: 'no_pet' as const };
    const remaining = (pet.lastTrainAt ?? 0) + RPG_TRAIN_COOLDOWN - at; if (remaining > 0) return { ok: false as const, reason: 'cooldown' as const, secondsRemaining: remaining };
    if (pet.energy < 15) return { ok: false as const, reason: 'low_energy' as const };
    if (pet.hunger < 8) return { ok: false as const, reason: 'low_hunger' as const };
    const payment = await changeBalanceMysql(connection, guildId, userId, -cost, 'rpg_training', reference, at); if (!payment.ok) return { ok: false as const, reason: 'funds' as const };
    const updated = levelPet(pet); await savePetMysql(connection, guildId, userId, updated, at); await updateQuestMysql(connection, guildId, userId, 'train', at);
    return { ok: true as const, pet: updated, balance: payment.balance };
  });
  const run = db.transaction(() => { const pet = sqlitePet(guildId, userId); if (!pet) return { ok: false as const, reason: 'no_pet' as const }; const remaining = (pet.lastTrainAt ?? 0) + RPG_TRAIN_COOLDOWN - at; if (remaining > 0) return { ok: false as const, reason: 'cooldown' as const, secondsRemaining: remaining }; if (pet.energy < 15) return { ok: false as const, reason: 'low_energy' as const }; if (pet.hunger < 8) return { ok: false as const, reason: 'low_hunger' as const }; const payment = changeBalanceSqlite(guildId, userId, -cost, 'rpg_training', reference, at); if (!payment.ok) return { ok: false as const, reason: 'funds' as const }; const updated = levelPet(pet); savePetSqlite(guildId, userId, updated, at); updateQuestSqlite(guildId, userId, 'train', at); return { ok: true as const, pet: updated, balance: payment.balance }; });
  return run.immediate();
}

export async function buyRpgItem(guildId: string, userId: string, itemId: string, reference: string): Promise<{ ok: true; balance: number; quantity: number } | { ok: false; reason: 'invalid_item' | 'funds' }> {
  guildId = GLOBAL_SCOPE_ID;
  const item = rpgItems.find((candidate) => candidate.id === itemId); if (!item) return { ok: false, reason: 'invalid_item' }; const at = now();
  if (economyPool) return withEconomyTransaction(async (connection) => { const payment = await changeBalanceMysql(connection, guildId, userId, -item.cost, 'rpg_shop', `${reference}:coins`, at); if (!payment.ok) return { ok: false as const, reason: 'funds' as const }; await connection.execute('INSERT INTO rpg_inventory (guild_id,user_id,item_id,quantity) VALUES (?,?,?,1) ON DUPLICATE KEY UPDATE quantity=quantity+1', [guildId, userId, itemId]); const [rows] = await connection.execute<RowDataPacket[]>('SELECT quantity FROM rpg_inventory WHERE guild_id=? AND user_id=? AND item_id=?', [guildId, userId, itemId]); return { ok: true as const, balance: payment.balance, quantity: Number(rows[0]?.quantity ?? 1) }; });
  const run = db.transaction(() => { const payment = changeBalanceSqlite(guildId, userId, -item.cost, 'rpg_shop', `${reference}:coins`, at); if (!payment.ok) return { ok: false as const, reason: 'funds' as const }; db.prepare('INSERT INTO rpg_inventory (guild_id,user_id,item_id,quantity) VALUES (?,?,?,1) ON CONFLICT(guild_id,user_id,item_id) DO UPDATE SET quantity=quantity+1').run(guildId, userId, itemId); const inv = db.prepare('SELECT quantity FROM rpg_inventory WHERE guild_id=? AND user_id=? AND item_id=?').get(guildId, userId, itemId) as { quantity: number }; return { ok: true as const, balance: payment.balance, quantity: inv.quantity }; }); return run.immediate();
}

export async function useRpgItem(guildId: string, userId: string, itemId: string, _reference: string): Promise<{ ok: true; pet: RpgPet; message: string } | { ok: false; reason: 'no_pet' | 'missing_item' | 'not_needed' }> {
  guildId = GLOBAL_SCOPE_ID;
  const item = rpgItems.find((candidate) => candidate.id === itemId); const at = now(); if (!item) return { ok: false, reason: 'missing_item' };
  const applyItem = (pet: RpgPet): { pet: RpgPet; message: string } | undefined => {
    let updated = { ...pet, equipment: { ...pet.equipment } }; let message = '';
    if (item.effect === 'heal') { if (pet.hp >= pet.maxHp) return undefined; updated.hp = Math.min(pet.maxHp, pet.hp + item.power); message = `💚 ${pet.name} recuperó ${updated.hp - pet.hp} PV.`; }
    else if (item.effect === 'energy') { if (pet.energy >= pet.maxEnergy) return undefined; updated.energy = Math.min(pet.maxEnergy, pet.energy + item.power); message = `⚡ ${pet.name} recuperó ${updated.energy - pet.energy} de energía.`; }
    else if (item.effect === 'snack') {
      const satiety = Math.min(45, 20 + item.power);
      if (pet.hp >= pet.maxHp && pet.energy >= pet.maxEnergy && pet.hunger >= 100) return undefined;
      updated.hp = Math.min(pet.maxHp, pet.hp + item.power);
      updated.energy = Math.min(pet.maxEnergy, pet.energy + item.power);
      updated.hunger = Math.min(100, pet.hunger + satiety);
      const affectionGain = pet.hunger < 35 ? 4 : pet.hunger < 60 ? 2 : 0;
      updated.affection = Math.min(100, pet.affection + affectionGain);
      updated.needsUpdatedAt = at;
      message = `🫐 ${pet.name} comió **${item.name}** · +${updated.hunger - pet.hunger} saciedad${affectionGain ? ` · +${Math.min(affectionGain, 100 - pet.affection)} cariño` : ''}.`;
    }
    else if (item.effect === 'full_energy') { if (pet.energy >= pet.maxEnergy) return undefined; updated.energy = pet.maxEnergy; message = `💠 La energía de ${pet.name} está completa.`; }
    else if (item.effect === 'revive') { if (pet.hp > 0) return undefined; updated.hp = item.power; message = `✨ ${pet.name} volvió a la aventura con ${item.power} PV.`; }
    else if (item.effect === 'xp') { const gained = applyXp(pet, item.power, true, at); if (!gained.gained) return undefined; updated = { ...gained.pet, equipment: { ...pet.equipment } }; message = `📘 ${pet.name} ganó ${gained.gained} XP.${gained.gained < item.power ? ` Límite diario: ${RPG_DAILY_XP_CAP} XP.` : ''}${gained.levels ? ` ¡Subió ${gained.levels} nivel(es)!` : ''}`; }
    else if (item.effect.startsWith('stat_')) {
      const stat = item.effect.slice(5) as 'strength' | 'defense' | 'agility';
      updated[stat] += item.power;
      message = `🔮 ${pet.name} mejoró permanentemente ${stat === 'strength' ? 'fuerza' : stat === 'defense' ? 'defensa' : 'agilidad'} en **+${item.power}**.`;
    }
    else if (item.effect.startsWith('equip_')) {
      const slot = item.effect === 'equip_strength' ? 'strength' : item.effect === 'equip_defense' ? 'defense' : item.effect === 'equip_agility' ? 'agility' : 'all';
      const previous = rpgItems.find((candidate) => candidate.id === updated.equipment[slot]);
      updated.equipment[slot] = item.id;
      const upgrade = item.power - (previous?.power ?? 0);
      if (slot === 'strength') updated.strength += upgrade;
      if (slot === 'defense') updated.defense += upgrade;
      if (slot === 'agility') updated.agility += upgrade;
      if (slot === 'all') { updated.strength += upgrade; updated.defense += upgrade; updated.agility += upgrade; }
      message = `${item.emoji} ${item.name} equipado en ${pet.name}${previous ? `; sustituyó ${previous.name}` : ''}.`;
    }
    else if (item.effect === 'expedition_safety' || item.effect === 'expedition_luck') {
      const field = item.effect === 'expedition_safety' ? 'safety' : 'luck';
      updated.expeditionEffects[field] = Math.min(50, updated.expeditionEffects[field] + item.power);
      message = `${item.emoji} ${item.name} preparado para la próxima expedición de ${pet.name}.`;
    }
    return { pet: updated, message };
  };
  if (economyPool) return withEconomyTransaction(async (connection) => {
    const pet = await mysqlPet(connection, guildId, userId, true); if (!pet) return { ok: false as const, reason: 'no_pet' as const };
    const [rows] = await connection.execute<RowDataPacket[]>('SELECT quantity FROM rpg_inventory WHERE guild_id=? AND user_id=? AND item_id=? FOR UPDATE', [guildId, userId, itemId]);
    if (Number(rows[0]?.quantity ?? 0) < 1) return { ok: false as const, reason: 'missing_item' as const };
    const result = applyItem(pet); if (!result) return { ok: false as const, reason: 'not_needed' as const };
    await connection.execute('UPDATE rpg_inventory SET quantity=quantity-1 WHERE guild_id=? AND user_id=? AND item_id=?', [guildId, userId, itemId]);
    await connection.execute('DELETE FROM rpg_inventory WHERE guild_id=? AND user_id=? AND item_id=? AND quantity<=0', [guildId, userId, itemId]);
    await savePetMysql(connection, guildId, userId, result.pet, at);
    return { ok: true as const, pet: result.pet, message: result.message };
  });
  const run = db.transaction(() => {
    const pet = sqlitePet(guildId, userId); if (!pet) return { ok: false as const, reason: 'no_pet' as const };
    const inventory = db.prepare('SELECT quantity FROM rpg_inventory WHERE guild_id=? AND user_id=? AND item_id=?').get(guildId, userId, itemId) as { quantity: number } | undefined;
    if (Number(inventory?.quantity ?? 0) < 1) return { ok: false as const, reason: 'missing_item' as const };
    const result = applyItem(pet); if (!result) return { ok: false as const, reason: 'not_needed' as const };
    db.prepare('UPDATE rpg_inventory SET quantity=quantity-1 WHERE guild_id=? AND user_id=? AND item_id=?').run(guildId, userId, itemId);
    db.prepare('DELETE FROM rpg_inventory WHERE guild_id=? AND user_id=? AND item_id=? AND quantity<=0').run(guildId, userId, itemId);
    savePetSqlite(guildId, userId, result.pet, at);
    return { ok: true as const, pet: result.pet, message: result.message };
  });
  return run.immediate();
}

export async function getRpgInventory(guildId: string, userId: string): Promise<Array<{ itemId: string; quantity: number }>> {
  guildId = GLOBAL_SCOPE_ID;
  if (economyPool) { const connection = await economyPool.getConnection(); try { const [rows] = await connection.execute<RowDataPacket[]>('SELECT item_id AS itemId,quantity FROM rpg_inventory WHERE guild_id=? AND user_id=? AND quantity>0 ORDER BY item_id', [guildId, userId]); return rows.map((row) => ({ itemId: String(row.itemId), quantity: Number(row.quantity) })); } finally { connection.release(); } }
  return (db.prepare('SELECT item_id AS itemId,quantity FROM rpg_inventory WHERE guild_id=? AND user_id=? AND quantity>0 ORDER BY item_id').all(guildId, userId) as Array<{ itemId: string; quantity: number }>).map((item) => ({ ...item, quantity: Number(item.quantity) }));
}

export async function getRpgQuests(guildId: string, userId: string): Promise<Array<{ id: string; title: string; description: string; target: number; reward: number; progress: number; claimed: boolean }>> {
  guildId = GLOBAL_SCOPE_ID;
  const date = new Date().toISOString().slice(0, 10);
  if (economyPool) { const connection = await economyPool.getConnection(); try { const [rows] = await connection.execute<RowDataPacket[]>('SELECT quest_id AS id,progress,claimed FROM rpg_quests WHERE guild_id=? AND user_id=? AND quest_date=?', [guildId, userId, date]); const map = new Map(rows.map((r) => [String(r.id), r])); return quests.map((q) => { const row = map.get(q.id); return { ...q, progress: Number(row?.progress ?? 0), claimed: Boolean(row?.claimed) }; }); } finally { connection.release(); } }
  const rows = db.prepare('SELECT quest_id AS id,progress,claimed FROM rpg_quests WHERE guild_id=? AND user_id=? AND quest_date=?').all(guildId, userId, date) as Array<{ id: string; progress: number; claimed: number }>;
  const map = new Map(rows.map((r) => [r.id, r])); return quests.map((q) => { const row = map.get(q.id); return { ...q, progress: Number(row?.progress ?? 0), claimed: Boolean(row?.claimed) }; });
}
export async function claimRpgQuest(guildId: string, userId: string, questId: string, reference: string): Promise<{ ok: true; balance: number } | { ok: false; reason: 'no_quest' | 'incomplete' | 'claimed' }> {
  guildId = GLOBAL_SCOPE_ID;
  const quest = quests.find((q) => q.id === questId); if (!quest) return { ok: false, reason: 'no_quest' };
  const date = new Date().toISOString().slice(0, 10); const at = now();
  if (economyPool) return withEconomyTransaction(async (connection) => {
    const [rows] = await connection.execute<RowDataPacket[]>('SELECT progress,claimed FROM rpg_quests WHERE guild_id=? AND user_id=? AND quest_date=? AND quest_id=? FOR UPDATE', [guildId,userId,date,questId]);
    const row = rows[0]; if (!row || Number(row.progress) < quest.target) return { ok: false as const, reason: 'incomplete' as const }; if (Boolean(row.claimed)) return { ok: false as const, reason: 'claimed' as const };
    await connection.execute('UPDATE rpg_quests SET claimed=1 WHERE guild_id=? AND user_id=? AND quest_date=? AND quest_id=?', [guildId,userId,date,questId]);
    const result = await changeBalanceMysql(connection,guildId,userId,quest.reward,'rpg_quest',reference,at); return { ok: true as const, balance: result.balance };
  });
  const run = db.transaction(() => {
    const row = db.prepare('SELECT progress,claimed FROM rpg_quests WHERE guild_id=? AND user_id=? AND quest_date=? AND quest_id=?').get(guildId,userId,date,questId) as { progress: number; claimed: number } | undefined;
    if (!row || Number(row.progress) < quest.target) return { ok: false as const, reason: 'incomplete' as const }; if (Boolean(row.claimed)) return { ok: false as const, reason: 'claimed' as const };
    db.prepare('UPDATE rpg_quests SET claimed=1 WHERE guild_id=? AND user_id=? AND quest_date=? AND quest_id=?').run(guildId,userId,date,questId);
    return { ok: true as const, balance: changeBalanceSqlite(guildId,userId,quest.reward,'rpg_quest',reference,at).balance };
  });
  return run.immediate();
}

export async function getRpgLeaderboard(guildId: string): Promise<Array<{ userId: string; name: string; species: string; rarity: PetRarity; level: number }>> {
  guildId = GLOBAL_SCOPE_ID;
  if (economyPool) { const connection = await economyPool.getConnection(); try { const [rows] = await connection.execute<RowDataPacket[]>('SELECT user_id AS userId,name,species,rarity,level FROM rpg_pets WHERE guild_id=? ORDER BY level DESC,xp DESC LIMIT 10', [guildId]); return rows as Array<{ userId: string; name: string; species: string; rarity: PetRarity; level: number }>; } finally { connection.release(); } }
  return db.prepare('SELECT user_id AS userId,name,species,rarity,level FROM rpg_pets WHERE guild_id=? ORDER BY level DESC,xp DESC LIMIT 10').all(guildId) as Array<{ userId: string; name: string; species: string; rarity: PetRarity; level: number }>;
}

export type RpgPvpStatus = 'pending' | 'active' | 'finished' | 'declined' | 'expired';
export type RpgPvpAction = 'attack' | 'guard' | 'special' | 'surrender' | 'move';
export type RpgPvpFighter = { userId: string; username: string; petName: string; species: string; rarity: PetRarity; element: string; specialization: PetSpecialization; level: number; strength: number; defense: number; agility: number; hp: number; maxHp: number; energy: number; maxEnergy: number; equippedMoves: string[]; guarding: boolean; weakened: boolean; specialUsed: boolean };
export type RpgPvpMatch = { id: string; guildId: string; challengerId: string; defenderId: string; status: RpgPvpStatus; turnUserId: string | null; winnerId: string | null; fighters: [RpgPvpFighter, RpgPvpFighter]; round: number; log: string[]; createdAt: number; updatedAt: number; expiresAt: number };
type PvpMatchRow = RowDataPacket & { id: string; guildId: string; challengerId: string; defenderId: string; status: RpgPvpStatus; state: string; winnerId: string | null; createdAt: number; updatedAt: number; expiresAt: number };
const PVP_CHALLENGE_TTL = 5 * 60;
const PVP_MATCH_TTL = 24 * 60 * 60;

function fighterFromPet(userId: string, username: string, pet: RpgPet): RpgPvpFighter {
  const safeName = pet.name.replace(/@/g, '@\u200b').replace(/([\\_*~`|>])/g, '\\$1');
  return { userId, username, petName: safeName, species: pet.species, rarity: pet.rarity, element: pet.element, specialization: pet.specialization, level: pet.level,
    strength: pet.strength, defense: pet.defense, agility: pet.agility, hp: pet.maxHp, maxHp: pet.maxHp, energy: pet.energy, maxEnergy: pet.maxEnergy, equippedMoves: pet.equippedMoves, guarding: false, weakened: false, specialUsed: false };
}
function pvpState(match: RpgPvpMatch) { return JSON.stringify({ turnUserId: match.turnUserId, fighters: match.fighters, round: match.round, log: match.log }); }
function pvpMatchFromRow(row: PvpMatchRow | undefined): RpgPvpMatch | undefined {
  if (!row) return undefined;
  try {
    const state = JSON.parse(row.state) as Pick<RpgPvpMatch, 'turnUserId' | 'fighters' | 'round' | 'log'>;
    if (!Array.isArray(state.fighters) || state.fighters.length !== 2) return undefined;
    const fighters = state.fighters.map((fighter) => ({ ...fighter, energy: Number(fighter.energy ?? 100), maxEnergy: Number(fighter.maxEnergy ?? 100), equippedMoves: Array.isArray(fighter.equippedMoves) ? fighter.equippedMoves : ['quick_tackle'], weakened: Boolean(fighter.weakened) })) as [RpgPvpFighter, RpgPvpFighter];
    return { id: String(row.id), guildId: String(row.guildId), challengerId: String(row.challengerId), defenderId: String(row.defenderId), status: row.status,
      turnUserId: state.turnUserId, winnerId: row.winnerId == null ? null : String(row.winnerId), fighters, round: Number(state.round), log: state.log,
      createdAt: Number(row.createdAt), updatedAt: Number(row.updatedAt), expiresAt: Number(row.expiresAt) };
  } catch { return undefined; }
}
function pvpInsertSqlite(match: RpgPvpMatch) {
  db.prepare('INSERT INTO rpg_pvp_matches (id,guild_id,challenger_id,defender_id,status,state_json,winner_id,created_at,updated_at,expires_at) VALUES (?,?,?,?,?,?,NULL,?,?,?)')
    .run(match.id, match.guildId, match.challengerId, match.defenderId, match.status, pvpState(match), match.createdAt, match.updatedAt, match.expiresAt);
}
async function pvpInsertMysql(connection: PoolConnection, match: RpgPvpMatch) {
  await connection.execute('INSERT INTO rpg_pvp_matches (id,guild_id,challenger_id,defender_id,status,state_json,winner_id,created_at,updated_at,expires_at) VALUES (?,?,?,?,?,?,NULL,?,?,?)',
    [match.id, match.guildId, match.challengerId, match.defenderId, match.status, pvpState(match), match.createdAt, match.updatedAt, match.expiresAt]);
}
function pvpSaveSqlite(match: RpgPvpMatch) {
  db.prepare('UPDATE rpg_pvp_matches SET status=?,state_json=?,winner_id=?,updated_at=?,expires_at=? WHERE id=?')
    .run(match.status, pvpState(match), match.winnerId, match.updatedAt, match.expiresAt, match.id);
}
async function pvpSaveMysql(connection: PoolConnection, match: RpgPvpMatch) {
  await connection.execute('UPDATE rpg_pvp_matches SET status=?,state_json=?,winner_id=?,updated_at=?,expires_at=? WHERE id=?',
    [match.status, pvpState(match), match.winnerId, match.updatedAt, match.expiresAt, match.id]);
}
function pvpSelectSqlite(id: string): RpgPvpMatch | undefined {
  const row = db.prepare(`SELECT id,guild_id AS guildId,challenger_id AS challengerId,defender_id AS defenderId,status,state_json AS state,winner_id AS winnerId,created_at AS createdAt,updated_at AS updatedAt,expires_at AS expiresAt FROM rpg_pvp_matches WHERE id=?`).get(id) as PvpMatchRow | undefined;
  return pvpMatchFromRow(row);
}
async function pvpSelectMysql(connection: PoolConnection, id: string, lock = false): Promise<RpgPvpMatch | undefined> {
  const [rows] = await connection.execute<PvpMatchRow[]>(`SELECT id,guild_id AS guildId,challenger_id AS challengerId,defender_id AS defenderId,status,state_json AS state,winner_id AS winnerId,created_at AS createdAt,updated_at AS updatedAt,expires_at AS expiresAt FROM rpg_pvp_matches WHERE id=?${lock ? ' FOR UPDATE' : ''}`, [id]);
  return pvpMatchFromRow(rows[0]);
}
function pvpFinish(match: RpgPvpMatch, winnerId: string | null, status: 'finished' | 'declined' | 'expired', at: number, line: string) {
  match.status = status; match.winnerId = winnerId; match.turnUserId = null; match.updatedAt = at; match.expiresAt = at;
  match.log = [...match.log, line].slice(-12);
}
function pvpBusySqlite(guildId: string, userA: string, userB: string, at: number): boolean {
  return Boolean(db.prepare(`SELECT 1 FROM rpg_pvp_matches WHERE guild_id=? AND status IN ('pending','active') AND expires_at>? AND (challenger_id IN (?,?) OR defender_id IN (?,?)) LIMIT 1`)
    .get(guildId, at, userA, userB, userA, userB));
}
async function pvpBusyMysql(connection: PoolConnection, guildId: string, userA: string, userB: string, at: number): Promise<boolean> {
  const [rows] = await connection.execute<RowDataPacket[]>(`SELECT 1 FROM rpg_pvp_matches WHERE guild_id=? AND status IN ('pending','active') AND expires_at>? AND (challenger_id IN (?,?) OR defender_id IN (?,?)) LIMIT 1 FOR UPDATE`,
    [guildId, at, userA, userB, userA, userB]);
  return rows.length > 0;
}

export async function createRpgPvpChallenge(guildId: string, challengerId: string, challengerName: string, defenderId: string, defenderName: string, reference: string): Promise<
  | { ok: true; match: RpgPvpMatch }
  | { ok: false; reason: 'self' | 'no_challenger_pet' | 'no_defender_pet' | 'busy' }
> {
  guildId = GLOBAL_SCOPE_ID;
  if (challengerId === defenderId) return { ok: false, reason: 'self' };
  const at = now();
  if (economyPool) return withEconomyTransaction(async (connection) => {
    const ids = [challengerId, defenderId].sort();
    const pets = new Map<string, RpgPet | undefined>();
    for (const id of ids) pets.set(id, await mysqlPet(connection, guildId, id, true));
    const challenger = pets.get(challengerId); const defender = pets.get(defenderId);
    if (!challenger) return { ok: false as const, reason: 'no_challenger_pet' as const };
    if (!defender) return { ok: false as const, reason: 'no_defender_pet' as const };
    if (await pvpBusyMysql(connection, guildId, challengerId, defenderId, at)) return { ok: false as const, reason: 'busy' as const };
    const match: RpgPvpMatch = { id: reference, guildId, challengerId, defenderId, status: 'pending', turnUserId: challengerId, winnerId: null,
      fighters: [fighterFromPet(challengerId, challengerName, challenger), fighterFromPet(defenderId, defenderName, defender)], round: 1,
      log: [`<@${challengerId}> retó a <@${defenderId}>. La invitación vence en cinco minutos.`], createdAt: at, updatedAt: at, expiresAt: at + PVP_CHALLENGE_TTL };
    await pvpInsertMysql(connection, match);
    return { ok: true as const, match };
  });
  const run = db.transaction(() => {
    const challenger = sqlitePet(guildId, challengerId); const defender = sqlitePet(guildId, defenderId);
    if (!challenger) return { ok: false as const, reason: 'no_challenger_pet' as const };
    if (!defender) return { ok: false as const, reason: 'no_defender_pet' as const };
    if (pvpBusySqlite(guildId, challengerId, defenderId, at)) return { ok: false as const, reason: 'busy' as const };
    const match: RpgPvpMatch = { id: reference, guildId, challengerId, defenderId, status: 'pending', turnUserId: challengerId, winnerId: null,
      fighters: [fighterFromPet(challengerId, challengerName, challenger), fighterFromPet(defenderId, defenderName, defender)], round: 1,
      log: [`<@${challengerId}> retó a <@${defenderId}>. La invitación vence en cinco minutos.`], createdAt: at, updatedAt: at, expiresAt: at + PVP_CHALLENGE_TTL };
    pvpInsertSqlite(match);
    return { ok: true as const, match };
  });
  return run.immediate();
}

export async function respondRpgPvpChallenge(guildId: string, matchId: string, userId: string, accept: boolean): Promise<
  | { ok: true; match: RpgPvpMatch }
  | { ok: false; reason: 'not_found' | 'not_invited' | 'not_pending' }
  | { ok: false; reason: 'expired'; match: RpgPvpMatch }
> {
  guildId = GLOBAL_SCOPE_ID;
  const at = now();
  type ResponseResult = { ok: true; match: RpgPvpMatch } | { ok: false; reason: 'not_found' | 'not_invited' | 'not_pending' } | { ok: false; reason: 'expired'; match: RpgPvpMatch };
  const resolve = (match: RpgPvpMatch | undefined): ResponseResult => {
    if (!match || match.guildId !== guildId) return { ok: false as const, reason: 'not_found' as const };
    if (match.defenderId !== userId) return { ok: false as const, reason: 'not_invited' as const };
    if (match.status !== 'pending') return { ok: false as const, reason: 'not_pending' as const };
    if (match.expiresAt <= at) { pvpFinish(match, null, 'expired', at, 'El desafío venció sin respuesta.'); return { ok: false as const, reason: 'expired' as const, match }; }
    if (accept) { match.status = 'active'; match.turnUserId = match.challengerId; match.updatedAt = at; match.expiresAt = at + PVP_MATCH_TTL; match.log = [...match.log, `⚔️ <@${userId}> aceptó. Empieza el duelo por turnos.`]; }
    else pvpFinish(match, null, 'declined', at, `🚫 <@${userId}> rechazó el desafío.`);
    return { ok: true as const, match };
  };
  if (economyPool) return withEconomyTransaction(async (connection) => {
    const match = await pvpSelectMysql(connection, matchId, true); const result = resolve(match);
    if (match && (result.ok || result.reason === 'expired')) await pvpSaveMysql(connection, match);
    if (result.ok || result.reason === 'expired') return result;
    return { ok: false as const, reason: result.reason };
  });
  const run = db.transaction(() => {
    const match = pvpSelectSqlite(matchId); const result = resolve(match);
    if (match && (result.ok || result.reason === 'expired')) pvpSaveSqlite(match);
    if (result.ok || result.reason === 'expired') return result;
    return { ok: false as const, reason: result.reason };
  });
  return run.immediate();
}

export async function playRpgPvpTurn(guildId: string, matchId: string, userId: string, action: RpgPvpAction, moveId?: string): Promise<
  | { ok: true; match: RpgPvpMatch }
  | { ok: false; reason: 'not_found' | 'not_participant' | 'not_active' | 'not_your_turn' | 'special_used' | 'move_not_equipped' | 'low_energy' }
  | { ok: false; reason: 'expired'; match: RpgPvpMatch }
> {
  guildId = GLOBAL_SCOPE_ID;
  const at = now();
  const resolve = (match: RpgPvpMatch | undefined) => {
    if (!match || match.guildId !== guildId) return { ok: false as const, reason: 'not_found' as const };
    const actorIndex = match.fighters.findIndex((fighter) => fighter.userId === userId);
    if (actorIndex < 0) return { ok: false as const, reason: 'not_participant' as const };
    if (match.status !== 'active') return { ok: false as const, reason: 'not_active' as const };
    if (match.expiresAt <= at) { pvpFinish(match, null, 'expired', at, '⌛ El combate terminó por inactividad.'); return { ok: false as const, reason: 'expired' as const, match }; }
    if (match.turnUserId !== userId) return { ok: false as const, reason: 'not_your_turn' as const };
    const actor = match.fighters[actorIndex]!; const target = match.fighters[1 - actorIndex]!;
    if (action === 'surrender') {
      pvpFinish(match, target.userId, 'finished', at, `🏳️ ${actor.petName} se rindió. Gana ${target.petName}.`);
      return { ok: true as const, match, finished: true };
    }
    if (action === 'special' && actor.specialUsed) return { ok: false as const, reason: 'special_used' as const };
    const chosenMove = action === 'move' ? getRpgMove(moveId ?? '') : undefined;
    if (action === 'move' && (!chosenMove || !actor.equippedMoves.includes(chosenMove.id))) return { ok: false as const, reason: 'move_not_equipped' as const };
    if (chosenMove && actor.energy < chosenMove.energy) return { ok: false as const, reason: 'low_energy' as const };
    let line: string;
    if (action === 'guard') {
      actor.guarding = true;
      actor.energy = Math.min(actor.maxEnergy, actor.energy + 10);
      line = `🛡️ ${actor.petName} se defiende, reduce el próximo daño y recupera 10 de energía.`;
    } else if (action === 'special' && actor.specialization === 'Apoyo') {
      actor.specialUsed = true;
      const restored = Math.min(actor.maxHp - actor.hp, Math.max(12, Math.floor(actor.maxHp * 0.28)));
      actor.hp += restored; actor.guarding = true;
      line = `💚 ${actor.petName} usa su técnica de apoyo: recupera ${restored} PV y prepara una guardia.`;
    } else if (chosenMove?.effect === 'heal') {
      actor.energy -= chosenMove.energy;
      const restored = Math.min(actor.maxHp - actor.hp, chosenMove.power + (actor.specialization === 'Apoyo' ? 8 : 0));
      actor.hp += restored;
      line = `💚 ${actor.petName} usa **${chosenMove.name}** y recupera ${restored} PV (${chosenMove.energy} energía).`;
    } else if (chosenMove?.effect === 'guard') {
      actor.energy -= chosenMove.energy;
      actor.guarding = true;
      line = `🛡️ ${actor.petName} usa **${chosenMove.name}** y prepara una guardia reforzada (${chosenMove.energy} energía).`;
    } else {
      const special = action === 'special';
      if (special) actor.specialUsed = true;
      if (chosenMove) actor.energy -= chosenMove.energy;
      const moveAccuracy = chosenMove ? Math.min(100, chosenMove.accuracy + (actor.specialization === 'Explorador' ? 5 : 0)) : 100;
      if (randomInt(100) >= moveAccuracy) {
        line = `💨 ${actor.petName} intenta **${chosenMove?.name ?? (special ? 'su técnica especial' : 'Placaje')}**, pero ${target.petName} esquiva el ataque.`;
        target.weakened = false;
      } else {
      let raw = chosenMove ? chosenMove.power + Math.floor(actor.strength * 0.52) : actor.strength + 3 + randomInt(8) + (special ? Math.floor(actor.strength * (actor.specialization === 'Atacante' ? 0.85 : 0.45)) : 0);
      if (actor.specialization === 'Atacante') raw = Math.floor(raw * 1.08);
      if (chosenMove && chosenMove.element === actor.element && chosenMove.element !== 'Neutral' && actor.specialization === 'Místico') raw = Math.floor(raw * 1.15);
      const strongAgainst: Record<string, string[]> = { Fuego: ['Naturaleza', 'Hielo'], Agua: ['Fuego', 'Tierra'], Naturaleza: ['Agua', 'Tierra'], Viento: ['Naturaleza'], Hielo: ['Viento'], Luz: ['Sombra'], Sombra: ['Luz', 'Astral'], Tierra: ['Rayo', 'Fuego'], Rayo: ['Agua', 'Viento'], Astral: ['Sombra'] };
      const element = chosenMove?.element ?? actor.element;
      const multiplier = element !== 'Neutral' && strongAgainst[element]?.includes(target.element) ? 1.25 : element !== 'Neutral' && strongAgainst[target.element]?.includes(element) ? 0.8 : 1;
      raw = Math.floor(raw * multiplier);
      const critChance = Math.min(35, 5 + Math.floor(actor.agility / 3) + (special && actor.specialization === 'Explorador' ? 18 : chosenMove?.specialization === 'Explorador' ? 12 : 0));
      const critical = randomInt(100) < critChance;
      if (critical) raw = Math.floor(raw * (special ? 1.7 : 1.45));
      let damage = Math.max(2, raw - Math.floor(target.defense * (special ? 0.35 : 0.48)));
      if (target.weakened) { damage = Math.floor(damage * 0.75); target.weakened = false; }
      if (target.guarding) { damage = Math.max(1, Math.floor(damage * 0.4)); target.guarding = false; }
      target.hp = Math.max(0, target.hp - damage);
      if (chosenMove?.effect === 'drain') { const restored = Math.min(actor.maxHp - actor.hp, Math.max(1, Math.floor(damage * 0.3))); actor.hp += restored; }
      if (chosenMove?.effect === 'weaken') target.weakened = true;
      if ((special && actor.specialization === 'Guardián') || chosenMove?.specialization === 'Guardián') actor.guarding = true;
      const skill = chosenMove ? ` usa **${chosenMove.name}** contra` : special ? ` activa su técnica contra` : ' ataca a';
      const effectiveness = multiplier > 1 ? ' · ¡es muy eficaz!' : multiplier < 1 ? ' · no es muy eficaz.' : '';
      line = `${critical ? '💥' : '⚔️'} ${actor.petName}${skill} ${target.petName} y causa **${damage} de daño**${critical ? ' crítico' : ''}${effectiveness}.${chosenMove?.effect === 'drain' ? ' Absorbe parte del daño.' : ''}${chosenMove?.effect === 'weaken' ? ' Debilita su siguiente ataque.' : ''}${actor.guarding ? ' Queda protegido.' : ''}`;
      }
    }
    match.log = [...match.log, line].slice(-12);
    match.updatedAt = at; match.expiresAt = at + PVP_MATCH_TTL;
    if (target.hp <= 0) {
      pvpFinish(match, actor.userId, 'finished', at, `🏆 ${actor.petName} vence el duelo amistoso.`);
      return { ok: true as const, match, finished: true };
    }
    match.turnUserId = target.userId;
    if (target.userId === match.challengerId) match.round++;
    return { ok: true as const, match, finished: false };
  };
  if (economyPool) return withEconomyTransaction(async (connection) => {
    const match = await pvpSelectMysql(connection, matchId, true); const result = resolve(match);
    if (match && result.ok) await pvpSaveMysql(connection, match);
    else if (match && result.reason === 'expired') await pvpSaveMysql(connection, match);
    return result.ok ? { ok: true as const, match: result.match } : result.reason === 'expired' ? result : { ok: false as const, reason: result.reason };
  });
  const run = db.transaction(() => {
    const match = pvpSelectSqlite(matchId); const result = resolve(match);
    if (match && result.ok) pvpSaveSqlite(match);
    else if (match && result.reason === 'expired') pvpSaveSqlite(match);
    return result.ok ? { ok: true as const, match: result.match } : result.reason === 'expired' ? result : { ok: false as const, reason: result.reason };
  });
  return run.immediate();
}
