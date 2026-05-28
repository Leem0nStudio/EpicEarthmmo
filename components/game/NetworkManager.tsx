'use client';

import React, { useEffect } from 'react';
import { useGameStore } from '@/store/useGameStore';
import { useNetworkStore } from '@/store/useNetworkStore';

const PING_INTERVAL_MS = 2000;
const LATENCY_REPORT_INTERVAL_MS = 5000;

export function NetworkManager({ playerName, characterId }: { playerName: string; characterId: string | null }) {
  const initSocket = useNetworkStore(state => state.initSocket);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    initSocket(playerName, characterId);

    const pingInterval = setInterval(() => {
      const ns = useNetworkStore.getState();
      if (!ns.socket?.connected) return;
      ns.socket.emit('ping', { clientTime: Date.now() });
    }, PING_INTERVAL_MS);

    const latencyReportInterval = setInterval(() => {
      const ns = useNetworkStore.getState();
      if (!ns.socket?.connected || ns.rtt <= 0) return;
      ns.updateLatency(ns.rtt);
    }, LATENCY_REPORT_INTERVAL_MS);

    const saveInterval = setInterval(() => {
      useGameStore.getState().saveProgress().catch(() => {});
    }, 60000);

    return () => {
      clearInterval(pingInterval);
      clearInterval(latencyReportInterval);
      clearInterval(saveInterval);
      const s = useNetworkStore.getState().socket;
      if (s) {
        s.disconnect();
      }
    };
  }, [initSocket, playerName, characterId]);

  return null;
}
