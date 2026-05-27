'use client';

import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { Player } from './Player';
import { MapScene } from './map/MapScene';
import { CameraController } from './CameraController';
import { NetworkManager } from './NetworkManager';
import { RemotePlayers } from './RemotePlayers';
import { QuarksRenderer } from './QuarksParticleSystem';
import { ScreenShake } from './ScreenShake';
import { SkillRenderer } from './SkillRenderer';
import { ProjectileRenderer } from './ProjectileRenderer';
import { BuffOverlay } from './BuffOverlay';
import { DialogWindow } from './ui/DialogWindow';
import { ShopWindow } from './ui/ShopWindow';
import { ErrorBoundary } from './ErrorBoundary';
import { useNetworkStore } from '@/store/useNetworkStore';
import { gameData } from '@/shared/loader';

function getDefaultMapData() {
  const prontera = gameData.maps.find(m => m.id === 'prontera');
  if (!prontera) {
    return {
      mapId: 'prontera', mapName: 'Prontera', mapType: 'town',
      dimensions: { width: 80, height: 80 },
      npcs: [], chests: [], warps: [], safeZones: [], decorations: [], colliders: [],
      grassTuftCount: 50,
      grassTexture: { baseColor: '#c4a882', repeatX: 20, repeatY: 20 },
      floorColor: '#c4a882',
    };
  }
  const p = prontera as any;
  return {
    mapId: p.id, mapName: p.name, mapType: p.type, dimensions: p.dimensions,
    npcs: p.npcs || [], chests: p.chests || [], warps: p.warps || [],
    safeZones: p.safeZones || [], decorations: p.decorations || [],
    colliders: p.colliders || [], tiles: p.tiles || [],
    navGrid: p.navGrid, regions: p.regions || [], triggers: p.triggers || [],
    bakedLighting: p.bakedLighting,
    grassTuftCount: p.grassTuftCount || 50,
    grassTexture: p.grassTexture || { baseColor: '#c4a882', repeatX: 20, repeatY: 20 },
    floorColor: p.floorColor || '#c4a882',
  };
}

const defaultMap = getDefaultMapData();

export function GameScene({ characterName }: { characterName?: string }) {
  const mapType = useNetworkStore(state => state.currentMapData?.mapType);
  const mapData = useNetworkStore(state => state.currentMapData);

  return (
    <div className="w-full h-full" style={{ touchAction: 'none' }}>
      <NetworkManager playerName={characterName || 'Player'} />
      <ErrorBoundary>
      <Canvas shadows orthographic={false} dpr={[1, 2]} camera={{ fov: 50, position: [0, 14, 16], near: 0.1, far: 100 }}>
        <Suspense fallback={null}>
          <Physics debug={false}>
            <MapScene mapData={mapData || (defaultMap as any)} />
            <Player />
            <RemotePlayers />
          </Physics>

          <QuarksRenderer />
          <SkillRenderer />
          <ProjectileRenderer />

          <CameraController
            mapDimensions={mapData?.dimensions}
            zoomEnabled={true}
            minZoom={5}
            maxZoom={22}
            fixedAngle={true}
          />
          <ScreenShake />

          <EffectComposer>
            <Bloom
              luminanceThreshold={mapType === 'dungeon' ? 0.3 : 0.8}
              luminanceSmoothing={0.7}
              intensity={mapType === 'dungeon' ? 0.8 : 0.5}
            />
          </EffectComposer>
        </Suspense>
      </Canvas>
      </ErrorBoundary>
      <BuffOverlay />
      <DialogWindow />
      <ShopWindow />
    </div>
  );
}
