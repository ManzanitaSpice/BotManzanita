import { createCanvas, loadImage } from '@napi-rs/canvas';
import { profileItem } from '../services/profile.js';
const cardCache = new Map();
const width = 1200;
const height = 640;
export async function renderProfileCard(input) {
    const key = cacheKey(input);
    const cached = cardCache.get(key);
    if (cached && cached.expiresAt > Date.now())
        return cached.buffer;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    const accent = input.settings.accent;
    const background = itemForMode(input);
    const baseColor = background?.color ?? accent;
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, baseColor);
    gradient.addColorStop(.48, '#171b31');
    gradient.addColorStop(1, '#0b1021');
    ctx.fillStyle = gradient;
    roundRect(ctx, 0, 0, width, height, 38);
    ctx.fill();
    // Low contrast ambient lights and a dark glass overlay keep text readable on every theme.
    const orb = ctx.createRadialGradient(1010, 110, 20, 1010, 110, 520);
    orb.addColorStop(0, hexAlpha(accent, .44));
    orb.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = orb;
    roundRect(ctx, 0, 0, width, height, 38);
    ctx.fill();
    ctx.save();
    roundRect(ctx, 0, 0, width, height, 38);
    ctx.clip();
    for (let i = 0; i < 34; i++) {
        const x = (i * 197 + 53) % width;
        const y = (i * 113 + 29) % height;
        ctx.beginPath();
        ctx.arc(x, y, (i % 3) + 1, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${.08 + (i % 4) * .025})`;
        ctx.fill();
    }
    ctx.fillStyle = 'rgba(8,12,25,0.68)';
    roundRect(ctx, 22, 22, width - 44, height - 44, 30);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = hexAlpha(accent, .8);
    ctx.lineWidth = 3;
    roundRect(ctx, 3, 3, width - 6, height - 6, 38);
    ctx.stroke();
    if (input.mode === 'wallet')
        drawWallet(ctx, input, accent);
    else if (input.mode === 'levelup')
        await drawLevelup(ctx, input, accent);
    else if (input.mode === 'room')
        await drawRoom(ctx, input, accent);
    else
        await drawProfile(ctx, input, accent, input.mode === 'rank');
    const buffer = canvas.toBuffer('image/png');
    if (cardCache.size > 200)
        for (const [key, entry] of cardCache)
            if (entry.expiresAt < Date.now())
                cardCache.delete(key);
    cardCache.set(key, { expiresAt: Date.now() + 60_000, buffer });
    return buffer;
}
async function drawProfile(ctx, input, accent, rankMode) {
    const { progress, settings } = input;
    label(ctx, rankMode ? 'RANK CARD' : 'PROFILE CARD', 62, 66, 18, accent, 700);
    label(ctx, `NIVEL ${progress.level}`, 65, 117, 25, '#ffffff', 800);
    label(ctx, `GLOBAL #${progress.globalRank}`, 1136, 78, 22, '#eff2ff', 700, 'right');
    label(ctx, `${progress.xp.toLocaleString('es-MX')} XP GLOBAL`, 1136, 112, 15, '#aeb6d0', 600, 'right');
    await drawAvatar(ctx, input, 75, 175, 174, settings.frame);
    label(ctx, truncate(input.username, 26), 292, 228, 42, '#fff', 800);
    label(ctx, settings.title || 'Aventurero/a', 296, 269, 21, '#c2c9dc', 500);
    if (settings.tag) {
        const tag = profileItem(settings.tag);
        if (tag)
            pill(ctx, tag.emoji + ' ' + tag.name, 296, 291, tag.color);
    }
    const currentXp = progress.xp;
    const currentLevel = progress.level;
    const floorXp = (currentLevel - 1) ** 2 * 100;
    const nextXp = currentLevel ** 2 * 100;
    const x = 295, y = 370, w = 575, h = 17;
    label(ctx, `${(currentXp - floorXp).toLocaleString('es-MX')} / ${(nextXp - floorXp).toLocaleString('es-MX')} XP`, x, y - 18, 16, '#e5e7f2', 600);
    ctx.fillStyle = 'rgba(255,255,255,.13)';
    roundRect(ctx, x, y, w, h, 9);
    ctx.fill();
    ctx.fillStyle = accent;
    roundRect(ctx, x, y, w * Math.max(.025, Math.min(1, (currentXp - floorXp) / Math.max(1, nextXp - floorXp))), h, 9);
    ctx.fill();
    label(ctx, `${progress.messages.toLocaleString('es-MX')} mensajes globales`, 296, 435, 17, '#c2c9dc', 500);
    label(ctx, `Reputación ${progress.reputation}`, 296, 466, 17, '#c2c9dc', 500);
    label(ctx, input.petName ? `🐾 ${input.petName}` : '🐾 Sin mascota activa', 296, 508, 18, '#f5e8ff', 600);
    label(ctx, settings.about ? truncate(settings.about, 58) : 'Cuéntale algo de ti desde Personalizar.', 72, 583, 16, '#c0c8dc', 500);
    const sticker = profileItem(settings.sticker);
    if (sticker)
        label(ctx, sticker.emoji, 862, 480, 40, '#fff', 700, 'center');
    drawBadges(ctx, input, 934, 204);
}
function drawWallet(ctx, input, accent) {
    label(ctx, 'WALLET CARD', 68, 75, 20, accent, 700);
    label(ctx, input.username, 68, 132, 38, '#fff', 800);
    label(ctx, 'Tu economía en una vista', 70, 166, 18, '#b7bfd4', 500);
    const cards = [{ title: 'BILLETERA', value: input.wallet, emoji: '💰', color: accent }, { title: 'BANCO', value: input.bank, emoji: '🏦', color: '#4fb9aa' }, { title: 'PREMIUM', value: input.premium, emoji: '💎', color: '#ad87ec' }];
    cards.forEach((card, index) => { const x = 65 + index * 365; ctx.fillStyle = 'rgba(255,255,255,.075)'; roundRect(ctx, x, 230, 330, 210, 24); ctx.fill(); ctx.strokeStyle = hexAlpha(card.color, .65); ctx.lineWidth = 2; roundRect(ctx, x, 230, 330, 210, 24); ctx.stroke(); label(ctx, card.emoji + ' ' + card.title, x + 25, 280, 18, '#c4cbe0', 700); label(ctx, new Intl.NumberFormat('es-MX').format(card.value), x + 25, 355, 34, '#fff', 800); label(ctx, 'MANZANITA · ECONOMÍA', x + 25, 403, 13, '#929bb6', 600); });
    label(ctx, `Nivel ${input.progress.level} · ${input.progress.xp.toLocaleString('es-MX')} XP global`, 68, 520, 18, '#d6d9e8', 600);
    label(ctx, 'Cartera personal · saldo actualizado al abrir la tarjeta', 68, 580, 15, '#aeb6d0', 500);
}
async function drawLevelup(ctx, input, accent) {
    label(ctx, '✨ NUEVO NIVEL', 70, 83, 25, accent, 800);
    label(ctx, input.username, 70, 166, 44, '#fff', 800);
    label(ctx, `${input.levelUpTo ?? input.progress.level}`, 76, 380, 150, '#fff', 900);
    label(ctx, '¡SIGUE SUBIENDO!', 330, 288, 29, '#fff', 800);
    label(ctx, `${input.progress.xp.toLocaleString('es-MX')} XP global`, 334, 333, 22, '#c8cde0', 600);
    label(ctx, `Rango global #${input.progress.globalRank}`, 334, 379, 18, '#aeb6d0', 500);
    await drawAvatar(ctx, input, 865, 180, 190, input.settings.frame);
    if (input.petName)
        label(ctx, `🐾 ${input.petName} celebra contigo`, 795, 437, 20, '#f6eaff', 600, 'center');
}
async function drawRoom(ctx, input, accent) {
    const home = profileItem(input.settings.housing);
    label(ctx, 'ROOM CARD', 64, 76, 19, accent, 700);
    label(ctx, home?.name ?? 'Habitación de ' + input.username, 64, 135, 39, '#fff', 800);
    label(ctx, `Hogar de ${input.username}`, 66, 169, 18, '#c4cbe0', 500);
    ctx.fillStyle = hexAlpha(home?.color ?? accent, .24);
    roundRect(ctx, 360, 230, 480, 285, 30);
    ctx.fill();
    ctx.strokeStyle = hexAlpha(home?.color ?? accent, .86);
    ctx.lineWidth = 4;
    roundRect(ctx, 360, 230, 480, 285, 30);
    ctx.stroke();
    ctx.fillStyle = home?.color ?? accent;
    ctx.beginPath();
    ctx.moveTo(330, 310);
    ctx.lineTo(600, 130);
    ctx.lineTo(870, 310);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#1b2235';
    roundRect(ctx, 400, 300, 400, 215, 18);
    ctx.fill();
    ctx.fillStyle = '#d5bd89';
    roundRect(ctx, 558, 384, 82, 131, 12);
    ctx.fill();
    ctx.fillStyle = '#94d9e9';
    roundRect(ctx, 436, 330, 76, 64, 11);
    ctx.fill();
    roundRect(ctx, 688, 330, 76, 64, 11);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.15)';
    roundRect(ctx, 70, 225, 220, 265, 24);
    ctx.fill();
    label(ctx, home?.emoji ?? '🏠', 180, 336, 75, '#fff', 600, 'center');
    label(ctx, home ? 'DECORADA' : 'VACÍA', 180, 390, 15, '#d8deed', 700, 'center');
    if (input.petName)
        label(ctx, `🐾 ${input.petName} también vive aquí`, 600, 570, 18, '#e8e2f4', 600, 'center');
    await drawAvatar(ctx, input, 930, 225, 155, input.settings.frame);
    label(ctx, input.settings.about ? truncate(input.settings.about, 55) : 'Una habitación que puedes decorar desde la tienda.', 65, 586, 16, '#bfc7dc', 500);
}
function drawBadges(ctx, input, x, y) {
    label(ctx, 'BADGES', x, y - 35, 15, '#aeb6d0', 700);
    for (let i = 0; i < 3; i++) {
        const left = x + (i % 2) * 106, top = y + Math.floor(i / 2) * 102;
        ctx.fillStyle = 'rgba(255,255,255,.07)';
        roundRect(ctx, left, top, 88, 82, 20);
        ctx.fill();
        const item = input.badges[i] ? profileItem(input.badges[i]) : undefined;
        if (item) {
            ctx.strokeStyle = hexAlpha(item.color, .9);
            ctx.lineWidth = 2;
            roundRect(ctx, left, top, 88, 82, 20);
            ctx.stroke();
            label(ctx, item.emoji, left + 44, top + 40, 30, '#fff', 600, 'center');
            label(ctx, truncate(item.name, 10), left + 44, top + 65, 10, '#e5e8f2', 600, 'center');
        }
        else
            label(ctx, '＋', left + 44, top + 49, 24, '#5d6478', 500, 'center');
    }
}
async function drawAvatar(ctx, input, x, y, size, frameId) {
    const item = profileItem(frameId);
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();
    try {
        const response = await fetch(input.avatarUrl, { signal: AbortSignal.timeout(4500) });
        if (!response.ok)
            throw new Error('avatar');
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length > 3_000_000)
            throw new Error('avatar too large');
        const image = await loadImage(buffer);
        ctx.drawImage(image, x, y, size, size);
    }
    catch {
        ctx.fillStyle = '#373e5a';
        ctx.fillRect(x, y, size, size);
        label(ctx, input.username.slice(0, 1).toUpperCase(), x + size / 2, y + size * .67, size * .48, '#fff', 800, 'center');
    }
    ctx.restore();
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2 + 8, 0, Math.PI * 2);
    ctx.strokeStyle = item?.color ?? input.settings.accent;
    ctx.lineWidth = 8;
    ctx.stroke();
}
function itemForMode(input) { const id = input.mode === 'wallet' ? input.settings.walletBg : input.mode === 'levelup' ? input.settings.levelupBg : input.mode === 'rank' ? input.settings.rankBg : input.mode === 'room' ? input.settings.housing : input.settings.profileBg; return profileItem(id); }
function cacheKey(input) { return `${input.mode}:${input.userId}:${input.username}:${input.progress.level}:${input.progress.xp}:${input.progress.globalRank}:${input.progress.serverLevel}:${input.progress.serverXp}:${input.progress.serverRank}:${input.progress.messages}:${input.progress.reputation}:${input.wallet}:${input.bank}:${input.premium}:${input.settings.accent}:${input.settings.profileBg}:${input.settings.rankBg}:${input.settings.walletBg}:${input.settings.levelupBg}:${input.settings.housing}:${input.settings.frame}:${input.settings.tag}:${input.settings.sticker}:${input.settings.about}:${input.settings.title}:${input.badges.join(',')}:${input.petName ?? ''}:${input.levelUpTo ?? ''}`; }
function label(ctx, text, x, y, size, color, weight, align = 'left') { ctx.font = `${weight} ${size}px Arial, sans-serif`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic'; ctx.fillText(text, x, y); }
function pill(ctx, text, x, y, color) { ctx.font = '600 14px Arial,sans-serif'; const w = ctx.measureText(text).width + 24; ctx.fillStyle = hexAlpha(color, .28); roundRect(ctx, x, y, w, 29, 14); ctx.fill(); label(ctx, text, x + 12, y + 20, 14, '#fff', 600); }
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function truncate(value, max) { return value.length > max ? `${value.slice(0, max - 1)}…` : value; }
function hexAlpha(value, alpha) { const hex = /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#8b75dc'; const num = parseInt(hex.slice(1), 16); return `rgba(${(num >> 16) & 255},${(num >> 8) & 255},${num & 255},${alpha})`; }
