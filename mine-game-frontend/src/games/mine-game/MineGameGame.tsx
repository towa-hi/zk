import { useEffect, useState } from 'react';
import type { MineGameActions, MineGameViewState } from './GameSurface.types';
import { MineGameSurface } from './MineGameSurface';

const createRandomSessionId = (): number => {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buffer = new Uint32Array(1);
    let value = 0;
    while (value === 0) {
      crypto.getRandomValues(buffer);
      value = buffer[0];
    }
    return value;
  }
  return (Math.floor(Math.random() * 0xffffffff) >>> 0) || 1;
};

interface MineGameGameProps {
  userAddress: string;
  onGameComplete: () => void;
}

export function MineGameGame({
  userAddress,
  onGameComplete,
}: MineGameGameProps) {
  const [sessionId, setSessionId] = useState<number>(() => createRandomSessionId());
  const [phase, setPhase] = useState<MineGameViewState['phase']>('build');
  const [loading, setLoading] = useState(false);
  const [debugLines, setDebugLines] = useState<string[]>([]);

  const appendDebugLine = (message: string, sessionOverride?: number) => {
    const time = new Date().toLocaleTimeString();
    const logSessionId = sessionOverride ?? sessionId;
    const nextLine = `${time} ${message}`;
    console.log(`[MineGame][Session ${logSessionId}] ${nextLine}`);
    setDebugLines((current) => [...current.slice(-6), nextLine]);
  };

  useEffect(() => {
    appendDebugLine('Entered BUILD screen');
  }, []);

  const goToNextPhase = () => {
    if (loading) return;
    setLoading(true);
    appendDebugLine(`Transition requested from ${phase.toUpperCase()}`);

    if (phase === 'build') {
      setPhase('explore');
      appendDebugLine('Entered EXPLORE screen');
      setLoading(false);
      return;
    }

    if (phase === 'explore') {
      setPhase('prove');
      appendDebugLine('Entered PROVE screen');
      setLoading(false);
      return;
    }

    if (phase === 'prove') {
      setPhase('done');
      appendDebugLine('Entered DONE screen');
      onGameComplete();
      setLoading(false);
      return;
    }

    setLoading(false);
  };

  const resetScreens = () => {
    const nextSessionId = createRandomSessionId();
    setSessionId(nextSessionId);
    setPhase('build');
    setLoading(false);
    const time = new Date().toLocaleTimeString();
    const createdLine = `${time} Session ${nextSessionId} created`;
    const resetLine = `${time} Reset to BUILD screen`;
    console.log(`[MineGame][Session ${nextSessionId}] ${createdLine}`);
    console.log(`[MineGame][Session ${nextSessionId}] ${resetLine}`);
    setDebugLines([createdLine, resetLine]);
  };

  const viewState: MineGameViewState = {
    sessionId,
    phase,
    loading,
  };

  const actions: MineGameActions = {
    goToNextPhase,
    resetScreens,
  };

  return (
    <MineGameSurface
      userAddress={userAddress}
      state={viewState}
      actions={actions}
      debugText={`Session ${sessionId} • ${phase.toUpperCase()} SCREEN\n${debugLines.join('\n')}`}
    />
  );
}
