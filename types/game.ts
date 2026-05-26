export type JobClass = 'Novice' | 'Swordsman' | 'Mage' | 'Archer' | 'Thief' | 'Acolyte' | 'Merchant';

export interface PlayerStats {
  str: number;
  agi: number;
  vit: number;
  int: number;
  dex: number;
  luk: number;
  statPoints: number;
}

export interface InventoryItem {
  id: string;
  name: string;
  type: 'usable' | 'equip' | 'misc';
  amount: number;
  description: string;
}

export interface PlayerState {
  name: string;
  baseLevel: number;
  jobLevel: number;
  baseExp: number;
  jobExp: number;
  hp: number;
  maxHp: number;
  sp: number;
  maxSp: number;
  zeny: number;
  jobClass: string;
  stats: PlayerStats;
  skillPoints: number;
  unlockedSkills: string[];
  skillLevels: Record<string, number>;
  inventory: InventoryItem[];
  equippedItems: Record<string, string>;
}

export interface DamageText {
  id: string;
  amount: number;
  position: { x: number; y: number; z: number };
  timestamp: number;
  color?: string;
}

export interface EnemyState {
  id: string;
  enemyId: string;
  name: string;
  level: number;
  hp: number;
  maxHp: number;
  position: { x: number; y: number; z: number };
  isDead: boolean;
}

export interface GameUIState {
  isSkillsOpen: boolean;
  isStatsOpen: boolean;
  isInventoryOpen: boolean;
}
