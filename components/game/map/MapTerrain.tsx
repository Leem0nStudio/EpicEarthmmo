'use client';

import React, { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { RigidBody } from '@react-three/rapier';
import type { Tile } from '@/shared/schemas';

const textureCache: Record<string, THREE.CanvasTexture> = {};
const materialCache: Record<string, THREE.MeshStandardMaterial> = {};
const geoCache: Record<string, THREE.PlaneGeometry> = {};
const grassTextureCache: Record<string, THREE.CanvasTexture> = {};

const TERRAIN_COLORS: Record<string, string> = {
  grass: '#5a9a3a', dirt: '#8a6a4a', stone: '#888890', sand: '#d4b87a',
  snow: '#e8eef4', water: '#4488aa', lava: '#cc4400', wood: '#8a6432',
  carpet: '#aa3a3a', ice: '#aaddcc', swamp: '#5a6a3a', bridge: '#9a7a5a',
};

function getPlaneGeometry(tileSize: number): THREE.PlaneGeometry {
  const key = `plane_${tileSize}`;
  if (!geoCache[key]) {
    geoCache[key] = new THREE.PlaneGeometry(tileSize, tileSize);
  }
  return geoCache[key];
}

function createTerrainTexture(terrainType: string, baseColor: string): THREE.CanvasTexture {
  const key = `${terrainType}_${baseColor}`;
  if (textureCache[key]) return textureCache[key];

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, 128, 128);

  const noiseCount = terrainType === 'water' ? 500 : 2000;
  for (let i = 0; i < noiseCount; i++) {
    const x = Math.random() * 128;
    const y = Math.random() * 128;
    const shade = Math.random() * 40 - 20;

    if (terrainType === 'water') {
      const waveOffset = Math.sin(x * 0.1) * 10;
      ctx.fillStyle = `rgba(${100 + shade}, ${150 + shade + waveOffset}, ${200 + shade}, 0.6)`;
      ctx.fillRect(x, y, 3, 2);
    } else if (terrainType === 'grass') {
      ctx.fillStyle = `rgb(${80 + shade}, ${140 + shade}, ${50 + shade})`;
      ctx.fillRect(x, y, 2, 4 + Math.random() * 3);
    } else if (terrainType === 'dirt') {
      ctx.fillStyle = `rgb(${120 + shade}, ${90 + shade}, ${60 + shade})`;
      ctx.fillRect(x, y, 3, 3);
    } else if (terrainType === 'stone') {
      ctx.fillStyle = `rgb(${130 + shade}, ${130 + shade}, ${135 + shade})`;
      ctx.fillRect(x, y, 2 + Math.random() * 3, 2 + Math.random() * 3);
    } else if (terrainType === 'sand') {
      ctx.fillStyle = `rgb(${210 + shade}, ${190 + shade}, ${140 + shade})`;
      ctx.fillRect(x, y, 2, 2);
    } else if (terrainType === 'snow') {
      ctx.fillStyle = `rgb(${240 + shade}, ${245 + shade}, ${250 + shade})`;
      ctx.fillRect(x, y, 2, 2);
    } else if (terrainType === 'ice') {
      ctx.fillStyle = `rgba(${180 + shade}, ${220 + shade}, ${240 + shade}, 0.7)`;
      ctx.fillRect(x, y, 4, 2);
    } else if (terrainType === 'swamp') {
      ctx.fillStyle = `rgb(${80 + shade}, ${100 + shade}, ${60 + shade})`;
      ctx.fillRect(x, y, 3, 3);
    } else if (terrainType === 'wood') {
      ctx.fillStyle = `rgb(${140 + shade}, ${100 + shade}, ${60 + shade})`;
      ctx.fillRect(x, y, 8, 2);
    } else if (terrainType === 'carpet') {
      ctx.fillStyle = `rgb(${160 + shade}, ${60 + shade}, ${60 + shade})`;
      ctx.fillRect(x, y, 2, 2);
    } else if (terrainType === 'lava') {
      ctx.fillStyle = `rgb(${200 + shade}, ${80 + shade}, ${20 + shade})`;
      ctx.fillRect(x, y, 3, 3);
    } else {
      ctx.fillStyle = `rgb(${128 + shade}, ${128 + shade}, ${128 + shade})`;
      ctx.fillRect(x, y, 2, 2);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  textureCache[key] = tex;
  return tex;
}

function getTerrainMaterial(terrainType: string): THREE.MeshStandardMaterial {
  if (materialCache[terrainType]) return materialCache[terrainType];

  const color = TERRAIN_COLORS[terrainType] ?? '#888888';
  const tex = createTerrainTexture(terrainType, color);
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, metalness: 0 });
  materialCache[terrainType] = mat;
  return mat;
}

function createGrassTexture(baseColor: string, repeatX: number, repeatY: number): THREE.CanvasTexture {
  const cacheKey = `${baseColor}_${repeatX}_${repeatY}`;
  if (grassTextureCache[cacheKey]) return grassTextureCache[cacheKey];

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
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  grassTextureCache[cacheKey] = tex;
  return tex;
}

function tileWorldX(col: number, tileSize: number, offsetX: number): number {
  return col * tileSize + offsetX + tileSize / 2;
}

function tileWorldZ(row: number, tileSize: number, offsetZ: number): number {
  return row * tileSize + offsetZ + tileSize / 2;
}

interface InstancedTerrainGroupProps {
  terrainType: string;
  instances: Array<{ col: number; row: number; height: number }>;
  tileSize: number;
  worldOffsetX: number;
  worldOffsetZ: number;
}

function InstancedTerrainGroup({ terrainType, instances, tileSize, worldOffsetX, worldOffsetZ }: InstancedTerrainGroupProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const mat = getTerrainMaterial(terrainType);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const m = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const rot = new THREE.Euler(-Math.PI / 2, 0, 0);
    const quat = new THREE.Quaternion().setFromEuler(rot);
    const scl = new THREE.Vector3(1, 1, 1);

    for (let i = 0; i < instances.length; i++) {
      const inst = instances[i];
      pos.set(
        tileWorldX(inst.col, tileSize, worldOffsetX),
        inst.height - 0.01,
        tileWorldZ(inst.row, tileSize, worldOffsetZ),
      );
      m.compose(pos, quat, scl);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [instances, tileSize, worldOffsetX, worldOffsetZ]);

  if (instances.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[getPlaneGeometry(tileSize), mat, instances.length]}
      receiveShadow
    />
  );
}

interface BlendedTileProps {
  tile: Tile;
  tileSize: number;
  worldOffsetX: number;
  worldOffsetZ: number;
  neighbors: { north?: string; south?: string; east?: string; west?: string };
}

function BlendedTile({ tile, tileSize, worldOffsetX, worldOffsetZ, neighbors }: BlendedTileProps) {
  const tex = useMemo(() => {
    const color = TERRAIN_COLORS[tile.terrainType] ?? '#888888';
    const baseTex = createTerrainTexture(tile.terrainType, color);

    const key = `blend_${tile.terrainType}_${tile.blendNorth}_${tile.blendSouth}_${tile.blendEast}_${tile.blendWest}_${JSON.stringify(neighbors)}`;
    if (textureCache[key]) return textureCache[key];

    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    ctx.drawImage(baseTex.image as HTMLCanvasElement, 0, 0);

    const edgeSize = 16;
    if (tile.blendNorth > 0 && neighbors.north) {
      const gradient = ctx.createLinearGradient(0, 0, 0, edgeSize);
      gradient.addColorStop(0, `rgba(0,0,0,${tile.blendNorth * 0.4})`);
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 128, edgeSize);
    }
    if (tile.blendSouth > 0 && neighbors.south) {
      const gradient = ctx.createLinearGradient(0, 128 - edgeSize, 0, 128);
      gradient.addColorStop(0, 'rgba(0,0,0,0)');
      gradient.addColorStop(1, `rgba(0,0,0,${tile.blendSouth * 0.4})`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 128 - edgeSize, 128, edgeSize);
    }
    if (tile.blendEast > 0 && neighbors.east) {
      const gradient = ctx.createLinearGradient(128 - edgeSize, 0, 128, 0);
      gradient.addColorStop(0, 'rgba(0,0,0,0)');
      gradient.addColorStop(1, `rgba(0,0,0,${tile.blendEast * 0.4})`);
      ctx.fillStyle = gradient;
      ctx.fillRect(128 - edgeSize, 0, edgeSize, 128);
    }
    if (tile.blendWest > 0 && neighbors.west) {
      const gradient = ctx.createLinearGradient(0, 0, edgeSize, 0);
      gradient.addColorStop(0, 'rgba(0,0,0,0)');
      gradient.addColorStop(1, `rgba(0,0,0,${tile.blendWest * 0.4})`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, edgeSize, 128);
    }

    const tex2 = new THREE.CanvasTexture(canvas);
    tex2.wrapS = tex2.wrapT = THREE.RepeatWrapping;
    textureCache[key] = tex2;
    return tex2;
  }, [tile.terrainType, tile.blendNorth, tile.blendSouth, tile.blendEast, tile.blendWest, neighbors]);

  const wx = tileWorldX(tile.position[0], tileSize, worldOffsetX);
  const wz = tileWorldZ(tile.position[1], tileSize, worldOffsetZ);

  return (
    <mesh position={[wx, tile.height - 0.01, wz]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[tileSize, tileSize]} />
      <meshStandardMaterial map={tex} roughness={0.8} metalness={0} />
    </mesh>
  );
}

interface MapTerrainProps {
  tiles: Tile[];
  dimensions: { width: number; height: number };
  grassTexture: { baseColor: string; repeatX: number; repeatY: number };
  floorColor: string;
  tileSize?: number;
  worldOffsetX?: number;
  worldOffsetZ?: number;
  onPointerDown?: (e: any) => void;
}

export function MapTerrain({ tiles, dimensions, grassTexture, floorColor, tileSize = 1, worldOffsetX = 0, worldOffsetZ = 0, onPointerDown }: MapTerrainProps) {
  const { plainGroups, blendedTiles } = useMemo(() => {
    const tileMap = new Map<string, Tile>();
    for (const tile of tiles) {
      tileMap.set(`${tile.position[0]},${tile.position[1]}`, tile);
    }

    const plainByType = new Map<string, Array<{ col: number; row: number; height: number }>>();
    const blended: Array<{ tile: Tile; neighbors: { north?: string; south?: string; east?: string; west?: string } }> = [];

    for (const tile of tiles) {
      const hasBlend = tile.blendNorth > 0 || tile.blendSouth > 0 || tile.blendEast > 0 || tile.blendWest > 0;

      if (hasBlend) {
        const [tx, tz] = tile.position;
        const north = tileMap.get(`${tx},${tz - 1}`);
        const south = tileMap.get(`${tx},${tz + 1}`);
        const east = tileMap.get(`${tx + 1},${tz}`);
        const west = tileMap.get(`${tx - 1},${tz}`);
        blended.push({
          tile,
          neighbors: {
            north: north?.terrainType,
            south: south?.terrainType,
            east: east?.terrainType,
            west: west?.terrainType,
          },
        });
      } else {
        const group = plainByType.get(tile.terrainType);
        if (group) {
          group.push({ col: tile.position[0], row: tile.position[1], height: tile.height });
        } else {
          plainByType.set(tile.terrainType, [{ col: tile.position[0], row: tile.position[1], height: tile.height }]);
        }
      }
    }

    return { plainGroups: plainByType, blendedTiles: blended };
  }, [tiles]);

  const hasTiles = tiles.length > 0;

  if (!hasTiles) {
    const tex = createGrassTexture(grassTexture.baseColor, grassTexture.repeatX, grassTexture.repeatY);
    return (
      <RigidBody type="fixed">
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} onPointerDown={onPointerDown} receiveShadow>
          <planeGeometry args={[dimensions.width, dimensions.height]} />
          <meshStandardMaterial map={tex} roughness={0.8} metalness={0} color={floorColor} />
        </mesh>
      </RigidBody>
    );
  }

  return (
    <group>
      {Array.from(plainGroups.entries()).map(([terrainType, instances]) => (
        <InstancedTerrainGroup
          key={terrainType}
          terrainType={terrainType}
          instances={instances}
          tileSize={tileSize}
          worldOffsetX={worldOffsetX}
          worldOffsetZ={worldOffsetZ}
        />
      ))}
      {blendedTiles.map(({ tile, neighbors }, i) => (
        <BlendedTile
          key={`blend-${i}`}
          tile={tile}
          tileSize={tileSize}
          worldOffsetX={worldOffsetX}
          worldOffsetZ={worldOffsetZ}
          neighbors={neighbors}
        />
      ))}
    </group>
  );
}
