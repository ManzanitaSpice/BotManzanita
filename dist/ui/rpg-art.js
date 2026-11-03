import { createCanvas, loadImage } from '@napi-rs/canvas';
import { AttachmentBuilder } from 'discord.js';
import { resolve } from 'node:path';
import { getPetRarityOdds } from '../services/rpg.js';
export const rpgEggOptions = [
    { element: 'Fuego', emoji: '🔥', accent: '#fb6846', backdrop: 'zone-ruinas.png', egg: 'legendario.png', title: 'Huevo de brasa', flavor: 'Criaturas de fuego y ceniza' },
    { element: 'Agua', emoji: '💧', accent: '#4dc4ef', backdrop: 'zone-cumbres.png', egg: 'hielo.png', title: 'Huevo de marea', flavor: 'Criaturas de ríos y corrientes' },
    { element: 'Naturaleza', emoji: '🌿', accent: '#79d36c', backdrop: 'zone-bosque.png', egg: 'naturaleza.png', title: 'Huevo de brote', flavor: 'Criaturas de bosque y jardín' },
    { element: 'Viento', emoji: '🌬️', accent: '#c2e9f0', backdrop: 'zone-cumbres.png', egg: 'comun.png', title: 'Huevo de nube', flavor: 'Criaturas de los cielos' },
    { element: 'Hielo', emoji: '❄️', accent: '#77caff', backdrop: 'zone-cumbres.png', egg: 'hielo.png', title: 'Huevo de escarcha', flavor: 'Criaturas de nieve y aurora' },
    { element: 'Luz', emoji: '☀️', accent: '#ffd76a', backdrop: 'zone-ruinas.png', egg: 'legendario.png', title: 'Huevo solar', flavor: 'Criaturas de luz y resplandor' },
    { element: 'Sombra', emoji: '🌘', accent: '#a983e8', backdrop: 'zone-astral.png', egg: 'astral.png', title: 'Huevo umbrío', flavor: 'Criaturas nocturnas y misteriosas' },
    { element: 'Tierra', emoji: '🪨', accent: '#d6ae72', backdrop: 'zone-dunas.png', egg: 'naturaleza.png', title: 'Huevo de piedra', flavor: 'Criaturas de roca y desierto' },
    { element: 'Rayo', emoji: '⚡', accent: '#ffe25c', backdrop: 'zone-ruinas.png', egg: 'legendario.png', title: 'Huevo de tormenta', flavor: 'Criaturas veloces y eléctricas' },
    { element: 'Astral', emoji: '🌌', accent: '#bd91ff', backdrop: 'zone-astral.png', egg: 'astral.png', title: 'Huevo astral', flavor: 'Criaturas de estrellas y sueños' },
];
const WIDTH = 1280;
const HEIGHT = 620;
const ASSET_ROOT = resolve(process.cwd(), 'assets', 'rpg');
function slug(value) {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
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
    context.fillText('Cada huevo respeta su afinidad al eclosionar.', 78, 332);
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
export async function renderPetCard(pet, backgroundName) {
    const theme = rpgEggOptions.find((entry) => entry.element === pet.element) ?? rpgEggOptions[0];
    const canvas = createCanvas(WIDTH, HEIGHT);
    const context = canvas.getContext('2d');
    const [background, sprite] = await Promise.all([
        loadImage(resolve(ASSET_ROOT, backgroundName)),
        loadImage(resolve(ASSET_ROOT, 'pets', `${slug(pet.species)}.png`)),
    ]);
    drawCover(context, background);
    drawCardShell(context, theme.accent);
    context.fillStyle = 'rgba(12,16,27,.78)';
    context.beginPath();
    context.roundRect(40, 38, 555, 545, 24);
    context.fill();
    context.strokeStyle = `${theme.accent}55`;
    context.lineWidth = 1;
    context.stroke();
    context.fillStyle = theme.accent;
    context.font = '700 17px sans-serif';
    context.fillText('FICHA DE COMPAÑERA  /  RPG', 76, 92);
    context.fillStyle = '#f8fafc';
    context.font = '700 48px sans-serif';
    context.fillText(pet.name.slice(0, 20), 76, 158);
    context.fillStyle = '#dbe3ef';
    context.font = '25px sans-serif';
    context.fillText(pet.species, 78, 204);
    context.fillStyle = '#94a3b8';
    context.font = '21px sans-serif';
    context.fillText(`${pet.rarity}  ·  Nv. ${pet.level}`, 78, 244);
    drawPill(context, 76, 282, 180, `Elemento · ${pet.element}`, theme.accent);
    drawPill(context, 268, 282, 230, `Especialidad · ${pet.specialization}`, '#c9b6ff');
    context.fillStyle = '#f8fafc';
    context.font = '600 23px sans-serif';
    context.fillText('ATRIBUTOS', 78, 374);
    context.fillStyle = '#cbd5e1';
    context.font = '22px sans-serif';
    context.fillText(`Fuerza       ${pet.strength}`, 82, 420);
    context.fillText(`Defensa    ${pet.defense}`, 82, 462);
    context.fillText(`Agilidad    ${pet.agility}`, 82, 504);
    context.fillStyle = 'rgba(4,8,16,.34)';
    context.beginPath();
    context.ellipse(910, 518, 180, 28, 0, 0, Math.PI * 2);
    context.fill();
    context.save();
    context.shadowColor = `${theme.accent}bb`;
    context.shadowBlur = 34;
    context.drawImage(sprite, 650, 72, 490, 490);
    context.restore();
    context.fillStyle = '#ffffff';
    context.font = '600 19px sans-serif';
    context.fillText(`${pet.xp} XP`, 1055, 568);
    return new AttachmentBuilder(canvas.toBuffer('image/png'), { name: 'rpg-pet-card.png' });
}
