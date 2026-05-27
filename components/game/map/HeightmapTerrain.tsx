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

function terrainTypeToBiomeWeights(t: string): [number, number, number] {
  if (t === 'grass' || t === 'dirt' || t === 'sand') return [1, 0, 0];
  if (t === 'stone' || t === 'wood' || t === 'bridge') return [0, 1, 0];
  if (t === 'water' || t === 'ice' || t === 'swamp') return [0, 0, 1];
  if (t === 'snow') return [0.5, 0.5, 0];
  if (t === 'lava') return [0, 0, 1];
  if (t === 'carpet') return [1, 0, 0];
  return [0.7, 0.2, 0.1];
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
  const biomeWeights = new Float32Array(numVertices * 3);
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

      let wr = 0, wg = 0, wb = 0;
      for (const [cx, cz] of neighborCells) {
        const t = cellTerrainType(cells, tileMap, cols, rows, cx, cz);
        const [bwR, bwG, bwB] = terrainTypeToBiomeWeights(t);
        wr += bwR; wg += bwG; wb += bwB;
      }
      const total = wr + wg + wb;
      if (total > 0) {
        biomeWeights[vi * 3] = wr / total;
        biomeWeights[vi * 3 + 1] = wg / total;
        biomeWeights[vi * 3 + 2] = wb / total;
      } else {
        biomeWeights[vi * 3] = 1;
        biomeWeights[vi * 3 + 1] = 0;
        biomeWeights[vi * 3 + 2] = 0;
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
  geometry.setAttribute('biomeWeight', new THREE.BufferAttribute(biomeWeights, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();

  return geometry;
}

const texCache = new Map<string, THREE.CanvasTexture>();

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function createBiomeTexture(type: 'grass' | 'stone' | 'water'): THREE.CanvasTexture {
  const key = `biome_${type}`;
  let tex = texCache.get(key);
  if (tex) return tex;

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const rand = seededRandom(type === 'grass' ? 42 : type === 'stone' ? 137 : 99);

  if (type === 'grass') {
    ctx.fillStyle = '#4a8a2a';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 4000; i++) {
      const x = rand() * 256;
      const y = rand() * 256;
      const shade = rand() * 50 + 30;
      ctx.fillStyle = `rgb(${60 + shade}, ${130 + shade}, ${30 + shade})`;
      ctx.fillRect(x, y, 3 + rand() * 5, 4 + rand() * 6);
    }
  } else if (type === 'stone') {
    ctx.fillStyle = '#7a7a7a';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2000; i++) {
      const x = rand() * 256;
      const y = rand() * 256;
      const shade = rand() * 40 - 20;
      ctx.fillStyle = `rgb(${130 + shade}, ${130 + shade}, ${130 + shade})`;
      ctx.beginPath();
      ctx.arc(x, y, 3 + rand() * 8, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 30; i++) {
      const x = rand() * 256;
      const y = rand() * 256;
      ctx.strokeStyle = `rgba(60,60,60,${0.1 + rand() * 0.2})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + rand() * 40 - 20, y + rand() * 40 - 20);
      ctx.stroke();
    }
  } else if (type === 'water') {
    const grad = ctx.createLinearGradient(0, 0, 256, 256);
    grad.addColorStop(0, '#2a6a8a');
    grad.addColorStop(0.5, '#3a7a9a');
    grad.addColorStop(1, '#2a6a8a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 20; i++) {
      const y = rand() * 256;
      ctx.strokeStyle = `rgba(100,200,220,${0.1 + rand() * 0.15})`;
      ctx.lineWidth = 1 + rand() * 3;
      ctx.beginPath();
      for (let x = 0; x < 256; x += 2) {
        const wy = y + Math.sin(x * 0.05 + i) * 8 + Math.sin(x * 0.02 + i * 2) * 4;
        x === 0 ? ctx.moveTo(x, wy) : ctx.lineTo(x, wy);
      }
      ctx.stroke();
    }
  }

  tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  texCache.set(key, tex);
  return tex;
}

const matCache = new Map<string, THREE.ShaderMaterial>();

export function HeightmapTerrain({
  navGrid,
  tiles,
  dimensions,
  grassTexture: _gt,
  floorColor,
}: HeightmapTerrainProps) {
  const geometry = useMemo(() => {
    if (navGrid && navGrid.rows > 0 && navGrid.cols > 0) {
      return generateGeometry(navGrid, tiles);
    }
    return null;
  }, [navGrid, tiles]);

  const shaderMaterial = useMemo(() => {
    const grass = createBiomeTexture('grass');
    const stone = createBiomeTexture('stone');
    const water = createBiomeTexture('water');

    const key = 'terrain_shader_biome';
    let mat = matCache.get(key);
    if (mat) {
      return mat;
    }

    mat = new THREE.ShaderMaterial({
      uniforms: {
        grassTex: { value: grass },
        stoneTex: { value: stone },
        waterTex: { value: water },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vBiomeWeight;
        attribute vec3 biomeWeight;
        void main() {
          vUv = uv;
          vBiomeWeight = biomeWeight;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D grassTex;
        uniform sampler2D stoneTex;
        uniform sampler2D waterTex;
        varying vec2 vUv;
        varying vec3 vBiomeWeight;

        void main() {
          vec4 grass = texture2D(grassTex, vUv);
          vec4 stone = texture2D(stoneTex, vUv);
          vec4 water = texture2D(waterTex, vUv);
          float total = vBiomeWeight.x + vBiomeWeight.y + vBiomeWeight.z;
          if (total < 0.001) total = 1.0;
          vec4 color = (grass * vBiomeWeight.x + stone * vBiomeWeight.y + water * vBiomeWeight.z) / total;
          gl_FragColor = vec4(color.rgb, 1.0);
        }
      `,
    });

    matCache.set(key, mat);
    return mat;
  }, []);

  if (geometry) {
    return (
      <mesh
        geometry={geometry}
        receiveShadow
        frustumCulled={false}
        material={shaderMaterial}
      />
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
        roughness={0.8}
        metalness={0}
        color={floorColor}
      />
    </mesh>
  );
}
