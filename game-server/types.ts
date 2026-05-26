import type { PlayerStats, EquipmentSlot } from '../shared/schemas/gameState';
import type { PlayerInput } from '../shared/types/network';

export interface SnapshotPlayer {
  x: number; y: number; z: number;
  hp: number; maxHp: number;
  sp: number; maxSp: number;
  lastProcessedSeq?: number;
}

export interface InventorySlot {
  itemId: string;
  amount: number;
}

export interface ServerPlayer {
  id: string;
  x: number; y: number; z: number;
  vx: number; vz: number;
  name: string;
  stats: PlayerStats;
  hp: number; maxHp: number;
  sp: number; maxSp: number;
  baseLevel: number; jobLevel: number;
  jobClass: string;
  baseExp: number;
  jobExp: number;
  unlockedSkills: string[];
  skillPoints: number;
  skillLevels: Record<string, number>;
  lastAttackTime: number;
  inputQueue: PlayerInput[];
  lastProcessedSeq: number;
  lastSentSnapshot: SnapshotPlayer | null;
  currentMapId: string;
  warpCooldownUntil: number;
  equippedItems: Partial<Record<EquipmentSlot, string>>;
  inventory: InventorySlot[];
  zeny: number;
  isCasting?: boolean;
  castingSkillId?: string;

  moveTarget: { x: number; z: number } | null;
  path: { x: number; z: number }[] | null;
  pathIndex: number;
  pendingInteraction: { type: string; id: string; targetX: number; targetZ: number } | null;
}
