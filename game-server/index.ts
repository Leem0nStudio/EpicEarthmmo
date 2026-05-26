import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { loadGameData } from '../shared/loader/serverLoader';
import {
  calculateDamage, calculateDamageWithDefense, calculateExpReward,
  getSkillSpCost, getSkillMultiplier,
  calculateAttackCooldownMs, calculateHitChance,
  calculateHit, calculateFlee,
  calculateCritChance, calculateCritMultiplier,
  calculateAtk, calculateMatk, calculateDef, calculateMDef,
  calculateDeathExpLoss,
} from '../shared/loader/formulaEngine';
import { MapManager, type RuntimeEnemy } from './MapManager';
import type { ServerPlayer } from './types';
import type { PlayerInput, WorldSnapshot, SnapshotPlayer, MapChangeData, SkillCastRequest, MoveToTargetData, InteractionReadyData } from '../shared/types/network';
import { findPath, smoothPath, getCellAtWorld } from '../shared/pathfinding';
import { SkillEngine } from './SkillEngine';
import type { BuffableEntity } from './BuffManager';
import type { GroundEffectTarget } from './GroundEffectManager';
import type { SpatialEntity } from '@/lib/spatialQuery';
import { SaveDataSchema } from '../shared/schemas/gameState';
import { processLevelUp } from '../shared/loader/formulaEngine';
import {
  applyDamagePassive, applySpRegenPassive, getAttackRange,
  shouldTriggerDoubleAttack, applyHealPassive, applyZenyDropPassive,
  applyBuyDiscount, getLevelUpBonuses,
} from '../shared/loader/passiveEngine';
import type {
  SkillDefinition, EffectDefinition, EffectFormula,
  GroundEffectDefinition, BuffDefinition,
  JobClass,
} from '@/shared/schemas';

// ── Load all game data from JSON files (validated with Zod) ──
const gameData = loadGameData();
const { balance, enemies: enemyData, skills, jobs, items, maps: mapConfigs } = gameData;

const GAME_PORT = parseInt(process.env.PORT || '3001', 10);

// ── Initialize MapManager ──
const mapManager = new MapManager();
for (const template of enemyData.templates) {
  mapManager.registerEnemyTemplate(template);
}
const openedChestStates = new Map<string, Map<string, number>>();
for (const mapConfig of mapConfigs) {
  mapManager.loadMap(mapConfig);
  openedChestStates.set(mapConfig.id, new Map());
}

function getChestState(mapId: string) {
  if (!openedChestStates.has(mapId)) {
    openedChestStates.set(mapId, new Map());
  }
  return openedChestStates.get(mapId)!;
}

function isChestAvailable(mapId: string, chestId: string) {
  const state = getChestState(mapId);
  const respawnAt = state.get(chestId);
  if (!respawnAt) return true;
  if (Date.now() >= respawnAt) {
    state.delete(chestId);
    return true;
  }
  return false;
}

function markChestOpened(mapId: string, chestId: string, respawnSeconds: number) {
  const state = getChestState(mapId);
  state.set(chestId, Date.now() + respawnSeconds * 1000);
}

// ── Initialize SkillEngine ──
const skillEngine = new SkillEngine();
for (const skillDef of skills) {
  skillEngine.registerSkill(skillDef);
}

// Register ground effect definitions
const fireWallGe: GroundEffectDefinition = {
  id: 'fire_wall_ge',
  name: 'Fire Wall',
  durationMs: 10000,
  radius: 3,
  tickIntervalMs: 1000,
  effects: [{
    type: 'aoe_damage',
    formula: { type: 'stat_based', stat: 'int', baseValue: 15, multiplier: 1.0, variance: 5, critChance: 0.05, critMultiplier: 1.5 },
    applyToSelf: false,
  }],
  targetAllies: false,
  targetEnemies: true,
  shape: 'circle',
  color: '#ff4400',
  opacity: 0.5,
  vfxId: 'fire_wall_ground',
};
skillEngine.registerGroundEffect(fireWallGe);

const safetyWallGe: GroundEffectDefinition = {
  id: 'safety_wall_ge',
  name: 'Safety Wall',
  durationMs: 8000,
  radius: 4,
  tickIntervalMs: 2000,
  effects: [{
    type: 'heal',
    formula: { type: 'stat_based', stat: 'int', baseValue: 20, multiplier: 0.5, variance: 5, critChance: 0, critMultiplier: 1.5 },
    applyToSelf: false,
  }],
  targetAllies: true,
  targetEnemies: false,
  shape: 'circle',
  color: '#44aaff',
  opacity: 0.4,
  vfxId: 'safety_wall_ground',
};
skillEngine.registerGroundEffect(safetyWallGe);

// ── STATUS EFFECTS REGISTRY (MVP: 4 core effects) ──
function registerStatusEffects(engine: SkillEngine): void {
  // 1. Stun — CC, fixed 2s duration (no diminishing returns for MVP)
  engine.registerBuff({
    id: 'stun', name: 'Stun', isDebuff: true, durationMs: 2000,
    stackLimit: 1, stackRule: 'replace', color: '#ffff00',
    diminishingReturns: false, drReductionPerStack: 0,
    behaviorModifiers: [{ type: 'stun', durationMs: 2000 }],
  });

  // 2. Silence — prevents skill casting, fixed 5s
  engine.registerBuff({
    id: 'silence', name: 'Silence', isDebuff: true, durationMs: 5000,
    stackLimit: 1, stackRule: 'replace', color: '#aa44ff',
    diminishingReturns: false, drReductionPerStack: 0,
    behaviorModifiers: [{ type: 'silence', durationMs: 5000 }],
  });

  // 3. Poison — DoT, stacks up to 3
  engine.registerBuff({
    id: 'poison', name: 'Poison', isDebuff: true, durationMs: 10000,
    stackLimit: 3, stackRule: 'stack', color: '#44aa44',
    diminishingReturns: false, drReductionPerStack: 0,
    onTick: [{
      type: 'damage',
      formula: { type: 'flat', baseValue: 8, multiplier: 1.0, variance: 3, critChance: 0, critMultiplier: 1.5 },
      applyToSelf: false,
    }],
  });

  // 4. Blessing — +5% STR/DEX/INT for 120s (Acolyte skill buff)
  engine.registerBuff({
    id: 'skill_blessing', name: 'Blessing', isDebuff: false,
    durationMs: 120000, stackLimit: 1, stackRule: 'refresh', color: '#ffdd44',
    diminishingReturns: false, drReductionPerStack: 0,
    statModifiers: [
      { stat: 'str', flat: 0, percent: 5 },
      { stat: 'dex', flat: 0, percent: 5 },
      { stat: 'int', flat: 0, percent: 5 },
    ],
  });
}

registerStatusEffects(skillEngine);

// Build lookup maps
const jobMap = new Map(jobs.map(j => [j.id, j]));
const validJobIds = new Set(jobs.map(j => j.id));

function createDefaultPlayer(id: string, name: string): ServerPlayer {
  const { defaultPlayer } = balance;
  return {
    id,
    x: defaultPlayer.spawnPosition.x,
    y: defaultPlayer.spawnPosition.y,
    z: defaultPlayer.spawnPosition.z,
    name: (name || 'Player').slice(0, balance.limits.playerNameMaxLength),
    stats: {
      str: defaultPlayer.baseStats.str,
      agi: defaultPlayer.baseStats.agi,
      vit: defaultPlayer.baseStats.vit,
      int: defaultPlayer.baseStats.int,
      dex: defaultPlayer.baseStats.dex,
      luk: defaultPlayer.baseStats.luk,
      statPoints: 0,
    },
    hp: defaultPlayer.hp,
    maxHp: defaultPlayer.hp,
    sp: defaultPlayer.sp,
    maxSp: defaultPlayer.sp,
    baseLevel: 1,
    jobLevel: 1,
    jobExp: 0,
    jobClass: 'novice',
    unlockedSkills: [],
    skillPoints: defaultPlayer.skillPoints,
    lastAttackTime: 0,
    vx: 0, vz: 0,
    inputQueue: [],
    lastProcessedSeq: 0,
    baseExp: 0,
    lastSentSnapshot: null,
    currentMapId: 'prontera',
    warpCooldownUntil: 0,
    equippedItems: {},
    inventory: [{ itemId: 'red_potion', amount: 10 }],
    zeny: 100,
    moveTarget: null,
    path: null,
    pathIndex: 0,
    pendingInteraction: null,
  };
}

function isSkillUnlocked(player: ServerPlayer, skillId: string): boolean {
  if (skillId === 'basic_attack') return true;
  return player.unlockedSkills.includes(skillId);
}

function distSq(a: { x: number; z: number }, b: { x: number; z: number }): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

function snapshotPlayerChanged(a: SnapshotPlayer, b: SnapshotPlayer): boolean {
  return a.x !== b.x || a.z !== b.z || a.hp !== b.hp || a.sp !== b.sp;
}

function addItemsToInventory(player: ServerPlayer, lootArray: { id: string; amount: number }[]) {
  for (const item of lootArray) {
    const existing = player.inventory.find(s => s.itemId === item.id);
    if (existing) {
      existing.amount += item.amount;
    } else {
      player.inventory.push({ itemId: item.id, amount: item.amount });
    }
  }
}

function processServerLevelUp(player: ServerPlayer, socket: any, io: any): void {
  const result = processLevelUp(
    player.baseExp, player.jobExp,
    player.baseLevel, player.jobLevel,
    player.stats?.base ?? {},
    balance,
  );
  if (!result.leveledUp) return;

  const classBonuses = getLevelUpBonuses(player.jobClass, jobs as JobClass[]);
  const hpFromClass = result.hpGain + classBonuses.hpPerLevel;
  const spFromClass = result.spGain + classBonuses.spPerLevel;
  const spGainFromClass = result.statPointsGain + classBonuses.statPointsPerLevel;

  player.baseExp = result.baseExp;
  player.jobExp = result.jobExp;
  player.baseLevel = result.baseLevel;
  player.jobLevel = result.jobLevel;
  player.maxHp += hpFromClass;
  player.maxSp += spFromClass;
  player.hp = player.maxHp;
  player.sp = player.maxSp;
  player.stats!.points = (player.stats?.points ?? 0) + spGainFromClass;
  player.skillPoints = (player.skillPoints ?? 0) + result.skillPointsGain;

  socket.emit('levelUp', {
    baseLevel: result.baseLevel,
    jobLevel: result.jobLevel,
    hpGain: hpFromClass,
    spGain: spFromClass,
    statPointsGain: spGainFromClass,
    skillPointsGain: result.skillPointsGain,
    baseExp: player.baseExp,
    jobExp: player.jobExp,
    newMaxHp: player.maxHp,
    newMaxSp: player.maxSp,
  });

  io.to(player.currentMapId).emit('playerLeveledUp', {
    playerId: socket.id,
    baseLevel: result.baseLevel,
  });
}

// ── Express & Socket.io setup ──
const app = express();
const httpServer = createServer(app);
const allowedOrigins = process.env.CORS_ORIGIN?.split(',') || '*';
const io = new SocketIOServer(httpServer, { cors: { origin: allowedOrigins } });

app.get('/health', (_req, res) => {
  let totalPlayers = 0;
  for (const instance of mapManager.getAllMaps().values()) {
    totalPlayers += instance.players.size;
  }
  res.json({ ok: true, players: totalPlayers, maps: mapManager.getAllMaps().size, tick: tickNum });
});

// ── Game state ──
const savedData = new Map<string, any>();
let tickNum = 0;
const consecutiveMisses = new Map<string, number>();

// ── Socket.io handlers ──
io.on('connection', (socket) => {
  let player: ServerPlayer | null = null;

  socket.on('join', (data: { name?: string; stats?: any; unlockedSkills?: string[]; equippedItems?: any }) => {
    player = createDefaultPlayer(socket.id, data.name || 'Player');
    if (data.stats) player.stats = data.stats;
    if (data.unlockedSkills) player.unlockedSkills = data.unlockedSkills;
    if (data.equippedItems) player.equippedItems = data.equippedItems;

    const defaultMapId = 'prontera';
    mapManager.addPlayerToMap(socket.id, player, defaultMapId);

    const initData = mapManager.getMapInitData(defaultMapId);
    const enemies = mapManager.getMapEnemies(defaultMapId);
    const players = mapManager.getMapPlayers(defaultMapId);

    socket.emit('init', {
      id: socket.id,
      mapId: defaultMapId,
      mapName: initData?.mapName,
      mapType: initData?.mapType,
      players,
      enemies,
      initData,
    });

    socket.broadcast.to(defaultMapId).emit('playerJoined', {
      id: socket.id,
      x: player.x,
      y: player.y,
      z: player.z,
      name: player.name,
    });

    socket.join(defaultMapId);
  });

  socket.on('input', (input: PlayerInput) => {
    if (!player) return;
    const dirX = Math.max(-1, Math.min(1, input.dirX || 0));
    const dirZ = Math.max(-1, Math.min(1, input.dirZ || 0));
    player.inputQueue.push({ dirX, dirZ, seq: input.seq || 0 });
  });

  socket.on('moveToTarget', (data: MoveToTargetData) => {
    if (!player) return;
    player.moveTarget = { x: data.targetX, z: data.targetZ };
    player.path = null;
    player.pathIndex = 0;
    if (data.interaction) {
      player.pendingInteraction = { ...data.interaction, targetX: data.targetX, targetZ: data.targetZ };
    } else {
      player.pendingInteraction = null;
    }
  });

  socket.on('cancelMove', () => {
    if (!player) return;
    player.moveTarget = null;
    player.path = null;
    player.pathIndex = 0;
    player.pendingInteraction = null;
  });

  socket.on('attack', (data: {
    targetId: string;
    skillId: string | null;
    sp: number;
    position: { x: number; y: number; z: number };
  }) => {
    if (!player) return;

    if (mapManager.isInSafeZone(player.currentMapId, player.x, player.z)) {
      socket.emit('attackResult', { targetId: data.targetId, damage: 0, usedSkill: false, newSp: player.sp, hp: 0, isDead: false, error: 'Cannot attack in safe zone' });
      return;
    }

    const enemy = mapManager.getEnemy(player.currentMapId, data.targetId);
    if (!enemy || enemy.isDead) {
      console.log(`[Attack] Enemy not found or dead: ${data.targetId}`);
      return;
    }

    if (enemy.respawnTime && Date.now() - enemy.respawnTime < balance.enemy.respawnGraceMs) return;

    const now = Date.now();
    mapManager.provokeEnemy(enemy, socket.id, now);

    // ── Determine effective skill for this attack ──
    const effectiveSkillId = data.skillId && isSkillUnlocked(player, data.skillId) ? data.skillId : 'basic_attack';
    const skillDef = skillEngine.getSkillDefinition(effectiveSkillId);

    // ── Per-skill cooldown check ──
    if (skillDef && effectiveSkillId !== 'basic_attack') {
      if (skillEngine.isSkillOnCooldown(socket.id, effectiveSkillId)) {
        socket.emit('attackResult', { targetId: data.targetId, damage: 0, usedSkill: false, newSp: player.sp, hp: enemy.hp, isDead: false, error: 'Skill on cooldown' });
        return;
      }
    }

    // ── AGI-based attack cooldown ──
    const cooldownMs = calculateAttackCooldownMs(player.stats.agi ?? 0, balance);
    if (now - player.lastAttackTime < cooldownMs) return;
    player.lastAttackTime = now;

    // ── Range check (use skill range + class passive) ──
    const baseAttackRange = skillDef?.range ?? balance.combat.attackRange;
    const attackRange = getAttackRange(baseAttackRange, player.jobClass, jobs as JobClass[]);
    if (distSq(player, enemy.position) > attackRange * attackRange) {
      socket.emit('attackResult', { targetId: data.targetId, damage: 0, usedSkill: false, newSp: player.sp, hp: enemy.hp, isDead: false, error: 'Target out of range' });
      return;
    }

    // ── Skill SP cost ──
    let usedSkill = false;
    let skillSpCost = 0;
    if (effectiveSkillId !== 'basic_attack') {
      skillSpCost = getSkillSpCost(skills, effectiveSkillId);
    }
    if (player.sp < skillSpCost) return;
    player.sp -= skillSpCost;
    if (skillSpCost > 0) usedSkill = true;

    // ── Compute ATK from STR + weapon ──
    let weaponAtk = balance.defaultPlayer.baseAtkBareHands ?? 5;
    if (player.equippedItems) {
      for (const itemId of Object.values(player.equippedItems)) {
        const itemDef = items.find(i => i.id === itemId);
        if (itemDef?.atk) weaponAtk = Math.max(weaponAtk, itemDef.atk);
      }
    }
    const atk = calculateAtk(player.stats.str ?? 0, player.baseLevel || 1, weaponAtk);

    // ── Hit / Flee check, with consecutive miss pity ──
    const hit = calculateHit(player.stats.dex ?? 0, player.baseLevel || 1, balance);
    const flee = calculateFlee(player.stats.agi ?? 0, player.baseLevel || 1, balance);
    let hitChance = calculateHitChance(enemy.level * 3, flee, balance); // enemy has basic dodge

    const missKey = `${socket.id}_${data.targetId}`;
    const misses = consecutiveMisses.get(missKey) ?? 0;
    const pityThreshold = balance.combat.consecutiveMissPity ?? 3;
    if (misses >= pityThreshold) {
      hitChance = 1;
      consecutiveMisses.delete(missKey);
    }

    const didMiss = Math.random() > hitChance;
    if (didMiss) {
      consecutiveMisses.set(missKey, misses + 1);
      socket.emit('attackResult', {
        targetId: data.targetId, damage: 0, usedSkill, missed: true,
        newSp: player.sp, hp: enemy.hp, isDead: false,
      });
      return;
    }
    consecutiveMisses.delete(missKey);

    // ── Skill cooldown set after successful use ──
    if (skillDef && effectiveSkillId !== 'basic_attack' && skillDef.cooldownMs > 0) {
      skillEngine.setSkillCooldown(socket.id, effectiveSkillId, skillDef.cooldownMs);
    }

    // ── Crit check ──
    const skillMult = getSkillMultiplier(skills, effectiveSkillId);
    const critChance = calculateCritChance(player.stats.luk ?? 0, player.baseLevel || 1, 0.05, balance);
    const isCrit = Math.random() < critChance;
    const critMult = calculateCritMultiplier(player.stats.luk ?? 0, balance);

    // ── Final damage with DEF ──
    const targetDef = calculateDef(0, 0); // enemies don't have VIT-based DEF yet
    const dmgInput = { atk, targetDef, skillMultiplier: skillMult, variance: 5 };
    const critInfo = isCrit ? { isCritical: true, critChance, critMultiplier: critMult } : undefined;
    let damage = calculateDamageWithDefense('physical', atk, dmgInput, balance, critInfo);

    // ── Class passive: damage bonus ──
    damage = applyDamagePassive(damage, player.jobClass, jobs as JobClass[]);

    // ── Class passive: double attack (Thief) ──
    let doubleAttackDamage = 0;
    const isDoubleAttack = shouldTriggerDoubleAttack(player.jobClass, jobs as JobClass[]);
    if (isDoubleAttack) {
      doubleAttackDamage = Math.floor(damage * 0.5);
      damage += doubleAttackDamage;
    }

    console.log(`[Attack] ${isCrit ? 'CRIT ' : ''}${isDoubleAttack ? 'DOUBLE ' : ''}Hit ${enemy.name} for ${damage} (atk=${atk.toFixed(0)}, hit=${hitChance.toFixed(2)})`);

    enemy.hp = Math.max(0, enemy.hp - damage);

    if (enemy.hp === 0) {
      enemy.isDead = true;
      enemy.deathTime = Date.now();

      const { baseExp: expBase, jobExp: expJob } = calculateExpReward(enemy.level, balance);

      const drops = mapManager.getEnemyDrops(enemy.templateId);
      const loot: any[] = [];
      for (const drop of drops) {
        if (Math.random() <= drop.chance) {
          const amount = drop.minAmount + Math.floor(Math.random() * (drop.maxAmount - drop.minAmount + 1));
          const itemDef = items.find(i => i.id === drop.itemId);
          loot.push({
            id: drop.itemId,
            name: itemDef?.name ?? drop.itemId,
            type: itemDef?.type ?? 'misc',
            amount,
            description: itemDef?.description ?? '',
          });
        }
      }

      addItemsToInventory(player, loot.map(l => ({ id: l.id, amount: l.amount })));

      player.baseExp += expBase;
      player.jobExp += expJob;
      processServerLevelUp(player, socket, io);

      socket.emit('enemyKilled', {
        targetId: data.targetId, expBase, expJob, loot,
        newSp: player.sp, damage, usedSkill,
        hp: 0, isDead: true, isCritical: isCrit,
        doubleAttack: isDoubleAttack,
        totalDamage: damage,
        currentBaseExp: player.baseExp,
        currentJobExp: player.jobExp,
        currentBaseLevel: player.baseLevel,
        currentJobLevel: player.jobLevel,
      });
    } else {
      socket.emit('attackResult', {
        targetId: data.targetId, damage, usedSkill, missed: false, isCritical: isCrit,
        newSp: player.sp, hp: enemy.hp, isDead: false,
        doubleAttack: isDoubleAttack,
        totalDamage: damage,
      });
    }

    io.to(player.currentMapId).emit('enemyDamaged', {
      targetId: data.targetId, damage, usedSkill, isCritical: isCrit,
      attackerId: socket.id, hp: enemy.hp, isDead: enemy.isDead,
      doubleAttack: isDoubleAttack,
    });
  });

  socket.on('skillCast', (data: SkillCastRequest, callback?: (res: any) => void) => {
    if (!player) return;

    if (mapManager.isInSafeZone(player.currentMapId, player.x, player.z)) {
      callback?.({ success: false, error: 'Cannot use skills in safe zone' });
      return;
    }

    const instance = mapManager.getMap(player.currentMapId);
    if (!instance) return;

    const casterStats: Record<string, number> = {
      str: player.stats.str,
      agi: player.stats.agi,
      vit: player.stats.vit,
      int: player.stats.int,
      dex: player.stats.dex,
      luk: player.stats.luk,
      maxHp: player.maxHp,
    };

    const request: any = {
      skillId: data.skillId,
      targetId: data.targetId,
      targetX: data.targetX,
      targetZ: data.targetZ,
      directionX: data.directionX,
      directionZ: data.directionZ,
      casterId: player.id,
      casterPosition: { x: player.x, y: player.y, z: player.z },
      casterStats,
      casterLevel: player.baseLevel,
      sp: player.sp,
      hp: player.hp,
    };

    if (skillEngine.isCasting(player.id)) {
      callback?.({ success: false, error: 'Already casting' });
      return;
    }

    const result = skillEngine.executeCast(request);

    if (!result.success) {
      callback?.({ success: false, error: result.error });
      return;
    }

    if (result.castTimeMs) {
      player.isCasting = true;
      player.castingSkillId = data.skillId;
      callback?.({ success: true, castTimeMs: result.castTimeMs, animationId: result.animationId });
      return;
    }

    player.sp = result.newSp ?? player.sp;
    player.hp = result.newHp ?? player.hp;

    if (result.damage) {
      const skillDef = skills.find(s => s.id === data.skillId);
      const dmgEffect = skillDef?.effects.find(e => e.type === 'damage' || e.type === 'aoe_damage');
      const formulaStat = dmgEffect?.formula?.stat;
      const isPhysical = formulaStat === 'str';
      const isMagical = formulaStat === 'int';
      const defCfg = balance.combat.damageReduction;

      for (const targetId of result.targetsHit ?? []) {
        const enemy = mapManager.getEnemy(player.currentMapId, targetId);
        let perTargetDamage = result.targetDamages?.[targetId] ?? result.damage;

        if (enemy && !enemy.isDead) {
          // Apply DEF/MDEF reduction to skill damage
          if (isPhysical) {
            const reduction = (enemy.level * 2) * (defCfg?.defMultiplier ?? 0.6);
            const minDmg = perTargetDamage * (defCfg?.minDamagePct ?? 0.3);
            perTargetDamage = Math.max(1, Math.floor(Math.max(minDmg, perTargetDamage - reduction)));
          } else if (isMagical) {
            const reduction = Math.floor(enemy.level * 0.5) * (defCfg?.mdefMultiplier ?? 0.5);
            const minDmg = perTargetDamage * (defCfg?.minDamagePct ?? 0.3);
            perTargetDamage = Math.max(1, Math.floor(Math.max(minDmg, perTargetDamage - reduction)));
          }

          enemy.hp = Math.max(0, enemy.hp - perTargetDamage);
          if (enemy.hp === 0) {
            enemy.isDead = true;
            enemy.deathTime = Date.now();
            const { baseExp: expBase, jobExp: expJob } = calculateExpReward(enemy.level, balance);
            const drops = mapManager.getEnemyDrops(enemy.templateId);
            const loot: any[] = [];
            for (const drop of drops) {
              if (Math.random() <= drop.chance) {
                const amount = drop.minAmount + Math.floor(Math.random() * (drop.maxAmount - drop.minAmount + 1));
                const itemDef = items.find(i => i.id === drop.itemId);
                loot.push({ id: drop.itemId, name: itemDef?.name ?? drop.itemId, type: itemDef?.type ?? 'misc', amount, description: itemDef?.description ?? '' });
              }
            }
            addItemsToInventory(player, loot.map(l => ({ id: l.id, amount: l.amount })));

            player.baseExp += expBase;
            player.jobExp += expJob;
            processServerLevelUp(player, socket, io);

            socket.emit('enemyKilled', { targetId, expBase, expJob, loot, newSp: player.sp, damage: perTargetDamage, usedSkill: true, hp: 0, isDead: true, doubleAttack: false, totalDamage: perTargetDamage, currentBaseExp: player.baseExp, currentJobExp: player.jobExp, currentBaseLevel: player.baseLevel, currentJobLevel: player.jobLevel });
          }
        }
      }
    }

    if (result.groundEffectId) {
      const ge = skillEngine.getGroundEffectManager().getEffectById(result.groundEffectId);
      if (ge) {
        io.to(player.currentMapId).emit('groundEffectCreated', {
          id: ge.id,
          definitionId: ge.definitionId,
          casterId: ge.casterId,
          x: ge.x,
          z: ge.z,
          createdAt: ge.createdAt,
          expiresAt: ge.expiresAt,
          angle: ge.angle,
          length: ge.length,
        });
      }
    }

    callback?.({
      success: true,
      damage: result.damage,
      heal: result.heal,
      isCritical: result.isCritical,
      targetsHit: result.targetsHit,
      targetDamages: result.targetDamages,
      targetHeals: result.targetHeals,
      targetPositions: result.targetPositions,
      newSp: result.newSp,
      newHp: result.newHp,
      cooldownMs: result.cooldownMs,
      animationId: result.animationId,
      vfxId: result.vfxId,
      soundId: result.soundId,
    });

    io.to(player.currentMapId).emit('skillCastResult', {
      casterId: player.id,
      skillId: data.skillId,
      damage: result.damage,
      heal: result.heal,
      isCritical: result.isCritical,
      targetsHit: result.targetsHit,
      targetDamages: result.targetDamages,
      targetHeals: result.targetHeals,
      targetPositions: result.targetPositions,
      animationId: result.animationId,
      vfxId: result.vfxId,
      soundId: result.soundId,
    });
  });

  socket.on('skillCastComplete', (data: { skillId: string }, callback?: (res: any) => void) => {
    if (!player) return;

    const instance = mapManager.getMap(player.currentMapId);
    if (!instance) return;

    const casterStats: Record<string, number> = {
      str: player.stats.str,
      agi: player.stats.agi,
      vit: player.stats.vit,
      int: player.stats.int,
      dex: player.stats.dex,
      luk: player.stats.luk,
      maxHp: player.maxHp,
    };

    const request: any = {
      skillId: data.skillId,
      casterId: player.id,
      casterPosition: { x: player.x, y: player.y, z: player.z },
      casterStats,
      casterLevel: player.baseLevel,
      sp: player.sp,
      hp: player.hp,
    };

    const result = skillEngine.completeCast(player.id, request);

    player.isCasting = false;
    player.castingSkillId = undefined;
    player.sp = result.newSp ?? player.sp;
    player.hp = result.newHp ?? player.hp;

    if (result.damage) {
      for (const targetId of result.targetsHit ?? []) {
        const enemy = mapManager.getEnemy(player.currentMapId, targetId);
        const perTargetDamage = result.targetDamages?.[targetId] ?? result.damage;
        if (enemy && !enemy.isDead) {
          enemy.hp = Math.max(0, enemy.hp - perTargetDamage);
          if (enemy.hp === 0) {
            enemy.isDead = true;
            enemy.deathTime = Date.now();
            const { baseExp: expBase, jobExp: expJob } = calculateExpReward(enemy.level, balance);
            player.baseExp += expBase;
            player.jobExp += expJob;
            processServerLevelUp(player, socket, io);
            socket.emit('enemyKilled', { targetId, expBase, expJob, loot: [], newSp: player.sp, damage: perTargetDamage, usedSkill: true, hp: 0, isDead: true, doubleAttack: false, totalDamage: perTargetDamage, currentBaseExp: player.baseExp, currentJobExp: player.jobExp, currentBaseLevel: player.baseLevel, currentJobLevel: player.jobLevel });
          }
        }
      }
    }

    if (result.groundEffectId) {
      const ge = skillEngine.getGroundEffectManager().getEffectById(result.groundEffectId);
      if (ge) {
        io.to(player.currentMapId).emit('groundEffectCreated', {
          id: ge.id, definitionId: ge.definitionId, casterId: ge.casterId,
          x: ge.x, z: ge.z, createdAt: ge.createdAt, expiresAt: ge.expiresAt,
          angle: ge.angle, length: ge.length,
        });
      }
    }

    callback?.({
      success: true,
      damage: result.damage,
      heal: result.heal,
      isCritical: result.isCritical,
      targetsHit: result.targetsHit,
      targetDamages: result.targetDamages,
      targetHeals: result.targetHeals,
      targetPositions: result.targetPositions,
      newSp: result.newSp,
      newHp: result.newHp,
      cooldownMs: result.cooldownMs,
      animationId: result.animationId,
      vfxId: result.vfxId,
      soundId: result.soundId,
    });

    io.to(player.currentMapId).emit('skillCastResult', {
      casterId: player.id,
      skillId: data.skillId,
      damage: result.damage,
      heal: result.heal,
      isCritical: result.isCritical,
      targetsHit: result.targetsHit,
      targetDamages: result.targetDamages,
      targetHeals: result.targetHeals,
      targetPositions: result.targetPositions,
      animationId: result.animationId,
      vfxId: result.vfxId,
      soundId: result.soundId,
    });
  });

  socket.on('skillCastInterrupt', () => {
    if (!player) return;
    skillEngine.interruptCast(player.id);
    player.isCasting = false;
    player.castingSkillId = undefined;
  });

  socket.on('requestWarp', (data: { warpId: string }, callback?: (res: { success: boolean; error?: string }) => void) => {
    if (!player) return;

    const now = Date.now();
    if (now < player.warpCooldownUntil) {
      callback?.({ success: false, error: 'Warp cooldown active' });
      return;
    }

    const warp = mapManager.findWarpByProximity(player.currentMapId, player.x, player.z);
    if (!warp) {
      callback?.({ success: false, error: 'No warp nearby' });
      return;
    }

    if (warp.id !== data.warpId) {
      callback?.({ success: false, error: 'Warp mismatch' });
      return;
    }

    const targetMap = mapManager.getMap(warp.targetMapId);
    if (!targetMap) {
      callback?.({ success: false, error: 'Target map not found' });
      return;
    }

    if (warp.requirements) {
      if (player.baseLevel < warp.requirements.minLevel) {
        callback?.({ success: false, error: `Requires level ${warp.requirements.minLevel}` });
        return;
      }
    }

    performMapChange(player, socket, warp.targetMapId, warp.targetSpawnId);
    callback?.({ success: true });
  });

  socket.on('changeJob', (data: { newJob: string }, callback?: (res: { success: boolean; error?: string }) => void) => {
    if (!player) return;

    const jobDef = jobMap.get(data.newJob);
    if (!jobDef || !validJobIds.has(data.newJob)) {
      callback?.({ success: false, error: 'Invalid job class.' });
      return;
    }

    const req = jobDef.requirements;
    if (req) {
      if (player.jobClass !== req.fromJob) {
        callback?.({ success: false, error: `Can only change from ${req.fromJob}.` });
        return;
      }
      if (player.jobLevel < req.minJobLevel) {
        callback?.({ success: false, error: `Need job level ${req.minJobLevel}.` });
        return;
      }
    }

    player.jobClass = data.newJob;
    player.jobLevel = 1;
    player.jobExp = 0;
    player.unlockedSkills = [];
    player.skillPoints += jobDef.bonusSkillPoints;

    player.stats.str += jobDef.baseStatModifiers.str;
    player.stats.agi += jobDef.baseStatModifiers.agi;
    player.stats.vit += jobDef.baseStatModifiers.vit;
    player.stats.int += jobDef.baseStatModifiers.int;
    player.stats.dex += jobDef.baseStatModifiers.dex;
    player.stats.luk += jobDef.baseStatModifiers.luk;

    callback?.({ success: true });
  });

  socket.on('allocateStat', (data: { stat: string; statPoints?: number }, callback?: (res: { success: boolean; stats?: any; error?: string }) => void) => {
    if (!player) return;
    if (data.stat === 'statPoints') { callback?.({ success: false, error: 'Cannot allocate statPoints directly.' }); return; }

    if (data.statPoints !== undefined) player.stats.statPoints = Math.max(0, data.statPoints);
    if (player.stats.statPoints <= 0) { callback?.({ success: false, error: 'No stat points available.' }); return; }
    if (player.stats[data.stat as keyof typeof player.stats] >= balance.stats.cap) { callback?.({ success: false, error: `Stat ${data.stat} is at max (${balance.stats.cap}).` }); return; }

    const statKey = data.stat as keyof typeof player.stats;
    if (statKey !== 'statPoints') {
      (player.stats[statKey] as number) += 1;
    }
    player.stats.statPoints -= 1;
    callback?.({ success: true, stats: { ...player.stats } });
  });

  socket.on('unlockSkill', (data: { skillId: string; skillPoints?: number }, callback?: (res: { success: boolean; unlockedSkills?: string[]; skillPoints?: number; error?: string }) => void) => {
    if (!player) return;

    const skill = skills.find(s => s.id === data.skillId);
    if (!skill) { callback?.({ success: false, error: 'Skill not found.' }); return; }
    if (player.unlockedSkills.includes(data.skillId)) { callback?.({ success: false, error: 'Skill already unlocked.' }); return; }

    if (data.skillPoints !== undefined) player.skillPoints = Math.max(0, data.skillPoints);
    if (player.skillPoints < skill.skillPointCost) { callback?.({ success: false, error: 'Not enough skill points.' }); return; }

    for (const req of skill.requirements) {
      if (!isSkillUnlocked(player, req)) { callback?.({ success: false, error: `Requires ${req}.` }); return; }
    }

    player.unlockedSkills.push(data.skillId);
    player.skillPoints -= skill.skillPointCost;
    callback?.({ success: true, unlockedSkills: [...player.unlockedSkills], skillPoints: player.skillPoints });
  });

  type TradeItem = { itemId: string; amount: number };
  type TradeOffer = { zeny: number; items: TradeItem[]; locked: boolean; accepted: boolean };
  type TradeSession = {
    initiatorId: string;
    peerId: string;
    initiatorOffer: TradeOffer;
    peerOffer: TradeOffer;
  };
  const tradeSessions = new Map<string, TradeSession>();

  function getTradeSession(socketId: string): TradeSession | undefined {
    for (const ts of tradeSessions.values()) {
      if (ts.initiatorId === socketId || ts.peerId === socketId) return ts;
    }
    return undefined;
  }

  function otherPlayerId(ts: TradeSession, socketId: string): string {
    return ts.initiatorId === socketId ? ts.peerId : ts.initiatorId;
  }

  function tradeGetPlayer(socketId: string): ServerPlayer | null {
    for (const instance of mapManager.getAllMaps().values()) {
      const p = instance.players.get(socketId);
      if (p) return p;
    }
    return null;
  }

  function tradeGetPlayerZeny(socketId: string): number {
    const p = tradeGetPlayer(socketId);
    return p?.zeny ?? 0;
  }

  function tradeGetPlayerItemAmount(socketId: string, itemId: string): number {
    const p = tradeGetPlayer(socketId);
    if (!p) return 0;
    const slot = p.inventory.find(s => s.itemId === itemId);
    return slot?.amount ?? 0;
  }

  function tradeDeductPlayer(socketId: string, zeny: number, items: TradeItem[]): boolean {
    const p = tradeGetPlayer(socketId);
    if (!p) return false;
    if (p.zeny < zeny) return false;
    for (const item of items) {
      const slot = p.inventory.find(s => s.itemId === item.itemId);
      if (!slot || slot.amount < item.amount) return false;
    }
    p.zeny -= zeny;
    for (const item of items) {
      const slot = p.inventory.find(s => s.itemId === item.itemId);
      if (slot) {
        slot.amount -= item.amount;
        if (slot.amount <= 0) {
          p.inventory = p.inventory.filter(s => s.itemId !== item.itemId);
        }
      }
    }
    return true;
  }

  function tradeAddToPlayer(socketId: string, zeny: number, items: TradeItem[]): void {
    const p = tradeGetPlayer(socketId);
    if (!p) return;
    p.zeny += zeny;
    for (const item of items) {
      const slot = p.inventory.find(s => s.itemId === item.itemId);
      if (slot) {
        slot.amount += item.amount;
      } else {
        p.inventory.push({ itemId: item.itemId, amount: item.amount });
      }
    }
  }

  socket.on('requestTrade', (data: { targetSocketId: string }) => {
    if (!player) return;
    if (data.targetSocketId === socket.id) return;
    if (getTradeSession(socket.id)) return;
    if (getTradeSession(data.targetSocketId)) return;

    const session: TradeSession = {
      initiatorId: socket.id,
      peerId: data.targetSocketId,
      initiatorOffer: { zeny: 0, items: [], locked: false, accepted: false },
      peerOffer: { zeny: 0, items: [], locked: false, accepted: false },
    };
    tradeSessions.set(`${socket.id}-${data.targetSocketId}`, session);
    io.to(data.targetSocketId).emit('tradeRequested', { from: socket.id, name: player.name });
  });

  socket.on('acceptTradeRequest', () => {
    if (!player) return;
    for (const [key, ts] of tradeSessions) {
      if (ts.peerId === socket.id) {
        const initiatorName = mapManager.getMapPlayers(player.currentMapId)[ts.initiatorId]?.name;
        io.to(ts.initiatorId).emit('tradeAccepted', { peerId: ts.peerId, name: player.name });
        socket.emit('tradeAccepted', { peerId: ts.initiatorId, name: initiatorName });
        return;
      }
    }
  });

  socket.on('declineTradeRequest', () => {
    if (!player) return;
    for (const [key, ts] of tradeSessions) {
      if (ts.peerId === socket.id) {
        io.to(ts.initiatorId).emit('tradeDeclined', { name: player.name });
        tradeSessions.delete(key);
        return;
      }
    }
  });

  socket.on('updateTradeOffer', (data: { zeny?: number; items?: TradeItem[] }) => {
    if (!player) return;
    const ts = getTradeSession(socket.id);
    if (!ts) return;
    const offer = ts.initiatorId === socket.id ? ts.initiatorOffer : ts.peerOffer;
    if (offer.locked) return;
    if (data.zeny !== undefined) {
      const playerZeny = tradeGetPlayerZeny(socket.id);
      offer.zeny = Math.max(0, Math.min(playerZeny, data.zeny));
    }
    if (data.items !== undefined) {
      offer.items = data.items.filter(item => item.amount > 0);
    }

    const peerId = otherPlayerId(ts, socket.id);
    io.to(peerId).emit('tradeOfferUpdated', { from: socket.id, offer: { zeny: offer.zeny, items: offer.items, locked: offer.locked } });
  });

  socket.on('lockTrade', () => {
    if (!player) return;
    const ts = getTradeSession(socket.id);
    if (!ts) return;
    const offer = ts.initiatorId === socket.id ? ts.initiatorOffer : ts.peerOffer;
    const playerZeny = tradeGetPlayerZeny(socket.id);
    if (offer.zeny > playerZeny) {
      socket.emit('tradeError', { error: 'Not enough zeny' });
      return;
    }
    for (const item of offer.items) {
      const hasAmount = tradeGetPlayerItemAmount(socket.id, item.itemId);
      if (hasAmount < item.amount) {
        socket.emit('tradeError', { error: `Not enough of item ${item.itemId}` });
        return;
      }
    }
    offer.locked = true;
    const peerId = otherPlayerId(ts, socket.id);
    io.to(peerId).emit('tradeOfferUpdated', { from: socket.id, offer: { zeny: offer.zeny, items: offer.items, locked: offer.locked } });
    socket.emit('tradeOfferUpdated', { from: socket.id, offer: { zeny: offer.zeny, items: offer.items, locked: offer.locked } });
    if (ts.initiatorOffer.locked && ts.peerOffer.locked) {
      io.to(ts.initiatorId).emit('tradeReady');
      io.to(ts.peerId).emit('tradeReady');
    }
  });

  socket.on('acceptTrade', () => {
    if (!player) return;
    const ts = getTradeSession(socket.id);
    if (!ts) return;
    if (!ts.initiatorOffer.locked || !ts.peerOffer.locked) return;
    const myOffer = ts.initiatorId === socket.id ? ts.initiatorOffer : ts.peerOffer;
    if (myOffer.accepted) return;
    myOffer.accepted = true;

    if (ts.initiatorOffer.accepted && ts.peerOffer.accepted) {
      const initiatorSocket = io.sockets.sockets.get(ts.initiatorId);
      const peerSocket = io.sockets.sockets.get(ts.peerId);
      if (!initiatorSocket || !peerSocket) {
        io.to(ts.initiatorId).emit('tradeError', { error: 'Other player disconnected' });
        io.to(ts.peerId).emit('tradeError', { error: 'Other player disconnected' });
        for (const [k] of tradeSessions) { if (k.startsWith(ts.initiatorId) || k.endsWith(ts.initiatorId)) { tradeSessions.delete(k); break; } }
        return;
      }

      // Deduct initiator's offered zeny + items, add peer's zeny + items
      const initOk = tradeDeductPlayer(ts.initiatorId, ts.initiatorOffer.zeny, ts.initiatorOffer.items);
      const peerOk = tradeDeductPlayer(ts.peerId, ts.peerOffer.zeny, ts.peerOffer.items);

      if (!initOk || !peerOk) {
        // Rollback if deduction fails — re-add what was taken
        if (initOk) tradeAddToPlayer(ts.initiatorId, ts.initiatorOffer.zeny, ts.initiatorOffer.items);
        if (peerOk) tradeAddToPlayer(ts.peerId, ts.peerOffer.zeny, ts.peerOffer.items);
        io.to(ts.initiatorId).emit('tradeError', { error: 'Trade failed — inventory changed' });
        io.to(ts.peerId).emit('tradeError', { error: 'Trade failed — inventory changed' });
        for (const [k] of tradeSessions) { if (k.startsWith(ts.initiatorId) || k.endsWith(ts.initiatorId)) { tradeSessions.delete(k); break; } }
        return;
      }

      // Transfer: initiator gets peer's offer, peer gets initiator's offer
      tradeAddToPlayer(ts.initiatorId, ts.peerOffer.zeny, ts.peerOffer.items);
      tradeAddToPlayer(ts.peerId, ts.initiatorOffer.zeny, ts.initiatorOffer.items);

      io.to(ts.initiatorId).emit('tradeCompleted', { receivedZeny: ts.peerOffer.zeny, sentZeny: ts.initiatorOffer.zeny });
      io.to(ts.peerId).emit('tradeCompleted', { receivedZeny: ts.initiatorOffer.zeny, sentZeny: ts.peerOffer.zeny });
      for (const [k] of tradeSessions) {
        if (k.startsWith(ts.initiatorId) || k.endsWith(ts.initiatorId)) { tradeSessions.delete(k); break; }
      }
    }
  });

  socket.on('cancelTrade', () => {
    if (!player) return;
    for (const [key, ts] of tradeSessions) {
      if (ts.initiatorId === socket.id || ts.peerId === socket.id) {
        io.to(otherPlayerId(ts, socket.id)).emit('tradeCancelled', { name: player.name });
        tradeSessions.delete(key);
        break;
      }
    }
  });

  socket.on('useItem', (data: { itemId: string }, callback?: (res: { success: boolean; error?: string }) => void) => {
    if (!player) return;
    const itemDef = items.find(i => i.id === data.itemId);
    if (!itemDef || itemDef.type !== 'usable') {
      callback?.({ success: false, error: 'Item not usable' });
      return;
    }

    // Check inventory
    const slot = player.inventory.find(s => s.itemId === data.itemId);
    if (!slot || slot.amount < 1) {
      callback?.({ success: false, error: 'Item not in inventory' });
      return;
    }

    const effect = itemDef.effect;
    if (effect) {
      switch (effect.type) {
        case 'restore_hp':
          player.hp = Math.min(player.maxHp, player.hp + (effect.value ?? 0));
          break;
        case 'restore_sp':
          player.sp = Math.min(player.maxSp, player.sp + (effect.value ?? 0));
          break;
        case 'restore_hp_percent':
          player.hp = Math.min(player.maxHp, player.hp + Math.floor(player.maxHp * (effect.percent ?? 0) / 100));
          break;
        case 'restore_sp_percent':
          player.sp = Math.min(player.maxSp, player.sp + Math.floor(player.maxSp * (effect.percent ?? 0) / 100));
          break;
      }
    }

    // Decrement inventory
    slot.amount -= 1;
    if (slot.amount <= 0) {
      player.inventory = player.inventory.filter(s => s.itemId !== data.itemId);
    }

    callback?.({ success: true });
  });

  socket.on('npcBuy', (data: { itemId: string }, callback?: (res: { success: boolean; error?: string; newZeny?: number; itemName?: string; itemType?: string; itemDesc?: string }) => void) => {
    const p = player;
    if (!p) return;
    const itemDef = items.find(i => i.id === data.itemId);
    if (!itemDef) { callback?.({ success: false, error: 'Item not found' }); return; }

    const mapCfg = mapConfigs.find((m: any) => m.id === p.currentMapId);
    const npcs: any[] = (mapCfg as any)?.npcs || [];
    const sellsItem = npcs.some((n: any) => n.shopItems?.includes(data.itemId));
    if (!sellsItem) { callback?.({ success: false, error: 'NPC does not sell this item' }); return; }

    const basePrice = itemDef.buyPrice ?? 99999;
    const price = applyBuyDiscount(basePrice, p.jobClass, jobs as JobClass[]);
    if (p.zeny < price) { callback?.({ success: false, error: 'Not enough zeny' }); return; }

    const slot = p.inventory.find(s => s.itemId === data.itemId);
    if (slot) {
      slot.amount += 1;
    } else {
      p.inventory.push({ itemId: data.itemId, amount: 1 });
    }
    p.zeny -= price;

    callback?.({ success: true, newZeny: p.zeny, itemName: itemDef.name, itemType: itemDef.type, itemDesc: itemDef.description });
  });

  socket.on('npcSell', (data: { itemId: string }, callback?: (res: { success: boolean; error?: string; newZeny?: number }) => void) => {
    const p = player;
    if (!p) return;
    const itemDef = items.find(i => i.id === data.itemId);
    if (!itemDef) { callback?.({ success: false, error: 'Item not found' }); return; }

    const slot = p.inventory.find(s => s.itemId === data.itemId);
    if (!slot || slot.amount < 1) { callback?.({ success: false, error: 'Item not in inventory' }); return; }

    const price = itemDef.sellPrice ?? 0;
    if (price <= 0) { callback?.({ success: false, error: 'Item has no value' }); return; }

    slot.amount -= 1;
    if (slot.amount <= 0) {
      p.inventory = p.inventory.filter(s => s.itemId !== data.itemId);
    }
    p.zeny += price;

    callback?.({ success: true, newZeny: p.zeny });
  });

  socket.on('chat', (msg: string) => {
    if (!player) return;
    const text = (typeof msg === 'string' ? msg : '').slice(0, balance.limits.chatMaxLength);
    if (!text.trim()) return;
    io.to(player.currentMapId).emit('chatMessage', {
      id: Date.now().toString() + Math.random().toString(),
      sender: player.name,
      text,
      timestamp: Date.now(),
    });
  });

  socket.on('saveProgress', (playerData: any) => {
    if (!player) return;
    const parsed = SaveDataSchema.safeParse(playerData);
    if (!parsed.success) {
      console.warn(`[SaveProgress] Invalid data from ${socket.id}:`, parsed.error.flatten());
      socket.emit('progressSaved', { success: false, error: 'Invalid save data' });
      return;
    }
    savedData.set(socket.id, parsed.data);
    socket.emit('progressSaved', { success: true });
  });

  socket.on('loadProgress', (callback?: (data: any) => void) => {
    const data = savedData.get(socket.id);
    if (callback) callback(data || null);
  });

  socket.on('disconnect', () => {
    if (player) {
      const result = mapManager.removePlayerFromMap(socket.id);
      if (result) {
        socket.leave(result.mapId);
        io.to(result.mapId).emit('playerLeft', socket.id);
      }
    }

    for (const [key, ts] of tradeSessions) {
      if (ts.initiatorId === socket.id || ts.peerId === socket.id) {
        const otherId = ts.initiatorId === socket.id ? ts.peerId : ts.initiatorId;
        io.to(otherId).emit('tradeCancelled', { name: player?.name || 'Disconnected player' });
        tradeSessions.delete(key);
        break;
      }
    }
  });
});

// ── Map change helper ──
function performMapChange(player: ServerPlayer, socket: any, targetMapId: string, targetSpawnId: string) {
  const oldMapId = player.currentMapId;
  const oldInstance = mapManager.getMap(oldMapId);

  if (oldInstance) {
    oldInstance.players.delete(player.id);
    socket.leave(oldMapId);
    io.to(oldMapId).emit('playerLeft', player.id);
  }

  mapManager.addPlayerToMap(player.id, player, targetMapId, targetSpawnId);
  socket.join(targetMapId);

  const initData = mapManager.getMapInitData(targetMapId);
  const enemies = mapManager.getMapEnemies(targetMapId);
  const players = mapManager.getMapPlayers(targetMapId);

  const mapChangeData: MapChangeData = {
    mapId: targetMapId,
    mapName: initData?.mapName ?? targetMapId,
    mapType: initData?.mapType ?? 'field',
    spawnPosition: { x: player.x, y: player.y, z: player.z },
    initData: initData!,
    enemies,
    players,
  };

  socket.emit('mapChange', mapChangeData);

  io.to(targetMapId).emit('playerJoined', {
    id: player.id,
    x: player.x,
    y: player.y,
    z: player.z,
    name: player.name,
  });

  player.warpCooldownUntil = Date.now() + 2000;
}

// ── Interaction execution when player reaches target ──
function executePendingInteraction(player: ServerPlayer, io: any) {
  const interaction = player.pendingInteraction;
  if (!interaction) return;

  player.pendingInteraction = null;
  player.moveTarget = null;
  player.path = null;
  player.pathIndex = 0;

  const mapCfg = mapConfigs.find((m: any) => m.id === player.currentMapId);
  if (!mapCfg) return;

  const socket = io.sockets.sockets.get(player.id);
  if (!socket) return;

  switch (interaction.type) {
    case 'npc': {
      const npcs: any[] = (mapCfg as any)?.npcs || [];
      const npc = npcs.find((n: any) => n.id === interaction.id);
      if (!npc) return;

      const dialog = (gameData.dialogs as any)?.dialogs?.find((d: any) => d.id === npc.dialogId);
      if (!dialog) return;

      const data: InteractionReadyData = {
        type: 'npc',
        npcId: interaction.id,
        dialogId: npc.dialogId,
        npcName: npc.name,
      };
      socket.emit('interactionReady', data);
      break;
    }
    case 'chest': {
      const chests: any[] = (mapCfg as any)?.chests || [];
      const chest = chests.find((c: any) => c.id === interaction.id);
      if (!chest) return;

      if (!isChestAvailable(player.currentMapId, chest.id)) {
        socket.emit('openChest', { chestId: chest.id, alreadyOpened: true });
        return;
      }

      socket.emit('openChest', { chestId: chest.id });
      const loot: any[] = [];
      for (const drop of chest.lootTable || []) {
        if (Math.random() <= drop.chance) {
          const amount = Math.floor(Math.random() * (drop.maxAmount - drop.minAmount + 1)) + drop.minAmount;
          if (amount > 0) {
            const itemDef = items.find((i: any) => i.id === drop.itemId);
            loot.push({
              id: drop.itemId,
              amount,
              name: itemDef?.name || drop.itemId,
              type: itemDef?.type || 'misc',
              description: itemDef?.description || '',
            });
          }
        }
      }

      if (loot.length > 0) {
        addItemsToInventory(player, loot.map(l => ({ id: l.id, amount: l.amount })));
        for (const item of loot) {
          io.to(player.currentMapId).emit('itemReceived', { chestId: chest.id, item });
        }
      }

      markChestOpened(player.currentMapId, chest.id, chest.respawnSeconds || 60);
      io.to(player.currentMapId).emit('chestOpened', { chestId: chest.id, loot });
      break;
    }
    case 'warp': {
      const warps: any[] = (mapCfg as any)?.warps || [];
      const warp = warps.find((w: any) => w.id === interaction.id);
      if (!warp) return;

      const now = Date.now();
      if (now < player.warpCooldownUntil) return;

      const targetMap = mapManager.getMap(warp.targetMapId);
      if (!targetMap) return;

      if (warp.requirements && player.baseLevel < (warp.requirements.minLevel || 0)) return;

      performMapChange(player, socket, warp.targetMapId, warp.targetSpawnId || 'default');
      break;
    }
  }
}

// ── Game Loop ─────────────────────────────────────────────
let ticking = false;
const tickTimeSec = balance.server.tickRateMs / 1000;
const regenIntervalTicks = balance.regen.intervalTicks;

function tick() {
  tickNum++;
  const now = Date.now();

  for (const [mapId, instance] of mapManager.getAllMaps()) {
    // ── Build spatial entities for SkillEngine ──
    const spatialEntities: SpatialEntity[] = [];
    for (const [id, p] of instance.players) {
      spatialEntities.push({ id, x: p.x, z: p.z });
    }
    for (const [id, e] of instance.enemies) {
      if (!e.isDead) {
        spatialEntities.push({ id, x: e.position.x, z: e.position.z });
      }
    }
    skillEngine.rebuildSpatialIndex(spatialEntities);

    // ── Build buffable entities ──
    const buffableEntities = new Map<string, BuffableEntity>();
    for (const [id, p] of instance.players) {
      buffableEntities.set(id, {
        id,
        position: { x: p.x, y: p.y, z: p.z },
        isAlive: p.hp > 0,
      });
    }
    for (const [id, e] of instance.enemies) {
      if (!e.isDead) {
        buffableEntities.set(id, {
          id,
          position: { x: e.position.x, y: e.position.y, z: e.position.z },
          isAlive: true,
        });
      }
    }

    // ── Tick SkillEngine (buffs, ground effects) ──
    skillEngine.tick(now, buffableEntities, (targetId, effect, sourceId) => {
      const casterPlayer = instance.players.get(sourceId);
      const casterStats: Record<string, number> = casterPlayer ? {
        str: casterPlayer.stats.str,
        agi: casterPlayer.stats.agi,
        vit: casterPlayer.stats.vit,
        int: casterPlayer.stats.int,
        dex: casterPlayer.stats.dex,
        luk: casterPlayer.stats.luk,
        maxHp: casterPlayer.maxHp,
      } : {};

      const formulaRequest: any = {
        casterStats,
        casterLevel: casterPlayer?.baseLevel ?? 1,
        sp: casterPlayer?.sp ?? 0,
        hp: casterPlayer?.hp ?? 0,
        casterPosition: { x: 0, y: 0, z: 0 },
        casterId: sourceId,
        skillId: '',
      };

      if (effect.type === 'damage' || effect.type === 'aoe_damage') {
        const calcDmg = effect.formula ? skillEngine.calculateFormula(effect.formula, formulaRequest) : 10;
        const enemy = mapManager.getEnemy(mapId, targetId);
        if (enemy && !enemy.isDead) {
          enemy.hp = Math.max(0, enemy.hp - calcDmg);
          if (enemy.hp === 0) {
            enemy.isDead = true;
            enemy.deathTime = now;
          }
        }
        const player = instance.players.get(targetId);
        if (player) {
          player.hp = Math.max(0, player.hp - calcDmg);
          if (player.hp === 0) {
            const halfW = instance.config.dimensions.width / 4;
            const halfH = instance.config.dimensions.height / 4;
            const spawnPoint = instance.config.spawnPoints[0];
            if (spawnPoint) {
              player.x = spawnPoint.position.x;
              player.y = spawnPoint.position.y;
              player.z = spawnPoint.position.z;
            } else {
              player.x = (Math.random() - 0.5) * halfW;
              player.z = (Math.random() - 0.5) * halfH;
            }
            player.hp = player.maxHp;
            player.sp = player.maxSp;
            io.to(targetId).emit('playerDied', { respawnPosition: { x: player.x, y: player.y, z: player.z } });
          }
        }
      } else if (effect.type === 'heal' || effect.type === 'aoe_heal' || effect.type === 'hot') {
        const healAmt = effect.formula ? skillEngine.calculateFormula(effect.formula, formulaRequest) : 10;
        const healAmtWithPassive = applyHealPassive(healAmt, casterPlayer.jobClass, jobs as JobClass[]);
        const player = instance.players.get(targetId);
        if (player) {
          player.hp = Math.min(player.maxHp, player.hp + healAmtWithPassive);
        }
      }
    });

    // ── Process input queues (server-authoritative) ──
    for (const p of instance.players.values()) {
      if (p.hp <= 0) {
        p.inputQueue = [];
        continue;
      }

      const pBuffs = skillEngine.getBuffManager().getBuffsByTarget(p.id);
      const ccLocked = pBuffs.some(b => (b.buffId === 'stun' || b.buffId === 'root') && b.stacks > 0);
      if (ccLocked) {
        p.inputQueue = [];
        continue;
      }

      // ── Read latest direct input ──
      let dx = 0, dz = 0;
      let hasDirectInput = false;
      if (p.inputQueue.length > 0) {
        const latest = p.inputQueue.pop()!;
        p.inputQueue = [];
        p.lastProcessedSeq = latest.seq;
        dx = latest.dirX;
        dz = latest.dirZ;
        hasDirectInput = (dx !== 0 || dz !== 0);
      }

      // ── Direct input clears target movement ──
      if (hasDirectInput) {
        p.moveTarget = null;
        p.path = null;
        p.pathIndex = 0;
        p.pendingInteraction = null;
      }

      // ── Two movement modes: direct input OR target following ──
      if (hasDirectInput) {
        if (dx !== 0 || dz !== 0) {
          const len = Math.sqrt(dx * dx + dz * dz);
          if (len > 1.0) { dx /= len; dz /= len; }
        }

        const speed = balance.movement.playerSpeed;
        const accelFactor = Math.min(1, (speed * 8) * tickTimeSec);
        const frictionFactor = Math.min(1, 10 * tickTimeSec);

        if (dx !== 0 || dz !== 0) {
          p.vx += (dx * speed - p.vx) * accelFactor;
          p.vz += (dz * speed - p.vz) * accelFactor;
        } else {
          p.vx -= p.vx * frictionFactor;
          p.vz -= p.vz * frictionFactor;
          if (Math.abs(p.vx) < 0.001) p.vx = 0;
          if (Math.abs(p.vz) < 0.001) p.vz = 0;
        }

        if (p.vx !== 0 || p.vz !== 0) {
          const newX = p.x + p.vx * tickTimeSec;
          const newZ = p.z + p.vz * tickTimeSec;

          const maxDelta = speed * tickTimeSec;
          const actualDelta = Math.sqrt((newX - p.x) ** 2 + (newZ - p.z) ** 2);
          if (actualDelta <= maxDelta + 0.001) {
            if (instance.navGrid) {
              const cell = instance.navGrid.cells;
              const cols = instance.navGrid.cols;
              const cellSize = instance.navGrid.cellSize;
              const halfW = (cols * cellSize) / 2;
              const halfH = (instance.navGrid.rows * cellSize) / 2;
              const gx = Math.floor((newX + halfW) / cellSize);
              const gz = Math.floor((newZ + halfH) / cellSize);
              if (gx >= 0 && gx < cols && gz >= 0 && gz < instance.navGrid.rows) {
                const cellData = cell[gz * cols + gx];
                if (cellData && cellData.walkable) {
                  p.x = newX;
                  p.z = newZ;
                } else {
                  p.vx = 0; p.vz = 0;
                }
              } else {
                p.vx = 0; p.vz = 0;
              }
            } else {
              p.x = newX;
              p.z = newZ;
            }
          } else {
            p.vx = 0; p.vz = 0;
          }

          const halfW = instance.config.dimensions.width / 2;
          const halfH = instance.config.dimensions.height / 2;
          p.x = Math.max(-halfW, Math.min(halfW, p.x));
          p.z = Math.max(-halfH, Math.min(halfH, p.z));
        }
      } else if (p.moveTarget) {
        // ── Target mode: path following at constant speed ──
        const speed = balance.movement.playerSpeed;

        // Compute path if needed
        if (!p.path || p.pathIndex >= (p.path?.length || 0)) {
          if (instance.navGrid) {
            const rawPath = findPath(instance.navGrid, p.x, p.z, p.moveTarget.x, p.moveTarget.z);
            if (rawPath && rawPath.length > 0) {
              p.path = smoothPath(instance.navGrid, rawPath);
              p.pathIndex = 0;
            } else {
              // Path not found — stop
              p.moveTarget = null;
              p.path = null;
              p.pendingInteraction = null;
            }
          } else {
            // No navgrid — move directly
            p.path = [{ x: p.moveTarget.x, z: p.moveTarget.z }];
            p.pathIndex = 0;
          }
        }

        if (p.path && p.pathIndex < p.path.length) {
          const waypoint = p.path[p.pathIndex];
          const ddx = waypoint.x - p.x;
          const ddz = waypoint.z - p.z;
          const dist = Math.sqrt(ddx * ddx + ddz * ddz);

          if (dist < 0.5) {
            p.pathIndex++;
            if (p.pathIndex >= p.path.length) {
              p.vx = 0; p.vz = 0;
              if (p.pendingInteraction) {
                executePendingInteraction(p, io);
              } else {
                io.to(p.id).emit('moveCompleted', {});
              }
              p.moveTarget = null;
              p.path = null;
              p.pathIndex = 0;
            }
          } else {
            const moveAmount = speed * tickTimeSec;
            const step = Math.min(moveAmount, dist);
            const nx = p.x + (ddx / dist) * step;
            const nz = p.z + (ddz / dist) * step;

            // Navgrid validation
            let canMove = true;
            if (instance.navGrid) {
              const cell = getCellAtWorld(instance.navGrid, nx, nz);
              canMove = cell ? cell.walkable : false;
            }
            if (canMove) {
              p.x = nx;
              p.z = nz;
              p.vx = (ddx / dist) * speed;
              p.vz = (ddz / dist) * speed;
            } else {
              // Hit wall — recompute path next tick
              p.path = null;
              p.pathIndex = 0;
            }
          }
        } else {
          p.vx = 0; p.vz = 0;
        }

        const halfW = instance.config.dimensions.width / 2;
        const halfH = instance.config.dimensions.height / 2;
        p.x = Math.max(-halfW, Math.min(halfW, p.x));
        p.z = Math.max(-halfH, Math.min(halfH, p.z));
      } else {
        // ── No input — decelerate ──
        const frictionFactor = Math.min(1, 10 * tickTimeSec);
        p.vx -= p.vx * frictionFactor;
        p.vz -= p.vz * frictionFactor;
        if (Math.abs(p.vx) < 0.001) p.vx = 0;
        if (Math.abs(p.vz) < 0.001) p.vz = 0;
      }

      // Regen
      if (tickNum % regenIntervalTicks === 0) {
        if (mapManager.isInSafeZone(mapId, p.x, p.z)) {
          if (p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + balance.regen.amountPerTick * 3);
          if (p.sp < p.maxSp) {
            const spRegen = applySpRegenPassive(balance.regen.amountPerTick * 3, p.jobClass, jobs as JobClass[]);
            p.sp = Math.min(p.maxSp, p.sp + spRegen);
          }
        } else {
          if (p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + balance.regen.amountPerTick);
          if (p.sp < p.maxSp) {
            const spRegen = applySpRegenPassive(balance.regen.amountPerTick, p.jobClass, jobs as JobClass[]);
            p.sp = Math.min(p.maxSp, p.sp + spRegen);
          }
        }
      }
    }

    // ── Enemy respawn ──
    mapManager.tickEnemies(mapId, now, (enemy) => {
      io.to(mapId).emit('enemyRespawned', {
        id: enemy.id,
        name: enemy.name,
        hp: enemy.hp,
        maxHp: enemy.maxHp,
        level: enemy.level,
        position: enemy.position,
        isDead: false,
      });
    });

    // ── Chest respawn ──
    {
      const state = getChestState(mapId);
      const reopened: string[] = [];
      for (const [chestId, respawnAt] of Array.from(state.entries())) {
        if (now >= respawnAt) {
          state.delete(chestId);
          reopened.push(chestId);
        }
      }
      if (reopened.length > 0) {
        io.to(mapId).emit('chestRespawned', { chestIds: reopened });
      }
    }

    // ── Mob AI ──
    mapManager.tickMobAI(mapId, now, tickTimeSec, (enemy, playerSocketId) => {
      const targetPlayer = instance.players.get(playerSocketId);
      if (!targetPlayer) return;

      // Enemy damage formula: enemy.attackDamage - player DEF (capped at 30% min)
      const defReduction = balance.combat.damageReduction;
      const playerDef = calculateDef(targetPlayer.stats.vit ?? 0);
      const reduction = playerDef * (defReduction?.defMultiplier ?? 0.6);
      const minDmg = enemy.attackDamage * (defReduction?.minDamagePct ?? 0.3);
      const variance = Math.floor(Math.random() * 3) - 1;
      const damage = Math.max(1, Math.floor(Math.max(minDmg, enemy.attackDamage - reduction) + variance));

      targetPlayer.hp = Math.max(0, targetPlayer.hp - damage);

      io.to(playerSocketId).emit('playerDamaged', {
        enemyId: enemy.id,
        enemyName: enemy.name,
        damage,
        hp: targetPlayer.hp,
        maxHp: targetPlayer.maxHp,
        isDead: targetPlayer.hp === 0,
      });

      if (targetPlayer.hp === 0) {
        // ── Death penalty: EXP loss ──
        const expLoss = calculateDeathExpLoss(targetPlayer.baseLevel, targetPlayer.baseExp, balance);
        if (expLoss > 0) {
          targetPlayer.baseExp = Math.max(0, targetPlayer.baseExp - expLoss);
        }

        const halfW = instance.config.dimensions.width / 4;
        const halfH = instance.config.dimensions.height / 4;
        const spawnPoint = instance.config.spawnPoints[0];
        if (spawnPoint) {
          targetPlayer.x = spawnPoint.position.x;
          targetPlayer.y = spawnPoint.position.y;
          targetPlayer.z = spawnPoint.position.z;
        } else {
          targetPlayer.x = (Math.random() - 0.5) * halfW;
          targetPlayer.z = (Math.random() - 0.5) * halfH;
        }
        targetPlayer.hp = targetPlayer.maxHp;
        targetPlayer.sp = targetPlayer.maxSp;

        io.to(playerSocketId).emit('playerDied', {
          respawnPosition: { x: targetPlayer.x, y: targetPlayer.y, z: targetPlayer.z },
          expLost: expLoss,
        });

        enemy.aiState = 'return';
        enemy.targetPlayerId = null;
      }
    });

    // ── Build snapshots ──
    const isFullTick = tickNum % balance.server.fullSnapshotInterval === 0;

    // Emit ground effect updates
    const activeGroundEffects = skillEngine.getGroundEffectManager().getActiveEffects();
    if (activeGroundEffects.length > 0 || isFullTick) {
      io.to(mapId).emit('groundEffectsUpdate', activeGroundEffects.map(ge => ({
        id: ge.id,
        definitionId: ge.definitionId,
        casterId: ge.casterId,
        x: ge.x,
        z: ge.z,
        createdAt: ge.createdAt,
        expiresAt: ge.expiresAt,
        angle: ge.angle,
        length: ge.length,
      })));
    }

    // Emit buff updates for players
    for (const [socketId, p] of instance.players) {
      const buffs = skillEngine.getBuffManager().getBuffsByTarget(socketId);
      if (buffs.length > 0 || isFullTick) {
        io.to(socketId).emit('buffsUpdate', buffs.map(b => ({
          id: b.id,
          buffId: b.buffId,
          stacks: b.stacks,
          expiresAt: b.expiresAt,
          isDebuff: b.isDebuff,
          icon: b.icon,
          color: b.color,
        })));
      }
    }

    if (isFullTick) {
      const full: WorldSnapshot = { tick: tickNum, players: {}, enemies: {} };
      for (const [id, p] of instance.players) {
        const isMoving = p.vx !== 0 || p.vz !== 0;
        const snap: SnapshotPlayer = { x: p.x, y: p.y, z: p.z, hp: p.hp, maxHp: p.maxHp, sp: p.sp, maxSp: p.maxSp, lastProcessedSeq: p.lastProcessedSeq, vx: p.vx, vz: p.vz, moving: isMoving };
        full.players[id] = snap;
        p.lastSentSnapshot = snap;
      }
      for (const [id, e] of instance.enemies) {
        full.enemies[id] = { hp: e.hp, maxHp: e.maxHp, isDead: e.isDead, position: { x: e.position.x, y: e.position.y, z: e.position.z }, name: e.name, level: e.level };
      }
      io.to(mapId).emit('worldSnapshot', full);
    } else {
      for (const [socketId, p] of instance.players) {
        const snap: WorldSnapshot = { tick: tickNum, players: {}, enemies: {} };

        const isMoving = p.vx !== 0 || p.vz !== 0;
        const selfSnap: SnapshotPlayer = { x: p.x, y: p.y, z: p.z, hp: p.hp, maxHp: p.maxHp, sp: p.sp, maxSp: p.maxSp, lastProcessedSeq: p.lastProcessedSeq, vx: p.vx, vz: p.vz, moving: isMoving };
        snap.players[socketId] = selfSnap;
        p.lastSentSnapshot = selfSnap;

        for (const [otherId, other] of instance.players) {
          if (otherId === socketId) continue;
          if (distSq(p, other) > balance.network.interestRange * balance.network.interestRange) continue;
          const otherMoving = other.vx !== 0 || other.vz !== 0;
          const otherSnap: SnapshotPlayer = { x: other.x, y: other.y, z: other.z, hp: other.hp, maxHp: other.maxHp, sp: other.sp, maxSp: other.maxSp, vx: other.vx, vz: other.vz, moving: otherMoving };
          if (!other.lastSentSnapshot || snapshotPlayerChanged(other.lastSentSnapshot, otherSnap)) {
            snap.players[otherId] = otherSnap;
          }
          other.lastSentSnapshot = otherSnap;
        }

        for (const [id, e] of instance.enemies) {
          if (e.isDead) continue;
          if (distSq(p, e.position) > balance.network.interestRange * balance.network.interestRange) continue;
          snap.enemies[id] = { hp: e.hp, maxHp: e.maxHp, isDead: e.isDead, position: { x: e.position.x, y: e.position.y, z: e.position.z }, name: e.name, level: e.level };
        }

        io.to(socketId).emit('worldSnapshot', snap);
      }
    }
  }
}

setInterval(() => {
  if (ticking) return;
  ticking = true;
  try { tick(); } finally { ticking = false; }
}, balance.server.tickRateMs);

httpServer.listen(GAME_PORT, () => {
  console.log(`[GameServer] listening on port ${GAME_PORT} | ${1000 / balance.server.tickRateMs} tps`);
  console.log(`[GameServer] Maps loaded: ${mapManager.getAllMaps().size}`);
  for (const [id, instance] of mapManager.getAllMaps()) {
    console.log(`  - ${instance.config.name} (${id}) [${instance.config.type}]`);
  }
  console.log(`[GameServer] Data: ${enemyData.templates.length} enemy templates, ${skills.length} skills, ${items.length} items, ${jobs.length} jobs`);
});
