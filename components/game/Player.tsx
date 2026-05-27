'use client';

import React, { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, Group as TGroup } from 'three';
import { useGameStore } from '@/store/useGameStore';
import { useNetworkStore } from '@/store/useNetworkStore';
import { RigidBody, RapierRigidBody } from '@react-three/rapier';
import { Sprite } from './Sprite';
import { directionFromAngle, type Direction, type AnimState } from '@/lib/spriteManager';
import { getMovementInput } from '@/lib/movementController';
import { getHeightAtWorld } from '@/lib/navGrid';
import { currentNavGrid } from '@/lib/currentNavGrid';
import { createPlayerStateMachine, updatePlayerStateMachine } from '@/lib/playerStateMachine';
import { playerPosition } from '@/lib/playerPosition';
import { gameData } from '@/shared/loader';

const { balance } = gameData;
const FIXED_YAW = 0.7854;
const COSYAW = Math.cos(-FIXED_YAW);
const SINYAW = Math.sin(-FIXED_YAW);

const JOB_TO_ENTITY: Record<string, string> = {
  Novice: 'novice_m',
  Swordsman: 'swordsman_m',
  Mage: 'mage_m',
  Archer: 'archer_m',
  Thief: 'thief_m',
  Acolyte: 'acolyte_m',
};

function rotateInput(input: { x: number; z: number }) {
  return {
    x: input.x * COSYAW - input.z * SINYAW,
    z: input.x * SINYAW + input.z * COSYAW,
  };
}

export function Player() {
  const rigidBodyRef = useRef<RapierRigidBody>(null);
  const groupRef = useRef<TGroup>(null);
  const [initialPos] = useState(() => useGameStore.getState().position);
  const firstFrameRef = useRef(true);
  const lastAttackTimeRef = useRef(0);

  const smRef = useRef(createPlayerStateMachine());
  const animStateRef = useRef<AnimState>('idle');
  const directionRef = useRef<Direction>('S');
  const velocityRef = useRef({ x: 0, z: 0 });

  const jobClass = useGameStore(s => s.player.jobClass);
  const entityId = JOB_TO_ENTITY[jobClass] || 'novice_m';

  useFrame((state, delta) => {
    if (!rigidBodyRef.current) return;

    if (firstFrameRef.current) {
      firstFrameRef.current = false;
      const pos = useGameStore.getState().position;
      rigidBodyRef.current.setTranslation({ x: pos.x, y: pos.y, z: pos.z }, true);
    }

    const gameStore = useGameStore.getState();
    const networkStore = useNetworkStore.getState();
    const {
      targetPosition, setTargetPosition, setInputDirection,
      selectedTargetId, enemies, player,
    } = gameStore;

    const SPEED = balance.movement.playerSpeed;
    const ACCEL = SPEED * 8;
    const FRICTION = 10;
    const ATTACK_RANGE = balance.combat.attackRange;
    const ATTACK_COOLDOWN = Math.max(0.1, (balance.combat.attackCooldownMs / 1000));

    let pos = rigidBodyRef.current.translation();
    const currentVec = new Vector3(pos.x, pos.y, pos.z);

    // ── Get raw WASD/joystick input ──
    const { input: rawInput, hasKeyboardInput } = getMovementInput();
    let inputDir = { x: rawInput.x, z: rawInput.z };

    // ── Camera-relative rotation (isometric) ──
    inputDir = rotateInput(inputDir);

    // ── Direct input clears server move target ──
    if (hasKeyboardInput && (inputDir.x !== 0 || inputDir.z !== 0)) {
      const ns = useNetworkStore.getState();
      if (ns.socket?.connected) {
        ns.socket.emit('cancelMove');
      }
    }

    // ── Auto-follow enemy if selected ──
    let isAttacking = false;
    if (selectedTargetId) {
      const enemy = enemies[selectedTargetId];
      if (enemy && !enemy.isDead) {
        const enemyPos = new Vector3(enemy.position.x, enemy.position.y, enemy.position.z);
        const dist = currentVec.distanceTo(enemyPos);

        if (dist <= ATTACK_RANGE) {
          const now = state.clock.elapsedTime;
          if (now - lastAttackTimeRef.current >= ATTACK_COOLDOWN) {
            lastAttackTimeRef.current = now;
            isAttacking = true;
            networkStore.attackTarget(selectedTargetId);
          }
          if (inputDir.x === 0 && inputDir.z === 0) {
            inputDir = { x: 0, z: 0 };
          }
        } else {
          const dx = enemy.position.x - pos.x;
          const dz = enemy.position.z - pos.z;
          const len = Math.sqrt(dx * dx + dz * dz);
          if (len > 0.3) {
            inputDir = { x: dx / len, z: dz / len };
          }
        }
      }
    }

    setInputDirection(inputDir);

    // ── Velocity-based movement (RO-style accel/decel) ──
    const isMoving = inputDir.x !== 0 || inputDir.z !== 0;
    if (isMoving) {
      velocityRef.current.x += (inputDir.x * SPEED - velocityRef.current.x) * Math.min(1, ACCEL * delta);
      velocityRef.current.z += (inputDir.z * SPEED - velocityRef.current.z) * Math.min(1, ACCEL * delta);
    } else {
      velocityRef.current.x -= velocityRef.current.x * Math.min(1, FRICTION * delta);
      velocityRef.current.z -= velocityRef.current.z * Math.min(1, FRICTION * delta);
      if (Math.abs(velocityRef.current.x) < 0.001) velocityRef.current.x = 0;
      if (Math.abs(velocityRef.current.z) < 0.001) velocityRef.current.z = 0;
    }

    const hasVelocity = velocityRef.current.x !== 0 || velocityRef.current.z !== 0;
    if (hasVelocity) {
      const newX = pos.x + velocityRef.current.x * delta;
      const newZ = pos.z + velocityRef.current.z * delta;
      const newY = currentNavGrid.grid ? getHeightAtWorld(currentNavGrid.grid, newX, newZ) : pos.y;
      pos = { x: newX, y: newY, z: newZ };
      rigidBodyRef.current.setTranslation(pos, true);
    }

    // ── Update shared position for camera ──
    playerPosition.x = pos.x;
    playerPosition.y = pos.y;
    playerPosition.z = pos.z;

    // ── Server position reconciliation ──
    const snapPos = networkStore.lastSnapshotPos;
    const corrDx = snapPos.x - pos.x;
    const corrDz = snapPos.z - pos.z;
    const corrDistSq = corrDx * corrDx + corrDz * corrDz;

    if (corrDistSq > 25.0) {
      // Hard snap for large errors
      const snapY = currentNavGrid.grid ? getHeightAtWorld(currentNavGrid.grid, snapPos.x, snapPos.z) : snapPos.y;
      pos = { x: snapPos.x, y: snapY, z: snapPos.z };
      rigidBodyRef.current.setTranslation(pos, true);
      playerPosition.x = pos.x;
      playerPosition.y = pos.y;
      playerPosition.z = pos.z;
      velocityRef.current = { x: 0, z: 0 };
    } else if (corrDistSq > 1.0) {
      const blend = isMoving ? 0.08 : 0.15;
      const newX = pos.x + corrDx * blend;
      const newZ = pos.z + corrDz * blend;
      const newY = currentNavGrid.grid ? getHeightAtWorld(currentNavGrid.grid, newX, newZ) : pos.y;
      pos = {
        x: newX,
        y: newY,
        z: newZ,
      };
      rigidBodyRef.current.setTranslation(pos, true);
      playerPosition.x = pos.x;
      playerPosition.z = pos.z;
    }

    // ── Update state machine ──
    const newDir = hasVelocity
      ? directionFromAngle(velocityRef.current.x, velocityRef.current.z)
      : directionRef.current;

    smRef.current = updatePlayerStateMachine(
      smRef.current,
      delta,
      isMoving,
      hasVelocity,
      newDir,
      isAttacking,
    );

    animStateRef.current = smRef.current.animState;
    directionRef.current = newDir;

    // ── Bob animation ──
    if (groupRef.current) {
      if (hasVelocity) {
        const bob = Math.sin(state.clock.elapsedTime * 12) * 0.08;
        groupRef.current.position.y = bob;
      } else {
        groupRef.current.position.y = Math.sin(state.clock.elapsedTime * 2) * 0.02;
      }
    }
  });

  return (
    <RigidBody ref={rigidBodyRef} type="kinematicPosition" position={[initialPos.x, initialPos.y, initialPos.z]} enabledRotations={[false, false, false]}>
      <group ref={groupRef}>
        <Sprite
          entityId={entityId}
          state={animStateRef.current}
          direction={directionRef.current}
          width={1.5}
          height={1.5}
          billboard
        />
      </group>
    </RigidBody>
  );
}
