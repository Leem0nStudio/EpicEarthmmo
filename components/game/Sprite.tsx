'use client';

import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group, Mesh, MeshBasicMaterial } from 'three';
import {
  type Direction,
  type AnimState,
  type SpriteFrame,
  getSpriteFrame,
} from '@/lib/spriteManager';

interface SpriteProps {
  entityId: string;
  state: AnimState;
  direction: Direction;
  width?: number;
  height?: number;
  opacity?: number;
  color?: string;
  onFrameUpdate?: (frame: SpriteFrame) => void;
  children?: React.ReactNode;
}

const CAMERA_TILT = -Math.atan2(14, 16);

export function Sprite({
  entityId,
  state,
  direction,
  width = 1.5,
  height = 1.5,
  opacity = 1,
  color,
  onFrameUpdate,
  children,
}: SpriteProps) {
  const meshRef = useRef<Mesh>(null);
  const startTime = useRef(Date.now());

  const spriteInfo = useRef<SpriteFrame>({
    texture: null,
    offsetX: 0, offsetY: 0,
    repeatX: 1, repeatY: 1,
    frameIndex: 0, totalFrames: 1,
  });

  useFrame(() => {
    if (!meshRef.current) return;

    const elapsed = Date.now() - startTime.current;
    const info = getSpriteFrame(entityId, state, direction, elapsed);

    if (
      info.texture !== spriteInfo.current.texture ||
      info.offsetX !== spriteInfo.current.offsetX ||
      info.repeatX !== spriteInfo.current.repeatX
    ) {
      const mat = meshRef.current.material;
      if (mat && !Array.isArray(mat) && 'map' in mat && info.texture) {
        const m = mat as unknown as MeshBasicMaterial;
        m.map = info.texture;
        m.needsUpdate = true;
      }

      const geo = meshRef.current.geometry;
      if (geo && 'attributes' in geo) {
        const uvs = geo.attributes.uv;
        if (uvs && uvs.array) {
          const uvsArray = uvs.array as Float32Array;
          const rw = info.repeatX;
          const ox = info.offsetX;

          uvsArray[0] = ox;
          uvsArray[1] = 1;
          uvsArray[2] = ox + rw;
          uvsArray[3] = 1;
          uvsArray[4] = ox;
          uvsArray[5] = 0;
          uvsArray[6] = ox + rw;
          uvsArray[7] = 0;
          uvs.needsUpdate = true;
        }
      }

      spriteInfo.current = info;
      onFrameUpdate?.(info);
    }
  });

  return (
    <group rotation={[CAMERA_TILT, 0, 0]}>
      <mesh ref={meshRef}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial
          transparent
          opacity={opacity}
          color={color}
          depthWrite={false}
        />
      </mesh>
      {children}
    </group>
  );
}
