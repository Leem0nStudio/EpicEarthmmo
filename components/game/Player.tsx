'use client';

import React, { useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, Group as TGroup } from 'three';
import { useGameStore } from '@/store/useGameStore';
import { useNetworkStore } from '@/store/useNetworkStore';
import { RigidBody, RapierRigidBody } from '@react-three/rapier';
import { Sprite } from './Sprite';
import { directionFromAngle, type Direction, type AnimState } from '@/lib/spriteManager';
import { getMovementInput } from '@/lib/movementController';
import { getHeightAtWorld, gridToWorld } from '@/lib/navGrid';
import { currentNavGrid } from '@/lib/currentNavGrid';
import { createPlayerStateMachine, updatePlayerStateMachine } from '@/lib/playerStateMachine';
import { playerPosition } from '@/lib/playerPosition';
import { gameData } from '@/shared/loader';
import type { GridPathStep, MoveAcceptedData } from '@/shared/types/network';

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

interface MovementState {
  mode: 'idle' | 'followingPath';
  path: GridPathStep[];
  receiveTime: number;
  walkSpeedMs: number;
}

function computeGridPosition(
  mov: MovementState,
  navGrid: NonNullable<typeof currentNavGrid.grid>,
): { x: number; y: number; z: number; animState: AnimState; dir: Direction } | null {
  if (mov.mode !== 'followingPath' || mov.path.length < 2) return null;

  const elapsed = Date.now() - mov.receiveTime;
  if (elapsed < 0) return null;

  let currentIdx = 0;
  for (let i = mov.path.length - 1; i >= 0; i--) {
    if (elapsed >= mov.path[i].cumTimeMs) {
      currentIdx = i;
      break;
    }
  }

  if (currentIdx >= mov.path.length - 1) {
    const last = mov.path[mov.path.length - 1];
    const [wx, wz] = gridToWorld(navGrid, last.gx, last.gz);
    const wy = getHeightAtWorld(navGrid, wx, wz);
    return { x: wx, y: wy, z: wz, animState: 'idle' as AnimState, dir: 'S' as Direction };
  }

  const curr = mov.path[currentIdx];
  const next = mov.path[currentIdx + 1];
  const segElapsed = elapsed - curr.cumTimeMs;
  const segDuration = next.cumTimeMs - curr.cumTimeMs;
  const t = segDuration > 0 ? Math.min(1, segElapsed / segDuration) : 1;

  const [cwx, cwz] = gridToWorld(navGrid, curr.gx, curr.gz);
  const [nwx, nwz] = gridToWorld(navGrid, next.gx, next.gz);
  const ix = cwx + (nwx - cwx) * t;
  const iz = cwz + (nwz - cwz) * t;
  const iy = getHeightAtWorld(navGrid, ix, iz);

  const dir = directionFromAngle(nwx - cwx, nwz - cwz);
  return { x: ix, y: iy, z: iz, animState: 'walk' as AnimState, dir };
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
  const moveStateRef = useRef<MovementState>({
    mode: 'idle', path: [], receiveTime: 0, walkSpeedMs: 150,
  });
  const pathDirRef = useRef<Direction>('S');

  // Listen for server moveAccepted / moveCompleted
  useEffect(() => {
    const ns = useNetworkStore.getState();
    const socket = ns.socket;
    if (!socket) return;

    const onMoveAccepted = (data: MoveAcceptedData) => {
      if (!data.path || data.path.length < 2) return;
      moveStateRef.current = {
        mode: 'followingPath',
        path: data.path,
        receiveTime: Date.now(),
        walkSpeedMs: data.walkSpeedMs,
      };
    };

    const onMoveCompleted = () => {
      moveStateRef.current = {
        mode: 'idle', path: [], receiveTime: 0, walkSpeedMs: 150,
      };
    };

    socket.on('moveAccepted', onMoveAccepted);
    socket.on('moveCompleted', onMoveCompleted);

    return () => {
      socket.off('moveAccepted', onMoveAccepted);
      socket.off('moveCompleted', onMoveCompleted);
    };
  }, []);

  const jobClass = useGameStore(s => s.player.jobClass);
  const entityId = JOB_TO_ENTITY[jobClass] || 'novice_m';

  useFrame((state, delta) => {
    if (!rigidBodyRef.current) return;
    const navGrid = currentNavGrid.grid;

    if (firstFrameRef.current) {
      firstFrameRef.current = false;
      const pos = useGameStore.getState().position;
      rigidBodyRef.current.setTranslation({ x: pos.x, y: pos.y, z: pos.z }, true);
    }

    const gameStore = useGameStore.getState();
    const networkStore = useNetworkStore.getState();
    const {
      setTargetPosition, setInputDirection,
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
    inputDir = rotateInput(inputDir);

    const mov = moveStateRef.current;

    // ── WASD input cancels grid path ──
    if (hasKeyboardInput && (inputDir.x !== 0 || inputDir.z !== 0)) {
      if (mov.mode === 'followingPath') {
        moveStateRef.current = {
          mode: 'idle', path: [], receiveTime: 0, walkSpeedMs: 150,
        };
        const ns = useNetworkStore.getState();
        if (ns.socket?.connected) {
          ns.socket.emit('cancelMove');
        }
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

    // ── Determine movement mode ──
    const isWASD = hasKeyboardInput && (inputDir.x !== 0 || inputDir.z !== 0);

    if (mov.mode === 'followingPath' && navGrid) {
      // ── RO-style grid path interpolation ──
      const gridPos = computeGridPosition(mov, navGrid);
      if (gridPos) {
        pos = { x: gridPos.x, y: gridPos.y, z: gridPos.z };
        rigidBodyRef.current.setTranslation(pos, true);
        pathDirRef.current = gridPos.dir;

        const isAtEnd = gridPos.animState === 'idle';
        if (isAtEnd) {
          moveStateRef.current = {
            mode: 'idle', path: [], receiveTime: 0, walkSpeedMs: 150,
          };
          animStateRef.current = 'idle';
        } else {
          animStateRef.current = 'walk';
        }
        directionRef.current = gridPos.dir;
      }
      velocityRef.current = { x: 0, z: 0 };
    } else if (isWASD) {
      // ── WASD velocity-based movement ──
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
        const newY = navGrid ? getHeightAtWorld(navGrid, newX, newZ) : pos.y;
        pos = { x: newX, y: newY, z: newZ };
        rigidBodyRef.current.setTranslation(pos, true);
      }
    } else if (!isWASD && mov.mode === 'idle') {
      // ── No input — decelerate ──
      velocityRef.current.x -= velocityRef.current.x * Math.min(1, FRICTION * delta);
      velocityRef.current.z -= velocityRef.current.z * Math.min(1, FRICTION * delta);
      if (Math.abs(velocityRef.current.x) < 0.001) velocityRef.current.x = 0;
      if (Math.abs(velocityRef.current.z) < 0.001) velocityRef.current.z = 0;

      if (velocityRef.current.x !== 0 || velocityRef.current.z !== 0) {
        const newX = pos.x + velocityRef.current.x * delta;
        const newZ = pos.z + velocityRef.current.z * delta;
        const newY = navGrid ? getHeightAtWorld(navGrid, newX, newZ) : pos.y;
        pos = { x: newX, y: newY, z: newZ };
        rigidBodyRef.current.setTranslation(pos, true);
      }
    }

    // ── Update shared position for camera ──
    playerPosition.x = pos.x;
    playerPosition.y = pos.y;
    playerPosition.z = pos.z;

    // ── Server position reconciliation (gentle, only when idle/WASD) ──
    if (mov.mode !== 'followingPath') {
      const snapPos = networkStore.lastSnapshotPos;
      const corrDx = snapPos.x - pos.x;
      const corrDz = snapPos.z - pos.z;
      const corrDistSq = corrDx * corrDx + corrDz * corrDz;

      if (corrDistSq > 25.0) {
        const snapY = navGrid ? getHeightAtWorld(navGrid, snapPos.x, snapPos.z) : snapPos.y;
        pos = { x: snapPos.x, y: snapY, z: snapPos.z };
        rigidBodyRef.current.setTranslation(pos, true);
        playerPosition.x = pos.x;
        playerPosition.y = pos.y;
        playerPosition.z = pos.z;
        velocityRef.current = { x: 0, z: 0 };
      } else if (corrDistSq > 1.0) {
        const blend = 0.12;
        const newX = pos.x + corrDx * blend;
        const newZ = pos.z + corrDz * blend;
        const newY = navGrid ? getHeightAtWorld(navGrid, newX, newZ) : pos.y;
        pos = { x: newX, y: newY, z: newZ };
        rigidBodyRef.current.setTranslation(pos, true);
        playerPosition.x = pos.x;
        playerPosition.z = pos.z;
      }
    }

    // ── Update state machine ──
    const hasVelocity = velocityRef.current.x !== 0 || velocityRef.current.z !== 0;
    const isMoving = mov.mode === 'followingPath' || (isWASD && (inputDir.x !== 0 || inputDir.z !== 0)) || hasVelocity;

    const newDir = mov.mode === 'followingPath'
      ? pathDirRef.current
      : hasVelocity
        ? directionFromAngle(velocityRef.current.x, velocityRef.current.z)
        : directionRef.current;

    smRef.current = updatePlayerStateMachine(
      smRef.current,
      delta,
      isMoving,
      hasVelocity || mov.mode === 'followingPath',
      newDir,
      isAttacking,
    );

    animStateRef.current = smRef.current.animState;
    directionRef.current = newDir;

    // ── Bob animation ──
    if (groupRef.current) {
      if (isMoving) {
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
