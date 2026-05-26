import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import type {
  PeerPlayerState, ChatMessage, TradeOffer, WorldSnapshot, PlayerInput,
  ActiveBuffData, MoveToTargetData, InteractionReadyData,
} from '@/shared/types/network';
import type { EnemyState } from '@/shared/schemas/gameState';
import { gameData } from '@/shared/loader';
import { addCombatLog } from '@/components/game/hud/CombatLog';
import { showToast } from '@/components/ui';
import { triggerShake } from '@/components/game/ScreenShake';
import { showExpGain } from '@/components/game/ExpPopups';
import { spawnProjectile } from '@/components/game/ProjectileRenderer';

const { balance } = gameData;

interface NetworkStore {
  socket: Socket | null;
  isConnected: boolean;
  remotePlayers: Record<string, PeerPlayerState>;
  chatMessages: ChatMessage[];
  currentMapData: any | null;
  activeBuffs: ActiveBuffData[];
  tradeRequest: { from: string; name: string } | null;
  activeTrade: {
    peerId: string;
    myOffer: TradeOffer;
    theirOffer: TradeOffer;
  } | null;
  lastSnapshotPos: { x: number; y: number; z: number };

  initSocket: (playerName: string) => void;
  sendInput: (input: PlayerInput) => void;
  sendMoveToTarget: (data: MoveToTargetData) => void;
  sendChatMessage: (text: string) => void;
  addChatMessage: (msg: ChatMessage) => void;
  attackTarget: (targetId: string) => void;
  castSkill: (skillId: string, targetId?: string, targetX?: number, targetZ?: number, directionX?: number, directionZ?: number) => void;
  requestWarp: (warpId: string) => void;
  updateRemotePlayer: (id: string, state: Partial<PeerPlayerState>) => void;

  // Trade
  requestTrade: (targetSocketId: string) => void;
  acceptTradeRequest: () => void;
  declineTradeRequest: () => void;
  updateTradeOffer: (offer: Partial<TradeOffer>) => void;
  lockTrade: () => void;
  acceptTrade: () => void;
  cancelTrade: () => void;
}

export const useNetworkStore = create<NetworkStore>((set, get) => ({
  socket: null,
  isConnected: false,
  remotePlayers: {},
  chatMessages: [],
  currentMapData: null,
  activeBuffs: [],
  tradeRequest: null,
  activeTrade: null,
  lastSnapshotPos: { x: 0, y: 0.5, z: 0 },

  initSocket: async (playerName: string) => {
    if (get().socket?.connected) return;

    const { useGameStore } = await import('./useGameStore');
    const socketUrl = process.env.NEXT_PUBLIC_GAME_SERVER_URL || 'http://localhost:3001';
    const newSocket = io(socketUrl, {
      transports: ['polling', 'websocket'],
      query: { playerName }
    });

    newSocket.on('connect', () => {
      console.log('Connected to game server');
      set({ isConnected: true });
      showToast('Connected to server', 'success');
      newSocket.emit('join', { name: playerName });
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from game server');
      set({ isConnected: false });
    });

    newSocket.on('init', (data) => {
      if (!data) return;
      set({ currentMapData: data.initData });
      const gs = useGameStore.getState();
      gs.setMap(data.mapId, data.mapName, data.mapType);
      if (data.openedChests) {
        gs.setOpenedChests(data.openedChests);
      } else {
        gs.setOpenedChests([]);
      }
      if (data.enemies) {
        for (const [id, se] of Object.entries(data.enemies as any)) {
          gs.updateEnemyState(id, se as any);
        }
      }
      if (data.players && newSocket.id) {
        const me = data.players[newSocket.id];
        if (me) {
          gs.setPosition({ x: me.x, y: me.y, z: me.z });
          set({ lastSnapshotPos: { x: me.x, y: me.y, z: me.z } });
        }
      }
    });

    newSocket.on('mapData', (data) => {
      if (!data) return;
      set({ currentMapData: data });
      useGameStore.getState().setMap(data.mapId, data.mapName, data.mapType);
    });

    newSocket.on('mapChange', (data) => {
      if (!data) return;
      set({ currentMapData: data.initData });
      const gs = useGameStore.getState();
      gs.setMap(data.mapId, data.mapName, data.mapType);
      if ((data as any).openedChests) {
        gs.setOpenedChests((data as any).openedChests);
      } else {
        gs.setOpenedChests([]);
      }
      if (data.spawnPosition) {
        gs.setPosition({ x: data.spawnPosition.x, y: data.spawnPosition.y, z: data.spawnPosition.z });
        set({ lastSnapshotPos: { x: data.spawnPosition.x, y: data.spawnPosition.y, z: data.spawnPosition.z } });
      }
      if (data.enemies) {
        for (const [id, se] of Object.entries(data.enemies as any)) {
          gs.updateEnemyState(id, se as any);
        }
      }
    });

    newSocket.on('worldSnapshot', (snapshot: WorldSnapshot) => {
      if (!snapshot) return;

      const gs = useGameStore.getState();
      const myId = newSocket.id;
      const updatedPlayers: Record<string, PeerPlayerState> = {};

      const players = snapshot.players || {};
      for (const [id, sp] of Object.entries(players)) {
        if (id === myId) {
          set({ lastSnapshotPos: { x: sp.x, y: sp.y, z: sp.z } });
          gs.setPosition({ x: sp.x, y: sp.y, z: sp.z });
        } else {
          const existing = get().remotePlayers[id];
          updatedPlayers[id] = {
            x: sp.x, y: sp.y, z: sp.z,
            name: (existing?.name || sp.name || id),
            direction: sp.direction || existing?.direction || 'S',
            animState: sp.animState || existing?.animState || 'idle',
          };
        }
      }
      set({ remotePlayers: updatedPlayers });

      const enemies = snapshot.enemies || {};
      for (const [id, se] of Object.entries(enemies)) {
        gs.updateEnemyState(id, { hp: se.hp, isDead: se.isDead, position: se.position });
      }
    });

    newSocket.on('playerLeft', (id: string) => {
      set((s) => {
        const newPlayers = { ...s.remotePlayers };
        const name = newPlayers[id]?.name;
        delete newPlayers[id];
        if (name) showToast(`${name} left the map`, 'warning');
        return { remotePlayers: newPlayers };
      });
    });

    newSocket.on('chatMessage', (msg: ChatMessage) => {
      if (!msg) return;
      set(s => ({ chatMessages: [...s.chatMessages, msg].slice(-50) }));
    });

    newSocket.on('interactionReady', (data: InteractionReadyData) => {
      if (!data) return;
      const gs = useGameStore.getState();

      switch (data.type) {
        case 'npc': {
          const dialog = gameData.dialogs?.dialogs?.find((d: any) => d.id === data.dialogId);
          if (dialog) {
            gs.setDialogState({ isOpen: true, dialog, currentLineIndex: 0, selectedResponse: null });
          }
          break;
        }
      }
    });

    newSocket.on('moveCompleted', () => {
      // Target movement finished — no special handling needed
    });

    newSocket.on('enemyDamaged', (data) => {
      if (!data) return;
      const gs = useGameStore.getState();
      gs.updateEnemyState(data.targetId, { hp: data.hp, isDead: data.isDead });
      
      const enemy = gs.enemies[data.targetId];
      if (enemy && enemy.position) {
        const pos = { 
          x: enemy.position.x + (Math.random()*0.5-0.25), 
          y: enemy.position.y + 1, 
          z: enemy.position.z 
        };
        const color = data.attackerId === newSocket.id ? (data.usedSkill ? '#ffaa00' : 'white') : '#cccccc';
        gs.addDamageText(data.damage, pos, color);

        if (typeof window !== 'undefined') {
          import('@/components/game/QuarksParticleSystem').then(m => {
            m.createHitEffect(pos, color);
          }).catch(() => {});

          const isLocal = data.attackerId === newSocket.id;
          const casterPos = isLocal ? gs.position : (() => {
            const rp = get().remotePlayers[data.attackerId];
            return rp ? { x: rp.x, y: rp.y, z: rp.z } : null;
          })();
          if (casterPos) {
            if (data.usedSkill) {
              spawnProjectile({
                startX: casterPos.x, startY: (casterPos.y || 0.5) + 0.8, startZ: casterPos.z,
                endX: enemy.position.x, endY: enemy.position.y + 0.5, endZ: enemy.position.z,
                type: 'bolt', color: '#ffaa00',
              });
            } else {
              spawnProjectile({
                startX: casterPos.x, startY: (casterPos.y || 0.5) + 0.8, startZ: casterPos.z,
                endX: enemy.position.x, endY: enemy.position.y + 0.5, endZ: enemy.position.z,
                type: 'arrow', color: '#ffdd88',
              });
            }
          }
        }
      }
    });

    newSocket.on('enemyKilled', (data) => {
      if (!data) return;
      const gs = useGameStore.getState();
      gs.setSp(data.newSp);
      gs.updateEnemyState(data.targetId, { hp: data.hp, isDead: data.isDead });
      gs.gainExp(data.expBase, data.expJob, data.currentBaseExp, data.currentJobExp, data.currentBaseLevel, data.currentJobLevel);
      if (data.loot && data.loot.length > 0) gs.gainLoot(data.loot);
      showExpGain(data.expBase, 'base');
      showExpGain(data.expJob, 'job');
      addCombatLog(`Enemy defeated! +${data.expBase} EXP`);
      gs.setSelectedTargetId(null);
    });

    newSocket.on('levelUp', (data) => {
      if (!data) return;
      const gs = useGameStore.getState();
      gs.handleLevelUp(data);
      showToast(`Level Up! You are now level ${data.baseLevel}!`, 'success');
      addCombatLog(`LEVEL UP! Base ${data.baseLevel}, Job ${data.jobLevel}!`);
    });

    newSocket.on('attackResult', (data) => {
      if (!data) return;
      const gs = useGameStore.getState();

      if (data.error) {
        showToast(data.error, 'error');
        return;
      }

      if (data.newSp !== undefined) gs.setSp(data.newSp);
      gs.updateEnemyState(data.targetId, { hp: data.hp, isDead: data.isDead });

      if (data.damage > 0) {
        const enemy = gs.enemies[data.targetId];
        if (enemy && enemy.position) {
          const pos = {
            x: enemy.position.x + (Math.random() * 0.5 - 0.25),
            y: enemy.position.y + 1,
            z: enemy.position.z,
          };
          gs.addDamageText(data.damage, pos, 'white');
        }
      }
    });

    newSocket.on('playerDamaged', (data) => {
      if (!data) return;
      const gs = useGameStore.getState();
      gs.updatePlayerHp(data.hp);
      addCombatLog(`Received ${data.damage} damage!`);
      triggerShake(0.1, 0.2);
    });

    newSocket.on('skillCastResult', (data) => {
      if (!data) return;
      const gs = useGameStore.getState();

      if (data.damage) {
        for (const tid of data.targetsHit || []) {
          const perTargetDamage = data.targetDamages?.[tid] ?? data.damage;
          const enemy = gs.enemies[tid];
          if (enemy && enemy.position) {
            const pos = {
              x: enemy.position.x + (Math.random() * 0.5 - 0.25),
              y: enemy.position.y + 1,
              z: enemy.position.z,
            };
            const color = data.isCritical ? '#ffcc00' : '#ff4444';
            gs.addDamageText(perTargetDamage, pos, color);
            if (data.isCritical) triggerShake(0.15, 0.3);
          }
        }

        if (typeof window !== 'undefined' && data.targetPositions && data.targetsHit) {
          const casterPos = data.casterId === newSocket.id
            ? gs.position
            : (() => {
                const rp = get().remotePlayers[data.casterId];
                return rp ? { x: rp.x, y: rp.y, z: rp.z } : null;
              })();
          if (casterPos) {
            const projType = data.vfxId === 'lightning_vfx' ? 'bolt'
              : data.vfxId === 'meteor_vfx' ? 'missile'
              : data.vfxId === 'fire_vfx' ? 'sphere'
              : 'bolt';
            const color = data.vfxId === 'lightning_vfx' ? '#4488ff'
              : data.vfxId === 'meteor_vfx' ? '#ff4400'
              : data.vfxId === 'fire_vfx' ? '#ff6600'
              : '#ffaa00';
            const speed = data.vfxId === 'lightning_vfx' ? 30 : 12;

            for (const tid of data.targetsHit) {
              const tpos = data.targetPositions[tid];
              if (!tpos) continue;
              spawnProjectile({
                startX: casterPos.x, startY: (casterPos.y || 0.5) + 0.8, startZ: casterPos.z,
                endX: tpos.x, endY: 0.5, endZ: tpos.z,
                type: projType, color, speed,
              });
            }
          }
        }
        addCombatLog(`${data.casterId === newSocket.id ? 'You' : data.casterId} cast ${data.skillId} for ${data.damage} damage${data.isCritical ? ' (CRIT!)' : ''}`);
      }

      if (data.heal) {
        addCombatLog(`${data.casterId === newSocket.id ? 'You' : data.casterId} healed for ${data.heal}`);
      }
    });

    newSocket.on('playerDied', (data) => {
      if (!data) return;
      const gs = useGameStore.getState();
      if (data.respawnPosition) {
        gs.setPosition(data.respawnPosition);
        showToast('You died! Respawning...', 'error');
      }
    });

    newSocket.on('groundEffectCreated', (data) => {
      // Handled by SkillRenderer
    });

    newSocket.on('groundEffectsUpdate', (data) => {
      // Handled by SkillRenderer
    });

    newSocket.on('buffsUpdate', (data: ActiveBuffData[]) => {
      set({ activeBuffs: data ?? [] });
    });

    newSocket.on('chestOpened', (data: { chestId: string; loot: any[] }) => {
      if (!data) return;
      const gs = useGameStore.getState();
      gs.addOpenedChest(data.chestId);
      if (data.loot && data.loot.length > 0) {
        gs.gainLoot(data.loot);
        const lootNames = data.loot.map(item => `${item.name} x${item.amount}`).join(', ');
        showToast(`Opened chest! Found: ${lootNames}`, 'success');
        data.loot.forEach(item => {
          gs.addCombatLog(`Obtained from chest: ${item.name} x${item.amount}`);
        });
      } else {
        gs.addCombatLog(`The chest is empty!`);
      }
    });

    newSocket.on('chestRespawned', (data: { chestIds: string[] }) => {
      if (!data || !data.chestIds) return;
      const gs = useGameStore.getState();
      data.chestIds.forEach(id => {
        gs.removeOpenedChest(id);
      });
      gs.addCombatLog(`Chests have respawned in the area!`);
    });

    set({ socket: newSocket });
  },

  sendInput: (input) => {
    const s = get().socket;
    if (s?.connected) s.emit('input', input);
  },

  sendMoveToTarget: (data: MoveToTargetData) => {
    const s = get().socket;
    if (s?.connected) s.emit('moveToTarget', data);
  },

  sendChatMessage: (text) => {
    const s = get().socket;
    if (s?.connected) s.emit('chat', text);
  },

  addChatMessage: (msg) => set(s => ({ chatMessages: [...s.chatMessages, msg].slice(-50) })),

  attackTarget: async (targetId: string) => {
    const s = get().socket;
    if (s?.connected) {
      const { useGameStore } = await import('./useGameStore');
      const gs = useGameStore.getState();
      s.emit('attack', {
        targetId,
        skillId: gs.activeSkill,
        sp: gs.player?.sp || 0,
        position: gs.position,
      });
    }
  },

  castSkill: async (skillId: string, targetId?: string, targetX?: number, targetZ?: number, directionX?: number, directionZ?: number) => {
    const s = get().socket;
    if (!s?.connected) return;

    const { useGameStore } = await import('./useGameStore');
    const gs = useGameStore.getState();

    s.emit('skillCast', {
      skillId,
      targetId,
      targetX,
      targetZ,
      directionX,
      directionZ,
      seq: 0,
    }, (res: any) => {
      if (!res) return;

      if (!res.success) {
        showToast(res.error || 'Skill failed', 'error');
        return;
      }

      if (res.cooldownMs) {
        gs.setSkillCooldown(skillId, res.cooldownMs);
      }

      if (res.castTimeMs) {
        showToast(`Casting ${skillId}...`, 'info');
        return;
      }

      if (res.damage) {
        addCombatLog(`Hit for ${res.damage} damage${res.isCritical ? ' (CRIT!)' : ''}`);
        triggerShake(res.isCritical ? 0.15 : 0.08, res.isCritical ? 0.3 : 0.15);
      }

      if (res.heal) {
        addCombatLog(`Healed for ${res.heal}`);
      }

      if (res.newSp !== undefined) {
        gs.setSp(res.newSp);
      }

      if (res.newHp !== undefined) {
        gs.updatePlayerHp(res.newHp);
      }

      if (res.targetsHit && res.targetsHit.length > 0) {
        for (const tid of res.targetsHit) {
          const enemy = gs.enemies[tid];
          if (enemy && enemy.position) {
            const pos = {
              x: enemy.position.x + (Math.random() * 0.5 - 0.25),
              y: enemy.position.y + 1,
              z: enemy.position.z,
            };
            const color = res.damage ? (res.isCritical ? '#ffcc00' : '#ff4444') : '#4ade80';
            gs.addDamageText(res.damage || res.heal || 0, pos, color);
          }
        }
      }

      if (res.cooldownMs) {
        showToast(`${skillId} cooldown: ${(res.cooldownMs / 1000).toFixed(1)}s`, 'info');
      }
    });
  },

  requestWarp: (warpId: string) => {
    const s = get().socket;
    if (s?.connected) s.emit('requestWarp', { warpId });
  },

  updateRemotePlayer: (id, state) => set(s => {
    const p = s.remotePlayers[id];
    if (!p) return s;
    return { remotePlayers: { ...s.remotePlayers, [id]: { ...p, ...state } } };
  }),

  requestTrade: (targetSocketId) => {
    const s = get().socket;
    if (s?.connected) s.emit('requestTrade', { targetSocketId });
  },
  acceptTradeRequest: () => {
    const s = get().socket;
    if (s?.connected) s.emit('acceptTradeRequest');
  },
  declineTradeRequest: () => {
    const s = get().socket;
    if (s?.connected) s.emit('declineTradeRequest');
    set({ tradeRequest: null });
  },
  updateTradeOffer: (offerUpdate) => {
    const s = get().socket;
    if (s?.connected) s.emit('updateTradeOffer', offerUpdate);
  },
  lockTrade: () => {
    const s = get().socket;
    if (s?.connected) s.emit('lockTrade');
  },
  acceptTrade: () => {
    const s = get().socket;
    if (s?.connected) s.emit('acceptTrade');
  },
  cancelTrade: () => {
    const s = get().socket;
    if (s?.connected) s.emit('cancelTrade');
    set({ activeTrade: null, tradeRequest: null });
  },
}));
