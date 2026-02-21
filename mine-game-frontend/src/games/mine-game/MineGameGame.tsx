import { useEffect, useState } from 'react';
import type { MineGameActions, MineGameViewState, UiNotice } from './GameSurface.types';
import { MineGameSurface } from './MineGameSurface';
import { createMineGameEngineAdapter } from './mineGameEngineAdapter';
import { createMineGameContractAdapter } from './mineGameContractAdapter';

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

const createPlanetSeed = (sessionId: number): string => `ui-seed-${sessionId}`;

export function MineGameGame({
  userAddress,
  onGameComplete,
}: MineGameGameProps) {
  const [sessionId, setSessionId] = useState<number>(() => createRandomSessionId());
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<UiNotice | null>(null);
  const [proofJson, setProofJson] = useState<string | null>(null);
  const [engineStateJson, setEngineStateJson] = useState<string>('');
  const [engineAdapter, setEngineAdapter] = useState(() =>
    createMineGameEngineAdapter({
      sessionId,
      userAddress,
      planetSeed: createPlanetSeed(sessionId),
    })
  );
  const [contractAdapter, setContractAdapter] = useState(() =>
    createMineGameContractAdapter()
  );
  const [viewState, setViewState] = useState<MineGameViewState>(() => engineAdapter.getViewState());
  const [debugLines, setDebugLines] = useState<string[]>([]);

  const appendDebugLine = (message: string, sessionOverride?: number) => {
    const time = new Date().toLocaleTimeString();
    const logSessionId = sessionOverride ?? sessionId;
    const nextLine = `${time} ${message}`;
    console.log(`[MineGame][Session ${logSessionId}] ${nextLine}`);
    setDebugLines((current) => [...current.slice(-6), nextLine]);
  };

  useEffect(() => {
    setEngineStateJson(JSON.stringify(engineAdapter.getEngineState(), null, 2));
    setViewState(engineAdapter.getViewState());
    appendDebugLine('Entered BUILD screen');
  }, []);

  const goToNextPhase = async () => {
    if (loading) return;
    setLoading(true);
    const phase = engineAdapter.getViewState().phase;
    appendDebugLine(`Engine action requested from ${phase.toUpperCase()}`);

    const resultBundle =
      phase === 'build'
        ? engineAdapter.applyAction({ type: 'confirm_build', salt: `ui-auto-${Date.now()}` })
        : phase === 'explore'
          ? engineAdapter.applyAction({ type: 'evacuate' })
          : phase === 'prove'
            ? engineAdapter.applyAction({ type: 'request_proof_payload' })
            : null;

    if (resultBundle) {
      setNotice(resultBundle.notice);
      setViewState(engineAdapter.getViewState());
      setEngineStateJson(JSON.stringify(engineAdapter.getEngineState(), null, 2));
      const proofPayload = engineAdapter.getProofPayload();
      setProofJson(proofPayload ? JSON.stringify(proofPayload, null, 2) : null);
      appendDebugLine(
        resultBundle.result.ok
          ? `Action applied; now in ${engineAdapter.getViewState().phase.toUpperCase()}`
          : `Action rejected (${resultBundle.result.error?.code ?? 'unknown'})`
      );
      if (resultBundle.result.ok && phase === 'prove' && engineAdapter.getViewState().phase === 'done') {
        onGameComplete();
      }

      if (resultBundle.result.ok && phase === 'build') {
        const commitResult = await contractAdapter.commitLoadout({
          sessionId,
          playerAddress: userAddress,
          commitment: engineAdapter.getEngineState().commitment,
        });
        appendDebugLine(`Contract commit: ${commitResult.status} (${commitResult.message})`);
        if (!commitResult.ok) {
          setNotice({
            tone: 'error',
            message: commitResult.message,
          });
        }
      }

      if (resultBundle.result.ok && phase === 'prove') {
        const submitResult = await contractAdapter.submitProof({
          sessionId,
          playerAddress: userAddress,
          payload: engineAdapter.getProofPayload(),
        });
        appendDebugLine(`Contract proof submit: ${submitResult.status} (${submitResult.message})`);
        if (!submitResult.ok) {
          setNotice({
            tone: 'error',
            message: submitResult.message,
          });
        }
      }
    }
    setLoading(false);
  };

  const resetScreens = () => {
    const nextSessionId = createRandomSessionId();
    const nextAdapter = createMineGameEngineAdapter({
      sessionId: nextSessionId,
      userAddress,
      planetSeed: createPlanetSeed(nextSessionId),
    });
    const nextContractAdapter = createMineGameContractAdapter();
    setEngineAdapter(nextAdapter);
    setContractAdapter(nextContractAdapter);
    setSessionId(nextSessionId);
    setViewState(nextAdapter.getViewState());
    setEngineStateJson(JSON.stringify(nextAdapter.getEngineState(), null, 2));
    setProofJson(null);
    setNotice(null);
    setLoading(false);
    const time = new Date().toLocaleTimeString();
    const createdLine = `${time} Session ${nextSessionId} created`;
    const resetLine = `${time} Reset to BUILD screen`;
    console.log(`[MineGame][Session ${nextSessionId}] ${createdLine}`);
    console.log(`[MineGame][Session ${nextSessionId}] ${resetLine}`);
    setDebugLines([createdLine, resetLine]);
  };

  const surfacedState: MineGameViewState = {
    ...viewState,
    loading,
  };

  const actions: MineGameActions = {
    goToNextPhase,
    resetScreens,
  };

  return (
    <MineGameSurface
      userAddress={userAddress}
      state={surfacedState}
      actions={actions}
      notice={notice}
      debugText={`Session ${sessionId} • ${surfacedState.phase.toUpperCase()} SCREEN\n${debugLines.join('\n')}\n\nENGINE STATE\n${engineStateJson}\n\nPROOF PAYLOAD\n${proofJson ?? '(none yet)'}`}
    />
  );
}
