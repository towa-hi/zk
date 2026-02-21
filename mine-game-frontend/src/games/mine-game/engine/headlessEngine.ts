import {
  BASE_DAMAGE,
  BASE_FUEL,
  BASE_HULL,
  CARGO_BY_TIER,
  EXTRACTOR_MULTIPLIER_BY_TIER,
  FUEL_BY_TIER,
  HAZARD_TYPES,
  JETTISON_KEEP_PERCENT,
  MAX_MOVES,
  RESOURCE_BASE_BY_INTENSITY,
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
import { generatePlanet } from './planet';

export interface CreateEngineStateInput {
  sessionId: number;
  playerAddress: string;
  planetSeed: string;
}

export function createInitialEngineState(input: CreateEngineStateInput): EngineState {
  const planet = generatePlanet(input.planetSeed);
  return {
    sessionId: input.sessionId,
    playerAddress: input.playerAddress,
    phase: 'build',
    outcome: 'in_progress',
    planetSeed: planet.seed,
    planet,
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
      return handleMove(state, action.direction, action.extract);
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

function handleMove(state: EngineState, direction: 'left' | 'right' | 'up', extract: boolean): EngineTransitionResult {
  if (state.phase !== 'explore') {
    return fail(state, 'invalid_phase', 'Move can only be applied during explore phase');
  }

  if (state.moveCount >= MAX_MOVES) {
    return fail(state, 'terminal_state', `Move limit reached (${MAX_MOVES})`);
  }

  if (state.fuel <= 0 || state.hull <= 0 || state.outcome !== 'in_progress') {
    return fail(state, 'terminal_state', 'Run is no longer active');
  }

  const toNodeId = resolveMoveTarget(state.currentNodeId, direction, state.planet.nodes.length);
  if (!toNodeId) {
    return fail(state, 'invalid_input', `Cannot move ${direction} from node ${state.currentNodeId}`);
  }

  const targetNode = state.planet.nodes[toNodeId - 1];
  if (!targetNode) {
    return fail(state, 'invalid_input', `Target node ${toNodeId} does not exist`);
  }

  const stats = state.stats;
  if (!stats) {
    return fail(state, 'invalid_phase', 'Probe stats are unavailable before build confirmation');
  }

  const isFirstVisit = !state.visitedNodeIds.includes(toNodeId);
  const startNodeId = state.visitedNodeIds[0] ?? 1;
  const isStartNode = toNodeId === startNodeId;
  const fuelAfter = Math.max(0, state.fuel - 1);

  // Damage applies on every entered node except the node the run started on.
  const damageTaken = isStartNode ? 0 : computeNodeDamage(targetNode.hazards, targetNode.intensity, stats.resistances);
  const hullAfter = Math.max(0, state.hull - damageTaken);
  const resourcesCandidate =
    isFirstVisit && extract ? computeNodeResources(targetNode.hazards, targetNode.intensity, stats.extractors) : 0;
  const cargoRoom = Math.max(0, stats.maxCargo - state.cargo);
  const resourcesGained = Math.min(resourcesCandidate, cargoRoom);
  const cargoAfter = state.cargo + resourcesGained;
  const resourcesAfter = state.resources + resourcesGained;

  const move = {
    direction,
    extract,
  } as const;

  const moveResult = {
    moveIndex: state.moveCount + 1,
    fromNodeId: state.currentNodeId,
    toNodeId,
    extracted: extract,
    damageTaken,
    resourcesGained,
    hullAfter,
    fuelAfter,
    cargoAfter,
  };

  let nextState: EngineState = {
    ...state,
    currentNodeId: toNodeId,
    visitedNodeIds: isFirstVisit ? [...state.visitedNodeIds, toNodeId] : state.visitedNodeIds,
    hull: hullAfter,
    fuel: fuelAfter,
    cargo: cargoAfter,
    resources: resourcesAfter,
    moveCount: state.moveCount + 1,
    moves: [...state.moves, move],
    moveResults: [...state.moveResults, moveResult],
  };

  if (hullAfter <= 0 || fuelAfter <= 0) {
    const keptResources = Math.floor((nextState.resources * JETTISON_KEEP_PERCENT) / 100);
    nextState = {
      ...nextState,
      outcome: 'jettisoned',
      phase: 'done',
      resources: keptResources,
      cargo: keptResources,
    };
  }

  return ok(nextState);
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

function resolveMoveTarget(currentNodeId: number, direction: 'left' | 'right' | 'up', nodeCount: number): number | null {
  if (direction === 'up') {
    return currentNodeId > 1 ? Math.floor(currentNodeId / 2) : null;
  }
  if (direction === 'left') {
    const left = currentNodeId * 2;
    return left <= nodeCount ? left : null;
  }
  const right = currentNodeId * 2 + 1;
  return right <= nodeCount ? right : null;
}

function computeNodeDamage(
  hazards: readonly [HazardType, HazardType],
  intensity: 1 | 2 | 3,
  resistances: Record<HazardType, number>
): number {
  const intensityDelta = intensity - 1;
  const first = Math.max(0, BASE_DAMAGE + intensityDelta - resistances[hazards[0]]);
  const second = Math.max(0, BASE_DAMAGE + intensityDelta - resistances[hazards[1]]);
  return first + second;
}

function computeNodeResources(
  hazards: readonly [HazardType, HazardType],
  intensity: 1 | 2 | 3,
  extractors: Record<HazardType, number>
): number {
  const base = RESOURCE_BASE_BY_INTENSITY[intensity];
  const first = base * extractors[hazards[0]];
  const second = base * extractors[hazards[1]];
  const total = first + second;
  return hazards[0] === hazards[1] ? total * 2 : total;
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
