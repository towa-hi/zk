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
import { buildProofPayload } from './engine/proofPayload';
import { encodeLoadout } from './engine/sharedEncoding';
import { generateProof } from './services/MineGameCircomService';
import { computePoseidonCommitment } from './services/circomCommitment';
import spaceTexture from './assets/space.jpg';

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
    setNotice({
      tone: 'info',
      message: 'Submitting start_game and waiting for on-chain confirmation...',
    });
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
    if (phase === 'build') {
      const salt = `ui-auto-${Date.now()}`;
      const encodedLoadout = encodeLoadout(engineAdapter.getEngineState().loadout);
      const predictedCommitment = (
        await computePoseidonCommitment({
          statementVersion: 2,
          sessionId,
          loadout: [...encodedLoadout],
          salt,
        })
      ).commitmentTagged;
      setNotice({
        tone: 'info',
        message: 'Submitting commit_loadout and waiting for on-chain confirmation...',
      });
      const commitResult = await contractAdapter.commitLoadout({
        sessionId,
        playerAddress: userAddress,
        commitment: predictedCommitment,
      });
      appendDebugLine(`Contract commit: ${commitResult.status} (${commitResult.message})`);
      if (!commitResult.ok) {
        setNotice({
          tone: 'error',
          message: commitResult.message,
        });
        setLoading(false);
        return;
      }

      const resultBundle = engineAdapter.applyAction({ type: 'confirm_build', salt });
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
      setLoading(false);
      return;
    }

    if (phase === 'prove') {
      let payload;
      try {
        payload = buildProofPayload(engineAdapter.getEngineState());
      } catch (error) {
        setNotice({
          tone: 'error',
          message: error instanceof Error ? error.message : 'Failed to build proof payload',
        });
        setLoading(false);
        return;
      }

      setNotice({
        tone: 'info',
        message: 'Preparing Circom proof payload...',
      });
      appendDebugLine('Starting Circom payload generation...');

      try {
        const { proof, publicSignals, commitment } = await generateProof(payload);

        appendDebugLine(
          `Payload generated (proof=${proof.length} fields, publicSignals=${publicSignals.length})`
        );
        payload.publicInputs.commitment = commitment;
        payload.circom = { proof, publicSignals };
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown proof generation error';
        appendDebugLine(`Proof generation failed: ${msg}`);
        setNotice({
          tone: 'error',
          message: `Proof generation failed: ${msg}`,
        });
        setLoading(false);
        return;
      }

      setNotice({
        tone: 'info',
        message: 'Submitting proof on-chain...',
      });
      const submitResult = await contractAdapter.submitProof({
        sessionId,
        playerAddress: userAddress,
        payload,
      });
      appendDebugLine(`Contract proof submit: ${submitResult.status} (${submitResult.message})`);
      if (!submitResult.ok) {
        setNotice({
          tone: 'error',
          message: submitResult.message,
        });
        setLoading(false);
        return;
      }
      if (submitResult.status !== 'submitted') {
        setNotice({
          tone: 'error',
          message: `Proof not confirmed on-chain (${submitResult.status}). Staying on PROVE screen.`,
        });
        setLoading(false);
        return;
      }

      const resultBundle = engineAdapter.applyAction({ type: 'request_proof_payload' });
      setNotice(resultBundle.notice);
      setViewState(engineAdapter.getViewState());
      setEngineStateJson(JSON.stringify(engineAdapter.getEngineState(), null, 2));
      setProofJson(JSON.stringify(payload, (_key, value) =>
        value instanceof Uint8Array ? `Uint8Array(${value.length})` : value
      , 2));
      appendDebugLine(
        resultBundle.result.ok
          ? `Action applied; now in ${engineAdapter.getViewState().phase.toUpperCase()}`
          : `Action rejected (${resultBundle.result.error?.code ?? 'unknown'})`
      );
      if (resultBundle.result.ok && engineAdapter.getViewState().phase === 'done') {
        onGameComplete();
      }
      setLoading(false);
      return;
    }

    const resultBundle = phase === 'explore' ? engineAdapter.applyAction({ type: 'evacuate' }) : null;
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
        <div className="!rounded-none relative overflow-hidden min-h-[500px] min-w-[500px] max-h-full max-w-full aspect-square h-full w-full">
          <div
            className="h-full w-full flex items-center justify-center px-6"
            style={{
              backgroundImage: `url(${spaceTexture})`,
              backgroundPosition: 'center',
              backgroundSize: 'cover',
            }}
          >
            <div className="w-full max-w-[520px] rounded-xl border border-purple-300/55 bg-white/82 backdrop-blur-sm px-6 py-5 text-left text-slate-900 shadow-lg">
              <p className="text-xs tracking-[0.2em] text-purple-900 font-semibold">STELLAR EXPLORER</p>
              <h2 className="mt-2 text-2xl font-black text-slate-900">Mission Briefing</h2>
              <p className="mt-2 text-sm text-slate-800/90">
                Tune your probe, head into Planet Alpha, and come back with the best haul you can.
              </p>
              <p className="mt-2 text-[13px] leading-snug text-slate-800/85">
                Every branch is a gamble: deeper paths pay better, but they hit harder.
                Keep your hull and fuel in check, and know when to bail.
              </p>

              <div className="mt-4 space-y-2 text-[13px] leading-snug">
                <p><span className="font-semibold">1) Build:</span> Pick parts, stay under weight 20.</p>
                <p><span className="font-semibold">2) Explore:</span> Move through biomes, take damage, collect resources.</p>
                <p><span className="font-semibold">3) Survive:</span> Evacuate to keep more, or ditch the probe and keep a little.</p>
                <p><span className="font-semibold">4) Prove:</span> Submit your zero-knowledge proof to lock in your run.</p>
              </div>

              <button
                type="button"
                className="mt-5 h-[32px] px-4 rounded text-sm bg-purple-700 text-white font-semibold disabled:opacity-60"
                onClick={startFromMenu}
                disabled={loading}
              >
                {loading ? 'Launching...' : 'Start Mission'}
              </button>
            </div>
          </div>
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
