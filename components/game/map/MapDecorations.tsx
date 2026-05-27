'use client';

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { RigidBody } from '@react-three/rapier';
import type { MapDecoration, NavGrid, TileLayer } from '@/shared/schemas';
import { getHeightAtWorld } from '@/shared/pathfinding';

type DecoType = 'tree' | 'bush' | 'rock' | 'flower' | 'building' | 'fence' | 'well' | 'sign' | 'castle' | 'castle_tower_left' | 'castle_tower_right' | 'castle_gate' | 'building_large' | 'building_medium' | 'building_small' | 'fountain' | 'stone_path' | 'lamppost' | 'bench' | 'tree_ornamental' | 'torch' | 'pillar' | 'mushroom' | 'crack' | 'chest' | 'dungeon_wall' | 'dungeon_floor_tile';

const DECO_SHADOW_SIZES: Partial<Record<DecoType, number>> = {
  tree: 2, tree_ornamental: 1.5, bush: 1, rock: 0.6,
  castle: 6, castle_tower_left: 3, castle_tower_right: 3, castle_gate: 2.5,
  building_large: 3.5, building_medium: 2.5, building_small: 2,
  fountain: 1.8, lamppost: 0.5, bench: 1, fence: 1.5,
  well: 1, sign: 0.5, torch: 0.3, pillar: 0.8,
  mushroom: 0.4, chest: 0.8,
};

// ── Shared material cache ──
const matCache = new Map<string, THREE.MeshStandardMaterial>();

function cachedColorMaterial(key: string, color: string, opts?: Partial<THREE.MeshStandardMaterial>): THREE.MeshStandardMaterial {
  const k = `${key}:${color}:${JSON.stringify(opts ?? {})}`;
  let m = matCache.get(k);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, ...opts });
    matCache.set(k, m);
  }
  return m;
}

const SHARED_GEO = {
  unitPlane: new THREE.PlaneGeometry(1, 1),
  unitSphere: new THREE.SphereGeometry(1, 8, 6),
  unitCylinder8: new THREE.CylinderGeometry(1, 1, 1, 8),
  unitCylinder6: new THREE.CylinderGeometry(1, 1, 1, 6),
  unitCone8: new THREE.ConeGeometry(1, 1, 8),
  unitCone4: new THREE.ConeGeometry(1, 1, 4),
  unitBox: new THREE.BoxGeometry(1, 1, 1),
  unitDodeca: new THREE.DodecahedronGeometry(1, 0),
  unitTorus8: new THREE.TorusGeometry(1, 0.1, 8, 16),
};

export function Decoration({ position, scale = 1, type = 'tree', hasCollision = false, navGrid }: { position: [number, number, number]; scale?: number; type?: DecoType; hasCollision?: boolean; navGrid?: NavGrid | null }) {
  const variant = useMemo(() => Math.floor(Math.random() * 3), []);
  const terrainY = navGrid ? getHeightAtWorld(navGrid, position[0], position[2]) : position[1];
  const decoPos: [number, number, number] = [position[0], terrainY, position[2]];

  const shadowSize = DECO_SHADOW_SIZES[type];
  const shadow = shadowSize ? (
    <mesh position={[position[0], terrainY + 0.01, position[2]]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[shadowSize * scale, shadowSize * scale]} />
      <meshBasicMaterial color="black" transparent opacity={0.15} depthWrite={false} />
    </mesh>
  ) : null;

  const content = (
    <>
      {shadow}
      {type === 'tree' && (
        <group position={decoPos}>
          <mesh position={[0, 0.5 * scale, 0]} castShadow><cylinderGeometry args={[0.08 * scale, 0.15 * scale, 1 * scale, 6]} /><meshStandardMaterial color="#6B4226" /></mesh>
          <mesh position={[0, 1.2 * scale + 0.3 * scale, 0]} castShadow><coneGeometry args={[1.2 * scale, 1.0 * scale, 8]} /><primitive object={cachedColorMaterial('tree_c0', ['#2d7d2d', '#358535', '#3d8d3d'][variant])} /></mesh>
          <mesh position={[0.2 * scale, 1.8 * scale, 0.2 * scale]} castShadow><coneGeometry args={[0.8 * scale, 0.8 * scale, 8]} /><primitive object={cachedColorMaterial('tree_c1', ['#3d8d3d', '#459545', '#4d9d4d'][variant])} /></mesh>
        </group>
      )}
      {type === 'tree_ornamental' && (
        <group position={decoPos}>
          <mesh position={[0, 0.4 * scale, 0]} castShadow><cylinderGeometry args={[0.06 * scale, 0.12 * scale, 0.8 * scale, 6]} /><meshStandardMaterial color="#8B6914" /></mesh>
          <mesh position={[0, 1.0 * scale, 0]} castShadow><primitive object={SHARED_GEO.unitSphere} scale={[0.6 * scale, 0.6 * scale, 0.6 * scale]} /><primitive object={cachedColorMaterial('tree_orn', ['#3a8a3a', '#4a9a4a', '#2d7d2d'][variant])} /></mesh>
        </group>
      )}
      {type === 'bush' && <mesh position={decoPos} castShadow><primitive object={SHARED_GEO.unitSphere} scale={[0.5 * scale, 0.5 * scale, 0.5 * scale]} /><primitive object={cachedColorMaterial('bush', ['#3a8a3a', '#4a9a4a', '#5aaa5a'][variant])} /></mesh>}
      {type === 'rock' && <mesh position={[decoPos[0], decoPos[1] + 0.15 * scale, decoPos[2]]} castShadow><primitive object={SHARED_GEO.unitDodeca} scale={[0.3 * scale, 0.3 * scale, 0.3 * scale]} /><primitive object={cachedColorMaterial('rock', ['#777', '#888', '#999'][variant], { roughness: 0.9 })} /></mesh>}
      {type === 'flower' && (() => { const color = ['#ff6b8a', '#ffeb3b', '#ff8a65', '#e040fb', '#40c4ff'][variant]; return (<group position={decoPos}><mesh position={[0, 0.15 * scale, 0]}><primitive object={SHARED_GEO.unitPlane} scale={[0.2 * scale, 0.3 * scale, 1]} /><meshBasicMaterial color="#4a8a3a" depthWrite={false} /></mesh><mesh position={[0, 0.35 * scale, 0]}><primitive object={SHARED_GEO.unitPlane} scale={[0.3 * scale, 0.3 * scale, 1]} /><meshBasicMaterial color={color} depthWrite={false} /></mesh></group>); })()}
      {type === 'castle' && (<group position={decoPos}><mesh position={[0, 3 * scale, 0]} castShadow><primitive object={SHARED_GEO.unitBox} scale={[12 * scale, 6 * scale, 6 * scale]} /><primitive object={cachedColorMaterial('castle_wall', '#d4c4a8')} /></mesh><mesh position={[0, 6.5 * scale, 0]} castShadow><primitive object={SHARED_GEO.unitBox} scale={[13 * scale, 1 * scale, 7 * scale]} /><primitive object={cachedColorMaterial('castle_ledge', '#c4b498')} /></mesh><mesh position={[0, 7 * scale, -1 * scale]} castShadow><primitive object={SHARED_GEO.unitCone4} scale={[2 * scale, 2 * scale, 2 * scale]} /><primitive object={cachedColorMaterial('castle_roof', '#8b0000')} /></mesh></group>)}
      {type === 'castle_tower_left' && (<group position={decoPos}><mesh position={[-5 * scale, 4 * scale, -2 * scale]} castShadow><cylinderGeometry args={[1.5 * scale, 1.8 * scale, 8 * scale, 8]} /><primitive object={cachedColorMaterial('tower_left', '#d4c4a8')} /></mesh><mesh position={[-5 * scale, 8.5 * scale, -2 * scale]} castShadow><coneGeometry args={[2 * scale, 2 * scale, 8]} /><primitive object={cachedColorMaterial('tower_left_roof', '#8b0000')} /></mesh></group>)}
      {type === 'castle_tower_right' && (<group position={decoPos}><mesh position={[5 * scale, 4 * scale, -2 * scale]} castShadow><cylinderGeometry args={[1.5 * scale, 1.8 * scale, 8 * scale, 8]} /><primitive object={cachedColorMaterial('tower_right', '#d4c4a8')} /></mesh><mesh position={[5 * scale, 8.5 * scale, -2 * scale]} castShadow><coneGeometry args={[2 * scale, 2 * scale, 8]} /><primitive object={cachedColorMaterial('tower_right_roof', '#8b0000')} /></mesh></group>)}
      {type === 'castle_gate' && (<group position={decoPos}><mesh position={[0, 1.5 * scale, -2.5 * scale]} castShadow><primitive object={SHARED_GEO.unitBox} scale={[4 * scale, 3 * scale, 1 * scale]} /><primitive object={cachedColorMaterial('gate', '#8B6914')} /></mesh><mesh position={[0, 2.5 * scale, -2.8 * scale]}><primitive object={SHARED_GEO.unitBox} scale={[3 * scale, 2 * scale, 0.3 * scale]} /><primitive object={cachedColorMaterial('gate_door', '#5a4a2a')} /></mesh></group>)}
      {type === 'building_large' && (<group position={decoPos}><mesh position={[0, 2 * scale, 0]} castShadow><primitive object={SHARED_GEO.unitBox} scale={[5 * scale, 4 * scale, 4 * scale]} /><primitive object={cachedColorMaterial('build_l', ['#c4a882', '#b89b78', '#d0b892'][variant])} /></mesh><mesh position={[0, 4.3 * scale, 0]} castShadow><primitive object={SHARED_GEO.unitCone4} scale={[3.5 * scale, 1.5 * scale, 3.5 * scale]} /><primitive object={cachedColorMaterial('build_l_roof', ['#8b4513', '#a0522d', '#6b3410'][variant])} /></mesh><mesh position={[0, 1.5 * scale, 2.01 * scale]}><primitive object={SHARED_GEO.unitBox} scale={[1 * scale, 1.5 * scale, 0.1 * scale]} /><primitive object={cachedColorMaterial('build_l_door', '#5a4a2a')} /></mesh></group>)}
      {type === 'building_medium' && (<group position={decoPos}><mesh position={[0, 1.5 * scale, 0]} castShadow><primitive object={SHARED_GEO.unitBox} scale={[4 * scale, 3 * scale, 3 * scale]} /><primitive object={cachedColorMaterial('build_m', ['#c4a882', '#b89b78', '#d0b892'][variant])} /></mesh><mesh position={[0, 3.3 * scale, 0]} castShadow><primitive object={SHARED_GEO.unitCone4} scale={[2.8 * scale, 1.2 * scale, 2.8 * scale]} /><primitive object={cachedColorMaterial('build_m_roof', ['#8b4513', '#a0522d', '#6b3410'][variant])} /></mesh></group>)}
      {type === 'building_small' && (<group position={decoPos}><mesh position={[0, 1 * scale, 0]} castShadow><primitive object={SHARED_GEO.unitBox} scale={[3 * scale, 2 * scale, 2.5 * scale]} /><primitive object={cachedColorMaterial('build_s', ['#d4b896', '#c4a882', '#b89b78'][variant])} /></mesh><mesh position={[0, 2.2 * scale, 0]} castShadow><primitive object={SHARED_GEO.unitCone4} scale={[2.2 * scale, 0.8 * scale, 2.2 * scale]} /><primitive object={cachedColorMaterial('build_s_roof', ['#8b4513', '#a0522d', '#6b3410'][variant])} /></mesh></group>)}
      {type === 'fountain' && (<group position={decoPos}><mesh position={[0, 0.3 * scale, 0]} castShadow><cylinderGeometry args={[1.5 * scale, 1.8 * scale, 0.6 * scale, 12]} /><primitive object={cachedColorMaterial('fountain_base', '#999999')} /></mesh><mesh position={[0, 0.6 * scale, 0]} castShadow><cylinderGeometry args={[1.3 * scale, 1.3 * scale, 0.1 * scale, 12]} /><primitive object={cachedColorMaterial('fountain_water', '#4488cc', { transparent: true, opacity: 0.7 })} /></mesh><mesh position={[0, 1.2 * scale, 0]} castShadow><cylinderGeometry args={[0.1 * scale, 0.15 * scale, 1.2 * scale, 6]} /><primitive object={cachedColorMaterial('fountain_pillar', '#aaaaaa')} /></mesh><mesh position={[0, 1.8 * scale, 0]} castShadow><primitive object={SHARED_GEO.unitSphere} scale={[0.3 * scale, 0.3 * scale, 0.3 * scale]} /><primitive object={cachedColorMaterial('fountain_top', '#bbbbbb')} /></mesh></group>)}
      {type === 'stone_path' && (<group position={decoPos}><mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}><primitive object={SHARED_GEO.unitPlane} scale={[2 * scale, 2 * scale, 1]} /><primitive object={cachedColorMaterial('stone_path', '#b8a898', { roughness: 0.9 })} /></mesh></group>)}
      {type === 'lamppost' && (<group position={decoPos}><mesh position={[0, 1.5 * scale, 0]} castShadow><cylinderGeometry args={[0.05 * scale, 0.08 * scale, 3 * scale, 6]} /><primitive object={cachedColorMaterial('lamp_post', '#444444')} /></mesh><mesh position={[0, 3.1 * scale, 0]}><primitive object={SHARED_GEO.unitSphere} scale={[0.2 * scale, 0.2 * scale, 0.2 * scale]} /><primitive object={cachedColorMaterial('lamp_glow', '#ffdd88', { emissive: '#ffaa44', emissiveIntensity: 0.5 })} /></mesh><pointLight position={[0, 3.1 * scale, 0]} intensity={0.5} distance={5} color="#ffdd88" /></group>)}
      {type === 'bench' && (<group position={decoPos}><mesh position={[0, 0.3 * scale, 0]} castShadow><primitive object={SHARED_GEO.unitBox} scale={[1.5 * scale, 0.1 * scale, 0.5 * scale]} /><primitive object={cachedColorMaterial('bench', '#8B6914')} /></mesh><mesh position={[-0.6 * scale, 0.15 * scale, 0]} castShadow><primitive object={SHARED_GEO.unitBox} scale={[0.1 * scale, 0.3 * scale, 0.5 * scale]} /><primitive object={cachedColorMaterial('bench', '#8B6914')} /></mesh><mesh position={[0.6 * scale, 0.15 * scale, 0]} castShadow><primitive object={SHARED_GEO.unitBox} scale={[0.1 * scale, 0.3 * scale, 0.5 * scale]} /><primitive object={cachedColorMaterial('bench', '#8B6914')} /></mesh></group>)}
      {type === 'fence' && (<group position={decoPos}><mesh position={[0, 0.3 * scale, 0]} castShadow><primitive object={SHARED_GEO.unitBox} scale={[1.5 * scale, 0.6 * scale, 0.1 * scale]} /><primitive object={cachedColorMaterial('fence', '#8B7355')} /></mesh><mesh position={[-0.6 * scale, 0.3 * scale, 0]} castShadow><primitive object={SHARED_GEO.unitBox} scale={[0.1 * scale, 0.8 * scale, 0.1 * scale]} /><primitive object={cachedColorMaterial('fence', '#8B7355')} /></mesh><mesh position={[0.6 * scale, 0.3 * scale, 0]} castShadow><primitive object={SHARED_GEO.unitBox} scale={[0.1 * scale, 0.8 * scale, 0.1 * scale]} /><primitive object={cachedColorMaterial('fence', '#8B7355')} /></mesh></group>)}
      {type === 'well' && (<group position={decoPos}><mesh position={[0, 0.3 * scale, 0]} castShadow><cylinderGeometry args={[0.5 * scale, 0.5 * scale, 0.6 * scale, 8]} /><primitive object={cachedColorMaterial('well', '#888888')} /></mesh><mesh position={[0, 0.6 * scale, 0]} castShadow><primitive object={SHARED_GEO.unitTorus8} scale={[0.5 * scale, 1, 1]} /><primitive object={cachedColorMaterial('well_rim', '#777777')} /></mesh></group>)}
      {type === 'sign' && (<group position={decoPos}><mesh position={[0, 0.5 * scale, 0]} castShadow><cylinderGeometry args={[0.05 * scale, 0.05 * scale, 1 * scale, 6]} /><primitive object={cachedColorMaterial('sign', '#6B4226')} /></mesh><mesh position={[0, 0.9 * scale, 0]} castShadow><primitive object={SHARED_GEO.unitBox} scale={[0.6 * scale, 0.4 * scale, 0.05 * scale]} /><primitive object={cachedColorMaterial('sign_board', '#c4a882')} /></mesh></group>)}
      {type === 'torch' && (<group position={decoPos}><mesh position={[0, 1 * scale, 0]} castShadow><cylinderGeometry args={[0.04 * scale, 0.06 * scale, 2 * scale, 6]} /><primitive object={cachedColorMaterial('torch', '#5a4a2a')} /></mesh><mesh position={[0, 2.1 * scale, 0]}><primitive object={SHARED_GEO.unitSphere} scale={[0.15 * scale, 0.15 * scale, 0.15 * scale]} /><primitive object={cachedColorMaterial('torch_flame', '#ff6600', { emissive: '#ff4400', emissiveIntensity: 1, transparent: true, opacity: 0.9 })} /></mesh><pointLight position={[0, 2.1 * scale, 0]} intensity={0.8} distance={6} color="#ff8844" /></group>)}
      {type === 'pillar' && (<group position={decoPos}><mesh position={[0, 2 * scale, 0]} castShadow><cylinderGeometry args={[0.4 * scale, 0.5 * scale, 4 * scale, 8]} /><primitive object={cachedColorMaterial('pillar', ['#666666', '#777777', '#555555'][variant])} /></mesh><mesh position={[0, 4.1 * scale, 0]} castShadow><primitive object={SHARED_GEO.unitBox} scale={[1.2 * scale, 0.3 * scale, 1.2 * scale]} /><primitive object={cachedColorMaterial('pillar_cap', '#666666')} /></mesh></group>)}
      {type === 'mushroom' && (() => { const capColor = ['#cc4444', '#cc8844', '#aa66cc'][variant]; return (<group position={decoPos}><mesh position={[0, 0.2 * scale, 0]} castShadow><cylinderGeometry args={[0.08 * scale, 0.1 * scale, 0.4 * scale, 6]} /><primitive object={cachedColorMaterial('mushroom_stem', '#ddd8c8')} /></mesh><mesh position={[0, 0.45 * scale, 0]} castShadow><sphereGeometry args={[0.25 * scale, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2]} /><primitive object={cachedColorMaterial('mushroom_cap', capColor)} /></mesh></group>); })()}
      {type === 'crack' && (<group position={decoPos}><mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, variant * 0.5]}><primitive object={SHARED_GEO.unitPlane} scale={[1.5 * scale, 0.3 * scale, 1]} /><primitive object={cachedColorMaterial('crack', '#333333', { roughness: 1 })} /></mesh></group>)}
      {type === 'chest' && (<group position={decoPos}><mesh position={[0, 0.3 * scale, 0]} castShadow><primitive object={SHARED_GEO.unitBox} scale={[0.8 * scale, 0.6 * scale, 0.5 * scale]} /><primitive object={cachedColorMaterial('chest', '#8B6914')} /></mesh><mesh position={[0, 0.65 * scale, 0]} castShadow><primitive object={SHARED_GEO.unitBox} scale={[0.82 * scale, 0.15 * scale, 0.52 * scale]} /><primitive object={cachedColorMaterial('chest_lid', '#a07818')} /></mesh><mesh position={[0, 0.4 * scale, 0.26 * scale]}><primitive object={SHARED_GEO.unitBox} scale={[0.15 * scale, 0.1 * scale, 0.05 * scale]} /><primitive object={cachedColorMaterial('chest_lock', '#ffcc00', { emissive: '#aa8800', emissiveIntensity: 0.3 })} /></mesh></group>)}
      {type === 'dungeon_wall' && (<group position={decoPos}><mesh position={[0, 2 * scale, 0]} castShadow><primitive object={SHARED_GEO.unitBox} scale={[4 * scale, 4 * scale, 0.5 * scale]} /><primitive object={cachedColorMaterial('dungeon_wall', ['#444444', '#3a3a3a', '#555555'][variant], { roughness: 0.95 })} /></mesh><mesh position={[-1.5 * scale, 2.5 * scale, 0.26 * scale]}><primitive object={SHARED_GEO.unitBox} scale={[0.8 * scale, 1 * scale, 0.05 * scale]} /><primitive object={cachedColorMaterial('dungeon_window', '#333333')} /></mesh><mesh position={[1.5 * scale, 2.5 * scale, 0.26 * scale]}><primitive object={SHARED_GEO.unitBox} scale={[0.8 * scale, 1 * scale, 0.05 * scale]} /><primitive object={cachedColorMaterial('dungeon_window', '#333333')} /></mesh></group>)}
      {type === 'dungeon_floor_tile' && (<group position={decoPos}><mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}><primitive object={SHARED_GEO.unitPlane} scale={[3 * scale, 3 * scale, 1]} /><primitive object={cachedColorMaterial('dungeon_floor', ['#4a4a4a', '#555555', '#444444'][variant], { roughness: 0.8 })} /></mesh></group>)}
    </>
  );

  if (hasCollision) {
    return <RigidBody type="fixed" colliders="cuboid">{content}</RigidBody>;
  }

  return <group>{content}</group>;
}

const LAYER_ORDER: TileLayer[] = ['terrain', 'shadows', 'decorations', 'effects', 'ceiling', 'entities'];

export function MapDecorations({ decorations, playerPosition, navGrid }: { decorations: MapDecoration[]; playerPosition: { x: number; y: number; z: number }; navGrid?: NavGrid | null }) {
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
              const dx = deco.position[0] - playerPosition.x;
              const dz = deco.position[2] - playerPosition.z;
              const dist = Math.sqrt(dx * dx + dz * dz);
              if (dist > deco.lodFar) return null;

              return (
                <Decoration
                  key={`${layerName}-${i}`}
                  position={deco.position}
                  type={deco.type as any}
                  scale={deco.scale}
                  hasCollision={deco.hasCollision}
                  navGrid={navGrid}
                />
              );
            })}
          </group>
        );
      })}
    </group>
  );
}
