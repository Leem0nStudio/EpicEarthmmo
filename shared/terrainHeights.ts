import type { NavGrid } from './schemas';

function hash(ix: number, iz: number): number {
  let h = (ix * 374761393 + iz * 668265263) | 0;
  h = ((h ^ (h >>> 13)) * 1274126177) | 0;
  return ((h ^ (h >>> 16)) & 0x7fffffff) / 0x7fffffff;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function valueNoise(x: number, z: number, scale: number): number {
  const sx = x / scale;
  const sz = z / scale;
  const ix = Math.floor(sx);
  const iz = Math.floor(sz);
  const fx = sx - ix;
  const fz = sz - iz;
  const sx2 = smoothstep(fx);
  const sz2 = smoothstep(fz);

  const v00 = hash(ix, iz);
  const v10 = hash(ix + 1, iz);
  const v01 = hash(ix, iz + 1);
  const v11 = hash(ix + 1, iz + 1);

  return lerp(lerp(v00, v10, sx2), lerp(v01, v11, sx2), sz2);
}

function fbm(x: number, z: number, octaves: number): number {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxVal = 0;
  for (let i = 0; i < octaves; i++) {
    value += amplitude * valueNoise(x, z, frequency * 8);
    maxVal += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return value / maxVal;
}

const TERRAIN_BASE_HEIGHTS: Record<string, number> = {
  grass: 0,
  dirt: 0.1,
  stone: 0.5,
  sand: -0.1,
  snow: 1.2,
  water: -0.5,
  lava: -0.3,
  wood: 0,
  carpet: 0,
  ice: 0.3,
  swamp: -0.2,
  bridge: 0,
};

const TERRAIN_AMP: Record<string, number> = {
  grass: 0.6,
  dirt: 0.8,
  stone: 1.0,
  sand: 0.3,
  snow: 1.5,
  water: 0.1,
  lava: 0.2,
  wood: 0.3,
  carpet: 0.1,
  ice: 0.4,
  swamp: 0.3,
  bridge: 0.1,
};

export function populateTerrainHeights(navGrid: NavGrid): NavGrid {
  const { rows, cols, cells } = navGrid;

  for (let gz = 0; gz < rows; gz++) {
    for (let gx = 0; gx < cols; gx++) {
      const idx = gz * cols + gx;
      const cell = cells[idx];
      if (!cell) continue;

      const baseHeight = TERRAIN_BASE_HEIGHTS[cell.terrainType] ?? 0;
      const amplitude = TERRAIN_AMP[cell.terrainType] ?? 0.5;

      const noiseVal = fbm(gx, gz, 4);
      const height = baseHeight + amplitude * (noiseVal * 2 - 1);

      const minH = cell.isWater ? -0.5 : -0.3;
      const maxH = cell.terrainType === 'snow' ? 3.0 : 2.0;
      cell.height = Math.max(minH, Math.min(maxH, Math.round(height * 100) / 100));
    }
  }

  return navGrid;
}

export function normalizeHeights(navGrid: NavGrid): NavGrid {
  const { rows, cols, cells } = navGrid;
  let minH = Infinity;
  let maxH = -Infinity;

  for (let i = 0; i < cells.length; i++) {
    const h = cells[i]?.height ?? 0;
    if (h < minH) minH = h;
    if (h > maxH) maxH = h;
  }

  const range = maxH - minH;
  if (range < 0.01) return navGrid;

  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    if (!cell) continue;
    cell.height = ((cell.height - minH) / range) * 2.0;
  }

  return navGrid;
}
