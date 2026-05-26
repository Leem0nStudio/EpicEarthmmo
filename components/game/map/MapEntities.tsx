'use client';

import React, { useMemo } from 'react';
import { useGameStore } from '@/store/useGameStore';
import { SortedEntities } from '../SpriteEntity';
import { DamageNumbers } from '../DamageNumbers';

export function MapEntities() {
  const enemies = useGameStore((state) => state.enemies);
  const selectedTargetId = useGameStore((state) => state.selectedTargetId);

  const entityList = useMemo(() => {
    return Object.values(enemies).map(enemy => ({
      id: enemy.id,
      entityId: (enemy.name || enemy.enemyId || 'unknown').toLowerCase().replace(/\s+/g, '_'),
      position: enemy.position,
      animState: enemy.isDead ? 'dead' as const : 'idle' as const,
      isDead: enemy.isDead,
      hpBar: { current: enemy.hp, max: enemy.maxHp },
      nameTag: enemy.name || '',
      isSelected: enemy.id === selectedTargetId,
    }));
  }, [enemies]);

  return (
    <group>
      <SortedEntities entities={entityList} />
      <DamageNumbers />
    </group>
  );
}
