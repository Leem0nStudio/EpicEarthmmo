import { z } from 'zod';

export const EffectTypeSchema = z.enum([
  'damage', 'heal', 'buff', 'debuff', 'taunt', 'knockback',
  'aoe_damage', 'aoe_heal', 'ground_effect', 'dot', 'hot',
  'stun', 'silence', 'root', 'sleep', 'blind', 'freeze',
  'push', 'pull', 'teleport', 'summon', 'shield', 'reflect',
]);

export const TargetTypeSchema = z.enum([
  'single_enemy', 'single_ally', 'self', 'aoe_enemy', 'aoe_ally',
  'ground_target', 'directional', 'chain', 'cone', 'line',
]);

export const StatModifierSchema = z.object({
  stat: z.enum(['str', 'agi', 'vit', 'int', 'dex', 'luk', 'moveSpeed', 'attackSpeed', 'def', 'mdef']),
  flat: z.number().optional().default(0),
  percent: z.number().optional().default(0),
});

export const BehaviorModifierSchema = z.object({
  type: z.enum(['stun', 'silence', 'root', 'sleep', 'blind', 'freeze', 'taunt', 'fear', 'confuse']),
  durationMs: z.number().positive(),
});

export const EffectFormulaSchema = z.object({
  type: z.enum(['stat_based', 'flat', 'percent_hp', 'percent_missing_hp', 'caster_level', 'fixed']),
  stat: z.enum(['str', 'agi', 'vit', 'int', 'dex', 'luk']).optional(),
  baseValue: z.number().default(0),
  multiplier: z.number().default(1),
  variance: z.number().default(0),
  critMultiplier: z.number().default(1.5),
  critChance: z.number().min(0).max(1).default(0),
});

export const EffectDefinitionSchema = z.object({
  type: EffectTypeSchema,
  formula: EffectFormulaSchema.optional(),
  durationMs: z.number().positive().optional(),
  tickIntervalMs: z.number().positive().optional(),
  tickCount: z.number().int().positive().optional(),
  radius: z.number().positive().optional(),
  chainCount: z.number().int().positive().optional(),
  chainRange: z.number().positive().optional(),
  statModifiers: z.array(StatModifierSchema).optional(),
  behaviorModifiers: z.array(BehaviorModifierSchema).optional(),
  knockbackDist: z.number().positive().optional(),
  pushDist: z.number().positive().optional(),
  pullDist: z.number().positive().optional(),
  shieldAmount: z.number().optional(),
  reflectChance: z.number().min(0).max(1).optional(),
  applyToSelf: z.boolean().optional().default(false),
  groundEffectId: z.string().optional(),
  animationId: z.string().optional(),
  soundId: z.string().optional(),
  vfxId: z.string().optional(),
});

export const StackRuleSchema = z.enum(['replace', 'stack', 'refresh', 'immune', 'diminishing']);

export const BuffDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  isDebuff: z.boolean().default(false),
  durationMs: z.number().positive(),
  stackLimit: z.number().int().positive().default(1),
  stackRule: StackRuleSchema.default('refresh'),
  diminishingReturns: z.boolean().default(false),
  drReductionPerStack: z.number().min(0).max(1).default(0),
  statModifiers: z.array(StatModifierSchema).optional(),
  behaviorModifiers: z.array(BehaviorModifierSchema).optional(),
  immunityTo: z.array(z.string()).optional(),
  onTick: z.array(EffectDefinitionSchema).optional(),
  onExpire: z.array(EffectDefinitionSchema).optional(),
  icon: z.string().optional(),
  color: z.string().default('#ffffff'),
});

export const GroundEffectDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  durationMs: z.number().positive(),
  radius: z.number().positive(),
  tickIntervalMs: z.number().positive(),
  effects: z.array(EffectDefinitionSchema),
  targetAllies: z.boolean().default(false),
  targetEnemies: z.boolean().default(true),
  shape: z.enum(['circle', 'square', 'line', 'cone']).default('circle'),
  angle: z.number().optional(),
  length: z.number().optional(),
  vfxId: z.string().optional(),
  soundLoopId: z.string().optional(),
  color: z.string().default('#ff4444'),
  opacity: z.number().min(0).max(1).default(0.4),
});

export const CastTypeSchema = z.enum(['instant', 'cast', 'channel', 'passive']);

export const SkillDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  spCost: z.number().int().nonnegative(),
  hpCost: z.number().int().nonnegative().default(0),
  requirements: z.array(z.string()),
  skillPointCost: z.number().int().nonnegative(),
  castType: CastTypeSchema.default('instant'),
  castTimeMs: z.number().nonnegative().default(0),
  channelTimeMs: z.number().nonnegative().default(0),
  cooldownMs: z.number().nonnegative().default(0),
  range: z.number().positive().default(3),
  targetType: TargetTypeSchema,
  effects: z.array(EffectDefinitionSchema),
  interruptible: z.boolean().default(true),
  movementLock: z.boolean().default(false),
  animationId: z.string().optional(),
  soundId: z.string().optional(),
  vfxId: z.string().optional(),
  icon: z.string().optional(),
  allowedClasses: z.array(z.string()).optional(),
  maxLevel: z.number().int().positive().default(1),
  levelScaling: z.object({
    spCost: z.number().default(0),
    cooldownMs: z.number().default(0),
    damageMultiplier: z.number().default(0),
    durationMultiplier: z.number().default(0),
  }).optional(),
});

export const SkillTreeSchema = z.array(SkillDefinitionSchema);

export type EffectType = z.infer<typeof EffectTypeSchema>;
export type TargetType = z.infer<typeof TargetTypeSchema>;
export type StatModifier = z.infer<typeof StatModifierSchema>;
export type BehaviorModifier = z.infer<typeof BehaviorModifierSchema>;
export type EffectFormula = z.infer<typeof EffectFormulaSchema>;
export type EffectDefinition = z.infer<typeof EffectDefinitionSchema>;
export type StackRule = z.infer<typeof StackRuleSchema>;
export type BuffDefinition = z.infer<typeof BuffDefinitionSchema>;
export type GroundEffectDefinition = z.infer<typeof GroundEffectDefinitionSchema>;
export type CastType = z.infer<typeof CastTypeSchema>;
export type SkillDefinition = z.infer<typeof SkillDefinitionSchema>;
export type SkillTree = z.infer<typeof SkillTreeSchema>;
