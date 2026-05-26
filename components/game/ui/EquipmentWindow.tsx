'use client';

import React, { useState } from 'react';
import { useGameStore } from '@/store/useGameStore';
import { Modal, Button, Badge, GameIcon } from '@/components/ui';
import { Sword, Shield, Shirt, Footprints, Crown, Gem } from 'lucide-react';
import { gameData } from '@/shared/loader';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/cn';

const { items } = gameData;

const slotConfig: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  headTop: { label: 'Headgear', icon: <Crown size={15} />, color: 'yellow' },
  weapon: { label: 'Weapon', icon: <Sword size={15} />, color: 'red' },
  armor: { label: 'Armor', icon: <Shirt size={15} />, color: 'blue' },
  shield: { label: 'Shield', icon: <Shield size={15} />, color: 'cyan' },
  shoes: { label: 'Shoes', icon: <Footprints size={15} />, color: 'green' },
  accessory1: { label: 'Accessory', icon: <Gem size={15} />, color: 'purple' },
};

export function EquipmentWindow({ onClose }: { onClose: () => void }) {
  const player = useGameStore((state) => state.player);
  const equippedItems = player?.equippedItems || {};
  const equipItem = useGameStore((state) => state.equipItem);
  const unequipItem = useGameStore((state) => state.unequipItem);
  const getEquippedStats = useGameStore((state) => state.getEquippedStats);
  const equippedStats = (typeof getEquippedStats === 'function' ? getEquippedStats() : null) || {};

  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<any>(null);

  if (!player) return null;

  const equippableItems = (player.inventory || []).filter(i => i.type === 'equip');

  const handleUnequip = (slot: string) => {
    unequipItem(slot as any);
    setSelectedSlot(null);
  };

  const handleEquip = (itemId: string, slot: string) => {
    equipItem(itemId, slot as any);
    setSelectedItem(null);
  };

  const hasBonuses = Object.keys(equippedStats || {}).some(k => k !== 'statPoints' && (equippedStats as any)[k] !== 0);

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Equipment"
      subtitle="Manage your combat gear"
      position="bottom"
      size="md"
    >
      <div className="space-y-4">
        
        {/* Paper Doll Style Grid - 3 Columns for Mobile Compactness */}
        <div className="grid grid-cols-3 gap-2 bg-slate-950/40 p-2.5 rounded-2xl border border-white/5 shadow-xl">
          {Object.entries(slotConfig).map(([slot, config]) => {
            const equippedId = equippedItems[slot];
            const itemDef = equippedId ? items.find(i => i.id === equippedId) : null;
            const isSelected = selectedSlot === slot;

            return (
              <motion.div
                key={slot}
                whileTap={{ scale: 0.96 }}
                onClick={() => {
                  if (itemDef) {
                    setSelectedSlot(isSelected ? null : slot);
                    setSelectedItem(null);
                  }
                }}
                className={cn(
                  "relative flex flex-col items-center justify-center p-2 rounded-xl border transition-all duration-200 cursor-pointer select-none aspect-square text-center",
                  itemDef
                    ? "bg-slate-900/60 border-slate-700/60 shadow-lg hover:border-slate-600"
                    : "bg-slate-950/20 border-dashed border-slate-800 opacity-60",
                  isSelected && "border-indigo-500 bg-indigo-500/10 shadow-[0_0_8px_rgba(99,102,241,0.25)] opacity-100"
                )}
              >
                {itemDef ? (
                  <GameIcon
                    iconType="item"
                    id={itemDef.id}
                    name={itemDef.name}
                    size={28}
                    className="shrink-0"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-lg bg-slate-950/40 border border-slate-800 flex items-center justify-center text-slate-600 shrink-0">
                    {config.icon}
                  </div>
                )}
                
                <span className="text-[7.5px] font-black uppercase text-slate-500 tracking-wider mt-1 truncate max-w-full">
                  {config.label}
                </span>

                {itemDef && (
                  <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-emerald-500 border border-slate-950 animate-pulse" />
                )}
              </motion.div>
            );
          })}
        </div>

        {/* Selected Equipped Item Action Drawer */}
        <AnimatePresence>
          {selectedSlot && (() => {
            const equippedId = equippedItems[selectedSlot];
            const itemDef = equippedId ? items.find(i => i.id === equippedId) : null;
            const config = slotConfig[selectedSlot];
            if (!itemDef) return null;

            return (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                className="bg-slate-900/90 border border-slate-700/60 rounded-xl p-3 shadow-2xl flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-slate-950/50 flex items-center justify-center border border-white/5 shrink-0">
                    <GameIcon
                      iconType="item"
                      id={itemDef.id}
                      name={itemDef.name}
                      size={28}
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-1">
                      <span className="text-[7.5px] font-black uppercase text-indigo-400">{config.label}</span>
                      <h4 className="text-[11px] font-black text-white truncate uppercase leading-none">{itemDef.name}</h4>
                    </div>
                    <div className="flex gap-1 mt-1 overflow-x-auto py-0.5 max-w-[200px] custom-scrollbar">
                      {itemDef.equipStats && Object.entries(itemDef.equipStats).map(([k, v]) => (
                        <Badge key={k} variant="success" size="xs" className="text-[8px] py-0 px-1 font-bold">
                          {k.toUpperCase()} +{v}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleUnequip(selectedSlot)}
                    className="h-8 px-4 text-[10px] font-black uppercase tracking-wider"
                  >
                    Unequip
                  </Button>
                  <button 
                    onClick={() => setSelectedSlot(null)}
                    className="text-[9px] font-bold text-slate-500 hover:text-slate-400 uppercase py-2 cursor-pointer outline-none"
                  >
                    Dismiss
                  </button>
                </div>
              </motion.div>
            );
          })()}
        </AnimatePresence>

        {/* Active Bonuses Panel - Clean & Compact */}
        {hasBonuses && (
          <div className="bg-emerald-950/15 border border-emerald-500/15 p-2.5 rounded-2xl shadow-md">
            <div className="flex items-center gap-1.5 mb-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="text-[8px] font-black uppercase tracking-wider text-slate-400">Gear Attributes Bonus</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {Object.entries(equippedStats || {}).map(([key, val]) => {
                if (key === 'statPoints' || val === 0) return null;
                return (
                  <Badge key={key} variant="success" size="xs" className="bg-emerald-500/10 border-emerald-500/20 text-emerald-400 py-0.5 px-1.5 font-black">
                    {key.toUpperCase()} +{val}
                  </Badge>
                );
              })}
            </div>
          </div>
        )}

        {/* Available Gear Section - Grid of Available Items to Equip */}
        <div className="bg-slate-950/40 rounded-2xl border border-white/5 p-3 shadow-xl">
          <div className="flex items-center gap-1.5 mb-2">
            <div className="w-[3px] h-3 bg-indigo-500 rounded-full" />
            <h3 className="text-[8px] font-black uppercase tracking-widest text-slate-400">Available Gear</h3>
          </div>

          <div className="min-h-[120px] relative">
            {equippableItems.length === 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
                <span className="text-[10px] text-slate-600 font-bold uppercase tracking-wider">No equippable gear</span>
                <span className="text-[8px] text-slate-700 font-medium leading-none mt-1">Obtain armor & weapons from drops or shops!</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 xs:grid-cols-2 gap-1.5 max-h-[150px] overflow-y-auto custom-scrollbar pr-1">
                {equippableItems.map(item => {
                  const itemDef = items.find(i => i.id === item.id);
                  const isSelected = selectedItem?.id === item.id;
                  
                  return (
                    <motion.div
                      key={item.id}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setSelectedItem(isSelected ? null : item)}
                      className={cn(
                        "p-2 rounded-xl border flex items-center justify-between gap-2 cursor-pointer select-none transition-all duration-200",
                        isSelected ? "border-indigo-400 bg-indigo-500/10 shadow-[0_0_8px_rgba(99,102,241,0.2)]" : "bg-slate-900/40 border-slate-800 hover:border-slate-700"
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <GameIcon
                          iconType="item"
                          id={item.id}
                          name={item.name}
                          size={24}
                          className="shrink-0"
                        />
                        <div className="min-w-0">
                          <h4 className="text-[10px] font-black text-white truncate uppercase leading-tight">{item.name}</h4>
                          <span className="text-[7.5px] font-bold text-slate-500 uppercase leading-none block">
                            {itemDef?.equipSlot ? slotConfig[itemDef.equipSlot]?.label || 'Gear' : 'Gear'}
                          </span>
                        </div>
                      </div>
                      
                      <div className="shrink-0 flex gap-0.5">
                        {itemDef?.equipStats && Object.entries(itemDef.equipStats).slice(0, 1).map(([k, v]) => (
                          <span key={k} className="px-1 py-0.5 rounded bg-indigo-500/10 text-indigo-400 text-[8px] font-bold leading-none border border-indigo-500/20 animate-pulse">
                            +{v}
                          </span>
                        ))}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Selected Available Item Action Drawer */}
        <AnimatePresence>
          {selectedItem && (() => {
            const itemDef = items.find(i => i.id === selectedItem.id);
            if (!itemDef) return null;

            const slot = itemDef.equipSlot || 'armor';

            return (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                className="bg-slate-900/90 border border-slate-700/60 rounded-xl p-3 shadow-2xl flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-slate-950/50 flex items-center justify-center border border-white/5 shrink-0">
                    <GameIcon
                      iconType="item"
                      id={itemDef.id}
                      name={itemDef.name}
                      size={28}
                    />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-[11px] font-black text-white truncate uppercase leading-none">{itemDef.name}</h4>
                    <p className="text-[9px] text-slate-400 leading-tight mt-1 max-w-[240px]">
                      {itemDef.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleEquip(itemDef.id, slot)}
                    className="h-8 px-4 text-[10px] font-black uppercase tracking-wider"
                  >
                    Equip
                  </Button>
                  <button 
                    onClick={() => setSelectedItem(null)}
                    className="text-[9px] font-bold text-slate-500 hover:text-slate-400 uppercase py-2 cursor-pointer outline-none"
                  >
                    Dismiss
                  </button>
                </div>
              </motion.div>
            );
          })()}
        </AnimatePresence>

      </div>
    </Modal>
  );
}
