import { useEffect, useState } from 'react';
import type {
  LoadoutCategory,
  MineGameActions,
  MineGameViewState,
  PartTier,
  ResistancePartTier,
  UiNotice,
} from './GameSurface.types';
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
  contractId: string;
  onGameComplete: () => void;
}

const createPlanetSeed = (sessionId: number): string => `ui-seed-${sessionId}`;

export function MineGameGame({
  userAddress,
  contractId,
  onGameComplete,
}: MineGameGameProps) {
  const [screen, setScreen] = useState<'menu' | 'game'>('menu');
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
    createMineGameContractAdapter({ contractId })
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
    appendDebugLine('Entered start menu');
  }, []);

  const startFromMenu = async () => {
    if (loading) return;
    setLoading(true);
    const nextSessionId = createRandomSessionId();
    const nextAdapter = createMineGameEngineAdapter({
      sessionId: nextSessionId,
      userAddress,
      planetSeed: createPlanetSeed(nextSessionId),
    });
    const nextContractAdapter = createMineGameContractAdapter();
    const resolvedContractId = contractId || nextContractAdapter.getContractId();
    appendDebugLine(`Using contract ${resolvedContractId || '(none configured)'}`, nextSessionId);
    const nextConfiguredContractAdapter = createMineGameContractAdapter({ contractId: resolvedContractId });
    const startGameResult = await nextConfiguredContractAdapter.startGame({
      sessionId: nextSessionId,
      playerAddress: userAddress,
      playerPoints: 0n,
    });
    if (!startGameResult.ok) {
      setNotice({
        tone: 'error',
        message: startGameResult.message,
      });
      setLoading(false);
      return;
    }

    setEngineAdapter(nextAdapter);
    setContractAdapter(nextConfiguredContractAdapter);
    setSessionId(nextSessionId);
    setViewState(nextAdapter.getViewState());
    setEngineStateJson(JSON.stringify(nextAdapter.getEngineState(), null, 2));
    setProofJson(null);
    setNotice(null);
    setScreen('game');
    const time = new Date().toLocaleTimeString();
    const createdLine = `${time} Session ${nextSessionId} created`;
    const chainStartLine = `${time} Contract start_game: ${startGameResult.status} (${startGameResult.message})`;
    const enteredBuildLine = `${time} Entered BUILD screen`;
    console.log(`[MineGame][Session ${nextSessionId}] ${createdLine}`);
    console.log(`[MineGame][Session ${nextSessionId}] ${chainStartLine}`);
    console.log(`[MineGame][Session ${nextSessionId}] ${enteredBuildLine}`);
    setDebugLines([createdLine, chainStartLine, enteredBuildLine]);
    setLoading(false);
  };

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
    const nextContractAdapter = createMineGameContractAdapter({ contractId });
    setEngineAdapter(nextAdapter);
    setContractAdapter(nextContractAdapter);
    setSessionId(nextSessionId);
    setViewState(nextAdapter.getViewState());
    setEngineStateJson(JSON.stringify(nextAdapter.getEngineState(), null, 2));
    setProofJson(null);
    setNotice(null);
    setLoading(false);
    setScreen('menu');
    const time = new Date().toLocaleTimeString();
    const createdLine = `${time} Session ${nextSessionId} created`;
    const resetLine = `${time} Returned to start menu`;
    console.log(`[MineGame][Session ${nextSessionId}] ${createdLine}`);
    console.log(`[MineGame][Session ${nextSessionId}] ${resetLine}`);
    setDebugLines([createdLine, resetLine]);
  };

  const setPartTier = (category: LoadoutCategory, tier: PartTier | ResistancePartTier) => {
    if (loading) return;
    const resultBundle = engineAdapter.applyAction({
      type: 'set_part_tier',
      category,
      tier,
    });
    setNotice(resultBundle.notice);
    setViewState(engineAdapter.getViewState());
    setEngineStateJson(JSON.stringify(engineAdapter.getEngineState(), null, 2));
    appendDebugLine(
      resultBundle.result.ok
        ? `Part updated: ${category}=${tier}`
        : `Part update rejected (${resultBundle.result.error?.code ?? 'unknown'})`
    );
  };

  const moveToNode = (targetNodeId: number, extract: boolean) => {
    if (loading) return;
    const currentId = engineAdapter.getEngineState().currentNodeId;
    let direction: 'left' | 'right' | 'up';
    if (targetNodeId === currentId * 2) direction = 'left';
    else if (targetNodeId === currentId * 2 + 1) direction = 'right';
    else if (targetNodeId === Math.floor(currentId / 2) && currentId > 1) direction = 'up';
    else return;

    const resultBundle = engineAdapter.applyAction({ type: 'move', direction, extract });
    setNotice(resultBundle.notice);
    setViewState(engineAdapter.getViewState());
    setEngineStateJson(JSON.stringify(engineAdapter.getEngineState(), null, 2));
    appendDebugLine(
      resultBundle.result.ok
        ? `Moved ${direction} to node ${targetNodeId} (extract=${extract})`
        : `Move rejected (${resultBundle.result.error?.code ?? 'unknown'})`
    );
  };

  const evacuate = () => {
    if (loading) return;
    const resultBundle = engineAdapter.applyAction({ type: 'evacuate' });
    setNotice(resultBundle.notice);
    setViewState(engineAdapter.getViewState());
    setEngineStateJson(JSON.stringify(engineAdapter.getEngineState(), null, 2));
    appendDebugLine(
      resultBundle.result.ok
        ? `Evacuated`
        : `Evacuate rejected (${resultBundle.result.error?.code ?? 'unknown'})`
    );
  };

  const surfacedState: MineGameViewState = {
    ...viewState,
    loading,
  };

  const actions: MineGameActions = {
    goToNextPhase,
    resetScreens,
    setPartTier,
    moveToNode,
    evacuate,
  };

  if (screen === 'menu') {
    return (
      <div className="relative h-full w-full bg-white/70 backdrop-blur-xl rounded-none p-0 shadow-xl border-2 border-purple-200 flex items-center justify-center">
        <div className="rounded-lg border border-green-900/30 bg-white/80 px-6 py-5 text-center">
          <p className="text-xs tracking-[0.2em] text-green-950 font-semibold">STELLAR EXPLORER</p>
          <h2 className="mt-2 text-2xl font-black text-green-950">START MENU</h2>
          <p className="mt-2 text-sm text-green-950/85">Start a new run to enter BUILD phase.</p>
          <button
            type="button"
            className="mt-4 h-[30px] px-4 rounded text-sm bg-purple-700 text-white font-semibold disabled:opacity-60"
            onClick={startFromMenu}
            disabled={loading}
          >
            {loading ? 'Starting...' : 'Start Game'}
          </button>
        </div>
      </div>
    );
  }

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
