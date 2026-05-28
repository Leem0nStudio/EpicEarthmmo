'use client';

import React from 'react';
import { useGameStore } from '@/store/useGameStore';
import { motion, AnimatePresence } from 'framer-motion';

export function DeathScreen() {
  const deathState = useGameStore((s) => s.deathState);

  return (
    <AnimatePresence>
      {deathState.isDead && (
        <motion.div
          key="death-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="absolute inset-0 z-50 pointer-events-none flex flex-col items-center justify-center"
        >
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative z-10 text-center">
            <motion.h1
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
              className="text-red-500 text-5xl sm:text-7xl font-black italic tracking-tighter uppercase"
            >
              You Died
            </motion.h1>
            <motion.p
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="mt-4 text-red-300/80 text-lg font-bold"
            >
              EXP Lost: <span className="text-red-400">{deathState.expLost.toLocaleString()}</span>
            </motion.p>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.2 }}
              className="mt-6 text-slate-500 text-sm font-semibold uppercase tracking-widest"
            >
              Respawning...
            </motion.p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
