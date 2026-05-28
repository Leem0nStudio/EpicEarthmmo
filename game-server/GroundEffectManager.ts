import type { GroundEffectDefinition, EffectDefinition } from '../shared/schemas';
import { GridSpatialIndex, type SpatialEntity } from '../lib/spatialQuery';

export interface ActiveGroundEffect {
  id: string;
  definitionId: string;
  casterId: string;
  x: number;
  z: number;
  createdAt: number;
  expiresAt: number;
  lastTickAt: number;
  angle?: number;
  length?: number;
}

export interface GroundEffectTarget {
  id: string;
  x: number;
  z: number;
  isAlly: boolean;
}

export class GroundEffectManager {
  private effects = new Map<string, ActiveGroundEffect>();
  private definitions = new Map<string, GroundEffectDefinition>();
  private spatialIndex = new GridSpatialIndex(5);
  private effectIdCounter = 0;

  registerDefinition(def: GroundEffectDefinition): void {
    this.definitions.set(def.id, def);
  }

  createGroundEffect(
    definitionId: string,
    casterId: string,
    x: number,
    z: number,
    angle?: number,
    length?: number,
  ): ActiveGroundEffect | null {
    const def = this.definitions.get(definitionId);
    if (!def) return null;

    const now = Date.now();
    const id = `ge_${this.effectIdCounter++}_${now}`;

    const effect: ActiveGroundEffect = {
      id,
      definitionId,
      casterId,
      x,
      z,
      createdAt: now,
      expiresAt: now + def.durationMs,
      lastTickAt: now,
      angle,
      length,
    };

    this.effects.set(id, effect);
    return effect;
  }

  removeEffect(id: string): void {
    this.effects.delete(id);
  }

  tick(
    now: number,
    targets: GroundEffectTarget[],
    onEffect: (targetId: string, effect: EffectDefinition, casterId: string) => void,
  ): Array<{ id: string; expired: boolean }> {
    const results: Array<{ id: string; expired: boolean }> = [];

    for (const [id, effect] of this.effects) {
      if (now >= effect.expiresAt) {
        this.effects.delete(id);
        results.push({ id, expired: true });
        continue;
      }

      const def = this.definitions.get(effect.definitionId);
      if (!def) continue;

      const timeSinceLastTick = now - effect.lastTickAt;
      if (timeSinceLastTick < def.tickIntervalMs) {
        results.push({ id, expired: false });
        continue;
      }

      effect.lastTickAt = now;

      const affected = this.getAffectedTargets(effect, def, targets);

      for (const target of affected) {
        const shouldAffect = (target.isAlly && def.targetAllies) || (!target.isAlly && def.targetEnemies);
        if (!shouldAffect) continue;

        for (const effectDef of def.effects) {
          onEffect(target.id, effectDef, effect.casterId);
        }
      }

      results.push({ id, expired: false });
    }

    return results;
  }

  private getAffectedTargets(
    effect: ActiveGroundEffect,
    def: GroundEffectDefinition,
    targets: GroundEffectTarget[],
  ): GroundEffectTarget[] {
    const affected: GroundEffectTarget[] = [];

    for (const target of targets) {
      const dx = target.x - effect.x;
      const dz = target.z - effect.z;

      switch (def.shape) {
        case 'circle': {
          const distSq = dx * dx + dz * dz;
          if (distSq <= def.radius * def.radius) affected.push(target);
          break;
        }
        case 'square': {
          if (Math.abs(dx) <= def.radius && Math.abs(dz) <= def.radius) affected.push(target);
          break;
        }
        case 'cone': {
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist > def.radius) continue;
          const dirX = effect.angle !== undefined ? Math.cos(effect.angle) : 0;
          const dirZ = effect.angle !== undefined ? Math.sin(effect.angle) : 1;
          const dirLen = Math.sqrt(dirX * dirX + dirZ * dirZ);
          if (dirLen === 0) continue;
          const dot = (dx * dirX + dz * dirZ) / (dist * dirLen);
          const halfAngle = Math.PI / 4;
          if (dot >= Math.cos(halfAngle)) affected.push(target);
          break;
        }
        case 'line': {
          const len = effect.length ?? def.radius * 2;
          const dirX = effect.angle !== undefined ? Math.cos(effect.angle) : 0;
          const dirZ = effect.angle !== undefined ? Math.sin(effect.angle) : 1;
          const proj = dx * dirX + dz * dirZ;
          if (proj < 0 || proj > len) continue;
          const perpDist = Math.abs(dx * dirZ - dz * dirX);
          if (perpDist <= def.radius) affected.push(target);
          break;
        }
      }
    }

    return affected;
  }

  getActiveEffects(): ActiveGroundEffect[] {
    return Array.from(this.effects.values());
  }

  getEffectById(id: string): ActiveGroundEffect | undefined {
    return this.effects.get(id);
  }

  clear(): void {
    this.effects.clear();
  }
}
