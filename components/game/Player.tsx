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

  const elapsed = performance.now() - mov.receiveTime;
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
  const lastInputSendTimeRef = useRef(0);
  const inputSeqRef = useRef(0);
  const lastSentInputRef = useRef({ x: 0, z: 0 });
  const hasServerInitRef = useRef(false);

  const socket = useNetworkStore(s => s.socket);
  const jobClass = useGameStore(s => s.player.jobClass);
  const entityId = JOB_TO_ENTITY[jobClass] || 'novice_m';
  const isConnected = useNetworkStore(s => s.isConnected);

  // Track when server init has been received (Bug 8)
  useEffect(() => {
    if (!socket) return;
    const onInit = () => { hasServerInitRef.current = true; };
    socket.on('init', onInit);
    return () => { socket.off('init', onInit); };
  }, [socket]);

  // Listen for server moveAccepted / moveCompleted
  useEffect(() => {
    if (!socket) return;

    const onMoveAccepted = (data: MoveAcceptedData) => {
      if (!data.path || data.path.length < 2) return;

      const networkDelay = Math.max(1, Date.now() - data.startTime);
      moveStateRef.current = {
        mode: 'followingPath',
        path: data.path,
        receiveTime: performance.now() - networkDelay,
        walkSpeedMs: data.walkSpeedMs,
      };
    };

    const onMoveCompleted = () => {
      moveStateRef.current = {
        mode: 'idle', path: [], receiveTime: 0, walkSpeedMs: 150,
      };
    };

    const onMoveBlocked = () => {
      moveStateRef.current = {
        mode: 'idle', path: [], receiveTime: 0, walkSpeedMs: 150,
      };
    };

    socket.on('moveAccepted', onMoveAccepted);
    socket.on('moveCompleted', onMoveCompleted);
    socket.on('moveBlocked', onMoveBlocked);

    return () => {
      socket.off('moveAccepted', onMoveAccepted);
      socket.off('moveCompleted', onMoveCompleted);
      socket.off('moveBlocked', onMoveBlocked);
    };
  }, [socket]);

  useFrame((state, delta) => {
    if (!rigidBodyRef.current) return;
    const navGrid = currentNavGrid.grid;

    // Bug 8: wait for server init before setting position
    if (firstFrameRef.current) {
      firstFrameRef.current = false;
      if (isConnected && hasServerInitRef.current) {
        const pos = useGameStore.getState().position;
        rigidBodyRef.current.setTranslation({ x: pos.x, y: pos.y, z: pos.z }, true);
      }
    }

    const gameStore = useGameStore.getState();
    const networkStore = useNetworkStore.getState();
    const {
      setInputDirection,
      selectedTargetId, enemies,
    } = gameStore;

    const SPEED = balance.movement.playerSpeed;
    const ACCEL = SPEED * 8;
    const FRICTION = 10;
    const ATTACK_RANGE = balance.combat.attackRange;
    const ATTACK_COOLDOWN = Math.max(0.1, (balance.combat.attackCooldownMs / 1000));

    let pos = rigidBodyRef.current.translation();
    const currentVec = new Vector3(pos.x, pos.y, pos.z);

    const mov = moveStateRef.current;

    // ── Determine effective input direction ──
    let effectiveInput: { x: number; z: number } | null = null;
    let inputSource: 'keyboard' | 'autofollow' | null = null;
    let isAttacking = false;

    // 1. WASD/joystick takes priority
    const { input: rawInput, hasKeyboardInput } = getMovementInput();
    if (hasKeyboardInput) {
      const rotated = rotateInput(rawInput);
      if (rotated.x !== 0 || rotated.z !== 0) {
        effectiveInput = rotated;
        inputSource = 'keyboard';
      }
    }

    // 2. Auto-follow if no direct input
    if (!effectiveInput && selectedTargetId) {
      const enemy = enemies[selectedTargetId];
      if (enemy && !enemy.isDead) {
        // Bug 6: use server snapshot position for range check, not predicted position
        const checkPos = networkStore.lastSnapshotPos;
        const checkVec = new Vector3(checkPos.x, checkPos.y, checkPos.z);
        const enemyPos = new Vector3(enemy.position.x, enemy.position.y, enemy.position.z);
        const dist = checkVec.distanceTo(enemyPos);

        if (dist <= ATTACK_RANGE) {
          const now = state.clock.elapsedTime;
          if (now - lastAttackTimeRef.current >= ATTACK_COOLDOWN) {
            lastAttackTimeRef.current = now;
            isAttacking = true;
            networkStore.attackTarget(selectedTargetId);
          }
        } else {
          const dx = enemy.position.x - checkPos.x;
          const dz = enemy.position.z - checkPos.z;
          const len = Math.sqrt(dx * dx + dz * dz);
          if (len > 0.3) {
            effectiveInput = { x: dx / len, z: dz / len };
            inputSource = 'autofollow';
          }
        }
      }
    }

    // 3. Cancel grid path if we have direct input from ANY source
    if (effectiveInput && mov.mode === 'followingPath') {
      moveStateRef.current = {
        mode: 'idle', path: [], receiveTime: 0, walkSpeedMs: 150,
      };
      if (networkStore.socket?.connected) {
        networkStore.socket.emit('cancelMove');
      }
    }

    setInputDirection(effectiveInput || { x: 0, z: 0 });

    // ── Send WASD input to server (throttled) ──
    const sendX = effectiveInput?.x ?? 0;
    const sendZ = effectiveInput?.z ?? 0;
    const now = Date.now();
    const changed = sendX !== lastSentInputRef.current.x || sendZ !== lastSentInputRef.current.z;
    const isActive = sendX !== 0 || sendZ !== 0;
    if (changed || (isActive && Date.now() - lastInputSendTimeRef.current >= 50)) {
      lastSentInputRef.current = { x: sendX, z: sendZ };
      lastInputSendTimeRef.current = Date.now();
      if (socket?.connected) {
        socket.emit('input', {
          dirX: sendX, dirZ: sendZ, seq: inputSeqRef.current++,
        });
      }
    }

    // ── Movement modes ──
    if (moveStateRef.current.mode === 'followingPath' && navGrid) {
      const gridPos = computeGridPosition(moveStateRef.current, navGrid);
      if (gridPos) {
        pos = { x: gridPos.x, y: gridPos.y, z: gridPos.z };
        rigidBodyRef.current.setTranslation(pos, true);
        pathDirRef.current = gridPos.dir;

        if (gridPos.animState === 'idle') {
          animStateRef.current = 'idle';
        } else {
          animStateRef.current = 'walk';
        }
        directionRef.current = gridPos.dir;
      }
      velocityRef.current = { x: 0, z: 0 };
    } else if (effectiveInput) {
      velocityRef.current.x += (effectiveInput.x * SPEED - velocityRef.current.x) * Math.min(1, ACCEL * delta);
      velocityRef.current.z += (effectiveInput.z * SPEED - velocityRef.current.z) * Math.min(1, ACCEL * delta);

      const newX = pos.x + velocityRef.current.x * delta;
      const newZ = pos.z + velocityRef.current.z * delta;
      const newY = navGrid ? getHeightAtWorld(navGrid, newX, newZ) : pos.y;
      pos = { x: newX, y: newY, z: newZ };
      rigidBodyRef.current.setTranslation(pos, true);
    } else {
      // Bug 5: match server friction model (10 * tickTimeSec = 0.5 per 50ms tick)
      // Client runs at ~60fps (16ms) so 3 frames ≈ 1 server tick
      // Apply friction in same way as server: 10 * delta per frame
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

    // ── Server position reconciliation (always active, Bug 3) ──
    {
      const snapPos = networkStore.lastSnapshotPos;
      const corrDx = snapPos.x - pos.x;
      const corrDz = snapPos.z - pos.z;
      const corrDistSq = corrDx * corrDx + corrDz * corrDz;

      const rttSec = networkStore.rtt / 1000;
      const expectedError = SPEED * rttSec;

      // Bug 7: tighter thresholds
      // Path following: tighter since errors should be small (just clock drift)
      // Direct input: slightly looser for prediction errors
      const isPath = moveStateRef.current.mode === 'followingPath';
      const snapThresholdSq = isPath
        ? Math.max(4.0, expectedError * expectedError * 2)
        : Math.max(9.0, expectedError * expectedError * 4);
      const blendThresholdSq = isPath
        ? Math.max(1.0, expectedError * expectedError)
        : Math.max(2.25, expectedError * expectedError);

      if (corrDistSq > snapThresholdSq) {
        const snapY = navGrid ? getHeightAtWorld(navGrid, snapPos.x, snapPos.z) : snapPos.y;
        pos = { x: snapPos.x, y: snapY, z: snapPos.z };
        rigidBodyRef.current.setTranslation(pos, true);
        playerPosition.x = pos.x;
        playerPosition.y = pos.y;
        playerPosition.z = pos.z;
        velocityRef.current = { x: 0, z: 0 };
      } else if (corrDistSq > blendThresholdSq) {
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
    const isFollowingPath = moveStateRef.current.mode === 'followingPath';
    const isMoving = isFollowingPath || !!effectiveInput || hasVelocity;

    const newDir = isFollowingPath
      ? pathDirRef.current
      : hasVelocity
        ? directionFromAngle(velocityRef.current.x, velocityRef.current.z)
        : directionRef.current;

    smRef.current = updatePlayerStateMachine(
      smRef.current,
      delta,
      isMoving,
      isFollowingPath || hasVelocity,
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
        />
      </group>
    </RigidBody>
  );
}
