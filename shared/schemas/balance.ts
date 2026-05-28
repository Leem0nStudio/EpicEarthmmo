import { z } from 'zod';

export const StatNameSchema = z.enum(['str', 'agi', 'vit', 'int', 'dex', 'luk']);
export type StatName = z.infer<typeof StatNameSchema>;

export const BalanceSchema = z.object({
  server: z.object({
    tickRateMs: z.number().positive(),
    maxFrameDeltaMs: z.number().positive(),
    fullSnapshotInterval: z.number().int().positive(),
  }),
  movement: z.object({
    playerSpeed: z.number().positive(),
    walkSpeedMs: z.number().positive().default(150),
    moveDiagonalCost: z.number().positive().default(14),
    moveCost: z.number().positive().default(10),
    clickMoveRange: z.number().positive().optional().default(30),
    interactRange: z.number().positive().optional().default(2.5),
    npcTalkRange: z.number().positive().optional().default(2),
    pathfindingGridSize: z.number().positive().optional().default(0.5),
    pathfindingUpdateMs: z.number().positive().optional().default(200),
    stuckTimeoutMs: z.number().positive().optional().default(3000),
    walkSpeedFormula: z.object({
      baseMs: z.number().positive().default(150),
      perAgi: z.number().nonnegative().default(1),
      minMs: z.number().positive().default(75),
    }).optional(),
  }),
  combat: z.object({
    attackRange: z.number().positive(),
    attackCooldownMs: z.number().positive(),
    baseDamageFormula: z.object({
      statMultiplier: z.number().positive(),
      randomVariance: z.number().min(0),
    }),
    attackCooldownFormula: z.object({
      baseMs: z.number().positive().default(800),
      perAgi: z.number().nonnegative().default(4),
      minMs: z.number().positive().default(200),
    }).optional(),
    damageReduction: z.object({
      defMultiplier: z.number().default(0.6),
      mdefMultiplier: z.number().default(0.5),
      minDamagePct: z.number().min(0).max(1).default(0.3),
    }).optional(),
    hitFlee: z.object({
      hitBase: z.number().default(50),
      hitPerDex: z.number().default(2.5),
      hitPerLevel: z.number().default(0.5),
      fleeBase: z.number().default(80),
      fleePerAgi: z.number().default(2),
      fleePerLevel: z.number().default(0.5),
      minChance: z.number().min(0).max(1).default(0.05),
      maxChance: z.number().min(0).max(1).default(0.95),
    }).optional(),
    crit: z.object({
      baseChance: z.number().default(0.02),
      chancePerLuk: z.number().default(0.003),
      chancePerLevel: z.number().default(0.001),
      baseMultiplier: z.number().default(1.5),
      multiplierPerLuk: z.number().default(0.005),
    }).optional(),
    consecutiveMissPity: z.number().int().default(3),
  }),
  regen: z.object({
    amountPerTick: z.number().positive(),
    intervalTicks: z.number().int().positive(),
    spPerTickFormula: z.object({
      baseSpPerTick: z.number().default(1),
      perInt: z.number().default(0.1),
      intervalTicks: z.number().int().positive().default(100),
    }).optional(),
  }),
  enemy: z.object({
    respawnMs: z.number().positive(),
    respawnGraceMs: z.number().positive(),
    defaultAgroRange: z.number().positive(),
    defaultAttackRange: z.number().positive(),
    defaultAttackCooldownMs: z.number().positive(),
    defaultMoveSpeed: z.number().positive(),
    defaultPatrolPauseMs: z.number().nonnegative(),
    deaggroRange: z.number().positive(),
    returnSpeedMultiplier: z.number().positive(),
  }),
  stats: z.object({
    cap: z.number().int().positive(),
  }),
  network: z.object({
    interestRange: z.number().positive(),
  }),
  limits: z.object({
    playerNameMaxLength: z.number().int().positive(),
    chatMaxLength: z.number().int().positive(),
    itemMaxStack: z.number().int().positive(),
  }),
  progression: z.object({
    baseExpFormula: z.object({
      multiplier: z.number().positive(),
    }),
    jobExpFormula: z.object({
      multiplier: z.number().positive(),
    }),
    baseLevelUpThreshold: z.object({
      formula: z.literal('level * multiplier'),
      multiplier: z.number().positive(),
    }),
    jobLevelUpThreshold: z.object({
      formula: z.literal('level * multiplier'),
      multiplier: z.number().positive(),
      maxLevel: z.number().int().positive(),
    }),
    baseExpCurve: z.object({
      earlyCap: z.number().int().default(20),
      midCap: z.number().int().default(70),
      earlyBase: z.number().default(100),
      earlyIncrement: z.number().default(50),
      midBase: z.number().default(1000),
      midIncrement: z.number().default(200),
      lateBase: z.number().default(10800),
      lateIncrement: z.number().default(4000),
    }).optional(),
    jobExpCurve: z.object({
      base: z.number().default(50),
      increment: z.number().default(25),
      maxLevel: z.number().int().default(50),
    }).optional(),
    levelUpGains: z.object({
      hpPerLevel: z.number().positive(),
      spPerLevel: z.number().positive(),
      hpPerVit: z.number().default(2),
      spPerInt: z.number().default(0.5),
      statPointsFormula: z.object({
        formula: z.literal('floor((level - 1) / divisor) + base'),
        divisor: z.number().positive(),
        base: z.number().positive(),
      }),
      statPointsPerLevel: z.number().int().positive().default(3),
      jobSkillPointsPerLevel: z.number().int().positive(),
    }),
    deathPenalty: z.object({
      safeLevel: z.number().int().default(40),
      midLevel: z.number().int().default(70),
      midLossPct: z.number().default(0.04),
      highLossPct: z.number().default(0.08),
      canDelevel: z.boolean().default(false),
    }).optional(),
    milestoneLevels: z.array(z.number().int()).default([10, 20, 30, 40, 50, 60, 70, 80, 90]),
    milestoneBonusPerStat: z.number().default(2),
  }),
  defaultPlayer: z.object({
    spawnPosition: z.object({
      x: z.number(),
      y: z.number(),
      z: z.number(),
    }),
    baseStats: z.object({
      str: z.number().int(),
      agi: z.number().int(),
      vit: z.number().int(),
      int: z.number().int(),
      dex: z.number().int(),
      luk: z.number().int(),
    }),
    hp: z.number().positive(),
    sp: z.number().positive(),
    skillPoints: z.number().int().nonnegative(),
    baseAtkBareHands: z.number().default(5),
    baseMatkBareHands: z.number().default(3),
  }),
});

export type BalanceConfig = z.infer<typeof BalanceSchema>;
