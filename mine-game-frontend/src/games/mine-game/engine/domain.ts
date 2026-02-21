export const MAX_DEPTH = 6;
export const MAX_MOVES = 10;
export const MAX_WEIGHT = 20;
export const NODE_COUNT = 127;
export const BASE_HULL = 10;
export const BASE_FUEL = 6;
export const BASE_DAMAGE = 1;
export const DEFAULT_PLANET_HASH = 'planet-alpha-default-seed';

export type HazardType = 'heat' | 'cold' | 'bio' | 'rad';

export type BiomeType =
  | 'magma_fields'
  | 'deep_freeze'
  | 'hive_sprawl'
  | 'alien_ruins'
  | 'thermal_vents'
  | 'ember_jungle'
  | 'slag_wastes'
  | 'cryo_marsh'
  | 'fallout_tundra'
  | 'mutant_thicket';

export type PartTier = 'standard' | 'enhanced' | 'advanced';

export type ResistancePartTier = 'standard' | 'enhanced';

export type PartCategory =
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

export type GamePhase = 'build' | 'explore' | 'prove' | 'done';

export type RunOutcome = 'in_progress' | 'evacuated' | 'jettisoned';

export type MoveDirection = 'left' | 'right' | 'up';

export interface PlanetNode {
  id: number;
  depth: number;
  intensity: 1 | 2 | 3;
  biomeType: BiomeType;
  hazards: readonly [HazardType, HazardType];
}

export interface Planet {
  seed: string;
  nodes: readonly PlanetNode[];
}

export interface Loadout {
  fuel_tank: PartTier;
  thermal_shielding: ResistancePartTier;
  cryo_insulation: ResistancePartTier;
  bio_filter: ResistancePartTier;
  rad_hardening: ResistancePartTier;
  thermal_extractor: PartTier;
  cryo_extractor: PartTier;
  bio_extractor: PartTier;
  rad_extractor: PartTier;
  cargo_hold: PartTier;
}

export interface ProbeStats {
  maxFuel: number;
  maxCargo: number;
  resistances: Record<HazardType, number>;
  extractors: Record<HazardType, number>;
}

export interface MoveCommand {
  direction: MoveDirection;
  extract: boolean;
}

export interface MoveResult {
  moveIndex: number;
  fromNodeId: number;
  toNodeId: number;
  extracted: boolean;
  damageTaken: number;
  resourcesGained: number;
  hullAfter: number;
  fuelAfter: number;
  cargoAfter: number;
}

export interface EngineState {
  sessionId: number;
  playerAddress: string;
  phase: GamePhase;
  outcome: RunOutcome;
  planetSeed: string;
  planet: Planet;
  commitment: string | null;
  salt: string | null;
  loadout: Loadout;
  stats: ProbeStats | null;
  currentNodeId: number;
  visitedNodeIds: number[];
  hull: number;
  fuel: number;
  cargo: number;
  resources: number;
  moveCount: number;
  moves: MoveCommand[];
  moveResults: MoveResult[];
}

export type EngineAction =
  | { type: 'set_part_tier'; category: PartCategory; tier: PartTier | ResistancePartTier }
  | { type: 'confirm_build'; salt: string }
  | { type: 'move'; direction: MoveDirection; extract: boolean }
  | { type: 'evacuate' }
  | { type: 'request_proof_payload' };

export interface EngineError {
  code:
    | 'invalid_phase'
    | 'invalid_action'
    | 'invalid_loadout'
    | 'invalid_input'
    | 'not_implemented'
    | 'terminal_state';
  message: string;
}

export interface BuildPreview {
  totalWeight: number;
  maxWeight: number;
  isValid: boolean;
}

export interface ProofPayload {
  sessionId: number;
  planetSeed: string;
  commitment: string;
  moveCount: number;
  moves: MoveCommand[];
  resourcesPerMove: number[];
  totalResources: number;
  finalHull: number;
  finalFuel: number;
  finalCargo: number;
  outcome: RunOutcome;
  evacuationIntensity: 1 | 2 | 3 | null;
}

export interface EngineTransitionResult {
  ok: boolean;
  state: EngineState;
  error?: EngineError;
  proofPayload?: ProofPayload;
}

export interface EngineSnapshot {
  sessionId: number;
  phase: GamePhase;
  outcome: RunOutcome;
  playerAddress: string;
  planetSeed: string;
  currentNodeId: number;
  hull: number;
  fuel: number;
  cargo: number;
  resources: number;
  moveCount: number;
  moveLimit: number;
  buildPreview: BuildPreview;
}

export const HAZARD_TYPES: readonly HazardType[] = ['heat', 'cold', 'bio', 'rad'] as const;

export const BIOME_HAZARDS: Record<BiomeType, readonly [HazardType, HazardType]> = {
  magma_fields: ['heat', 'heat'],
  deep_freeze: ['cold', 'cold'],
  hive_sprawl: ['bio', 'bio'],
  alien_ruins: ['rad', 'rad'],
  thermal_vents: ['heat', 'cold'],
  ember_jungle: ['heat', 'bio'],
  slag_wastes: ['heat', 'rad'],
  cryo_marsh: ['cold', 'bio'],
  fallout_tundra: ['cold', 'rad'],
  mutant_thicket: ['bio', 'rad'],
};

export const BIOME_TYPES: readonly BiomeType[] = [
  'magma_fields',
  'deep_freeze',
  'hive_sprawl',
  'alien_ruins',
  'thermal_vents',
  'ember_jungle',
  'slag_wastes',
  'cryo_marsh',
  'fallout_tundra',
  'mutant_thicket',
] as const;

export const PART_WEIGHT_BY_TIER: Record<PartTier, number> = {
  standard: 0,
  enhanced: 2,
  advanced: 5,
};

export const RESISTANCE_WEIGHT_BY_TIER: Record<ResistancePartTier, number> = {
  standard: 0,
  enhanced: 2,
};

export const FUEL_BY_TIER: Record<PartTier, number> = {
  standard: 6,
  enhanced: 8,
  advanced: 10,
};

export const CARGO_BY_TIER: Record<PartTier, number> = {
  standard: 100,
  enhanced: 175,
  advanced: 225,
};

export const EXTRACTOR_MULTIPLIER_BY_TIER: Record<PartTier, number> = {
  standard: 10,
  enhanced: 12,
  advanced: 15,
};

export const RESOURCE_BASE_BY_INTENSITY: Record<1 | 2 | 3, number> = {
  1: 1,
  2: 3,
  3: 5,
};

export const EVACUATION_PERCENT_BY_INTENSITY: Record<1 | 2 | 3, number> = {
  1: 25,
  2: 50,
  3: 100,
};

export const JETTISON_KEEP_PERCENT = 5;

export function createDefaultLoadout(): Loadout {
  return {
    fuel_tank: 'standard',
    thermal_shielding: 'standard',
    cryo_insulation: 'standard',
    bio_filter: 'standard',
    rad_hardening: 'standard',
    thermal_extractor: 'standard',
    cryo_extractor: 'standard',
    bio_extractor: 'standard',
    rad_extractor: 'standard',
    cargo_hold: 'standard',
  };
}

export function getLoadoutWeight(loadout: Loadout): number {
  return (
    PART_WEIGHT_BY_TIER[loadout.fuel_tank] +
    RESISTANCE_WEIGHT_BY_TIER[loadout.thermal_shielding] +
    RESISTANCE_WEIGHT_BY_TIER[loadout.cryo_insulation] +
    RESISTANCE_WEIGHT_BY_TIER[loadout.bio_filter] +
    RESISTANCE_WEIGHT_BY_TIER[loadout.rad_hardening] +
    PART_WEIGHT_BY_TIER[loadout.thermal_extractor] +
    PART_WEIGHT_BY_TIER[loadout.cryo_extractor] +
    PART_WEIGHT_BY_TIER[loadout.bio_extractor] +
    PART_WEIGHT_BY_TIER[loadout.rad_extractor] +
    PART_WEIGHT_BY_TIER[loadout.cargo_hold]
  );
}

export function getBuildPreview(loadout: Loadout): BuildPreview {
  const totalWeight = getLoadoutWeight(loadout);
  return {
    totalWeight,
    maxWeight: MAX_WEIGHT,
    isValid: totalWeight <= MAX_WEIGHT,
  };
}
