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
    const cardHeight = input.mode === 'wallet' ? 500 : simpleBannerMode ? 420 : height;
    const canvas = createCanvas(width, cardHeight);
    const ctx = canvas.getContext('2d');
    const accent = input.settings.accent;
    const background = itemForMode(input);
    const defaultAccent = accent.toLocaleLowerCase() === '#8b75dc';
    const cardAccent = input.mode === 'wallet' ? (background?.color ?? (defaultAccent ? '#0876d8' : accent)) : profileMode ? (background?.color ?? accent) : levelUpMode ? (background?.color ?? (defaultAccent ? '#929497' : accent)) : accent;
    const gradient = ctx.createLinearGradient(0, 0, width, cardHeight);
    if (input.mode === 'wallet') {
        gradient.addColorStop(0, '#0b1422');
        gradient.addColorStop(.56, '#182638');
        gradient.addColorStop(1, '#102a35');
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
            shade.addColorStop(0, 'rgba(5,10,22,.64)');
            shade.addColorStop(.56, 'rgba(5,10,22,.48)');
            shade.addColorStop(1, 'rgba(5,10,22,.68)');
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
    // Subtle ambient light keeps the cards readable and adds depth to the background.
    const orb = ctx.createRadialGradient(1010, 90, 20, 1010, 90, 520);
    orb.addColorStop(0, hexAlpha(cardAccent, input.mode === 'wallet' ? .17 : simpleBannerMode ? .18 : .44));
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
    ctx.strokeStyle = hexAlpha(cardAccent, input.mode === 'wallet' ? .52 : .8);
    ctx.lineWidth = input.mode === 'wallet' ? 2 : 3;
    roundRect(ctx, 3, 3, width - 6, cardHeight - 6, 38);
    ctx.stroke();
    if (input.mode === 'wallet')
        await drawWallet(ctx, input, cardAccent);
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
export async function renderProfileBackgroundPreview(input, item) {
    let mode;
    let setting;
    switch (item.type) {
        case 'profile_bg':
            mode = 'profile';
            setting = 'profileBg';
            break;
        case 'rank_bg':
            mode = 'rank';
            setting = 'rankBg';
            break;
        case 'wallet_bg':
            mode = 'wallet';
            setting = 'walletBg';
            break;
        case 'levelup_bg':
            mode = 'levelup';
            setting = 'levelupBg';
            break;
        default: return undefined;
    }
    const settings = { ...input.settings, [setting]: item.id };
    return { mode, buffer: await renderProfileCard({ ...input, mode, settings }) };
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
    label(ctx, 'XP de perfil', 438, 278, 25, 'rgba(255,255,255,.76)', 500);
    label(ctx, progress.xp.toLocaleString('es-MX'), 1164, 278, 25, '#fff', 700, 'right');
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
async function drawWallet(ctx, input, accent) {
    const fmt = new Intl.NumberFormat('es-MX');
    label(ctx, 'MANZANITA', 72, 86, 25, hexAlpha(accent, .96), 800);
    label(ctx, 'BILLETERA', 72, 145, 49, '#fff', 800);
    label(ctx, 'Monedas y gemas premium', 74, 175, 21, 'rgba(232,239,248,.74)', 500);
    await drawAvatar(ctx, input, 1046, 48, 72, input.settings.frame);
    label(ctx, `@${truncate(input.username, 18)}`, 1138, 159, 23, '#f4f7fb', 700, 'right');
    drawWalletBalanceCard(ctx, 72, 202, 512, 224, 'MONEDAS', fmt.format(input.wallet), 'Disponible en billetera', `En banco: ${fmt.format(input.bank)} monedas`, '#e8b95b', 'coin');
    drawWalletBalanceCard(ctx, 616, 202, 512, 224, 'GEMAS PREMIUM', fmt.format(input.premium), 'Gemas disponibles', 'Cuenta separada de monedas', '#ad9aff', 'gem');
    ctx.fillStyle = 'rgba(255,255,255,.16)';
    roundRect(ctx, 72, 453, 1056, 1, 1);
    ctx.fill();
    label(ctx, 'El banco guarda monedas; las gemas premium son una moneda aparte.', 74, 482, 18, 'rgba(232,239,248,.72)', 500);
}
function drawWalletBalanceCard(ctx, x, y, w, h, title, amount, caption, detail, color, icon) {
    ctx.fillStyle = 'rgba(7,13,24,.66)';
    roundRect(ctx, x, y, w, h, 26);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.18)';
    ctx.lineWidth = 2;
    roundRect(ctx, x + 1, y + 1, w - 2, h - 2, 25);
    ctx.stroke();
    ctx.fillStyle = color;
    roundRect(ctx, x + 26, y + 25, 7, h - 50, 4);
    ctx.fill();
    label(ctx, title, x + 54, y + 58, 19, 'rgba(233,240,249,.78)', 700);
    label(ctx, amount, x + 54, y + 132, fitFontSize(ctx, amount, w - 190, 58, 38, 800), '#fff', 800);
    label(ctx, caption, x + 56, y + 164, 17, 'rgba(233,240,249,.68)', 500);
    label(ctx, detail, x + 56, y + 199, fitFontSize(ctx, detail, w - 190, 18, 13, 600), 'rgba(245,248,252,.92)', 600);
    const cx = x + w - 77;
    const cy = y + 108;
    if (icon === 'coin') {
        ctx.beginPath();
        ctx.arc(cx, cy, 35, 0, Math.PI * 2);
        ctx.fillStyle = hexAlpha(color, .16);
        ctx.fill();
        ctx.strokeStyle = hexAlpha(color, .88);
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, 25, 0, Math.PI * 2);
        ctx.strokeStyle = hexAlpha(color, .56);
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, 6, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
    }
    else {
        const gem = ctx.createLinearGradient(cx - 28, cy - 30, cx + 28, cy + 30);
        gem.addColorStop(0, '#fff1be');
        gem.addColorStop(.5, color);
        gem.addColorStop(1, '#f59e0b');
        ctx.beginPath();
        ctx.moveTo(cx, cy - 36);
        ctx.lineTo(cx + 32, cy - 8);
        ctx.lineTo(cx + 22, cy + 26);
        ctx.lineTo(cx, cy + 39);
        ctx.lineTo(cx - 22, cy + 26);
        ctx.lineTo(cx - 32, cy - 8);
        ctx.closePath();
        ctx.fillStyle = hexAlpha(color, .2);
        ctx.fill();
        ctx.strokeStyle = gem;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx - 32, cy - 8);
        ctx.lineTo(cx + 32, cy - 8);
        ctx.moveTo(cx, cy - 36);
        ctx.lineTo(cx - 8, cy - 8);
        ctx.lineTo(cx, cy + 39);
        ctx.lineTo(cx + 8, cy - 8);
        ctx.strokeStyle = 'rgba(255,255,255,.55)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }
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
function fitFontSize(ctx, text, maxWidth, start, min, weight) { let size = start; while (size > min) {
    ctx.font = `${weight} ${size}px Arial, sans-serif`;
    if (ctx.measureText(text).width <= maxWidth)
        break;
    size -= 2;
} return size; }
function pill(ctx, text, x, y, color) { ctx.font = '600 14px Arial,sans-serif'; const w = ctx.measureText(text).width + 24; ctx.fillStyle = hexAlpha(color, .28); roundRect(ctx, x, y, w, 29, 14); ctx.fill(); label(ctx, text, x + 12, y + 20, 14, '#fff', 600); }
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function truncate(value, max) { return value.length > max ? `${value.slice(0, max - 1)}…` : value; }
function hexAlpha(value, alpha) { const hex = /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#8b75dc'; const num = parseInt(hex.slice(1), 16); return `rgba(${(num >> 16) & 255},${(num >> 8) & 255},${num & 255},${alpha})`; }
