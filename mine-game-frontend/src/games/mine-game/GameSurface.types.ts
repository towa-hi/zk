import type { ReactNode } from 'react';

export type UiNoticeTone = 'error' | 'success' | 'info';
export type PartTier = 'standard' | 'enhanced' | 'advanced';
export type ResistancePartTier = 'standard' | 'enhanced';
export type LoadoutCategory =
  | 'fuel_tank'
  | 'thermal_shielding'
  | 'cryo_insulation'
  | 'bio_filter'
  | 'rad_hardening'
  | 'thermal_extractor'
  | 'cryo_extractor'
  | 'bio_extractor'
  | 'rad_extractor'
  | 'cargo_hold';

export interface UiNotice {
  tone: UiNoticeTone;
  message: string;
}

export type GamePhase = 'build' | 'explore' | 'prove' | 'done';

export interface MineGameViewState {
  sessionId: number;
  phase: GamePhase;
  loading: boolean;
  build?: {
    loadout: Record<LoadoutCategory, PartTier | ResistancePartTier>;
    totalWeight: number;
    maxWeight: number;
    weightRemaining: number;
  };
}

export interface MineGameActions {
  goToNextPhase: () => void;
  resetScreens: () => void;
  setPartTier: (category: LoadoutCategory, tier: PartTier | ResistancePartTier) => void;
}

export interface MineGameSurfaceProps {
  userAddress: string;
  state: MineGameViewState;
  actions: MineGameActions;
  notice?: UiNotice | null;
  debugText?: string;
  renderNotice?: (notice: UiNotice) => ReactNode;
}
