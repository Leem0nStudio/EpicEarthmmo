'use client';

import React, { useState } from 'react';
import { useGameStore } from '@/store/useGameStore';
import { Modal, Text, Button, Badge, GameIcon } from '@/components/ui';
import { Star, Sparkles, Lock, Check, Plus, HelpCircle } from 'lucide-react';
import { gameData } from '@/shared/loader';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/cn';

const { skills } = gameData;

export function SkillsWindow({ onClose }: { onClose: () => void }) {
  const player = useGameStore((state) => state.player);
  const unlockSkill = useGameStore((state) => state.unlockSkill);
  const [selectedSkill, setSelectedSkill] = useState<any>(null);

  if (!player) return null;
  const skillLevels = player.skillLevels ?? {};

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Skill Tree"
      subtitle={`${player.jobClass} Skills`}
      position="bottom"
      size="md"
    >
      <div className="space-y-4">
        {/* Compact points header */}
        <div className="bg-slate-950/40 border border-indigo-500/15 rounded-2xl p-3 flex items-center justify-between shadow-xl relative overflow-hidden">
          <div className="flex items-center gap-3 relative z-10">
            <div className="relative shrink-0">
              <div className="w-8 h-8 rounded-xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
                <Sparkles size={16} className="text-indigo-400" />
              </div>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0 border border-indigo-400/20 rounded-xl"
              />
            </div>
            <div>
              <p className="text-[8px] font-black uppercase tracking-widest text-indigo-400/60 leading-none">Available Points</p>
              <h2 className="text-xl font-black text-white leading-none mt-1">{player.skillPoints}</h2>
            </div>
          </div>
          {player.skillPoints > 0 && (
            <motion.div
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
              className="px-2.5 py-1 rounded-lg bg-indigo-500/20 border border-indigo-500/30 text-[8px] font-black text-indigo-300 uppercase tracking-wider shrink-0"
            >
              Points Available!
            </motion.div>
          )}
        </div>

        <div className="min-h-[220px] bg-slate-950/40 p-2 rounded-2xl border border-white/5 relative">
          <div className="grid grid-cols-1 xs:grid-cols-2 gap-2 max-h-[200px] overflow-y-auto custom-scrollbar pr-1">
            {skills.map((skill, index) => {
              const unlocked = player.unlockedSkills || [];
              const curLevel = skillLevels[skill.id] ?? 0;
              const isUnlocked = curLevel > 0 || skill.skillPointCost === 0;
              const isMaxLevel = curLevel >= skill.maxLevel;
              const classAllowed = !skill.allowedClasses || skill.allowedClasses.length === 0 || skill.allowedClasses.includes(player.jobClass.toLowerCase());
              const meetsReqs = classAllowed && (skill.requirements || []).every((r: string) => unlocked.includes(r) || r === 'basic_attack');
              const canUnlock = meetsReqs && !isMaxLevel && player.skillPoints >= skill.skillPointCost;
              const isSelected = selectedSkill?.id === skill.id;

              return (
                <motion.div
                  key={skill.id}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setSelectedSkill(skill)}
                  className={cn(
                    "p-2 rounded-xl border flex items-center justify-between gap-2 transition-all duration-200 cursor-pointer select-none min-h-[46px]",
                    isUnlocked ? "bg-emerald-950/10 border-emerald-500/20 hover:border-emerald-500/30" : 
                    !classAllowed ? "bg-red-950/10 border-red-900/30 opacity-60" :
                    meetsReqs ? "bg-slate-900/40 border-slate-700 hover:border-indigo-500/30" : 
                    "bg-slate-950/20 border-slate-900/50 opacity-40 hover:opacity-50",
                    isSelected && "border-indigo-400 bg-indigo-500/10 shadow-[0_0_8px_rgba(99,102,241,0.2)]"
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="relative shrink-0">
                      <GameIcon
                        iconType="skill"
                        id={skill.id}
                        name={skill.name}
                        variant={isUnlocked ? 'green' : meetsReqs ? 'amber' : 'default'}
                        size={28}
                      />
                      {isUnlocked && (
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-500 border border-slate-950 flex items-center justify-center">
                          <Check size={6} className="text-slate-950 stroke-[4]" />
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-[11px] font-black text-white leading-tight truncate uppercase tracking-tight">
                        {skill.name}
                      </h4>
                      {skill.spCost > 0 ? (
                        <span className="text-[8px] font-bold text-slate-400 leading-none">
                          {skill.spCost} SP
                        </span>
                      ) : (
                        <span className="text-[8px] font-bold text-slate-500 leading-none">Passive</span>
                      )}
                    </div>
                  </div>

                  {/* Actions / Status Indicators */}
                  <div className="shrink-0">
                    {isMaxLevel ? (
                      <div className="px-1.5 py-0.5 rounded text-[7px] font-black uppercase border border-amber-500/30 bg-amber-500/10 text-amber-400 leading-none">
                        MAX
                      </div>
                    ) : isUnlocked ? (
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] font-bold text-emerald-400 leading-none">{curLevel}</span>
                        <span className="text-[7px] text-slate-500">/</span>
                        <span className="text-[7px] text-slate-500">{skill.maxLevel}</span>
                        <motion.button
                          whileTap={{ scale: 0.9 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            unlockSkill(skill.id, skill.skillPointCost);
                          }}
                          className="w-5 h-5 rounded bg-indigo-600/80 text-white flex items-center justify-center hover:bg-indigo-500 transition-all active:scale-95 cursor-pointer ml-1"
                          title={`Level up (${skill.skillPointCost} SP)`}
                        >
                          <Plus size={10} strokeWidth={3} />
                        </motion.button>
                      </div>
                    ) : !classAllowed ? (
                      <div className="px-1.5 py-0.5 rounded text-[7px] font-bold uppercase border border-red-900/30 bg-red-950/20 text-red-400 leading-none">
                        Class
                      </div>
                    ) : !meetsReqs ? (
                      <div className="w-6 h-6 rounded-lg bg-slate-950/40 border border-slate-800 flex items-center justify-center text-slate-600">
                        <Lock size={10} />
                      </div>
                    ) : canUnlock ? (
                      <motion.button
                        whileTap={{ scale: 0.9 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          unlockSkill(skill.id, skill.skillPointCost);
                        }}
                        className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-500 shadow-md transition-all active:scale-95 cursor-pointer"
                        title={`Learn for ${skill.skillPointCost} Skill Point(s)`}
                      >
                        <Plus size={14} strokeWidth={3} />
                      </motion.button>
                    ) : (
                      <div className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase border border-slate-800 bg-slate-950/20 text-slate-500 leading-none">
                        Req SP
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Sliding skill details action drawer */}
        <AnimatePresence>
          {selectedSkill && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 15 }}
              className="bg-slate-900/90 border border-slate-700/60 rounded-2xl p-3 shadow-2xl relative overflow-hidden"
            >
              <div className="flex flex-col gap-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-xl font-black text-white">{selectedSkill.name}</h2>
                    <p className="text-sm text-slate-400 mt-1 max-w-[80%]">{selectedSkill.description}</p>
                  </div>
                  <GameIcon
                    iconType="skill"
                    id={selectedSkill.id}
                    name={selectedSkill.name}
                    variant="green"
                    size={56}
                  />
                </div>

                <div className="h-[1px] bg-white/5 w-full" />

                <div className="flex items-center justify-between">
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Requirements</span>
                    <div className="flex gap-2 flex-wrap">
                       {(selectedSkill.allowedClasses && selectedSkill.allowedClasses.length > 0) && (
                         <Badge variant="locked" size="xs">
                           {selectedSkill.allowedClasses.join('/')}
                         </Badge>
                       )}
                       {(selectedSkill.requirements || []).map((req: string) => (
                         <Badge key={req} variant={(player.unlockedSkills || []).includes(req) ? "success" : "default"} size="xs">
                            {req.replace('_', ' ')}
                         </Badge>
                       ))}
                    </div>
                  </div>

                  {(skillLevels[selectedSkill.id] ?? 0) > 0 ? (
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-emerald-400">
                        Lv. {skillLevels[selectedSkill.id] ?? 1} / {selectedSkill.maxLevel}
                      </span>
                      {(skillLevels[selectedSkill.id] ?? 0) < selectedSkill.maxLevel && (
                        <Button
                          variant="primary"
                          disabled={player.skillPoints < selectedSkill.skillPointCost}
                          onClick={() => unlockSkill(selectedSkill.id, selectedSkill.skillPointCost)}
                          className="h-10 px-5 rounded-full font-black text-xs shadow-xl"
                        >
                          Level Up
                        </Button>
                      )}
                    </div>
                  ) : (
                    <Button
                      variant={player.skillPoints >= selectedSkill.skillPointCost && (selectedSkill.requirements || []).every((r: string) => (player.unlockedSkills || []).includes(r) || r === 'basic_attack') ? "primary" : "secondary"}
                      disabled={player.skillPoints < selectedSkill.skillPointCost || !(selectedSkill.requirements || []).every((r: string) => (player.unlockedSkills || []).includes(r) || r === 'basic_attack')}
                      onClick={() => unlockSkill(selectedSkill.id, selectedSkill.skillPointCost)}
                      className="h-12 px-8 rounded-full font-black text-sm shadow-xl"
                    >
                      Learn
                    </Button>
                  )}

                  <button 
                    onClick={() => setSelectedSkill(null)}
                    className="text-[9px] font-bold text-slate-500 hover:text-slate-400 uppercase py-2 cursor-pointer outline-none shrink-0"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Modal>
  );
}

