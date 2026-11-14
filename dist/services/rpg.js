import { GLOBAL_SCOPE_ID } from '../storage/global-scope.js';
import { randomInt } from 'node:crypto';
import { db } from '../storage/database.js';
import { ECONOMY_STARTING_BALANCE } from '../storage/economy-defaults.js';
import { economyPool, insertLedger, withEconomyTransaction } from '../storage/economy-database.js';
import { getProductPriceQuote, recordProductSaleMysql, recordProductSaleSqlite } from './product-market.js';
const coreRpgItems = [
    { id: 'rpg_potion', name: 'Poción menor', emoji: '🧪', rarity: 'Común', category: 'Curación', cost: 100, description: 'Recupera 30 PV.', effect: 'heal', power: 30 },
    { id: 'rpg_ether', name: 'Éter de viaje', emoji: '🔹', rarity: 'Común', category: 'Energía', cost: 85, description: 'Recupera 35 de energía.', effect: 'energy', power: 35 },
    { id: 'rpg_berries', name: 'Bayas silvestres', emoji: '🫐', rarity: 'Común', category: 'Alimento', cost: 40, description: 'Recupera 15 PV y energía, +35 saciedad y cariño.', effect: 'snack', power: 15 },
    { id: 'rpg_super_potion', name: 'Poción solar', emoji: '☀️', rarity: 'Poco común', category: 'Curación', cost: 240, description: 'Recupera 75 PV.', effect: 'heal', power: 75 },
    { id: 'rpg_energy_crystal', name: 'Cristal de energía', emoji: '💠', rarity: 'Poco común', category: 'Energía', cost: 220, description: 'Restaura toda la energía.', effect: 'full_energy', power: 100 },
    { id: 'rpg_revive', name: 'Polvo de renacer', emoji: '✨', rarity: 'Raro', category: 'Reanimación', cost: 480, description: 'Levanta a una mascota debilitada con 35 PV.', effect: 'revive', power: 35 },
    { id: 'rpg_training_manual', name: 'Manual de campo', emoji: '📘', rarity: 'Raro', category: 'Experiencia', cost: 430, description: 'Otorga 60 XP.', effect: 'xp', power: 60 },
    { id: 'rpg_iron_charm', name: 'Amuleto de hierro', emoji: '🧿', rarity: 'Épico', category: 'Equipo', cost: 1000, description: 'Equipo: +4 defensa.', effect: 'equip_defense', power: 4 },
    { id: 'rpg_swift_boots', name: 'Botas del viento', emoji: '🥾', rarity: 'Épico', category: 'Equipo', cost: 1000, description: 'Equipo: +4 agilidad.', effect: 'equip_agility', power: 4 },
    { id: 'rpg_star_collar', name: 'Collar estelar', emoji: '🌟', rarity: 'Legendario', category: 'Equipo', cost: 2200, description: 'Equipo: +3 fuerza, defensa y agilidad.', effect: 'equip_all', power: 3 },
];
const raritySets = [
    { rarity: 'Común', key: 'comun', emoji: '🟤', price: 110, labels: ['silvestre', 'del aprendiz'] },
    { rarity: 'Poco común', key: 'inusual', emoji: '🟢', price: 250, labels: ['del rocío', 'de hoja viva'] },
    { rarity: 'Raro', key: 'raro', emoji: '🔵', price: 575, labels: ['rúnico', 'de cristal'] },
    { rarity: 'Épico', key: 'epico', emoji: '🟣', price: 1250, labels: ['ancestral', 'del eclipse'] },
    { rarity: 'Legendario', key: 'legendario', emoji: '🟠', price: 2800, labels: ['celestial', 'primordial'] },
];
const itemNames = [
    { category: 'Curación', emoji: '🧪', names: [['Ungüento de musgo', 'Sopa de hierbas'], ['Bálsamo de rocío', 'Tónico de brote'], ['Suero del corazón', 'Poción de zafiro'], ['Elixir del guardián', 'Poción de aurora'], ['Lágrima del fénix', 'Elixir de vida eterna']] },
    { category: 'Energía', emoji: '⚡', names: [['Té del caminante', 'Fruta del alba'], ['Néctar verde', 'Café de aventurero'], ['Gema de pulso', 'Brebaje de centella'], ['Esencia inagotable', 'Núcleo de tormenta'], ['Ambrosía astral', 'Corazón de cometa']] },
    { category: 'Experiencia', emoji: '📘', names: [['Notas de campo', 'Cuento de fogata'], ['Cuaderno del bosque', 'Mapa anotado'], ['Crónica de héroes', 'Tomo de secretos'], ['Grimorio de batalla', 'Atlas del sabio'], ['Memoria de los ancestros', 'Libro de las estrellas']] },
    { category: 'Mejora', emoji: '🔮', names: [['Semilla de vigor', 'Piedra firme', 'Pluma ligera'], ['Brote de fuerza', 'Coraza de savia', 'Amuleto veloz'], ['Runa de poder', 'Sello guardián', 'Cristal de agilidad'], ['Núcleo titánico', 'Égida imperial', 'Viento encarnado'], ['Corazón volcánico', 'Bastión eterno', 'Paso del cometa']] },
    { category: 'Equipo', emoji: '🛡️', names: [['Daga de cobre', 'Chaleco de cuero', 'Grebas usadas'], ['Sable de roble', 'Manto de hojas', 'Botas de cazador'], ['Espada lunar', 'Armadura de coral', 'Grebas de zafiro'], ['Filo del eclipse', 'Égida ancestral', 'Botas del fénix'], ['Colmillo del dragón', 'Armadura celestial', 'Sandalias del vacío']] },
    { category: 'Exploración', emoji: '🧭', names: [['Tiza de senderos', 'Brújula de cobre'], ['Capa de caminante', 'Lente de buscador'], ['Mapa de explorador', 'Farol de plata'], ['Amuleto de ruta', 'Catalejo arcano'], ['Carta del destino', 'Compás de estrellas']] },
];
const additionalRpgItems = [];
for (let tier = 0; tier < raritySets.length; tier++) {
    const rarity = raritySets[tier];
    const heal = 40 + tier * 28;
    const energy = 35 + tier * 13;
    const xp = 80 + tier * 90;
    const statPower = tier < 2 ? 1 : tier < 4 ? 2 : 3;
    const gearPower = 2 + Math.floor(tier / 2);
    const safety = 8 + tier * 6;
    const luck = 10 + tier * 7;
    const add = (suffix, category, name, emoji, effect, power, multiplier = 1) => {
        additionalRpgItems.push({ id: `rpg_${rarity.key}_${suffix}`, name, emoji, rarity: rarity.rarity, category, cost: Math.round(rarity.price * multiplier),
            description: itemDescription(effect, power), effect, power });
    };
    const suffixes = ['parche', 'caldo', 'infusion', 'dulce', 'manual', 'cronica', 'fuerza', 'defensa', 'agilidad', 'arma', 'armadura', 'botas', 'resguardo', 'hallazgo'];
    itemNames.forEach((group, groupIndex) => group.names[tier].forEach((baseName, position) => {
        const suffix = suffixes[groupIndex === 0 ? position : groupIndex === 1 ? 2 + position : groupIndex === 2 ? 4 + position : groupIndex === 3 ? 6 + position : groupIndex === 4 ? 9 + position : 12 + position];
        const name = `${baseName} ${rarity.labels[position % rarity.labels.length]}`;
        const category = group.category;
        if (groupIndex === 0)
            add(suffix, category, name, group.emoji, 'heal', heal + position * 12, 1 + position * 0.35);
        else if (groupIndex === 1)
            add(suffix, position ? 'Alimento' : category, name, group.emoji, position ? 'snack' : 'energy', position ? 12 + tier * 4 : energy, position ? (0.9 + position * 0.2) * 0.65 : 0.9);
        else if (groupIndex === 2)
            add(suffix, category, name, group.emoji, 'xp', xp + position * 45, 1.1 + position * 0.4);
        else if (groupIndex === 3)
            add(suffix, category, name, group.emoji, ['stat_strength', 'stat_defense', 'stat_agility'][position], statPower, 1.2);
        else if (groupIndex === 4)
            add(suffix, category, name, group.emoji, ['equip_strength', 'equip_defense', 'equip_agility'][position], gearPower, 2.1);
        else
            add(suffix, category, name, group.emoji, position ? 'expedition_luck' : 'expedition_safety', position ? luck : safety, 1.25 + position * 0.25);
    }));
}
if (additionalRpgItems.length !== 70)
    throw new Error(`El catálogo extra RPG debe contener 70 artículos; contiene ${additionalRpgItems.length}.`);
function itemDescription(effect, power) {
    if (effect === 'heal')
        return `Recupera ${power} PV.`;
    if (effect === 'energy')
        return `Recupera ${power} de energía.`;
    if (effect === 'snack')
        return `Recupera ${power} PV y energía, +${Math.min(45, 20 + power)} saciedad y cariño.`;
    if (effect === 'xp')
        return `Otorga ${power} XP.`;
    if (effect.startsWith('stat_'))
        return `Mejora permanentemente ${effect.slice(5)} en +${power}.`;
    if (effect.startsWith('equip_'))
        return `Equipo permanente: mejora ${effect.slice(6)} en +${power}.`;
    if (effect === 'expedition_safety')
        return `Protege la siguiente salida: reduce el peligro en ${power} puntos.`;
    if (effect === 'expedition_haste')
        return `Reduce hasta ${Math.floor(power / 60)} min del descanso activo de exploración.`;
    if (effect === 'battle_haste')
        return `Reduce hasta ${Math.floor(power / 60)} min de la espera activa entre combates.`;
    return `Mejora la siguiente salida: aumenta en ${power}% la oportunidad de hallar objetos.`;
}
const elementalFoodDefinitions = [
    { element: 'Fuego', key: 'fuego', emoji: '🍑', names: ['Durazno de brasa', 'Caldo volcánico', 'Dátil del fénix', 'Brocheta del cráter', 'Pastel de magma', 'Néctar de ignición', 'Tamal de ceniza viva', 'Corazón de sol'], affinityBonus: 'expedition_safety', bonusPower: [6, 8, 10, 15, 18, 22, 25, 30] },
    { element: 'Agua', key: 'agua', emoji: '🍇', names: ['Uvas de marea', 'Sopa de perla azul', 'Néctar de luna líquida', 'Ceviche de marea', 'Gelatina abisal', 'Sopa de sirena', 'Perla confitada', 'Banquete del leviatán'], affinityBonus: 'energy', bonusPower: [6, 10, 14, 18, 22, 26, 30, 35] },
    { element: 'Naturaleza', key: 'naturaleza', emoji: '🥝', names: ['Pera del roble', 'Ensalada de luz de hoja', 'Miel del árbol antiguo', 'Tarta de enredadera', 'Té del bosque antiguo', 'Mermelada de raíz', 'Nido de flores', 'Banquete de la arboleda'], affinityBonus: 'satiety', bonusPower: [8, 12, 16, 20, 24, 28, 32, 36] },
    { element: 'Viento', key: 'viento', emoji: '🍎', names: ['Manzana de nube', 'Té de plumón', 'Merengue de vendaval', 'Galleta de brisa', 'Nube de merengue', 'Té de las alturas', 'Pastel de ciclón', 'Banquete del cielo'], affinityBonus: 'expedition_haste', bonusPower: [8, 14, 20, 25, 30, 35, 40, 45] },
    { element: 'Hielo', key: 'hielo', emoji: '🫐', names: ['Arándano boreal', 'Granizado de aurora', 'Crema de glaciar', 'Paleta de ventisca', 'Sopa de escarcha azul', 'Tarta de aurora', 'Granizado eterno', 'Banquete del glaciar'], affinityBonus: 'heal', bonusPower: [6, 10, 14, 18, 22, 26, 30, 36] },
    { element: 'Luz', key: 'luz', emoji: '🥭', names: ['Mango solar', 'Tarta del mediodía', 'Néctar de lucero', 'Galleta de rayo solar', 'Flan del alba', 'Tarta de farol', 'Bombón radiante', 'Banquete del mediodía'], affinityBonus: 'affection', bonusPower: [2, 4, 6, 8, 10, 12, 14, 16] },
    { element: 'Sombra', key: 'sombra', emoji: '🍮', names: ['Mora de penumbra', 'Pudín de obsidiana', 'Trufa del eclipse', 'Bollito de penumbra', 'Café de luna oscura', 'Tarta de eclipse', 'Bombón de sombra', 'Banquete del crepúsculo'], affinityBonus: 'expedition_luck', bonusPower: [5, 8, 12, 16, 20, 24, 30, 36] },
    { element: 'Tierra', key: 'tierra', emoji: '🥔', names: ['Papa dulce de cantera', 'Pan de roca mielada', 'Estofado de geoda', 'Galleta de roca dulce', 'Calabaza de montaña', 'Pastel de geoda', 'Trufa de obsidiana', 'Banquete de la caverna'], affinityBonus: 'expedition_safety', bonusPower: [6, 10, 14, 18, 22, 26, 30, 36] },
    { element: 'Rayo', key: 'rayo', emoji: '🍋', names: ['Lima chispeante', 'Gelatina de relámpago', 'Brocheta de nube eléctrica', 'Limón de chispa', 'Pastel voltaico', 'Brocheta del trueno', 'Tónica de tormenta', 'Banquete de centella'], affinityBonus: 'energy', bonusPower: [8, 12, 16, 20, 24, 28, 32, 40] },
    { element: 'Astral', key: 'astral', emoji: '🥧', names: ['Arándano de constelación', 'Tartaleta de polvo estelar', 'Sorbete de nebulosa', 'Galleta lunar', 'Pastel de meteorito', 'Té de nebulosa', 'Tartaleta de cometa', 'Banquete de constelación'], affinityBonus: 'expedition_xp', bonusPower: [6, 10, 14, 18, 22, 26, 30, 36] },
];
const elementalFoodTiers = [
    { key: 'comun', rarity: 'Común', cost: 50, hp: 8, energy: 10, hunger: 25, affection: 1 },
    { key: 'inusual', rarity: 'Poco común', cost: 115, hp: 13, energy: 15, hunger: 34, affection: 2 },
    { key: 'raro', rarity: 'Raro', cost: 225, hp: 18, energy: 20, hunger: 42, affection: 3 },
    { key: 'epico', rarity: 'Épico', cost: 410, hp: 25, energy: 28, hunger: 52, affection: 4 },
    { key: 'epico_aurora', rarity: 'Épico', cost: 600, hp: 30, energy: 34, hunger: 62, affection: 5 },
    { key: 'legendario', rarity: 'Legendario', cost: 800, hp: 38, energy: 42, hunger: 72, affection: 6 },
    { key: 'legendario_aurora', rarity: 'Legendario', cost: 1035, hp: 45, energy: 50, hunger: 84, affection: 7 },
    { key: 'legendario_primordial', rarity: 'Legendario', cost: 1300, hp: 55, energy: 58, hunger: 95, affection: 8 },
];
function foodAffinityDescription(effect, power) {
    if (effect === 'heal')
        return `recupera +${power} PV`;
    if (effect === 'energy')
        return `recupera +${power} energía`;
    if (effect === 'satiety')
        return `añade +${power} saciedad`;
    if (effect === 'affection')
        return `añade +${power} cariño`;
    if (effect === 'expedition_safety')
        return `da +${power} seguridad en la próxima expedición`;
    if (effect === 'expedition_luck')
        return `da +${power} puntos de hallazgo en la próxima expedición`;
    if (effect === 'expedition_haste')
        return `reduce ${power} min el descanso tras tu próxima expedición`;
    return `da +${power} XP en la próxima expedición`;
}
const elementalFoodItems = elementalFoodDefinitions.flatMap((definition) => definition.names.map((name, index) => {
    const tier = elementalFoodTiers[index];
    const bonusPower = definition.bonusPower[index];
    const food = {
        element: definition.element, hp: tier.hp, energy: tier.energy, hunger: tier.hunger, affection: tier.affection,
        affinityBonus: definition.affinityBonus, bonusPower: definition.affinityBonus === 'expedition_haste' ? bonusPower * 60 : bonusPower,
    };
    const bonusText = foodAffinityDescription(food.affinityBonus, bonusPower);
    return {
        id: `rpg_food_${definition.key}_${tier.key}`, name, emoji: definition.emoji, rarity: tier.rarity, category: 'Alimento', cost: tier.cost,
        description: `Afinidad ${definition.element}: +20% nutrición y ${bonusText}. Base +${tier.hunger} saciedad, +${tier.hp} PV y +${tier.energy} energía.`,
        effect: 'snack', power: tier.hp, food,
    };
}));
const cooldownConsumables = [
    { id: 'rpg_trail_chalk', name: 'Tiza de atajo', emoji: '🧭', rarity: 'Común', category: 'Exploración', cost: 120, description: 'Adelanta 30 min el descanso de exploración activo.', effect: 'expedition_haste', power: 30 * 60 },
    { id: 'rpg_shortcut_compass', name: 'Brújula del amanecer', emoji: '🧭', rarity: 'Poco común', category: 'Exploración', cost: 260, description: 'Adelanta 60 min el descanso de exploración activo.', effect: 'expedition_haste', power: 60 * 60 },
    { id: 'rpg_route_clock', name: 'Reloj de rutas', emoji: '⌛', rarity: 'Raro', category: 'Exploración', cost: 480, description: 'Adelanta 90 min el descanso de exploración activo.', effect: 'expedition_haste', power: 90 * 60 },
    { id: 'rpg_pause_bell', name: 'Campanilla de tregua', emoji: '🔔', rarity: 'Poco común', category: 'Combate', cost: 220, description: 'Adelanta 30 min la espera activa entre combates.', effect: 'battle_haste', power: 30 * 60 },
    { id: 'rpg_rematch_tonic', name: 'Tónico de revancha', emoji: '⚔️', rarity: 'Raro', category: 'Combate', cost: 420, description: 'Adelanta 60 min la espera activa entre combates.', effect: 'battle_haste', power: 60 * 60 },
];
export const rpgItems = [...coreRpgItems, ...additionalRpgItems, ...elementalFoodItems, ...cooldownConsumables];
if (rpgItems.length !== 165)
    throw new Error(`El catálogo RPG debe contener 165 artículos; contiene ${rpgItems.length}.`);
if (new Set(rpgItems.map((item) => item.id)).size !== rpgItems.length)
    throw new Error('El catálogo RPG contiene IDs duplicados.');
const epicElementalFoodDrops = elementalFoodItems.filter((item) => item.rarity === 'Épico').map((item) => item.id);
const legendaryElementalFoodDrops = elementalFoodItems.filter((item) => item.rarity === 'Legendario').map((item) => item.id);
export const rpgZones = [
    { id: 'bosque', name: 'Bosque Susurrante', emoji: '🌲', background: 'zone-bosque.png', difficulty: 'Tranquila', minLevel: 1, danger: 18, reward: [45, 95], lootChance: 34, lootWeights: [['Común', 66], ['Poco común', 26], ['Raro', 7], ['Épico', 1], ['Legendario', 0]], drops: ['rpg_berries', 'rpg_potion', 'rpg_ether', 'rpg_comun_parche', 'rpg_comun_caldo', 'rpg_comun_resguardo', 'rpg_food_naturaleza_comun', 'rpg_food_agua_comun', 'rpg_food_naturaleza_raro'], boss: { name: 'Ciervo Zarzal', emoji: '🦌', spawnChance: 6, power: 24, reward: [90, 150], xp: [35, 55], dropChance: 38, drops: ['rpg_comun_armadura', 'rpg_comun_agilidad', 'rpg_inusual_parche'] } },
    { id: 'cumbres', name: 'Cumbres de Bruma', emoji: '🏔️', background: 'zone-cumbres.png', difficulty: 'Moderada', minLevel: 3, danger: 32, reward: [90, 165], lootChance: 39, lootWeights: [['Común', 35], ['Poco común', 40], ['Raro', 20], ['Épico', 5], ['Legendario', 0]], drops: ['rpg_super_potion', 'rpg_energy_crystal', 'rpg_training_manual', 'rpg_inusual_manual', 'rpg_raro_manual', 'rpg_raro_armadura', 'rpg_food_viento_comun', 'rpg_food_hielo_comun', 'rpg_food_rayo_comun', 'rpg_food_hielo_raro', 'rpg_food_viento_raro'], boss: { name: 'Yeti de la Cumbre', emoji: '❄️', spawnChance: 9, power: 36, reward: [170, 270], xp: [55, 80], dropChance: 48, drops: ['rpg_inusual_defensa', 'rpg_raro_parche', 'rpg_raro_botas'] } },
    { id: 'ruinas', name: 'Ruinas Antiguas', emoji: '🏛️', background: 'zone-ruinas.png', difficulty: 'Difícil', minLevel: 6, danger: 48, reward: [140, 250], lootChance: 44, lootWeights: [['Común', 15], ['Poco común', 35], ['Raro', 35], ['Épico', 13], ['Legendario', 2]], drops: ['rpg_revive', 'rpg_iron_charm', 'rpg_swift_boots', 'rpg_raro_cronica', 'rpg_epico_manual', 'rpg_raro_agilidad', 'rpg_food_tierra_comun', 'rpg_food_sombra_comun', 'rpg_food_fuego_comun', 'rpg_food_sombra_raro', 'rpg_food_fuego_raro', ...epicElementalFoodDrops], boss: { name: 'Coloso del Archivo', emoji: '🗿', spawnChance: 12, power: 50, reward: [260, 400], xp: [85, 120], dropChance: 58, drops: ['rpg_raro_defensa', 'rpg_epico_agilidad', 'rpg_epico_armadura'] } },
    { id: 'dunas', name: 'Dunas de Cristal', emoji: '🏜️', background: 'zone-dunas.png', difficulty: 'Élite', minLevel: 8, danger: 54, reward: [180, 300], lootChance: 48, lootWeights: [['Común', 10], ['Poco común', 30], ['Raro', 38], ['Épico', 18], ['Legendario', 4]], drops: ['rpg_training_manual', 'rpg_iron_charm', 'rpg_star_collar', 'rpg_raro_hallazgo', 'rpg_epico_hallazgo', 'rpg_legendario_hallazgo', 'rpg_food_fuego_raro', 'rpg_food_tierra_raro', 'rpg_food_viento_raro', ...epicElementalFoodDrops, ...legendaryElementalFoodDrops], boss: { name: 'Dragón Espejismo', emoji: '🐲', spawnChance: 14, power: 58, reward: [350, 520], xp: [110, 155], dropChance: 65, drops: ['rpg_epico_fuerza', 'rpg_epico_armadura', 'rpg_legendario_parche'] } },
    { id: 'astral', name: 'Mar Astral', emoji: '🌌', background: 'zone-astral.png', difficulty: 'Mítica', minLevel: 10, danger: 60, reward: [220, 360], lootChance: 52, lootWeights: [['Común', 5], ['Poco común', 20], ['Raro', 35], ['Épico', 30], ['Legendario', 10]], drops: ['rpg_star_collar', 'rpg_revive', 'rpg_training_manual', 'rpg_epico_cronica', 'rpg_legendario_hallazgo', 'rpg_legendario_botas', 'rpg_food_astral_comun', 'rpg_food_luz_comun', 'rpg_food_astral_raro', 'rpg_food_luz_raro', ...epicElementalFoodDrops, ...legendaryElementalFoodDrops], boss: { name: 'Leviatán de las Estrellas', emoji: '🐋', spawnChance: 18, power: 70, reward: [500, 750], xp: [150, 220], dropChance: 72, drops: ['rpg_epico_agilidad', 'rpg_legendario_armadura', 'rpg_legendario_cronica'] } },
];
for (const zone of rpgZones) {
    for (const itemId of [...zone.drops, ...zone.boss.drops]) {
        if (!rpgItems.some((item) => item.id === itemId))
            throw new Error(`El botín RPG ${itemId} de ${zone.id} no existe en el catálogo.`);
    }
}
const scene = (id, kind, emoji, title, skill, difficulty, opening, success, setback, extra = {}) => ({
    id, kind, emoji, title, skill, difficulty, opening, success, setback, weight: 10, duration: [18, 55], xp: [5, 13], choices: {}, ...extra,
});
const expeditionScenes = {
    bosque: [
        scene('arroyo', 'serena', '💧', 'El arroyo de las luciérnagas', 'agilidad', 0, ['El arroyo está más alto que ayer y las luciérnagas dibujan un puente en el aire.', 'Entre las raíces, el agua corre clara y deja burbujas redondas en la orilla.'], ['{name} cruza por unas piedras cubiertas de musgo; del otro lado, un petirrojo continúa su canción como si nada.', '{name} encuentra un paso firme y espera a que una familia de erizos termine de beber.'], ['Una piedra rueda bajo sus patas. {name} alcanza la orilla, aunque se moja hasta las orejas.'], { weight: 12, duration: [12, 32], xp: [4, 10], calm: true, choices: { Explorador: ['sigue las burbujas hasta el vado menos profundo'], Apoyo: ['cede el paso a los animales que esperan'] } }),
        scene('guardabosques', 'social', '🧺', 'Una cesta volcada', 'vinculo', 0, ['Iria, la guardabosques, intenta recoger manzanas antes de que rueden ladera abajo.', 'Un silbido corto llega desde el sendero: Iria vuelve a buscar ayuda con su cesta.'], ['—Llegaste justo a tiempo —ríe Iria—. La mitad de la cosecha ya quería explorar por su cuenta.', 'Iria le ofrece una manzana y le cuenta qué senderos están llenos de flores esta semana.'], ['La cesta se atasca entre dos raíces; al final, Iria recupera casi todo y le agradece el intento.'], { weight: 10, friend: 'iria', duration: [20, 42], xp: [7, 15], recover: 1, choices: { Atacante: ['sujeta la cesta mientras Iria levanta las raíces'], Guardián: ['mantiene despejada la ladera'], Apoyo: ['reúne las manzanas más pequeñas'] } }),
        scene('zarzas', 'riesgo', '🌿', 'El sendero de zarzas', 'defensa', 1, ['Las zarzas se han cerrado sobre el camino y algo pequeño gruñe al otro lado.', 'Un crujido corre entre las ramas; unas espinas frescas señalan un paso estrecho.'], ['{name} aparta las ramas con cuidado y deja espacio para que un tejón asustado se retire.', '{name} encuentra un hueco entre las raíces y evita que las espinas alcancen su cara.'], ['Una espina le rasga el costado antes de que consiga liberar el paso.'], { weight: 8, hazard: 'zarzas', damage: [2, 7], duration: [24, 50], xp: [7, 15], choices: { Atacante: ['abre un hueco con un empujón firme'], Guardián: ['protege el hocico y avanza despacio'], Explorador: ['busca dónde la maleza cede'] } }),
        scene('nido', 'hallazgo', '🪺', 'El nido bajo el roble', 'intuicion', 1, ['Unas plumas doradas asoman de la base de un roble partido.', 'Del hueco del roble llega un piar débil y nervioso.'], ['{name} descubre un nido intacto y lo coloca en una rama segura; una pluma brillante queda entre las hojas.', '{name} guía a la cría de vuelta a su nido. La madre aparece enseguida y deja caer una semilla lustrosa.'], ['La entrada es demasiado estrecha. {name} avisa a Iria y no fuerza las raíces.'], { weight: 8, discovery: 'nido-del-roble', item: true, duration: [22, 48], xp: [8, 16], recover: 2, choices: { Místico: ['escucha desde dónde responde la madre'], Apoyo: ['acomoda las hojas para que el nido no se incline'] } }),
        scene('jabalí', 'encuentro', '🐗', 'Visita inesperada', 'fuerza', 2, ['Un jabalí de zarzas bloquea el sendero y resopla con una bellota pegada al hocico.', 'Las hojas se agitan. Un jabalí joven sale del matorral, más asustado que furioso.'], ['{name} retrocede sin acorralarlo; el animal olfatea el aire y se pierde entre los helechos.', '{name} distrae al jabalí con una rama cargada de bellotas. El sendero queda libre y nadie sale herido.'], ['El jabalí embiste antes de encontrar la salida. {name} se aparta, pero el golpe le deja un moretón.'], { weight: 5, hazard: 'jabalí', damage: [5, 12], duration: [20, 45], xp: [9, 18], choices: { Atacante: ['se interpone y le deja una vía de escape'], Guardián: ['retrocede para no acorralarlo'], Apoyo: ['le ofrece bellotas desde una distancia prudente'] } }),
        scene('clarohongo', 'hallazgo', '🍄', 'El claro de los hongos azules', 'agilidad', 1, ['Una lluvia breve dejó gotas luminosas sobre un claro de hongos azules.', 'El olor dulce de los hongos llega desde una hondonada escondida.'], ['{name} encuentra un pequeño refugio de exploradores con provisiones secas.', '{name} sigue las huellas hasta una caja de campo que Iria había dado por perdida.'], ['La hondonada termina en barro profundo; {name} vuelve con las patas limpias solo a medias.'], { weight: 7, discovery: 'claro-azul', item: true, coins: true, coinDetail: 'En el refugio quedan unas monedas guardadas dentro de una lata.', duration: [25, 60], xp: [8, 17], choices: { Explorador: ['marca el camino con dos hojas cruzadas'], Místico: ['compara el brillo de cada hongo antes de acercarse'] } }),
        scene('sombrahojas', 'descanso', '🌤️', 'Un descanso entre raíces', 'vinculo', 0, ['El sol se cuela en una raíz hueca que parece hecha a la medida de una siesta.', 'Un tronco tibio ofrece sombra y un buen lugar para escuchar el bosque.'], ['{name} descansa un rato. Cuando vuelve a ponerse en marcha, hasta el canto de los pájaros parece más cercano.'], ['Una rama cruje justo cuando iba a dormirse; aun así, recupera el aliento antes de seguir.'], { weight: 7, recover: 5, calm: true, duration: [18, 40], xp: [3, 8], choices: { Apoyo: ['comparte un poco de agua con un ratoncito que pasa'] } }),
    ],
    cumbres: [
        scene('mirador', 'serena', '🏔️', 'El mirador de nubes', 'agilidad', 1, ['La niebla se abre por un instante y deja ver tres picos teñidos de rosa.', 'Una corriente tibia atraviesa la cornisa y despeja el olor a nieve.'], ['{name} reconoce un atajo por las marcas de los montañistas y lo deja señalado para la próxima visita.'], ['La bruma vuelve antes de que pueda orientarse; {name} espera a que el viento calme.'], { weight: 10, discovery: 'mirador-rosa', duration: [18, 42], xp: [5, 12], calm: true, choices: { Explorador: ['lee las corrientes de aire antes de elegir el paso'], Místico: ['sigue el eco que rebota desde el pico'] } }),
        scene('montanista', 'social', '🧤', 'La bufanda de Nara', 'vinculo', 0, ['Nara, una montañista de guantes verdes, busca la bufanda que el viento le arrebató.', 'Una bufanda verde cuelga de una roca; Nara la reconoce desde el otro lado de la cornisa.'], ['—¡Mi abuela la tejió! —dice Nara, apretándola contra el pecho—. Te debo una historia y chocolate caliente.', '—Te guardé un poco de chocolate —dice Nara—. Ya sabía que volverías por este lado.'], ['El viento la arrastra hasta una grieta segura, pero Nara tendrá que volver con una cuerda.'], { weight: 9, friend: 'nara', duration: [20, 46], xp: [7, 15], choices: { Atacante: ['asegura la bufanda contra una roca'], Guardián: ['se coloca del lado del viento para cubrir a Nara'], Explorador: ['sigue la prenda sin acercarse al borde'] } }),
        scene('puentehielo', 'riesgo', '🧊', 'El puente que canta', 'defensa', 2, ['El puente de hielo emite un sonido hueco bajo cada ráfaga.', 'Un crujido sube desde la superficie blanca y se pierde en la niebla.'], ['{name} encuentra las placas más firmes y cruza marcando cada apoyo con una huella.', '{name} espera el cambio del viento y guía el cruce cuando el hielo deja de vibrar.'], ['Una placa cede. {name} se sujeta a la baranda, aunque el tirón le lastima una pata.'], { weight: 8, hazard: 'puente-de-hielo', damage: [4, 12], duration: [26, 58], xp: [8, 17], choices: { Guardián: ['prueba el hielo antes de que nadie pise'], Explorador: ['busca grietas antiguas para elegir la línea segura'], Atacante: ['afirma una baranda suelta con el hombro'] } }),
        scene('cabra', 'encuentro', '🐐', 'Una cabra en apuros', 'fuerza', 1, ['Una cabra montés quedó atrapada entre dos rocas y no para de llamar a su manada.', 'Un cascabel tintinea junto a una grieta: una cabrita asoma apenas el hocico.'], ['{name} mueve una piedra pequeña y la cabra salta libre hacia la ladera.', '—Gracias, montañista peludo —balbucea el pastor al aparecer—. Ella siempre se mete donde no cabe.'], ['La roca pesa demasiado. {name} busca al pastor en vez de arriesgar un derrumbe.'], { weight: 7, friend: 'pastor-teo', duration: [18, 42], xp: [7, 15], recover: 2, choices: { Atacante: ['apoya el lomo contra la piedra más liviana'], Apoyo: ['calma a la cabra mientras llega su dueño'], Místico: ['escucha por dónde se comunica la manada'] } }),
        scene('avalancha', 'riesgo', '🌨️', 'La ladera despierta', 'agilidad', 3, ['Una vibración recorre la nieve y desprende una cortina blanca del filo.', 'El silencio se rompe con un rugido lejano: algo de nieve baja por la ladera.'], ['{name} corre hacia una cornisa protegida y espera a que el polvo blanco se asiente.', '{name} encuentra una oquedad entre rocas antes de que la nieve cruce el sendero.'], ['La nieve alcanza a {name} y lo arrastra unos metros antes de frenarse contra un pino.'], { weight: 4, hazard: 'avalancha', damage: [8, 18], duration: [24, 55], xp: [10, 20], choices: { Explorador: ['busca una salida por las marcas en la roca'], Guardián: ['cubre la retirada hacia la cornisa'] } }),
        scene('cuevacristal', 'hallazgo', '🔷', 'La cueva de cristal azul', 'intuicion', 2, ['Una luz azulada late al fondo de una cueva que no estaba en el mapa.', 'El deshielo dejó al descubierto una abertura bajo la nieve.'], ['{name} reconoce una veta estable y memoriza cómo la luz azulada cambia con la luna.', '{name} sigue antiguas marcas de montañistas hasta un nicho de descanso en la roca.'], ['El túnel se estrecha demasiado. {name} deja una señal visible y vuelve a la cornisa.'], { weight: 7, discovery: 'cueva-azul', item: true, coins: true, coinDetail: 'En un hueco lateral encuentra monedas que alguien dejó para el camino de regreso.', duration: [30, 65], xp: [9, 19], choices: { Místico: ['observa el pulso de la veta antes de tocarla'], Explorador: ['comprueba el aire que sale por la grieta'] } }),
        scene('refugio', 'descanso', '🔥', 'El refugio de la cornisa', 'defensa', 0, ['Una vieja caseta de piedra conserva un brasero apagado y mantas secas.', 'El viento arrecia justo cuando una puerta de refugio se entreabre.'], ['{name} se resguarda hasta que baja la ventisca y recupera el calor de las patas.'], ['La caseta está vacía y fría; el techo ofrece algo de abrigo mientras pasa la ráfaga.'], { weight: 8, recover: 7, calm: true, duration: [20, 50], xp: [4, 9] }),
    ],
    ruinas: [
        scene('mosaico', 'serena', '🧩', 'El mosaico de los peces', 'intuicion', 1, ['Un mosaico de peces señala el oeste, aunque uno de ellos mira en dirección contraria.', 'La luz atraviesa la cúpula rota y hace brillar una pieza azul entre el polvo.'], ['{name} descubre que la pieza giratoria marca un corredor ventilado y anota el giro correcto.'], ['La pieza no se mueve y {name} evita forzarla; quizá haga falta otra pista.'], { weight: 10, discovery: 'mosaico-peces', calm: true, duration: [18, 44], xp: [6, 13], choices: { Místico: ['compara la inscripción con el dibujo del techo'], Explorador: ['observa el polvo para localizar una corriente de aire'] } }),
        scene('archivista', 'social', '📚', 'El archivista de barro', 'vinculo', 0, ['Boro, un pequeño gólem cubierto de arcilla, ordena tablillas por el sonido que hacen al caer.', 'Un golpecito acompasado viene de una sala lateral: Boro está otra vez clasificando tablillas.'], ['—Esta dice “lluvia después del mercado” —traduce Boro—. Las ruinas también tenían días aburridos.', '—Te guardé una tablilla con un dibujo nuevo —dice Boro—. Esta sí apunta hacia la salida.'], ['Una tablilla se parte al moverla. Boro suspira, pero rescata los fragmentos importantes.'], { weight: 9, friend: 'boro', duration: [20, 48], xp: [7, 16], choices: { Apoyo: ['ayuda a ordenar las piezas por tamaño'], Místico: ['lee en voz alta los símbolos que todavía distingue'] } }),
        scene('baldosas', 'riesgo', '🪤', 'Las baldosas huecas', 'agilidad', 2, ['El pasillo tiene baldosas de tonos distintos y el aire huele a metal antiguo.', 'Un clic bajo las patas de {name} despierta un mecanismo escondido.'], ['{name} identifica las baldosas seguras por el polvo intacto y cruza sin activar nada.', '{name} usa una losa suelta para trabar el mecanismo antes de seguir.'], ['Un dardo roza su hombro cuando el mecanismo se dispara; la trampa se detiene enseguida.'], { weight: 8, hazard: 'baldosas', damage: [4, 11], duration: [25, 54], xp: [8, 18], choices: { Explorador: ['mide la distancia entre las marcas del suelo'], Guardián: ['prueba cada losa con una piedra antes de cruzar'], Místico: ['escucha el clic que se repite bajo el mármol'] } }),
        scene('espiritu', 'encuentro', '🕯️', 'La luz que busca su puerta', 'vinculo', 1, ['Una lucecita azul flota frente a una puerta pintada en una pared sin salida.', 'El aire se enfría y una voz pequeña pregunta si ya amaneció.'], ['{name} descubre una puerta dibujada bajo el polvo. La luz entra y deja de temblar.', '{name} acompaña al espíritu hasta un nicho lleno de juguetes; allí, por fin, se queda en paz.'], ['El espíritu se asusta con el eco y desaparece detrás de una columna antes de poder ayudarlo.'], { weight: 6, friend: 'luz-azul', duration: [20, 45], xp: [8, 16], recover: 1, choices: { Apoyo: ['habla en voz baja para no asustarlo'], Místico: ['sigue el rastro tenue que deja la luz'] } }),
        scene('columnas', 'riesgo', '🗿', 'El corredor de columnas', 'fuerza', 3, ['El techo cruje y una grieta atraviesa las columnas del corredor.', 'Un fragmento de piedra cae detrás de {name}; el arco no aguantará mucho más.'], ['{name} sostiene una columna el tiempo justo para cruzar y salir del corredor.', '{name} aparta dos bloques y encuentra una salida lateral bajo el relieve.'], ['El arco cede antes de tiempo. {name} logra escapar, aunque los cascotes le golpean el lomo.'], { weight: 4, hazard: 'derrumbe', damage: [8, 18], duration: [26, 58], xp: [10, 20], choices: { Atacante: ['empuja el bloque que obstruye la salida'], Guardián: ['se coloca bajo el arco para proteger el paso'] } }),
        scene('archivo', 'hallazgo', '🗝️', 'El archivo de las cosas pequeñas', 'intuicion', 2, ['Tras un relieve de tortugas hay un cajón que todavía conserva su cerradura.', 'Una hilera de marcas en el suelo termina justo frente a un muro sin puerta.'], ['{name} encuentra anotaciones y un dibujo de brújula cuidadosamente copiados sobre la piedra.', '{name} abre el compartimento sin romper el sello y alcanza a leer una nota sobre las rutas antiguas.'], ['La cerradura está oxidada. {name} toma nota del mecanismo y no lo fuerza.'], { weight: 7, discovery: 'archivo-menor', item: true, coins: true, coinDetail: 'Dentro del compartimento, unas monedas siguen envueltas en tela seca.', duration: [30, 68], xp: [9, 18], choices: { Explorador: ['busca marcas de dedos alrededor del cajón'], Místico: ['compara el símbolo de la cerradura con las paredes'] } }),
        scene('patio', 'descanso', '🌿', 'El patio de lluvia', 'defensa', 0, ['Un patio interior recoge el agua de la última lluvia en una fuente limpia.', 'Las enredaderas han cubierto un banco de piedra y frenan el viento.'], ['{name} se toma un respiro junto a la fuente; el agua fresca le devuelve el ánimo.'], ['El agua está turbia, pero el patio sigue siendo un buen lugar para descansar a cubierto.'], { weight: 8, recover: 6, calm: true, duration: [18, 42], xp: [4, 9] }),
    ],
    dunas: [
        scene('sombras', 'serena', '🏜️', 'Las sombras alargadas', 'intuicion', 1, ['Al atardecer, las dunas dejan ver líneas oscuras que el sol ocultaba.', 'El viento dibuja ondas parejas en la arena y el calor empieza a ceder.'], ['{name} sigue la sombra de una aguja de cristal hasta un paso fresco entre las rocas.'], ['El espejismo cambia con la luz; {name} espera a que aparezcan las primeras estrellas.'], { weight: 10, calm: true, duration: [18, 40], xp: [5, 12], choices: { Místico: ['compara las sombras con la posición de las estrellas'], Explorador: ['busca una línea de huellas que el viento no borró'] } }),
        scene('caravana', 'social', '🐪', 'El té de Samir', 'vinculo', 0, ['Samir, un vendedor de mapas, prepara té mientras su caravana descansa junto a una roca.', 'Un tintineo conocido anuncia el regreso de Samir con su caravana.'], ['—Este mapa está al revés —admite Samir, riéndose—. La parte buena es que por eso encontramos un oasis.', '—Te guardé dátiles —dice Samir—. El mapa puede esperar; cuéntame qué viste desde la última vez.'], ['El viento levanta el campamento antes de que puedan conversar; Samir promete guardar una taza para después.'], { weight: 10, friend: 'samir', duration: [22, 50], xp: [7, 16], recover: 2, choices: { Apoyo: ['ayuda a sujetar la lona mientras se prepara el té'], Explorador: ['compara las marcas de la caravana con el mapa'] } }),
        scene('vientoarena', 'riesgo', '🌬️', 'La pared de arena', 'defensa', 2, ['El horizonte desaparece detrás de una nube color cobre.', 'Los granos golpean las piedras y el aire se vuelve difícil de respirar.'], ['{name} se cubre tras un saliente y espera a que la tormenta abra una ventana.', '{name} ata una tela a una roca y encuentra el camino de vuelta siguiendo la cuerda.'], ['La ráfaga lo empuja contra la arena y le deja varios raspones antes de amainar.'], { weight: 7, hazard: 'tormenta-de-arena', damage: [5, 14], duration: [24, 58], xp: [8, 18], choices: { Guardián: ['busca una pared de roca antes de moverse'], Atacante: ['sujeta la lona para evitar que salga volando'] } }),
        scene('lagarto', 'encuentro', '🦂', 'El escorpión de cristal', 'agilidad', 2, ['Un escorpión translúcido bloquea una grieta y hace chocar sus pinzas.', 'El caparazón de un escorpión refleja el sol; parece proteger algo bajo la arena.'], ['{name} rodea al escorpión sin acorralarlo y descubre que solo estaba cuidando su madriguera.', '{name} distrae al escorpión con un destello y se aparta mientras vuelve a su refugio.'], ['Una pinza alcanza la pata de {name} antes de que consiga apartarse.'], { weight: 5, hazard: 'escorpion-de-cristal', damage: [6, 14], duration: [20, 48], xp: [9, 19], choices: { Explorador: ['observa el ritmo de sus pinzas antes de moverse'], Atacante: ['le ofrece una salida en lugar de arrinconarlo'] } }),
        scene('observatorio', 'hallazgo', '🔭', 'El observatorio sepultado', 'agilidad', 2, ['Un arco de piedra sobresale de una duna y conserva grabadas las fases de la luna.', 'Las estrellas parecen alinearse con una torre medio enterrada.'], ['{name} descubre un mapa celeste tallado en el techo al girar el antiguo telescopio.', '{name} limpia de arena una lente y descubre cómo alinearla con las estrellas.'], ['La arena llena la escalera antes de llegar a la cámara interior; {name} deja una señal para volver.'], { weight: 8, discovery: 'observatorio-sepultado', item: true, coins: true, coinDetail: 'Entre los mapas y frascos, queda una pequeña reserva de monedas.', duration: [30, 70], xp: [9, 20], choices: { Místico: ['orienta el telescopio con las constelaciones'], Explorador: ['trepa por el muro donde la arena está más compacta'] } }),
        scene('oasis', 'descanso', '🌴', 'La sombra del oasis', 'vinculo', 0, ['Entre dos peñascos aparece un oasis pequeño, escondido del camino principal.', 'Las hojas de una palmera se mueven sobre un charco de agua clara.'], ['{name} bebe y se refresca a la sombra; el oasis queda anotado para otra visita.'], ['El agua es poca, pero alcanza para que {name} se enfríe antes de continuar.'], { weight: 8, discovery: 'oasis-escondido', recover: 8, calm: true, duration: [20, 48], xp: [4, 10], choices: { Apoyo: ['deja unas gotas en una hoja para un lagarto sediento'] } }),
        scene('marcas', 'hallazgo', '🪙', 'Las marcas del mojón', 'intuicion', 1, ['Un mojón semienterrado tiene símbolos de caravana en la cara que mira al norte.', 'Una bandada de aves desciende siempre al mismo punto de la duna.'], ['{name} encuentra una bolsa perdida y la devuelve al campamento; los viajeros le dan unas monedas por hallarla.', '{name} descubre una bolsita bajo el mojón y toma solo las monedas que otros viajeros dejaron para compartir.'], ['El mojón está vacío; {name} lo endereza para que vuelva a servir de guía.'], { weight: 7, discovery: 'mojon-del-norte', coins: true, duration: [22, 48], xp: [7, 15], choices: { Guardián: ['asegura el mojón para que no lo tumbe el viento'], Explorador: ['compara el símbolo con huellas recientes'] } }),
    ],
    astral: [
        scene('orilla', 'serena', '🌌', 'La orilla que refleja estrellas', 'intuicion', 1, ['Las olas dejan un borde luminoso que tarda varios segundos en apagarse.', 'La noche está tan quieta que las constelaciones se reflejan bajo las patas.'], ['{name} sigue la orilla hasta una plataforma estable y memoriza el ritmo de la marea.'], ['Una ola cambia el reflejo y borra la ruta; {name} espera a que vuelva a dibujarse.'], { weight: 10, calm: true, discovery: 'orilla-estelar', duration: [18, 46], xp: [5, 13], choices: { Místico: ['compara el reflejo con el cielo real'], Explorador: ['cuenta los intervalos entre cada ola luminosa'] } }),
        scene('navegante', 'social', '🧭', 'La brújula de Luma', 'vinculo', 0, ['Luma, una navegante de capa azul, intenta convencer a su brújula de que el norte no está bajo el agua.', 'Una luz azul parpadea en el muelle: Luma vuelve a corregir su brújula caprichosa.'], ['—Dice que hoy el norte está de vacaciones —bromea Luma—. Menos mal que tú sí sabes volver.', '—Cuando las islas cambien de lugar, busca la estrella que titila dos veces —le explica Luma—. Esa siempre nos encuentra.'], ['La brújula gira sin parar y la conversación termina entre risas, sin encontrar una ruta nueva.'], { weight: 9, friend: 'luma', duration: [22, 52], xp: [8, 17], recover: 1, choices: { Místico: ['sigue la vibración que acompaña a la aguja'], Apoyo: ['sujeta el mapa mientras Luma prueba la brújula'] } }),
        scene('marea', 'riesgo', '🌊', 'La marea que sube', 'agilidad', 2, ['Una corriente violeta empuja la plataforma hacia el borde del archipiélago.', 'El brillo bajo el agua se intensifica y hace que las rocas floten sin rumbo.'], ['{name} salta a una isla firme justo antes de que la corriente se lleve la plataforma.', '{name} encuentra un arco de roca que parte la corriente y abre una ruta segura.'], ['La marea lo arrastra hasta una roca cercana; el golpe le deja el costado dolorido.'], { weight: 7, hazard: 'marea-violeta', damage: [6, 15], duration: [24, 58], xp: [9, 19], choices: { Explorador: ['mide el vaivén antes de dar el salto'], Guardián: ['asegura una cuerda entre las dos plataformas'] } }),
        scene('medusa', 'encuentro', '🪼', 'La medusa de luz', 'vinculo', 1, ['Una medusa pequeña quedó varada en una poza entre dos islas.', 'Un destello azul pide ayuda desde una charca que se está secando.'], ['{name} guía a la medusa hacia el agua profunda; ella responde con una lluvia de chispas cálidas.', '{name} devuelve la medusa a la marea y esta lo acompaña un trecho, iluminando el agua.'], ['Un tentáculo roza su pata. La medusa no quería hacer daño, pero el cosquilleo le deja una marca luminosa.'], { weight: 6, friend: 'medusa-nima', duration: [20, 46], xp: [8, 17], recover: 2, choices: { Apoyo: ['humedece la poza con una concha'], Místico: ['le muestra el reflejo del agua abierta'] } }),
        scene('fragmento', 'riesgo', '☄️', 'El fragmento inquieto', 'defensa', 3, ['Una roca celeste cruza el cielo y cae con un zumbido detrás de la isla.', 'El suelo vibra alrededor de un fragmento que todavía conserva calor.'], ['{name} espera a que el núcleo se enfríe y recoge solo una escama suelta.', '{name} lo cubre con arena lunar hasta que deja de vibrar.'], ['El fragmento estalla en una lluvia de polvo brillante que golpea a {name}.'], { weight: 4, hazard: 'fragmento-celeste', damage: [8, 18], duration: [26, 62], xp: [10, 21], discovery: 'fragmento-celeste', choices: { Atacante: ['lo aleja de la orilla con una roca'], Místico: ['reconoce el pulso que anuncia una descarga'] } }),
        scene('observatorio', 'hallazgo', '🔭', 'El observatorio a la deriva', 'intuicion', 2, ['Una cúpula antigua deriva sin rumbo, pero su lente apunta a una estrella concreta.', 'La isla del observatorio aparece donde ayer solo había niebla.'], ['{name} alinea la lente y descifra marcas de navegación grabadas en el arco.', '{name} aprende una nueva referencia estelar para reconocer esta isla la próxima vez.'], ['La cúpula empieza a girar antes de poder explorarla. {name} registra la posición y salta a una isla estable.'], { weight: 8, discovery: 'observatorio-deriva', item: true, coins: true, coinDetail: 'Entre los mapas guardados hay un pequeño fondo de monedas para navegantes.', duration: [32, 72], xp: [10, 21], choices: { Místico: ['compara la lente con la constelación más cercana'], Explorador: ['asegura el borde antes de entrar'] } }),
        scene('ensenada', 'descanso', '✨', 'La ensenada de calma', 'vinculo', 0, ['Entre dos islas hay una ensenada donde las olas no hacen ruido.', 'Una pequeña playa recibe luz de tres lunas distintas.'], ['{name} descansa junto al agua y recupera energía mientras las estrellas cambian de lugar.'], ['La calma dura poco, pero alcanza para recuperar el aliento antes de seguir.'], { weight: 8, recover: 8, calm: true, duration: [18, 44], xp: [4, 10], discovery: 'ensenada-calma' }),
    ],
};
const sceneChoices = {
    Atacante: ['se adelanta para abrir espacio', 'se ofrece a apartar el obstáculo', 'mantiene la calma y despeja el paso'],
    Guardián: ['busca primero dónde estará más seguro', 'se coloca en el lado expuesto para proteger el camino', 'avanza comprobando que el resto pueda seguir'],
    Explorador: ['lee las señales antes de escoger una ruta', 'se fija en las huellas y prueba el camino más corto', 'marca un punto de referencia por si hay que volver'],
    Místico: ['presta atención al pulso extraño del lugar', 'interpreta las marcas antes de tocar nada', 'sigue la corriente de energía que apenas se percibe'],
    Apoyo: ['se acerca despacio para que nadie se asuste', 'ofrece ayuda antes de pensar en continuar', 'comparte agua y deja que los demás recuperen el ánimo'],
};
const petRarityOverrides = {
    'Camaleón del viento': 'Común',
    'Basilisco pequeño': 'Común',
    'Medusa lunar': 'Común',
    'Ardilla cometa': 'Común',
};
const species = [
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
].map((entry, index) => ({ ...entry, rarity: petRarityOverrides[entry.name] ?? (index < 28 ? 'Común' : index < 40 ? 'Poco común' : index < 45 ? 'Raro' : index < 47 ? 'Épico' : 'Legendario') }));
const additionalSpecies = [
    { name: 'Topillo campanero', emoji: '🐹', base: [8, 8, 8], rarity: 'Común', element: 'Tierra', specialization: 'Explorador' },
    { name: 'Salamandra de piloncillo', emoji: '🦎', base: [10, 7, 8], rarity: 'Común', element: 'Fuego', specialization: 'Atacante' },
    { name: 'Zorruela del rocío', emoji: '🦊', base: [7, 7, 11], rarity: 'Común', element: 'Agua', specialization: 'Explorador' },
    { name: 'Tortuga tintera', emoji: '🐢', base: [6, 12, 5], rarity: 'Común', element: 'Sombra', specialization: 'Guardián' },
    { name: 'Cabrita de neblina', emoji: '🐐', base: [7, 11, 6], rarity: 'Común', element: 'Viento', specialization: 'Apoyo' },
    { name: 'Murciélago de menta', emoji: '🦇', base: [8, 6, 10], rarity: 'Común', element: 'Naturaleza', specialization: 'Explorador' },
    { name: 'Ajolote cempasúchil', emoji: '🦎', base: [7, 8, 10], rarity: 'Común', element: 'Fuego', specialization: 'Apoyo' },
    { name: 'Tlacuache de papel picado', emoji: '🐀', base: [8, 8, 8], rarity: 'Común', element: 'Luz', specialization: 'Apoyo' },
    { name: 'Tejón brisita', emoji: '🦡', base: [8, 11, 6], rarity: 'Común', element: 'Viento', specialization: 'Guardián' },
    { name: 'Liebre de panal', emoji: '🐇', base: [7, 8, 10], rarity: 'Poco común', element: 'Naturaleza', specialization: 'Apoyo' },
    { name: 'Medusita de lluvia', emoji: '🪼', base: [6, 8, 10], rarity: 'Común', element: 'Agua', specialization: 'Místico' },
    { name: 'Cenzontle de nube', emoji: '🐦', base: [7, 7, 10], rarity: 'Común', element: 'Viento', specialization: 'Apoyo' },
    { name: 'Caracol vitral', emoji: '🐌', base: [5, 11, 7], rarity: 'Poco común', element: 'Luz', specialization: 'Guardián' },
    { name: 'Perrito de nopal', emoji: '🐕', base: [8, 9, 8], rarity: 'Común', element: 'Naturaleza', specialization: 'Apoyo' },
    { name: 'Rana campanilla', emoji: '🐸', base: [8, 8, 9], rarity: 'Común', element: 'Naturaleza', specialization: 'Místico' },
    { name: 'Conejo solsticio', emoji: '🐰', base: [7, 8, 10], rarity: 'Común', element: 'Astral', specialization: 'Explorador' },
    { name: 'Serpiente de pluma', emoji: '🐍', base: [9, 6, 11], rarity: 'Común', element: 'Viento', specialization: 'Atacante' },
    { name: 'Erizo naranjo', emoji: '🦔', base: [8, 10, 7], rarity: 'Poco común', element: 'Naturaleza', specialization: 'Guardián' },
    { name: 'Gato de tinta lunar', emoji: '🐈‍⬛', base: [8, 7, 10], rarity: 'Común', element: 'Sombra', specialization: 'Explorador' },
    { name: 'Abejorro de ámbar', emoji: '🐝', base: [9, 7, 9], rarity: 'Común', element: 'Luz', specialization: 'Apoyo' },
    { name: 'Capibara de lirio', emoji: '🦫', base: [7, 11, 6], rarity: 'Común', element: 'Agua', specialization: 'Guardián' },
    { name: 'Lagarto piñón', emoji: '🦎', base: [8, 10, 7], rarity: 'Común', element: 'Tierra', specialization: 'Explorador' },
    { name: 'Búho trébol', emoji: '🦉', base: [7, 9, 10], rarity: 'Común', element: 'Naturaleza', specialization: 'Místico' },
    { name: 'Pez globo cobrizo', emoji: '🐡', base: [8, 11, 6], rarity: 'Común', element: 'Agua', specialization: 'Guardián' },
    { name: 'Venadito de papel picado', emoji: '🦌', base: [7, 8, 10], rarity: 'Común', element: 'Luz', specialization: 'Apoyo' },
    { name: 'Ovejita de algodón de azúcar', emoji: '🐑', base: [6, 10, 8], rarity: 'Común', element: 'Luz', specialization: 'Apoyo' },
    { name: 'Cangrejín de limonita', emoji: '🦀', base: [7, 12, 5], rarity: 'Común', element: 'Tierra', specialization: 'Guardián' },
    { name: 'Mapache de luciérnagas', emoji: '🦝', base: [8, 6, 11], rarity: 'Común', element: 'Astral', specialization: 'Explorador' },
    { name: 'Axolote de obsidiana', emoji: '🦎', base: [8, 10, 7], rarity: 'Poco común', element: 'Sombra', specialization: 'Apoyo' },
    { name: 'Lince de campanillas', emoji: '🐈', base: [9, 7, 10], rarity: 'Poco común', element: 'Luz', specialization: 'Explorador' },
    { name: 'Mariposa de amapolas', emoji: '🦋', base: [7, 6, 12], rarity: 'Poco común', element: 'Naturaleza', specialization: 'Místico' },
    { name: 'Dragón de jade rojo', emoji: '🐉', base: [11, 8, 7], rarity: 'Poco común', element: 'Naturaleza', specialization: 'Atacante' },
    { name: 'Mantarraya del monzón', emoji: '🪽', base: [8, 11, 7], rarity: 'Poco común', element: 'Agua', specialization: 'Guardián' },
    { name: 'Zorro de lluvia invertida', emoji: '🦊', base: [8, 7, 11], rarity: 'Poco común', element: 'Viento', specialization: 'Explorador' },
    { name: 'Escarabajo de ópalo', emoji: '🪲', base: [8, 11, 7], rarity: 'Poco común', element: 'Luz', specialization: 'Guardián' },
    { name: 'Colibrí de relámpago', emoji: '🐦', base: [8, 6, 12], rarity: 'Poco común', element: 'Rayo', specialization: 'Apoyo' },
    { name: 'Coyote de espejos', emoji: '🐺', base: [10, 7, 9], rarity: 'Poco común', element: 'Astral', specialization: 'Atacante' },
    { name: 'Caballito de mar tornasol', emoji: '🐠', base: [7, 8, 11], rarity: 'Poco común', element: 'Agua', specialization: 'Místico' },
    { name: 'Ciervo de cometa', emoji: '🦌', base: [8, 8, 10], rarity: 'Poco común', element: 'Astral', specialization: 'Atacante' },
    { name: 'Lechuza de la hora azul', emoji: '🦉', base: [7, 9, 10], rarity: 'Poco común', element: 'Sombra', specialization: 'Místico' },
    { name: 'Quetzal de viento lunar', emoji: '🦜', base: [10, 7, 11], rarity: 'Raro', element: 'Viento', specialization: 'Místico' },
    { name: 'Basilisco de vidrio ahumado', emoji: '🐍', base: [11, 8, 8], rarity: 'Raro', element: 'Sombra', specialization: 'Atacante' },
    { name: 'Kraken de medianoche', emoji: '🐙', base: [8, 11, 9], rarity: 'Raro', element: 'Agua', specialization: 'Místico' },
    { name: 'Fénix flor de cobre', emoji: '🔥', base: [12, 7, 10], rarity: 'Raro', element: 'Fuego', specialization: 'Atacante' },
    { name: 'Tapir de constelación', emoji: '🐗', base: [8, 12, 8], rarity: 'Raro', element: 'Astral', specialization: 'Guardián' },
    { name: 'Serafín de prisma', emoji: '🦋', base: [8, 9, 12], rarity: 'Épico', element: 'Luz', specialization: 'Apoyo' },
    { name: 'Dragón del eclipse doble', emoji: '🐉', base: [12, 10, 8], rarity: 'Épico', element: 'Astral', specialization: 'Atacante' },
    { name: 'Auraluz, dragón de la primera aurora', emoji: '🐲', base: [12, 9, 11], rarity: 'Legendario', element: 'Fuego', specialization: 'Místico' },
];
const rarityCoverageSpecies = [
    { name: 'Gallo de la hoguera azul', emoji: '🐓', base: [12, 8, 10], rarity: 'Épico', element: 'Fuego', specialization: 'Atacante' },
    { name: 'Ballena de los siete espejos', emoji: '🐋', base: [12, 11, 10], rarity: 'Legendario', element: 'Agua', specialization: 'Místico' },
    { name: 'Yaguarí de raíces cantoras', emoji: '🐆', base: [11, 10, 9], rarity: 'Épico', element: 'Naturaleza', specialization: 'Atacante' },
    { name: 'Ceiba de los mil colibríes', emoji: '🌳', base: [10, 12, 11], rarity: 'Legendario', element: 'Naturaleza', specialization: 'Apoyo' },
    { name: 'Albatros de los cuatro vientos', emoji: '🕊️', base: [10, 9, 12], rarity: 'Épico', element: 'Viento', specialization: 'Explorador' },
    { name: 'León de la corriente celeste', emoji: '🦁', base: [12, 12, 10], rarity: 'Legendario', element: 'Viento', specialization: 'Guardián' },
    { name: 'Armiño de escarcha azul', emoji: '🐁', base: [9, 7, 11], rarity: 'Raro', element: 'Hielo', specialization: 'Explorador' },
    { name: 'Oso de la aurora rota', emoji: '🐻', base: [11, 12, 8], rarity: 'Épico', element: 'Hielo', specialization: 'Guardián' },
    { name: 'Dragón de los glaciares cantores', emoji: '🐉', base: [12, 10, 11], rarity: 'Legendario', element: 'Hielo', specialization: 'Místico' },
    { name: 'Libélula de cristal solar', emoji: '🦋', base: [7, 8, 12], rarity: 'Raro', element: 'Luz', specialization: 'Apoyo' },
    { name: 'Ciervo del alba eterna', emoji: '🦌', base: [11, 12, 10], rarity: 'Legendario', element: 'Luz', specialization: 'Guardián' },
    { name: 'Cuervo del eclipse vacío', emoji: '🐦‍⬛', base: [11, 9, 10], rarity: 'Épico', element: 'Sombra', specialization: 'Místico' },
    { name: 'Leviatán de la noche sin luna', emoji: '🐉', base: [12, 11, 10], rarity: 'Legendario', element: 'Sombra', specialization: 'Atacante' },
    { name: 'Topo de geoda violeta', emoji: '🐹', base: [10, 12, 8], rarity: 'Épico', element: 'Tierra', specialization: 'Guardián' },
    { name: 'Titán de jade dormido', emoji: '🪨', base: [12, 13, 8], rarity: 'Legendario', element: 'Tierra', specialization: 'Guardián' },
    { name: 'Liebre de chispa azul', emoji: '🐇', base: [9, 7, 12], rarity: 'Raro', element: 'Rayo', specialization: 'Explorador' },
    { name: 'Serpiente del relámpago doble', emoji: '🐍', base: [12, 8, 12], rarity: 'Épico', element: 'Rayo', specialization: 'Atacante' },
    { name: 'Quimera del trueno eterno', emoji: '🦁', base: [13, 11, 10], rarity: 'Legendario', element: 'Rayo', specialization: 'Atacante' },
];
const balancedSpecies = [
    { name: 'Ajolote de carbón', emoji: '🦎', base: [8, 8, 7], rarity: 'Común', element: 'Fuego', specialization: 'Apoyo' },
    { name: 'Cascabel de brasa', emoji: '🐍', base: [9, 6, 9], rarity: 'Común', element: 'Fuego', specialization: 'Atacante' },
    { name: 'Coatí de tizón', emoji: '🦝', base: [8, 7, 9], rarity: 'Común', element: 'Fuego', specialization: 'Explorador' },
    { name: 'Venado de magma', emoji: '🦌', base: [9, 9, 8], rarity: 'Poco común', element: 'Fuego', specialization: 'Guardián' },
    { name: 'Tortuga volcánica', emoji: '🐢', base: [7, 12, 6], rarity: 'Poco común', element: 'Fuego', specialization: 'Guardián' },
    { name: 'Polilla de rescoldo', emoji: '🦋', base: [8, 7, 10], rarity: 'Poco común', element: 'Fuego', specialization: 'Místico' },
    { name: 'Mantarraya de lluvia azul', emoji: '🐟', base: [7, 9, 11], rarity: 'Poco común', element: 'Agua', specialization: 'Místico' },
    { name: 'Zorro cometa', emoji: '🦊', base: [9, 7, 11], rarity: 'Poco común', element: 'Viento', specialization: 'Explorador' },
    { name: 'Gavilán de nubes', emoji: '🦅', base: [10, 7, 10], rarity: 'Poco común', element: 'Viento', specialization: 'Atacante' },
    { name: 'Foca copo', emoji: '🦭', base: [7, 10, 7], rarity: 'Común', element: 'Hielo', specialization: 'Guardián' },
    { name: 'Ardilla de escarcha', emoji: '🐿️', base: [7, 7, 10], rarity: 'Común', element: 'Hielo', specialization: 'Explorador' },
    { name: 'Lemming de hielo', emoji: '🐹', base: [8, 9, 7], rarity: 'Común', element: 'Hielo', specialization: 'Guardián' },
    { name: 'Perrito glaciar', emoji: '🐕', base: [8, 8, 8], rarity: 'Común', element: 'Hielo', specialization: 'Apoyo' },
    { name: 'Salamandra nevada', emoji: '🦎', base: [8, 7, 9], rarity: 'Común', element: 'Hielo', specialization: 'Místico' },
    { name: 'Búho de cristal helado', emoji: '🦉', base: [7, 8, 9], rarity: 'Común', element: 'Hielo', specialization: 'Místico' },
    { name: 'Lince aurora', emoji: '🐈', base: [9, 7, 11], rarity: 'Poco común', element: 'Hielo', specialization: 'Explorador' },
    { name: 'Bisonte de ventisca', emoji: '🦬', base: [8, 12, 6], rarity: 'Poco común', element: 'Hielo', specialization: 'Guardián' },
    { name: 'Topo de cobre', emoji: '🐹', base: [7, 8, 8], rarity: 'Común', element: 'Tierra', specialization: 'Explorador' },
    { name: 'Ratón de chispas', emoji: '🐭', base: [8, 6, 10], rarity: 'Común', element: 'Rayo', specialization: 'Atacante' },
    { name: 'Polilla voltaica', emoji: '🦋', base: [7, 6, 10], rarity: 'Común', element: 'Rayo', specialization: 'Místico' },
    { name: 'Geco fulgor', emoji: '🦎', base: [8, 7, 9], rarity: 'Común', element: 'Rayo', specialization: 'Atacante' },
    { name: 'Cuy de tormenta', emoji: '🐹', base: [8, 9, 7], rarity: 'Común', element: 'Rayo', specialization: 'Guardián' },
    { name: 'Zorrillo de estática', emoji: '🦨', base: [8, 7, 9], rarity: 'Común', element: 'Rayo', specialization: 'Apoyo' },
    { name: 'Caracol chispeante', emoji: '🐌', base: [6, 10, 7], rarity: 'Común', element: 'Rayo', specialization: 'Guardián' },
    { name: 'Lechuza conductora', emoji: '🦉', base: [7, 7, 10], rarity: 'Común', element: 'Rayo', specialization: 'Explorador' },
    { name: 'Jaguar del arco eléctrico', emoji: '🐆', base: [10, 7, 10], rarity: 'Poco común', element: 'Rayo', specialization: 'Atacante' },
    { name: 'Lagartija de geoda', emoji: '🦎', base: [8, 9, 7], rarity: 'Común', element: 'Tierra', specialization: 'Explorador' },
    { name: 'Gatito de eclipse', emoji: '🐈‍⬛', base: [7, 7, 10], rarity: 'Común', element: 'Sombra', specialization: 'Explorador' },
    { name: 'Murciélago de ceniza lunar', emoji: '🦇', base: [8, 6, 10], rarity: 'Común', element: 'Sombra', specialization: 'Explorador' },
    { name: 'Rana de humo violeta', emoji: '🐸', base: [7, 8, 8], rarity: 'Común', element: 'Sombra', specialization: 'Místico' },
    { name: 'Jabalí de obsidiana', emoji: '🐗', base: [10, 8, 8], rarity: 'Poco común', element: 'Tierra', specialization: 'Atacante' },
    { name: 'Armadillo de cuarzo', emoji: '🦔', base: [7, 11, 8], rarity: 'Poco común', element: 'Tierra', specialization: 'Guardián' },
    { name: 'Mapache de nebulosa', emoji: '🦝', base: [8, 7, 10], rarity: 'Común', element: 'Astral', specialization: 'Explorador' },
    { name: 'Conejo de cometa azul', emoji: '🐇', base: [7, 7, 11], rarity: 'Común', element: 'Astral', specialization: 'Explorador' },
    { name: 'Loro de constelaciones', emoji: '🦜', base: [8, 7, 11], rarity: 'Poco común', element: 'Astral', specialization: 'Apoyo' },
    { name: 'Gacela de polvo estelar', emoji: '🦌', base: [9, 8, 10], rarity: 'Poco común', element: 'Astral', specialization: 'Místico' },
];
species.push(...additionalSpecies, ...rarityCoverageSpecies, ...balancedSpecies);
export function getPetSpeciesMetadata(name) {
    return species.find((candidate) => candidate.name === name);
}
export function getSpeciesCatalog() { return species; }
const defineMove = (element, id, name, minLevel, power, accuracy, energy, effect, expeditionFocus, description, specialization) => ({ id, name, element, minLevel, power, accuracy, energy, effect, expeditionFocus, description, ...(specialization ? { specialization } : {}) });
const elementalMoves = [
    defineMove('Fuego', 'flame_flick', 'Chispa ígnea', 1, 12, 100, 0, 'damage', 'presion', 'Golpe de fuego preciso y veloz.'),
    defineMove('Fuego', 'ember_burst', 'Estallido de brasas', 5, 22, 88, 17, 'weaken', 'presion', 'Quema y debilita el siguiente golpe rival.'),
    defineMove('Fuego', 'cinder_guard', 'Velo de ceniza', 3, 0, 100, 11, 'guard', 'proteccion', 'Una cortina caliente amortigua el daño.'),
    defineMove('Fuego', 'foxfire_drain', 'Llama zorruna', 7, 17, 94, 14, 'drain', 'presion', 'Una llama azul roba parte de la vitalidad.'),
    defineMove('Fuego', 'ash_step', 'Paso de ceniza', 9, 19, 100, 14, 'damage', 'proteccion', 'Esquiva entre chispas y contraataca.'),
    defineMove('Fuego', 'hearth_pulse', 'Pulso de fogata', 11, 18, 100, 16, 'heal', 'recuperacion', 'El calor sereno cierra heridas.'),
    defineMove('Fuego', 'phoenix_feint', 'Finta del fénix', 13, 24, 91, 18, 'weaken', 'presion', 'Renace en una llamarada que quiebra el ímpetu rival.'),
    defineMove('Fuego', 'sunflare', 'Fulgor del mediodía', 15, 28, 86, 21, 'damage', 'presion', 'Un arco solar golpea con gran potencia.'),
    defineMove('Fuego', 'ember_bloom', 'Jardín de rescoldos', 17, 22, 100, 20, 'heal', 'recuperacion', 'Brasas diminutas devuelven fuerzas.'),
    defineMove('Fuego', 'last_spark', 'Último rescoldo', 19, 34, 80, 24, 'damage', 'presion', 'Concentra todo el calor en un golpe decisivo.'),
    defineMove('Agua', 'bubble_shot', 'Burbuja veloz', 1, 11, 100, 0, 'damage', 'presion', 'Ataque acuático rápido y preciso.'),
    defineMove('Agua', 'tidal_drain', 'Drenaje de marea', 5, 18, 92, 15, 'drain', 'recuperacion', 'Daña y recupera PV con el vaivén de la marea.'),
    defineMove('Agua', 'foam_screen', 'Pantalla de espuma', 3, 0, 100, 11, 'guard', 'proteccion', 'La espuma desvía el siguiente impacto.'),
    defineMove('Agua', 'undertow', 'Corriente traicionera', 7, 17, 95, 13, 'weaken', 'presion', 'Una corriente baja desestabiliza al rival.'),
    defineMove('Agua', 'rain_mend', 'Lluvia mansa', 9, 19, 100, 15, 'heal', 'recuperacion', 'Una lluvia fresca restaura energía y heridas.'),
    defineMove('Agua', 'splash_dash', 'Salto de rompiente', 11, 20, 97, 15, 'damage', 'proteccion', 'Se impulsa en una ola y golpea al aterrizar.'),
    defineMove('Agua', 'mirror_pool', 'Espejo de laguna', 13, 0, 100, 16, 'guard', 'proteccion', 'Un reflejo líquido confunde y protege.'),
    defineMove('Agua', 'deep_current', 'Corriente abisal', 15, 26, 88, 20, 'drain', 'recuperacion', 'La presión del fondo roba vitalidad.'),
    defineMove('Agua', 'spring_tide', 'Marea de primavera', 17, 25, 100, 21, 'heal', 'recuperacion', 'Una fuente cálida sana a quien la invoca.'),
    defineMove('Agua', 'tsunami_arc', 'Arco de tsunami', 19, 33, 82, 24, 'damage', 'presion', 'Una ola enorme barre el campo de batalla.'),
    defineMove('Naturaleza', 'thorn_whip', 'Látigo de espinas', 1, 12, 96, 0, 'damage', 'presion', 'Ataque vegetal equilibrado.'),
    defineMove('Naturaleza', 'bloom_mend', 'Brote sanador', 5, 24, 100, 19, 'heal', 'recuperacion', 'Recupera PV con savia luminosa.'),
    defineMove('Naturaleza', 'root_snare', 'Raíces enlazantes', 3, 15, 96, 12, 'weaken', 'proteccion', 'Raíces frenan al rival y su próximo ataque.'),
    defineMove('Naturaleza', 'moss_shell', 'Caparazón de musgo', 7, 0, 100, 13, 'guard', 'proteccion', 'Musgo y corteza absorben parte del golpe.'),
    defineMove('Naturaleza', 'pollen_drain', 'Polen vital', 9, 17, 94, 14, 'drain', 'recuperacion', 'El polen extrae fuerza y la devuelve.'),
    defineMove('Naturaleza', 'seed_barrage', 'Ráfaga de semillas', 11, 21, 96, 16, 'damage', 'presion', 'Semillas duras vuelan como una lluvia de dardos.'),
    defineMove('Naturaleza', 'verdant_song', 'Canto del claro', 13, 22, 100, 18, 'heal', 'vinculo', 'Una melodía vegetal calma y cura.'),
    defineMove('Naturaleza', 'bramble_crown', 'Corona de zarzas', 15, 27, 88, 20, 'weaken', 'presion', 'Zarzas cierran el paso y rompen la guardia.'),
    defineMove('Naturaleza', 'ancient_grove', 'Resguardo del bosque', 17, 0, 100, 20, 'guard', 'proteccion', 'Espíritus del bosque alzan una defensa firme.'),
    defineMove('Naturaleza', 'worldroot', 'Raíz del mundo', 19, 32, 84, 24, 'drain', 'recuperacion', 'Una raíz ancestral absorbe la fuerza enemiga.'),
    defineMove('Viento', 'gust_cut', 'Corte de vendaval', 1, 11, 100, 0, 'damage', 'presion', 'Ataque veloz de viento.'),
    defineMove('Viento', 'tailwind_guard', 'Guardia de cola', 5, 0, 100, 14, 'guard', 'proteccion', 'Una ráfaga desvía el siguiente golpe.'),
    defineMove('Viento', 'feather_step', 'Paso de pluma', 3, 15, 100, 11, 'damage', 'proteccion', 'Un giro ligero convierte la esquiva en ataque.'),
    defineMove('Viento', 'whistling_draft', 'Silbido cortante', 7, 18, 96, 14, 'weaken', 'presion', 'Un silbido agudo desordena al rival.'),
    defineMove('Viento', 'cloud_lullaby', 'Arrullo de nube', 9, 18, 100, 15, 'heal', 'recuperacion', 'Una nube fresca le devuelve el aliento.'),
    defineMove('Viento', 'spiral_dive', 'Picado en espiral', 11, 22, 93, 16, 'damage', 'presion', 'Desciende en espiral con un golpe certero.'),
    defineMove('Viento', 'updraft', 'Corriente ascendente', 13, 0, 100, 16, 'guard', 'proteccion', 'Una corriente eleva y aparta del peligro.'),
    defineMove('Viento', 'sky_lance', 'Lanza del cielo', 15, 27, 88, 20, 'damage', 'presion', 'Comprime el aire en una lanza afilada.'),
    defineMove('Viento', 'breeze_mend', 'Brisa reparadora', 17, 25, 100, 20, 'heal', 'recuperacion', 'Una brisa tibia cierra heridas.'),
    defineMove('Viento', 'tempest_wing', 'Alas de tempestad', 19, 34, 82, 24, 'weaken', 'presion', 'Un vendaval golpea y deja al rival sin equilibrio.'),
    defineMove('Hielo', 'snow_shard', 'Esquirla de nieve', 1, 13, 94, 0, 'damage', 'presion', 'Golpe de hielo de potencia media.'),
    defineMove('Hielo', 'frost_break', 'Ruptura glacial', 5, 20, 88, 16, 'weaken', 'proteccion', 'Daña y reduce la fuerza del siguiente ataque rival.'),
    defineMove('Hielo', 'rime_guard', 'Escarcha protectora', 3, 0, 100, 11, 'guard', 'proteccion', 'Una capa de hielo amortigua el impacto.'),
    defineMove('Hielo', 'blue_flurry', 'Ventisca azul', 7, 19, 92, 14, 'damage', 'presion', 'Copos afilados atacan en rápida sucesión.'),
    defineMove('Hielo', 'glacier_mend', 'Reposo glaciar', 9, 20, 100, 16, 'heal', 'recuperacion', 'El frío sereno detiene el dolor y restaura PV.'),
    defineMove('Hielo', 'ice_mirror', 'Espejo de hielo', 11, 0, 100, 16, 'guard', 'proteccion', 'Un espejo helado desvía el golpe hacia un lado.'),
    defineMove('Hielo', 'permafrost_bite', 'Mordida de permafrost', 13, 25, 91, 18, 'drain', 'presion', 'El hielo muerde y absorbe calor vital.'),
    defineMove('Hielo', 'whiteout', 'Ceguera blanca', 15, 27, 86, 20, 'weaken', 'presion', 'Una nube de nieve oculta al rival y lo desarma.'),
    defineMove('Hielo', 'aurora_snow', 'Nieve de aurora', 17, 25, 100, 21, 'heal', 'vinculo', 'Copos brillantes alivian el cansancio.'),
    defineMove('Hielo', 'zero_point', 'Punto cero', 19, 35, 80, 24, 'damage', 'presion', 'Libera un pulso de frío absoluto.'),
    defineMove('Luz', 'gleam_pulse', 'Pulso brillante', 1, 11, 100, 0, 'damage', 'presion', 'Ataque luminoso fiable.'),
    defineMove('Luz', 'renewing_ray', 'Rayo renovador', 5, 23, 100, 18, 'heal', 'recuperacion', 'Recupera PV con energía luminosa.'),
    defineMove('Luz', 'halo_guard', 'Halo protector', 3, 0, 100, 11, 'guard', 'proteccion', 'Un halo desvía la energía del impacto.'),
    defineMove('Luz', 'dawn_lance', 'Lanza del alba', 7, 18, 98, 14, 'damage', 'presion', 'Un rayo de amanecer atraviesa la sombra.'),
    defineMove('Luz', 'kindle_soul', 'Lumbre del ánimo', 9, 19, 100, 15, 'heal', 'vinculo', 'Una luz amable devuelve el valor.'),
    defineMove('Luz', 'prism_break', 'Prisma quebrado', 11, 22, 94, 16, 'weaken', 'presion', 'Destellos distraen y debilitan al rival.'),
    defineMove('Luz', 'sunlit_aegis', 'Égida solar', 13, 0, 100, 16, 'guard', 'proteccion', 'Una barrera cálida protege de la embestida.'),
    defineMove('Luz', 'mercy_burst', 'Destello compasivo', 15, 25, 100, 20, 'heal', 'recuperacion', 'Una ráfaga luminosa restaura una gran cantidad de PV.'),
    defineMove('Luz', 'judgement_star', 'Estrella justiciera', 17, 29, 88, 21, 'damage', 'presion', 'Una estrella cae con precisión fulminante.'),
    defineMove('Luz', 'daybreak', 'Primer amanecer', 19, 33, 90, 24, 'weaken', 'presion', 'El alba ciega al rival y corta su impulso.'),
    defineMove('Sombra', 'night_claw', 'Garra nocturna', 1, 13, 92, 0, 'damage', 'presion', 'Golpe de sombra con probabilidad crítica alta.'),
    defineMove('Sombra', 'umbral_drain', 'Drenaje umbrío', 5, 18, 92, 15, 'drain', 'recuperacion', 'Roba vitalidad al rival.'),
    defineMove('Sombra', 'dusk_cloak', 'Manto del ocaso', 3, 0, 100, 11, 'guard', 'proteccion', 'Una capa oscura difumina el golpe.'),
    defineMove('Sombra', 'whisper_hex', 'Susurro maldito', 7, 18, 95, 14, 'weaken', 'presion', 'Un susurro inquietante quiebra la concentración.'),
    defineMove('Sombra', 'moonless_pounce', 'Salto sin luna', 9, 21, 93, 15, 'damage', 'proteccion', 'Aparece a la espalda antes de que miren.'),
    defineMove('Sombra', 'shade_mend', 'Descanso en penumbra', 11, 20, 100, 16, 'heal', 'recuperacion', 'La penumbra reconforta y cura.'),
    defineMove('Sombra', 'phantom_bite', 'Mordida fantasma', 13, 25, 90, 18, 'drain', 'recuperacion', 'Un mordisco espectral roba fuerza vital.'),
    defineMove('Sombra', 'eclipse_snare', 'Trampa de eclipse', 15, 27, 88, 20, 'weaken', 'proteccion', 'La sombra inmoviliza y debilita al enemigo.'),
    defineMove('Sombra', 'blackout_guard', 'Velo abisal', 17, 0, 100, 20, 'guard', 'proteccion', 'La oscuridad absorbe el siguiente ataque.'),
    defineMove('Sombra', 'umbra_surge', 'Oleada umbría', 19, 34, 84, 24, 'damage', 'presion', 'Una ola de noche golpea desde todos lados.'),
    defineMove('Tierra', 'pebble_bash', 'Golpe de guijarro', 1, 13, 94, 0, 'damage', 'presion', 'Ataque de tierra contundente.'),
    defineMove('Tierra', 'stone_wall', 'Muro de piedra', 5, 0, 100, 14, 'guard', 'proteccion', 'Levanta una defensa reforzada.'),
    defineMove('Tierra', 'rooted_stance', 'Postura arraigada', 3, 15, 100, 11, 'guard', 'proteccion', 'Afirmarse al suelo reduce el impacto y contraataca.'),
    defineMove('Tierra', 'quarry_crash', 'Derrumbe de cantera', 7, 19, 91, 14, 'damage', 'presion', 'Fragmentos pesados se desploman sobre el rival.'),
    defineMove('Tierra', 'clay_mend', 'Arcilla balsámica', 9, 19, 100, 15, 'heal', 'recuperacion', 'Arcilla mineral sella heridas.'),
    defineMove('Tierra', 'fault_line', 'Falla sísmica', 11, 23, 89, 17, 'weaken', 'presion', 'Una sacudida abre grietas bajo los pies enemigos.'),
    defineMove('Tierra', 'geode_shell', 'Cáscara de geoda', 13, 0, 100, 16, 'guard', 'proteccion', 'Una coraza cristalina recibe el golpe.'),
    defineMove('Tierra', 'ore_drain', 'Veta absorbente', 15, 25, 91, 19, 'drain', 'recuperacion', 'Extrae energía de los minerales cercanos.'),
    defineMove('Tierra', 'mountain_mend', 'Aliento de montaña', 17, 25, 100, 20, 'heal', 'recuperacion', 'La calma de la montaña restaura las fuerzas.'),
    defineMove('Tierra', 'continental_break', 'Ruptura continental', 19, 35, 80, 24, 'damage', 'presion', 'Un golpe tectónico abre el campo de batalla.'),
    defineMove('Rayo', 'spark_bolt', 'Chispa eléctrica', 1, 12, 98, 0, 'damage', 'presion', 'Descarga eléctrica rápida.'),
    defineMove('Rayo', 'thunder_lance', 'Lanza de trueno', 5, 25, 82, 19, 'damage', 'presion', 'Gran potencia, pero puede fallar.'),
    defineMove('Rayo', 'static_guard', 'Campo estático', 3, 0, 100, 11, 'guard', 'proteccion', 'La electricidad forma un escudo vibrante.'),
    defineMove('Rayo', 'arc_snare', 'Lazo de arco', 7, 18, 95, 14, 'weaken', 'proteccion', 'Un arco eléctrico entumece al rival.'),
    defineMove('Rayo', 'pulse_drain', 'Pulso conductor', 9, 18, 93, 15, 'drain', 'recuperacion', 'Absorbe corriente y la convierte en vigor.'),
    defineMove('Rayo', 'flash_step', 'Destello veloz', 11, 21, 100, 16, 'damage', 'proteccion', 'Un salto instantáneo termina en un impacto.'),
    defineMove('Rayo', 'storm_mend', 'Lluvia de centellas', 13, 22, 100, 18, 'heal', 'recuperacion', 'Centellas tibias revitalizan a la mascota.'),
    defineMove('Rayo', 'thunderclap', 'Trueno súbito', 15, 28, 88, 20, 'weaken', 'presion', 'Un estallido ensordecedor desordena al rival.'),
    defineMove('Rayo', 'chain_lightning', 'Relámpago en cadena', 17, 30, 86, 22, 'damage', 'presion', 'La descarga salta de un extremo al otro.'),
    defineMove('Rayo', 'stormheart', 'Corazón de tormenta', 19, 35, 84, 24, 'drain', 'recuperacion', 'La tormenta devuelve la energía que consume.'),
    defineMove('Astral', 'stardust', 'Polvo estelar', 1, 12, 98, 0, 'damage', 'busqueda', 'Proyectil astral estable.'),
    defineMove('Astral', 'comet_well', 'Pozo de cometa', 5, 20, 90, 17, 'drain', 'recuperacion', 'Drena energía vital con fuerza astral.'),
    defineMove('Astral', 'orbit_guard', 'Órbita protectora', 3, 0, 100, 11, 'guard', 'proteccion', 'Pequeños astros bloquean el impacto.'),
    defineMove('Astral', 'nebula_mend', 'Nébula serena', 7, 18, 100, 14, 'heal', 'recuperacion', 'Una nebulosa restaura PV y calma el ánimo.'),
    defineMove('Astral', 'fate_thread', 'Hilo del destino', 9, 18, 100, 14, 'weaken', 'busqueda', 'Revela el siguiente movimiento del rival.'),
    defineMove('Astral', 'meteor_skip', 'Salto meteórico', 11, 22, 94, 16, 'damage', 'proteccion', 'Una estela engaña al rival antes del golpe.'),
    defineMove('Astral', 'constellation_call', 'Llamado de constelación', 13, 21, 100, 17, 'heal', 'vinculo', 'Una constelación conocida devuelve esperanza.'),
    defineMove('Astral', 'quasar_burst', 'Estallido de cuásar', 15, 28, 88, 20, 'damage', 'presion', 'Condensa una estrella en un impacto breve.'),
    defineMove('Astral', 'starlit_map', 'Mapa celeste', 17, 0, 100, 19, 'guard', 'busqueda', 'Las estrellas señalan una ruta segura.'),
    defineMove('Astral', 'cosmic_reprise', 'Reprise cósmica', 19, 34, 86, 24, 'drain', 'recuperacion', 'La energía de las estrellas vuelve a su origen.'),
];
export const rpgMoves = [
    defineMove('Neutral', 'quick_tackle', 'Placaje', 1, 10, 100, 0, 'damage', 'presion', 'Ataque fiable, sin coste de energía.'),
    ...elementalMoves,
    defineMove('Neutral', 'reckless_charge', 'Carga temeraria', 4, 27, 84, 19, 'damage', 'presion', 'Ataque muy potente y arriesgado.', 'Atacante'),
    defineMove('Neutral', 'iron_counter', 'Contraataque férreo', 4, 17, 96, 15, 'guard', 'proteccion', 'Golpea y prepara una guardia.', 'Guardián'),
    defineMove('Neutral', 'precision_feint', 'Finta precisa', 4, 19, 100, 14, 'damage', 'busqueda', 'Ataque preciso con crítico mejorado.', 'Explorador'),
    defineMove('Neutral', 'arcane_focus', 'Enfoque arcano', 4, 23, 90, 18, 'weaken', 'presion', 'Daña y debilita el siguiente golpe rival.', 'Místico'),
    defineMove('Neutral', 'mending_song', 'Canto reparador', 4, 29, 100, 21, 'heal', 'vinculo', 'Una gran curación sin atacar.', 'Apoyo'),
];
if (elementalMoves.length !== 100)
    throw new Error(`El catálogo elemental debe contener 100 técnicas; contiene ${elementalMoves.length}.`);
const starterMoveByElement = {
    Fuego: 'flame_flick', Agua: 'bubble_shot', Naturaleza: 'thorn_whip', Viento: 'gust_cut', Hielo: 'snow_shard',
    Luz: 'gleam_pulse', Sombra: 'night_claw', Tierra: 'pebble_bash', Rayo: 'spark_bolt', Astral: 'stardust',
};
export function getRpgMove(moveId) { return rpgMoves.find((move) => move.id === moveId); }
const MOVE_XP_PER_LEVEL = 80;
const MOVE_LEVEL_CAP = 10;
export function getRpgMoveProgress(pet, moveId) {
    const progress = pet.moveProgress?.[moveId];
    const level = Math.max(1, Math.min(MOVE_LEVEL_CAP, Math.floor(progress?.level ?? 1)));
    return { level, xp: Math.max(0, Math.floor(progress?.xp ?? 0)), nextXp: level >= MOVE_LEVEL_CAP ? 0 : MOVE_XP_PER_LEVEL + (level - 1) * 20 };
}
function advanceMoveProgress(progressMap, moveId, amount) {
    const updatedMap = { ...progressMap };
    const current = updatedMap[moveId] ?? { level: 1, xp: 0 };
    let level = Math.max(1, Math.min(MOVE_LEVEL_CAP, Math.floor(current.level)));
    let xp = Math.max(0, Math.floor(current.xp));
    let levels = 0;
    xp += Math.max(0, Math.floor(amount));
    while (level < MOVE_LEVEL_CAP && xp >= MOVE_XP_PER_LEVEL + (level - 1) * 20) {
        xp -= MOVE_XP_PER_LEVEL + (level - 1) * 20;
        level++;
        levels++;
    }
    if (level >= MOVE_LEVEL_CAP)
        xp = 0;
    updatedMap[moveId] = { level, xp };
    return { progressMap: updatedMap, levels, level };
}
function getRpgMoveLevel(progressMap, moveId) {
    return Math.max(1, Math.min(MOVE_LEVEL_CAP, Math.floor(progressMap?.[moveId]?.level ?? 1)));
}
export function getRpgMovePower(pet, move) {
    return move.power + Math.max(0, getRpgMoveProgress(pet, move.id).level - 1) * 2;
}
function gainRpgMoveXp(pet, moveId, amount) {
    if (!pet.equippedMoves.includes(moveId))
        return { pet, levels: 0, level: getRpgMoveProgress(pet, moveId).level };
    const advanced = advanceMoveProgress(pet.moveProgress, moveId, amount);
    return { pet: { ...pet, moveProgress: advanced.progressMap }, levels: advanced.levels, level: advanced.level };
}
export function getLearnableRpgMoves(pet) {
    return rpgMoves.filter((move) => !pet.knownMoves.includes(move.id) && move.minLevel <= pet.level
        && (move.element === 'Neutral' || move.element === pet.element || (move.specialization && move.specialization === pet.specialization)));
}
export async function learnRpgMove(guildId, userId, moveId) {
    guildId = GLOBAL_SCOPE_ID;
    const move = getRpgMove(moveId);
    if (!move)
        return { ok: false, reason: 'locked' };
    const learn = (pet) => {
        if (pet.knownMoves.includes(moveId))
            return { ok: false, reason: 'already_known' };
        if (!getLearnableRpgMoves(pet).some((candidate) => candidate.id === moveId))
            return { ok: false, reason: 'locked' };
        if (pet.movePoints < 1)
            return { ok: false, reason: 'no_points' };
        const updated = { ...pet, knownMoves: [...pet.knownMoves, moveId], equippedMoves: pet.equippedMoves.length < 4 ? [...pet.equippedMoves, moveId] : pet.equippedMoves,
            moveProgress: { ...pet.moveProgress, [moveId]: { level: 1, xp: 0 } }, movePoints: pet.movePoints - 1 };
        return { ok: true, pet: updated, move };
    };
    const at = now();
    if (economyPool)
        return withEconomyTransaction(async (connection) => { const pet = await mysqlPet(connection, guildId, userId, true); if (!pet)
            return { ok: false, reason: 'no_pet' }; const result = learn(pet); if (result.ok)
            await savePetMysql(connection, guildId, userId, result.pet, at); return result; });
    const run = db.transaction(() => { const pet = sqlitePet(guildId, userId); if (!pet)
        return { ok: false, reason: 'no_pet' }; const result = learn(pet); if (result.ok)
        savePetSqlite(guildId, userId, result.pet, at); return result; });
    return run.immediate();
}
export async function equipRpgMoves(guildId, userId, moveIds) {
    guildId = GLOBAL_SCOPE_ID;
    const equip = (pet) => {
        const unique = [...new Set(moveIds)];
        if (unique.length !== Math.min(4, pet.knownMoves.length) || unique.length > 4 || unique.some((id) => !pet.knownMoves.includes(id)))
            return { ok: false, reason: 'invalid_build' };
        return { ok: true, pet: { ...pet, equippedMoves: unique } };
    };
    const at = now();
    if (economyPool)
        return withEconomyTransaction(async (connection) => { const pet = await mysqlPet(connection, guildId, userId, true); if (!pet)
            return { ok: false, reason: 'no_pet' }; const result = equip(pet); if (result.ok)
            await savePetMysql(connection, guildId, userId, result.pet, at); return result; });
    const run = db.transaction(() => { const pet = sqlitePet(guildId, userId); if (!pet)
        return { ok: false, reason: 'no_pet' }; const result = equip(pet); if (result.ok)
        savePetSqlite(guildId, userId, result.pet, at); return result; });
    return run.immediate();
}
export async function trainRpgMove(guildId, userId, moveId) {
    guildId = GLOBAL_SCOPE_ID;
    const move = getRpgMove(moveId);
    if (!move)
        return { ok: false, reason: 'unknown_move' };
    const improve = (pet) => {
        if (!pet.knownMoves.includes(moveId))
            return { ok: false, reason: 'not_known' };
        const requirements = getRpgMoveTrainingRequirements(pet, moveId);
        if (requirements.atCap)
            return { ok: false, reason: 'max_level' };
        if (pet.level < requirements.requiredLevel)
            return { ok: false, reason: 'level_required', requiredLevel: requirements.requiredLevel };
        if (pet.xp < requirements.requiredXp)
            return { ok: false, reason: 'low_xp', requiredXp: requirements.requiredXp };
        const moveProgress = getRpgMoveProgress(pet, moveId);
        return { ok: true, pet: { ...pet, xp: pet.xp - requirements.requiredXp,
                moveProgress: { ...pet.moveProgress, [moveId]: { level: requirements.level + 1, xp: moveProgress.xp } } }, xpSpent: requirements.requiredXp, move };
    };
    const at = now();
    if (economyPool)
        return withEconomyTransaction(async (connection) => {
            const pet = await mysqlPet(connection, guildId, userId, true);
            if (!pet)
                return { ok: false, reason: 'no_pet' };
            const result = improve(pet);
            if (result.ok)
                await savePetMysql(connection, guildId, userId, result.pet, at);
            return result;
        });
    const run = db.transaction(() => {
        const pet = sqlitePet(guildId, userId);
        if (!pet)
            return { ok: false, reason: 'no_pet' };
        const result = improve(pet);
        if (result.ok)
            savePetSqlite(guildId, userId, result.pet, at);
        return result;
    });
    return run.immediate();
}
const rarityWeights = [
    ['Común', 58, 0], ['Poco común', 25, 1], ['Raro', 11, 2], ['Épico', 5, 3], ['Legendario', 1, 4],
];
function rarityWeightsForElement(_element) {
    // Cada huevo usa la misma tabla. El catálogo cubre todas las rarezas para cada elemento.
    return rarityWeights;
}
export function getPetRarityOdds(element) {
    const available = rarityWeightsForElement(element);
    const total = available.reduce((sum, [, weight]) => sum + weight, 0);
    const values = available.map(([rarity, weight]) => ({ rarity, odds: Math.round((weight / total) * 100) }));
    const roundedTotal = values.reduce((sum, entry) => sum + entry.odds, 0);
    if (values.length)
        values[0].odds += 100 - roundedTotal;
    return values;
}
export function getPetRarityCounts(element) {
    return rarityWeights.map(([rarity]) => ({ rarity, count: species.filter((candidate) => candidate.element === element && candidate.rarity === rarity).length }));
}
const rarityRank = { 'Común': 0, 'Poco común': 1, 'Raro': 2, 'Épico': 3, 'Legendario': 4 };
export const RPG_DAILY_XP_CAP = 650;
export const RPG_EXPLORE_COOLDOWN = 4 * 60 * 60;
export const RPG_BATTLE_COOLDOWN = 3 * 60 * 60;
export const RPG_TRAIN_COOLDOWN = 8 * 60 * 60;
export const RPG_TRAIN_COIN_COST = 180;
export const RPG_TRAIN_ENERGY_COST = 15;
export const RPG_TRAIN_HUNGER_COST = 6;
export const RPG_TRAIN_MIN_HUNGER = 8;
export const RPG_TRAIN_XP_BASE = 30;
export const RPG_TRAIN_XP_PER_POINT = 12;
export const RPG_MOVE_TRAIN_XP_BASE = 50;
export const RPG_MOVE_TRAIN_XP_PER_LEVEL = 30;
export const RPG_CARE_COOLDOWN = 6 * 60 * 60;
export const RPG_COIN_REWARD_SCALE = 0.5;
const EXPLORE_COOLDOWN = RPG_EXPLORE_COOLDOWN;
export function getRpgTrainingRequirements(pet, stat) {
    const statIndex = stat === 'strength' ? 0 : stat === 'defense' ? 1 : 2;
    const baseStat = species.find((entry) => entry.name === pet.species)?.base[statIndex] ?? pet[stat];
    const growth = Math.max(0, pet[stat] - baseStat);
    const requiredLevel = Math.max(1, Math.ceil((growth + 1) / 3));
    const requiredXp = RPG_TRAIN_XP_BASE + growth * RPG_TRAIN_XP_PER_POINT;
    const statCap = baseStat + pet.level * 3;
    return { stat, baseStat, growth, requiredLevel, requiredXp, statCap, canTrain: pet.level >= requiredLevel && pet[stat] < statCap && pet.xp >= requiredXp };
}
export function getRpgMoveTrainingRequirements(pet, moveId) {
    const progress = getRpgMoveProgress(pet, moveId);
    const requiredLevel = progress.level + 1;
    const requiredXp = RPG_MOVE_TRAIN_XP_BASE + progress.level * RPG_MOVE_TRAIN_XP_PER_LEVEL;
    return { level: progress.level, requiredLevel, requiredXp, atCap: progress.level >= MOVE_LEVEL_CAP,
        canTrain: progress.level < MOVE_LEVEL_CAP && pet.level >= requiredLevel && pet.xp >= requiredXp };
}
const quests = [
    { id: 'explore', title: 'Cartógrafo', description: 'Completa 1 exploración', target: 1, reward: 40 },
    { id: 'battle', title: 'Guardián', description: 'Gana 1 combate contra un enemigo', target: 1, reward: 50 },
    { id: 'train', title: 'Disciplina', description: 'Entrena a tu mascota 1 vez', target: 1, reward: 30 },
];
function now() { return Math.floor(Date.now() / 1000); }
function utcDate(at = now()) { return new Date(at * 1000).toISOString().slice(0, 10); }
function pick(items) { return items[randomInt(items.length)]; }
function emptyExpeditionMemory() { return { trips: 0, zoneVisits: {}, lastZoneId: null, lastOutcome: null, recentEvents: [], knownFriends: [], knownHazards: [], discoveries: [] }; }
function parseExpeditionMemory(value) {
    const empty = emptyExpeditionMemory();
    try {
        const parsed = JSON.parse(value ?? '{}');
        const outcome = ['tranquila', 'social', 'afortunada', 'peligrosa', 'incompleta', 'fallida'].includes(String(parsed.lastOutcome)) ? parsed.lastOutcome : null;
        const zoneVisits = parsed.zoneVisits && typeof parsed.zoneVisits === 'object' ? Object.fromEntries(Object.entries(parsed.zoneVisits).filter(([key, count]) => typeof key === 'string' && Number.isFinite(count)).map(([key, count]) => [key, Math.max(0, Math.floor(Number(count)))]).slice(-12)) : {};
        const list = (items, limit) => Array.isArray(items) ? [...new Set(items.filter((item) => typeof item === 'string' && item.length > 0))].slice(-limit) : [];
        return { trips: Math.max(0, Math.floor(Number(parsed.trips) || 0)), zoneVisits, lastZoneId: typeof parsed.lastZoneId === 'string' ? parsed.lastZoneId : null,
            lastOutcome: outcome, recentEvents: list(parsed.recentEvents, 12), knownFriends: list(parsed.knownFriends, 30), knownHazards: list(parsed.knownHazards, 30), discoveries: list(parsed.discoveries, 50) };
    }
    catch {
        return empty;
    }
}
function starterMoves(element) {
    const elemental = element === 'Neutral' ? undefined : starterMoveByElement[element];
    return elemental ? ['quick_tackle', elemental] : ['quick_tackle'];
}
function parseMoveList(value) {
    try {
        const parsed = JSON.parse(value ?? '[]');
        return Array.isArray(parsed) ? [...new Set(parsed.filter((id) => typeof id === 'string' && Boolean(getRpgMove(id))))] : [];
    }
    catch {
        return [];
    }
}
function parseKnownMoveData(value) {
    try {
        const parsed = JSON.parse(value ?? '[]');
        if (Array.isArray(parsed))
            return { known: parsed.filter((id) => typeof id === 'string' && Boolean(getRpgMove(id))), progress: {} };
        if (!parsed || typeof parsed !== 'object')
            return { known: [], progress: {} };
        const record = parsed;
        const known = Array.isArray(record.known) ? record.known.filter((id) => typeof id === 'string' && Boolean(getRpgMove(id))) : [];
        const rawProgress = record.progress && typeof record.progress === 'object' ? record.progress : {};
        const progress = {};
        for (const [id, raw] of Object.entries(rawProgress)) {
            if (!raw || typeof raw !== 'object')
                continue;
            const entry = raw;
            progress[id] = { level: Math.max(1, Math.min(MOVE_LEVEL_CAP, Math.floor(Number(entry.level) || 1))), xp: Math.max(0, Math.floor(Number(entry.xp) || 0)) };
        }
        return { known, progress };
    }
    catch {
        return { known: [], progress: {} };
    }
}
function serializeKnownMoveData(pet) {
    return JSON.stringify({ known: pet.knownMoves, progress: pet.moveProgress });
}
function petFromRow(row) {
    if (!row)
        return undefined;
    let equipment = {};
    try {
        equipment = JSON.parse(row.equipment ?? '{}');
    }
    catch {
        equipment = {};
    }
    let expeditionEffects = { safety: 0, luck: 0, haste: 0, bonusXp: 0 };
    try {
        expeditionEffects = { ...expeditionEffects, ...JSON.parse(row.expeditionEffects ?? '{}') };
    }
    catch {
        expeditionEffects = { safety: 0, luck: 0, haste: 0, bonusXp: 0 };
    }
    const expeditionMemory = parseExpeditionMemory(row.expeditionMemory);
    const lineage = species.find((candidate) => candidate.name === row.species);
    const element = row.element === 'Neutral' && lineage ? lineage.element : row.element;
    const specialization = row.specialization === 'Explorador' && lineage ? lineage.specialization : row.specialization;
    const moveData = parseKnownMoveData(row.knownMoves);
    const resolvedKnownMoves = moveData.known.length ? moveData.known : starterMoves(element);
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
        dailyXp: String(row.dailyXpDate ?? '') === utcDate() ? Number(row.dailyXp ?? 0) : 0, dailyXpDate: utcDate(), equipment, expeditionEffects, expeditionMemory,
        knownMoves: resolvedKnownMoves, equippedMoves: equippedMoves.length ? equippedMoves : resolvedKnownMoves.slice(0, 4), moveProgress: moveData.progress,
        movePoints: Number(row.movePoints ?? Math.max(0, level - 1)), freeNameUsed: Boolean(row.freeNameUsed) };
}
function sqlitePet(guildId, userId) {
    const row = db.prepare(`SELECT name, species, rarity, element, specialization, level, xp, strength, defense, agility, hp, max_hp AS maxHp,
    energy, max_energy AS maxEnergy, hunger, affection, needs_updated_at AS needsUpdatedAt, last_care_at AS lastCareAt,
    last_explore_at AS lastExploreAt,last_battle_at AS lastBattleAt,last_train_at AS lastTrainAt,daily_xp AS dailyXp,daily_xp_date AS dailyXpDate, equipment_json AS equipment, expedition_effects_json AS expeditionEffects, expedition_memory_json AS expeditionMemory,
    known_moves_json AS knownMoves,equipped_moves_json AS equippedMoves,move_points AS movePoints,free_name_used AS freeNameUsed,updated_at AS updatedAt
    FROM rpg_pets WHERE guild_id = ? AND user_id = ?`).get(guildId, userId);
    return petFromRow(row);
}
async function mysqlPet(connection, guildId, userId, lock = false) {
    const [rows] = await connection.execute(`SELECT name, species, rarity, element, specialization, level, xp, strength, defense, agility, hp,
    max_hp AS maxHp, energy, max_energy AS maxEnergy, hunger, affection, needs_updated_at AS needsUpdatedAt, last_care_at AS lastCareAt,
    last_explore_at AS lastExploreAt,last_battle_at AS lastBattleAt,last_train_at AS lastTrainAt,daily_xp AS dailyXp,daily_xp_date AS dailyXpDate, equipment_json AS equipment, expedition_effects_json AS expeditionEffects, expedition_memory_json AS expeditionMemory,
    known_moves_json AS knownMoves,equipped_moves_json AS equippedMoves,move_points AS movePoints,free_name_used AS freeNameUsed,updated_at AS updatedAt
    FROM rpg_pets WHERE guild_id = ? AND user_id = ?${lock ? ' FOR UPDATE' : ''}`, [guildId, userId]);
    return petFromRow(rows[0]);
}
function findRarity(element) {
    const weights = rarityWeightsForElement(element);
    const totalWeight = weights.reduce((sum, [, weight]) => sum + weight, 0);
    const roll = randomInt(totalWeight);
    let total = 0;
    for (const entry of weights) {
        total += entry[1];
        if (roll < total)
            return { rarity: entry[0], bonus: entry[2] };
    }
    return { rarity: 'Común', bonus: 0 };
}
function xpNeeded(level) { return 100 + (level - 1) * 45; }
function applyXp(pet, xpGain, enforceDailyCap = true, at = now()) {
    const day = utcDate(at);
    const dailyXp = pet.dailyXpDate === day ? pet.dailyXp : 0;
    const gained = Math.max(0, Math.min(Math.floor(xpGain), enforceDailyCap ? RPG_DAILY_XP_CAP - dailyXp : Math.floor(xpGain)));
    let xp = pet.xp + gained;
    let level = pet.level;
    let strength = pet.strength;
    let defense = pet.defense;
    let agility = pet.agility;
    let maxHp = pet.maxHp;
    let levels = 0;
    while (xp >= xpNeeded(level)) {
        xp -= xpNeeded(level);
        level++;
        levels++;
        strength += 2;
        defense += 2;
        agility += 1;
        maxHp += 8;
    }
    return { levels, gained, pet: { ...pet, level, xp, dailyXp: enforceDailyCap ? dailyXp + gained : dailyXp, dailyXpDate: day, strength, defense, agility, maxHp, hp: Math.min(maxHp, pet.hp + levels * 8), movePoints: pet.movePoints + levels } };
}
async function savePetMysql(connection, guildId, userId, pet, updated = now()) {
    await connection.execute(`UPDATE rpg_pets SET name=?, element=?, specialization=?, level=?, xp=?, strength=?, defense=?, agility=?, hp=?, max_hp=?, energy=?, max_energy=?,
    hunger=?, affection=?, needs_updated_at=?, last_care_at=?, last_explore_at=?,last_battle_at=?,last_train_at=?,daily_xp=?,daily_xp_date=?, equipment_json=?, expedition_effects_json=?,expedition_memory_json=?,known_moves_json=?,equipped_moves_json=?,move_points=?,free_name_used=?,updated_at=? WHERE guild_id=? AND user_id=?`, [pet.name, pet.element, pet.specialization, pet.level, pet.xp, pet.strength, pet.defense, pet.agility, pet.hp, pet.maxHp, pet.energy, pet.maxEnergy,
        pet.hunger, pet.affection, updated, pet.lastCareAt, pet.lastExploreAt, pet.lastBattleAt, pet.lastTrainAt, pet.dailyXp, pet.dailyXpDate, JSON.stringify(pet.equipment), JSON.stringify(pet.expeditionEffects), JSON.stringify(pet.expeditionMemory), serializeKnownMoveData(pet), JSON.stringify(pet.equippedMoves), pet.movePoints, Number(pet.freeNameUsed), updated, guildId, userId]);
}
function savePetSqlite(guildId, userId, pet, updated = now()) {
    db.prepare(`UPDATE rpg_pets SET name=?, element=?, specialization=?, level=?, xp=?, strength=?, defense=?, agility=?, hp=?, max_hp=?, energy=?, max_energy=?,
    hunger=?, affection=?, needs_updated_at=?, last_care_at=?, last_explore_at=?,last_battle_at=?,last_train_at=?,daily_xp=?,daily_xp_date=?, equipment_json=?, expedition_effects_json=?,expedition_memory_json=?,known_moves_json=?,equipped_moves_json=?,move_points=?,free_name_used=?,updated_at=? WHERE guild_id=? AND user_id=?`).run(pet.name, pet.element, pet.specialization, pet.level, pet.xp, pet.strength, pet.defense, pet.agility, pet.hp, pet.maxHp, pet.energy, pet.maxEnergy, pet.hunger, pet.affection, updated, pet.lastCareAt, pet.lastExploreAt, pet.lastBattleAt, pet.lastTrainAt, pet.dailyXp, pet.dailyXpDate, JSON.stringify(pet.equipment), JSON.stringify(pet.expeditionEffects), JSON.stringify(pet.expeditionMemory), serializeKnownMoveData(pet), JSON.stringify(pet.equippedMoves), pet.movePoints, Number(pet.freeNameUsed), updated, guildId, userId);
}
async function changeBalanceMysql(connection, guildId, userId, amount, reason, ref, at = now()) {
    await connection.execute('INSERT IGNORE INTO economy_accounts (guild_id,user_id,balance,created_at,updated_at) VALUES (?,?,?,?,?)', [guildId, userId, ECONOMY_STARTING_BALANCE, at, at]);
    const [rows] = await connection.execute('SELECT balance FROM economy_accounts WHERE guild_id=? AND user_id=? FOR UPDATE', [guildId, userId]);
    const balance = Number(rows[0]?.balance ?? 0);
    if (amount < 0 && balance < -amount)
        return { ok: false, balance };
    await connection.execute('UPDATE economy_accounts SET balance=balance+?,updated_at=? WHERE guild_id=? AND user_id=?', [amount, at, guildId, userId]);
    if (amount)
        await insertLedger(connection, { guildId, userId, amount, reason, reference: ref, createdAt: at });
    return { ok: true, balance: balance + amount };
}
function changeBalanceSqlite(guildId, userId, amount, reason, ref, at = now()) {
    db.prepare('INSERT OR IGNORE INTO economy_accounts (guild_id,user_id,balance,created_at,updated_at) VALUES (?,?,?,?,?)').run(guildId, userId, ECONOMY_STARTING_BALANCE, at, at);
    const account = db.prepare('SELECT balance FROM economy_accounts WHERE guild_id=? AND user_id=?').get(guildId, userId);
    if (amount < 0 && account.balance < -amount)
        return { ok: false, balance: account.balance };
    db.prepare('UPDATE economy_accounts SET balance=balance+?,updated_at=? WHERE guild_id=? AND user_id=?').run(amount, at, guildId, userId);
    if (amount)
        db.prepare('INSERT INTO economy_ledger (guild_id,user_id,amount,reason,reference,created_at) VALUES (?,?,?,?,?,?)').run(guildId, userId, amount, reason, ref, at);
    return { ok: true, balance: account.balance + amount };
}
async function updateQuestMysql(connection, guildId, userId, questId, at = now()) {
    const date = new Date(at * 1000).toISOString().slice(0, 10);
    await connection.execute(`INSERT INTO rpg_quests (guild_id,user_id,quest_date,quest_id,progress,claimed) VALUES (?,?,?,?,1,0)
    ON DUPLICATE KEY UPDATE progress=LEAST(progress+1,1)`, [guildId, userId, date, questId]);
}
function updateQuestSqlite(guildId, userId, questId, at = now()) {
    const date = new Date(at * 1000).toISOString().slice(0, 10);
    db.prepare(`INSERT INTO rpg_quests (guild_id,user_id,quest_date,quest_id,progress,claimed) VALUES (?,?,?, ?,1,0)
    ON CONFLICT(guild_id,user_id,quest_date,quest_id) DO UPDATE SET progress=MIN(progress+1,1)`).run(guildId, userId, date, questId);
}
export async function getRpgPet(guildId, userId) {
    guildId = GLOBAL_SCOPE_ID;
    if (economyPool) {
        const connection = await economyPool.getConnection();
        try {
            return await mysqlPet(connection, guildId, userId);
        }
        finally {
            connection.release();
        }
    }
    return sqlitePet(guildId, userId);
}
export async function renameRpgPet(guildId, userId, requestedName) {
    guildId = GLOBAL_SCOPE_ID;
    const name = requestedName.trim().replace(/\s+/g, ' ');
    if (name.length < 2 || name.length > 24 || /[\r\n@<>`*_~|]/.test(name))
        return { ok: false, reason: 'invalid_name' };
    const at = now();
    const apply = (pet) => pet.freeNameUsed
        ? { ok: false, reason: 'already_used' }
        : { ok: true, pet: { ...pet, name, freeNameUsed: true } };
    if (economyPool)
        return withEconomyTransaction(async (connection) => {
            const pet = await mysqlPet(connection, guildId, userId, true);
            if (!pet)
                return { ok: false, reason: 'no_pet' };
            const result = apply(pet);
            if (result.ok)
                await savePetMysql(connection, guildId, userId, result.pet, at);
            return result;
        });
    const run = db.transaction(() => {
        const pet = sqlitePet(guildId, userId);
        if (!pet)
            return { ok: false, reason: 'no_pet' };
        const result = apply(pet);
        if (result.ok)
            savePetSqlite(guildId, userId, result.pet, at);
        return result;
    });
    return run.immediate();
}
export async function careForRpgPet(guildId, userId) {
    guildId = GLOBAL_SCOPE_ID;
    const at = now();
    const care = (pet) => {
        if (pet.affection >= 100)
            return { ok: false, reason: 'max_affection' };
        const remaining = (pet.lastCareAt ?? 0) + RPG_CARE_COOLDOWN - at;
        if (remaining > 0)
            return { ok: false, reason: 'cooldown', secondsRemaining: remaining };
        const affectionGained = pet.hunger < 30 ? 4 : pet.hunger < 60 ? 6 : 8;
        return { ok: true, affectionGained, pet: { ...pet, affection: Math.min(100, pet.affection + affectionGained), lastCareAt: at } };
    };
    if (economyPool)
        return withEconomyTransaction(async (connection) => {
            const pet = await mysqlPet(connection, guildId, userId, true);
            if (!pet)
                return { ok: false, reason: 'no_pet' };
            const result = care(pet);
            if (result.ok)
                await savePetMysql(connection, guildId, userId, result.pet, at);
            return result;
        });
    const run = db.transaction(() => {
        const pet = sqlitePet(guildId, userId);
        if (!pet)
            return { ok: false, reason: 'no_pet' };
        const result = care(pet);
        if (result.ok)
            savePetSqlite(guildId, userId, result.pet, at);
        return result;
    });
    return run.immediate();
}
export async function adoptRpgPet(guildId, userId, name, element) {
    guildId = GLOBAL_SCOPE_ID;
    const normalizedName = name.trim().replace(/\s+/g, ' ');
    if (normalizedName && (normalizedName.length < 2 || normalizedName.length > 24 || /[\r\n@<>`*_~|]/.test(normalizedName)))
        return { ok: false, reason: 'invalid_name' };
    const rarity = findRarity(element);
    const eligibleSpecies = species.filter((candidate) => candidate.rarity === rarity.rarity && (!element || candidate.element === element));
    const chosen = pick(eligibleSpecies);
    const stats = chosen.base.map((n) => n + randomInt(4) + rarity.bonus);
    const pet = { name: normalizedName || chosen.name, species: chosen.name, rarity: rarity.rarity, element: chosen.element, specialization: chosen.specialization, level: 1, xp: 0,
        strength: stats[0], defense: stats[1], agility: stats[2], hp: 70 + rarity.bonus * 2, maxHp: 70 + rarity.bonus * 2,
        energy: 100, maxEnergy: 100, hunger: 80, affection: 60, needsUpdatedAt: now(), lastCareAt: null, lastExploreAt: null, lastBattleAt: null, lastTrainAt: null, dailyXp: 0, dailyXpDate: utcDate(), equipment: {}, expeditionEffects: { safety: 0, luck: 0, haste: 0, bonusXp: 0 }, expeditionMemory: emptyExpeditionMemory(),
        knownMoves: starterMoves(chosen.element), equippedMoves: starterMoves(chosen.element), moveProgress: {}, movePoints: 0, freeNameUsed: Boolean(normalizedName) };
    const at = now();
    if (economyPool)
        return withEconomyTransaction(async (connection) => {
            const [result] = await connection.execute('INSERT IGNORE INTO rpg_pets (guild_id,user_id,name,species,rarity,element,specialization,level,xp,strength,defense,agility,hp,max_hp,energy,max_energy,last_explore_at,equipment_json,expedition_effects_json,expedition_memory_json,known_moves_json,equipped_moves_json,move_points,free_name_used,created_at,updated_at) VALUES (?,?,?,?,?,?,?,1,0,?,?,?,?,?,100,100,NULL,?,?,?,?,?,0,?,?,?)', [guildId, userId, pet.name, pet.species, pet.rarity, pet.element, pet.specialization, pet.strength, pet.defense, pet.agility, pet.hp, pet.maxHp, '{}', '{}', JSON.stringify(pet.expeditionMemory), serializeKnownMoveData(pet), JSON.stringify(pet.equippedMoves), Number(pet.freeNameUsed), at, at]);
            if (result.affectedRows === 0)
                return { ok: false, reason: 'already_has_pet' };
            return { ok: true, pet };
        });
    const adopt = db.transaction(() => {
        const result = db.prepare(`INSERT OR IGNORE INTO rpg_pets (guild_id,user_id,name,species,rarity,element,specialization,level,xp,strength,defense,agility,hp,max_hp,energy,max_energy,equipment_json,expedition_effects_json,expedition_memory_json,known_moves_json,equipped_moves_json,move_points,free_name_used,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,1,0,?,?,?,?,?,100,100,'{}','{}',?,?,?,0,?,?,?)`).run(guildId, userId, pet.name, pet.species, pet.rarity, pet.element, pet.specialization, pet.strength, pet.defense, pet.agility, pet.hp, pet.maxHp, JSON.stringify(pet.expeditionMemory), serializeKnownMoveData(pet), JSON.stringify(pet.equippedMoves), Number(pet.freeNameUsed), at, at);
        return result.changes ? { ok: true, pet } : { ok: false, reason: 'already_has_pet' };
    });
    return adopt.immediate();
}
export async function adminGrantRpgPet(guildId, userId, speciesName, name = '') {
    guildId = GLOBAL_SCOPE_ID;
    const lineage = getPetSpeciesMetadata(speciesName);
    if (!lineage)
        return { ok: false, reason: 'unknown_species' };
    const normalizedName = name.trim().replace(/\s+/g, ' ');
    if (normalizedName && (normalizedName.length < 2 || normalizedName.length > 24 || /[\r\n@<>`*_~|]/.test(normalizedName)))
        return { ok: false, reason: 'invalid_name' };
    const bonus = rarityWeights.find(([rarity]) => rarity === lineage.rarity)?.[2] ?? 0;
    const stats = lineage.base.map((value) => value + bonus);
    const pet = {
        name: normalizedName || lineage.name, species: lineage.name, rarity: lineage.rarity, element: lineage.element,
        specialization: lineage.specialization, level: 1, xp: 0, strength: stats[0], defense: stats[1], agility: stats[2],
        hp: 70 + bonus * 2, maxHp: 70 + bonus * 2, energy: 100, maxEnergy: 100, hunger: 80, affection: 60, needsUpdatedAt: now(), lastCareAt: null, lastExploreAt: null, lastBattleAt: null, lastTrainAt: null, dailyXp: 0, dailyXpDate: utcDate(),
        equipment: {}, expeditionEffects: { safety: 0, luck: 0, haste: 0, bonusXp: 0 }, expeditionMemory: emptyExpeditionMemory(), knownMoves: starterMoves(lineage.element),
        equippedMoves: starterMoves(lineage.element), moveProgress: {}, movePoints: 0, freeNameUsed: Boolean(normalizedName),
    };
    const at = now();
    if (economyPool)
        return withEconomyTransaction(async (connection) => {
            const [result] = await connection.execute('INSERT IGNORE INTO rpg_pets (guild_id,user_id,name,species,rarity,element,specialization,level,xp,strength,defense,agility,hp,max_hp,energy,max_energy,last_explore_at,equipment_json,expedition_effects_json,expedition_memory_json,known_moves_json,equipped_moves_json,move_points,free_name_used,created_at,updated_at) VALUES (?,?,?,?,?,?,?,1,0,?,?,?,?,?,100,100,NULL,?,?,?,?,?,0,?,?,?)', [guildId, userId, pet.name, pet.species, pet.rarity, pet.element, pet.specialization, pet.strength, pet.defense, pet.agility, pet.hp, pet.maxHp, '{}', '{}', JSON.stringify(pet.expeditionMemory), serializeKnownMoveData(pet), JSON.stringify(pet.equippedMoves), Number(pet.freeNameUsed), at, at]);
            if (result.affectedRows === 0)
                return { ok: false, reason: 'already_has_pet' };
            return { ok: true, pet };
        });
    const adopt = db.transaction(() => {
        const result = db.prepare(`INSERT OR IGNORE INTO rpg_pets (guild_id,user_id,name,species,rarity,element,specialization,level,xp,strength,defense,agility,hp,max_hp,energy,max_energy,equipment_json,expedition_effects_json,expedition_memory_json,known_moves_json,equipped_moves_json,move_points,free_name_used,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,1,0,?,?,?,?,?,100,100,'{}','{}',?,?,?,0,?,?,?)`).run(guildId, userId, pet.name, pet.species, pet.rarity, pet.element, pet.specialization, pet.strength, pet.defense, pet.agility, pet.hp, pet.maxHp, JSON.stringify(pet.expeditionMemory), serializeKnownMoveData(pet), JSON.stringify(pet.equippedMoves), Number(pet.freeNameUsed), at, at);
        return result.changes ? { ok: true, pet } : { ok: false, reason: 'already_has_pet' };
    });
    return adopt.immediate();
}
export async function adminEditRpgPet(guildId, userId, edit) {
    guildId = GLOBAL_SCOPE_ID;
    if (edit.type === 'xp' && (!Number.isInteger(edit.amount) || edit.amount < 1 || edit.amount > 100_000))
        return { ok: false, reason: 'invalid_value' };
    if (edit.type === 'stat' && (!Number.isInteger(edit.amount) || edit.amount === 0 || Math.abs(edit.amount) > 1_000))
        return { ok: false, reason: 'invalid_value' };
    if (edit.type === 'rename' && (edit.name.trim().replace(/\s+/g, ' ').length < 2 || edit.name.trim().replace(/\s+/g, ' ').length > 24 || /[\r\n@<>`*_~|]/.test(edit.name)))
        return { ok: false, reason: 'invalid_value' };
    const change = (pet) => {
        let updated = { ...pet };
        let levels;
        if (edit.type === 'restore') {
            updated.hp = pet.maxHp;
            updated.energy = pet.maxEnergy;
        }
        else if (edit.type === 'heal')
            updated.hp = pet.maxHp;
        else if (edit.type === 'energy')
            updated.energy = pet.maxEnergy;
        else if (edit.type === 'xp') {
            const gained = applyXp(pet, edit.amount, false, at);
            updated = gained.pet;
            levels = gained.levels;
        }
        else if (edit.type === 'stat') {
            if (pet[edit.stat] + edit.amount < 1 || pet[edit.stat] + edit.amount > 10_000)
                return { ok: false, reason: 'invalid_value' };
            updated[edit.stat] = pet[edit.stat] + edit.amount;
        }
        else if (edit.type === 'rename') {
            updated.name = edit.name.trim().replace(/\s+/g, ' ');
            updated.freeNameUsed = true;
        }
        return { ok: true, pet: updated, ...(levels !== undefined ? { levels } : {}) };
    };
    const at = now();
    if (economyPool)
        return withEconomyTransaction(async (connection) => {
            const pet = await mysqlPet(connection, guildId, userId, true);
            if (!pet)
                return { ok: false, reason: 'no_pet' };
            const result = change(pet);
            if (result.ok)
                await savePetMysql(connection, guildId, userId, result.pet, at);
            return result;
        });
    const run = db.transaction(() => {
        const pet = sqlitePet(guildId, userId);
        if (!pet)
            return { ok: false, reason: 'no_pet' };
        const result = change(pet);
        if (result.ok)
            savePetSqlite(guildId, userId, result.pet, at);
        return result;
    });
    return run.immediate();
}
export async function releaseRpgPet(guildId, userId) {
    guildId = GLOBAL_SCOPE_ID;
    if (economyPool)
        return withEconomyTransaction(async (connection) => {
            const [result] = await connection.execute('DELETE FROM rpg_pets WHERE guild_id=? AND user_id=?', [guildId, userId]);
            return Number(result.affectedRows) > 0;
        });
    return db.prepare('DELETE FROM rpg_pets WHERE guild_id=? AND user_id=?').run(guildId, userId).changes > 0;
}
export async function adminRemoveRpgPet(guildId, userId) {
    return releaseRpgPet(guildId, userId);
}
const rollBetween = (range) => range[0] + randomInt(range[1] - range[0] + 1);
const replacePetName = (line, petName) => line.replaceAll('{name}', petName);
const remembered = (memory, value) => memory.includes(value);
function focusForExpedition(kind) {
    if (kind === 'riesgo')
        return 'proteccion';
    if (kind === 'encuentro')
        return 'presion';
    if (kind === 'hallazgo')
        return 'busqueda';
    if (kind === 'social')
        return 'vinculo';
    return 'recuperacion';
}
function expeditionTransition(previous, petName) {
    if (!previous)
        return '';
    if (previous.kind === 'social' && previous.success)
        return `Tras despedirse con una sonrisa de ${previous.title.toLowerCase()}, ${petName} vuelve a internarse entre los senderos.`;
    if (previous.kind === 'hallazgo' && previous.success)
        return `Con lo encontrado en ${previous.title.toLowerCase()} bien guardado, ${petName} sigue adelante sin perder de vista el camino.`;
    if (previous.kind === 'descanso' || previous.kind === 'serena')
        return `Con el respiro de ${previous.title.toLowerCase()}, ${petName} recupera el paso y escucha lo que trae el viento.`;
    if (previous.kind === 'riesgo' && !previous.success)
        return `Aún con el corazón acelerado por ${previous.title.toLowerCase()}, ${petName} avanza con más cuidado.`;
    if (previous.kind === 'encuentro')
        return previous.success
            ? `Dejando atrás ${previous.title.toLowerCase()}, ${petName} no baja la guardia: el bosque sigue lleno de sorpresas.`
            : `Después del susto en ${previous.title.toLowerCase()}, ${petName} toma una ruta más discreta.`;
    return previous.success
        ? `El sendero se abre después de ${previous.title.toLowerCase()} y ${petName} continúa la exploración.`
        : `Sacudiéndose el polvo de ${previous.title.toLowerCase()}, ${petName} busca un paso más seguro.`;
}
function expeditionSkillDialogue(petName, move, kind, succeeded) {
    const lines = {
        damage: [`«${move.name}, abre una ruta. ¡Ahora!»`, `*${petName} libera ${move.name} en un arco preciso; la amenaza retrocede y deja un hueco para cruzar.*`],
        drain: [`«${move.name}, toma solo lo necesario…»`, `*${move.name} absorbe parte del vigor que anima el obstáculo y se lo devuelve a ${petName} como fuerzas para continuar.*`],
        heal: [`«${move.name}, cierra las heridas y acompáñame.»`, `*Un pulso de ${move.name} alivia el cansancio de ${petName}; la respiración se calma y el paso recupera firmeza.*`],
        guard: [`«${move.name}, primero protege el paso.»`, `*${petName} despliega ${move.name} como un escudo; el golpe se desvía y aparece una salida segura.*`],
        weaken: [`«${move.name}, quítale el impulso.»`, `*${move.name} desorienta la amenaza y le roba fuerza al siguiente golpe, abriendo un instante para reaccionar.*`],
    };
    const [quote, action] = lines[move.effect];
    const close = succeeded
        ? kind === 'hallazgo' ? ' Con el camino despejado, puede revisar el lugar sin perder de vista el entorno.' : ' La técnica le da el margen que necesitaba para seguir.'
        : kind === 'riesgo' ? ' El contratiempo alcanza a rozarle, pero la técnica amortigua el golpe y le permite continuar.'
            : ` El obstáculo resiste; la técnica no basta para superarlo y ${petName} debe cambiar de estrategia.`;
    return `**🐾 ${petName}:** ${quote}\n${action}${close}`;
}
function bossDialogue(zone, petName, won, move, damage = 0) {
    const voices = {
        bosque: ['«Este sendero tiene guardián. ¿Vienes a dañarlo?»', '«Solo buscamos pasar; también cuidaremos el bosque.»'],
        cumbres: ['«Nadie cruza mi ventisca sin demostrar firmeza.»', '«No hace falta pelear. ¡Voy a apartarme del hielo!»'],
        ruinas: ['«La última página no se abre para cualquiera.»', '«Entonces leeré el margen y encontraré otra salida.»'],
        dunas: ['«Soy el horizonte que persigues. No podrás atraparme.»', '«No persigo espejismos: solo quiero volver con mi equipo.»'],
        astral: ['«Una chispa mortal no altera el curso de las estrellas.»', '«Quizá no, pero todavía puedo elegir mi rumbo.»'],
    };
    const [boss, pet] = voices[zone.id] ?? ['«¡GRAAAH!»', '«¡No busco problemas!»'];
    const response = won
        ? move ? `«${move.name}, ¡abre una brecha! No queremos lastimarte.»` : pet
        : move ? `«${move.name}, cúbreme mientras busco la salida.»` : `«No quiero pelear. Voy a rodearte.»`;
    const action = won
        ? `*${move ? `Con ${move.name}, ` : ''}${petName} evita una embestida y encuentra una abertura. ${zone.boss.name} retrocede, dejando libre el sendero.*`
        : damage ? `*${zone.boss.name} embiste. ${petName} recibe ${damage} PV de daño, se zafa y se retira antes de que vuelva a atacar.*`
            : `*${move ? `${petName} se protege con ${move.name} y ` : `${petName} `}esquiva la embestida y se retira sin recibir daño.*`;
    return { boss, pet: response, action };
}
function sceneMood(pet) {
    if (pet.hp < pet.maxHp * 0.35)
        return 'herida';
    if (pet.energy < 35)
        return 'agotada';
    if (pet.hunger < 35)
        return 'hambrienta';
    if (pet.affection < 25)
        return 'precavida';
    if (pet.affection >= 78 && pet.energy >= 65)
        return 'animada';
    return 'curiosa';
}
function weightedScene(scenes, pet, zone, mood, alreadyThisTrip) {
    const memory = pet.expeditionMemory;
    const visits = memory.zoneVisits[zone.id] ?? 0;
    const recent = new Set(memory.recentEvents);
    const unused = scenes.filter((candidate) => !alreadyThisTrip.includes(`${zone.id}:${candidate.id}`));
    const adjusted = (unused.length ? unused : scenes).map((candidate) => {
        let weight = candidate.weight;
        if (recent.has(`${zone.id}:${candidate.id}`))
            weight *= 0.14;
        if (candidate.discovery && remembered(memory.discoveries, `${zone.id}:${candidate.discovery}`))
            weight *= 0.34;
        if (candidate.friend && remembered(memory.knownFriends, `${zone.id}:${candidate.friend}`))
            weight *= 1.2;
        if (candidate.hazard && remembered(memory.knownHazards, `${zone.id}:${candidate.hazard}`))
            weight *= 0.72;
        if (candidate.choices[pet.specialization])
            weight *= 1.28;
        if (candidate.calm || candidate.kind === 'social' || candidate.kind === 'descanso') {
            if (mood === 'agotada' || mood === 'hambrienta' || mood === 'herida' || memory.lastOutcome === 'peligrosa' || memory.lastOutcome === 'incompleta')
                weight *= 1.55;
        }
        if (candidate.difficulty >= 2 && (mood === 'agotada' || mood === 'hambrienta' || mood === 'herida' || memory.lastOutcome === 'peligrosa'))
            weight *= 0.62;
        if (visits > 0 && candidate.discovery && remembered(memory.discoveries, `${zone.id}:${candidate.discovery}`))
            weight *= 0.75;
        return { scene: candidate, weight: Math.max(0.1, weight) };
    });
    const total = adjusted.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = Math.random() * total;
    for (const entry of adjusted) {
        roll -= entry.weight;
        if (roll < 0)
            return entry.scene;
    }
    return adjusted.at(-1).scene;
}
function simulateExpedition(pet, zone, at) {
    const memory = parseExpeditionMemory(JSON.stringify(pet.expeditionMemory));
    const scenes = expeditionScenes[zone.id];
    const familiarVisits = memory.zoneVisits[zone.id] ?? 0;
    const targetEvents = 2 + randomInt(zone.danger >= 50 ? 3 : 4);
    const events = [];
    const memoryNotes = [];
    const foundItems = [];
    let moveProgress = { ...pet.moveProgress };
    const moveUseCounts = {};
    let coins = 0;
    let xpGenerated = pet.expeditionEffects.bonusXp;
    let totalMinutes = 12 + randomInt(24);
    let energySpent = 2 + randomInt(4);
    let damageReceived = 0;
    let hungerSpent = 0;
    let hp = pet.hp;
    let energy = pet.energy;
    let hunger = pet.hunger;
    let affection = pet.affection;
    let failedChecks = 0;
    let riskyFailures = 0;
    let socialMoments = 0;
    let madeDiscovery = false;
    let earlyEnd = false;
    let boss;
    let bossItem;
    const newRecent = [];
    const familiarityBonus = Math.min(9, familiarVisits * 1.5) + (memory.lastZoneId === zone.id ? 2 : 0);
    for (let index = 0; index < targetEvents; index++) {
        const currentMoodPet = { ...pet, hp, energy: Math.max(0, pet.energy - energySpent), hunger: Math.max(0, pet.hunger - hungerSpent), affection };
        const mood = sceneMood(currentMoodPet);
        const chosen = weightedScene(scenes, currentMoodPet, zone, mood, newRecent);
        const knownHazard = Boolean(chosen.hazard && remembered(memory.knownHazards, `${zone.id}:${chosen.hazard}`));
        const knownDiscovery = Boolean(chosen.discovery && remembered(memory.discoveries, `${zone.id}:${chosen.discovery}`));
        const knownFriend = Boolean(chosen.friend && remembered(memory.knownFriends, `${zone.id}:${chosen.friend}`));
        const action = pick(chosen.choices[pet.specialization] ?? sceneChoices[pet.specialization]);
        const sceneFocus = focusForExpedition(chosen.kind);
        const expeditionMove = pet.equippedMoves.map(getRpgMove).filter((move) => Boolean(move && energy - energySpent >= 1))
            .sort((a, b) => {
            const aLevel = getRpgMoveProgress({ ...pet, moveProgress }, a.id).level;
            const bLevel = getRpgMoveProgress({ ...pet, moveProgress }, b.id).level;
            const aScore = (a.expeditionFocus === sceneFocus ? 8 : 0) + aLevel * 0.1 - (moveUseCounts[a.id] ?? 0) * 3;
            const bScore = (b.expeditionFocus === sceneFocus ? 8 : 0) + bLevel * 0.1 - (moveUseCounts[b.id] ?? 0) * 3;
            return bScore - aScore;
        })[0];
        const expeditionMoveProgress = expeditionMove ? getRpgMoveProgress({ ...pet, moveProgress }, expeditionMove.id) : undefined;
        const moveFocusMatches = Boolean(expeditionMove && expeditionMove.expeditionFocus === sceneFocus);
        const skillBonus = expeditionMove ? (moveFocusMatches ? 7 + Math.min(4, (expeditionMoveProgress?.level ?? 1) - 1) : 2) : 0;
        if (expeditionMove)
            moveUseCounts[expeditionMove.id] = (moveUseCounts[expeditionMove.id] ?? 0) + 1;
        const openings = chosen.friend && knownFriend ? chosen.opening.slice(1) : chosen.opening.slice(0, chosen.opening.length > 1 ? 1 : undefined);
        const transition = expeditionTransition(events.at(-1), pet.name);
        let opening = replacePetName(pick(openings.length ? openings : chosen.opening), pet.name);
        if (familiarVisits > 0 && index === 0 && randomInt(100) < 40)
            opening = `Esta ruta ya le resulta familiar a ${pet.name}. ${opening}`;
        if (knownHazard && chosen.hazard)
            opening = `Al reconocer ${chosen.hazard.replaceAll('-', ' ')}, ${pet.name} se prepara antes de acercarse. ${opening}`;
        const stat = chosen.skill === 'fuerza' ? pet.strength : chosen.skill === 'defensa' ? pet.defense : chosen.skill === 'agilidad' ? pet.agility : chosen.skill === 'vinculo' ? Math.floor(affection / 7)
            : pet.level * (pet.specialization === 'Místico' ? 2 : 1) + Math.floor((pet.agility + pet.defense) / 4);
        const affinity = pet.element !== 'Neutral' && zoneAffinity[zone.id].includes(pet.element) ? 8 : 0;
        const roleFit = chosen.choices[pet.specialization] ? 7 : 0;
        const moodBonus = mood === 'animada' ? 5 : mood === 'agotada' || mood === 'hambrienta' || mood === 'herida' ? -8 : mood === 'precavida' ? -3 : 1;
        const hungerPenalty = hunger < 35 ? 8 : hunger < 55 ? 4 : 0;
        const affectionBonus = affection >= 75 ? 3 : affection < 25 ? -5 : 0;
        const healthPenalty = hp < pet.maxHp * 0.3 ? 10 : hp < pet.maxHp * 0.55 ? 5 : 0;
        const chance = Math.max(18, Math.min(94, 62 + (stat - 8) * 2 + pet.level * 1.2 + affinity + roleFit + moodBonus + affectionBonus + familiarityBonus + skillBonus
            + (knownHazard ? 8 : 0) + pet.expeditionEffects.safety - chosen.difficulty * 11 - zone.danger * 0.28 - hungerPenalty - healthPenalty));
        let succeeded = randomInt(100) < chance;
        let eventCoins = 0;
        let eventXp = rollBetween(chosen.xp);
        let eventDamage = 0;
        let eventItem;
        let eventTitle = chosen.title;
        let emoji = chosen.emoji;
        let resultLine = replacePetName(pick(succeeded ? chosen.success : chosen.setback), pet.name);
        let bossAppeared = false;
        if (chosen.kind === 'encuentro' && !boss && randomInt(100) < zone.boss.spawnChance) {
            bossAppeared = true;
            const bossPower = pet.strength + Math.floor(pet.defense / 2) + Math.floor(pet.agility / 2) + pet.level * 3 + rarityRank[pet.rarity] * 2 + Math.floor(skillBonus / 2)
                + (pet.specialization === 'Atacante' ? 5 : pet.specialization === 'Guardián' ? 3 : 0) + randomInt(12);
            succeeded = bossPower >= zone.boss.power + randomInt(12);
            boss = { name: zone.boss.name, won: succeeded };
            emoji = zone.boss.emoji;
            eventTitle = `Encuentro con ${zone.boss.name}`;
            resultLine = succeeded ? `Tras un breve forcejeo, ${zone.boss.name} retrocede y deja libre el paso.`
                : `${zone.boss.name} cierra el paso y obliga a ${pet.name} a retirarse.`;
            if (succeeded) {
                eventCoins += Math.floor(rollBetween(zone.boss.reward) * RPG_COIN_REWARD_SCALE);
                eventXp += rollBetween(zone.boss.xp);
                if (randomInt(100) < zone.boss.dropChance)
                    bossItem = pick(zone.boss.drops.map((id) => rpgItems.find((item) => item.id === id)).filter(Boolean));
            }
            else
                eventDamage += Math.max(6, 12 + randomInt(12) - Math.floor(pet.defense / 4));
        }
        else if (!succeeded && chosen.damage)
            eventDamage = Math.max(1, rollBetween(chosen.damage)
                - (pet.specialization === 'Guardián' ? Math.floor(pet.defense / 5) : 0) - Math.floor(pet.expeditionEffects.safety / 20));
        if (!succeeded)
            failedChecks++;
        if (!succeeded && (chosen.kind === 'riesgo' || chosen.kind === 'encuentro'))
            riskyFailures++;
        if (succeeded && chosen.coins) {
            const zoneBase = rollBetween(zone.reward);
            eventCoins += Math.max(1, Math.floor(zoneBase * RPG_COIN_REWARD_SCALE * (chosen.kind === 'social' ? 0.28 : 0.55)));
        }
        const dropChance = Math.max(5, Math.min(82, zone.lootChance + pet.expeditionEffects.luck + (pet.specialization === 'Explorador' ? 8 : 0)
            + (succeeded && expeditionMove?.expeditionFocus === 'busqueda' ? 12 + Math.min(4, (expeditionMoveProgress?.level ?? 1) - 1) : 0)
            + rarityRank[pet.rarity] * 2 + (affection >= 75 ? 4 : affection < 25 ? -5 : 0) - (hunger < 35 ? 8 : 0) - (knownDiscovery ? 18 : 0)));
        if (succeeded && chosen.item && foundItems.length === 0 && randomInt(100) < dropChance)
            eventItem = rollExpeditionDrop(zone);
        if (eventItem)
            foundItems.push(eventItem);
        if (bossItem && foundItems.length < 2)
            foundItems.push(bossItem);
        if (succeeded && chosen.recover)
            hp = Math.min(pet.maxHp, hp + chosen.recover);
        const skillHealing = succeeded && expeditionMove && (expeditionMove.effect === 'heal' || expeditionMove.effect === 'drain')
            ? Math.min(pet.maxHp - hp, 2 + Math.floor(getRpgMovePower({ ...pet, moveProgress }, expeditionMove) * 0.12) + (expeditionMoveProgress?.level ?? 1)) : 0;
        if (skillHealing > 0)
            hp += skillHealing;
        if (succeeded && expeditionMove?.expeditionFocus === 'recuperacion')
            energySpent = Math.max(0, energySpent - 1);
        if (succeeded && expeditionMove?.expeditionFocus === 'vinculo')
            hungerSpent = Math.max(0, hungerSpent - 1);
        if (succeeded && moveFocusMatches && eventCoins > 0 && expeditionMove?.expeditionFocus === 'busqueda')
            eventCoins = Math.ceil(eventCoins * 1.12);
        let skillMitigation = 0;
        if (!succeeded && eventDamage > 0 && expeditionMove) {
            skillMitigation = expeditionMove.effect === 'guard' ? 4 + (expeditionMoveProgress?.level ?? 1) * 2
                : expeditionMove.effect === 'weaken' ? 2 + (expeditionMoveProgress?.level ?? 1) : expeditionMove.expeditionFocus === 'proteccion' ? 2 : 0;
            eventDamage = Math.max(0, eventDamage - skillMitigation);
        }
        let actualEventDamage = 0;
        if (eventDamage > 0) {
            actualEventDamage = Math.min(eventDamage, Math.max(0, hp - 1));
            hp = Math.max(1, hp - eventDamage);
            damageReceived += actualEventDamage;
        }
        if (succeeded && (chosen.kind === 'social' || chosen.kind === 'serena' || chosen.kind === 'descanso'))
            affection = Math.min(100, affection + (chosen.kind === 'social' ? 2 : 1));
        else if (!succeeded && chosen.kind === 'riesgo')
            affection = Math.max(0, affection - 1);
        if (succeeded && chosen.discovery && !knownDiscovery) {
            memory.discoveries.push(`${zone.id}:${chosen.discovery}`);
            madeDiscovery = true;
            memoryNotes.push(`Nuevo lugar: ${chosen.title.toLowerCase()}.`);
        }
        if (chosen.friend) {
            const key = `${zone.id}:${chosen.friend}`;
            if (!remembered(memory.knownFriends, key)) {
                memory.knownFriends.push(key);
                const friendName = { iria: 'Iria', nara: 'Nara', boro: 'Boro', samir: 'Samir', luma: 'Luma', 'pastor-teo': 'Teo', 'medusa-nima': 'Nima' };
                memoryNotes.push(`Conoció a ${friendName[chosen.friend] ?? 'una nueva compañía'}.`);
            }
            socialMoments++;
        }
        if (chosen.hazard) {
            const key = `${zone.id}:${chosen.hazard}`;
            if (!remembered(memory.knownHazards, key)) {
                memory.knownHazards.push(key);
                if (!succeeded)
                    memoryNotes.push(`Aprendió a reconocer ${chosen.hazard.replaceAll('-', ' ')}.`);
            }
        }
        const moveGrowth = expeditionMove ? gainRpgMoveXp({ ...pet, moveProgress }, expeditionMove.id, 8) : undefined;
        if (moveGrowth)
            moveProgress = moveGrowth.pet.moveProgress;
        const skillStory = expeditionMove ? expeditionSkillDialogue(pet.name, expeditionMove, chosen.kind, succeeded) : '';
        const bossStory = bossAppeared && boss ? bossDialogue(zone, pet.name, boss.won, expeditionMove, actualEventDamage) : undefined;
        let detail = bossAppeared
            ? `${transition ? `*${transition}*\n\n` : ''}*Un estruendo corta el recorrido: ${zone.boss.emoji} **${zone.boss.name}** aparece y le cierra el paso.*\n\n**${zone.boss.emoji} ${zone.boss.name}:** ${bossStory.boss}\n\n**🐾 ${pet.name}:** ${bossStory.pet}\n\n${bossStory.action}`
            : `${transition ? `*${transition}*\n\n` : ''}*${opening}*\n\n*${pet.name} ${action}.*\n${resultLine}${skillStory ? `\n\n${skillStory}` : ''}`;
        if (expeditionMove)
            detail += `\n\n✨ **Técnica equipada:** ${expeditionMove.name} · Nv. ${expeditionMoveProgress?.level ?? 1} · +8 XP.`;
        if (skillHealing > 0)
            detail += `\n\n💚 **Recuperación:** ${pet.name} recupera **${skillHealing} PV** gracias a la técnica.`;
        if (skillMitigation > 0)
            detail += `\n\n🛡️ **Protección:** ${expeditionMove?.name} reduce el contratiempo en ${skillMitigation} puntos.`;
        if (moveGrowth?.levels)
            detail += `\n\n🎓 **Mejora:** ${expeditionMove.name} alcanza el nivel ${moveGrowth.level}.`;
        if (actualEventDamage > 0 && !bossAppeared)
            detail += `\n\n💥 **Contratiempo:** recibe **${actualEventDamage} PV de daño** antes de poder continuar.`;
        if (chosen.item && succeeded && !eventItem && !bossAppeared)
            detail += '\n\n🔎 Revisa el lugar, pero no encuentra ningún objeto que pueda llevarse.';
        if (eventCoins) {
            coins += eventCoins;
            if (chosen.coins && succeeded && chosen.coinDetail)
                detail += `\n\n🪙 ${chosen.coinDetail} **(+${eventCoins.toLocaleString('es-MX')} monedas).**`;
            else if (bossAppeared && boss?.won)
                detail += `\n\n🪙 Al revisar el sendero, encuentra **+${eventCoins.toLocaleString('es-MX')} monedas** entre las huellas.`;
        }
        if (eventItem)
            detail += `\n\n🎒 Guarda ${eventItem.emoji} **${eventItem.name}** en la mochila.`;
        if (bossItem)
            detail += `\n\n🎒 El encuentro deja ${bossItem.emoji} **${bossItem.name}**, que guarda para el viaje.`;
        if (chosen.friend && knownFriend && succeeded)
            detail += '\n\nSe reconocen con una sonrisa: ya se habían encontrado antes.';
        if (chosen.discovery && knownDiscovery && succeeded)
            detail += '\n\nEl lugar le resulta familiar por su visita anterior.';
        events.push({ emoji, title: eventTitle, detail, kind: chosen.kind, success: succeeded, important: Boolean(chosen.friend || chosen.discovery || eventItem || bossAppeared || eventDamage) });
        newRecent.push(`${zone.id}:${chosen.id}`);
        const eventMinutes = rollBetween(chosen.duration);
        totalMinutes += eventMinutes;
        eventXp = Math.floor(eventXp * (pet.specialization === 'Místico' ? 1.12 : 1));
        xpGenerated += eventXp;
        energySpent += 2 + Math.floor(eventMinutes / 22) + (expeditionMove ? 1 : 0);
        hungerSpent += Math.max(1, Math.floor(eventMinutes / 30));
        if (eventDamage > 0 && !succeeded && hp <= Math.max(12, Math.floor(pet.maxHp * 0.2)) && index < targetEvents - 1 && randomInt(100) < 62) {
            earlyEnd = true;
            break;
        }
        if (energySpent >= energy && index < targetEvents - 1 && randomInt(100) < 48) {
            earlyEnd = true;
            break;
        }
        if (!succeeded && chosen.difficulty >= 2 && index < targetEvents - 1 && randomInt(100) < 13 + chosen.difficulty * 5) {
            earlyEnd = true;
            break;
        }
    }
    totalMinutes += randomInt(30);
    energy = Math.max(0, energy - Math.min(energy, energySpent));
    hunger = Math.max(0, hunger - Math.min(hunger, Math.min(30, 9 + Math.floor(totalMinutes / 22) + hungerSpent)));
    const damage = Math.max(0, pet.hp - hp);
    const outOfEvents = events.length < targetEvents;
    const outcome = earlyEnd || outOfEvents
        ? events.length === 1 && failedChecks === 1 && !coins && !foundItems.length ? 'fallida' : 'incompleta'
        : riskyFailures >= 2 || damage >= Math.ceil(pet.maxHp * 0.3) ? 'peligrosa'
            : failedChecks === events.length && !socialMoments && !madeDiscovery ? 'fallida'
                : madeDiscovery || coins > 0 || foundItems.length > 0 ? 'afortunada' : socialMoments > 0 ? 'social' : 'tranquila';
    const xpResult = applyXp(pet, xpGenerated, true, at);
    const levelHp = xpResult.pet.maxHp - pet.maxHp;
    hp = Math.min(xpResult.pet.maxHp, hp + levelHp);
    const cooldownHaste = Math.min(60 * 60, pet.expeditionEffects.haste);
    const updatedMemory = { ...memory, trips: memory.trips + 1, zoneVisits: { ...memory.zoneVisits, [zone.id]: familiarVisits + 1 },
        lastZoneId: zone.id, lastOutcome: outcome, recentEvents: [...memory.recentEvents, ...newRecent].slice(-12),
        knownFriends: [...new Set(memory.knownFriends)].slice(-30), knownHazards: [...new Set(memory.knownHazards)].slice(-30), discoveries: [...new Set(memory.discoveries)].slice(-50) };
    if (familiarVisits > 0)
        memoryNotes.push(`Ya conoce ${zone.name}; esa experiencia le ayudó a orientarse.`);
    const updated = { ...xpResult.pet, hp, energy, hunger, affection, moveProgress, needsUpdatedAt: at, lastExploreAt: at - cooldownHaste,
        expeditionEffects: { safety: 0, luck: 0, haste: 0, bonusXp: 0 }, expeditionMemory: updatedMemory };
    const summary = events.map((event) => event.detail).join('\n\n');
    const itemIds = foundItems.map((found) => found.id);
    const item = foundItems[0];
    const finalState = { hp: updated.hp, maxHp: updated.maxHp, energy: updated.energy, maxEnergy: updated.maxEnergy, hunger: updated.hunger, affection: updated.affection };
    const message = `${zone.emoji} ${pet.name} regresó de **${zone.name}** tras ${totalMinutes} min.${coins ? ` Recuperó ${coins} monedas.` : ''}${xpResult.gained ? ` Ganó ${xpResult.gained} XP.` : ''}${item ? ` Hallazgo: ${item.emoji} **${item.name}**.` : ''}${xpResult.levels ? ` ¡Subió ${xpResult.levels} nivel(es)!` : ''}`;
    return { pet: updated, zone, coins, xp: xpResult.gained, damage, damageReceived, item, bossItem, ...(boss ? { boss } : {}), levelUps: xpResult.levels,
        events, summary, outcome, durationMinutes: totalMinutes, itemIds, memoryNotes: [...new Set(memoryNotes)].slice(0, 5), finalState, message };
}
export async function exploreRpg(guildId, userId, zoneId, reference) {
    guildId = GLOBAL_SCOPE_ID;
    const zone = rpgZones.find((candidate) => candidate.id === zoneId);
    if (!zone)
        return { ok: false, reason: 'zone_locked' };
    const at = now();
    const resolve = (pet) => {
        if (pet.level < zone.minLevel)
            return { ok: false, reason: 'zone_locked' };
        const remaining = (pet.lastExploreAt ?? 0) + EXPLORE_COOLDOWN - at;
        if (remaining > 0)
            return { ok: false, reason: 'cooldown', secondsRemaining: remaining };
        if (pet.energy < 20)
            return { ok: false, reason: 'low_energy' };
        if (pet.hunger < 15)
            return { ok: false, reason: 'low_hunger' };
        return { ok: true, ...simulateExpedition(pet, zone, at) };
    };
    if (economyPool)
        return withEconomyTransaction(async (connection) => {
            const pet = await mysqlPet(connection, guildId, userId, true);
            if (!pet)
                return { ok: false, reason: 'no_pet' };
            const result = resolve(pet);
            if (!result.ok)
                return result;
            await savePetMysql(connection, guildId, userId, result.pet, at);
            if (result.coins)
                await changeBalanceMysql(connection, guildId, userId, result.coins, 'rpg_explore', `${reference}:coins`, at);
            for (const itemId of result.itemIds)
                await connection.execute('INSERT INTO rpg_inventory (guild_id,user_id,item_id,quantity) VALUES (?,?,?,1) ON DUPLICATE KEY UPDATE quantity=quantity+1', [guildId, userId, itemId]);
            const payload = { v: 3, summary: result.summary, outcome: result.outcome, durationMinutes: result.durationMinutes, damage: result.damage, damageReceived: result.damageReceived,
                petName: result.pet.name, petSpecies: result.pet.species, boss: result.boss,
                itemIds: result.itemIds, memoryNotes: result.memoryNotes, finalState: result.finalState, events: result.events };
            await connection.execute('INSERT INTO rpg_expedition_logs (id,guild_id,user_id,zone_id,events_json,coins,xp,item_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)', [reference, guildId, userId, zone.id, JSON.stringify(payload), result.coins, result.xp, result.item?.id ?? null, at]);
            await updateQuestMysql(connection, guildId, userId, 'explore', at);
            return result;
        });
    const run = db.transaction(() => {
        const pet = sqlitePet(guildId, userId);
        if (!pet)
            return { ok: false, reason: 'no_pet' };
        const result = resolve(pet);
        if (!result.ok)
            return result;
        savePetSqlite(guildId, userId, result.pet, at);
        if (result.coins)
            changeBalanceSqlite(guildId, userId, result.coins, 'rpg_explore', `${reference}:coins`, at);
        for (const itemId of result.itemIds)
            db.prepare('INSERT INTO rpg_inventory (guild_id,user_id,item_id,quantity) VALUES (?,?,?,1) ON CONFLICT(guild_id,user_id,item_id) DO UPDATE SET quantity=quantity+1').run(guildId, userId, itemId);
        const payload = { v: 3, summary: result.summary, outcome: result.outcome, durationMinutes: result.durationMinutes, damage: result.damage, damageReceived: result.damageReceived,
            petName: result.pet.name, petSpecies: result.pet.species, boss: result.boss,
            itemIds: result.itemIds, memoryNotes: result.memoryNotes, finalState: result.finalState, events: result.events };
        db.prepare('INSERT INTO rpg_expedition_logs (id,guild_id,user_id,zone_id,events_json,coins,xp,item_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
            .run(reference, guildId, userId, zone.id, JSON.stringify(payload), result.coins, result.xp, result.item?.id ?? null, at);
        updateQuestSqlite(guildId, userId, 'explore', at);
        return result;
    });
    return run.immediate();
}
const zoneAffinity = {
    bosque: ['Naturaleza', 'Agua', 'Luz'], cumbres: ['Hielo', 'Viento', 'Rayo'], ruinas: ['Tierra', 'Sombra', 'Fuego'], dunas: ['Tierra', 'Fuego', 'Viento'], astral: ['Astral', 'Luz', 'Viento'],
};
function rollExpeditionDrop(zone) {
    const roll = randomInt(100);
    let total = 0;
    let rarity = 'Común';
    for (const [tier, weight] of zone.lootWeights) {
        total += weight;
        if (roll < total) {
            rarity = tier;
            break;
        }
    }
    const regionalPool = zone.drops.map((id) => rpgItems.find((item) => item.id === id)).filter((item) => Boolean(item && item.rarity === rarity));
    const pool = regionalPool.length ? regionalPool : rpgItems.filter((item) => item.rarity === rarity);
    return pool.length ? pick(pool) : undefined;
}
export async function getExpeditionLogPage(guildId, userId, limit = 5, offset = 0) {
    guildId = GLOBAL_SCOPE_ID;
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(10, Math.floor(limit))) : 5;
    const safeOffset = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0;
    if (economyPool) {
        const connection = await economyPool.getConnection();
        try {
            const [countRows] = await connection.execute('SELECT COUNT(*) AS total FROM rpg_expedition_logs WHERE guild_id=? AND user_id=?', [guildId, userId]);
            const [rows] = await connection.execute('SELECT id,zone_id AS zoneId,events_json AS events,coins,xp,item_id AS itemId,created_at AS createdAt FROM rpg_expedition_logs WHERE guild_id=? AND user_id=? ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?', [guildId, userId, safeLimit, safeOffset]);
            return { logs: rows.map((row) => expeditionLogFromRow(row)).filter((log) => Boolean(log)), total: Number(countRows[0]?.total ?? 0) };
        }
        finally {
            connection.release();
        }
    }
    const totalRow = db.prepare('SELECT COUNT(*) AS total FROM rpg_expedition_logs WHERE guild_id=? AND user_id=?').get(guildId, userId);
    const rows = db.prepare('SELECT id,zone_id AS zoneId,events_json AS events,coins,xp,item_id AS itemId,created_at AS createdAt FROM rpg_expedition_logs WHERE guild_id=? AND user_id=? ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?')
        .all(guildId, userId, safeLimit, safeOffset);
    return { logs: rows.map((row) => expeditionLogFromRow(row)).filter((log) => Boolean(log)), total: Number(totalRow.total) };
}
export async function getLatestExpeditionLog(guildId, userId) {
    return (await getExpeditionLogPage(guildId, userId, 1, 0)).logs[0];
}
function expeditionLogFromRow(row) {
    if (!row)
        return undefined;
    let events = [];
    let payload = {};
    try {
        const parsed = JSON.parse(String(row.events));
        if (Array.isArray(parsed))
            events = parsed;
        else if (parsed && typeof parsed === 'object') {
            payload = parsed;
            events = Array.isArray(payload.events) ? payload.events : [];
        }
    }
    catch {
        events = [];
    }
    const zone = rpgZones.find((candidate) => candidate.id === String(row.zoneId));
    const itemId = row.itemId == null ? null : String(row.itemId);
    const legacySummary = events.map((event) => event.detail).join(' ');
    const validOutcomes = ['tranquila', 'social', 'afortunada', 'peligrosa', 'incompleta', 'fallida'];
    const outcome = validOutcomes.includes(payload.outcome) ? payload.outcome : events.some((event) => event.title.includes('contratiempo') || event.title.includes('Jefe avistado')) ? 'peligrosa'
        : Number(row.coins) > 0 || itemId ? 'afortunada' : 'tranquila';
    const finalState = payload.finalState && typeof payload.finalState === 'object' ? payload.finalState : undefined;
    const damageReceived = Number(payload.damageReceived);
    const bossPayload = payload.boss && typeof payload.boss === 'object' ? payload.boss : undefined;
    return { id: String(row.id), zoneId: String(row.zoneId), zoneName: zone?.name ?? String(row.zoneId), events,
        summary: typeof payload.summary === 'string' ? payload.summary : legacySummary || 'La bitácora de esta salida conserva sus apuntes, aunque la narración antigua era breve.',
        outcome, durationMinutes: Number(payload.durationMinutes) || 0, coins: Number(row.coins), xp: Number(row.xp), damage: Number(payload.damage) || 0,
        itemId, itemIds: Array.isArray(payload.itemIds) ? payload.itemIds.filter((id) => typeof id === 'string') : itemId ? [itemId] : [],
        memoryNotes: Array.isArray(payload.memoryNotes) ? payload.memoryNotes.filter((note) => typeof note === 'string') : [],
        ...(finalState ? { finalState } : {}),
        ...(Number.isFinite(damageReceived) && damageReceived >= 0 ? { damageReceived } : {}),
        ...(typeof payload.petName === 'string' ? { petName: payload.petName } : {}),
        ...(typeof payload.petSpecies === 'string' ? { petSpecies: payload.petSpecies } : {}),
        ...(bossPayload && typeof bossPayload.name === 'string' && typeof bossPayload.won === 'boolean' ? { boss: { name: bossPayload.name, won: bossPayload.won } } : {}),
        createdAt: Number(row.createdAt) };
}
export async function battleRpg(guildId, userId, reference, selectedMoveId) {
    guildId = GLOBAL_SCOPE_ID;
    const enemies = [{ name: 'Slime de bosque', minLevel: 1, power: 8, reward: [20, 35] }, { name: 'Ladrón de ruinas', minLevel: 3, power: 17, reward: [40, 65] }, { name: 'Gólem de obsidiana', minLevel: 6, power: 28, reward: [75, 110] }];
    const at = now();
    const resolve = (pet) => {
        if (pet.hp <= 0)
            return { ok: false, reason: 'knocked_out' };
        const remaining = (pet.lastBattleAt ?? 0) + RPG_BATTLE_COOLDOWN - at;
        if (remaining > 0)
            return { ok: false, reason: 'cooldown', secondsRemaining: remaining };
        if (pet.energy < 10)
            return { ok: false, reason: 'low_energy' };
        const eligible = enemies.filter((candidate) => candidate.minLevel <= pet.level);
        const enemy = eligible[randomInt(eligible.length)];
        const combatMoves = pet.equippedMoves.map(getRpgMove).filter((move) => Boolean(move && move.energy <= pet.energy));
        const selected = selectedMoveId ? getRpgMove(selectedMoveId) : undefined;
        if (selectedMoveId && (!selected || !pet.equippedMoves.includes(selectedMoveId)))
            return { ok: false, reason: 'invalid_move' };
        const chosenMove = selected ?? combatMoves.sort((a, b) => (getRpgMovePower(pet, b) * b.accuracy) - (getRpgMovePower(pet, a) * a.accuracy))[0] ?? getRpgMove('quick_tackle');
        if (chosenMove.energy > pet.energy)
            return { ok: false, reason: 'low_energy' };
        const moveProgress = getRpgMoveProgress(pet, chosenMove.id);
        const movePower = getRpgMovePower(pet, chosenMove);
        const moveHit = randomInt(100) < Math.min(100, chosenMove.accuracy + moveProgress.level - 1);
        const elementalBonus = chosenMove.element === pet.element && pet.specialization === 'Místico' ? 5 : 0;
        const conditionBonus = pet.affection >= 75 ? 3 : 0;
        const hungerPenalty = pet.hunger < 30 ? 5 : pet.hunger < 55 ? 2 : 0;
        const effectBonus = chosenMove.effect === 'weaken' ? 5 : chosenMove.effect === 'guard' ? 3 : chosenMove.effect === 'heal' ? 2 : 0;
        const power = pet.strength + Math.floor(pet.agility / 2) + pet.level * 3 + rarityRank[pet.rarity] * 2 + movePower * 0.65 + elementalBonus + conditionBonus + effectBonus - hungerPenalty + randomInt(12) + (moveHit ? 0 : -movePower);
        const won = power >= enemy.power + randomInt(18);
        const rawDamage = won ? Math.max(1, enemy.power - Math.floor(pet.defense / 3) - randomInt(4)) : 12 + randomInt(18);
        const guard = moveHit && chosenMove.effect === 'guard' ? Math.max(6, Math.floor(movePower * 0.6) + 6) : 0;
        const weaken = moveHit && chosenMove.effect === 'weaken' ? 4 + Math.floor(movePower * 0.2) : 0;
        const damage = Math.max(0, rawDamage - guard - weaken);
        let xp = won ? 35 + randomInt(26) : 15;
        const coins = won ? enemy.reward[0] + randomInt(enemy.reward[1] - enemy.reward[0] + 1) : 0;
        const level = applyXp(pet, xp, true, at);
        xp = level.gained;
        const healing = moveHit ? chosenMove.effect === 'heal' ? Math.max(0, Math.floor(movePower * 0.65)) : chosenMove.effect === 'drain' ? Math.max(0, Math.floor(movePower * 0.2)) : 0 : 0;
        const moveGrowth = gainRpgMoveXp(level.pet, chosenMove.id, 16);
        const updated = { ...moveGrowth.pet, hp: Math.min(level.pet.maxHp, Math.max(0, level.pet.hp - damage + healing)), energy: pet.energy - Math.max(10, chosenMove.energy),
            hunger: Math.max(0, pet.hunger - 7), affection: Math.min(100, pet.affection + (won ? 1 : 0)), needsUpdatedAt: at, lastBattleAt: at };
        return { ok: true, pet: updated, won, enemy: enemy.name, coins, xp, damage, levelUps: level.levels,
            message: `${won ? '🏆 Victoria' : '💫 Retirada'} contra **${enemy.name}**. ${updated.name} usó **${chosenMove.name} (Nv. ${moveProgress.level})**${moveHit ? '' : ', pero falló'} y ganó **${xp} XP**; recibió **${damage} de daño**.${healing ? ` Recuperó ${healing} PV.` : ''}${guard || weaken ? ` Su técnica redujo ${guard + weaken} el daño recibido.` : ''}${moveGrowth.levels ? ` ¡${chosenMove.name} subió a nivel ${moveGrowth.level}!` : ''}${coins ? ` Botín: **${coins} monedas**.` : ''}${level.levels ? ` ¡Subió ${level.levels} nivel(es) y obtuvo ${level.levels} punto(s) de aprendizaje!` : ''}${updated.hp === 0 ? ' Quedó debilitada; usa polvo de renacer.' : ''}` };
    };
    if (economyPool)
        return withEconomyTransaction(async (connection) => { const pet = await mysqlPet(connection, guildId, userId, true); if (!pet)
            return { ok: false, reason: 'no_pet' }; const result = resolve(pet); if (!result.ok)
            return result; await savePetMysql(connection, guildId, userId, result.pet, at); if (result.coins)
            await changeBalanceMysql(connection, guildId, userId, result.coins, 'rpg_battle', `${reference}:coins`, at); if (result.won)
            await updateQuestMysql(connection, guildId, userId, 'battle', at); return result; });
    const run = db.transaction(() => { const pet = sqlitePet(guildId, userId); if (!pet)
        return { ok: false, reason: 'no_pet' }; const result = resolve(pet); if (!result.ok)
        return result; savePetSqlite(guildId, userId, result.pet, at); if (result.coins)
        changeBalanceSqlite(guildId, userId, result.coins, 'rpg_battle', `${reference}:coins`, at); if (result.won)
        updateQuestSqlite(guildId, userId, 'battle', at); return result; });
    return run.immediate();
}
export async function trainRpgPet(guildId, userId, stat, reference) {
    guildId = GLOBAL_SCOPE_ID;
    const at = now();
    const check = (pet) => {
        const requirements = getRpgTrainingRequirements(pet, stat);
        if (pet[stat] >= requirements.statCap)
            return { ok: false, reason: 'stat_cap', statCap: requirements.statCap };
        if (pet.level < requirements.requiredLevel)
            return { ok: false, reason: 'level_required', requiredLevel: requirements.requiredLevel };
        if (pet.xp < requirements.requiredXp)
            return { ok: false, reason: 'low_xp', requiredXp: requirements.requiredXp };
        if (pet.energy < RPG_TRAIN_ENERGY_COST)
            return { ok: false, reason: 'low_energy' };
        if (pet.hunger < RPG_TRAIN_MIN_HUNGER)
            return { ok: false, reason: 'low_hunger' };
        return { ok: true, requirements };
    };
    const levelPet = (pet, xpCost) => ({ ...pet, [stat]: pet[stat] + 1, xp: pet.xp - xpCost,
        energy: pet.energy - RPG_TRAIN_ENERGY_COST, hunger: Math.max(0, pet.hunger - RPG_TRAIN_HUNGER_COST), needsUpdatedAt: at, lastTrainAt: at });
    if (economyPool)
        return withEconomyTransaction(async (connection) => {
            const pet = await mysqlPet(connection, guildId, userId, true);
            if (!pet)
                return { ok: false, reason: 'no_pet' };
            const remaining = (pet.lastTrainAt ?? 0) + RPG_TRAIN_COOLDOWN - at;
            if (remaining > 0)
                return { ok: false, reason: 'cooldown', secondsRemaining: remaining };
            const requirement = check(pet);
            if (!requirement.ok)
                return requirement;
            const payment = await changeBalanceMysql(connection, guildId, userId, -RPG_TRAIN_COIN_COST, 'rpg_training', reference, at);
            if (!payment.ok)
                return { ok: false, reason: 'funds' };
            const updated = levelPet(pet, requirement.requirements.requiredXp);
            await savePetMysql(connection, guildId, userId, updated, at);
            await updateQuestMysql(connection, guildId, userId, 'train', at);
            return { ok: true, pet: updated, balance: payment.balance, xpSpent: requirement.requirements.requiredXp };
        });
    const run = db.transaction(() => {
        const pet = sqlitePet(guildId, userId);
        if (!pet)
            return { ok: false, reason: 'no_pet' };
        const remaining = (pet.lastTrainAt ?? 0) + RPG_TRAIN_COOLDOWN - at;
        if (remaining > 0)
            return { ok: false, reason: 'cooldown', secondsRemaining: remaining };
        const requirement = check(pet);
        if (!requirement.ok)
            return requirement;
        const payment = changeBalanceSqlite(guildId, userId, -RPG_TRAIN_COIN_COST, 'rpg_training', reference, at);
        if (!payment.ok)
            return { ok: false, reason: 'funds' };
        const updated = levelPet(pet, requirement.requirements.requiredXp);
        savePetSqlite(guildId, userId, updated, at);
        updateQuestSqlite(guildId, userId, 'train', at);
        return { ok: true, pet: updated, balance: payment.balance, xpSpent: requirement.requirements.requiredXp };
    });
    return run.immediate();
}
export async function buyRpgItem(guildId, userId, itemId, reference) {
    guildId = GLOBAL_SCOPE_ID;
    const item = rpgItems.find((candidate) => candidate.id === itemId);
    if (!item)
        return { ok: false, reason: 'invalid_item' };
    const at = now();
    const categorySize = rpgItems.filter((candidate) => candidate.category === item.category).length;
    const quote = await getProductPriceQuote({ kind: 'rpg', id: itemId, category: item.category, basePrice: item.cost, categorySize });
    if (economyPool)
        return withEconomyTransaction(async (connection) => { const payment = await changeBalanceMysql(connection, guildId, userId, -quote.price, `rpg_shop:${itemId}`, `${reference}:coins`, at); if (!payment.ok)
            return { ok: false, reason: 'funds' }; await connection.execute('INSERT INTO rpg_inventory (guild_id,user_id,item_id,quantity) VALUES (?,?,?,1) ON DUPLICATE KEY UPDATE quantity=quantity+1', [guildId, userId, itemId]); const [rows] = await connection.execute('SELECT quantity FROM rpg_inventory WHERE guild_id=? AND user_id=? AND item_id=?', [guildId, userId, itemId]); await recordProductSaleMysql(connection, { userId, kind: 'rpg', id: itemId, category: item.category, quantity: 1, unitPrice: quote.price, reference: `${reference}:coins`, soldAt: at }); return { ok: true, balance: payment.balance, quantity: Number(rows[0]?.quantity ?? 1), price: quote.price }; });
    const run = db.transaction(() => { const payment = changeBalanceSqlite(guildId, userId, -quote.price, `rpg_shop:${itemId}`, `${reference}:coins`, at); if (!payment.ok)
        return { ok: false, reason: 'funds' }; db.prepare('INSERT INTO rpg_inventory (guild_id,user_id,item_id,quantity) VALUES (?,?,?,1) ON CONFLICT(guild_id,user_id,item_id) DO UPDATE SET quantity=quantity+1').run(guildId, userId, itemId); recordProductSaleSqlite({ userId, kind: 'rpg', id: itemId, category: item.category, quantity: 1, unitPrice: quote.price, reference: `${reference}:coins`, soldAt: at }); const inv = db.prepare('SELECT quantity FROM rpg_inventory WHERE guild_id=? AND user_id=? AND item_id=?').get(guildId, userId, itemId); return { ok: true, balance: payment.balance, quantity: inv.quantity, price: quote.price }; });
    return run.immediate();
}
export async function useRpgItem(guildId, userId, itemId, _reference) {
    guildId = GLOBAL_SCOPE_ID;
    const item = rpgItems.find((candidate) => candidate.id === itemId);
    const at = now();
    if (!item)
        return { ok: false, reason: 'missing_item' };
    const applyItem = (pet) => {
        let updated = { ...pet, equipment: { ...pet.equipment }, expeditionEffects: { ...pet.expeditionEffects } };
        let message = '';
        if (item.effect === 'heal') {
            if (pet.hp >= pet.maxHp)
                return undefined;
            updated.hp = Math.min(pet.maxHp, pet.hp + item.power);
            message = `💚 ${pet.name} recuperó ${updated.hp - pet.hp} PV.`;
        }
        else if (item.effect === 'energy') {
            if (pet.energy >= pet.maxEnergy)
                return undefined;
            updated.energy = Math.min(pet.maxEnergy, pet.energy + item.power);
            message = `⚡ ${pet.name} recuperó ${updated.energy - pet.energy} de energía.`;
        }
        else if (item.effect === 'snack') {
            if (!item.food) {
                const satiety = Math.min(45, 20 + item.power);
                if (pet.hp >= pet.maxHp && pet.energy >= pet.maxEnergy && pet.hunger >= 100)
                    return undefined;
                updated.hp = Math.min(pet.maxHp, pet.hp + item.power);
                updated.energy = Math.min(pet.maxEnergy, pet.energy + item.power);
                updated.hunger = Math.min(100, pet.hunger + satiety);
                const affectionGain = pet.hunger < 35 ? 4 : pet.hunger < 60 ? 2 : 0;
                updated.affection = Math.min(100, pet.affection + affectionGain);
                updated.needsUpdatedAt = at;
                message = `🫐 ${pet.name} comió **${item.name}** · +${updated.hunger - pet.hunger} saciedad${affectionGain ? ` · +${Math.min(affectionGain, 100 - pet.affection)} cariño` : ''}.`;
            }
            else {
                const food = item.food;
                const affinityMatch = pet.element === food.element;
                const scale = affinityMatch ? 1.2 : 1;
                const hpGain = Math.ceil(food.hp * scale);
                const energyGain = Math.ceil(food.energy * scale);
                const hungerGain = Math.ceil(food.hunger * scale);
                const affectionGain = Math.ceil(food.affection * scale);
                const bonusUseful = affinityMatch && (food.affinityBonus === 'heal' ? pet.hp < pet.maxHp
                    : food.affinityBonus === 'energy' ? pet.energy < pet.maxEnergy
                        : food.affinityBonus === 'satiety' ? pet.hunger < 100
                            : food.affinityBonus === 'affection' ? pet.affection < 100
                                : food.affinityBonus === 'expedition_safety' ? pet.expeditionEffects.safety < 50
                                    : food.affinityBonus === 'expedition_luck' ? pet.expeditionEffects.luck < 50
                                        : food.affinityBonus === 'expedition_haste' ? pet.expeditionEffects.haste < 60 * 60
                                            : pet.expeditionEffects.bonusXp < 40 && pet.dailyXp < RPG_DAILY_XP_CAP);
                const baseUseful = (hpGain > 0 && pet.hp < pet.maxHp) || (energyGain > 0 && pet.energy < pet.maxEnergy)
                    || (hungerGain > 0 && pet.hunger < 100) || (affectionGain > 0 && pet.affection < 100);
                if (!baseUseful && !bonusUseful)
                    return undefined;
                updated.hp = Math.min(pet.maxHp, pet.hp + hpGain);
                updated.energy = Math.min(pet.maxEnergy, pet.energy + energyGain);
                updated.hunger = Math.min(100, pet.hunger + hungerGain);
                updated.affection = Math.min(100, pet.affection + affectionGain);
                let affinityMessage = '';
                if (affinityMatch) {
                    const power = food.bonusPower;
                    let appliedPower = power;
                    if (food.affinityBonus === 'heal') {
                        const before = updated.hp;
                        updated.hp = Math.min(pet.maxHp, updated.hp + power);
                        appliedPower = updated.hp - before;
                    }
                    else if (food.affinityBonus === 'energy') {
                        const before = updated.energy;
                        updated.energy = Math.min(pet.maxEnergy, updated.energy + power);
                        appliedPower = updated.energy - before;
                    }
                    else if (food.affinityBonus === 'satiety') {
                        const before = updated.hunger;
                        updated.hunger = Math.min(100, updated.hunger + power);
                        appliedPower = updated.hunger - before;
                    }
                    else if (food.affinityBonus === 'affection') {
                        const before = updated.affection;
                        updated.affection = Math.min(100, updated.affection + power);
                        appliedPower = updated.affection - before;
                    }
                    else if (food.affinityBonus === 'expedition_safety') {
                        const before = updated.expeditionEffects.safety;
                        updated.expeditionEffects.safety = Math.min(50, before + power);
                        appliedPower = updated.expeditionEffects.safety - before;
                    }
                    else if (food.affinityBonus === 'expedition_luck') {
                        const before = updated.expeditionEffects.luck;
                        updated.expeditionEffects.luck = Math.min(50, before + power);
                        appliedPower = updated.expeditionEffects.luck - before;
                    }
                    else if (food.affinityBonus === 'expedition_haste') {
                        const before = updated.expeditionEffects.haste;
                        updated.expeditionEffects.haste = Math.min(60 * 60, before + power);
                        appliedPower = updated.expeditionEffects.haste - before;
                    }
                    else {
                        const before = updated.expeditionEffects.bonusXp;
                        updated.expeditionEffects.bonusXp = Math.min(40, before + power);
                        appliedPower = updated.expeditionEffects.bonusXp - before;
                    }
                    if (appliedPower > 0)
                        affinityMessage = ` Afinidad ${food.element}: ${foodAffinityDescription(food.affinityBonus, food.affinityBonus === 'expedition_haste' ? Math.ceil(appliedPower / 60) : appliedPower)}.`;
                }
                updated.needsUpdatedAt = at;
                message = `${item.emoji} ${pet.name} disfrutó **${item.name}**: +${updated.hunger - pet.hunger} saciedad · +${updated.hp - pet.hp} PV · +${updated.energy - pet.energy} energía${updated.affection > pet.affection ? ` · +${updated.affection - pet.affection} cariño` : ''}.${affinityMessage}`;
            }
        }
        else if (item.effect === 'full_energy') {
            if (pet.energy >= pet.maxEnergy)
                return undefined;
            updated.energy = pet.maxEnergy;
            message = `💠 La energía de ${pet.name} está completa.`;
        }
        else if (item.effect === 'revive') {
            if (pet.hp > 0)
                return undefined;
            updated.hp = item.power;
            message = `✨ ${pet.name} volvió a la aventura con ${item.power} PV.`;
        }
        else if (item.effect === 'xp') {
            const gained = applyXp(pet, item.power, true, at);
            if (!gained.gained)
                return undefined;
            updated = { ...gained.pet, equipment: { ...pet.equipment } };
            message = `📘 ${pet.name} ganó ${gained.gained} XP.${gained.gained < item.power ? ` Límite diario: ${RPG_DAILY_XP_CAP} XP.` : ''}${gained.levels ? ` ¡Subió ${gained.levels} nivel(es)!` : ''}`;
        }
        else if (item.effect.startsWith('stat_')) {
            const stat = item.effect.slice(5);
            updated[stat] += item.power;
            message = `🔮 ${pet.name} mejoró permanentemente ${stat === 'strength' ? 'fuerza' : stat === 'defense' ? 'defensa' : 'agilidad'} en **+${item.power}**.`;
        }
        else if (item.effect.startsWith('equip_')) {
            const slot = item.effect === 'equip_strength' ? 'strength' : item.effect === 'equip_defense' ? 'defense' : item.effect === 'equip_agility' ? 'agility' : 'all';
            const previous = rpgItems.find((candidate) => candidate.id === updated.equipment[slot]);
            updated.equipment[slot] = item.id;
            const upgrade = item.power - (previous?.power ?? 0);
            if (slot === 'strength')
                updated.strength += upgrade;
            if (slot === 'defense')
                updated.defense += upgrade;
            if (slot === 'agility')
                updated.agility += upgrade;
            if (slot === 'all') {
                updated.strength += upgrade;
                updated.defense += upgrade;
                updated.agility += upgrade;
            }
            message = `${item.emoji} ${item.name} equipado en ${pet.name}${previous ? `; sustituyó ${previous.name}` : ''}.`;
        }
        else if (item.effect === 'expedition_safety' || item.effect === 'expedition_luck') {
            const field = item.effect === 'expedition_safety' ? 'safety' : 'luck';
            updated.expeditionEffects[field] = Math.min(50, updated.expeditionEffects[field] + item.power);
            message = `${item.emoji} ${item.name} preparado para la próxima expedición de ${pet.name}.`;
        }
        else if (item.effect === 'expedition_haste' || item.effect === 'battle_haste') {
            const isExpedition = item.effect === 'expedition_haste';
            const lastAt = isExpedition ? pet.lastExploreAt : pet.lastBattleAt;
            const cooldown = isExpedition ? RPG_EXPLORE_COOLDOWN : RPG_BATTLE_COOLDOWN;
            const remaining = (lastAt ?? 0) + cooldown - at;
            if (lastAt === null || remaining <= 0)
                return undefined;
            const reduced = Math.min(remaining, item.power);
            if (isExpedition)
                updated.lastExploreAt = lastAt - reduced;
            else
                updated.lastBattleAt = lastAt - reduced;
            const reducedMinutes = Math.ceil(reduced / 60);
            const remainingMinutes = Math.ceil(Math.max(0, remaining - reduced) / 60);
            message = `⏩ ${item.name} adelantó ${reducedMinutes} min de la espera de ${isExpedition ? 'exploración' : 'combate'}${remainingMinutes ? `; quedan ${remainingMinutes} min` : ' · ya puedes volver'}.`;
        }
        return { pet: updated, message };
    };
    if (economyPool)
        return withEconomyTransaction(async (connection) => {
            const pet = await mysqlPet(connection, guildId, userId, true);
            if (!pet)
                return { ok: false, reason: 'no_pet' };
            const [rows] = await connection.execute('SELECT quantity FROM rpg_inventory WHERE guild_id=? AND user_id=? AND item_id=? FOR UPDATE', [guildId, userId, itemId]);
            if (Number(rows[0]?.quantity ?? 0) < 1)
                return { ok: false, reason: 'missing_item' };
            const result = applyItem(pet);
            if (!result)
                return { ok: false, reason: 'not_needed' };
            await connection.execute('UPDATE rpg_inventory SET quantity=quantity-1 WHERE guild_id=? AND user_id=? AND item_id=?', [guildId, userId, itemId]);
            await connection.execute('DELETE FROM rpg_inventory WHERE guild_id=? AND user_id=? AND item_id=? AND quantity<=0', [guildId, userId, itemId]);
            await savePetMysql(connection, guildId, userId, result.pet, at);
            return { ok: true, pet: result.pet, message: result.message };
        });
    const run = db.transaction(() => {
        const pet = sqlitePet(guildId, userId);
        if (!pet)
            return { ok: false, reason: 'no_pet' };
        const inventory = db.prepare('SELECT quantity FROM rpg_inventory WHERE guild_id=? AND user_id=? AND item_id=?').get(guildId, userId, itemId);
        if (Number(inventory?.quantity ?? 0) < 1)
            return { ok: false, reason: 'missing_item' };
        const result = applyItem(pet);
        if (!result)
            return { ok: false, reason: 'not_needed' };
        db.prepare('UPDATE rpg_inventory SET quantity=quantity-1 WHERE guild_id=? AND user_id=? AND item_id=?').run(guildId, userId, itemId);
        db.prepare('DELETE FROM rpg_inventory WHERE guild_id=? AND user_id=? AND item_id=? AND quantity<=0').run(guildId, userId, itemId);
        savePetSqlite(guildId, userId, result.pet, at);
        return { ok: true, pet: result.pet, message: result.message };
    });
    return run.immediate();
}
export async function getRpgInventory(guildId, userId) {
    guildId = GLOBAL_SCOPE_ID;
    if (economyPool) {
        const connection = await economyPool.getConnection();
        try {
            const [rows] = await connection.execute('SELECT item_id AS itemId,quantity FROM rpg_inventory WHERE guild_id=? AND user_id=? AND quantity>0 ORDER BY item_id', [guildId, userId]);
            return rows.map((row) => ({ itemId: String(row.itemId), quantity: Number(row.quantity) }));
        }
        finally {
            connection.release();
        }
    }
    return db.prepare('SELECT item_id AS itemId,quantity FROM rpg_inventory WHERE guild_id=? AND user_id=? AND quantity>0 ORDER BY item_id').all(guildId, userId).map((item) => ({ ...item, quantity: Number(item.quantity) }));
}
export async function getRpgQuests(guildId, userId) {
    guildId = GLOBAL_SCOPE_ID;
    const date = new Date().toISOString().slice(0, 10);
    if (economyPool) {
        const connection = await economyPool.getConnection();
        try {
            const [rows] = await connection.execute('SELECT quest_id AS id,progress,claimed FROM rpg_quests WHERE guild_id=? AND user_id=? AND quest_date=?', [guildId, userId, date]);
            const map = new Map(rows.map((r) => [String(r.id), r]));
            return quests.map((q) => { const row = map.get(q.id); return { ...q, progress: Number(row?.progress ?? 0), claimed: Boolean(row?.claimed) }; });
        }
        finally {
            connection.release();
        }
    }
    const rows = db.prepare('SELECT quest_id AS id,progress,claimed FROM rpg_quests WHERE guild_id=? AND user_id=? AND quest_date=?').all(guildId, userId, date);
    const map = new Map(rows.map((r) => [r.id, r]));
    return quests.map((q) => { const row = map.get(q.id); return { ...q, progress: Number(row?.progress ?? 0), claimed: Boolean(row?.claimed) }; });
}
export async function claimRpgQuest(guildId, userId, questId, reference) {
    guildId = GLOBAL_SCOPE_ID;
    const quest = quests.find((q) => q.id === questId);
    if (!quest)
        return { ok: false, reason: 'no_quest' };
    const date = new Date().toISOString().slice(0, 10);
    const at = now();
    if (economyPool)
        return withEconomyTransaction(async (connection) => {
            const [rows] = await connection.execute('SELECT progress,claimed FROM rpg_quests WHERE guild_id=? AND user_id=? AND quest_date=? AND quest_id=? FOR UPDATE', [guildId, userId, date, questId]);
            const row = rows[0];
            if (!row || Number(row.progress) < quest.target)
                return { ok: false, reason: 'incomplete' };
            if (Boolean(row.claimed))
                return { ok: false, reason: 'claimed' };
            await connection.execute('UPDATE rpg_quests SET claimed=1 WHERE guild_id=? AND user_id=? AND quest_date=? AND quest_id=?', [guildId, userId, date, questId]);
            const result = await changeBalanceMysql(connection, guildId, userId, quest.reward, 'rpg_quest', reference, at);
            return { ok: true, balance: result.balance };
        });
    const run = db.transaction(() => {
        const row = db.prepare('SELECT progress,claimed FROM rpg_quests WHERE guild_id=? AND user_id=? AND quest_date=? AND quest_id=?').get(guildId, userId, date, questId);
        if (!row || Number(row.progress) < quest.target)
            return { ok: false, reason: 'incomplete' };
        if (Boolean(row.claimed))
            return { ok: false, reason: 'claimed' };
        db.prepare('UPDATE rpg_quests SET claimed=1 WHERE guild_id=? AND user_id=? AND quest_date=? AND quest_id=?').run(guildId, userId, date, questId);
        return { ok: true, balance: changeBalanceSqlite(guildId, userId, quest.reward, 'rpg_quest', reference, at).balance };
    });
    return run.immediate();
}
export async function getRpgLeaderboard(guildId) {
    guildId = GLOBAL_SCOPE_ID;
    if (economyPool) {
        const connection = await economyPool.getConnection();
        try {
            const [rows] = await connection.execute('SELECT user_id AS userId,name,species,rarity,level FROM rpg_pets WHERE guild_id=? ORDER BY level DESC,xp DESC LIMIT 10', [guildId]);
            return rows;
        }
        finally {
            connection.release();
        }
    }
    return db.prepare('SELECT user_id AS userId,name,species,rarity,level FROM rpg_pets WHERE guild_id=? ORDER BY level DESC,xp DESC LIMIT 10').all(guildId);
}
const PVP_CHALLENGE_TTL = 5 * 60;
const PVP_MATCH_TTL = 24 * 60 * 60;
function fighterFromPet(userId, username, pet) {
    const safeName = pet.name.replace(/@/g, '@\u200b').replace(/([\\_*~`|>])/g, '\\$1');
    return { userId, username, petName: safeName, species: pet.species, rarity: pet.rarity, element: pet.element, specialization: pet.specialization, level: pet.level,
        strength: pet.strength, defense: pet.defense, agility: pet.agility, hp: pet.maxHp, maxHp: pet.maxHp, energy: pet.energy, maxEnergy: pet.maxEnergy, equippedMoves: pet.equippedMoves, moveProgress: pet.moveProgress, guarding: false, weakened: false, specialUsed: false };
}
function pvpState(match) { return JSON.stringify({ turnUserId: match.turnUserId, fighters: match.fighters, round: match.round, log: match.log }); }
function pvpMatchFromRow(row) {
    if (!row)
        return undefined;
    try {
        const state = JSON.parse(row.state);
        if (!Array.isArray(state.fighters) || state.fighters.length !== 2)
            return undefined;
        const fighters = state.fighters.map((fighter) => ({ ...fighter, energy: Number(fighter.energy ?? 100), maxEnergy: Number(fighter.maxEnergy ?? 100), equippedMoves: Array.isArray(fighter.equippedMoves) ? fighter.equippedMoves : ['quick_tackle'], moveProgress: fighter.moveProgress && typeof fighter.moveProgress === 'object' ? fighter.moveProgress : {}, weakened: Boolean(fighter.weakened) }));
        return { id: String(row.id), guildId: String(row.guildId), challengerId: String(row.challengerId), defenderId: String(row.defenderId), status: row.status,
            turnUserId: state.turnUserId, winnerId: row.winnerId == null ? null : String(row.winnerId), fighters, round: Number(state.round), log: state.log,
            createdAt: Number(row.createdAt), updatedAt: Number(row.updatedAt), expiresAt: Number(row.expiresAt) };
    }
    catch {
        return undefined;
    }
}
function pvpInsertSqlite(match) {
    db.prepare('INSERT INTO rpg_pvp_matches (id,guild_id,challenger_id,defender_id,status,state_json,winner_id,created_at,updated_at,expires_at) VALUES (?,?,?,?,?,?,NULL,?,?,?)')
        .run(match.id, match.guildId, match.challengerId, match.defenderId, match.status, pvpState(match), match.createdAt, match.updatedAt, match.expiresAt);
}
async function pvpInsertMysql(connection, match) {
    await connection.execute('INSERT INTO rpg_pvp_matches (id,guild_id,challenger_id,defender_id,status,state_json,winner_id,created_at,updated_at,expires_at) VALUES (?,?,?,?,?,?,NULL,?,?,?)', [match.id, match.guildId, match.challengerId, match.defenderId, match.status, pvpState(match), match.createdAt, match.updatedAt, match.expiresAt]);
}
function pvpSaveSqlite(match) {
    db.prepare('UPDATE rpg_pvp_matches SET status=?,state_json=?,winner_id=?,updated_at=?,expires_at=? WHERE id=?')
        .run(match.status, pvpState(match), match.winnerId, match.updatedAt, match.expiresAt, match.id);
}
async function pvpSaveMysql(connection, match) {
    await connection.execute('UPDATE rpg_pvp_matches SET status=?,state_json=?,winner_id=?,updated_at=?,expires_at=? WHERE id=?', [match.status, pvpState(match), match.winnerId, match.updatedAt, match.expiresAt, match.id]);
}
function pvpSelectSqlite(id) {
    const row = db.prepare(`SELECT id,guild_id AS guildId,challenger_id AS challengerId,defender_id AS defenderId,status,state_json AS state,winner_id AS winnerId,created_at AS createdAt,updated_at AS updatedAt,expires_at AS expiresAt FROM rpg_pvp_matches WHERE id=?`).get(id);
    return pvpMatchFromRow(row);
}
async function pvpSelectMysql(connection, id, lock = false) {
    const [rows] = await connection.execute(`SELECT id,guild_id AS guildId,challenger_id AS challengerId,defender_id AS defenderId,status,state_json AS state,winner_id AS winnerId,created_at AS createdAt,updated_at AS updatedAt,expires_at AS expiresAt FROM rpg_pvp_matches WHERE id=?${lock ? ' FOR UPDATE' : ''}`, [id]);
    return pvpMatchFromRow(rows[0]);
}
function pvpFinish(match, winnerId, status, at, line) {
    match.status = status;
    match.winnerId = winnerId;
    match.turnUserId = null;
    match.updatedAt = at;
    match.expiresAt = at;
    match.log = [...match.log, line].slice(-12);
}
function pvpBusySqlite(guildId, userA, userB, at) {
    return Boolean(db.prepare(`SELECT 1 FROM rpg_pvp_matches WHERE guild_id=? AND status IN ('pending','active') AND expires_at>? AND (challenger_id IN (?,?) OR defender_id IN (?,?)) LIMIT 1`)
        .get(guildId, at, userA, userB, userA, userB));
}
async function pvpBusyMysql(connection, guildId, userA, userB, at) {
    const [rows] = await connection.execute(`SELECT 1 FROM rpg_pvp_matches WHERE guild_id=? AND status IN ('pending','active') AND expires_at>? AND (challenger_id IN (?,?) OR defender_id IN (?,?)) LIMIT 1 FOR UPDATE`, [guildId, at, userA, userB, userA, userB]);
    return rows.length > 0;
}
export async function createRpgPvpChallenge(guildId, challengerId, challengerName, defenderId, defenderName, reference) {
    guildId = GLOBAL_SCOPE_ID;
    if (challengerId === defenderId)
        return { ok: false, reason: 'self' };
    const at = now();
    if (economyPool)
        return withEconomyTransaction(async (connection) => {
            const ids = [challengerId, defenderId].sort();
            const pets = new Map();
            for (const id of ids)
                pets.set(id, await mysqlPet(connection, guildId, id, true));
            const challenger = pets.get(challengerId);
            const defender = pets.get(defenderId);
            if (!challenger)
                return { ok: false, reason: 'no_challenger_pet' };
            if (!defender)
                return { ok: false, reason: 'no_defender_pet' };
            if (await pvpBusyMysql(connection, guildId, challengerId, defenderId, at))
                return { ok: false, reason: 'busy' };
            const match = { id: reference, guildId, challengerId, defenderId, status: 'pending', turnUserId: challengerId, winnerId: null,
                fighters: [fighterFromPet(challengerId, challengerName, challenger), fighterFromPet(defenderId, defenderName, defender)], round: 1,
                log: [`<@${challengerId}> retó a <@${defenderId}>. La invitación vence en cinco minutos.`], createdAt: at, updatedAt: at, expiresAt: at + PVP_CHALLENGE_TTL };
            await pvpInsertMysql(connection, match);
            return { ok: true, match };
        });
    const run = db.transaction(() => {
        const challenger = sqlitePet(guildId, challengerId);
        const defender = sqlitePet(guildId, defenderId);
        if (!challenger)
            return { ok: false, reason: 'no_challenger_pet' };
        if (!defender)
            return { ok: false, reason: 'no_defender_pet' };
        if (pvpBusySqlite(guildId, challengerId, defenderId, at))
            return { ok: false, reason: 'busy' };
        const match = { id: reference, guildId, challengerId, defenderId, status: 'pending', turnUserId: challengerId, winnerId: null,
            fighters: [fighterFromPet(challengerId, challengerName, challenger), fighterFromPet(defenderId, defenderName, defender)], round: 1,
            log: [`<@${challengerId}> retó a <@${defenderId}>. La invitación vence en cinco minutos.`], createdAt: at, updatedAt: at, expiresAt: at + PVP_CHALLENGE_TTL };
        pvpInsertSqlite(match);
        return { ok: true, match };
    });
    return run.immediate();
}
export async function respondRpgPvpChallenge(guildId, matchId, userId, accept) {
    guildId = GLOBAL_SCOPE_ID;
    const at = now();
    const resolve = (match) => {
        if (!match || match.guildId !== guildId)
            return { ok: false, reason: 'not_found' };
        if (match.defenderId !== userId)
            return { ok: false, reason: 'not_invited' };
        if (match.status !== 'pending')
            return { ok: false, reason: 'not_pending' };
        if (match.expiresAt <= at) {
            pvpFinish(match, null, 'expired', at, 'El desafío venció sin respuesta.');
            return { ok: false, reason: 'expired', match };
        }
        if (accept) {
            match.status = 'active';
            match.turnUserId = match.challengerId;
            match.updatedAt = at;
            match.expiresAt = at + PVP_MATCH_TTL;
            match.log = [...match.log, `⚔️ <@${userId}> aceptó. Empieza el duelo por turnos.`];
        }
        else
            pvpFinish(match, null, 'declined', at, `🚫 <@${userId}> rechazó el desafío.`);
        return { ok: true, match };
    };
    if (economyPool)
        return withEconomyTransaction(async (connection) => {
            const match = await pvpSelectMysql(connection, matchId, true);
            const result = resolve(match);
            if (match && (result.ok || result.reason === 'expired'))
                await pvpSaveMysql(connection, match);
            if (result.ok || result.reason === 'expired')
                return result;
            return { ok: false, reason: result.reason };
        });
    const run = db.transaction(() => {
        const match = pvpSelectSqlite(matchId);
        const result = resolve(match);
        if (match && (result.ok || result.reason === 'expired'))
            pvpSaveSqlite(match);
        if (result.ok || result.reason === 'expired')
            return result;
        return { ok: false, reason: result.reason };
    });
    return run.immediate();
}
export async function playRpgPvpTurn(guildId, matchId, userId, action, moveId) {
    guildId = GLOBAL_SCOPE_ID;
    const at = now();
    const resolve = (match) => {
        if (!match || match.guildId !== guildId)
            return { ok: false, reason: 'not_found' };
        const actorIndex = match.fighters.findIndex((fighter) => fighter.userId === userId);
        if (actorIndex < 0)
            return { ok: false, reason: 'not_participant' };
        if (match.status !== 'active')
            return { ok: false, reason: 'not_active' };
        if (match.expiresAt <= at) {
            pvpFinish(match, null, 'expired', at, '⌛ El combate terminó por inactividad.');
            return { ok: false, reason: 'expired', match };
        }
        if (match.turnUserId !== userId)
            return { ok: false, reason: 'not_your_turn' };
        const actor = match.fighters[actorIndex];
        const target = match.fighters[1 - actorIndex];
        if (action === 'surrender') {
            pvpFinish(match, target.userId, 'finished', at, `🏳️ ${actor.petName} se rindió. Gana ${target.petName}.`);
            return { ok: true, match, finished: true };
        }
        if (action === 'special' && actor.specialUsed)
            return { ok: false, reason: 'special_used' };
        const chosenMove = action === 'move' ? getRpgMove(moveId ?? '') : undefined;
        if (action === 'move' && (!chosenMove || !actor.equippedMoves.includes(chosenMove.id)))
            return { ok: false, reason: 'move_not_equipped' };
        if (chosenMove && actor.energy < chosenMove.energy)
            return { ok: false, reason: 'low_energy' };
        const moveLevel = chosenMove ? getRpgMoveLevel(actor.moveProgress, chosenMove.id) : 1;
        const movePower = chosenMove ? chosenMove.power + Math.max(0, moveLevel - 1) * 2 : 0;
        const moveGrowth = chosenMove ? advanceMoveProgress(actor.moveProgress ?? {}, chosenMove.id, 16) : undefined;
        if (moveGrowth)
            actor.moveProgress = moveGrowth.progressMap;
        let line;
        if (action === 'guard') {
            actor.guarding = true;
            actor.energy = Math.min(actor.maxEnergy, actor.energy + 10);
            line = `🛡️ ${actor.petName} se defiende, reduce el próximo daño y recupera 10 de energía.`;
        }
        else if (action === 'special' && actor.specialization === 'Apoyo') {
            actor.specialUsed = true;
            const restored = Math.min(actor.maxHp - actor.hp, Math.max(12, Math.floor(actor.maxHp * 0.28)));
            actor.hp += restored;
            actor.guarding = true;
            line = `💚 ${actor.petName} usa su técnica de apoyo: recupera ${restored} PV y prepara una guardia.`;
        }
        else if (chosenMove?.effect === 'heal') {
            actor.energy -= chosenMove.energy;
            const restored = Math.min(actor.maxHp - actor.hp, movePower + (actor.specialization === 'Apoyo' ? 8 : 0));
            actor.hp += restored;
            line = `💚 ${actor.petName} usa **${chosenMove.name} (Nv. ${moveLevel})** y recupera ${restored} PV (${chosenMove.energy} energía).`;
        }
        else if (chosenMove?.effect === 'guard') {
            actor.energy -= chosenMove.energy;
            actor.guarding = true;
            line = `🛡️ ${actor.petName} usa **${chosenMove.name} (Nv. ${moveLevel})** y prepara una guardia reforzada (${chosenMove.energy} energía).`;
        }
        else {
            const special = action === 'special';
            if (special)
                actor.specialUsed = true;
            if (chosenMove)
                actor.energy -= chosenMove.energy;
            const moveAccuracy = chosenMove ? Math.min(100, chosenMove.accuracy + moveLevel - 1 + (actor.specialization === 'Explorador' ? 5 : 0)) : 100;
            if (randomInt(100) >= moveAccuracy) {
                line = `💨 ${actor.petName} intenta **${chosenMove?.name ?? (special ? 'su técnica especial' : 'Placaje')}**, pero ${target.petName} esquiva el ataque.`;
                target.weakened = false;
            }
            else {
                let raw = chosenMove ? movePower + Math.floor(actor.strength * 0.52) : actor.strength + 3 + randomInt(8) + (special ? Math.floor(actor.strength * (actor.specialization === 'Atacante' ? 0.85 : 0.45)) : 0);
                if (actor.specialization === 'Atacante')
                    raw = Math.floor(raw * 1.08);
                if (chosenMove && chosenMove.element === actor.element && chosenMove.element !== 'Neutral' && actor.specialization === 'Místico')
                    raw = Math.floor(raw * 1.15);
                const strongAgainst = { Fuego: ['Naturaleza', 'Hielo'], Agua: ['Fuego', 'Tierra'], Naturaleza: ['Agua', 'Tierra'], Viento: ['Naturaleza'], Hielo: ['Viento'], Luz: ['Sombra'], Sombra: ['Luz', 'Astral'], Tierra: ['Rayo', 'Fuego'], Rayo: ['Agua', 'Viento'], Astral: ['Sombra'] };
                const element = chosenMove?.element ?? actor.element;
                const multiplier = element !== 'Neutral' && strongAgainst[element]?.includes(target.element) ? 1.25 : element !== 'Neutral' && strongAgainst[target.element]?.includes(element) ? 0.8 : 1;
                raw = Math.floor(raw * multiplier);
                const critChance = Math.min(35, 5 + Math.floor(actor.agility / 3) + (special && actor.specialization === 'Explorador' ? 18 : chosenMove?.specialization === 'Explorador' ? 12 : 0));
                const critical = randomInt(100) < critChance;
                if (critical)
                    raw = Math.floor(raw * (special ? 1.7 : 1.45));
                let damage = Math.max(2, raw - Math.floor(target.defense * (special ? 0.35 : 0.48)));
                if (target.weakened) {
                    damage = Math.floor(damage * 0.75);
                    target.weakened = false;
                }
                if (target.guarding) {
                    damage = Math.max(1, Math.floor(damage * 0.4));
                    target.guarding = false;
                }
                target.hp = Math.max(0, target.hp - damage);
                if (chosenMove?.effect === 'drain') {
                    const restored = Math.min(actor.maxHp - actor.hp, Math.max(1, Math.floor(damage * 0.3)));
                    actor.hp += restored;
                }
                if (chosenMove?.effect === 'weaken')
                    target.weakened = true;
                if ((special && actor.specialization === 'Guardián') || chosenMove?.specialization === 'Guardián')
                    actor.guarding = true;
                const skill = chosenMove ? ` usa **${chosenMove.name}** contra` : special ? ` activa su técnica contra` : ' ataca a';
                const effectiveness = multiplier > 1 ? ' · ¡es muy eficaz!' : multiplier < 1 ? ' · no es muy eficaz.' : '';
                line = `${critical ? '💥' : '⚔️'} ${actor.petName}${skill} ${target.petName} y causa **${damage} de daño**${critical ? ' crítico' : ''}${effectiveness}.${chosenMove ? ` ${chosenMove.name} (Nv. ${moveLevel}) gana experiencia.` : ''}${chosenMove?.effect === 'drain' ? ' Absorbe parte del daño.' : ''}${chosenMove?.effect === 'weaken' ? ' Debilita su siguiente ataque.' : ''}${actor.guarding ? ' Queda protegido.' : ''}`;
            }
        }
        if (moveGrowth?.levels)
            line += ` ✨ ¡${chosenMove.name} subió al nivel ${moveGrowth.level}!`;
        match.log = [...match.log, line].slice(-12);
        match.updatedAt = at;
        match.expiresAt = at + PVP_MATCH_TTL;
        if (target.hp <= 0) {
            pvpFinish(match, actor.userId, 'finished', at, `🏆 ${actor.petName} vence el duelo amistoso.`);
            return { ok: true, match, finished: true, moveUsed: chosenMove?.id ?? null };
        }
        match.turnUserId = target.userId;
        if (target.userId === match.challengerId)
            match.round++;
        return { ok: true, match, finished: false, moveUsed: chosenMove?.id ?? null };
    };
    if (economyPool)
        return withEconomyTransaction(async (connection) => {
            const match = await pvpSelectMysql(connection, matchId, true);
            const result = resolve(match);
            if (match && result.ok) {
                if (result.moveUsed) {
                    const actor = result.match.fighters.find((fighter) => fighter.userId === userId);
                    const pet = actor ? await mysqlPet(connection, guildId, userId, true) : undefined;
                    if (actor && pet) {
                        const trained = gainRpgMoveXp(pet, result.moveUsed, 16);
                        actor.moveProgress = trained.pet.moveProgress;
                        if (JSON.stringify(pet.moveProgress) !== JSON.stringify(trained.pet.moveProgress))
                            await connection.execute('UPDATE rpg_pets SET known_moves_json=? WHERE guild_id=? AND user_id=?', [serializeKnownMoveData(trained.pet), guildId, userId]);
                    }
                }
                await pvpSaveMysql(connection, match);
            }
            else if (match && result.reason === 'expired')
                await pvpSaveMysql(connection, match);
            return result.ok ? { ok: true, match: result.match } : result.reason === 'expired' ? result : { ok: false, reason: result.reason };
        });
    const run = db.transaction(() => {
        const match = pvpSelectSqlite(matchId);
        const result = resolve(match);
        if (match && result.ok) {
            if (result.moveUsed) {
                const actor = result.match.fighters.find((fighter) => fighter.userId === userId);
                const pet = actor ? sqlitePet(guildId, userId) : undefined;
                if (actor && pet) {
                    const trained = gainRpgMoveXp(pet, result.moveUsed, 16);
                    actor.moveProgress = trained.pet.moveProgress;
                    if (JSON.stringify(pet.moveProgress) !== JSON.stringify(trained.pet.moveProgress))
                        db.prepare('UPDATE rpg_pets SET known_moves_json=? WHERE guild_id=? AND user_id=?').run(serializeKnownMoveData(trained.pet), guildId, userId);
                }
            }
            pvpSaveSqlite(match);
        }
        else if (match && result.reason === 'expired')
            pvpSaveSqlite(match);
        return result.ok ? { ok: true, match: result.match } : result.reason === 'expired' ? result : { ok: false, reason: result.reason };
    });
    return run.immediate();
}
