import { keccak_256 } from '@noble/hashes/sha3.js';
import {
  BIOME_HAZARDS,
  BIOME_TYPES,
  DEFAULT_PLANET_HASH,
  NODE_COUNT,
  type BiomeType,
  type Planet,
  type PlanetNode,
} from './domain';

const TEXT_ENCODER = new TextEncoder();

export function normalizePlanetSeed(seed: string): string {
  return seed.trim() === '' ? DEFAULT_PLANET_HASH : seed.trim();
}

export function getNodeDepth(nodeId: number): number {
  return Math.floor(Math.log2(nodeId));
}

export function getIntensityForDepth(depth: number): 1 | 2 | 3 {
  if (depth <= 3) return 1;
  if (depth <= 5) return 2;
  return 3;
}

export function generatePlanet(seedInput: string): Planet {
  const seed = normalizePlanetSeed(seedInput);
  const nodes: PlanetNode[] = [];
  let chainHash = keccak_256(TEXT_ENCODER.encode(seed));

  for (let nodeId = 1; nodeId <= NODE_COUNT; nodeId += 1) {
    chainHash = nextChainHash(chainHash, nodeId);
    const depth = getNodeDepth(nodeId);
    const intensity = getIntensityForDepth(depth);
    const leftSiblingBiomeType = getLeftSiblingBiomeType(nodeId, nodes);
    const biomeType = biomeFromHash(chainHash, leftSiblingBiomeType);

    nodes.push({
      id: nodeId,
      depth,
      intensity,
      biomeType,
      hazards: BIOME_HAZARDS[biomeType],
    });
  }

  return { seed, nodes };
}

function biomeFromHash(hashBytes: Uint8Array, siblingBiomeType?: BiomeType): BiomeType {
  const value = uint32FromBytes(hashBytes);
  const idx = value % BIOME_TYPES.length;
  const candidate = BIOME_TYPES[idx];
  if (!siblingBiomeType || candidate !== siblingBiomeType) {
    return candidate;
  }

  // For right siblings, rotate to a different biome using hash entropy.
  const offset = ((hashBytes[4] ?? hashBytes[0] ?? 0) % (BIOME_TYPES.length - 1)) + 1;
  const alternateIdx = (idx + offset) % BIOME_TYPES.length;
  return BIOME_TYPES[alternateIdx];
}

function nextChainHash(currentHash: Uint8Array, nodeId: number): Uint8Array {
  const input = new Uint8Array(currentHash.length + 4);
  input.set(currentHash, 0);
  writeU32Be(input, currentHash.length, nodeId);
  return keccak_256(input);
}

function getLeftSiblingBiomeType(nodeId: number, nodes: PlanetNode[]): BiomeType | undefined {
  if (nodeId <= 1 || nodeId % 2 === 0) return undefined;
  const leftSibling = nodes[nodeId - 2];
  if (!leftSibling || leftSibling.id !== nodeId - 1) return undefined;
  return leftSibling.biomeType;
}

function uint32FromBytes(bytes: Uint8Array): number {
  return (
    ((bytes[0] ?? 0) << 24) |
    ((bytes[1] ?? 0) << 16) |
    ((bytes[2] ?? 0) << 8) |
    (bytes[3] ?? 0)
  ) >>> 0;
}

function writeU32Be(target: Uint8Array, offset: number, value: number): void {
  target[offset] = (value >>> 24) & 0xff;
  target[offset + 1] = (value >>> 16) & 0xff;
  target[offset + 2] = (value >>> 8) & 0xff;
  target[offset + 3] = value & 0xff;
}
