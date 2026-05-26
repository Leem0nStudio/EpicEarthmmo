import { z } from 'zod';

export const Vector3Schema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

export const PlayerStatsSchema = z.object({
  str: z.number(),
  agi: z.number(),
  vit: z.number(),
  int: z.number(),
  dex: z.number(),
  luk: z.number(),
  statPoints: z.number(),
});

export const DamageTextSchema = z.object({
  id: z.string(),
  amount: z.number(),
  position: Vector3Schema,
  timestamp: z.number(),
  color: z.string(),
});

export const InventoryItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['usable', 'equip', 'misc']),
  amount: z.number(),
  description: z.string(),
});

export const EquipmentSlotSchema = z.enum(['weapon', 'armor', 'shield', 'headTop', 'shoes', 'accessory1']);
export type EquipmentSlot = z.infer<typeof EquipmentSlotSchema>;

export const EquippedItemsSchema = z.object({
  weapon: z.string().optional(),
  armor: z.string().optional(),
  shield: z.string().optional(),
  headTop: z.string().optional(),
  shoes: z.string().optional(),
  accessory1: z.string().optional(),
});

export const PlayerStateSchema = z.object({
  name: z.string(),
  baseLevel: z.number(),
  jobLevel: z.number(),
  baseExp: z.number(),
  jobExp: z.number(),
  hp: z.number(),
  maxHp: z.number(),
  sp: z.number(),
  maxSp: z.number(),
  zeny: z.number(),
  jobClass: z.string(),
  stats: PlayerStatsSchema,
  skillPoints: z.number(),
  unlockedSkills: z.array(z.string()),
  skillLevels: z.record(z.string(), z.number()).optional().default({}),
  inventory: z.array(InventoryItemSchema),
  equippedItems: EquippedItemsSchema.optional(),
});

export const EnemyStateSchema = z.object({
  id: z.string(),
  name: z.string(),
  hp: z.number(),
  maxHp: z.number(),
  level: z.number(),
  position: Vector3Schema,
  isDead: z.boolean(),
  deathTime: z.number().optional(),
});

export const SaveDataSchema = z.object({
  name: z.string().max(32).optional(),
  stats: PlayerStatsSchema.optional(),
  unlockedSkills: z.array(z.string()).optional(),
  equippedItems: EquippedItemsSchema.optional(),
  inventory: z.array(z.object({
    itemId: z.string(),
    amount: z.number().int().min(0),
  })).optional(),
  zeny: z.number().int().min(0).optional(),
  hp: z.number().int().min(0).optional(),
  sp: z.number().int().min(0).optional(),
  baseExp: z.number().int().min(0).optional(),
  jobExp: z.number().int().min(0).optional(),
  skillPoints: z.number().int().min(0).optional(),
});

export const GameUIStateSchema = z.object({
  isSkillsOpen: z.boolean(),
  isStatsOpen: z.boolean(),
  isInventoryOpen: z.boolean(),
});

export type Vector3 = z.infer<typeof Vector3Schema>;
export type Vector3State = Vector3;
export type PlayerStats = z.infer<typeof PlayerStatsSchema>;
export type DamageText = z.infer<typeof DamageTextSchema>;
export type InventoryItem = z.infer<typeof InventoryItemSchema>;
export type PlayerState = z.infer<typeof PlayerStateSchema>;
export type EnemyState = z.infer<typeof EnemyStateSchema>;
export type GameUIState = z.infer<typeof GameUIStateSchema>;
export type SaveData = z.infer<typeof SaveDataSchema>;
