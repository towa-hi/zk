import { Noir } from '@noir-lang/noir_js';
import { UltraHonkBackend } from '@aztec/bb.js';
import type { CompiledCircuit } from '@noir-lang/types';
import { TEXT_ENCODER, encodeLoadout } from '../engine/sharedEncoding';
import type { ProofPayload } from '../engine/domain';
import { keccak_256 } from '@noble/hashes/sha3.js';

const CIRCUIT_PATH = '/circuits/mine_game_v0.json';
const MAX_SALT_LEN = 64;
const MAX_MOVES = 10;

export interface NoirProofResult {
  proofBlob: Uint8Array;
  vkBytes: Uint8Array;
}

let cachedCircuit: CompiledCircuit | null = null;

async function loadCircuit(): Promise<CompiledCircuit> {
  if (cachedCircuit) return cachedCircuit;
  const res = await fetch(CIRCUIT_PATH);
  if (!res.ok) throw new Error(`Failed to load circuit: ${res.status}`);
  cachedCircuit = (await res.json()) as CompiledCircuit;
  return cachedCircuit;
}

function padSalt(salt: string): { saltArray: number[]; saltLen: number } {
  const encoded = TEXT_ENCODER.encode(salt);
  if (encoded.length > MAX_SALT_LEN) {
    throw new Error(`Salt too long: ${encoded.length} bytes (max ${MAX_SALT_LEN})`);
  }
  const padded = new Uint8Array(MAX_SALT_LEN);
  padded.set(encoded);
  return {
    saltArray: Array.from(padded),
    saltLen: encoded.length,
  };
}

function flattenPublicInputs(publicInputs: string[]): Uint8Array {
  const fieldSize = 32;
  const result = new Uint8Array(publicInputs.length * fieldSize);
  for (let i = 0; i < publicInputs.length; i++) {
    const hex = publicInputs[i].startsWith('0x')
      ? publicInputs[i].slice(2)
      : publicInputs[i];
    const bytes = hexToBytes(hex);
    const padded = new Uint8Array(fieldSize);
    padded.set(bytes, fieldSize - bytes.length);
    result.set(padded, i * fieldSize);
  }
  return result;
}

function hexToBytes(hex: string): Uint8Array {
  const len = hex.length / 2;
  const result = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    result[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return result;
}

function buildProofBlob(publicInputsBytes: Uint8Array, proofBytes: Uint8Array): Uint8Array {
  const fieldSize = 32;
  const numPublicInputFields = publicInputsBytes.length / fieldSize;
  const numProofFields = proofBytes.length / fieldSize;
  const totalFields = numPublicInputFields + numProofFields;

  const header = new Uint8Array(4);
  new DataView(header.buffer).setUint32(0, totalFields, false);

  const blob = new Uint8Array(4 + publicInputsBytes.length + proofBytes.length);
  blob.set(header, 0);
  blob.set(publicInputsBytes, 4);
  blob.set(proofBytes, 4 + publicInputsBytes.length);
  return blob;
}

function encodeDirection(dir: 'left' | 'right' | 'up'): number {
  if (dir === 'left') return 1;
  if (dir === 'right') return 2;
  return 3;
}

// Hazard type index: heat=0, cold=1, bio=2, rad=3
const HAZARD_INDEX: Record<string, number> = { heat: 0, cold: 1, bio: 2, rad: 3 };

export async function generateProof(payload: ProofPayload): Promise<NoirProofResult> {
  const circuit = await loadCircuit();
  const noir = new Noir(circuit);

  const loadoutEncoded = encodeLoadout(payload.privateInputs.loadout as any);
  const { saltArray, saltLen } = padSalt(payload.privateInputs.salt);

  // Compute commitment hash
  const saltBytes = TEXT_ENCODER.encode(payload.privateInputs.salt);
  const commitmentPreimage = new Uint8Array(loadoutEncoded.length + 1 + saltBytes.length);
  commitmentPreimage.set(loadoutEncoded, 0);
  commitmentPreimage[loadoutEncoded.length] = 0xff;
  commitmentPreimage.set(saltBytes, loadoutEncoded.length + 1);
  const commitmentHash = keccak_256(commitmentPreimage);

  // Build per-move arrays from the payload
  const directions = new Array(MAX_MOVES).fill('0');
  const extracts = new Array(MAX_MOVES).fill('0');
  const h1 = new Array(MAX_MOVES).fill('0');
  const h2 = new Array(MAX_MOVES).fill('0');
  const intensities = new Array(MAX_MOVES).fill('0');

  const numMoves = payload.publicInputs.numMoves;
  for (let i = 0; i < numMoves && i < MAX_MOVES; i++) {
    const [dir, ext] = payload.publicInputs.moves[i];
    directions[i] = String(dir);
    extracts[i] = String(ext);

    // The biome index for each move's target node
    const targetNodeId = payload.publicOutputs.moveSequence[i];
    if (targetNodeId > 0) {
      const biomeIdx = payload.publicInputs.biomes[targetNodeId - 1];
      const biomeHazards = BIOME_HAZARD_TABLE[biomeIdx];
      if (biomeHazards) {
        h1[i] = String(biomeHazards[0]);
        h2[i] = String(biomeHazards[1]);
      }
      const depth = Math.floor(Math.log2(targetNodeId));
      const intensity = depth <= 3 ? 1 : depth <= 5 ? 2 : 3;
      intensities[i] = String(intensity);
    }
  }

  const evacuated = payload.publicOutputs.outcome === 0 ? '1' : '0';
  const evacIntensity = String(payload.publicOutputs.evacIntensity);

  const circuitInputs: Record<string, string | string[]> = {
    loadout: Array.from(loadoutEncoded).map(String),
    salt: saltArray.map(String),
    salt_len: String(saltLen),
    num_moves: String(numMoves),
    move_directions: directions,
    move_extracts: extracts,
    move_target_hazard1: h1,
    move_target_hazard2: h2,
    move_target_intensity: intensities,
    evacuated,
    evac_node_intensity: evacIntensity,
    commitment: Array.from(commitmentHash).map(String),
    pub_outcome: String(payload.publicOutputs.outcome),
    pub_total_resources: String(payload.publicOutputs.totalResources),
    pub_final_hull: String(payload.publicOutputs.finalHull),
    pub_final_fuel: String(payload.publicOutputs.finalFuel),
    pub_evac_intensity: String(payload.publicOutputs.evacIntensity),
    pub_move_sequence: payload.publicOutputs.moveSequence.map(String),
    pub_resources_per_node: payload.publicOutputs.resourcesPerNode.map(String),
  };

  const { witness } = await noir.execute(circuitInputs);

  const backend = new UltraHonkBackend(circuit.bytecode);

  try {
    const { proof, publicInputs } = await backend.generateProof(witness, { keccak: true });
    const vkBytes = await backend.getVerificationKey({ keccak: true });
    const publicInputsBytes = flattenPublicInputs(publicInputs);
    const proofBlob = buildProofBlob(publicInputsBytes, proof);

    return { proofBlob, vkBytes };
  } finally {
    await backend.destroy();
  }
}

// Biome hazard lookup table matching BIOME_TYPES order in domain.ts
// Each entry: [hazard1_idx, hazard2_idx]
const BIOME_HAZARD_TABLE: [number, number][] = [
  [0, 0], // magma_fields: heat, heat
  [1, 1], // deep_freeze: cold, cold
  [2, 2], // hive_sprawl: bio, bio
  [3, 3], // alien_ruins: rad, rad
  [0, 1], // thermal_vents: heat, cold
  [0, 2], // ember_jungle: heat, bio
  [0, 3], // slag_wastes: heat, rad
  [1, 2], // cryo_marsh: cold, bio
  [1, 3], // fallout_tundra: cold, rad
  [2, 3], // mutant_thicket: bio, rad
];
