import { create } from 'zustand';
import { gameData } from '@/shared/loader';
import { PlayerState, PlayerStats, DamageText, EnemyState, GameUIState } from '@/types/game';
import { Dialog } from '@/shared/schemas';
import { hotReloadData } from '@/shared/loader/clientLoader';
import { showToast } from '@/components/ui';

const { balance, enemies: enemyTemplates } = gameData;

const INITIAL_PLAYER_STATE: PlayerState = {
  name: 'Novice',
  baseLevel: 1,
  jobLevel: 1,
  baseExp: 0,
  jobExp: 0,
  hp: 50,
  maxHp: 50,
  sp: 10,
  maxSp: 10,
  zeny: 0,
  jobClass: 'Novice',
  stats: { str: 5, agi: 5, vit: 5, int: 5, dex: 5, luk: 5, statPoints: 0 },
  skillPoints: 5,
  unlockedSkills: ['basic_attack'],
  inventory: [
    { id: 'red_potion', name: 'Red Potion', type: 'usable', amount: 10, description: 'Restores 30 HP.' },
  ],
  equippedItems: {},
  skillLevels: {},
};

function buildInitialEnemies(): Record<string, EnemyState> {
  const result: Record<string, EnemyState> = {};
  if (enemyTemplates?.spawns) {
    enemyTemplates.spawns.forEach(s => {
      const template = enemyTemplates.templates.find(t => t.id === s.enemyId);
      if (template) {
        result[s.spawnId] = {
          id: s.spawnId,
          enemyId: s.enemyId,
          name: template.name,
          level: template.level,
          hp: template.hp,
          maxHp: template.hp,
          position: s.position,
          isDead: false,
        };
      }
    });
  }
  return result;
}

interface DialogState {
  isOpen: boolean;
  dialog: Dialog | null;
  currentLineIndex: number;
  selectedResponse: string | null;
}

interface GameStore {
  player: PlayerState;
  position: { x: number; y: number; z: number };
  inputDirection: { x: number; z: number };
  currentMapId: string;
  currentMapName: string;
  currentMapType: string;
  targetPosition: { x: number; z: number } | null;
  selectedTargetId: string | null;
  activeSkill: string | null;
  skillCooldowns: Record<string, number>;
  dialogState: DialogState;
  shopNpcId: string | null;
  enemies: Record<string, EnemyState>;
  damages: DamageText[];
  combatLog: string[];
  ui: GameUIState;

  getCombatStats: () => { atk: number; matk: number; def: number; mdef: number; hit: number; flee: number; attackSpeed: number; critChance: number; critDamage: number };

  setMap: (mapId: string, mapName: string, mapType: string) => void;
  setTargetPosition: (pos: { x: number; z: number } | null) => void;
  setPosition: (pos: { x: number; y: number; z: number }) => void;
  setInputDirection: (dir: { x: number; z: number }) => void;
  setSelectedTargetId: (id: string | null) => void;
  setDialogState: (state: Partial<DialogState>) => void;
  setActiveSkill: (skillId: string | null) => void;
  setSkillCooldown: (skillId: string, durationMs: number) => void;
  updateEnemyState: (id: string, state: Partial<EnemyState>) => void;
  updatePlayerHp: (hp: number) => void;
  setSp: (sp: number) => void;
  addCombatLog: (msg: string) => void;
  toggleUI: (key: keyof GameUIState) => void;
  consumeItem: (itemId: string) => void;
  allocateStat: (stat: keyof PlayerStats) => void;
  unlockSkill: (skillId: string, cost: number) => void;
  addDamageText: (amount: number, pos: { x: number, y: number, z: number }, color?: string) => void;
  gainExp: (base: number, job: number, currentBaseExp?: number, currentJobExp?: number, currentBaseLevel?: number, currentJobLevel?: number) => void;
  handleLevelUp: (data: { baseLevel: number; jobLevel: number; hpGain: number; spGain: number; statPointsGain: number; skillPointsGain: number; baseExp: number; jobExp: number; newMaxHp: number; newMaxSp: number }) => void;
  gainLoot: (items: any[]) => void;
  saveProgress: () => Promise<void>;
  loadProgress: () => Promise<void>;
  loadCharacter: (state: any) => void;
  equipItem: (itemId: string, slot: string) => void;
  unequipItem: (slot: string) => void;
  getEquippedStats: () => PlayerStats;
  changeJob: (jobId: string) => void;
  buyFromShop: (itemId: string) => void;
  sellToShop: (itemId: string) => void;
  setZeny: (zeny: number) => void;
  setShopNpcId: (npcId: string | null) => void;
  reloadData: () => Promise<void>;
}

export const useGameStore = create<GameStore>((set, get) => ({
  player: INITIAL_PLAYER_STATE,
  position: { x: 0, y: 0.5, z: 8 },
  inputDirection: { x: 0, z: 0 },
  currentMapId: 'prontera',
  currentMapName: 'Prontera City',
  currentMapType: 'town',
  targetPosition: null,
  selectedTargetId: null,
  activeSkill: null,
  skillCooldowns: {},
  dialogState: { isOpen: false, dialog: null, currentLineIndex: 0, selectedResponse: null },
  shopNpcId: null,
  enemies: buildInitialEnemies(),
  damages: [],
  combatLog: [],
  ui: { isSkillsOpen: false, isStatsOpen: false, isInventoryOpen: false },

  getCombatStats: () => {
    const p = get().player;
    const effectiveStats = get().getEquippedStats();
    const es = effectiveStats;
    const allItems = gameData.items;
    const equipped = p.equippedItems || {};
    let weaponAtk = 5;
    let weaponMatk = 3;
    for (const itemId of Object.values(equipped)) {
      if (!itemId) continue;
      const itemDef = allItems.find(i => i.id === itemId);
      if (!itemDef) continue;
      if (itemDef.atk) weaponAtk = Math.max(weaponAtk, itemDef.atk);
      if (itemDef.matk) weaponMatk = Math.max(weaponMatk, itemDef.matk);
    }
    return {
      atk: (es.str || 0) * 3 + (p.baseLevel || 1) * 1.5 + weaponAtk,
      matk: (es.int || 0) * 3.5 + (p.baseLevel || 1) * 1.2 + weaponMatk,
      def: (es.vit || 0) * 1.5,
      mdef: (es.int || 0) * 0.5,
      hit: 50 + (es.dex || 0) * 2.5 + (p.baseLevel || 1) * 0.5,
      flee: 80 + (es.agi || 0) * 2 + (p.baseLevel || 1) * 0.5,
      attackSpeed: Math.max(200, 800 - (es.agi || 0) * 4),
      critChance: 0.02 + (es.luk || 0) * 0.003 + (p.baseLevel || 1) * 0.001,
      critDamage: 1.5 + (es.luk || 0) * 0.005,
    };
  },

  setMap: (mapId, mapName, mapType) => set({ currentMapId: mapId, currentMapName: mapName, currentMapType: mapType }),
  setTargetPosition: (pos) => set({ targetPosition: pos }),
  setPosition: (pos) => set({ position: pos }),
  setInputDirection: (dir) => set({ inputDirection: dir }),
  setSelectedTargetId: (id) => set((s) => ({
    selectedTargetId: id,
  })),
  setDialogState: (state) => set((s) => ({ dialogState: { ...s.dialogState, ...state } })),
  setActiveSkill: (skillId) => set({ activeSkill: skillId }),
  setSkillCooldown: (skillId, durationMs) => set((s) => ({
    skillCooldowns: { ...s.skillCooldowns, [skillId]: Date.now() + durationMs },
  })),
  updateEnemyState: (id, state) => set((s) => ({
    enemies: { ...s.enemies, [id]: { ...s.enemies[id], ...state } }
  })),
  updatePlayerHp: (hp) => set((s) => ({ player: { ...s.player, hp: Math.max(0, Math.min(s.player.maxHp, hp)) } })),
  setSp: (sp) => set((s) => ({ player: { ...s.player, sp: Math.max(0, Math.min(s.player.maxSp, sp)) } })),
  addCombatLog: (msg) => set((s) => ({ combatLog: [...s.combatLog, msg].slice(-30) })),
  toggleUI: (key) => set((s) => ({ ui: { ...s.ui, [key]: !s.ui[key] } })),

  changeJob: (jobId) => {
    const jobDef = gameData.jobs.find(j => j.id === jobId);
    if (!jobDef) return;

    import('./useNetworkStore').then(({ useNetworkStore }) => {
      const socket = useNetworkStore.getState().socket;
      if (socket?.connected) {
        socket.emit('changeJob', { newJob: jobId }, (res: { success: boolean, error?: string }) => {
          if (res.success) {
            set((s) => ({
              player: {
                ...s.player,
                jobClass: jobDef.name,
                stats: {
                  ...s.player.stats,
                  str: s.player.stats.str + (jobDef.baseStatModifiers?.str || 0),
                  agi: s.player.stats.agi + (jobDef.baseStatModifiers?.agi || 0),
                  vit: s.player.stats.vit + (jobDef.baseStatModifiers?.vit || 0),
                  int: s.player.stats.int + (jobDef.baseStatModifiers?.int || 0),
                  dex: s.player.stats.dex + (jobDef.baseStatModifiers?.dex || 0),
                  luk: s.player.stats.luk + (jobDef.baseStatModifiers?.luk || 0),
                },
              }
            }));
          }
        });
      }
    });
  },

  setZeny: (zeny) => set((s) => ({ player: { ...s.player, zeny } })),
  setShopNpcId: (npcId) => set({ shopNpcId: npcId }),

  buyFromShop: (itemId) => {
    import('./useNetworkStore').then(({ useNetworkStore }) => {
      useNetworkStore.getState().socket?.emit('npcBuy', { itemId }, (res: any) => {
        if (res.success) {
          const gs = get();
          gs.setZeny(res.newZeny);
          gs.gainLoot([{ id: itemId, name: res.itemName, type: res.itemType || 'equip', amount: 1, description: res.itemDesc || '' }]);
        } else {
          showToast(res.error || 'Purchase failed', 'error');
        }
      });
    });
  },

  sellToShop: (itemId) => {
    import('./useNetworkStore').then(({ useNetworkStore }) => {
      useNetworkStore.getState().socket?.emit('npcSell', { itemId }, (res: any) => {
        if (res.success) {
          const gs = get();
          gs.setZeny(res.newZeny);
          const newInventory = [...gs.player.inventory];
          const slot = newInventory.find(i => i.id === itemId);
          if (slot) {
            slot.amount -= 1;
            if (slot.amount <= 0) {
              const idx = newInventory.indexOf(slot);
              if (idx !== -1) newInventory.splice(idx, 1);
            }
          }
          set({ player: { ...gs.player, inventory: newInventory } });
        }
      });
    });
  },

  consumeItem: (itemId) => {
    import('./useNetworkStore').then(({ useNetworkStore }) => {
      const socket = useNetworkStore.getState().socket;
      if (socket?.connected) {
        socket.emit('useItem', { itemId });
      }
    });
  },

  allocateStat: (stat) => {
    const state = get();
    if (state.player.stats.statPoints <= 0) return;
    import('./useNetworkStore').then(({ useNetworkStore }) => {
      const socket = useNetworkStore.getState().socket;
      if (socket?.connected) {
        socket.emit('allocateStat', { stat }, (res: any) => {
          if (res?.success) {
            set((s) => ({
              player: {
                ...s.player,
                stats: res.stats ?? {
                  ...s.player.stats,
                  [stat]: (s.player.stats[stat] || 0) + 1,
                  statPoints: s.player.stats.statPoints - 1
                },
              }
            }));
          }
        });
      } else {
        set((s) => ({
          player: {
            ...s.player,
            stats: {
              ...s.player.stats,
              [stat]: (s.player.stats[stat] || 0) + 1,
              statPoints: s.player.stats.statPoints - 1
            }
          }
        }));
      }
    });
  },

  unlockSkill: (skillId, cost) => {
    const state = get();
    if (state.player.skillPoints < cost) return;
    import('./useNetworkStore').then(({ useNetworkStore }) => {
      const socket = useNetworkStore.getState().socket;
      if (socket?.connected) {
        socket.emit('unlockSkill', { skillId }, (res: any) => {
          if (res?.success) {
            set((s) => ({
              player: {
                ...s.player,
                unlockedSkills: res.unlockedSkills ?? s.player.unlockedSkills,
                skillLevels: res.skillLevels ?? s.player.skillLevels,
                skillPoints: res.skillPoints ?? s.player.skillPoints - cost,
              },
            }));
          }
        });
      } else {
        set((s) => ({
          player: {
            ...s.player,
            skillPoints: s.player.skillPoints - cost,
            unlockedSkills: [...(s.player.unlockedSkills || []), skillId],
          }
        }));
      }
    });
  },

  addDamageText: (amount, pos, color = 'white') => set((state) => {
    const id = Date.now() + Math.random().toString();
    const newDamage = { id, amount, position: pos, timestamp: Date.now(), color };
    return { damages: [...state.damages, newDamage].filter(d => Date.now() - d.timestamp < 2000) };
  }),

  gainExp: (base, job, currentBaseExp?, currentJobExp?, currentBaseLevel?, currentJobLevel?) => set((state) => {
    return {
      player: {
        ...state.player,
        baseExp: currentBaseExp ?? (state.player.baseExp + base),
        jobExp: currentJobExp ?? (state.player.jobExp + job),
        baseLevel: currentBaseLevel ?? state.player.baseLevel,
        jobLevel: currentJobLevel ?? state.player.jobLevel,
      },
    };
  }),

  handleLevelUp: (data) => set((state) => {
    return {
      player: {
        ...state.player,
        baseLevel: data.baseLevel,
        jobLevel: data.jobLevel,
        maxHp: data.newMaxHp,
        maxSp: data.newMaxSp,
        hp: data.newMaxHp,
        sp: data.newMaxSp,
        baseExp: data.baseExp,
        jobExp: data.jobExp,
        skillPoints: (state.player.skillPoints ?? 0) + data.skillPointsGain,
        stats: {
          ...state.player.stats,
          statPoints: (state.player.stats?.statPoints ?? 0) + data.statPointsGain,
        },
      },
    };
  }),

  gainLoot: (newItems) => set((state) => {
    const newInventory = [...(state.player.inventory || [])];
    newItems.forEach(newItem => {
      const existing = newInventory.find(i => i.id === newItem.id);
      if (existing) existing.amount += newItem.amount;
      else newInventory.push(newItem);
    });
    return { player: { ...state.player, inventory: newInventory } };
  }),

  saveProgress: async () => { console.log('Saving...'); },
  loadProgress: async () => { console.log('Loading...'); },
  loadCharacter: (characterState) => set((s) => ({
    player: {
      ...INITIAL_PLAYER_STATE,
      ...characterState,
      stats: { ...INITIAL_PLAYER_STATE.stats, ...(characterState?.stats || {}) },
      inventory: characterState?.inventory || INITIAL_PLAYER_STATE.inventory,
      unlockedSkills: characterState?.unlockedSkills || INITIAL_PLAYER_STATE.unlockedSkills,
      equippedItems: characterState?.equippedItems || INITIAL_PLAYER_STATE.equippedItems,
      skillLevels: characterState?.skillLevels ?? {},
    }
  })),

  equipItem: (itemId, slot) => {
    import('./useNetworkStore').then(({ useNetworkStore }) => {
      const socket = useNetworkStore.getState().socket;
      if (socket?.connected) {
        socket.emit('equipItem', { itemId, slot }, (res: { success: boolean; error?: string }) => {
          if (res.success) {
            set((s) => {
              const inv = (s.player.inventory || []).filter(i => i.id !== itemId);
              return {
                player: {
                  ...s.player,
                  inventory: inv,
                  equippedItems: { ...(s.player.equippedItems || {}), [slot]: itemId },
                },
              };
            });
          }
        });
      }
    });
  },
  unequipItem: (slot) => {
    import('./useNetworkStore').then(({ useNetworkStore }) => {
      const socket = useNetworkStore.getState().socket;
      if (socket?.connected) {
        socket.emit('unequipItem', { slot }, (res: { success: boolean; error?: string }) => {
          if (res.success) {
            set((s) => {
              const { [slot]: removed, ...rest } = s.player.equippedItems || {};
              const itemId = removed;
              const itemDef = itemId ? gameData.items.find(i => i.id === itemId) : undefined;
              const inv = itemId
                ? [...(s.player.inventory || []), { id: itemId, name: itemDef?.name || '', type: 'equip' as const, amount: 1, description: itemDef?.description || '' }]
                : s.player.inventory;
              return {
                player: {
                  ...s.player,
                  inventory: inv,
                  equippedItems: rest,
                },
              };
            });
          }
        });
      }
    });
  },
  getEquippedStats: () => {
    const s = get();
    const equipped = s.player.equippedItems || {};
    const totalStats: Record<string, number> = { str: 0, agi: 0, vit: 0, int: 0, dex: 0, luk: 0 };
    const allItems = gameData.items;
    for (const itemId of Object.values(equipped)) {
      if (!itemId) continue;
      const itemDef = allItems.find(i => i.id === itemId);
      if (itemDef?.equipStats) {
        for (const [k, v] of Object.entries(itemDef.equipStats)) {
          if (typeof v === 'number') totalStats[k] = (totalStats[k] || 0) + v;
        }
      }
    }
    return { ...s.player.stats, ...totalStats };
  },

  reloadData: async () => {
    showToast('Reloading core systems...', 'info');
    const newData = await hotReloadData();
    if (newData) {
      showToast('Game Data Hot-Reloaded!', 'success');
    }
  }
}));
