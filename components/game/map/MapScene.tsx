'use client';

import React, { useMemo, useEffect, useCallback, useRef } from 'react';
import { useGameStore } from '@/store/useGameStore';
import { useNetworkStore } from '@/store/useNetworkStore';
import { createNavGridFromConfig } from '@/lib/navGrid';
import { computeChunks, getVisibleChunks, getActiveRegions } from '@/lib/chunkSystem';
import { currentNavGrid } from '@/lib/currentNavGrid';
import { getCellAtWorld } from '@/shared/pathfinding';
import type { MapDecoration, Tile, NavGrid, MapRegion, MapTrigger, BakedLighting, Collider } from '@/shared/schemas';
import { HeightmapTerrain } from './HeightmapTerrain';
import { MapDecorations } from './MapDecorations';
import { MapLighting } from './MapLighting';
import { MapEntities } from './MapEntities';
import { MapClickHandler } from './MapClickHandler';
import { MapColliders } from './MapColliders';
import { MapWarps } from './MapWarps';
import { MapSafeZones } from './MapSafeZones';
import { MapGrass } from './MapGrass';
import { Chest } from '../Chest';

interface WarpData {
  id: string;
  name: string;
  position: { x: number; y: number; z: number };
  targetMapName: string;
  visual: string;
}

interface SafeZoneData {
  id: string;
  center: { x: number; z: number };
  radius: number;
  name?: string;
}

interface ChestData {
  id: string;
  position: { x: number; y: number; z: number };
  lootTable?: Array<{ itemId: string; chance: number; minAmount: number; maxAmount: number }>;
  respawnSeconds?: number;
}

interface MapData {
  mapId: string;
  mapName: string;
  mapType: string;
  dimensions: { width: number; height: number };
  warps: WarpData[];
  safeZones: SafeZoneData[];
  decorations: MapDecoration[];
  chests?: ChestData[];
  grassTuftCount: number;
  grassTexture: { baseColor: string; repeatX: number; repeatY: number };
  floorColor: string;
  tiles?: Tile[];
  navGrid?: NavGrid | null;
  regions?: MapRegion[];
  triggers?: MapTrigger[];
  bakedLighting?: BakedLighting;
  colliders?: Collider[];
}

export function MapScene({ mapData }: { mapData: MapData }) {
  const setTargetPosition = useGameStore((state) => state.setTargetPosition);
  const setSelectedTargetId = useGameStore((state) => state.setSelectedTargetId);
  const playerPos = useGameStore((state) => state.position);

  const navGrid = useMemo(() => {
    if (mapData.navGrid) return createNavGridFromConfig(mapData.navGrid);
    return null;
  }, [mapData.navGrid]);

  useEffect(() => {
    currentNavGrid.grid = navGrid;
    return () => { currentNavGrid.grid = null; };
  }, [navGrid]);

  // Compute chunks only from static map data — NOT from playerPos
  const chunks = useMemo(() => {
    if (!mapData.regions || mapData.regions.length === 0) return null;
    return computeChunks(
      mapData.regions,
      mapData.decorations as any,
      mapData.tiles ?? [],
      mapData.triggers ?? [],
      [],
    );
  }, [mapData.regions, mapData.decorations, mapData.tiles, mapData.triggers]);

  // Visible chunks depends on playerPos
  const visibleChunks = useMemo(() => {
    if (!chunks) return null;
    return getVisibleChunks(chunks, playerPos.x, playerPos.z, 40);
  }, [chunks, playerPos.x, playerPos.z]);

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
    if (!mapData.tiles || mapData.tiles.length === 0) return [];
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

  const openedChests = useGameStore((state) => state.openedChests);
  const emptyChests = useRef<string[]>([]);
  const safeChests = openedChests ?? emptyChests.current;

  const handlePointerDown = useCallback((e: any) => {
    if (e.button !== 0) return;
    if (e.object?.userData?.raycastable) return;
    e.stopPropagation();
    const point = e.point;

    const nav = navGrid ?? currentNavGrid.grid;
    if (nav) {
      const cell = getCellAtWorld(nav, point.x, point.z);
      if (!cell || !cell.walkable || cell.isBlocked || cell.isWater) return;
    }

    const target = { x: point.x, y: 0.5, z: point.z };
    setTargetPosition(target);
    setSelectedTargetId(null);

    const ns = useNetworkStore.getState();
    if (ns.socket?.connected) {
      ns.sendMoveToTarget({ targetX: target.x, targetZ: target.z });
    }
  }, [setTargetPosition, setSelectedTargetId, navGrid]);

  const lighting = mapData.bakedLighting;

  return (
    <group>
      <MapLighting
        mapType={mapData.mapType}
        ambientColor={lighting?.ambientColor}
        ambientIntensity={lighting?.ambientIntensity}
        sunColor={lighting?.sunColor}
        sunIntensity={lighting?.sunIntensity}
        sunDirection={lighting?.sunDirection}
        hemisphereSky={lighting?.hemisphereSky}
        hemisphereGround={lighting?.hemisphereGround}
        fogColor={lighting?.fogColor}
        fogNear={lighting?.fogNear}
        fogFar={lighting?.fogFar}
      />

      <HeightmapTerrain
        navGrid={navGrid}
        tiles={visibleTiles}
        dimensions={mapData.dimensions}
        grassTexture={mapData.grassTexture}
        floorColor={mapData.floorColor}
      />

      <MapGrass count={mapData.grassTuftCount} navGrid={navGrid} />

      <MapDecorations
        decorations={visibleDecorations}
        playerPosition={playerPos}
        navGrid={navGrid}
      />

      {mapData.chests?.map((chest) => (
        <Chest
          key={chest.id}
          id={chest.id}
          position={chest.position}
          isOpen={safeChests.includes(chest.id)}
        />
      ))}

      <MapColliders colliders={mapData.colliders ?? []} />

      <MapWarps warps={mapData.warps} />

      <MapSafeZones safeZones={mapData.safeZones} />

      <MapEntities />

      <MapClickHandler
        dimensions={mapData.dimensions}
        onPointerDown={handlePointerDown}
      />
    </group>
  );
}
