'use client';

import React, { useEffect, useRef } from 'react';
import { useGameStore } from '@/store/useGameStore';
import { useNetworkStore } from '@/store/useNetworkStore';

const INPUT_RATE_MS = 50;
const PING_INTERVAL_MS = 2000;
const LATENCY_REPORT_INTERVAL_MS = 5000;

export function NetworkManager({ playerName, characterId }: { playerName: string; characterId: string | null }) {
  const initSocket = useNetworkStore(state => state.initSocket);
  const inputSeqRef = useRef(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    inputSeqRef.current = 0;
    initSocket(playerName, characterId);

    const inputInterval = setInterval(() => {
      const gs = useGameStore.getState();
      const ns = useNetworkStore.getState();

      if (!ns.socket?.connected) return;

      const dir = gs.inputDirection || { x: 0, z: 0 };
      inputSeqRef.current++;
      ns.sendInput({
        dirX: dir.x,
        dirZ: dir.z,
        seq: inputSeqRef.current,
      });
    }, INPUT_RATE_MS);

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
      clearInterval(inputInterval);
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
