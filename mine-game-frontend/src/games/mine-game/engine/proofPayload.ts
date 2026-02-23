import {
  BIOME_TYPES,
  MAX_MOVES,
  type BiomeType,
  type EngineState,
  type ProofPayload,
} from './domain';
import { encodeLoadout, TEXT_ENCODER, toHex } from './sharedEncoding';
import { keccak_256 } from '@noble/hashes/sha3.js';

function encodeDirection(direction: 'left' | 'right' | 'up'): number {
  if (direction === 'left') return 1;
  if (direction === 'right') return 2;
  return 3;
}

function biomeCode(biomeType: BiomeType): number {
  return BIOME_TYPES.indexOf(biomeType);
}

function getSeed(seed: string): string {
  return `keccak_${toHex(keccak_256(TEXT_ENCODER.encode(seed)))}`;
}

export function buildProofPayload(state: EngineState): ProofPayload {
  if (!state.salt || !state.commitment) {
    throw new Error('Cannot build proof payload without salt and commitment');
  }

  const encodedLoadout = encodeLoadout(state.loadout);

  const encodedMoves: [number, number][] = Array.from({ length: MAX_MOVES }, (_, idx) => {
    const move = state.moves[idx];
    if (!move) return [0, 0];
    return [encodeDirection(move.direction), move.extract ? 1 : 0];
  });

  const moveSequence: number[] = Array.from({ length: MAX_MOVES }, (_, idx) => {
    const result = state.moveResults[idx];
    return result ? result.toNodeId : 0;
  });

  const resourcesPerNode: number[] = Array.from({ length: MAX_MOVES }, (_, idx) => {
    const result = state.moveResults[idx];
    return result ? result.resourcesGained : 0;
  });

  const evacIntensity =
    state.outcome === 'evacuated' ? (state.planet.nodes[state.currentNodeId - 1]?.intensity ?? 0) : 0;

  return {
    privateInputs: {
      loadout: encodedLoadout,
      salt: state.salt,
    },
    publicInputs: {
      sessionId: state.sessionId,
      statementVersion: 2,
      seed: getSeed(state.planetSeed),
      commitment: state.commitment,
      numMoves: state.moveCount,
      moves: encodedMoves,
      evacuated: state.outcome === 'evacuated',
      biomes: state.planet.nodes.map((node) => biomeCode(node.biomeType)),
    },
    publicOutputs: {
      moveSequence,
      resourcesPerNode,
      totalResources: state.resources,
      finalHull: state.hull,
      finalFuel: state.fuel,
      outcome: state.outcome === 'jettisoned' ? 1 : 0,
      evacIntensity,
    },
  };
}
