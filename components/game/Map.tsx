'use client';

import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { RigidBody } from '@react-three/rapier';
import { DamageNumbers } from './DamageNumbers';
import { WarpPortal } from './WarpPortal';
import { useNetworkStore } from '@/store/useNetworkStore';
import { useGameStore } from '@/store/useGameStore';
import { TerrainRenderer } from './TerrainRenderer';
import { MapLayers, EnvironmentLayer, LightingLayer } from './MapLayers';
import { SortedEntities } from './SpriteEntity';
import { findPath, smoothPath, createNavGridFromConfig, worldToGrid, gridToWorld } from '@/lib/navGrid';
import { computeChunks, getVisibleChunks, getActiveRegions } from '@/lib/chunkSystem';
import { currentNavGrid } from '@/lib/currentNavGrid';
import type { MapDecoration, Tile, NavGrid, MapRegion, MapTrigger, BakedLighting } from '@/shared/schemas';

const grassTextureCache: Record<string, THREE.CanvasTexture> = {};

function createGrassTexture(grassTexture: { baseColor: string; repeatX: number; repeatY: number }): THREE.CanvasTexture {
  const cacheKey = `${grassTexture.baseColor}_${grassTexture.repeatX}_${grassTexture.repeatY}`;
  if (grassTextureCache[cacheKey]) return grassTextureCache[cacheKey];

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = grassTexture.baseColor;
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
  tex.repeat.set(grassTexture.repeatX, grassTexture.repeatY);
  grassTextureCache[cacheKey] = tex;
  return tex;
}

type DecoType = 'tree' | 'bush' | 'rock' | 'flower' | 'building' | 'fence' | 'well' | 'sign' | 'castle' | 'castle_tower_left' | 'castle_tower_right' | 'castle_gate' | 'building_large' | 'building_medium' | 'building_small' | 'fountain' | 'stone_path' | 'lamppost' | 'bench' | 'tree_ornamental' | 'torch' | 'pillar' | 'mushroom' | 'crack' | 'chest' | 'dungeon_wall' | 'dungeon_floor_tile';

const DECO_SHADOW_SIZES: Partial<Record<DecoType, number>> = {
  tree: 2, tree_ornamental: 1.5, bush: 1, rock: 0.6,
  castle: 6, castle_tower_left: 3, castle_tower_right: 3, castle_gate: 2.5,
  building_large: 3.5, building_medium: 2.5, building_small: 2,
  fountain: 1.8, lamppost: 0.5, bench: 1, fence: 1.5,
  well: 1, sign: 0.5, torch: 0.3, pillar: 0.8,
  mushroom: 0.4, chest: 0.8,
};

export const Decoration = React.memo(function Decoration({ position, scale = 1, type = 'tree', hasCollision = false }: { position: [number, number, number]; scale?: number; type?: DecoType; hasCollision?: boolean }) {
  const variant = useMemo(() => Math.floor(Math.random() * 3), []);

  // Decoration visibility is handled by the parent MapLayers LOD pass,
  // so this component remains pure and can skip re-renders when props are stable.
  const shadowSize = DECO_SHADOW_SIZES[type];
  const shadow = shadowSize ? (
    <mesh position={[position[0], 0.01, position[2]]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[shadowSize * scale, shadowSize * scale]} />
      <meshBasicMaterial color="black" transparent opacity={0.15} depthWrite={false} />
    </mesh>
  ) : null;

  const content = (
    <>
      {shadow}
      {type === 'tree' && (
        <group position={position}>
          <mesh position={[0, 0.5 * scale, 0]} castShadow><cylinderGeometry args={[0.08 * scale, 0.15 * scale, 1 * scale, 6]} /><meshStandardMaterial color="#6B4226" /></mesh>
          <mesh position={[0, 1.2 * scale + 0.3 * scale, 0]} castShadow><coneGeometry args={[1.2 * scale, 1.0 * scale, 8]} /><meshStandardMaterial color={['#2d7d2d', '#358535', '#3d8d3d'][variant]} /></mesh>
          <mesh position={[0.2 * scale, 1.8 * scale, 0.2 * scale]} castShadow><coneGeometry args={[0.8 * scale, 0.8 * scale, 8]} /><meshStandardMaterial color={['#3d8d3d', '#459545', '#4d9d4d'][variant]} /></mesh>
        </group>
      )}
      {type === 'tree_ornamental' && (
        <group position={position}>
          <mesh position={[0, 0.4 * scale, 0]} castShadow><cylinderGeometry args={[0.06 * scale, 0.12 * scale, 0.8 * scale, 6]} /><meshStandardMaterial color="#8B6914" /></mesh>
          <mesh position={[0, 1.0 * scale, 0]} castShadow><sphereGeometry args={[0.6 * scale, 8, 6]} /><meshStandardMaterial color={['#3a8a3a', '#4a9a4a', '#2d7d2d'][variant]} /></mesh>
        </group>
      )}
      {type === 'bush' && <mesh position={position} castShadow><sphereGeometry args={[0.5 * scale, 6, 6]} /><meshStandardMaterial color={['#3a8a3a', '#4a9a4a', '#5aaa5a'][variant]} /></mesh>}
      {type === 'rock' && <mesh position={[position[0], position[1] + 0.15 * scale, position[2]]} castShadow><dodecahedronGeometry args={[0.3 * scale, 0]} /><meshStandardMaterial color={['#777', '#888', '#999'][variant]} roughness={0.9} /></mesh>}
      {type === 'flower' && (() => { const color = ['#ff6b8a', '#ffeb3b', '#ff8a65', '#e040fb', '#40c4ff'][variant]; return (<group position={position}><mesh position={[0, 0.15 * scale, 0]}><planeGeometry args={[0.2 * scale, 0.3 * scale]} /><meshBasicMaterial color="#4a8a3a" depthWrite={false} /></mesh><mesh position={[0, 0.35 * scale, 0]}><planeGeometry args={[0.3 * scale, 0.3 * scale]} /><meshBasicMaterial color={color} depthWrite={false} /></mesh></group>); })()}
      {type === 'castle' && (<group position={position}><mesh position={[0, 3 * scale, 0]} castShadow><boxGeometry args={[12 * scale, 6 * scale, 6 * scale]} /><meshStandardMaterial color="#d4c4a8" /></mesh><mesh position={[0, 6.5 * scale, 0]} castShadow><boxGeometry args={[13 * scale, 1 * scale, 7 * scale]} /><meshStandardMaterial color="#c4b498" /></mesh><mesh position={[0, 7 * scale, -1 * scale]} castShadow><coneGeometry args={[2 * scale, 2 * scale, 4]} /><meshStandardMaterial color="#8b0000" /></mesh></group>)}
      {type === 'castle_tower_left' && (<group position={position}><mesh position={[-5 * scale, 4 * scale, -2 * scale]} castShadow><cylinderGeometry args={[1.5 * scale, 1.8 * scale, 8 * scale, 8]} /><meshStandardMaterial color="#d4c4a8" /></mesh><mesh position={[-5 * scale, 8.5 * scale, -2 * scale]} castShadow><coneGeometry args={[2 * scale, 2 * scale, 8]} /><meshStandardMaterial color="#8b0000" /></mesh></group>)}
      {type === 'castle_tower_right' && (<group position={position}><mesh position={[5 * scale, 4 * scale, -2 * scale]} castShadow><cylinderGeometry args={[1.5 * scale, 1.8 * scale, 8 * scale, 8]} /><meshStandardMaterial color="#d4c4a8" /></mesh><mesh position={[5 * scale, 8.5 * scale, -2 * scale]} castShadow><coneGeometry args={[2 * scale, 2 * scale, 8]} /><meshStandardMaterial color="#8b0000" /></mesh></group>)}
      {type === 'castle_gate' && (<group position={position}><mesh position={[0, 1.5 * scale, -2.5 * scale]} castShadow><boxGeometry args={[4 * scale, 3 * scale, 1 * scale]} /><meshStandardMaterial color="#8B6914" /></mesh><mesh position={[0, 2.5 * scale, -2.8 * scale]}><boxGeometry args={[3 * scale, 2 * scale, 0.3 * scale]} /><meshStandardMaterial color="#5a4a2a" /></mesh></group>)}
      {type === 'building_large' && (<group position={position}><mesh position={[0, 2 * scale, 0]} castShadow><boxGeometry args={[5 * scale, 4 * scale, 4 * scale]} /><meshStandardMaterial color={['#c4a882', '#b89b78', '#d0b892'][variant]} /></mesh><mesh position={[0, 4.3 * scale, 0]} castShadow><coneGeometry args={[3.5 * scale, 1.5 * scale, 4]} /><meshStandardMaterial color={['#8b4513', '#a0522d', '#6b3410'][variant]} /></mesh><mesh position={[0, 1.5 * scale, 2.01 * scale]}><boxGeometry args={[1 * scale, 1.5 * scale, 0.1 * scale]} /><meshStandardMaterial color="#5a4a2a" /></mesh></group>)}
      {type === 'building_medium' && (<group position={position}><mesh position={[0, 1.5 * scale, 0]} castShadow><boxGeometry args={[4 * scale, 3 * scale, 3 * scale]} /><meshStandardMaterial color={['#c4a882', '#b89b78', '#d0b892'][variant]} /></mesh><mesh position={[0, 3.3 * scale, 0]} castShadow><coneGeometry args={[2.8 * scale, 1.2 * scale, 4]} /><meshStandardMaterial color={['#8b4513', '#a0522d', '#6b3410'][variant]} /></mesh></group>)}
      {type === 'building_small' && (<group position={position}><mesh position={[0, 1 * scale, 0]} castShadow><boxGeometry args={[3 * scale, 2 * scale, 2.5 * scale]} /><meshStandardMaterial color={['#d4b896', '#c4a882', '#b89b78'][variant]} /></mesh><mesh position={[0, 2.2 * scale, 0]} castShadow><coneGeometry args={[2.2 * scale, 0.8 * scale, 4]} /><meshStandardMaterial color={['#8b4513', '#a0522d', '#6b3410'][variant]} /></mesh></group>)}
      {type === 'fountain' && (<group position={position}><mesh position={[0, 0.3 * scale, 0]} castShadow><cylinderGeometry args={[1.5 * scale, 1.8 * scale, 0.6 * scale, 12]} /><meshStandardMaterial color="#999999" /></mesh><mesh position={[0, 0.6 * scale, 0]} castShadow><cylinderGeometry args={[1.3 * scale, 1.3 * scale, 0.1 * scale, 12]} /><meshStandardMaterial color="#4488cc" transparent opacity={0.7} /></mesh><mesh position={[0, 1.2 * scale, 0]} castShadow><cylinderGeometry args={[0.1 * scale, 0.15 * scale, 1.2 * scale, 6]} /><meshStandardMaterial color="#aaaaaa" /></mesh><mesh position={[0, 1.8 * scale, 0]} castShadow><sphereGeometry args={[0.3 * scale, 8, 8]} /><meshStandardMaterial color="#bbbbbb" /></mesh></group>)}
      {type === 'stone_path' && (<group position={position}><mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[2 * scale, 2 * scale]} /><meshStandardMaterial color="#b8a898" roughness={0.9} /></mesh></group>)}
      {type === 'lamppost' && (<group position={position}><mesh position={[0, 1.5 * scale, 0]} castShadow><cylinderGeometry args={[0.05 * scale, 0.08 * scale, 3 * scale, 6]} /><meshStandardMaterial color="#444444" /></mesh><mesh position={[0, 3.1 * scale, 0]}><sphereGeometry args={[0.2 * scale, 8, 8]} /><meshStandardMaterial color="#ffdd88" emissive="#ffaa44" emissiveIntensity={0.5} /></mesh><pointLight position={[0, 3.1 * scale, 0]} intensity={0.5} distance={5} color="#ffdd88" /></group>)}
      {type === 'bench' && (<group position={position}><mesh position={[0, 0.3 * scale, 0]} castShadow><boxGeometry args={[1.5 * scale, 0.1 * scale, 0.5 * scale]} /><meshStandardMaterial color="#8B6914" /></mesh><mesh position={[-0.6 * scale, 0.15 * scale, 0]} castShadow><boxGeometry args={[0.1 * scale, 0.3 * scale, 0.5 * scale]} /><meshStandardMaterial color="#8B6914" /></mesh><mesh position={[0.6 * scale, 0.15 * scale, 0]} castShadow><boxGeometry args={[0.1 * scale, 0.3 * scale, 0.5 * scale]} /><meshStandardMaterial color="#8B6914" /></mesh></group>)}
      {type === 'fence' && (<group position={position}><mesh position={[0, 0.3 * scale, 0]} castShadow><boxGeometry args={[1.5 * scale, 0.6 * scale, 0.1 * scale]} /><meshStandardMaterial color="#8B7355" /></mesh><mesh position={[-0.6 * scale, 0.3 * scale, 0]} castShadow><boxGeometry args={[0.1 * scale, 0.8 * scale, 0.1 * scale]} /><meshStandardMaterial color="#8B7355" /></mesh><mesh position={[0.6 * scale, 0.3 * scale, 0]} castShadow><boxGeometry args={[0.1 * scale, 0.8 * scale, 0.1 * scale]} /><meshStandardMaterial color="#8B7355" /></mesh></group>)}
      {type === 'well' && (<group position={position}><mesh position={[0, 0.3 * scale, 0]} castShadow><cylinderGeometry args={[0.5 * scale, 0.5 * scale, 0.6 * scale, 8]} /><meshStandardMaterial color="#888888" /></mesh><mesh position={[0, 0.6 * scale, 0]} castShadow><torusGeometry args={[0.5 * scale, 0.05 * scale, 8, 16]} /><meshStandardMaterial color="#777777" /></mesh></group>)}
      {type === 'sign' && (<group position={position}><mesh position={[0, 0.5 * scale, 0]} castShadow><cylinderGeometry args={[0.05 * scale, 0.05 * scale, 1 * scale, 6]} /><meshStandardMaterial color="#6B4226" /></mesh><mesh position={[0, 0.9 * scale, 0]} castShadow><boxGeometry args={[0.6 * scale, 0.4 * scale, 0.05 * scale]} /><meshStandardMaterial color="#c4a882" /></mesh></group>)}
      {type === 'torch' && (<group position={position}><mesh position={[0, 1 * scale, 0]} castShadow><cylinderGeometry args={[0.04 * scale, 0.06 * scale, 2 * scale, 6]} /><meshStandardMaterial color="#5a4a2a" /></mesh><mesh position={[0, 2.1 * scale, 0]}><sphereGeometry args={[0.15 * scale, 6, 6]} /><meshStandardMaterial color="#ff6600" emissive="#ff4400" emissiveIntensity={1} transparent opacity={0.9} /></mesh><pointLight position={[0, 2.1 * scale, 0]} intensity={0.8} distance={6} color="#ff8844" /></group>)}
      {type === 'pillar' && (<group position={position}><mesh position={[0, 2 * scale, 0]} castShadow><cylinderGeometry args={[0.4 * scale, 0.5 * scale, 4 * scale, 8]} /><meshStandardMaterial color={['#666666', '#777777', '#555555'][variant]} /></mesh><mesh position={[0, 4.1 * scale, 0]} castShadow><boxGeometry args={[1.2 * scale, 0.3 * scale, 1.2 * scale]} /><meshStandardMaterial color="#666666" /></mesh></group>)}
      {type === 'mushroom' && (() => { const capColor = ['#cc4444', '#cc8844', '#aa66cc'][variant]; return (<group position={position}><mesh position={[0, 0.2 * scale, 0]} castShadow><cylinderGeometry args={[0.08 * scale, 0.1 * scale, 0.4 * scale, 6]} /><meshStandardMaterial color="#ddd8c8" /></mesh><mesh position={[0, 0.45 * scale, 0]} castShadow><sphereGeometry args={[0.25 * scale, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color={capColor} /></mesh></group>); })()}
      {type === 'crack' && (<group position={position}><mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, variant * 0.5]}><planeGeometry args={[1.5 * scale, 0.3 * scale]} /><meshStandardMaterial color="#333333" roughness={1} /></mesh></group>)}
      {type === 'chest' && (<group position={position}><mesh position={[0, 0.3 * scale, 0]} castShadow><boxGeometry args={[0.8 * scale, 0.6 * scale, 0.5 * scale]} /><meshStandardMaterial color="#8B6914" /></mesh><mesh position={[0, 0.65 * scale, 0]} castShadow><boxGeometry args={[0.82 * scale, 0.15 * scale, 0.52 * scale]} /><meshStandardMaterial color="#a07818" /></mesh><mesh position={[0, 0.4 * scale, 0.26 * scale]}><boxGeometry args={[0.15 * scale, 0.1 * scale, 0.05 * scale]} /><meshStandardMaterial color="#ffcc00" emissive="#aa8800" emissiveIntensity={0.3} /></mesh></group>)}
      {type === 'dungeon_wall' && (<group position={position}><mesh position={[0, 2 * scale, 0]} castShadow><boxGeometry args={[4 * scale, 4 * scale, 0.5 * scale]} /><meshStandardMaterial color={['#444444', '#3a3a3a', '#555555'][variant]} roughness={0.95} /></mesh><mesh position={[-1.5 * scale, 2.5 * scale, 0.26 * scale]}><boxGeometry args={[0.8 * scale, 1 * scale, 0.05 * scale]} /><meshStandardMaterial color="#333333" /></mesh><mesh position={[1.5 * scale, 2.5 * scale, 0.26 * scale]}><boxGeometry args={[0.8 * scale, 1 * scale, 0.05 * scale]} /><meshStandardMaterial color="#333333" /></mesh></group>)}
      {type === 'dungeon_floor_tile' && (<group position={position}><mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[3 * scale, 3 * scale]} /><meshStandardMaterial color={['#4a4a4a', '#555555', '#444444'][variant]} roughness={0.8} /></mesh></group>)}
    </>
  );

  if (hasCollision) {
    return <RigidBody type="fixed" colliders="trimesh">{content}</RigidBody>;
  }

  return <group>{content}</group>;
}

function GrassTufts({ count }: { count: number }) {
  const instancedMesh = useMemo(() => {
    const dummy = new THREE.Object3D();
    const mesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.08, 0.15),
      new THREE.MeshBasicMaterial({ color: '#5aaa5a', transparent: true, opacity: 0.6, depthWrite: false }),
      count,
    );
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 30;
      const z = (Math.random() - 0.5) * 30;
      if (Math.abs(x) < 6 && Math.abs(z) < 6) continue;
      dummy.position.set(x, 0.06, z);
      dummy.rotation.set(0, Math.random() * Math.PI, 0);
      dummy.scale.set(1 + Math.random() * 0.5, 1 + Math.random() * 0.5, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }, [count]);
  return <primitive object={instancedMesh} />;
}

function SafeZoneIndicator({ zone }: { zone: { id: string; center: { x: number; z: number }; radius: number; name?: string } }) {
  return (
    <group position={[zone.center.x, 0.02, zone.center.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[zone.radius - 0.1, zone.radius, 64]} />
        <meshBasicMaterial color="#44ff44" transparent opacity={0.15} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

interface MapData {
  mapId: string;
  mapName: string;
  mapType: string;
  dimensions: { width: number; height: number };
  warps: Array<{ id: string; name: string; position: { x: number; y: number; z: number }; targetMapName: string; visual: string }>;
  safeZones: Array<{ id: string; center: { x: number; z: number }; radius: number; name?: string }>;
  decorations: Array<{ position: [number, number, number]; type: string; scale: number; hasCollision?: boolean; lodDistance?: number; lodNear?: number; lodFar?: number; layer?: string }>;
  grassTuftCount: number;
  grassTexture: { baseColor: string; repeatX: number; repeatY: number };
  floorColor: string;
  tiles?: Tile[];
  navGrid?: NavGrid;
  regions?: MapRegion[];
  triggers?: MapTrigger[];
  bakedLighting?: BakedLighting;
  colliders?: Array<{ position: [number, number, number]; size: [number, number, number] }>;
}

export function Map({ mapData }: { mapData: MapData }) {
  const setTargetPosition = useGameStore((state) => state.setTargetPosition);
  const setSelectedTargetId = useGameStore((state) => state.setSelectedTargetId);
  const enemies = useGameStore((state) => state.enemies);
  const playerPos = useGameStore((state) => state.position);
  const setPath = useGameStore((state) => state.setPath);
  const texture = useMemo(() => createGrassTexture(mapData.grassTexture), [mapData.grassTexture]);

  const navGrid = useMemo(() => {
    if (mapData.navGrid) return createNavGridFromConfig(mapData.navGrid);
    return null;
  }, [mapData.navGrid]);

  useEffect(() => {
    currentNavGrid.grid = navGrid;
    return () => { currentNavGrid.grid = null; };
  }, [navGrid]);

  const visibleChunks = useMemo(() => {
    if (!mapData.regions || mapData.regions.length === 0) return null;
    const chunks = computeChunks(
      mapData.regions,
      mapData.decorations as any,
      mapData.tiles ?? [],
      mapData.triggers ?? [],
      [],
    );
    return getVisibleChunks(chunks, playerPos.x, playerPos.z, 40);
  }, [mapData.regions, mapData.decorations, mapData.tiles, mapData.triggers, playerPos.x, playerPos.z]);

  const activeRegions = useMemo(() => {
    if (!mapData.regions) return [];
    return getActiveRegions(mapData.regions, playerPos.x, playerPos.z);
  }, [mapData.regions, playerPos.x, playerPos.z]);

  const visibleDecorations = useMemo(() => {
    if (!visibleChunks) return mapData.decorations;
    const decos: MapDecoration[] = [];
    const seen = new Set<string>();
    for (const chunk of visibleChunks) {
      for (const d of chunk.decorations) {
        const key = `${d.position[0]},${d.position[1]},${d.type}`;
        if (!seen.has(key)) {
          seen.add(key);
          decos.push(d);
        }
      }
    }
    return decos.length > 0 ? decos : mapData.decorations;
  }, [visibleChunks, mapData.decorations]);

  const visibleTiles = useMemo(() => {
    if (!mapData.tiles) return [];
    if (!visibleChunks) return mapData.tiles;
    const tiles: Tile[] = [];
    const seen = new Set<string>();
    for (const chunk of visibleChunks) {
      for (const t of chunk.tiles) {
        const key = `${t.position[0]},${t.position[1]}`;
        if (!seen.has(key)) {
          seen.add(key);
          tiles.push(t);
        }
      }
    }
    return tiles.length > 0 ? tiles : mapData.tiles;
  }, [visibleChunks, mapData.tiles]);

  const handlePointerDown = useCallback((e: any) => {
    if (e.button !== 0) return;
    if (e.object?.userData?.raycastable) return;
    e.stopPropagation();
    const point = e.point;
    const target = { x: point.x, y: 0.5, z: point.z };
    setTargetPosition(target);
    setSelectedTargetId(null);

    if (navGrid) {
      const start = { x: playerPos.x, z: playerPos.z };
      const end = { x: target.x, z: target.z };
      const rawPath = findPath(navGrid, start.x, start.z, end.x, end.z);
      if (rawPath) {
        const smoothed = smoothPath(navGrid, rawPath);
        setPath(smoothed);
      }
    }
  }, [setTargetPosition, setSelectedTargetId, navGrid, playerPos.x, playerPos.z, setPath]);

  const hasTiles = mapData.tiles && mapData.tiles.length > 0;

  const entityList = useMemo(() => {
    return Object.values(enemies).map(enemy => ({
      id: enemy.id,
      entityId: enemy.name.toLowerCase().replace(/\s+/g, '_'),
      position: enemy.position,
      animState: enemy.isDead ? 'dead' as const : 'idle' as const,
      isDead: enemy.isDead,
      hpBar: { current: enemy.hp, max: enemy.maxHp },
      nameTag: enemy.name,
    }));
  }, [enemies]);

  const lighting = mapData.bakedLighting;

  return (
    <group>
      <EnvironmentLayer mapType={mapData.mapType} />
      <LightingLayer
        mapType={mapData.mapType}
        ambientColor={lighting?.ambientColor}
        ambientIntensity={lighting?.ambientIntensity}
        sunColor={lighting?.sunColor}
        sunIntensity={lighting?.sunIntensity}
        sunDirection={lighting?.sunDirection}
        hemisphereSky={lighting?.hemisphereSky}
        hemisphereGround={lighting?.hemisphereGround}
        fakeAOIntensity={lighting?.fakeAOIntensity}
      />

      {hasTiles ? (
        <TerrainRenderer
          tiles={visibleTiles}
          tileSize={1}
          dimensions={mapData.dimensions}
        />
      ) : (
        <RigidBody type="fixed">
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} onPointerDown={handlePointerDown} receiveShadow>
            <planeGeometry args={[mapData.dimensions.width, mapData.dimensions.height]} />
            <meshStandardMaterial map={texture} roughness={0.8} metalness={0} color={mapData.floorColor} />
          </mesh>
        </RigidBody>
      )}

      {mapData.grassTuftCount > 0 && <GrassTufts count={mapData.grassTuftCount} />}

      <MapLayers
        decorations={visibleDecorations as any}
        playerPosition={playerPos}
        activeRegions={activeRegions}
        lodEnabled={true}
      />

      {mapData.colliders && mapData.colliders.map((c, i) => (
        <RigidBody key={`collider-${i}`} type="fixed" position={c.position}>
          <mesh visible={false}>
            <boxGeometry args={c.size} />
          </mesh>
        </RigidBody>
      ))}

      {mapData.warps.map((w) => (
        <WarpPortal key={w.id} id={w.id} name={w.name} position={w.position} targetMapName={w.targetMapName} visual={w.visual} />
      ))}

      {mapData.safeZones.map((sz) => (
        <SafeZoneIndicator key={sz.id} zone={sz} />
      ))}

      <SortedEntities entities={entityList} />

      <DamageNumbers />
    </group>
  );
}
