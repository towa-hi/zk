import {
  applyEngineAction,
  createEngineSnapshot,
  createInitialEngineState,
  type EngineAction,
  type EngineState,
  type EngineTransitionResult,
  type ProofPayload,
} from './engine';
import type { MineGameViewState, UiNotice } from './GameSurface.types';

export interface CreateMineGameEngineAdapterInput {
  sessionId: number;
  userAddress: string;
  planetSeed: string;
}

export interface MineGameEngineAdapter {
  getEngineState: () => EngineState;
  getViewState: () => MineGameViewState;
  getProofPayload: () => ProofPayload | null;
  applyAction: (action: EngineAction) => { result: EngineTransitionResult; notice: UiNotice | null };
}

function actionLabel(action: EngineAction): string {
  if (action.type === 'set_part_tier') return `set_part_tier(${action.category}, ${action.tier})`;
  if (action.type === 'confirm_build') return 'confirm_build';
  if (action.type === 'move') return `move(${action.direction}, extract=${action.extract ? '1' : '0'})`;
  if (action.type === 'evacuate') return 'evacuate';
  return 'request_proof_payload';
}

export function createMineGameEngineAdapter(
  input: CreateMineGameEngineAdapterInput
): MineGameEngineAdapter {
  let state = createInitialEngineState({
    sessionId: input.sessionId,
    playerAddress: input.userAddress,
    planetSeed: input.planetSeed,
  });
  let proofPayload: ProofPayload | null = null;

  return {
    getEngineState: () => state,
    getViewState: () => {
      const snapshot = createEngineSnapshot(state);
      const weightRemaining = Math.max(0, snapshot.buildPreview.maxWeight - snapshot.buildPreview.totalWeight);
      return {
        sessionId: snapshot.sessionId,
        phase: snapshot.phase,
        loading: false,
        planetNodes: state.planet.nodes.map((n) => ({
          id: n.id,
          depth: n.depth,
          intensity: n.intensity,
          biomeType: n.biomeType,
          hazards: [...n.hazards] as [string, string],
        })),
        explore: {
          currentNodeId: state.currentNodeId,
          visitedNodeIds: [...state.visitedNodeIds],
          hull: state.hull,
          fuel: state.fuel,
          cargo: state.cargo,
          resources: state.resources,
          maxCargo: state.stats?.maxCargo ?? 100,
          resistances: state.stats
            ? { ...state.stats.resistances }
            : { heat: 0, cold: 0, bio: 0, rad: 0 },
          extractors: state.stats
            ? { ...state.stats.extractors }
            : { heat: 10, cold: 10, bio: 10, rad: 10 },
        },
        build: {
          loadout: state.loadout,
          totalWeight: snapshot.buildPreview.totalWeight,
          maxWeight: snapshot.buildPreview.maxWeight,
          weightRemaining,
        },
      };
    },
    getProofPayload: () => proofPayload,
    applyAction: (action) => {
      const result = applyEngineAction(state, action);
      state = result.state;
      if (result.proofPayload) {
        proofPayload = result.proofPayload;
      }
      if (!result.ok) {
        return {
          result,
          notice: {
            tone: 'error',
            message: `${actionLabel(action)} failed: ${result.error?.message ?? 'Unknown error'}`,
          },
        };
      }
      return {
        result,
        notice: {
          tone: 'success',
          message: `${actionLabel(action)} applied`,
        },
      };
    },
  };
}
