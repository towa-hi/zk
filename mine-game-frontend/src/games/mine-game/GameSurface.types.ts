import type { ReactNode } from 'react';

export type UiNoticeTone = 'error' | 'success' | 'info';

export interface UiNotice {
  tone: UiNoticeTone;
  message: string;
}

export type GamePhase = 'build' | 'explore' | 'prove' | 'done';

export interface MineGameViewState {
  sessionId: number;
  phase: GamePhase;
  loading: boolean;
}

export interface MineGameActions {
  goToNextPhase: () => void;
  resetScreens: () => void;
}

export interface MineGameSurfaceProps {
  userAddress: string;
  state: MineGameViewState;
  actions: MineGameActions;
  notice?: UiNotice | null;
  debugText?: string;
  renderNotice?: (notice: UiNotice) => ReactNode;
}
