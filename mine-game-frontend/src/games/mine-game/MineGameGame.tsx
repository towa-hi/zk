import { useEffect, useRef, useState } from 'react';
import { MineGameService } from './mineGameService';
import { useWallet } from '@/hooks/useWallet';
import { MINE_GAME_CONTRACT, RPC_URL } from '@/utils/constants';
import type { Game } from './bindings';
import type { MineGameActions, MineGameViewState, UiNotice } from './GameSurface.types';
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

const mineGameService = new MineGameService(MINE_GAME_CONTRACT);
const LEDGER_INTERVAL_MS = 5000;
const LEDGER_SYNC_INTERVAL_MS = 15000;

const deriveHorizonUrl = (rpcUrl: string): string => {
  if (rpcUrl.includes('futurenet')) return 'https://horizon-futurenet.stellar.org';
  if (rpcUrl.includes('testnet')) return 'https://horizon-testnet.stellar.org';
  return 'https://horizon.stellar.org';
};

interface MineGameGameProps {
  userAddress: string;
  currentEpoch: number;
  availablePoints: bigint;
  initialXDR?: string | null;
  initialSessionId?: number | null;
  onStandingsRefresh: () => void;
  onGameComplete: () => void;
}

export function MineGameGame({
  userAddress,
  availablePoints: _availablePoints,
  initialSessionId: _initialSessionId,
  onStandingsRefresh,
  onGameComplete,
}: MineGameGameProps) {
  const DEFAULT_START_POINTS = 1_000_000n; // 0.1 with 7 decimals

  const { getContractSigner } = useWallet();
  const [sessionId, setSessionId] = useState<number>(() => createRandomSessionId());
  const [guess, setGuess] = useState<number | null>(null);
  const [gameState, setGameState] = useState<Game | null>(null);
  const [phase, setPhase] = useState<'create' | 'guess' | 'complete'>('create');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<UiNotice | null>(null);
  const [nextLedgerCountdownMs, setNextLedgerCountdownMs] = useState<number | null>(null);
  const [countdownStatus, setCountdownStatus] = useState<'syncing' | 'live' | 'error'>('syncing');
  const actionLock = useRef(false);
  const nextLedgerCloseAtMsRef = useRef<number | null>(null);

  const runAction = async (action: () => Promise<void>) => {
    if (actionLock.current || loading) return;
    actionLock.current = true;
    try {
      await action();
    } finally {
      actionLock.current = false;
    }
  };

  const applyGameState = (game: Game | null) => {
    setGameState(game);
    if (!game) {
      setPhase('create');
      return;
    }
    if (game.winner !== null && game.winner !== undefined) {
      setPhase('complete');
    } else {
      setPhase('guess');
    }
  };

  const loadGameState = async (id: number) => {
    const game = await mineGameService.getGame(id);
    applyGameState(game);
    return game;
  };

  const resetForNewGame = () => {
    if (gameState?.winner) {
      onGameComplete();
    }
    setSessionId(createRandomSessionId());
    setGuess(null);
    setGameState(null);
    setPhase('create');
    setLoading(false);
    setNotice(null);
  };

  useEffect(() => {
    if (phase === 'create') return;
    const interval = setInterval(() => {
      loadGameState(sessionId).catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [phase, sessionId]);

  useEffect(() => {
    let cancelled = false;
    const horizonUrl = deriveHorizonUrl(RPC_URL);

    const syncNextLedger = async () => {
      try {
        const response = await fetch(`${horizonUrl}/ledgers?order=desc&limit=1`);
        if (!response.ok) {
          throw new Error(`Failed to fetch latest ledger: ${response.status}`);
        }
        const payload = await response.json();
        const latestLedger = payload?._embedded?.records?.[0];
        const closedAt = latestLedger?.closed_at;
        const closedAtMs = typeof closedAt === 'string' ? Date.parse(closedAt) : Number.NaN;
        if (!Number.isFinite(closedAtMs)) {
          throw new Error('Latest ledger close time is missing');
        }

        nextLedgerCloseAtMsRef.current = closedAtMs + LEDGER_INTERVAL_MS;
        if (!cancelled) {
          setCountdownStatus('live');
          setNextLedgerCountdownMs(Math.max(0, nextLedgerCloseAtMsRef.current - Date.now()));
        }
      } catch (_error) {
        if (!cancelled) {
          setCountdownStatus('error');
          setNextLedgerCountdownMs(null);
        }
      }
    };

    void syncNextLedger();

    const tickInterval = setInterval(() => {
      const targetMs = nextLedgerCloseAtMsRef.current;
      if (targetMs === null) return;

      const now = Date.now();
      if (now >= targetMs) {
        const intervalsAhead = Math.floor((now - targetMs) / LEDGER_INTERVAL_MS) + 1;
        nextLedgerCloseAtMsRef.current = targetMs + intervalsAhead * LEDGER_INTERVAL_MS;
      }

      const nextTargetMs = nextLedgerCloseAtMsRef.current;
      if (nextTargetMs !== null) {
        setNextLedgerCountdownMs(Math.max(0, nextTargetMs - Date.now()));
      }
    }, 250);

    const syncInterval = setInterval(() => {
      void syncNextLedger();
    }, LEDGER_SYNC_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(tickInterval);
      clearInterval(syncInterval);
    };
  }, []);

  const handleCreateGame = async () => {
    await runAction(async () => {
      try {
        setLoading(true);
        setNotice(null);
        const points = DEFAULT_START_POINTS;
        const signer = getContractSigner();
        await mineGameService.startSinglePlayer(sessionId, userAddress, points, signer);
        await loadGameState(sessionId);
        setPhase('guess');
        setNotice({ tone: 'success', message: 'Game created. Make your guess.' });
        onStandingsRefresh();
      } catch (err) {
        setNotice({ tone: 'error', message: err instanceof Error ? err.message : 'Failed to create game' });
      } finally {
        setLoading(false);
      }
    });
  };

  const handleSubmitGuess = async () => {
    if (guess === null) {
      setNotice({ tone: 'error', message: 'Select a number to guess' });
      return;
    }

    await runAction(async () => {
      try {
        setLoading(true);
        setNotice(null);
        const signer = getContractSigner();
        await mineGameService.makeGuess(sessionId, userAddress, guess, signer);
        await loadGameState(sessionId);
        setNotice({ tone: 'success', message: `Guess submitted: ${guess}. Reveal to see the result.` });
      } catch (err) {
        setNotice({ tone: 'error', message: err instanceof Error ? err.message : 'Failed to submit guess' });
      } finally {
        setLoading(false);
      }
    });
  };

  const handleReveal = async () => {
    await runAction(async () => {
      try {
        setLoading(true);
        setNotice(null);
        const signer = getContractSigner();
        await mineGameService.revealWinner(sessionId, userAddress, signer);
        const updated = await loadGameState(sessionId);
        const didWin = updated?.winner === userAddress;
        setNotice({ tone: 'success', message: didWin ? 'You won! 🎉' : 'House won this round.' });
        onStandingsRefresh();
      } catch (err) {
        setNotice({ tone: 'error', message: err instanceof Error ? err.message : 'Failed to reveal winner' });
      } finally {
        setLoading(false);
      }
    });
  };

  const hasGuessed = gameState?.player1_guess !== null && gameState?.player1_guess !== undefined;
  const canReveal = hasGuessed && !gameState?.winner;
  const playerWon = gameState?.winner === userAddress;
  const viewState: MineGameViewState = {
    sessionId,
    phase,
    loading,
    selectedGuess: guess,
    playerGuess: gameState?.player1_guess ?? null,
    houseGuess: gameState?.player2_guess ?? null,
    winningNumber: gameState?.winning_number ?? null,
    playerWon,
    hasGuessed,
    canReveal,
  };

  const actions: MineGameActions = {
    startGame: handleCreateGame,
    selectGuess: setGuess,
    submitGuess: handleSubmitGuess,
    revealWinner: handleReveal,
    startNewGame: resetForNewGame,
  };

  const debugText =
    countdownStatus === 'error'
      ? 'Next block: unavailable'
      : countdownStatus === 'syncing' || nextLedgerCountdownMs === null
        ? 'Next block: --'
        : `Next block: ${(nextLedgerCountdownMs / 1000).toFixed(1)}s`;

  return (
    <MineGameSurface
      userAddress={userAddress}
      state={viewState}
      actions={actions}
      notice={notice}
      debugText={debugText}
    />
  );
}
