import React, { useRef, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, Billboard } from '@react-three/drei';
import * as THREE from 'three';
import { useNetworkStore } from '@/store/useNetworkStore';
import { startInteraction } from '@/lib/interactionManager';

interface WarpPortalProps {
  id: string;
  name: string;
  position: { x: number; y: number; z: number };
  targetMapName: string;
  visual: string;
}

function PortalEffect({ color, hovered }: { color: string; hovered: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const particlesRef = useRef<THREE.Points>(null);
  const innerRingRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);

  const particleCount = 40;
  const particleData = useMemo(() => {
    const data: { angle: number; radius: number; speed: number; yOffset: number; size: number }[] = [];
    for (let i = 0; i < particleCount; i++) {
      data.push({
        angle: Math.random() * Math.PI * 2,
        radius: 0.3 + Math.random() * 0.6,
        speed: 0.3 + Math.random() * 0.7,
        yOffset: (Math.random() - 0.5) * 1.5,
        size: 0.02 + Math.random() * 0.04,
      });
    }
    return data;
  }, []);

  const particlePositions = useMemo(() => {
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 0;
    }
    return positions;
  }, []);

  const particleColors = useMemo(() => {
    const colors = new Float32Array(particleCount * 3);
    const c = new THREE.Color(color);
    for (let i = 0; i < particleCount; i++) {
      colors[i * 3] = c.r * (0.7 + Math.random() * 0.3);
      colors[i * 3 + 1] = c.g * (0.7 + Math.random() * 0.3);
      colors[i * 3 + 2] = c.b * (0.7 + Math.random() * 0.3);
    }
    return colors;
  }, [color]);

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;

    groupRef.current.rotation.z = t * 0.15;

    if (innerRingRef.current) {
      innerRingRef.current.rotation.x = t * 0.8;
      innerRingRef.current.rotation.z = t * 0.5;
      const pulse = 1 + Math.sin(t * 3) * 0.08;
      innerRingRef.current.scale.setScalar(pulse);
    }

    if (glowRef.current) {
      const glowIntensity = hovered ? 1.0 : 0.6;
      const mat = glowRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = glowIntensity + Math.sin(t * 2) * 0.15;
      const glowScale = hovered ? 1.3 : 1.1;
      glowRef.current.scale.setScalar(glowScale + Math.sin(t * 1.5) * 0.05);
    }

    if (particlesRef.current) {
      const attributes = particlesRef.current.geometry?.attributes;
      if (!attributes?.position?.array) return;
      const pos = attributes.position.array as Float32Array;
      for (let i = 0; i < particleCount; i++) {
        const p = particleData[i];
        p.angle += p.speed * delta * 2;
        const x = Math.cos(p.angle) * p.radius;
        const z = Math.sin(p.angle) * p.radius;
        const y = p.yOffset + Math.sin(t * p.speed * 2 + i) * 0.2;
        pos[i * 3] = x;
        pos[i * 3 + 1] = y;
        pos[i * 3 + 2] = z;
      }
      attributes.position.needsUpdate = true;
    }
  });

  return (
    <group ref={groupRef}>
      <mesh ref={glowRef}>
        <sphereGeometry args={[1.0, 16, 16]} />
        <meshBasicMaterial color={color} transparent opacity={0.15} />
      </mesh>

      <mesh ref={innerRingRef}>
        <torusGeometry args={[0.85, 0.08, 8, 48]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={hovered ? 2.0 : 1.2}
          transparent
          opacity={0.9}
        />
      </mesh>

      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.7, 0.05, 8, 48]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={hovered ? 1.8 : 1.0}
          transparent
          opacity={0.7}
        />
      </mesh>

      <mesh>
        <circleGeometry args={[0.65, 32]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={hovered ? 1.5 : 0.8}
          transparent
          opacity={hovered ? 0.5 : 0.3}
          side={THREE.DoubleSide}
        />
      </mesh>

      <points ref={particlesRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[particlePositions, 3]}
          />
          <bufferAttribute
            attach="attributes-color"
            args={[particleColors, 3]}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.06}
          vertexColors
          transparent
          opacity={0.8}
          sizeAttenuation
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>

      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.5, 1.0, 32]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.4}
          transparent
          opacity={0.2}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

function GroundIndicator({ color, hovered }: { color: string; hovered: boolean }) {
  const ringRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (ringRef.current) {
      const t = state.clock.elapsedTime;
      ringRef.current.rotation.z = t * 0.3;
      const pulse = 1 + Math.sin(t * 2) * 0.1;
      ringRef.current.scale.setScalar(pulse);
    }
  });

  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <mesh ref={ringRef}>
        <ringGeometry args={[0.8, 1.2, 32]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={hovered ? 0.8 : 0.4}
          transparent
          opacity={0.3}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh>
        <circleGeometry args={[0.8, 32]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.3}
          transparent
          opacity={0.15}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

function WarpPillar({ color, offset }: { color: string; offset: [number, number, number] }) {
  const glowRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (glowRef.current) {
      const t = state.clock.elapsedTime;
      const mat = glowRef.current.material as THREE.MeshStandardMaterial;
      mat.opacity = 0.3 + Math.sin(t * 3 + offset[0] * 5) * 0.15;
    }
  });

  return (
    <group position={offset}>
      <mesh>
        <cylinderGeometry args={[0.08, 0.1, 2.5, 8]} />
        <meshStandardMaterial color="#555" emissive={color} emissiveIntensity={0.3} />
      </mesh>
      <mesh ref={glowRef} position={[0, 1.3, 0]}>
        <sphereGeometry args={[0.15, 8, 8]} />
        <meshBasicMaterial color={color} transparent opacity={0.5} />
      </mesh>
      <mesh position={[0, 1.3, 0]}>
        <sphereGeometry args={[0.1, 8, 8]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.0} />
      </mesh>
    </group>
  );
}

export function WarpPortal({ id, name, position, targetMapName, visual }: WarpPortalProps) {
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.position.y = position.y + Math.sin(state.clock.elapsedTime * 1.5) * 0.08;
    }
  });

  const handleInteract = () => {
    startInteraction({ type: 'warp', id, position: { x: position.x, z: position.z } });
  };

  const portalColor = visual === 'portal' ? '#8844ff' : visual === 'door' ? '#8B4513' : '#aaaaaa';

  return (
    <group position={[position.x, position.y, position.z]}>
      <group
        ref={groupRef}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
        onClick={handleInteract}
      >
        {visual === 'portal' && (
          <>
            <WarpPillar color={portalColor} offset={[-1.0, 0, 0]} />
            <WarpPillar color={portalColor} offset={[1.0, 0, 0]} />

            <mesh>
              <torusGeometry args={[1.0, 0.06, 8, 32]} />
              <meshStandardMaterial color="#aa88ff" emissive={portalColor} emissiveIntensity={0.6} />
            </mesh>

            <PortalEffect color={portalColor} hovered={hovered} />

            <GroundIndicator color={portalColor} hovered={hovered} />

            <Billboard position={[0, 2.2, 0]}>
              <Text
                fontSize={0.3}
                color={hovered ? '#ffff88' : '#ffffff'}
                outlineWidth={0.04}
                outlineColor="black"
                anchorX="center"
                anchorY="middle"
              >
                {name}
              </Text>
            </Billboard>

            {hovered && (
              <Billboard position={[0, -1.2, 0]}>
                <group>
                  <mesh>
                    <planeGeometry args={[1.8, 0.4]} />
                    <meshBasicMaterial color="#222" transparent opacity={0.7} />
                  </mesh>
                  <Text
                    fontSize={0.2}
                    color="#aaddff"
                    outlineWidth={0.02}
                    outlineColor="black"
                    anchorX="center"
                    anchorY="middle"
                  >
                    Click to warp to {targetMapName}
                  </Text>
                </group>
              </Billboard>
            )}
          </>
        )}

        {visual === 'door' && (
          <>
            <mesh>
              <boxGeometry args={[1.5, 2.5, 0.4]} />
              <meshStandardMaterial color="#6B4226" />
            </mesh>
            <mesh position={[0, 0, 0.22]}>
              <boxGeometry args={[1.2, 2.2, 0.05]} />
              <meshStandardMaterial color="#8B6914" emissive="#aa8833" emissiveIntensity={hovered ? 0.5 : 0.2} />
            </mesh>
            <mesh position={[0.5, 0, 0.25]}>
              <sphereGeometry args={[0.08, 8, 8]} />
              <meshStandardMaterial color="#ffd700" emissive="#ffd700" emissiveIntensity={0.8} />
            </mesh>
            <Billboard position={[0, 1.8, 0]}>
              <Text
                fontSize={0.25}
                color={hovered ? '#ffff88' : '#ffffff'}
                outlineWidth={0.03}
                outlineColor="black"
                anchorX="center"
                anchorY="middle"
              >
                {name}
              </Text>
            </Billboard>
          </>
        )}

        {visual === 'npc' && (
          <group>
            <mesh position={[0, 0.5, 0]}>
              <capsuleGeometry args={[0.3, 0.6, 4, 8]} />
              <meshStandardMaterial color="#4488ff" />
            </mesh>
            <mesh position={[0, 1.0, 0]}>
              <sphereGeometry args={[0.25, 8, 8]} />
              <meshStandardMaterial color="#ffcc88" />
            </mesh>
            <Billboard position={[0, 1.8, 0]}>
              <Text
                fontSize={0.25}
                color={hovered ? '#ffff88' : '#ffffff'}
                outlineWidth={0.03}
                outlineColor="black"
                anchorX="center"
                anchorY="middle"
              >
                {name}
              </Text>
            </Billboard>
          </group>
        )}

        {visual === 'hidden' && (
          <mesh visible={hovered}>
            <sphereGeometry args={[0.5, 16, 16]} />
            <meshStandardMaterial color="#ffffff" transparent opacity={0.3} />
          </mesh>
        )}
      </group>
    </group>
  );
}
