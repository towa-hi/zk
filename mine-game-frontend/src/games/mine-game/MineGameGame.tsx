import { useEffect, useRef, useState } from 'react';
import { MineGameService } from './mineGameService';
import { requestCache, createCacheKey } from '@/utils/requestCache';
import { useWallet } from '@/hooks/useWallet';
import { MINE_GAME_CONTRACT } from '@/utils/constants';
import type { Game } from './bindings';

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
  availablePoints,
  initialSessionId,
  onStandingsRefresh,
  onGameComplete,
}: MineGameGameProps) {
  const DEFAULT_POINTS = '0.1';
  const POINTS_DECIMALS = 7;

  const { getContractSigner } = useWallet();
  const [sessionId, setSessionId] = useState<number>(() => createRandomSessionId());
  const [playerPoints, setPlayerPoints] = useState(DEFAULT_POINTS);
  const [loadSessionId, setLoadSessionId] = useState('');
  const [guess, setGuess] = useState<number | null>(null);
  const [gameState, setGameState] = useState<Game | null>(null);
  const [phase, setPhase] = useState<'create' | 'guess' | 'complete'>('create');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const actionLock = useRef(false);

  const parsePoints = (value: string): bigint | null => {
    try {
      const cleaned = value.replace(/[^\d.]/g, '');
      if (!cleaned || cleaned === '.') return null;
      const [whole = '0', fraction = ''] = cleaned.split('.');
      const paddedFraction = fraction.padEnd(POINTS_DECIMALS, '0').slice(0, POINTS_DECIMALS);
      return BigInt(whole + paddedFraction);
    } catch {
      return null;
    }
  };

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
    setError(null);
    setSuccess(null);
    setPlayerPoints(DEFAULT_POINTS);
    setLoadSessionId('');
  };

  useEffect(() => {
    if (phase === 'create') return;
    const interval = setInterval(() => {
      loadGameState(sessionId).catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [phase, sessionId]);

  useEffect(() => {
    if (initialSessionId) {
      setLoadSessionId(initialSessionId.toString());
    }
  }, [initialSessionId]);

  const handleCreateGame = async () => {
    await runAction(async () => {
      try {
        setLoading(true);
        setError(null);
        setSuccess(null);
        const points = parsePoints(playerPoints);
        if (!points || points <= 0n) {
          throw new Error('Enter a valid points amount');
        }
        const signer = getContractSigner();
        await mineGameService.startSinglePlayer(sessionId, userAddress, points, signer);
        await loadGameState(sessionId);
        setPhase('guess');
        setSuccess('Game created. Make your guess.');
        onStandingsRefresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create game');
      } finally {
        setLoading(false);
      }
    });
  };

  const handleLoadGame = async () => {
    await runAction(async () => {
      try {
        setLoading(true);
        setError(null);
        setSuccess(null);
        const parsedSessionId = parseInt(loadSessionId.trim(), 10);
        if (isNaN(parsedSessionId) || parsedSessionId <= 0) {
          throw new Error('Enter a valid session ID');
        }

        const game = await requestCache.dedupe(
          createCacheKey('mine-game-state', parsedSessionId),
          () => mineGameService.getGame(parsedSessionId),
          5000
        );
        if (!game) {
          throw new Error('Game not found');
        }
        if (game.player1 !== userAddress) {
          throw new Error('This is not your single-player game');
        }

        setSessionId(parsedSessionId);
        applyGameState(game);
        setSuccess('Game loaded.');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load game');
      } finally {
        setLoading(false);
      }
    });
  };

  const handleSubmitGuess = async () => {
    if (guess === null) {
      setError('Select a number to guess');
      return;
    }

    await runAction(async () => {
      try {
        setLoading(true);
        setError(null);
        setSuccess(null);
        const signer = getContractSigner();
        await mineGameService.makeGuess(sessionId, userAddress, guess, signer);
        await loadGameState(sessionId);
        setSuccess(`Guess submitted: ${guess}. Reveal to see the result.`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to submit guess');
      } finally {
        setLoading(false);
      }
    });
  };

  const handleReveal = async () => {
    await runAction(async () => {
      try {
        setLoading(true);
        setError(null);
        setSuccess(null);
        const signer = getContractSigner();
        await mineGameService.revealWinner(sessionId, userAddress, signer);
        const updated = await loadGameState(sessionId);
        const didWin = updated?.winner === userAddress;
        setSuccess(didWin ? 'You won! 🎉' : 'House won this round.');
        onStandingsRefresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to reveal winner');
      } finally {
        setLoading(false);
      }
    });
  };

  const hasGuessed = gameState?.player1_guess !== null && gameState?.player1_guess !== undefined;
  const canReveal = hasGuessed && !gameState?.winner;
  const playerWon = gameState?.winner === userAddress;

  return (
    <div className="bg-white/70 backdrop-blur-xl rounded-2xl p-8 shadow-xl border-2 border-purple-200">
      <div className="flex items-center mb-6">
        <div>
          <h2 className="text-3xl font-black bg-gradient-to-r from-purple-600 via-pink-600 to-red-600 bg-clip-text text-transparent">
            Mine Game (Single Player) 🎲
          </h2>
          <p className="text-sm text-gray-700 font-semibold mt-1">
            Guess a number 1-10 and beat the house.
          </p>
          <p className="text-xs text-gray-500 font-mono mt-1">Session ID: {sessionId}</p>
        </div>
      </div>

      {error && <div className="mb-4 notice error">{error}</div>}
      {success && <div className="mb-4 notice success">{success}</div>}

      {phase === 'create' && (
        <div className="space-y-6">
          <div className="card">
            <h3 className="font-bold text-lg">Create New Single-Player Game</h3>
            <div className="mt-3">
              <label className="block text-sm font-bold text-gray-700 mb-2">Your Points</label>
              <input
                type="text"
                value={playerPoints}
                onChange={(e) => setPlayerPoints(e.target.value)}
                placeholder="0.1"
              />
              <p className="text-xs text-gray-600 mt-2">
                Available: {(Number(availablePoints) / 10_000_000).toFixed(2)} Points
              </p>
            </div>
            <button className="mt-4 w-full" disabled={loading} onClick={handleCreateGame}>
              {loading ? 'Creating...' : 'Start Game'}
            </button>
          </div>

          <div className="card">
            <h3 className="font-bold text-lg">Load Existing Game</h3>
            <div className="mt-3">
              <label className="block text-sm font-bold text-gray-700 mb-2">Session ID</label>
              <input
                type="text"
                value={loadSessionId}
                onChange={(e) => setLoadSessionId(e.target.value)}
                placeholder="Enter session ID"
              />
            </div>
            <button className="mt-4 w-full" disabled={loading || !loadSessionId.trim()} onClick={handleLoadGame}>
              {loading ? 'Loading...' : 'Load Game'}
            </button>
          </div>
        </div>
      )}

      {phase === 'guess' && gameState && (
        <div className="space-y-6">
          <div className="card">
            <p className="text-sm">
              <strong>Your guess:</strong>{' '}
              {gameState.player1_guess !== null && gameState.player1_guess !== undefined
                ? gameState.player1_guess
                : 'Not submitted yet'}
            </p>
            <p className="text-sm mt-1">
              <strong>House guess:</strong> {gameState.player2_guess ?? 'Hidden until reveal'}
            </p>
          </div>

          {!hasGuessed && (
            <div className="space-y-4">
              <label className="block text-sm font-bold text-gray-700">Pick your number (1-10)</label>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                  <button
                    key={num}
                    onClick={() => setGuess(num)}
                    className={`p-4 rounded-xl border-2 font-black text-xl transition-all ${
                      guess === num
                        ? 'border-purple-500 bg-gradient-to-br from-purple-500 to-pink-500 text-white'
                        : 'border-gray-200 bg-white hover:border-purple-300'
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
              <button className="w-full" disabled={loading || guess === null} onClick={handleSubmitGuess}>
                {loading ? 'Submitting...' : 'Submit Guess'}
              </button>
            </div>
          )}

          {canReveal && (
            <button className="w-full" disabled={loading} onClick={handleReveal}>
              {loading ? 'Revealing...' : 'Reveal Winner'}
            </button>
          )}
        </div>
      )}

      {phase === 'complete' && gameState && (
        <div className="space-y-6">
          <div className="card">
            <h3 className="text-2xl font-black mb-2">Game Complete</h3>
            <p><strong>Winning number:</strong> {gameState.winning_number}</p>
            <p><strong>Your guess:</strong> {gameState.player1_guess}</p>
            <p><strong>House guess:</strong> {gameState.player2_guess}</p>
            <p className="mt-3 font-bold">{playerWon ? 'You won! 🎉' : 'House wins this round.'}</p>
          </div>
          <button className="w-full" onClick={resetForNewGame}>Start New Game</button>
        </div>
      )}
    </div>
  );
}
