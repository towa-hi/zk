import {
  BIOME_HAZARDS,
  BIOME_TYPES,
  DEFAULT_PLANET_HASH,
  NODE_COUNT,
  type BiomeType,
  type Planet,
  type PlanetNode,
} from './domain';

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

  for (let nodeId = 1; nodeId <= NODE_COUNT; nodeId += 1) {
    const depth = getNodeDepth(nodeId);
    const intensity = getIntensityForDepth(depth);
    const biomeType = biomeForNode(seed, nodeId);

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

function biomeForNode(seed: string, nodeId: number): BiomeType {
  const token = `${seed}:${nodeId}`;
  const value = hash32(token);
  const idx = value % BIOME_TYPES.length;
  return BIOME_TYPES[idx];
}

function hash32(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
