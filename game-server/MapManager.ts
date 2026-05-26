import type { MapConfig, Warp, EnemyArea, SafeZone, EnemyTemplate, MapSpawnPoint, MapDecoration, SafeZone as SafeZoneType, NavGrid } from '../shared/schemas';
import type { ServerPlayer } from './types';

export type MobAIState = 'idle' | 'patrol' | 'chase' | 'attack' | 'return';
export type MobBehavior = 'passive' | 'aggressive' | 'assist';

export interface RuntimeEnemy {
  id: string;
  spawnId: string;
  name: string;
  hp: number;
  maxHp: number;
  level: number;
  position: { x: number; y: number; z: number };
  isDead: boolean;
  deathTime?: number;
  respawnTime?: number;
  templateId: string;
  areaCenter: { x: number; z: number };
  areaRadius: number;
  respawnSeconds: number;
  behavior: MobBehavior;
  aiState: MobAIState;
  targetPlayerId: string | null;
  agroRange: number;
  attackRange: number;
  attackDamage: number;
  attackCooldownMs: number;
  lastAttackTime: number;
  moveSpeed: number;
  patrolTarget: { x: number; z: number } | null;
  patrolPauseUntil: number;
  patrolPauseMs: number;
  homePosition: { x: number; z: number };
  wasProvoked: boolean;
  provokedUntil: number;
}

export interface MapInstance {
  config: MapConfig;
  players: Map<string, ServerPlayer>;
  enemies: Map<string, RuntimeEnemy>;
  enemyIdCounter: number;
  navGrid: NavGrid | null;
}

export class MapManager {
  private maps = new Map<string, MapInstance>();
  private enemyTemplates = new Map<string, EnemyTemplate>();

  registerEnemyTemplate(template: EnemyTemplate) {
    this.enemyTemplates.set(template.id, template);
  }

  loadMap(config: MapConfig) {
    if (this.maps.has(config.id)) {
      console.warn(`[MapManager] Map ${config.id} already loaded, skipping`);
      return;
    }

    const instance: MapInstance = {
      config,
      players: new Map(),
      enemies: new Map(),
      enemyIdCounter: 0,
      navGrid: config.navGrid ?? null,
    };

    this.spawnEnemies(instance);
    this.maps.set(config.id, instance);
    console.log(`[MapManager] Loaded map: ${config.name} (${config.id}) [${config.type}]`);
  }

  private spawnEnemies(instance: MapInstance) {
    for (const area of instance.config.enemyAreas) {
      const template = this.enemyTemplates.get(area.enemyId);
      if (!template) {
        console.warn(`[MapManager] Enemy template "${area.enemyId}" not found for map ${instance.config.id}`);
        continue;
      }

      for (let i = 0; i < area.count; i++) {
        const pos = this.randomPositionInCircle(area.center, area.radius);
        const enemyId = `${instance.config.id}_enemy_${instance.enemyIdCounter++}`;

        instance.enemies.set(enemyId, {
          id: enemyId,
          spawnId: enemyId,
          name: template.name,
          hp: template.hp,
          maxHp: template.hp,
          level: template.level,
          position: { x: pos.x, y: 0.5, z: pos.z },
          isDead: false,
          templateId: template.id,
          areaCenter: { ...area.center },
          areaRadius: area.radius,
          respawnSeconds: area.respawnSeconds,
          behavior: template.behavior,
          aiState: 'idle',
          targetPlayerId: null,
          agroRange: template.agroRange,
          attackRange: template.attackRange,
          attackDamage: template.attackDamage,
          attackCooldownMs: template.attackCooldownMs,
          lastAttackTime: 0,
          moveSpeed: template.moveSpeed,
          patrolPauseMs: template.patrolPauseMs,
          patrolTarget: null,
          patrolPauseUntil: 0,
          homePosition: { x: pos.x, z: pos.z },
          wasProvoked: false,
          provokedUntil: 0,
        });
      }
    }
  }

  private randomPositionInCircle(center: { x: number; z: number }, radius: number): { x: number; z: number } {
    const angle = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * radius;
    return {
      x: center.x + Math.cos(angle) * r,
      z: center.z + Math.sin(angle) * r,
    };
  }

  getMap(mapId: string): MapInstance | undefined {
    return this.maps.get(mapId);
  }

  getAllMaps(): Map<string, MapInstance> {
    return this.maps;
  }

  getPlayerMap(socketId: string): { mapId: string; instance: MapInstance } | null {
    for (const [mapId, instance] of this.maps) {
      if (instance.players.has(socketId)) {
        return { mapId, instance };
      }
    }
    return null;
  }

  addPlayerToMap(socketId: string, player: ServerPlayer, mapId: string, spawnId: string = 'main') {
    const instance = this.maps.get(mapId);
    if (!instance) {
      console.error(`[MapManager] Map ${mapId} not found`);
      return false;
    }

    const spawnPoint = instance.config.spawnPoints.find((sp: MapSpawnPoint) => sp.id === spawnId);
    if (spawnPoint) {
      player.x = spawnPoint.position.x;
      player.y = spawnPoint.position.y;
      player.z = spawnPoint.position.z;
    }

    instance.players.set(socketId, player);
    return true;
  }

  removePlayerFromMap(socketId: string): { mapId: string; instance: MapInstance } | null {
    const result = this.getPlayerMap(socketId);
    if (result) {
      result.instance.players.delete(socketId);
    }
    return result;
  }

  findWarp(mapId: string, warpId: string): Warp | null {
    const instance = this.maps.get(mapId);
    if (!instance) return null;
    return instance.config.warps.find(w => w.id === warpId) ?? null;
  }

  findWarpByProximity(mapId: string, playerX: number, playerZ: number, range: number = 2.0): Warp | null {
    const instance = this.maps.get(mapId);
    if (!instance) return null;

    for (const warp of instance.config.warps) {
      const dx = warp.position.x - playerX;
      const dz = warp.position.z - playerZ;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist <= range) {
        return warp;
      }
    }
    return null;
  }

  isInSafeZone(mapId: string, x: number, z: number): boolean {
    const instance = this.maps.get(mapId);
    if (!instance) return false;

    for (const zone of instance.config.safeZones) {
      const dx = zone.center.x - x;
      const dz = zone.center.z - z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist <= zone.radius) {
        return true;
      }
    }
    return false;
  }

  getMapInitData(mapId: string) {
    const instance = this.maps.get(mapId);
    if (!instance) return null;

    const { config } = instance;

    return {
      mapId: config.id,
      mapName: config.name,
      mapType: config.type,
      dimensions: config.dimensions,
      spawnPoints: config.spawnPoints.map((sp: MapSpawnPoint) => ({
        id: sp.id,
        position: sp.position,
        label: sp.label,
      })),
      warps: config.warps.map((w: Warp) => ({
        id: w.id,
        name: w.name,
        position: w.position,
        targetMapName: this.maps.get(w.targetMapId)?.config.name ?? w.targetMapId,
        visual: w.visual,
      })),
      safeZones: config.safeZones.map((sz: SafeZoneType) => ({
        id: sz.id,
        center: sz.center,
        radius: sz.radius,
        name: sz.name,
      })),
      decorations: config.decorations.map((d: MapDecoration) => ({
        position: d.position,
        type: d.type,
        scale: d.scale,
        hasCollision: d.hasCollision,
        lodNear: d.lodNear,
        lodFar: d.lodFar,
        layer: d.layer,
      })),
      tiles: config.tiles ?? [],
      navGrid: config.navGrid ?? null,
      regions: config.regions ?? [],
      triggers: config.triggers ?? [],
      bakedLighting: config.bakedLighting,
      colliders: config.colliders ?? [],
      grassTuftCount: config.grassTuftCount,
      grassTexture: config.grassTexture,
      floorColor: config.floorColor,
      chests: config.chests ?? [],
    };
  }

  getMapEnemies(mapId: string) {
    const instance = this.maps.get(mapId);
    if (!instance) return {};

    const result: Record<string, any> = {};
    for (const [id, e] of instance.enemies) {
      result[id] = {
        id: e.id,
        name: e.name,
        hp: e.hp,
        maxHp: e.maxHp,
        level: e.level,
        position: e.position,
        isDead: e.isDead,
      };
    }
    return result;
  }

  getMapPlayers(mapId: string) {
    const instance = this.maps.get(mapId);
    if (!instance) return {};

    const result: Record<string, any> = {};
    for (const [id, p] of instance.players) {
      result[id] = {
        id: p.id,
        x: p.x,
        y: p.y,
        z: p.z,
        name: p.name,
      };
    }
    return result;
  }

  tickEnemies(mapId: string, now: number, onEnemyRespawn: (enemy: RuntimeEnemy) => void) {
    const instance = this.maps.get(mapId);
    if (!instance) return;

    for (const enemy of instance.enemies.values()) {
      if (enemy.isDead && enemy.deathTime) {
        const respawnMs = enemy.respawnSeconds * 1000;
        if (now - enemy.deathTime > respawnMs) {
          const template = this.enemyTemplates.get(enemy.templateId);
          if (template) {
            enemy.hp = template.hp;
            enemy.maxHp = template.hp;
          }
          enemy.isDead = false;
          enemy.respawnTime = now;
          enemy.aiState = 'idle';
          enemy.targetPlayerId = null;
          enemy.wasProvoked = false;
          enemy.provokedUntil = 0;
          delete enemy.deathTime;

          const newPos = this.randomPositionInCircle(enemy.areaCenter, enemy.areaRadius);
          enemy.position.x = newPos.x;
          enemy.position.z = newPos.z;
          enemy.homePosition = { x: newPos.x, z: newPos.z };

          onEnemyRespawn(enemy);
        }
      }
    }
  }

  tickMobAI(mapId: string, now: number, tickTimeSec: number, onMobAttack: (enemy: RuntimeEnemy, playerSocketId: string) => void) {
    const instance = this.maps.get(mapId);
    if (!instance) return;

    for (const enemy of instance.enemies.values()) {
      if (enemy.isDead) continue;
      if (enemy.respawnTime && now - enemy.respawnTime < 1000) continue;

      const distFromHome = this.dist2D(enemy.position.x, enemy.position.z, enemy.homePosition.x, enemy.homePosition.z);
      const deaggroRange = 20;

      switch (enemy.aiState) {
        case 'idle': {
          if (now < enemy.patrolPauseUntil) break;

          const newTarget = this.randomPositionInCircle(
            { x: enemy.areaCenter.x, z: enemy.areaCenter.z },
            enemy.areaRadius * 0.7
          );
          enemy.patrolTarget = newTarget;
          enemy.aiState = 'patrol';
          break;
        }

        case 'patrol': {
          if (!enemy.patrolTarget) {
            enemy.aiState = 'idle';
            enemy.patrolPauseUntil = now + enemy.patrolPauseMs;
            break;
          }

          const dx = enemy.patrolTarget.x - enemy.position.x;
          const dz = enemy.patrolTarget.z - enemy.position.z;
          const distToTarget = Math.sqrt(dx * dx + dz * dz);

          if (distToTarget < 0.5) {
            enemy.patrolTarget = null;
            enemy.aiState = 'idle';
            enemy.patrolPauseUntil = now + enemy.patrolPauseMs + Math.random() * 1000;
            break;
          }

          const moveX = (dx / distToTarget) * enemy.moveSpeed * tickTimeSec;
          const moveZ = (dz / distToTarget) * enemy.moveSpeed * tickTimeSec;
          enemy.position.x += moveX;
          enemy.position.z += moveZ;
          enemy.position.x = Math.max(-instance.config.dimensions.width / 2, Math.min(instance.config.dimensions.width / 2, enemy.position.x));
          enemy.position.z = Math.max(-instance.config.dimensions.height / 2, Math.min(instance.config.dimensions.height / 2, enemy.position.z));
          break;
        }

        case 'chase': {
          if (!enemy.targetPlayerId || !instance.players.has(enemy.targetPlayerId)) {
            enemy.aiState = 'return';
            enemy.targetPlayerId = null;
            break;
          }

          const target = instance.players.get(enemy.targetPlayerId)!;

          if (distFromHome > deaggroRange || this.isInSafeZone(mapId, target.x, target.z)) {
            enemy.aiState = 'return';
            enemy.targetPlayerId = null;
            break;
          }

          const dx = target.x - enemy.position.x;
          const dz = target.z - enemy.position.z;
          const distToPlayer = Math.sqrt(dx * dx + dz * dz);

          if (distToPlayer <= enemy.attackRange) {
            enemy.aiState = 'attack';
            break;
          }

          const moveX = (dx / distToPlayer) * enemy.moveSpeed * tickTimeSec;
          const moveZ = (dz / distToPlayer) * enemy.moveSpeed * tickTimeSec;
          enemy.position.x += moveX;
          enemy.position.z += moveZ;
          enemy.position.x = Math.max(-instance.config.dimensions.width / 2, Math.min(instance.config.dimensions.width / 2, enemy.position.x));
          enemy.position.z = Math.max(-instance.config.dimensions.height / 2, Math.min(instance.config.dimensions.height / 2, enemy.position.z));
          break;
        }

        case 'attack': {
          if (!enemy.targetPlayerId || !instance.players.has(enemy.targetPlayerId)) {
            enemy.aiState = 'return';
            enemy.targetPlayerId = null;
            break;
          }

          const target = instance.players.get(enemy.targetPlayerId)!;

          if (distFromHome > deaggroRange || this.isInSafeZone(mapId, target.x, target.z)) {
            enemy.aiState = 'return';
            enemy.targetPlayerId = null;
            break;
          }

          const dx = target.x - enemy.position.x;
          const dz = target.z - enemy.position.z;
          const distToPlayer = Math.sqrt(dx * dx + dz * dz);

          if (distToPlayer > enemy.attackRange * 1.5) {
            enemy.aiState = 'chase';
            break;
          }

          if (now - enemy.lastAttackTime >= enemy.attackCooldownMs) {
            enemy.lastAttackTime = now;
            onMobAttack(enemy, enemy.targetPlayerId);
          }
          break;
        }

        case 'return': {
          const dx = enemy.homePosition.x - enemy.position.x;
          const dz = enemy.homePosition.z - enemy.position.z;
          const distToHome = Math.sqrt(dx * dx + dz * dz);

          if (distToHome < 1.0) {
            enemy.aiState = 'idle';
            enemy.patrolPauseUntil = now + 1000;
            break;
          }

          const returnSpeed = enemy.moveSpeed * 1.5;
          const moveX = (dx / distToHome) * returnSpeed * tickTimeSec;
          const moveZ = (dz / distToHome) * returnSpeed * tickTimeSec;
          enemy.position.x += moveX;
          enemy.position.z += moveZ;
          break;
        }
      }

      if (enemy.aiState !== 'chase' && enemy.aiState !== 'attack' && enemy.aiState !== 'return') {
        this.checkAgro(enemy, instance, now, mapId);
      }
    }
  }

  private checkAgro(enemy: RuntimeEnemy, instance: MapInstance, now: number, mapId: string) {
    if (enemy.behavior === 'passive' && !enemy.wasProvoked) return;
    if (enemy.wasProvoked && now > enemy.provokedUntil) {
      enemy.wasProvoked = false;
    }

    let closestPlayer: { socketId: string; dist: number } | null = null;

    for (const [socketId, player] of instance.players) {
      if (this.isInSafeZone(mapId, player.x, player.z)) continue;

      const dx = player.x - enemy.position.x;
      const dz = player.z - enemy.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      let effectiveAgro = enemy.agroRange;

      if (enemy.behavior === 'assist') {
        for (const otherEnemy of instance.enemies.values()) {
          if (otherEnemy.id === enemy.id || otherEnemy.isDead) continue;
          if (otherEnemy.templateId !== enemy.templateId) continue;
          if (otherEnemy.aiState === 'chase' || otherEnemy.aiState === 'attack') {
            const distToOther = this.dist2D(enemy.position.x, enemy.position.z, otherEnemy.position.x, otherEnemy.position.z);
            if (distToOther < 8) {
              effectiveAgro = Math.max(effectiveAgro, 12);
            }
          }
        }
      }

      if (dist <= effectiveAgro) {
        if (!closestPlayer || dist < closestPlayer.dist) {
          closestPlayer = { socketId, dist };
        }
      }
    }

    if (closestPlayer) {
      enemy.targetPlayerId = closestPlayer.socketId;
      enemy.aiState = 'chase';
    }
  }

  provokeEnemy(enemy: RuntimeEnemy, playerSocketId: string, now: number) {
    enemy.wasProvoked = true;
    enemy.provokedUntil = now + 8000;
    enemy.targetPlayerId = playerSocketId;
    enemy.aiState = 'chase';
  }

  private dist2D(x1: number, z1: number, x2: number, z2: number): number {
    const dx = x1 - x2;
    const dz = z1 - z2;
    return Math.sqrt(dx * dx + dz * dz);
  }

  getEnemy(mapId: string, enemyId: string): RuntimeEnemy | undefined {
    const instance = this.maps.get(mapId);
    if (!instance) return undefined;
    return instance.enemies.get(enemyId);
  }

  getEnemyDrops(templateId: string) {
    const template = this.enemyTemplates.get(templateId);
    return template?.drops ?? [];
  }
}
