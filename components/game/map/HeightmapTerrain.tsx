'use client';

import React, { useMemo } from 'react';
import * as THREE from 'three';
import type { NavGrid, Tile } from '@/shared/schemas';

interface HeightmapTerrainProps {
  navGrid: NavGrid | null;
  tiles: Tile[];
  dimensions: { width: number; height: number };
  grassTexture: { baseColor: string; repeatX: number; repeatY: number };
  floorColor: string;
}

function cellHeight(cells: NavGrid['cells'], cols: number, rows: number, gx: number, gz: number): number {
  if (gx < 0 || gx >= cols || gz < 0 || gz >= rows) return 0;
  const c = cells[gz * cols + gx];
  return c ? c.height : 0;
}

function cellTerrainType(cells: NavGrid['cells'], tileMap: Map<string, Tile>, cols: number, rows: number, gx: number, gz: number): string {
  if (gx >= 0 && gx < cols && gz >= 0 && gz < rows) {
    const cell = cells[gz * cols + gx];
    if (cell?.terrainType) return cell.terrainType;
  }
  const tile = tileMap.get(`${gx},${gz}`);
  return tile ? tile.terrainType : 'grass';
}

const TERRAIN_VERTEX_COLORS: Record<string, [number, number, number]> = {
  grass: [0.30, 0.62, 0.22],
  dirt: [0.52, 0.40, 0.28],
  stone: [0.55, 0.55, 0.58],
  sand: [0.82, 0.72, 0.48],
  snow: [0.90, 0.93, 0.95],
  water: [0.25, 0.50, 0.65],
  lava: [0.80, 0.25, 0.00],
  wood: [0.55, 0.40, 0.20],
  carpet: [0.65, 0.22, 0.22],
  ice: [0.65, 0.85, 0.80],
  swamp: [0.35, 0.40, 0.20],
  bridge: [0.60, 0.48, 0.35],
};

function getVertexColor(type: string): [number, number, number] {
  return TERRAIN_VERTEX_COLORS[type] ?? [0.35, 0.60, 0.23];
}

function generateGeometry(navGrid: NavGrid, tiles: Tile[]): THREE.BufferGeometry {
  const { rows, cols, cellSize, cells } = navGrid;
  const halfW = (cols * cellSize) / 2;
  const halfH = (rows * cellSize) / 2;

  const tileMap = new Map<string, Tile>();
  for (const tile of tiles) {
    tileMap.set(`${tile.position[0]},${tile.position[1]}`, tile);
  }

  const vertexCols = cols + 1;
  const vertexRows = rows + 1;
  const numVertices = vertexCols * vertexRows;
  const numCells = rows * cols;

  const positions = new Float32Array(numVertices * 3);
  const uvs = new Float32Array(numVertices * 2);
  const colors = new Float32Array(numVertices * 3);
  const indices = new Uint32Array(numCells * 6);

  for (let vz = 0; vz < vertexRows; vz++) {
    for (let vx = 0; vx < vertexCols; vx++) {
      const vi = vz * vertexCols + vx;
      const wx = vx * cellSize - halfW;
      const wz = vz * cellSize - halfH;

      const h: number[] = [];
      if (vx > 0 && vz > 0) h.push(cellHeight(cells, cols, rows, vx - 1, vz - 1));
      if (vx < cols && vz > 0) h.push(cellHeight(cells, cols, rows, vx, vz - 1));
      if (vx > 0 && vz < rows) h.push(cellHeight(cells, cols, rows, vx - 1, vz));
      if (vx < cols && vz < rows) h.push(cellHeight(cells, cols, rows, vx, vz));
      const height = h.length > 0 ? h.reduce((a, b) => a + b, 0) / h.length : 0;

      positions[vi * 3] = wx;
      positions[vi * 3 + 1] = height;
      positions[vi * 3 + 2] = wz;

      uvs[vi * 2] = (wx + halfW) / (cols * cellSize);
      uvs[vi * 2 + 1] = (wz + halfH) / (rows * cellSize);

      const neighborCells: Array<[number, number]> = [];
      if (vx > 0 && vz > 0) neighborCells.push([vx - 1, vz - 1]);
      if (vx < cols && vz > 0) neighborCells.push([vx, vz - 1]);
      if (vx > 0 && vz < rows) neighborCells.push([vx - 1, vz]);
      if (vx < cols && vz < rows) neighborCells.push([vx, vz]);

      let r = 0, g = 0, b = 0;
      for (const [cx, cz] of neighborCells) {
        const t = cellTerrainType(cells, tileMap, cols, rows, cx, cz);
        const [cr, cg, cb] = getVertexColor(t);
        r += cr; g += cg; b += cb;
      }
      const n = neighborCells.length;
      if (n > 0) {
        colors[vi * 3] = r / n;
        colors[vi * 3 + 1] = g / n;
        colors[vi * 3 + 2] = b / n;
      } else {
        colors[vi * 3] = 0.35;
        colors[vi * 3 + 1] = 0.60;
        colors[vi * 3 + 2] = 0.23;
      }
    }
  }

  let ii = 0;
  for (let gz = 0; gz < rows; gz++) {
    for (let gx = 0; gx < cols; gx++) {
      const tl = gz * vertexCols + gx;
      const tr = gz * vertexCols + gx + 1;
      const bl = (gz + 1) * vertexCols + gx;
      const br = (gz + 1) * vertexCols + gx + 1;
      indices[ii++] = tl;
      indices[ii++] = tr;
      indices[ii++] = bl;
      indices[ii++] = tr;
      indices[ii++] = br;
      indices[ii++] = bl;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}

const texCache = new Map<string, THREE.CanvasTexture>();

function createBaseTexture(baseColor: string, repeatX: number, repeatY: number): THREE.CanvasTexture {
  const key = `${baseColor}_${repeatX}_${repeatY}`;
  let tex = texCache.get(key);
  if (tex) return tex;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3000; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const shade = Math.random() * 60;
    ctx.fillStyle = `rgb(${100 + shade}, ${170 + shade}, ${60 + shade})`;
    ctx.fillRect(x, y, 2, 4 + Math.random() * 4);
  }
  tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  texCache.set(key, tex);
  return tex;
}

export function HeightmapTerrain({
  navGrid,
  tiles,
  dimensions,
  grassTexture,
  floorColor,
}: HeightmapTerrainProps) {

  const geometry = useMemo(() => {
    if (navGrid && navGrid.rows > 0 && navGrid.cols > 0) {
      return generateGeometry(navGrid, tiles);
    }
    return null;
  }, [navGrid, tiles]);

  const baseTex = useMemo(
    () => createBaseTexture(grassTexture.baseColor, grassTexture.repeatX, grassTexture.repeatY),
    [grassTexture.baseColor, grassTexture.repeatX, grassTexture.repeatY],
  );

  if (geometry) {
    return (
      <mesh
        geometry={geometry}
        receiveShadow
        frustumCulled={false}
      >
        <meshStandardMaterial
          map={baseTex}
          vertexColors={true}
          roughness={0.85}
          metalness={0}
          flatShading={false}
        />
      </mesh>
    );
  }

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, -0.01, 0]}
      receiveShadow
    >
      <planeGeometry args={[dimensions.width, dimensions.height]} />
      <meshStandardMaterial
        map={baseTex}
        roughness={0.8}
        metalness={0}
        color={floorColor}
      />
    </mesh>
  );
}
