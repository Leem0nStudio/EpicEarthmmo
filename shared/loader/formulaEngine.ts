import { BalanceConfig } from '../schemas';

// ── Damage Types ──
export type DamageType = 'physical' | 'magical' | 'neutral';

export interface DamageInput {
  atk?: number;
  matk?: number;
  targetDef?: number;
  targetMDef?: number;
  targetVit?: number;
  skillMultiplier?: number;
  variance?: number;
}

export interface CritInfo {
  isCritical: boolean;
  critChance: number;
  critMultiplier: number;
}

// ── Movement: Walk Speed (AGI-based) ──
export function calculateWalkSpeedMs(agi: number, balance: BalanceConfig): number {
  const safeAgi = isNaN(agi) ? 0 : Math.max(0, agi);
  const cfg = balance.movement.walkSpeedFormula;
  if (!cfg) return balance.movement.walkSpeedMs;
  return Math.max(cfg.minMs, Math.round(cfg.baseMs - safeAgi * cfg.perAgi));
}

// ── Combat: Attack Cooldown (AGI-based) ──
export function calculateAttackCooldownMs(agi: number, balance: BalanceConfig, weaponSpeedModifier = 1): number {
  const safeAgi = isNaN(agi) ? 0 : Math.max(0, agi);
  const cfg = balance.combat.attackCooldownFormula;
  if (!cfg) return balance.combat.attackCooldownMs;
  return Math.max(cfg.minMs, Math.round((cfg.baseMs - safeAgi * cfg.perAgi) * (weaponSpeedModifier || 1)));
}

// ── Combat: Hit / Flee ──
export function calculateHitChance(hit: number, flee: number, balance: BalanceConfig): number {
  const safeHit = isNaN(hit) ? 0 : Math.max(0, hit);
  const safeFlee = isNaN(flee) ? 0 : Math.max(0, flee);
  const cfg = balance.combat.hitFlee;
  if (!cfg) return 1;
  const total = safeHit + safeFlee;
  if (total <= 0) return cfg.minChance ?? 0.05;
  const chance = safeHit / total;
  return Math.max(cfg.minChance, Math.min(cfg.maxChance, chance));
}

export function calculateHit(dex: number, baseLevel: number, balance: BalanceConfig): number {
  const safeDex = isNaN(dex) ? 0 : dex;
  const safeLvl = isNaN(baseLevel) ? 1 : Math.max(1, baseLevel);
  const cfg = balance.combat.hitFlee;
  if (!cfg) return 100;
  return cfg.hitBase + safeDex * cfg.hitPerDex + safeLvl * cfg.hitPerLevel;
}

export function calculateFlee(agi: number, baseLevel: number, balance: BalanceConfig): number {
  const safeAgi = isNaN(agi) ? 0 : agi;
  const safeLvl = isNaN(baseLevel) ? 1 : Math.max(1, baseLevel);
  const cfg = balance.combat.hitFlee;
  if (!cfg) return 50;
  return cfg.fleeBase + safeAgi * cfg.fleePerAgi + safeLvl * cfg.fleePerLevel;
}

// ── Combat: Crit ──
export function calculateCritChance(luk: number, baseLevel: number, skillBonusChance: number, balance: BalanceConfig): number {
  const safeLuk = isNaN(luk) ? 0 : luk;
  const safeLvl = isNaN(baseLevel) ? 1 : Math.max(1, baseLevel);
  const safeBonus = isNaN(skillBonusChance) ? 0 : skillBonusChance;
  const cfg = balance.combat.crit;
  if (!cfg) return 0.05;
  return cfg.baseChance + safeLuk * cfg.chancePerLuk + safeLvl * cfg.chancePerLevel + safeBonus;
}

export function calculateCritMultiplier(luk: number, balance: BalanceConfig): number {
  const safeLuk = isNaN(luk) ? 0 : luk;
  const cfg = balance.combat.crit;
  if (!cfg) return 1.5;
  return cfg.baseMultiplier + safeLuk * cfg.multiplierPerLuk;
}

// ── Combat: Damage (with Damage Reduction) ──
export function calculateDamage(
  statValue: number,
  skillMultiplier: number,
  balance: BalanceConfig,
): number {
  const safeStat = isNaN(statValue) ? 0 : Math.max(0, statValue);
  const safeMult = isNaN(skillMultiplier) ? 1 : Math.max(0, skillMultiplier);
  const { statMultiplier, randomVariance } = balance.combat.baseDamageFormula;
  const baseDamage = safeStat * statMultiplier + Math.floor(Math.random() * (randomVariance || 1));
  return Math.floor(baseDamage * safeMult);
}

export function calculateDamageWithDefense(
  damageType: DamageType,
  rawAtk: number,
  input: DamageInput,
  balance: BalanceConfig,
  crit?: CritInfo,
): number {
  const safeRawAtk = isNaN(rawAtk) ? 0 : Math.max(0, rawAtk);
  const defReduction = balance.combat.damageReduction;
  const skillMult = Math.max(0, input.skillMultiplier ?? 1);
  const variance = Math.max(0, input.variance ?? 0);

  let effectiveAtk: number;
  let reduction: number;
  let minDmgPct: number;

  if (damageType === 'magical') {
    effectiveAtk = (input.matk ?? safeRawAtk) + Math.random() * variance;
    reduction = (input.targetMDef ?? 0) * (defReduction?.mdefMultiplier ?? 0.5);
    minDmgPct = defReduction?.minDamagePct ?? 0.3;
  } else if (damageType === 'physical') {
    effectiveAtk = (input.atk ?? safeRawAtk) + Math.random() * variance;
    reduction = (input.targetDef ?? 0) * (defReduction?.defMultiplier ?? 0.6);
    minDmgPct = defReduction?.minDamagePct ?? 0.3;
  } else {
    effectiveAtk = safeRawAtk + Math.random() * variance;
    reduction = 0;
    minDmgPct = 0;
  }

  effectiveAtk = Math.max(0, effectiveAtk * skillMult);
  let finalDmg = Math.max(effectiveAtk * minDmgPct, effectiveAtk - reduction);

  if (crit?.isCritical) {
    finalDmg *= Math.max(1, crit.critMultiplier || 1.5);
  }

  return Math.max(1, Math.floor(finalDmg));
}

// ── Combat: ATK / MATK from stats ──
export function calculateAtk(str: number, baseLevel: number, weaponAtk = 0): number {
  const safeStr = isNaN(str) ? 0 : Math.max(0, str);
  const safeLvl = isNaN(baseLevel) ? 1 : Math.max(1, baseLevel);
  return safeStr * 3 + safeLvl * 1.5 + (weaponAtk || 0);
}

export function calculateMatk(intel: number, baseLevel: number, weaponMatk = 0): number {
  const safeInt = isNaN(intel) ? 0 : Math.max(0, intel);
  const safeLvl = isNaN(baseLevel) ? 1 : Math.max(1, baseLevel);
  return safeInt * 3.5 + safeLvl * 1.2 + (weaponMatk || 0);
}

export function calculateDef(vit: number, armorDef = 0): number {
  const safeVit = isNaN(vit) ? 0 : Math.max(0, vit);
  return safeVit * 1.5 + (armorDef || 0);
}

export function calculateMDef(intel: number, armorMDef = 0): number {
  const safeInt = isNaN(intel) ? 0 : Math.max(0, intel);
  return safeInt * 0.5 + (armorMDef || 0);
}

// ── Progression: XP Curve (segmented polynomial) ──
export function baseExpForLevel(level: number, balance: BalanceConfig): number {
  const safeLvl = isNaN(level) ? 1 : Math.max(1, level);
  const curve = balance.progression.baseExpCurve;
  if (!curve) {
    return safeLvl * (balance.progression.baseLevelUpThreshold.multiplier || 100);
  }
  if (safeLvl < curve.earlyCap) {
    return curve.earlyBase + (safeLvl - 1) * curve.earlyIncrement;
  } else if (safeLvl < curve.midCap) {
    return curve.midBase + (safeLvl - curve.earlyCap) * curve.midIncrement;
  } else {
    return curve.lateBase + (safeLvl - curve.midCap) * curve.lateIncrement;
  }
}

export function jobExpForLevel(level: number, balance: BalanceConfig): number {
  const safeLvl = isNaN(level) ? 1 : Math.max(1, level);
  const curve = balance.progression.jobExpCurve;
  if (!curve) {
    return safeLvl * (balance.progression.jobLevelUpThreshold.multiplier || 50);
  }
  return curve.base + (safeLvl - 1) * curve.increment;
}

// ── Progression: Death Penalty ──
export function calculateDeathExpLoss(baseLevel: number, currentExp: number, balance: BalanceConfig): number {
  const safeLvl = isNaN(baseLevel) ? 1 : Math.max(1, baseLevel);
  const safeExp = isNaN(currentExp) ? 0 : Math.max(0, currentExp);
  const dp = balance.progression.deathPenalty;
  if (!dp) return 0;
  if (safeLvl < dp.safeLevel) return 0;
  if (safeLvl < dp.midLevel) return Math.floor(safeExp * dp.midLossPct);
  return Math.floor(safeExp * dp.highLossPct);
}

// ── Progression: Level-up Thresholds ──
export function calculateLevelUpThresholds(
  currentBaseLevel: number,
  currentJobLevel: number,
  balance: BalanceConfig,
): { baseExpNeeded: number; jobExpNeeded: number } {
  return {
    baseExpNeeded: baseExpForLevel(currentBaseLevel, balance),
    jobExpNeeded: jobExpForLevel(currentJobLevel, balance),
  };
}

// ── Progression: Process Level Up ──
export function processLevelUp(
  baseExp: number,
  jobExp: number,
  baseLevel: number,
  jobLevel: number,
  baseStats: Record<string, number>,
  balance: BalanceConfig,
): {
  baseExp: number;
  jobExp: number;
  baseLevel: number;
  jobLevel: number;
  hpGain: number;
  spGain: number;
  statPointsGain: number;
  skillPointsGain: number;
  leveledUp: boolean;
} {
  let safeBaseExp = isNaN(baseExp) ? 0 : Math.max(0, baseExp);
  let safeJobExp = isNaN(jobExp) ? 0 : Math.max(0, jobExp);
  let safeBaseLvl = isNaN(baseLevel) ? 1 : Math.max(1, baseLevel);
  let safeJobLvl = isNaN(jobLevel) ? 1 : Math.max(1, jobLevel);
  let totalHpGain = 0;
  let totalSpGain = 0;
  let totalStatPoints = 0;
  let totalSkillPoints = 0;
  let leveledUp = false;
  const { progression } = balance;

  while (safeBaseExp >= baseExpForLevel(safeBaseLvl, balance) && safeBaseLvl < 99) {
    safeBaseExp -= baseExpForLevel(safeBaseLvl, balance);
    safeBaseLvl += 1;
    totalHpGain += progression.levelUpGains.hpPerLevel + (baseStats?.vit ?? 0) * progression.levelUpGains.hpPerVit;
    totalSpGain += progression.levelUpGains.spPerLevel + (baseStats?.int ?? 0) * progression.levelUpGains.spPerInt;
    totalStatPoints += progression.levelUpGains.statPointsPerLevel;
    leveledUp = true;
  }

  const maxJobLevel = progression.jobExpCurve?.maxLevel ?? progression.jobLevelUpThreshold.maxLevel ?? 50;
  while (safeJobExp >= jobExpForLevel(safeJobLvl, balance) && safeJobLvl < maxJobLevel) {
    safeJobExp -= jobExpForLevel(safeJobLvl, balance);
    safeJobLvl += 1;
    totalSkillPoints += progression.levelUpGains.jobSkillPointsPerLevel;
    leveledUp = true;
  }

  return {
    baseExp: safeBaseExp,
    jobExp: safeJobExp,
    baseLevel: safeBaseLvl,
    jobLevel: safeJobLvl,
    hpGain: totalHpGain,
    spGain: totalSpGain,
    statPointsGain: totalStatPoints,
    skillPointsGain: totalSkillPoints,
    leveledUp,
  };
}

// ── EXP Reward ──
export function calculateExpReward(
  enemyLevel: number,
  balance: BalanceConfig,
): { baseExp: number; jobExp: number } {
  const safeLvl = isNaN(enemyLevel) ? 1 : Math.max(1, enemyLevel);
  return {
    baseExp: Math.floor(safeLvl * (balance.progression.baseExpFormula.multiplier || 10)),
    jobExp: Math.floor(safeLvl * (balance.progression.jobExpFormula.multiplier || 5)),
  };
}

export function getSkillSpCost(skills: import('../schemas').SkillTree, skillId: string): number {
  const skill = skills.find(s => s.id === skillId);
  return skill?.spCost ?? 0;
}

export function getSkillMultiplier(skills: import('../schemas').SkillTree, skillId: string): number {
  const skill = skills.find(s => s.id === skillId);
  if (!skill) return 1.0;
  const damageEffect = skill.effects.find(e => e.type === 'damage' || e.type === 'aoe_damage');
  if (damageEffect?.formula) {
    return damageEffect.formula.multiplier ?? 1.0;
  }
  return 1.0;
}
