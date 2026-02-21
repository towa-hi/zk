import {
  BASE_FUEL,
  BASE_HULL,
  CARGO_BY_TIER,
  EXTRACTOR_MULTIPLIER_BY_TIER,
  FUEL_BY_TIER,
  HAZARD_TYPES,
  MAX_MOVES,
  type EngineAction,
  type EngineError,
  type EngineSnapshot,
  type EngineState,
  type EngineTransitionResult,
  type HazardType,
  type Loadout,
  type ProbeStats,
  createDefaultLoadout,
  getBuildPreview,
} from './domain';

export interface CreateEngineStateInput {
  sessionId: number;
  playerAddress: string;
  planetSeed: string;
}

export function createInitialEngineState(input: CreateEngineStateInput): EngineState {
  return {
    sessionId: input.sessionId,
    playerAddress: input.playerAddress,
    phase: 'build',
    outcome: 'in_progress',
    planetSeed: input.planetSeed,
    commitment: null,
    salt: null,
    loadout: createDefaultLoadout(),
    stats: null,
    currentNodeId: 1,
    visitedNodeIds: [1],
    hull: BASE_HULL,
    fuel: BASE_FUEL,
    cargo: 0,
    resources: 0,
    moveCount: 0,
    moves: [],
    moveResults: [],
  };
}

export function createEngineSnapshot(state: EngineState): EngineSnapshot {
  return {
    sessionId: state.sessionId,
    phase: state.phase,
    outcome: state.outcome,
    playerAddress: state.playerAddress,
    planetSeed: state.planetSeed,
    currentNodeId: state.currentNodeId,
    hull: state.hull,
    fuel: state.fuel,
    cargo: state.cargo,
    resources: state.resources,
    moveCount: state.moveCount,
    moveLimit: MAX_MOVES,
    buildPreview: getBuildPreview(state.loadout),
  };
}

export function applyEngineAction(state: EngineState, action: EngineAction): EngineTransitionResult {
  if (state.phase === 'done') {
    return fail(state, 'terminal_state', 'Run is already finished');
  }

  switch (action.type) {
    case 'set_part_tier':
      return handleSetPartTier(state, action.category, action.tier);
    case 'confirm_build':
      return handleConfirmBuild(state, action.salt);
    case 'move':
      return fail(state, 'not_implemented', 'Move resolution is scheduled for Milestone 3');
    case 'evacuate':
      return fail(state, 'not_implemented', 'Evacuation resolution is scheduled for Milestone 3');
    case 'request_proof_payload':
      return fail(state, 'not_implemented', 'Proof payload shaping is scheduled for Milestone 5');
    default:
      return fail(state, 'invalid_action', 'Unsupported action');
  }
}

function handleSetPartTier(
  state: EngineState,
  category: keyof Loadout,
  tier: Loadout[keyof Loadout]
): EngineTransitionResult {
  if (state.phase !== 'build') {
    return fail(state, 'invalid_phase', 'Parts can only be changed during build phase');
  }

  if (!isTierAllowedForCategory(category, tier)) {
    return fail(state, 'invalid_input', `Tier "${tier}" is not valid for category "${category}"`);
  }

  const nextLoadout: Loadout = {
    ...state.loadout,
    [category]: tier,
  };

  const preview = getBuildPreview(nextLoadout);
  if (!preview.isValid) {
    return fail(state, 'invalid_loadout', `Loadout exceeds max weight ${preview.maxWeight}`);
  }

  return ok({
    ...state,
    loadout: nextLoadout,
  });
}

function isTierAllowedForCategory(category: keyof Loadout, tier: Loadout[keyof Loadout]): boolean {
  if (
    category === 'thermal_shielding' ||
    category === 'cryo_insulation' ||
    category === 'bio_filter' ||
    category === 'rad_hardening'
  ) {
    return tier === 'standard' || tier === 'enhanced';
  }

  return tier === 'standard' || tier === 'enhanced' || tier === 'advanced';
}

function handleConfirmBuild(state: EngineState, salt: string): EngineTransitionResult {
  if (state.phase !== 'build') {
    return fail(state, 'invalid_phase', 'Build can only be confirmed during build phase');
  }

  if (!salt.trim()) {
    return fail(state, 'invalid_input', 'Salt must be a non-empty string');
  }

  const preview = getBuildPreview(state.loadout);
  if (!preview.isValid) {
    return fail(state, 'invalid_loadout', `Loadout exceeds max weight ${preview.maxWeight}`);
  }

  const stats = deriveProbeStats(state.loadout);
  const commitment = computeStubCommitment(state.loadout, salt);

  return ok({
    ...state,
    phase: 'explore',
    stats,
    commitment,
    salt,
    fuel: stats.maxFuel,
    hull: BASE_HULL,
    cargo: 0,
    resources: 0,
    moveCount: 0,
    moves: [],
    moveResults: [],
    currentNodeId: 1,
    visitedNodeIds: [1],
  });
}

function deriveProbeStats(loadout: Loadout): ProbeStats {
  const resistances: Record<HazardType, number> = {
    heat: loadout.thermal_shielding === 'enhanced' ? 1 : 0,
    cold: loadout.cryo_insulation === 'enhanced' ? 1 : 0,
    bio: loadout.bio_filter === 'enhanced' ? 1 : 0,
    rad: loadout.rad_hardening === 'enhanced' ? 1 : 0,
  };

  const extractors: Record<HazardType, number> = {
    heat: EXTRACTOR_MULTIPLIER_BY_TIER[loadout.thermal_extractor],
    cold: EXTRACTOR_MULTIPLIER_BY_TIER[loadout.cryo_extractor],
    bio: EXTRACTOR_MULTIPLIER_BY_TIER[loadout.bio_extractor],
    rad: EXTRACTOR_MULTIPLIER_BY_TIER[loadout.rad_extractor],
  };

  return {
    maxFuel: FUEL_BY_TIER[loadout.fuel_tank],
    maxCargo: CARGO_BY_TIER[loadout.cargo_hold],
    resistances,
    extractors,
  };
}

function computeStubCommitment(loadout: Loadout, salt: string): string {
  const payload = JSON.stringify({
    loadout,
    salt,
  });
  let hash = 0;
  for (let i = 0; i < payload.length; i += 1) {
    hash = (hash << 5) - hash + payload.charCodeAt(i);
    hash |= 0;
  }
  return `stub_${Math.abs(hash).toString(16)}`;
}

function ok(state: EngineState): EngineTransitionResult {
  return { ok: true, state };
}

function fail(state: EngineState, code: EngineError['code'], message: string): EngineTransitionResult {
  return {
    ok: false,
    state,
    error: { code, message },
  };
}

export function listPartCategories(): (keyof Loadout)[] {
  return [
    'fuel_tank',
    'thermal_shielding',
    'cryo_insulation',
    'bio_filter',
    'rad_hardening',
    'thermal_extractor',
    'cryo_extractor',
    'bio_extractor',
    'rad_extractor',
    'cargo_hold',
  ];
}

export function listHazardTypes(): HazardType[] {
  return [...HAZARD_TYPES];
}
