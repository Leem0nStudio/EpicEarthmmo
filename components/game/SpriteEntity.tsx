'use client';

import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Mesh, CanvasTexture, Texture, RepeatWrapping, ClampToEdgeWrapping } from 'three';
import { directionFromAngle, getSpriteFrame, type Direction, type AnimState, prefetchEntity } from '@/lib/spriteManager';

interface SpriteEntityProps {
  entityId: string;
  position: { x: number; y: number; z: number };
  direction?: Direction;
  animState?: AnimState;
  scale?: number;
  isDead?: boolean;
  isSelected?: boolean;
  onClick?: () => void;
  hpBar?: { current: number; max: number };
  nameTag?: string;
  depthOffset?: number;
}

const fallbackCache = new Map<string, CanvasTexture>();

function getFallbackTexture(entityId: string): CanvasTexture {
  const cached = fallbackCache.get(entityId);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#8B4513';
  ctx.beginPath();
  ctx.arc(32, 18, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffd5a0';
  ctx.beginPath();
  ctx.arc(32, 20, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#333';
  ctx.fillRect(27, 18, 3, 3);
  ctx.fillRect(34, 18, 3, 3);
  ctx.fillStyle = '#2a7a9e';
  ctx.fillRect(22, 26, 20, 16);
  ctx.fillStyle = '#4a4a6a';
  ctx.fillRect(24, 42, 6, 10);
  ctx.fillRect(34, 42, 6, 10);

  const tex = new CanvasTexture(canvas);
  fallbackCache.set(entityId, tex);
  return tex;
}

export function SpriteEntity({
  entityId,
  position,
  direction = 'S',
  animState = 'idle',
  scale = 1,
  isDead = false,
  onClick,
  hpBar,
  nameTag,
  depthOffset = 0,
}: SpriteEntityProps) {
  const meshRef = useRef<Mesh>(null);
  const ringRef = useRef<Mesh>(null);
  const clockRef = useRef(0);
  const [texture, setTexture] = React.useState<CanvasTexture | Texture | null>(null);

  useEffect(() => {
    prefetchEntity(entityId);
  }, [entityId]);

  useFrame((_state, delta) => {
    clockRef.current += delta * 1000;

    const frame = getSpriteFrame(entityId, animState, direction, clockRef.current);
    if (frame.texture) {
      setTexture(frame.texture);
    } else {
      setTexture(getFallbackTexture(entityId));
    }
  });

  const activeTexture = texture ?? getFallbackTexture(entityId);

  const opacity = isDead ? 0.4 : 1;
  const yPos = position.y + (isDead ? -0.3 : 0);

  useFrame(() => {
    if (isSelected && ringRef.current) {
      const pulse = 0.95 + 0.08 * Math.sin(clockRef.current * 0.006);
      ringRef.current.scale.set(pulse * scale, pulse * scale, pulse * scale);
    }
  });

  return (
    <group position={[position.x, yPos + depthOffset, position.z]}>
      {isSelected && (
        <mesh ref={ringRef} position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={0}>
          <ringGeometry args={[0.45 * scale, 0.7 * scale, 32]} />
          <meshBasicMaterial color="#ffcc33" transparent opacity={0.6} depthWrite={false} side={2} />
        </mesh>
      )}
      <mesh ref={meshRef} onClick={onClick} userData={{ raycastable: true }}>
        <planeGeometry args={[1.5 * scale, 1.5 * scale]} />
        <meshBasicMaterial
          map={activeTexture}
          transparent
          opacity={opacity}
          depthWrite={false}
          side={2}
        />
      </mesh>

      {hpBar && !isDead && (
        <group position={[0, 1.2 * scale, 0]}>
          <mesh position={[0, 0, 0]}>
            <planeGeometry args={[1.2 * scale, 0.12 * scale]} />
            <meshBasicMaterial color="#333333" depthWrite={false} />
          </mesh>
          <mesh position={[-(1.2 * scale - (hpBar.current / hpBar.max) * 1.2 * scale) / 2, 0, 0.001]}>
            <planeGeometry args={[(hpBar.current / hpBar.max) * 1.2 * scale, 0.1 * scale]} />
            <meshBasicMaterial
              color={hpBar.current / hpBar.max > 0.5 ? '#44ff44' : hpBar.current / hpBar.max > 0.25 ? '#ffaa00' : '#ff4444'}
              depthWrite={false}
            />
          </mesh>
        </group>
      )}

      {nameTag && (
        <group position={[0, 1.4 * scale, 0]}>
          <mesh>
            <planeGeometry args={[1.5 * scale, 0.2 * scale]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.8} depthWrite={false} />
          </mesh>
        </group>
      )}
    </group>
  );
}

interface SortedEntitiesProps {
  entities: Array<{
    id: string;
    entityId: string;
    position: { x: number; y: number; z: number };
    direction?: Direction;
    animState?: AnimState;
    scale?: number;
    isDead?: boolean;
    onClick?: () => void;
    hpBar?: { current: number; max: number };
    nameTag?: string;
    isSelected?: boolean;
  }>;
}

export function SortedEntities({ entities }: SortedEntitiesProps) {
  const sorted = useMemo(() => {
    return [...entities].sort((a, b) => {
      const depthA = a.position.z + a.position.x * 0.1;
      const depthB = b.position.z + b.position.x * 0.1;
      return depthA - depthB;
    });
  }, [entities]);

  return (
    <group>
      {sorted.map(entity => (
        <SpriteEntity
          key={entity.id}
          entityId={entity.entityId}
          position={entity.position}
          direction={entity.direction}
          animState={entity.animState}
          scale={entity.scale}
          isDead={entity.isDead}
          onClick={entity.onClick}
          hpBar={entity.hpBar}
          isSelected={entity.isSelected}
          nameTag={entity.nameTag}
        />
      ))}
    </group>
  );
}
