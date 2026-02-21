import type { ReactNode } from 'react';

export type UiNoticeTone = 'error' | 'success' | 'info';

export interface UiNotice {
  tone: UiNoticeTone;
  message: string;
}

export type GamePhase = 'create' | 'guess' | 'complete';

export interface MineGameViewState {
  sessionId: number;
  phase: GamePhase;
  loading: boolean;
  selectedGuess: number | null;
  playerGuess: number | null;
  houseGuess: number | null;
  winningNumber: number | null;
  playerWon: boolean;
  hasGuessed: boolean;
  canReveal: boolean;
}

export interface MineGameActions {
  startGame: () => Promise<void>;
  selectGuess: (guess: number) => void;
  submitGuess: () => Promise<void>;
  revealWinner: () => Promise<void>;
  startNewGame: () => void;
}

export interface MineGameSurfaceProps {
  userAddress: string;
  state: MineGameViewState;
  actions: MineGameActions;
  notice?: UiNotice | null;
  debugText?: string;
  renderNotice?: (notice: UiNotice) => ReactNode;
}
