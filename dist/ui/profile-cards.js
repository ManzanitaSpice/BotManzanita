import { createCanvas, loadImage } from '@napi-rs/canvas';
import { resolve } from 'node:path';
import { profileItem } from '../services/profile.js';
const cardCache = new Map();
const width = 1200;
const height = 640;
export async function renderProfileCard(input) {
    const key = cacheKey(input);
    const cached = cardCache.get(key);
    if (cached && cached.expiresAt > Date.now())
        return cached.buffer;
    const profileMode = input.mode === 'profile' || input.mode === 'rank';
    const levelUpMode = input.mode === 'levelup';
    const simpleBannerMode = profileMode || levelUpMode;
    const cardHeight = input.mode === 'wallet' ? 540 : simpleBannerMode ? 420 : height;
    const canvas = createCanvas(width, cardHeight);
    const ctx = canvas.getContext('2d');
    const accent = input.settings.accent;
    const background = itemForMode(input);
    const defaultAccent = accent.toLocaleLowerCase() === '#8b75dc';
    const cardAccent = input.mode === 'wallet' ? (background?.color ?? (defaultAccent ? '#0876d8' : accent)) : profileMode ? (background?.color ?? accent) : levelUpMode ? (background?.color ?? (defaultAccent ? '#929497' : accent)) : accent;
    const gradient = ctx.createLinearGradient(0, 0, width, cardHeight);
    if (input.mode === 'wallet') {
        gradient.addColorStop(0, cardAccent);
        gradient.addColorStop(.56, cardAccent === '#0876d8' ? '#0755bf' : cardAccent);
        gradient.addColorStop(1, cardAccent === '#0876d8' ? '#079fda' : '#087fc1');
    }
    else if (simpleBannerMode) {
        gradient.addColorStop(0, defaultAccent ? '#929497' : cardAccent);
        gradient.addColorStop(.52, defaultAccent ? '#7b7d80' : '#464a52');
        gradient.addColorStop(1, defaultAccent ? '#626468' : '#30343b');
    }
    else {
        gradient.addColorStop(0, background?.color ?? accent);
        gradient.addColorStop(.48, '#171b31');
        gradient.addColorStop(1, '#0b1021');
    }
    ctx.save();
    roundRect(ctx, 0, 0, width, cardHeight, 38);
    ctx.clip();
    if (background?.asset) {
        try {
            const image = await loadImage(profileAssetPath(background));
            drawCoverImage(ctx, image, width, cardHeight);
        }
        catch {
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, width, cardHeight);
        }
        const shade = ctx.createLinearGradient(0, 0, width, 0);
        if (input.mode === 'wallet') {
            shade.addColorStop(0, 'rgba(5,20,55,.12)');
            shade.addColorStop(.56, 'rgba(5,20,55,.04)');
            shade.addColorStop(1, 'rgba(5,20,55,.12)');
        }
        else if (simpleBannerMode) {
            shade.addColorStop(0, 'rgba(5,8,19,.28)');
            shade.addColorStop(.28, 'rgba(5,8,19,.20)');
            shade.addColorStop(.72, 'rgba(5,8,19,.30)');
            shade.addColorStop(1, 'rgba(5,8,19,.22)');
        }
        else {
            shade.addColorStop(0, 'rgba(5,8,19,.60)');
            shade.addColorStop(.56, 'rgba(5,8,19,.32)');
            shade.addColorStop(1, 'rgba(5,8,19,.50)');
        }
        ctx.fillStyle = shade;
        ctx.fillRect(0, 0, width, cardHeight);
    }
    else {
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, cardHeight);
    }
    ctx.restore();
    // Low-contrast ambient light keeps labels readable while preserving the wallet's brighter card look.
    const orb = ctx.createRadialGradient(1010, 90, 20, 1010, 90, 520);
    orb.addColorStop(0, hexAlpha(cardAccent, input.mode === 'wallet' ? .24 : simpleBannerMode ? .18 : .44));
    orb.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = orb;
    roundRect(ctx, 0, 0, width, cardHeight, 38);
    ctx.fill();
    ctx.save();
    roundRect(ctx, 0, 0, width, cardHeight, 38);
    ctx.clip();
    if (input.mode !== 'wallet' && !simpleBannerMode && !background?.asset)
        for (let i = 0; i < 34; i++) {
            const x = (i * 197 + 53) % width;
            const y = (i * 113 + 29) % cardHeight;
            ctx.beginPath();
            ctx.arc(x, y, (i % 3) + 1, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255,255,255,${.08 + (i % 4) * .025})`;
            ctx.fill();
        }
    if (input.mode !== 'wallet' && !simpleBannerMode) {
        ctx.fillStyle = background?.asset ? 'rgba(8,12,25,0.12)' : 'rgba(8,12,25,0.68)';
        roundRect(ctx, 22, 22, width - 44, cardHeight - 44, 30);
        ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = hexAlpha(cardAccent, .8);
    ctx.lineWidth = 3;
    roundRect(ctx, 3, 3, width - 6, cardHeight - 6, 38);
    ctx.stroke();
    if (input.mode === 'wallet')
        await drawWallet(ctx, input, cardAccent, background, cardHeight);
    else if (input.mode === 'levelup')
        await drawLevelup(ctx, input);
    else
        await drawProfile(ctx, input, accent, input.mode === 'rank', cardHeight);
    const buffer = canvas.toBuffer('image/png');
    if (cardCache.size > 200)
        for (const [key, entry] of cardCache)
            if (entry.expiresAt < Date.now())
                cardCache.delete(key);
    cardCache.set(key, { expiresAt: Date.now() + 60_000, buffer });
    return buffer;
}
export async function renderShopItemPreview(item) {
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, item.color);
    gradient.addColorStop(.58, '#171b31');
    gradient.addColorStop(1, '#090d18');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    if (item.asset) {
        try {
            const image = await loadImage(profileAssetPath(item));
            drawCoverImage(ctx, image, width, height);
        }
        catch { /* The catalog still renders a clear item tile if a local asset is missing. */ }
    }
    const shade = ctx.createLinearGradient(0, 0, 0, height);
    shade.addColorStop(0, 'rgba(6,9,17,.08)');
    shade.addColorStop(.55, 'rgba(6,9,17,.16)');
    shade.addColorStop(1, 'rgba(6,9,17,.85)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, width, height);
    if (!item.asset) {
        ctx.fillStyle = 'rgba(8,12,25,.52)';
        roundRect(ctx, 44, 44, width - 88, height - 88, 34);
        ctx.fill();
        ctx.strokeStyle = hexAlpha(item.color, .8);
        ctx.lineWidth = 3;
        roundRect(ctx, 47, 47, width - 94, height - 94, 32);
        ctx.stroke();
        if (item.type === 'badge') {
            ctx.fillStyle = hexAlpha(item.color, .32);
            ctx.beginPath();
            ctx.arc(600, 260, 145, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = item.color;
            ctx.lineWidth = 8;
            ctx.stroke();
            label(ctx, item.emoji, 600, 310, 120, '#fff', 700, 'center');
        }
        else if (item.type === 'tag') {
            pill(ctx, `${item.emoji} ${item.name}`, 600, 270, item.color);
            ctx.textAlign = 'center';
        }
        else if (item.type === 'frame') {
            const x = 600, y = 260;
            const ring = ctx.createLinearGradient(x - 120, y - 120, x + 120, y + 120);
            ring.addColorStop(0, '#e2c5ff');
            ring.addColorStop(.45, item.color);
            ring.addColorStop(1, '#57d8cf');
            ctx.strokeStyle = ring;
            ctx.lineWidth = 24;
            ctx.beginPath();
            ctx.arc(x, y, 112, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = '#242b40';
            ctx.beginPath();
            ctx.arc(x, y, 86, 0, Math.PI * 2);
            ctx.fill();
            label(ctx, '●', x, y + 35, 92, '#c4cce2', 700, 'center');
        }
        else if (item.type === 'sticker')
            label(ctx, item.emoji, 600, 330, 190, '#fff', 700, 'center');
    }
    ctx.fillStyle = 'rgba(8,12,25,.66)';
    roundRect(ctx, 54, height - 156, width - 108, 102, 24);
    ctx.fill();
    label(ctx, `${item.emoji}  ${item.name}`, 82, height - 98, 35, '#fff', 800);
    label(ctx, `${item.rarity.toLocaleUpperCase()}  ·  ${moneyLabel(item.price)} monedas`, 84, height - 66, 17, '#e0e4f3', 600);
    const border = ctx.createLinearGradient(0, 0, width, height);
    border.addColorStop(0, hexAlpha(item.color, .9));
    border.addColorStop(1, 'rgba(255,255,255,.24)');
    ctx.strokeStyle = border;
    ctx.lineWidth = 3;
    roundRect(ctx, 3, 3, width - 6, height - 6, 38);
    ctx.stroke();
    return canvas.toBuffer('image/png');
}
function moneyLabel(value) { return new Intl.NumberFormat('es-MX').format(value); }
function drawCoverImage(ctx, image, targetWidth, targetHeight) {
    const scale = Math.max(targetWidth / image.width, targetHeight / image.height);
    const sourceWidth = targetWidth / scale;
    const sourceHeight = targetHeight / scale;
    const sourceX = (image.width - sourceWidth) / 2;
    const sourceY = (image.height - sourceHeight) / 2;
    ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, targetWidth, targetHeight);
}
function profileAssetPath(item) {
    return resolve(process.cwd(), 'assets', 'profile-backgrounds', item.asset);
}
async function drawProfile(ctx, input, accent, rankMode, cardHeight) {
    const { progress, settings } = input;
    const sideWidth = 300;
    ctx.fillStyle = 'rgba(255,255,255,.13)';
    roundRect(ctx, 0, 0, sideWidth, cardHeight, 36);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.24)';
    ctx.fillRect(sideWidth - 2, 42, 2, cardHeight - 84);
    await drawProfileAvatar(ctx, input, 70, 36, 210, settings.frame);
    ctx.fillStyle = hexAlpha(accent, .38);
    roundRect(ctx, 70, 274, 210, 66, 18);
    ctx.fill();
    ctx.strokeStyle = hexAlpha(accent, .65);
    ctx.lineWidth = 2;
    roundRect(ctx, 70, 274, 210, 66, 18);
    ctx.stroke();
    label(ctx, `+${progress.reputation} rep`, 175, 319, 37, '#fff', 800, 'center');
    drawServerMark(ctx, 334, 62, 78, 52);
    label(ctx, truncate(input.username, 21), 435, 110, 53, '#fff', 800);
    label(ctx, `#${rankMode ? progress.serverRank : progress.globalRank}`, 1148, 110, 58, '#fff', 800, 'right');
    drawSpeechBubble(ctx, 336, 181);
    const headline = settings.about?.trim() || settings.title || 'Aventurero/a';
    ctx.fillStyle = 'rgba(0,0,0,.16)';
    roundRect(ctx, 435, 178, 730, 54, 16);
    ctx.fill();
    label(ctx, truncate(headline, 48), 800, 214, 29, '#fff', 600, 'center');
    label(ctx, 'Server Score', 438, 278, 25, 'rgba(255,255,255,.76)', 500);
    label(ctx, progress.serverXp.toLocaleString('es-MX'), 1164, 278, 25, '#fff', 700, 'right');
    ctx.fillStyle = 'rgba(0,0,0,.09)';
    roundRect(ctx, 435, 308, 730, 74, 20);
    ctx.fill();
    label(ctx, `NIVEL ${progress.level}`, 460, 355, 17, 'rgba(255,255,255,.76)', 700);
    const currentLevel = progress.level;
    const floorXp = (currentLevel - 1) ** 2 * 100;
    const nextXp = currentLevel ** 2 * 100;
    const levelRatio = Math.max(0, Math.min(1, (progress.xp - floorXp) / Math.max(1, nextXp - floorXp)));
    for (let i = 0; i < 7; i++) {
        ctx.beginPath();
        ctx.arc(570 + i * 62, 346, 9, 0, Math.PI * 2);
        ctx.fillStyle = i < Math.ceil(levelRatio * 7) ? 'rgba(255,255,255,.95)' : 'rgba(255,255,255,.22)';
        ctx.fill();
    }
    drawBadges(ctx, input, 1024, 346);
}
async function drawProfileAvatar(ctx, input, x, y, size, frameId) {
    const frame = profileItem(frameId);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, 24);
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
    ctx.strokeStyle = frame?.color ?? input.settings.accent;
    ctx.lineWidth = 8;
    roundRect(ctx, x - 4, y - 4, size + 8, size + 8, 28);
    ctx.stroke();
}
function drawServerMark(ctx, x, y, w, h) {
    ctx.fillStyle = '#4f92f4';
    roundRect(ctx, x, y, w, h, 13);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.94)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h / 2, 16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + w / 2 - 16, y + h / 2);
    ctx.lineTo(x + w / 2 + 16, y + h / 2);
    ctx.moveTo(x + w / 2, y + h / 2 - 16);
    ctx.lineTo(x + w / 2, y + h / 2 + 16);
    ctx.stroke();
}
function drawSpeechBubble(ctx, x, y) {
    ctx.fillStyle = 'rgba(255,255,255,.66)';
    roundRect(ctx, x, y, 50, 40, 20);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + 10, y + 32);
    ctx.lineTo(x + 4, y + 48);
    ctx.lineTo(x + 25, y + 38);
    ctx.closePath();
    ctx.fill();
    for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(x + 15 + i * 10, y + 20, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(90,95,104,.65)';
        ctx.fill();
    }
}
async function drawWallet(ctx, input, accent, background, cardHeight) {
    const fmt = new Intl.NumberFormat('es-MX');
    const themeName = background?.name ?? (input.settings.accent.toLocaleLowerCase() === '#8b75dc' ? 'standard' : 'personalizado');
    ctx.save();
    roundRect(ctx, 0, 0, width, cardHeight, 38);
    ctx.clip();
    // Layered flowing bands echo the reference card and remain visible over future wallet background art.
    ctx.fillStyle = hexAlpha(accent, .14);
    ctx.beginPath();
    ctx.moveTo(430, 0);
    ctx.bezierCurveTo(710, 34, 740, 172, 1200, 208);
    ctx.lineTo(1200, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(8,42,149,.16)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(315, 160, 540, 18, 770, 0);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(0,217,255,.11)';
    ctx.beginPath();
    ctx.moveTo(0, 322);
    ctx.bezierCurveTo(345, 262, 650, 484, 1200, 340);
    ctx.lineTo(1200, cardHeight);
    ctx.lineTo(0, cardHeight);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    label(ctx, 'manzanita.', 72, 137, 72, '#fff', 800);
    label(ctx, truncate(themeName.toLocaleLowerCase(), 16), 1128, 137, 39, '#f7fbff', 500, 'right');
    // Card chip on the right balances the text column and gives the card a physical-wallet silhouette.
    ctx.fillStyle = 'rgba(239,247,252,.94)';
    roundRect(ctx, 724, 253, 182, 120, 26);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.84)';
    ctx.lineWidth = 2;
    roundRect(ctx, 726, 255, 178, 116, 24);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(120,145,160,.38)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(724, 293);
    ctx.lineTo(906, 293);
    ctx.moveTo(724, 333);
    ctx.lineTo(906, 333);
    ctx.moveTo(784, 253);
    ctx.bezierCurveTo(762, 282, 762, 344, 784, 373);
    ctx.moveTo(846, 253);
    ctx.bezierCurveTo(868, 282, 868, 344, 846, 373);
    ctx.stroke();
    drawWalletIcon(ctx, 78, 216, accent);
    label(ctx, `${fmt.format(input.wallet)} Credits`, 145, 250, 43, '#fff', 600);
    label(ctx, '🪙', 78, 330, 42, '#ffe54b', 700);
    label(ctx, `${fmt.format(input.premium)} Tokens`, 145, 330, 43, '#ffe54b', 600);
    label(ctx, '✦', 84, 414, 40, '#fff', 700);
    label(ctx, `${fmt.format(input.progress.serverXp)} Server Points`, 145, 414, 42, '#fff', 600);
    label(ctx, 'BANCO', 824, 416, 18, 'rgba(245,250,255,.78)', 700);
    label(ctx, `${fmt.format(input.bank)} monedas`, 824, 451, 30, '#fff', 700);
    await drawAvatar(ctx, input, 74, 480, 52, input.settings.frame);
    label(ctx, truncate(input.username.toLocaleUpperCase(), 24), 142, 532, 38, '#fff', 700);
    for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(730 + i * 54, 520, 9, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,.96)';
        ctx.fill();
    }
}
function drawWalletIcon(ctx, x, y, accent) {
    ctx.fillStyle = 'rgba(255,255,255,.98)';
    roundRect(ctx, x, y, 44, 31, 6);
    ctx.fill();
    ctx.fillStyle = accent;
    roundRect(ctx, x + 25, y + 8, 22, 15, 4);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + 38, y + 15.5, 2, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
}
async function drawLevelup(ctx, input) {
    const newLevel = input.levelUpTo ?? input.progress.level;
    const previousLevel = Math.max(1, newLevel - 1);
    drawLevelHexagon(ctx, 112, 210, 78, previousLevel);
    drawLevelArrow(ctx, 208, 210, 292);
    drawLevelHexagon(ctx, 398, 210, 78, newLevel);
    drawServerMark(ctx, 505, 46, 78, 52);
    label(ctx, 'level up!', 505, 170, 62, '#fff', 800);
    await drawProfileAvatar(ctx, input, 1000, 16, 175, input.settings.frame);
}
function drawLevelHexagon(ctx, cx, cy, radius, level) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.14)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 2;
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius;
        if (i === 0)
            ctx.moveTo(x, y);
        else
            ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,.035)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.96)';
    ctx.lineWidth = 8;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();
    label(ctx, `${level}`, cx, cy + 21, 56, '#fff', 800, 'center');
}
function drawLevelArrow(ctx, startX, y, tipX) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.97)';
    ctx.fillStyle = 'rgba(255,255,255,.97)';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(startX, y);
    ctx.lineTo(tipX - 25, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tipX, y);
    ctx.lineTo(tipX - 30, y - 23);
    ctx.lineTo(tipX - 30, y + 23);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}
function drawBadges(ctx, input, x, y) {
    for (let i = 0; i < 3; i++) {
        const cx = x + i * 48;
        const item = input.badges[i] ? profileItem(input.badges[i]) : undefined;
        ctx.beginPath();
        ctx.arc(cx, y, 18, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,.16)';
        ctx.fill();
        if (item) {
            ctx.strokeStyle = hexAlpha(item.color, .88);
            ctx.lineWidth = 2;
            ctx.stroke();
            label(ctx, item.emoji, cx, y + 7, 20, '#fff', 700, 'center');
        }
        else {
            ctx.beginPath();
            ctx.arc(cx, y, 4, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,255,255,.26)';
            ctx.fill();
        }
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
function itemForMode(input) { const id = input.mode === 'wallet' ? input.settings.walletBg : input.mode === 'levelup' ? input.settings.levelupBg : input.mode === 'rank' ? input.settings.rankBg : input.settings.profileBg; return profileItem(id); }
function cacheKey(input) { return `${input.mode}:${input.userId}:${input.username}:${input.avatarUrl}:${input.progress.level}:${input.progress.xp}:${input.progress.globalRank}:${input.progress.serverLevel}:${input.progress.serverXp}:${input.progress.serverRank}:${input.progress.messages}:${input.progress.reputation}:${input.progress.hugsReceived}:${input.progress.patsReceived}:${input.wallet}:${input.bank}:${input.premium}:${input.settings.accent}:${input.settings.profileBg}:${input.settings.rankBg}:${input.settings.walletBg}:${input.settings.levelupBg}:${input.settings.frame}:${input.settings.tag}:${input.settings.sticker}:${input.settings.about}:${input.settings.title}:${input.badges.join(',')}:${input.levelUpTo ?? ''}`; }
function label(ctx, text, x, y, size, color, weight, align = 'left') { ctx.font = `${weight} ${size}px Arial, sans-serif`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic'; ctx.fillText(text, x, y); }
function pill(ctx, text, x, y, color) { ctx.font = '600 14px Arial,sans-serif'; const w = ctx.measureText(text).width + 24; ctx.fillStyle = hexAlpha(color, .28); roundRect(ctx, x, y, w, 29, 14); ctx.fill(); label(ctx, text, x + 12, y + 20, 14, '#fff', 600); }
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function truncate(value, max) { return value.length > max ? `${value.slice(0, max - 1)}…` : value; }
function hexAlpha(value, alpha) { const hex = /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#8b75dc'; const num = parseInt(hex.slice(1), 16); return `rgba(${(num >> 16) & 255},${(num >> 8) & 255},${num & 255},${alpha})`; }
