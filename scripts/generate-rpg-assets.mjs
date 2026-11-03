import { mkdir, writeFile } from 'node:fs/promises';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { join } from 'node:path';

const root = process.cwd();
const petNames = [
  'zorrito-de-brasa', 'lunagato', 'dracon-de-musgo', 'ajolote-astral', 'cuervo-de-cristal', 'osito-trueno',
  'cierva-lunar', 'tortuga-nube', 'fenix-diminuto', 'lobo-de-escarcha', 'conejo-champinon', 'oveja-de-nube',
  'rana-de-cristal', 'golemito', 'espiritu-koi', 'murcielago-de-sombra', 'erizo-de-baya', 'buho-lunar',
  'caracol-jardin', 'abeja-dorada', 'pinguino-viajero', 'polilla-arcoiris', 'grifo-miniatura', 'serpiente-estelar',
  'salamandra-de-ceniza', 'cangrejo-coral', 'yak-musgoso', 'pavo-real-prisma', 'lagartija-cactus', 'medusa-burbuja',
  'lince-lavanda', 'raton-automata', 'liebre-de-nieve', 'carnero-trueno', 'luciernaga-farol', 'pulpo-de-tinta',
  'foca-aurora', 'pangolin-de-jade', 'fenec-del-desierto', 'grulla-de-papel', 'medusa-lunar', 'cachorro-girasol',
  'escarabajo-basalto', 'camaleon-del-viento', 'basilisco-pequeno', 'cisne-de-loto', 'ardilla-cometa', 'manta-de-opalo',
];
const atlasFiles = ['pets-atlas.png', 'pets-atlas-2.png'];
const petDir = join(root, 'assets', 'rpg', 'pets');
const eggDir = join(root, 'assets', 'rpg', 'eggs');
await mkdir(petDir, { recursive: true });
await mkdir(eggDir, { recursive: true });

function floodBackground(imageData, blurredData, width, height) {
  const pixels = imageData.data;
  const seen = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0; let tail = 0;
  const add = (index) => { if (!seen[index]) { seen[index] = 1; queue[tail++] = index; } };
  for (let x = 0; x < width; x++) { add(x); add((height - 1) * width + x); }
  for (let y = 1; y < height - 1; y++) { add(y * width); add(y * width + width - 1); }
  while (head < tail) {
    const index = queue[head++];
    const offset = index * 4;
    for (const next of [index - 1, index + 1, index - width, index + width]) {
      if (next < 0 || next >= width * height || seen[next]) continue;
      const other = next * 4;
      const blurredOffset = next * 4;
      const diff = Math.max(Math.abs(pixels[other] - blurredData[blurredOffset]), Math.abs(pixels[other + 1] - blurredData[blurredOffset + 1]), Math.abs(pixels[other + 2] - blurredData[blurredOffset + 2]));
      if (diff <= 25) add(next);
    }
  }
  for (let i = 0; i < seen.length; i++) if (seen[i]) pixels[i * 4 + 3] = 0;
  let alpha = new Uint8Array(seen.length);
  for (let i = 0; i < seen.length; i++) alpha[i] = pixels[i * 4 + 3] > 20 ? 1 : 0;
  for (let pass = 0; pass < 2; pass++) {
    const nextAlpha = alpha.slice();
    for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if (alpha[i] && (!alpha[i - 1] || !alpha[i + 1] || !alpha[i - width] || !alpha[i + width])) nextAlpha[i] = 0;
    }
    alpha = nextAlpha;
  }
  for (let i = 0; i < alpha.length; i++) if (!alpha[i]) pixels[i * 4 + 3] = 0;
  return imageData;
}

function cropCell(imageData, x, y, width, height) {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  const source = context.createImageData(width, height);
  for (let row = 0; row < height; row++) {
    const start = ((y + row) * imageData.width + x) * 4;
    source.data.set(imageData.data.subarray(start, start + width * 4), row * width * 4);
  }
  const blurredCanvas = createCanvas(width, height);
  const blurredContext = blurredCanvas.getContext('2d');
  blurredContext.filter = 'blur(24px)';
  const rawCanvas = createCanvas(width, height); rawCanvas.getContext('2d').putImageData(source, 0, 0);
  blurredContext.drawImage(rawCanvas, 0, 0);
  const blurredData = blurredContext.getImageData(0, 0, width, height).data;
  context.putImageData(floodBackground(source, blurredData, width, height), 0, 0);
  const pixels = context.getImageData(0, 0, width, height);
  let minX = width; let minY = height; let maxX = -1; let maxY = -1;
  for (let py = 0; py < height; py++) for (let px = 0; px < width; px++) {
    if (pixels.data[(py * width + px) * 4 + 3] > 20) { minX = Math.min(minX, px); minY = Math.min(minY, py); maxX = Math.max(maxX, px); maxY = Math.max(maxY, py); }
  }
  const padding = 8;
  minX = Math.max(0, minX - padding); minY = Math.max(0, minY - padding);
  maxX = Math.min(width - 1, maxX + padding); maxY = Math.min(height - 1, maxY + padding);
  const cropWidth = maxX - minX + 1; const cropHeight = maxY - minY + 1;
  const crop = context.getImageData(minX, minY, cropWidth, cropHeight);
  const size = 256; const inner = 232;
  const scale = Math.min(inner / cropWidth, inner / cropHeight);
  const drawWidth = Math.max(1, Math.round(cropWidth * scale)); const drawHeight = Math.max(1, Math.round(cropHeight * scale));
  const output = createCanvas(size, size); const out = output.getContext('2d');
  out.imageSmoothingEnabled = false;
  const temp = createCanvas(cropWidth, cropHeight); temp.getContext('2d').putImageData(crop, 0, 0);
  out.drawImage(temp, Math.round((size - drawWidth) / 2), Math.round((size - drawHeight) / 2), drawWidth, drawHeight);
  return output.toBuffer('image/png');
}

for (let atlasIndex = 0; atlasIndex < atlasFiles.length; atlasIndex++) {
  const image = await loadImage(join(root, 'assets', 'rpg', atlasFiles[atlasIndex]));
  const sourceCanvas = createCanvas(image.width, image.height);
  const sourceContext = sourceCanvas.getContext('2d');
  sourceContext.drawImage(image, 0, 0);
  const imageData = sourceContext.getImageData(0, 0, image.width, image.height);
  for (let localIndex = 0; localIndex < 24; localIndex++) {
    const index = atlasIndex * 24 + localIndex;
    const col = localIndex % 6; const row = Math.floor(localIndex / 6);
    const sprite = cropCell(imageData, col * 256, row * 256, 256, 256);
    await writeFile(join(petDir, `${petNames[index]}.png`), sprite);
  }
}

const eggs = await loadImage(join(root, 'assets', 'rpg', 'eggs.png'));
const eggCanvas = createCanvas(eggs.width, eggs.height);
eggCanvas.getContext('2d').drawImage(eggs, 0, 0);
const eggPixels = eggCanvas.getContext('2d').getImageData(0, 0, eggs.width, eggs.height);
const eggNames = ['comun', 'naturaleza', 'hielo', 'astral', 'legendario'];
const eggWidth = eggs.width / eggNames.length;
for (let index = 0; index < eggNames.length; index++) {
  const x = Math.round(index * eggWidth);
  const right = Math.round((index + 1) * eggWidth);
  const buffer = cropCell(eggPixels, x, 0, right - x, eggs.height);
  await writeFile(join(eggDir, `${eggNames[index]}.png`), buffer);
}

console.log(`Generated ${petNames.length} individual pet sprites and ${eggNames.length} egg sprites.`);
