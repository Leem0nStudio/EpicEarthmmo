'use client';

import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useNetworkStore } from '@/store/useNetworkStore';
import { Billboard, Text } from '@react-three/drei';
import { Sprite } from './Sprite';
import { type AnimState, type Direction } from '@/lib/spriteManager';
import type { PeerPlayerState } from '@/shared/types/network';

interface TimestampedState {
  state: PeerPlayerState;
  time: number;
}

const INTERPOLATION_DELAY_MS = 100;
const MAX_BUFFER_SIZE = 4;

export function RemotePlayers() {
  const remotePlayers = useNetworkStore(state => state.remotePlayers || {});
  const bufRef = useRef<Map<string, TimestampedState[]>>(new Map());

  return (
    <>
      {Object.entries(remotePlayers || {}).map(([id, player]) => (
        <RemotePlayerSprite key={id} id={id} player={player} bufRef={bufRef} />
      ))}
    </>
  );
}

function RemotePlayerSprite({ id, player, bufRef }: { id: string; player: PeerPlayerState; bufRef: React.MutableRefObject<Map<string, TimestampedState[]>> }) {
  const groupRef = useRef<THREE.Group>(null);
  const displayPos = useRef({ x: player.x || 0, y: player.y || 0.5, z: player.z || 0 });
  const directionRef = useRef<Direction>((player.direction as Direction) || 'S');
  const animStateRef = useRef<AnimState>((player.animState as AnimState) || 'idle');

  useFrame((_state, delta) => {
    const buf = bufRef.current;
    let entry = buf.get(id);
    if (!entry) {
      entry = [{ state: player, time: performance.now() }];
      buf.set(id, entry);
    }

    const now = performance.now();
    const latest = { state: player, time: now };

    const existing = entry.find(e => e.state.x === player.x && e.state.z === player.z && e.state.y === player.y);
    if (!existing) {
      entry.push(latest);
      if (entry.length > MAX_BUFFER_SIZE) entry.shift();
    }

    const renderTime = now - INTERPOLATION_DELAY_MS;

    let targetX = player.x;
    let targetY = player.y || 0.5;
    let targetZ = player.z;

    for (let i = 0; i < entry.length - 1; i++) {
      const a = entry[i];
      const b = entry[i + 1];
      if (a.time <= renderTime && b.time >= renderTime) {
        const t = (renderTime - a.time) / (b.time - a.time || 1);
        const clampedT = Math.max(0, Math.min(1, t));
        targetX = a.state.x + (b.state.x - a.state.x) * clampedT;
        targetY = (a.state.y || 0.5) + ((b.state.y || 0.5) - (a.state.y || 0.5)) * clampedT;
        targetZ = a.state.z + (b.state.z - a.state.z) * clampedT;
        break;
      }
    }

    displayPos.current.x += ((targetX) - displayPos.current.x) * Math.min(1, 8 * delta);
    displayPos.current.y += ((targetY) - displayPos.current.y) * Math.min(1, 8 * delta);
    displayPos.current.z += ((targetZ) - displayPos.current.z) * Math.min(1, 8 * delta);

    if (groupRef.current) {
      groupRef.current.position.set(displayPos.current.x, displayPos.current.y, displayPos.current.z);
    }

    if (player.direction) {
      directionRef.current = player.direction as Direction;
    }
    if (player.animState) {
      animStateRef.current = player.animState as AnimState;
    }
  });

  return (
    <group ref={groupRef}>
      <Billboard follow>
        <Sprite
          entityId="novice_m"
          state={animStateRef.current}
          direction={directionRef.current}
          width={1.2}
          height={1.2}
        />
        <group position={[0, 0.8, 0]}>
          <Text fontSize={0.15} color="white" outlineWidth={0.02} outlineColor="black">
            {player.name || 'Stranger'}
          </Text>
        </group>
      </Billboard>
    </group>
  );
}
