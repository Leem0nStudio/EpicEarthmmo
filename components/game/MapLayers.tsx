'use client';

import React, { useMemo } from 'react';
import type { MapDecoration, TileLayer, MapRegion } from '@/shared/schemas';
import { Decoration } from './Map';

interface MapLayerProps {
  decorations: MapDecoration[];
  playerPosition: { x: number; z: number };
  activeRegions?: string[];
  lodEnabled?: boolean;
}

const LAYER_ORDER: TileLayer[] = ['terrain', 'shadows', 'decorations', 'effects', 'ceiling', 'entities'];

export function MapLayers({ decorations, playerPosition, activeRegions, lodEnabled = true }: MapLayerProps) {
  const layers = useMemo(() => {
    const grouped: Record<string, MapDecoration[]> = {};
    for (const layer of LAYER_ORDER) {
      grouped[layer] = [];
    }

    for (const deco of decorations) {
      const layer = deco.layer ?? 'decorations';
      if (!grouped[layer]) grouped[layer] = [];
      grouped[layer].push(deco);
    }

    return grouped;
  }, [decorations]);

  return (
    <group>
      {LAYER_ORDER.map((layerName) => {
        const items = layers[layerName] ?? [];
        if (items.length === 0) return null;

        return (
          <group key={layerName} name={`layer-${layerName}`}>
            {items.map((deco, i) => {
              if (lodEnabled) {
                const dx = deco.position[0] - playerPosition.x;
                const dz = deco.position[2] - playerPosition.z;
                const lodFar = deco.lodFar ?? Infinity;
                if (dx * dx + dz * dz > lodFar * lodFar) return null;
              }

              return (
                <Decoration
                  key={`${layerName}-${i}`}
                  position={deco.position}
                  type={deco.type as any}
                  scale={deco.scale}
                  hasCollision={deco.hasCollision}
                />
              );
            })}
          </group>
        );
      })}
    </group>
  );
}

interface EnvironmentLayerProps {
  region?: MapRegion | null;
  mapType: string;
}

export function EnvironmentLayer({ region, mapType }: EnvironmentLayerProps) {
  const fogColor = region?.fogColor ?? (
    mapType === 'dungeon' ? '#1a1a2e' :
    mapType === 'field' ? '#c9e8f0' : '#d4e8f0'
  );
  const fogNear = mapType === 'dungeon' ? 5 : 20;
  const fogFar = mapType === 'dungeon' ? 30 : 50;

  return (
    <>
      <fog attach="fog" args={[fogColor, fogNear, fogFar]} />
      <color attach="background" args={[fogColor]} />
    </>
  );
}

interface LightingLayerProps {
  mapType: string;
  ambientColor?: string;
  ambientIntensity?: number;
  sunColor?: string;
  sunIntensity?: number;
  sunDirection?: [number, number, number];
  hemisphereSky?: string;
  hemisphereGround?: string;
  fakeAOIntensity?: number;
}

export function LightingLayer({
  mapType,
  ambientColor,
  ambientIntensity,
  sunColor,
  sunIntensity,
  sunDirection,
  hemisphereSky,
  hemisphereGround,
  fakeAOIntensity = 0.15,
}: LightingLayerProps) {
  const defaults = {
    dungeon: {
      ambientColor: '#444466', ambientIntensity: 0.15,
      sunColor: '#666688', sunIntensity: 0.3,
      hemisphereSky: '#2a2a3e', hemisphereGround: '#1a1a1a',
    },
    field: {
      ambientColor: '#888888', ambientIntensity: 0.5,
      sunColor: '#ffffff', sunIntensity: 1.3,
      hemisphereSky: '#87CEEB', hemisphereGround: '#3a7d3a',
    },
    town: {
      ambientColor: '#888888', ambientIntensity: 0.4,
      sunColor: '#ffffff', sunIntensity: 1.2,
      hemisphereSky: '#a8d8ea', hemisphereGround: '#5a9d5a',
    },
  };

  const d = defaults[mapType as keyof typeof defaults] ?? defaults.town;

  return (
    <>
      <ambientLight color={ambientColor ?? d.ambientColor} intensity={ambientIntensity ?? d.ambientIntensity} />
      <hemisphereLight
        args={[hemisphereSky ?? d.hemisphereSky, hemisphereGround ?? d.hemisphereGround, 0.6]}
      />
      {mapType !== 'dungeon' && (
        <>
          <directionalLight
            castShadow
            position={[15, 25, 10]}
            intensity={sunIntensity ?? d.sunIntensity}
            color={sunColor ?? d.sunColor}
            shadow-mapSize={[2048, 2048]}
            shadow-camera-left={-25}
            shadow-camera-right={25}
            shadow-camera-top={25}
            shadow-camera-bottom={-25}
          />
          <directionalLight position={[-10, 10, -10]} intensity={0.3} color="#b4d4ff" />
        </>
      )}
    </>
  );
}
