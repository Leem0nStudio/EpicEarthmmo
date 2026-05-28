import type { BuffDefinition, StatModifier, BehaviorModifier, EffectDefinition } from '../shared/schemas';

export interface ActiveBuff {
  id: string;
  buffId: string;
  sourceId: string;
  stacks: number;
  appliedAt: number;
  expiresAt: number;
  durationMs: number;
  statModifiers: StatModifier[];
  behaviorModifiers: BehaviorModifier[];
  onTick?: EffectDefinition[];
  onExpire?: EffectDefinition[];
}

export interface BuffableEntity {
  id: string;
  stats?: Record<string, number>;
  hp?: number;
  maxHp?: number;
  sp?: number;
  maxSp?: number;
  position: { x: number; y: number; z: number };
  isAlive?: boolean;
}

export class BuffManager {
  private buffs = new Map<string, ActiveBuff[]>();
  private definitions = new Map<string, BuffDefinition>();
  private now = 0;

  registerDefinition(def: BuffDefinition): void {
    this.definitions.set(def.id, def);
  }

  getDefinition(id: string): BuffDefinition | undefined {
    return this.definitions.get(id);
  }

  tick(now: number, entities: Map<string, BuffableEntity>, onEffect: (targetId: string, effect: EffectDefinition, sourceId: string) => void): void {
    this.now = now;

    for (const [entityId, entityBuffs] of this.buffs) {
      const expired: ActiveBuff[] = [];
      const remaining: ActiveBuff[] = [];

      for (const buff of entityBuffs) {
        if (now >= buff.expiresAt) {
          expired.push(buff);
        } else {
          remaining.push(buff);
          if (buff.onTick && buff.onTick.length > 0) {
            const timeSinceApplied = now - buff.appliedAt;
            const tickCount = Math.floor(timeSinceApplied / 1000);
            const lastTickCount = Math.floor((timeSinceApplied - 50) / 1000);
            if (tickCount > lastTickCount) {
              for (const effect of buff.onTick) {
                onEffect(entityId, effect, buff.sourceId);
              }
            }
          }
        }
      }

      for (const buff of expired) {
        if (buff.onExpire) {
          for (const effect of buff.onExpire) {
            onEffect(entityId, effect, buff.sourceId);
          }
        }
      }

      if (remaining.length === 0) {
        this.buffs.delete(entityId);
      } else {
        this.buffs.set(entityId, remaining);
      }
    }
  }

  applyBuff(entityId: string, buffId: string, sourceId: string, durationOverride?: number): ActiveBuff | null {
    const def = this.definitions.get(buffId);
    if (!def) return null;

    const duration = durationOverride ?? def.durationMs;
    const now = this.now || Date.now();
    const existingBuffs = this.buffs.get(entityId) ?? [];

    const existing = existingBuffs.find(b => b.buffId === buffId && b.sourceId === sourceId);

    if (existing) {
      switch (def.stackRule) {
        case 'replace':
          existing.expiresAt = now + duration;
          existing.durationMs = duration;
          return existing;

        case 'refresh':
          existing.expiresAt = now + duration;
          existing.durationMs = duration;
          existing.stacks = Math.min(existing.stacks + 1, def.stackLimit);
          return existing;

        case 'stack':
          if (existing.stacks < def.stackLimit) {
            existing.stacks++;
            existing.expiresAt = now + duration;
            existing.durationMs = duration;
          } else {
            existing.expiresAt = now + duration;
          }
          return existing;

        case 'immune':
          return null;

        case 'diminishing':
          const drFactor = Math.pow(1 - def.drReductionPerStack, existing.stacks);
          existing.expiresAt = now + duration * drFactor;
          existing.durationMs = duration * drFactor;
          existing.stacks = Math.min(existing.stacks + 1, def.stackLimit);
          return existing;
      }
    }

    if (existingBuffs.length > 0) {
      for (const eb of existingBuffs) {
        const ebDef = this.definitions.get(eb.buffId);
        if (ebDef?.immunityTo?.includes(buffId)) return null;
      }
    }

    const newBuff: ActiveBuff = {
      id: `${entityId}_${buffId}_${sourceId}_${now}`,
      buffId,
      sourceId,
      stacks: 1,
      appliedAt: now,
      expiresAt: now + duration,
      durationMs: duration,
      statModifiers: def.statModifiers ?? [],
      behaviorModifiers: def.behaviorModifiers ?? [],
      onTick: def.onTick,
      onExpire: def.onExpire,
    };

    existingBuffs.push(newBuff);
    this.buffs.set(entityId, existingBuffs);
    return newBuff;
  }

  removeBuff(entityId: string, buffId: string): void {
    const entityBuffs = this.buffs.get(entityId);
    if (!entityBuffs) return;
    const filtered = entityBuffs.filter(b => b.buffId !== buffId);
    if (filtered.length === 0) {
      this.buffs.delete(entityId);
    } else {
      this.buffs.set(entityId, filtered);
    }
  }

  getBuffs(entityId: string): ActiveBuff[] {
    return this.buffs.get(entityId) ?? [];
  }

  hasBuff(entityId: string, buffId: string): boolean {
    return (this.buffs.get(entityId) ?? []).some(b => b.buffId === buffId);
  }

  hasBehavior(entityId: string, behaviorType: string): boolean {
    return (this.buffs.get(entityId) ?? []).some(b =>
      b.behaviorModifiers.some(m => m.type === behaviorType && Date.now() < b.expiresAt)
    );
  }

  getBehaviorDuration(entityId: string, behaviorType: string): number {
    const buffs = this.buffs.get(entityId) ?? [];
    let maxDuration = 0;
    for (const b of buffs) {
      for (const m of b.behaviorModifiers) {
        if (m.type === behaviorType) {
          const remaining = b.expiresAt - (this.now || Date.now());
          if (remaining > maxDuration) maxDuration = remaining;
        }
      }
    }
    return maxDuration;
  }

  getModifiedStats(entityId: string, baseStats: Record<string, number>): Record<string, number> {
    const result = { ...baseStats };
    const buffs = this.buffs.get(entityId) ?? [];

    for (const buff of buffs) {
      for (const mod of buff.statModifiers) {
        const current = result[mod.stat] ?? 0;
        result[mod.stat] = current + mod.flat + current * (mod.percent / 100);
      }
    }

    return result;
  }

  getActiveBuffData(entityId: string): Array<{ id: string; buffId: string; stacks: number; expiresAt: number; isDebuff: boolean; icon?: string; color: string }> {
    const buffs = this.buffs.get(entityId) ?? [];
    return buffs.map(b => {
      const def = this.definitions.get(b.buffId);
      return {
        id: b.id,
        buffId: b.buffId,
        stacks: b.stacks,
        expiresAt: b.expiresAt,
        isDebuff: def?.isDebuff ?? false,
        icon: def?.icon,
        color: def?.color ?? '#ffffff',
      };
    });
  }

  getBuffsByTarget(entityId: string): Array<{ id: string; buffId: string; stacks: number; expiresAt: number; isDebuff: boolean; icon?: string; color: string }> {
    return this.getActiveBuffData(entityId);
  }

  clear(entityId: string): void {
    this.buffs.delete(entityId);
  }

  clearAll(): void {
    this.buffs.clear();
  }
}
