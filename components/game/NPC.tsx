'use client';

import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group as TGroup } from 'three';
import { Billboard, Text } from '@react-three/drei';
import { Sprite } from './Sprite';
import { startInteraction } from '@/lib/interactionManager';

interface NPCProps {
  id: string;
  name: string;
  sprite: string;
  dialogId: string;
  position: { x: number; y: number; z: number };
}

export function NPC({ id, name, sprite, position }: NPCProps) {
  const groupRef = useRef<TGroup>(null);
  const floatOffset = useRef(Math.random() * Math.PI * 2);

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.position.y = Math.sin(state.clock.elapsedTime * 1.2 + floatOffset.current) * 0.05;
    }
  });

  return (
    <group position={[position.x, position.y, position.z]}>
      <Billboard follow>
        <group
          ref={groupRef}
          onPointerDown={(e) => {
            e.stopPropagation();
            startInteraction({ type: 'npc', id, position: { x: position.x, z: position.z } });
          }}
        >
          <Sprite
            entityId={sprite}
            state="idle"
            direction="S"
            width={1.3}
            height={1.3}
          />
          <group position={[0, 0.85, 0]}>
            <Text fontSize={0.16} color="#aef" outlineWidth={0.02} outlineColor="black">
              {name}
            </Text>
          </group>
        </group>
      </Billboard>
    </group>
  );
}
