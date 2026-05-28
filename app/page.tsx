'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { AuthForm } from '@/components/auth/AuthForm';
import { CharacterSelect } from '@/components/auth/CharacterSelect';
import { GameWrapper } from '@/components/game/GameWrapper';
import { LoadingScreen } from '@/components/game/LoadingScreen';
import { AnimatePresence, motion } from 'framer-motion';

type AppScreen = 'auth' | 'character-select' | 'loading' | 'game';

export default function Home() {
  const { session, user, loading: authLoading, signOut } = useAuth();
  const [screen, setScreen] = useState<AppScreen>('loading');
  const [selectedCharacter, setSelectedCharacter] = useState<any>(null);

  useEffect(() => {
    if (authLoading) return;

    if (!session) {
      setScreen('auth');
      return;
    }

    setScreen('character-select');
  }, [session, authLoading]);

  const handleSelectCharacter = (character: any) => {
    if (!character || !character.state) {
      console.error('Invalid character selected');
      return;
    }

    setSelectedCharacter(character);
    setScreen('loading');

    import('@/store/useGameStore').then(({ useGameStore }) => {
      useGameStore.getState().loadCharacter(character.state);
    });

    // Cinematic delay for world entry
    setTimeout(() => {
      setScreen('game');
    }, 2500);
  };

  const handleLogout = async () => {
    await signOut();
    setScreen('auth');
    setSelectedCharacter(null);
  };

  return (
    <div className="bg-slate-950 min-h-[100dvh] w-full relative overflow-hidden">
      <AnimatePresence mode="wait">
        {screen === 'auth' && (
          <motion.div
            key="auth"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="h-[100dvh] w-full"
          >
             <AuthForm />
          </motion.div>
        )}

        {screen === 'character-select' && (
          <motion.div
            key="select"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="h-[100dvh] w-full overflow-y-auto"
          >
             <CharacterSelect onSelect={handleSelectCharacter} onLogout={handleLogout} />
          </motion.div>
        )}

        {screen === 'loading' && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="h-[100dvh] w-full"
          >
             <LoadingScreen />
          </motion.div>
        )}

        {screen === 'game' && (
          <motion.div
            key="game"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="h-[100dvh] w-full bg-black overflow-hidden touch-none"
          >
            <div className="game-container relative w-full h-full overflow-hidden bg-slate-900">
               <GameWrapper characterName={selectedCharacter?.state?.name || 'Hero'} characterId={selectedCharacter?.id || null} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
