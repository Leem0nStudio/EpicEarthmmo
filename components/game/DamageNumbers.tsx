import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import { useGameStore } from '@/store/useGameStore';
import { DamageText } from '@/types/game';

function DamageNumber({ damage }: { damage: DamageText }) {
  const ref = useRef<any>(null);
  const startTime = useRef(0);
  const initialPos = useRef({ x: damage.position.x, y: damage.position.y, z: damage.position.z });

  const isCritical = damage.amount >= 15;
  const color = damage.color || '';
  const isHeal = color.includes('green') || color.includes('4ade80');
  const isPlayerDamage = color.includes('ff4444') || color.includes('red');

  const fontSize = useMemo(() => {
    if (isCritical) return 0.7;
    if (isHeal) return 0.55;
    return 0.45;
  }, [isCritical, isHeal]);

  useFrame((state) => {
    if (!ref.current) return;
    if (startTime.current === 0) startTime.current = state.clock.elapsedTime;
    const elapsed = state.clock.elapsedTime - startTime.current;

    const floatSpeed = isCritical ? 2.5 : 1.8;
    const fadeStart = isCritical ? 0.5 : 0.8;
    const fadeDuration = isCritical ? 0.8 : 0.6;

    ref.current.position.y = initialPos.current.y + elapsed * floatSpeed;
    ref.current.position.x = initialPos.current.x + Math.sin(elapsed * 3) * 0.05;

    const opacity = elapsed < fadeStart ? 1 : Math.max(0, 1 - (elapsed - fadeStart) / fadeDuration);
    ref.current.material.opacity = opacity;

    if (isCritical) {
      const scale = 1 + Math.sin(elapsed * 10) * 0.1 * Math.max(0, 1 - elapsed * 2);
      ref.current.scale.setScalar(scale);
    }
  });

  const displayColor = isCritical ? '#ffcc00' : (damage.color || '#ffffff');
  const outlineColor = isCritical ? '#8B4513' : 'black';
  const outlineWidth = isCritical ? 0.08 : 0.04;

  return (
    <Text
      ref={ref}
      position={[initialPos.current.x, initialPos.current.y, initialPos.current.z]}
      fontSize={fontSize}
      color={displayColor}
      outlineWidth={outlineWidth}
      outlineColor={outlineColor}
      fontWeight={isCritical ? '900' : 'bold'}
      anchorX="center"
      anchorY="middle"
      material-transparent
    >
      {isCritical ? `💥 ${damage.amount}` : damage.amount}
    </Text>
  );
}

export function DamageNumbers() {
  const damages = useGameStore((state) => state.damages);

  const activeDamages = damages.filter(d => Date.now() - d.timestamp < 2000);

  return (
    <group>
      {activeDamages.map((d) => (
        <DamageNumber key={d.id} damage={d} />
      ))}
    </group>
  );
}
