'use client';

import React from 'react';
import { useGameStore } from '@/store/useGameStore';
import { useNetworkStore } from '@/store/useNetworkStore';
import { gameData } from '@/shared/loader';
import { ProgressBar, ThinBar, Avatar, StatusEffectBar } from '@/components/ui';
import { Heart, Zap, Shield, Swords, Skull, Activity } from 'lucide-react';
import { motion } from 'framer-motion';
import type { ActiveBuffData } from '@/shared/types/network';

const { balance } = gameData;

function buffIcon(buff: ActiveBuffData) {
  if (buff.isDebuff) return <Skull size={10} />;
  if (buff.icon) return <Activity size={10} />;
  const id = (buff.buffId || '').toLowerCase();
  if (id.includes('hp')) return <Heart size={10} />;
  if (id.includes('sp') || id.includes('mana')) return <Zap size={10} />;
  if (id.includes('def') || id.includes('shield')) return <Shield size={10} />;
  if (id.includes('atk') || id.includes('str') || id.includes('dmg')) return <Swords size={10} />;
  return <Activity size={10} />;
}

function buffVariant(buff: ActiveBuffData): 'buff' | 'debuff' | 'neutral' {
  if (buff.isDebuff) return 'debuff';
  return 'buff';
}

function toStatusEffectProps(buffs: ActiveBuffData[]): React.ComponentProps<typeof StatusEffectBar>['effects'] {
  const now = Date.now();
  return buffs.map((buff) => ({
    icon: buffIcon(buff),
    name: buff.buffId,
    variant: buffVariant(buff),
    size: 'sm' as const,
    stackCount: buff.stacks > 1 ? buff.stacks : undefined,
    duration: Math.max(0, buff.expiresAt - now),
  }));
}

export function PlayerFrame() {
  const player = useGameStore((state) => state.player);
  const activeBuffs = useNetworkStore((state) => state.activeBuffs || []);

  if (!player) return null;

  const baseMult = balance?.progression?.baseLevelUpThreshold?.multiplier || 100;
  const jobMult = balance?.progression?.jobLevelUpThreshold?.multiplier || 50;

  const baseExpThreshold = (player.baseLevel || 1) * baseMult;
  const jobExpThreshold = (player.jobLevel || 1) * jobMult;

  const baseExpPct = baseExpThreshold > 0 ? Math.min(100, ((player.baseExp || 0) / baseExpThreshold) * 100) : 0;
  const jobExpPct = jobExpThreshold > 0 ? Math.min(100, ((player.jobExp || 0) / jobExpThreshold) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="pointer-events-auto select-none max-w-full"
    >
      {/* Compact Capsule Border with RO glass skin */}
      <div className="flex flex-col p-2 rounded-2xl ro-window-panel border border-slate-700/40 shadow-xl bg-slate-950/70 backdrop-blur-md max-w-[220px] xs:max-w-[240px] md:max-w-[280px]">
        
        {/* Main Info Row */}
        <div className="flex items-center gap-2">
          {/* Avatar frame */}
          <div className="relative shrink-0">
            <Avatar
              name={player.name || 'Hero'}
              level={player.baseLevel || 1}
              size="sm" // Small, compact avatar
              ringColor="gradient"
              className="w-8 h-8 md:w-9 md:h-9 border border-white/10 shadow-inner"
            />
            {/* Soft pulse behind avatar */}
            <motion.div
              animate={{ opacity: [0.15, 0.4, 0.15] }}
              transition={{ repeat: Infinity, duration: 2.5 }}
              className="absolute inset-0 rounded-full bg-blue-400/10 blur-sm -z-10"
            />
          </div>

          {/* Bars stacked next to avatar */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-1 mb-0.5">
              <span className="text-white font-black text-xs truncate tracking-tight uppercase">
                {player.name || 'Novice'}
              </span>
              <span className="text-blue-400 font-extrabold text-[8px] tracking-widest uppercase shrink-0">
                Lv{player.baseLevel || 1}
              </span>
            </div>
            
            {/* HP and SP Progress bars - Thicker, compact width */}
            <div className="flex flex-col gap-0.5">
              <ProgressBar
                value={player.hp || 0}
                max={player.maxHp || 100}
                color="hp"
                size="sm"
                className="w-full h-[8px] rounded-sm border-0"
                showLabel={true}
              />
              <ProgressBar
                value={player.sp || 0}
                max={player.maxSp || 100}
                color="sp"
                size="sm"
                className="w-full h-[8px] rounded-sm border-0"
                showLabel={true}
              />
            </div>
          </div>
        </div>

        {/* EXP Bar overlay - Extremely thin lines at the foot of capsule */}
        <div className="flex flex-col gap-[1px] mt-1.5 pt-1.5 border-t border-white/5">
          <div className="flex items-center gap-1.5">
            <span className="text-[6px] font-black text-amber-500/80 w-5">BASE</span>
            <ThinBar value={baseExpPct} color="exp" className="flex-1 h-[2px]" />
            <span className="text-[6px] font-bold text-amber-500/60 font-mono">{Math.floor(baseExpPct)}%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[6px] font-black text-purple-500/80 w-5">JOB</span>
            <ThinBar value={jobExpPct} color="jobExp" className="flex-1 h-[2px]" />
            <span className="text-[6px] font-bold text-purple-500/60 font-mono">{Math.floor(jobExpPct)}%</span>
          </div>
        </div>
      </div>

      {/* Buff icons tucked neatly beneath status capsule */}
      {activeBuffs.length > 0 && (
        <div className="mt-1 flex justify-start pl-1 max-w-[200px]">
          <StatusEffectBar effects={toStatusEffectProps(activeBuffs)} />
        </div>
      )}
    </motion.div>
  );
}
