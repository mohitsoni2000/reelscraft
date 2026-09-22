/**
 * One-off asset generator (NOT part of `npm run build`).
 *
 * Builds assets-src/images/pattern-glitter.png: the gold "glitter" texture behind
 * the hero. It takes the fan-line artwork (pattern.jpg) as a density map and
 * scatters wobbly gold specks along those arcs, with a thin scatter everywhere
 * else. A fixed seed makes the output deterministic.
 *
 *   node scripts/make-glitter.mjs
 *   npm run images        # then encode it like every other image
 *
 * Tweak the constants below and re-run to change the look.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(root, "assets-src/images/pattern.jpg");
const OUT = path.join(root, "assets-src/images/pattern-glitter.png");

const OUT_W = 1280;
const OUT_H = 849;
// Drawn at 2x and downsampled, which gives thin, anti-aliased outlines instead of stair-stepped pixels.
const SCALE = 2;
const W = OUT_W * SCALE;
const H = OUT_H * SCALE;
const SEED = 20260921;
const BASE_DENSITY = 0.008; // share of pixels that are "on" away from the arcs
const ARC_DENSITY = 0.45; // extra share on the arcs
const ARC_CONTRAST = 1.8; // >1 makes the arcs stand out more against the scatter
const BLOB = 1.5; // noise blur (drawn px): bigger = larger speck loops
const GOLD_DARK = [198, 160, 100];
const GOLD_LIGHT = [230, 200, 144];

/** Small deterministic PRNG so the texture is identical on every run. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const raw = (buf, channels = 1) => sharp(buf, { raw: { width: W, height: H, channels } });

/** Gaussian-blur a single-channel W*H buffer and return a single-channel W*H buffer (asserted). */
async function blurGrey(buf, sigma) {
  const { data, info } = await raw(buf).blur(sigma).greyscale().raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== 1 || data.length !== W * H) throw new Error(`unexpected blur output: ${info.channels} channels`);
  return data;
}

async function densityFromArcs() {
  const grey = await sharp(await readFile(SRC)).resize(W, H, { fit: "fill" }).greyscale().raw().toBuffer();
  const lines = Buffer.alloc(W * H);
  for (let i = 0; i < lines.length; i++) lines[i] = 255 - grey[i]; // dark lines -> bright
  const blurred = await blurGrey(lines, 6 * SCALE);
  const sorted = Uint8Array.from(blurred).sort();
  const p97 = sorted[Math.floor(sorted.length * 0.97)] || 1;
  const density = new Float32Array(W * H);
  for (let i = 0; i < density.length; i++) density[i] = Math.min(1, blurred[i] / p97);
  return density;
}

async function smoothNoise(rand) {
  const white = Buffer.alloc(W * H);
  for (let i = 0; i < white.length; i++) white[i] = (rand() * 256) | 0;
  const soft = await blurGrey(white, BLOB);
  // Rank-normalise so each value is its percentile (uniform 0..1).
  const hist = new Uint32Array(256);
  for (let i = 0; i < soft.length; i++) hist[soft[i]]++;
  const cdf = new Float32Array(256);
  let run = 0;
  for (let v = 0; v < 256; v++) {
    run += hist[v];
    cdf[v] = run / soft.length;
  }
  const out = new Float32Array(W * H);
  for (let i = 0; i < out.length; i++) out[i] = cdf[soft[i]];
  return out;
}

async function main() {
  const rand = mulberry32(SEED);
  const density = await densityFromArcs();
  const noise = await smoothNoise(rand);

  // "on" pixels: noise above a threshold that drops where the arcs are denser.
  const on = new Uint8Array(W * H);
  for (let i = 0; i < on.length; i++) {
    const share = BASE_DENSITY + ARC_DENSITY * Math.pow(density[i], ARC_CONTRAST);
    on[i] = noise[i] > 1 - share ? 1 : 0;
  }

  // Keep only the outline of each blob: thin wobbly loops instead of solid dots.
  const alpha = Buffer.alloc(W * H);
  const tone = new Float32Array(W * H);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (!on[i]) continue;
      const edge = !on[i - 1] || !on[i + 1] || !on[i - W] || !on[i + W];
      if (!edge) continue;
      alpha[i] = 170 + ((rand() * 85) | 0);
      tone[i] = rand();
    }
  }
  // A few isolated 2px flecks, more of them near the arcs.
  for (let n = 0; n < 6000; n++) {
    const x = 2 + ((rand() * (W - 4)) | 0);
    const y = 2 + ((rand() * (H - 4)) | 0);
    if (rand() > 0.25 + 0.75 * density[y * W + x]) continue;
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      alpha[(y + dy) * W + x + dx] = 210;
      tone[(y + dy) * W + x + dx] = rand();
    }
  }

  // Soften slightly so the 1px outlines anti-alias, then composite gold over white.
  const soft = await blurGrey(alpha, 0.7);
  const rgb = Buffer.alloc(W * H * 3);
  for (let i = 0; i < W * H; i++) {
    const a = Math.min(1, (soft[i] / 255) * 1.4);
    const t = tone[i];
    for (let c = 0; c < 3; c++) {
      const gold = GOLD_DARK[c] + (GOLD_LIGHT[c] - GOLD_DARK[c]) * t;
      rgb[i * 3 + c] = Math.round(255 * (1 - a) + gold * a);
    }
  }
  await raw(rgb, 3).resize(OUT_W, OUT_H, { kernel: "lanczos3" }).png({ compressionLevel: 9 }).toFile(OUT);
  console.log(`wrote ${path.relative(root, OUT)} (${OUT_W}x${OUT_H})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
