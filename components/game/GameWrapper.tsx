'use client';

import React, { Suspense } from 'react';
import { GameScene } from './GameScene';
import { HUD } from './HUD';
import { OrientationLock } from './OrientationLock';
import { Joystick } from './Joystick';
import { DevToolsOverlay } from './ui/DevToolsOverlay';

function isDevMode() {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return process.env.NODE_ENV === 'development' || params.has('dev');
}

export function GameWrapper({ characterName, characterId }: { characterName: string; characterId: string | null }) {
  return (
    <div className="w-full h-full relative bg-black overflow-hidden game-container">
      <OrientationLock />
      <Suspense fallback={null}>
         <GameScene characterName={characterName} characterId={characterId} />
      </Suspense>
      <Joystick />
      <HUD characterName={characterName} />
      {isDevMode() && <DevToolsOverlay />}
    </div>
  );
}
