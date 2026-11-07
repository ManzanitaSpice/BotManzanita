import { createCanvas, loadImage } from '@napi-rs/canvas';
import { AttachmentBuilder } from 'discord.js';
import { resolve } from 'node:path';
import { getPetRarityCounts, getPetRarityOdds } from '../services/rpg.js';
export const rpgEggOptions = [
    { element: 'Fuego', emoji: '🔥', accent: '#fb6846', backdrop: 'egg-backgrounds/fuego.png', egg: 'huevo-fuego.png', title: 'Huevo de brasa', flavor: 'Criaturas de fuego y ceniza' },
    { element: 'Agua', emoji: '💧', accent: '#4dc4ef', backdrop: 'egg-backgrounds/agua.png', egg: 'huevo-agua.png', title: 'Huevo de marea', flavor: 'Criaturas de ríos y corrientes' },
    { element: 'Naturaleza', emoji: '🌿', accent: '#79d36c', backdrop: 'egg-backgrounds/naturaleza.png', egg: 'huevo-naturaleza.png', title: 'Huevo de brote', flavor: 'Criaturas de bosque y jardín' },
    { element: 'Viento', emoji: '🌬️', accent: '#c2e9f0', backdrop: 'egg-backgrounds/viento.png', egg: 'huevo-viento.png', title: 'Huevo de nube', flavor: 'Criaturas de los cielos' },
    { element: 'Hielo', emoji: '❄️', accent: '#77caff', backdrop: 'egg-backgrounds/hielo.png', egg: 'huevo-hielo.png', title: 'Huevo de escarcha', flavor: 'Criaturas de nieve y aurora' },
    { element: 'Luz', emoji: '☀️', accent: '#ffd76a', backdrop: 'egg-backgrounds/luz.png', egg: 'huevo-luz.png', title: 'Huevo solar', flavor: 'Criaturas de luz y resplandor' },
    { element: 'Sombra', emoji: '🌘', accent: '#a983e8', backdrop: 'egg-backgrounds/sombra.png', egg: 'huevo-sombra.png', title: 'Huevo umbrío', flavor: 'Criaturas nocturnas y misteriosas' },
    { element: 'Tierra', emoji: '🪨', accent: '#d6ae72', backdrop: 'egg-backgrounds/tierra.png', egg: 'huevo-tierra.png', title: 'Huevo de piedra', flavor: 'Criaturas de roca y desierto' },
    { element: 'Rayo', emoji: '⚡', accent: '#ffe25c', backdrop: 'egg-backgrounds/rayo.png', egg: 'huevo-rayo.png', title: 'Huevo de tormenta', flavor: 'Criaturas veloces y eléctricas' },
    { element: 'Astral', emoji: '🌌', accent: '#bd91ff', backdrop: 'egg-backgrounds/astral.png', egg: 'huevo-astral.png', title: 'Huevo astral', flavor: 'Criaturas de estrellas y sueños' },
];
const WIDTH = 1280;
const HEIGHT = 620;
const ASSET_ROOT = resolve(process.cwd(), 'assets', 'rpg');
function slug(value) {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
export function getRpgPetSpritePath(species) {
    return resolve(ASSET_ROOT, 'pets', `${slug(species)}.png`);
}
function drawCover(context, image) {
    const scale = Math.max(WIDTH / image.width, HEIGHT / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    context.drawImage(image, (WIDTH - width) / 2, (HEIGHT - height) / 2, width, height);
}
function drawCardShell(context, accent) {
    const overlay = context.createLinearGradient(0, 0, WIDTH, 0);
    overlay.addColorStop(0, 'rgba(8, 12, 25, .94)');
    overlay.addColorStop(.54, 'rgba(8, 12, 25, .82)');
    overlay.addColorStop(1, 'rgba(8, 12, 25, .16)');
    context.fillStyle = overlay;
    context.fillRect(0, 0, WIDTH, HEIGHT);
    const side = context.createLinearGradient(0, 0, 0, HEIGHT);
    side.addColorStop(0, `${accent}22`);
    side.addColorStop(.52, 'rgba(10,12,20,0)');
    side.addColorStop(1, `${accent}30`);
    context.fillStyle = side;
    context.fillRect(0, 0, WIDTH, HEIGHT);
    context.fillStyle = accent;
    context.fillRect(0, 0, 9, HEIGHT);
    context.strokeStyle = `${accent}99`;
    context.lineWidth = 2;
    context.beginPath();
    context.roundRect(2, 2, WIDTH - 4, HEIGHT - 4, 28);
    context.stroke();
}
function drawPill(context, x, y, width, text, color) {
    context.fillStyle = 'rgba(12, 16, 28, .76)';
    context.beginPath();
    context.roundRect(x, y, width, 42, 20);
    context.fill();
    context.strokeStyle = `${color}88`;
    context.lineWidth = 1;
    context.stroke();
    context.fillStyle = color;
    context.font = '600 17px sans-serif';
    context.fillText(text, x + 16, y + 27);
}
function drawMeter(context, x, y, width, label, value, max, color) {
    const ratio = Math.max(0, Math.min(1, value / Math.max(1, max)));
    context.fillStyle = '#dbe3ef';
    context.font = '600 18px sans-serif';
    context.fillText(label, x, y);
    context.fillStyle = '#f8fafc';
    context.font = '700 18px sans-serif';
    context.textAlign = 'right';
    context.fillText(`${value}/${max}`, x + width, y);
    context.textAlign = 'left';
    context.fillStyle = 'rgba(255,255,255,.14)';
    context.beginPath();
    context.roundRect(x, y + 8, width, 9, 5);
    context.fill();
    if (ratio > 0) {
        context.fillStyle = color;
        context.beginPath();
        context.roundRect(x, y + 8, Math.max(8, width * ratio), 9, 5);
        context.fill();
    }
}
export async function renderEggCard(username, element) {
    const option = rpgEggOptions.find((entry) => entry.element === element) ?? rpgEggOptions[0];
    const canvas = createCanvas(WIDTH, HEIGHT);
    const context = canvas.getContext('2d');
    const [background, egg] = await Promise.all([
        loadImage(resolve(ASSET_ROOT, option.backdrop)),
        loadImage(resolve(ASSET_ROOT, 'eggs', option.egg)),
    ]);
    drawCover(context, background);
    drawCardShell(context, option.accent);
    context.fillStyle = `${option.accent}22`;
    context.beginPath();
    context.ellipse(940, 356, 218, 194, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = 'rgba(0,0,0,.3)';
    context.beginPath();
    context.ellipse(949, 528, 150, 25, 0, 0, Math.PI * 2);
    context.fill();
    context.save();
    context.shadowColor = option.accent;
    context.shadowBlur = 40;
    context.drawImage(egg, 760, 75, 370, 400);
    context.restore();
    context.fillStyle = 'rgba(12,16,27,.82)';
    context.beginPath();
    context.roundRect(40, 38, 550, 545, 24);
    context.fill();
    context.strokeStyle = `${option.accent}44`;
    context.lineWidth = 1;
    context.stroke();
    context.fillStyle = option.accent;
    context.font = '700 17px sans-serif';
    context.fillText('GREMIO DE AVENTUREROS  /  INCUBADORA', 76, 92);
    context.fillStyle = '#f8fafc';
    context.font = '700 43px sans-serif';
    context.fillText(option.title, 76, 158);
    context.fillStyle = '#cbd5e1';
    context.font = '24px sans-serif';
    context.fillText(`Afinidad: ${element}`, 78, 204);
    context.fillStyle = '#94a3b8';
    context.font = '20px sans-serif';
    context.fillText(option.flavor, 78, 244);
    context.fillStyle = '#f8fafc';
    context.font = '600 20px sans-serif';
    context.fillText(`Una criatura aleatoria de elemento ${element}.`, 78, 300);
    context.fillStyle = '#94a3b8';
    context.font = '18px sans-serif';
    const totalSpecies = getPetRarityCounts(element).reduce((sum, entry) => sum + entry.count, 0);
    context.fillText(totalSpecies + ' especies · misma composición en los diez huevos.', 78, 332);
    context.fillStyle = '#94a3b8';
    context.font = '600 16px sans-serif';
    context.fillText('PROBABILIDAD POR RAREZA', 78, 365);
    const rarityColors = { 'Común': '#cbd5e1', 'Poco común': '#65d487', 'Raro': '#69b9ff', 'Épico': '#c29aff', 'Legendario': '#ffc35d' };
    getPetRarityOdds(element).forEach(({ rarity, odds }, index) => drawPill(context, 76 + (index % 2) * 230, 380 + Math.floor(index / 2) * 50, 214, `${rarity} · ${odds}%`, rarityColors[rarity] ?? '#cbd5e1'));
    context.fillStyle = '#cbd5e1';
    context.font = '500 17px sans-serif';
    context.fillText(`Preparado para ${username}`, 78, 555);
    return new AttachmentBuilder(canvas.toBuffer('image/png'), { name: 'rpg-egg-selection.png' });
}
export async function renderPetCard(pet, backgroundName, zone, xpNext) {
    const theme = rpgEggOptions.find((entry) => entry.element === pet.element) ?? rpgEggOptions[0];
    const canvas = createCanvas(WIDTH, HEIGHT);
    const context = canvas.getContext('2d');
    const [background, sprite] = await Promise.all([
        loadImage(resolve(ASSET_ROOT, backgroundName)),
        loadImage(getRpgPetSpritePath(pet.species)),
    ]);
    drawCover(context, background);
    drawCardShell(context, theme.accent);
    context.fillStyle = 'rgba(12,16,27,.82)';
    context.beginPath();
    context.roundRect(40, 38, 585, 545, 24);
    context.fill();
    context.strokeStyle = `${theme.accent}55`;
    context.lineWidth = 1;
    context.stroke();
    context.fillStyle = theme.accent;
    context.font = '700 17px sans-serif';
    context.fillText('FICHA DE COMPAÑERA  /  RPG', 76, 92);
    context.fillStyle = '#f8fafc';
    context.font = '700 43px sans-serif';
    context.fillText(pet.name.slice(0, 22), 76, 151);
    context.fillStyle = '#dbe3ef';
    context.font = '22px sans-serif';
    context.fillText(`${pet.species}  ·  ${pet.rarity}  ·  Nivel ${pet.level}`, 78, 190);
    drawPill(context, 76, 211, 220, `Elemento · ${pet.element}`, theme.accent);
    drawPill(context, 310, 211, 275, `Especialidad · ${pet.specialization}`, '#c9b6ff');
    context.fillStyle = '#dbe3ef';
    context.font = '600 18px sans-serif';
    context.fillText('PROGRESO DE NIVEL', 78, 286);
    context.textAlign = 'right';
    context.fillText(`${pet.xp}/${xpNext} XP`, 585, 286);
    context.textAlign = 'left';
    context.fillStyle = 'rgba(255,255,255,.14)';
    context.beginPath();
    context.roundRect(78, 297, 507, 10, 5);
    context.fill();
    const xpRatio = Math.max(0, Math.min(1, pet.xp / Math.max(1, xpNext)));
    if (xpRatio > 0) {
        context.fillStyle = theme.accent;
        context.beginPath();
        context.roundRect(78, 297, Math.max(8, 507 * xpRatio), 10, 5);
        context.fill();
    }
    context.fillStyle = '#f8fafc';
    context.font = '700 16px sans-serif';
    context.fillText('ATRIBUTOS', 78, 349);
    context.fillStyle = '#cbd5e1';
    context.font = '600 21px sans-serif';
    context.fillText(`⚔  Fuerza       ${pet.strength}`, 80, 391);
    context.fillText(`🛡  Defensa     ${pet.defense}`, 80, 438);
    context.fillText(`💨  Agilidad    ${pet.agility}`, 80, 485);
    context.fillStyle = '#f8fafc';
    context.font = '700 16px sans-serif';
    context.fillText('ESTADO', 335, 349);
    drawMeter(context, 335, 377, 250, '❤️ PV', pet.hp, pet.maxHp, '#43d18d');
    drawMeter(context, 335, 421, 250, '⚡ Energía', pet.energy, pet.maxEnergy, '#f6c453');
    drawMeter(context, 335, 465, 250, '🍖 Saciedad', pet.hunger, 100, '#f4a340');
    drawMeter(context, 335, 509, 250, '🫶 Cariño', pet.affection, 100, '#ed83c4');
    context.fillStyle = 'rgba(4,8,16,.34)';
    context.beginPath();
    context.ellipse(910, 518, 180, 28, 0, 0, Math.PI * 2);
    context.fill();
    context.save();
    context.shadowColor = `${theme.accent}bb`;
    context.shadowBlur = 34;
    context.drawImage(sprite, 650, 72, 490, 490);
    context.restore();
    context.fillStyle = 'rgba(8,12,25,.82)';
    context.beginPath();
    context.roundRect(675, 548, 520, 46, 18);
    context.fill();
    context.fillStyle = '#ffffff';
    context.font = '600 18px sans-serif';
    context.fillText(`${zone.emoji} ${zone.name}  ·  ${zone.difficulty}`, 696, 578);
    return new AttachmentBuilder(canvas.toBuffer('image/png'), { name: 'rpg-pet-card.png' });
}
export async function renderPvpDuelCard(match) {
    const width = 1280;
    const height = 600;
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d');
    const [leftSprite, rightSprite] = await Promise.all([
        loadImage(getRpgPetSpritePath(match.fighters[0].species)),
        loadImage(getRpgPetSpritePath(match.fighters[1].species)),
    ]);
    const rarityColors = { 'Común': '#b8c4d4', 'Poco común': '#65d487', 'Raro': '#69b9ff', 'Épico': '#c29aff', 'Legendario': '#ffc35d' };
    const themes = match.fighters.map((fighter) => rpgEggOptions.find((entry) => entry.element === fighter.element)?.accent ?? '#8b5cf6');
    const background = context.createLinearGradient(0, 0, width, height);
    background.addColorStop(0, '#151a2c');
    background.addColorStop(.52, '#090d18');
    background.addColorStop(1, '#191329');
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);
    context.fillStyle = 'rgba(255,255,255,.025)';
    for (let i = 0; i < 18; i++) {
        const x = (i * 173 + 47) % width;
        const y = (i * 97 + 31) % height;
        context.beginPath();
        context.arc(x, y, i % 3 + 1, 0, Math.PI * 2);
        context.fill();
    }
    const drawFighter = (index, sprite, x) => {
        const fighter = match.fighters[index];
        const accent = themes[index];
        const cardY = 26;
        const cardWidth = 548;
        const cardHeight = 548;
        context.fillStyle = 'rgba(5, 9, 19, .82)';
        context.beginPath();
        context.roundRect(x, cardY, cardWidth, cardHeight, 30);
        context.fill();
        context.strokeStyle = `${accent}bb`;
        context.lineWidth = 3;
        context.beginPath();
        context.roundRect(x + 1.5, cardY + 1.5, cardWidth - 3, cardHeight - 3, 30);
        context.stroke();
        const header = context.createLinearGradient(x, cardY, x + cardWidth, cardY + 100);
        header.addColorStop(0, `${accent}36`);
        header.addColorStop(1, 'rgba(10,14,25,0)');
        context.fillStyle = header;
        context.beginPath();
        context.roundRect(x + 4, cardY + 4, cardWidth - 8, 132, 26);
        context.fill();
        context.fillStyle = accent;
        context.font = '700 16px sans-serif';
        context.fillText(`JUGADOR ${index + 1}  ·  @${fighter.username.slice(0, 22)}`, x + 28, cardY + 37);
        context.fillStyle = '#f8fafc';
        context.font = '700 31px sans-serif';
        context.fillText(fighter.petName.slice(0, 25), x + 28, cardY + 78);
        context.fillStyle = '#cbd5e1';
        context.font = '500 17px sans-serif';
        context.fillText(`${fighter.species}  ·  ${fighter.element}  ·  ${fighter.specialization}`, x + 29, cardY + 108);
        context.fillStyle = `${accent}22`;
        context.beginPath();
        context.ellipse(x + cardWidth / 2, cardY + 290, 175, 165, 0, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = 'rgba(0,0,0,.35)';
        context.beginPath();
        context.ellipse(x + cardWidth / 2, cardY + 430, 130, 18, 0, 0, Math.PI * 2);
        context.fill();
        context.save();
        context.shadowColor = `${accent}bb`;
        context.shadowBlur = 26;
        context.drawImage(sprite, x + 122, cardY + 128, 304, 304);
        context.restore();
        context.fillStyle = rarityColors[fighter.rarity] ?? '#cbd5e1';
        context.font = '700 16px sans-serif';
        context.textAlign = 'right';
        context.fillText(`${fighter.rarity.toLocaleUpperCase('es')}  ·  NIVEL ${fighter.level}`, x + cardWidth - 28, cardY + 37);
        context.textAlign = 'left';
        context.fillStyle = '#e2e8f0';
        context.font = '700 16px sans-serif';
        context.fillText(`FUE  ${fighter.strength}       DEF  ${fighter.defense}       AGI  ${fighter.agility}`, x + 29, cardY + 458);
        drawPvpMeter(context, x + 29, cardY + 490, cardWidth - 58, 'VIDA', fighter.hp, fighter.maxHp, '#fb5672');
        drawPvpMeter(context, x + 29, cardY + 527, cardWidth - 58, 'ENERGÍA', fighter.energy, fighter.maxEnergy, '#55c8ff');
    };
    drawFighter(0, leftSprite, 24);
    drawFighter(1, rightSprite, 708);
    const center = context.createRadialGradient(640, 300, 10, 640, 300, 74);
    center.addColorStop(0, 'rgba(239,68,68,.48)');
    center.addColorStop(1, 'rgba(139,92,246,0)');
    context.fillStyle = center;
    context.beginPath();
    context.arc(640, 300, 74, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#f8fafc';
    context.font = '900 33px sans-serif';
    context.textAlign = 'center';
    context.shadowColor = 'rgba(0,0,0,.8)';
    context.shadowBlur = 12;
    context.fillText('VS', 640, 311);
    context.shadowBlur = 0;
    context.textAlign = 'left';
    return new AttachmentBuilder(canvas.toBuffer('image/png'), { name: 'rpg-pvp-duel.png' });
}
function drawPvpMeter(context, x, y, width, label, value, max, color) {
    const ratio = Math.max(0, Math.min(1, value / Math.max(1, max)));
    context.fillStyle = '#dbe3ef';
    context.font = '700 13px sans-serif';
    context.fillText(label, x, y);
    context.textAlign = 'right';
    context.fillText(`${value} / ${max}`, x + width, y);
    context.textAlign = 'left';
    context.fillStyle = 'rgba(255,255,255,.15)';
    context.beginPath();
    context.roundRect(x, y + 7, width, 8, 4);
    context.fill();
    if (ratio > 0) {
        context.fillStyle = color;
        context.beginPath();
        context.roundRect(x, y + 7, Math.max(7, width * ratio), 8, 4);
        context.fill();
    }
}
